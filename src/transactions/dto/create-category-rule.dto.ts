import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  keyword!: string;

  // Garde optionnelle : la règle ne s'applique qu'aux montants (en valeur
  // absolue) supérieurs ou égaux à ce seuil.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minAmount?: number;

  // Garde optionnelle : la règle ne s'applique qu'aux crédits (montant > 0)
  // ou qu'aux débits (montant < 0).
  @IsOptional()
  @IsIn(['credit', 'debit'])
  direction?: 'credit' | 'debit';
}
