import { resolveMonthRange } from './month-range.util';

describe('resolveMonthRange', () => {
  it('resolves the current month when no param is given', () => {
    const now = new Date(2026, 7, 15); // 15 août 2026 (mois JS 0-indexé)
    const range = resolveMonthRange(undefined, now);

    expect(range).toMatchObject({
      year: 2026,
      month: 8,
      start: '2026-08-01',
      end: '2026-08-31',
      daysInMonth: 31,
      daysElapsed: 15,
      isCurrentMonth: true,
    });
  });

  it('treats a past month as fully elapsed (closed)', () => {
    const now = new Date(2026, 7, 15);
    const range = resolveMonthRange('2026-06', now);

    expect(range.isCurrentMonth).toBe(false);
    expect(range.daysInMonth).toBe(30);
    expect(range.daysElapsed).toBe(30);
  });

  it('handles February correctly', () => {
    const range = resolveMonthRange('2026-02', new Date(2026, 7, 1));
    expect(range.daysInMonth).toBe(28);
  });

  it('falls back to the current month for a malformed param', () => {
    const now = new Date(2026, 7, 15);
    const range = resolveMonthRange('not-a-month', now);
    expect(range.year).toBe(2026);
    expect(range.month).toBe(8);
  });
});
