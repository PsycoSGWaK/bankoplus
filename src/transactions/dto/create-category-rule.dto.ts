import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  keyword!: string;
}
