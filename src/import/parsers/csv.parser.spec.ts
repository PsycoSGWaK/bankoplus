import { parseCsv } from './csv.parser';

function csv(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

describe('parseCsv', () => {
  it('parses a standard date/label/amount CSV', () => {
    const buffer = csv([
      'date;libelle;montant',
      '03/08/2026;CARREFOUR MARKET;-45,67',
      '01/08/2026;VIREMENT SALAIRE;1500,00',
    ]);

    const result = parseCsv(buffer);

    expect(result.totalRows).toBe(2);
    expect(result.failedRows).toBe(0);
    expect(result.rows).toEqual([
      { date: '2026-08-03', label: 'CARREFOUR MARKET', amount: -45.67 },
      { date: '2026-08-01', label: 'VIREMENT SALAIRE', amount: 1500 },
    ]);
  });

  it('supports separate debit/credit columns', () => {
    const buffer = csv([
      'date,libelle,debit,credit',
      '03/08/2026,CARREFOUR MARKET,45.67,',
      '01/08/2026,VIREMENT SALAIRE,,1500.00',
    ]);

    const result = parseCsv(buffer);

    expect(result.rows[0].amount).toBe(-45.67);
    expect(result.rows[1].amount).toBe(1500);
  });

  it('counts unparsable rows as failed without dropping the whole import', () => {
    const buffer = csv([
      'date;libelle;montant',
      '03/08/2026;CARREFOUR MARKET;-45,67',
      'not-a-date;;oops',
    ]);

    const result = parseCsv(buffer);

    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.failedRows).toBe(1);
  });

  it('throws when required columns cannot be found', () => {
    const buffer = csv(['foo;bar', 'a;b']);
    expect(() => parseCsv(buffer)).toThrow(/Colonnes non reconnues/);
  });

  it('recognizes a real French bank export with multiple date/label columns', () => {
    // Format Société Générale-like : plusieurs colonnes "date" et "libellé",
    // débit/crédit séparés au lieu d'un montant signé unique.
    const buffer = csv([
      'Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation',
      '04/08/2026;CARREFOUR MARKET;CB CARREFOUR MARKET CARTE 1234;REF001;;CARTE;;;45,67;;03/08/2026;03/08/2026;',
      '02/08/2026;VIREMENT SALAIRE;VIR VIREMENT SALAIRE ENTREPRISE XYZ;REF002;;VIREMENT;;;;1500,00;01/08/2026;01/08/2026;',
    ]);

    const result = parseCsv(buffer);

    expect(result.failedRows).toBe(0);
    // "Date operation" doit être préférée à "Date de comptabilisation"/"Date de valeur".
    expect(result.rows[0].date).toBe('2026-08-03');
    expect(result.rows[0].label).toBe('CARREFOUR MARKET');
    expect(result.rows[0].amount).toBe(-45.67);
    expect(result.rows[1].amount).toBe(1500);
  });
});
