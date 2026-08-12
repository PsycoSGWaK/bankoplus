import { IsOptional, IsPositive, IsUUID } from 'class-validator';

export class SimulatePurchaseDto {
  // Montant de l'achat envisagé, toujours positif — c'est une dépense par définition ici.
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
