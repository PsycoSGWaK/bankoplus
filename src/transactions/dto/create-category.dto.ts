import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoryKind } from '../entities/category.entity';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsIn(['income', 'expense'])
  kind!: CategoryKind;

  @IsOptional()
  @IsBoolean()
  isFixedExpense?: boolean;
}
