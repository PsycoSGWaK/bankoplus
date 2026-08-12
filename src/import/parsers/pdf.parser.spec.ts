import { parseTransactionLines } from './pdf.parser';

describe('parseTransactionLines', () => {
  it('extracts transaction-shaped lines and ignores decorative text', () => {
    const text = [
      'RELEVÉ DE COMPTE — AOÛT 2026',
      'Solde précédent : 1000,00',
      '03/08/2026 CARTE X1234 CARREFOUR MARKET -45,67',
      '01/08/2026 VIREMENT SALAIRE ENTREPRISE XYZ 1500,00',
      'Solde final : 2454,33',
    ].join('\n');

    const result = parseTransactionLines(text);

    expect(result.rows).toEqual([
      { date: '2026-08-03', label: 'CARTE X1234 CARREFOUR MARKET', amount: -45.67 },
      { date: '2026-08-01', label: 'VIREMENT SALAIRE ENTREPRISE XYZ', amount: 1500 },
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.failedRows).toBe(0);
  });

  it('returns an empty result for text with no recognizable transactions', () => {
    const result = parseTransactionLines('Ceci est un document sans transactions.');
    expect(result.rows).toHaveLength(0);
    expect(result.totalRows).toBe(0);
  });
});
