import { detectRecurringCategories, shiftMonth } from './recurrence.util';

describe('shiftMonth', () => {
  it('shifts backward within the same year', () => {
    expect(shiftMonth(2026, 5, -1)).toEqual({ year: 2026, month: 4 });
  });

  it('shifts backward across a year boundary', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('shifts forward across a year boundary', () => {
    expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
  });
});

describe('detectRecurringCategories', () => {
  it('flags a category with a stable monthly amount over the required months', () => {
    const totals = new Map([['loyer', [800, 800, 810]]]);
    const recurring = detectRecurringCategories(totals);
    expect(recurring.get('loyer')).toBeCloseTo(803.33, 1);
  });

  it('ignores a category with too little history', () => {
    const totals = new Map([['loyer', [800, 800]]]);
    expect(detectRecurringCategories(totals).has('loyer')).toBe(false);
  });

  it('ignores a category with highly variable spending (e.g. groceries)', () => {
    const totals = new Map([['alimentation', [200, 450, 90]]]);
    expect(detectRecurringCategories(totals).has('alimentation')).toBe(false);
  });

  it('ignores a category with zero average spend', () => {
    const totals = new Map([['vide', [0, 0, 0]]]);
    expect(detectRecurringCategories(totals).has('vide')).toBe(false);
  });
});
