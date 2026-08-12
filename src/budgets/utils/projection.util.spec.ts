import { projectMonthEnd } from './projection.util';

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
