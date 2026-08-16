import { normalizeText } from '../../common/utils/normalize-text';

export interface ExpenseEntry {
  label: string;
  amount: number;
}

/**
 * Projection des catégories "dépense fixe" (loyer, énergie, prêt...) : plutôt
 * qu'extrapoler ou moyenner, on compare les dépenses du mois précédent à
 * celles déjà passées ce mois-ci (même libellé normalisé). Chaque dépense du
 * mois précédent qui n'a pas encore d'équivalent ce mois-ci est une facture
 * qui n'est pas encore tombée — son montant s'ajoute au "reste attendu". Une
 * dépense déjà repassée ce mois-ci ne compte pas deux fois (comparaison en
 * multi-ensemble : deux prélèvements Free le mois dernier attendent bien deux
 * prélèvements Free ce mois-ci, pas un seul).
 *
 * Limite connue et acceptée (même compromis que le matching par mot-clé
 * ailleurs dans ce projet) : le rapprochement se fait sur le libellé
 * normalisé exact. Un libellé qui varie d'un mois sur l'autre (ex: le nom du
 * mois inclus dans le libellé de la banque) ferait rater le match.
 */
export function expectedRemainingForFixedExpense(
  previousMonth: ExpenseEntry[],
  currentMonth: ExpenseEntry[],
): number {
  const remainingCurrentByLabel = new Map<string, number>();
  for (const entry of currentMonth) {
    const key = normalizeText(entry.label);
    remainingCurrentByLabel.set(key, (remainingCurrentByLabel.get(key) ?? 0) + 1);
  }

  let expectedRemaining = 0;
  for (const entry of previousMonth) {
    const key = normalizeText(entry.label);
    const available = remainingCurrentByLabel.get(key) ?? 0;
    if (available > 0) {
      remainingCurrentByLabel.set(key, available - 1);
    } else {
      expectedRemaining += Math.abs(entry.amount);
    }
  }
  return expectedRemaining;
}
