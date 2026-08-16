export interface MonthRange {
  year: number;
  month: number; // 1-12
  start: string; // ISO AAAA-MM-JJ, inclus
  end: string; // ISO AAAA-MM-JJ, inclus
  daysInMonth: number;
  /** Jours écoulés dans le mois, plafonné à daysInMonth (mois passés = clos). */
  daysElapsed: number;
  isCurrentMonth: boolean;
}

/** Parse "AAAA-MM" ou retombe sur le mois en cours si absent/invalide. */
export function resolveMonthRange(monthParam?: string, now: Date = new Date()): MonthRange {
  const match = monthParam ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;

  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const end = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;

  return { year, month, start, end, daysInMonth, daysElapsed, isCurrentMonth };
}

/** Décale (année, mois) de `delta` mois (peut être négatif). Mois 1-12. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBased / 12),
    month: (((zeroBased % 12) + 12) % 12) + 1,
  };
}

/** Résout la MonthRange du mois précédant `range`. */
export function previousMonthRange(range: MonthRange): MonthRange {
  const { year, month } = shiftMonth(range.year, range.month, -1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return resolveMonthRange(`${year}-${pad(month)}`);
}
