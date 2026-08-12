import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AntivirusService } from './services/antivirus.service';
import { ParsingService } from './services/parsing.service';
import { ImportBatch, ImportBatchStatus, ImportSourceType } from './entities/import-batch.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CategorizationService } from '../transactions/categorization.service';
import { ParsedRow } from './parsers/parsed-row.interface';
import { normalizeText } from '../common/utils/normalize-text';

const EXTENSION_TO_SOURCE: Record<string, ImportSourceType> = { csv: 'csv', pdf: 'pdf' };
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

function fingerprint(date: string, label: string, amount: number): string {
  return `${date}|${normalizeText(label)}|${amount}`;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly antivirus: AntivirusService,
    private readonly parsing: ParsingService,
    private readonly categorization: CategorizationService,
    private readonly dataSource: DataSource,
  ) {}

  async importFile(userId: string, accountId: string, file: UploadedFile): Promise<ImportBatch> {
    await this.accounts.assertOwnership(userId, accountId);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Fichier trop volumineux (10 Mo maximum)');
    }

    const sourceType = this.resolveSourceType(file.originalname);
    await this.antivirus.assertClean(file.buffer, file.originalname);

    const result = await this.parsing.parse(file.buffer, sourceType);

    const status: ImportBatchStatus =
      result.rows.length === 0 ? 'failed' : result.failedRows > 0 ? 'partial' : 'completed';

    return this.dataSource.transaction(async (manager) => {
      const { newRows, duplicateRows } =
        result.rows.length === 0
          ? { newRows: [], duplicateRows: 0 }
          : await this.excludeAlreadyImported(manager, accountId, result.rows);

      const batch = await manager.save(
        manager.create(ImportBatch, {
          userId,
          accountId,
          filename: file.originalname,
          sourceType,
          status,
          totalRows: result.totalRows,
          importedRows: newRows.length,
          failedRows: result.failedRows,
          duplicateRows,
        }),
      );

      if (newRows.length > 0) {
        const transactions = await Promise.all(
          newRows.map(async (row) =>
            manager.create(Transaction, {
              userId,
              accountId,
              date: row.date,
              label: row.label,
              amount: row.amount,
              externalRef: row.externalRef ?? null,
              importBatchId: batch.id,
              categoryId: await this.categorization.suggest(userId, row.label, row.amount),
            }),
          ),
        );
        await manager.save(transactions);
      }

      return batch;
    });
  }

  /**
   * Exclut les lignes déjà présentes en base pour ce compte — cas d'une
   * réimportation d'un fichier qui chevauche un import précédent. Priorité à
   * la référence bancaire (fiable, fournie par la banque) ; repli sur
   * date+libellé+montant si la ligne n'a pas de référence exploitable.
   */
  private async excludeAlreadyImported(
    manager: EntityManager,
    accountId: string,
    rows: ParsedRow[],
  ): Promise<{ newRows: ParsedRow[]; duplicateRows: number }> {
    const existingWithRef = await manager.find(Transaction, {
      where: { accountId, externalRef: Not(IsNull()) },
      select: { externalRef: true },
    });
    const knownRefs = new Set(existingWithRef.map((t) => t.externalRef as string));

    const existing = await manager.find(Transaction, {
      where: { accountId },
      select: { date: true, label: true, amount: true },
    });
    const knownFingerprints = new Set(existing.map((t) => fingerprint(t.date, t.label, t.amount)));

    const newRows: ParsedRow[] = [];
    let duplicateRows = 0;

    for (const row of rows) {
      const isDuplicate = row.externalRef
        ? knownRefs.has(row.externalRef)
        : knownFingerprints.has(fingerprint(row.date, row.label, row.amount));

      if (isDuplicate) {
        duplicateRows += 1;
        continue;
      }

      newRows.push(row);
      // Empêche aussi les doublons à l'intérieur du même fichier (ex. une
      // ligne présente deux fois dans l'export).
      if (row.externalRef) {
        knownRefs.add(row.externalRef);
      } else {
        knownFingerprints.add(fingerprint(row.date, row.label, row.amount));
      }
    }

    return { newRows, duplicateRows };
  }

  private resolveSourceType(filename: string): ImportSourceType {
    const extension = filename.split('.').pop()?.toLowerCase() ?? '';
    const sourceType = EXTENSION_TO_SOURCE[extension];
    if (!sourceType) {
      throw new BadRequestException('Format non supporté — seuls les fichiers .csv et .pdf sont acceptés');
    }
    return sourceType;
  }
}
