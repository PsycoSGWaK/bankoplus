import { IsBoolean } from 'class-validator';

export class UpdateCategoryDto {
  @IsBoolean()
  isFixedExpense!: boolean;
}
