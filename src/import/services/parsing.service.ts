import { BadRequestException, Injectable } from '@nestjs/common';
import { parseCsv } from '../parsers/csv.parser';
import { parsePdf } from '../parsers/pdf.parser';
import { ParseResult } from '../parsers/parsed-row.interface';
import { withTimeout, TimeoutError } from '../../common/utils/with-timeout';
import { ImportSourceType } from '../entities/import-batch.entity';

const PARSE_TIMEOUT_MS = 30000;

@Injectable()
export class ParsingService {
  async parse(buffer: Buffer, sourceType: ImportSourceType): Promise<ParseResult> {
    try {
      if (sourceType === 'csv') {
        return await withTimeout(Promise.resolve(parseCsv(buffer)), PARSE_TIMEOUT_MS, 'Parsing CSV');
      }
      return await withTimeout(parsePdf(buffer), PARSE_TIMEOUT_MS, 'Parsing PDF');
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new BadRequestException('Le fichier a mis trop de temps à être analysé');
      }
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Fichier illisible ou mal formé',
      );
    }
  }
}
