import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AntivirusService } from './services/antivirus.service';
import { ParsingService } from './services/parsing.service';
import { ImportBatch, ImportBatchStatus, ImportSourceType } from './entities/import-batch.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

const EXTENSION_TO_SOURCE: Record<string, ImportSourceType> = { csv: 'csv', pdf: 'pdf' };
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly antivirus: AntivirusService,
    private readonly parsing: ParsingService,
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
      const batch = await manager.save(
        manager.create(ImportBatch, {
          userId,
          accountId,
          filename: file.originalname,
          sourceType,
          status,
          totalRows: result.totalRows,
          importedRows: result.rows.length,
          failedRows: result.failedRows,
        }),
      );

      if (result.rows.length > 0) {
        const transactions = result.rows.map((row) =>
          manager.create(Transaction, {
            userId,
            accountId,
            date: row.date,
            label: row.label,
            amount: row.amount,
            importBatchId: batch.id,
          }),
        );
        await manager.save(transactions);
      }

      return batch;
    });
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
