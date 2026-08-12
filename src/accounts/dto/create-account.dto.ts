import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const SUPPORTED_CURRENCIES = ['EUR'];

export class CreateAccountDto {
  @IsString()
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;
}
