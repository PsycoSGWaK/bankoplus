import { IsOptional, IsPositive, IsUUID } from 'class-validator';

export class UpsertBudgetDto {
  // Absent = seuil global (toutes dépenses confondues).
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsPositive()
  monthlyLimit!: number;
}
