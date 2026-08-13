import { projectCategorySpend, projectMonthEnd } from './projection.util';

describe('projectMonthEnd', () => {
  it('extrapolates linearly from the current spending rate', () => {
    // 300€ dépensés en 10 jours sur un mois de 30 jours -> rythme de 30€/jour
    expect(projectMonthEnd(300, 10, 30)).toBe(900);
  });

  it('returns the amount as-is when no days have elapsed', () => {
    expect(projectMonthEnd(50, 0, 30)).toBe(50);
  });

  it('returns the actual amount for a closed month (daysElapsed = daysInMonth)', () => {
    expect(projectMonthEnd(842, 31, 31)).toBe(842);
  });
});

describe('projectCategorySpend', () => {
  it('falls back to linear extrapolation when no recurring average is given', () => {
    expect(projectCategorySpend(300, 10, 30)).toBe(900);
  });

  it('projects the recurring average instead of extrapolating, even if nothing spent yet', () => {
    // Loyer pas encore prélevé au jour 3 -> l'extrapolation linéaire donnerait 0.
    expect(projectCategorySpend(0, 3, 30, 800)).toBe(800);
  });

  it('never projects below what has already been spent this month', () => {
    // La facture est arrivée plus salée que d'habitude.
    expect(projectCategorySpend(950, 20, 30, 800)).toBe(950);
  });
});
