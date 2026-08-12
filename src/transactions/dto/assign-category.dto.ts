import { IsOptional, IsUUID } from 'class-validator';

export class AssignCategoryDto {
  // Absent ou null pour retirer la catégorie de la transaction.
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}
