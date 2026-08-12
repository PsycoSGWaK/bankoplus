import { IsUUID } from 'class-validator';

export class ImportFileDto {
  @IsUUID()
  accountId!: string;
}
