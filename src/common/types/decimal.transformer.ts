import { ValueTransformer } from 'typeorm';

/**
 * Les montants sont stockés en colonne DECIMAL (précision exacte) mais
 * TypeORM les renvoie sous forme de string par défaut — on les convertit
 * en number côté JS tout en gardant DECIMAL en base pour éviter les
 * erreurs d'arrondi des flottants.
 */
export const DecimalTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string) => (value === null || value === undefined ? value : parseFloat(value)),
};
