/**
 * Projection linéaire simple : "au rythme actuel, où en sera-t-on en fin de
 * mois ?". Ce n'est pas une prévision statistique — juste une extrapolation
 * proportionnelle, honnête sur ce qu'elle est.
 */
export function projectMonthEnd(amountSoFar: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) return amountSoFar;
  return (amountSoFar / daysElapsed) * daysInMonth;
}

/**
 * Comme `projectMonthEnd`, mais pour une catégorie identifiée comme
 * récurrente (voir recurrence.util.ts) : on projette son montant mensuel
 * habituel plutôt que d'extrapoler le rythme du mois en cours, qui n'a pas de
 * sens pour une facture ponctuelle (déjà payée ou pas encore). On ne
 * descend jamais sous ce qui a déjà été dépensé ce mois-ci.
 */
export function projectCategorySpend(
  amountSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
  recurringAverage?: number,
): number {
  if (recurringAverage !== undefined) {
    return Math.max(recurringAverage, amountSoFar);
  }
  return projectMonthEnd(amountSoFar, daysElapsed, daysInMonth);
}
