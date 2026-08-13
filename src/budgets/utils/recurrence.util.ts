/**
 * Détection de dépenses récurrentes (loyer, assurance, énergie, télécom...).
 *
 * Ces factures tombent en général une seule fois par mois, souvent en tout
 * début ou toute fin de mois — pas étalées sur le mois comme des courses. Une
 * simple extrapolation linéaire du "rythme actuel" les gère mal : elle
 * surestime massivement juste après leur passage, et les ignore complètement
 * tant qu'elles n'ont pas encore été prélevées. On les repère plutôt via la
 * régularité de leur montant mensuel sur l'historique récent, et on projette
 * directement leur montant moyen plutôt que d'extrapoler.
 */

const DEFAULT_MONTHS_REQUIRED = 3;
const DEFAULT_MAX_VARIATION = 0.3; // écart-type / moyenne toléré

/** Décale (année, mois) de `delta` mois (peut être négatif). Mois 1-12. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  };
}

/**
 * Une catégorie est jugée récurrente si elle a une dépense sur chacun des
 * `monthsRequired` derniers mois complets, avec un montant mensuel stable
 * (coefficient de variation sous `maxVariation`). Retourne le montant moyen
 * pour chaque catégorie jugée récurrente.
 */
export function detectRecurringCategories(
  monthlyTotalsByCategory: Map<string, number[]>,
  monthsRequired: number = DEFAULT_MONTHS_REQUIRED,
  maxVariation: number = DEFAULT_MAX_VARIATION,
): Map<string, number> {
  const recurring = new Map<string, number>();

  for (const [categoryKey, totals] of monthlyTotalsByCategory) {
    if (totals.length < monthsRequired) continue;

    const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
    if (mean <= 0) continue;

    const variance = totals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / totals.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    if (coefficientOfVariation <= maxVariation) {
      recurring.set(categoryKey, mean);
    }
  }

  return recurring;
}
