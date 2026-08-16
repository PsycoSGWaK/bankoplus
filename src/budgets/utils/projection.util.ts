/**
 * Projection linéaire simple : "au rythme actuel, où en sera-t-on en fin de
 * mois ?". Ce n'est pas une prévision statistique — juste une extrapolation
 * proportionnelle, honnête sur ce qu'elle est. Utilisée pour les catégories
 * de dépense variable (voir fixed-expense-matching.util.ts pour les
 * catégories de dépense fixe, qui utilisent un mécanisme différent).
 */
export function projectMonthEnd(amountSoFar: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) return amountSoFar;
  return (amountSoFar / daysElapsed) * daysInMonth;
}
