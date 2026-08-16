import { expectedRemainingForFixedExpense } from './fixed-expense-matching.util';

describe('expectedRemainingForFixedExpense', () => {
  it('projects nothing extra once the matching bill has already passed this month', () => {
    const previous = [{ label: 'EDF', amount: -60 }];
    const current = [{ label: 'EDF', amount: -62 }];
    expect(expectedRemainingForFixedExpense(previous, current)).toBe(0);
  });

  it('adds the previous amount when the bill has not passed yet this month', () => {
    const previous = [{ label: 'LOYER', amount: -800 }];
    const current: { label: string; amount: number }[] = [];
    expect(expectedRemainingForFixedExpense(previous, current)).toBe(800);
  });

  it('matches by count, not just presence, when the same label recurs several times', () => {
    const previous = [
      { label: 'FREEBOX', amount: -49.99 },
      { label: 'FREE MOBILE', amount: -9.99 },
    ];
    // Un seul des deux prélèvements Free est déjà passé ce mois-ci.
    const current = [{ label: 'FREEBOX', amount: -49.99 }];
    expect(expectedRemainingForFixedExpense(previous, current)).toBeCloseTo(9.99, 5);
  });

  it('is case/accent-insensitive via label normalization', () => {
    const previous = [{ label: 'Assurance Habitation', amount: -20 }];
    const current = [{ label: 'ASSURANCE HABITATION', amount: -20 }];
    expect(expectedRemainingForFixedExpense(previous, current)).toBe(0);
  });

  it('returns zero when there is no previous-month history to compare against', () => {
    expect(expectedRemainingForFixedExpense([], [{ label: 'EDF', amount: -60 }])).toBe(0);
  });
});
