import { previousMonthRange, resolveMonthRange, shiftMonth } from './month-range.util';

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

describe('previousMonthRange', () => {
  it('resolves the full range of the month before the given one', () => {
    const range = resolveMonthRange('2026-08', new Date(2026, 7, 15));
    const previous = previousMonthRange(range);

    expect(previous.year).toBe(2026);
    expect(previous.month).toBe(7);
    expect(previous.start).toBe('2026-07-01');
    expect(previous.end).toBe('2026-07-31');
  });

  it('crosses a year boundary correctly', () => {
    const range = resolveMonthRange('2026-01', new Date(2026, 0, 15));
    const previous = previousMonthRange(range);

    expect(previous.year).toBe(2025);
    expect(previous.month).toBe(12);
  });
});
