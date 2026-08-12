import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SUPPORTED_CURRENCIES = ['EUR'];

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsNumber()
  referenceBalance?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'referenceDate doit être au format AAAA-MM-JJ' })
  referenceDate?: string;
}
