import { parseAmount, parseDate } from './amount.util';

describe('parseAmount', () => {
  it('parses French-formatted amounts with a comma decimal separator', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('-45,67')).toBe(-45.67);
    expect(parseAmount('1.234,56')).toBe(1234.56);
  });

  it('parses plain decimal amounts', () => {
    expect(parseAmount('1500')).toBe(1500);
    expect(parseAmount('-45.67')).toBe(-45.67);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses French dates (JJ/MM/AAAA) into ISO', () => {
    expect(parseDate('03/08/2026')).toBe('2026-08-03');
  });

  it('passes through ISO dates unchanged', () => {
    expect(parseDate('2026-08-03')).toBe('2026-08-03');
  });

  it('returns null for unrecognized formats', () => {
    expect(parseDate('August 3rd')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});
