// Aucune dépendance réseau importée dans ce fichier — voir la note de
// sécurité en tête de ParsingService. Ne rien y ajouter qui parle au réseau.
import { parse } from 'csv-parse/sync';
import { parseAmount, parseDate } from './amount.util';
import { ParseResult } from './parsed-row.interface';

const DATE_HEADERS = ['date', 'dateoperation', 'dateop', 'dateval'];
const LABEL_HEADERS = ['libelle', 'label', 'description', 'intitule', 'libell'];
const AMOUNT_HEADERS = ['montant', 'amount'];
const DEBIT_HEADERS = ['debit'];
const CREDIT_HEADERS = ['credit'];

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (marques combinantes après normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h));
}

/**
 * Détecte le séparateur à partir de la première ligne. On ne peut pas
 * laisser csv-parse essayer les deux à la fois : les montants français
 * ("-45,67") contiennent une virgule, qui serait alors lue comme un
 * second séparateur de colonnes et casserait le parsing.
 */
function detectDelimiter(buffer: Buffer): ',' | ';' {
  const firstLine = buffer.toString('utf8').split('\n', 1)[0] ?? '';
  return firstLine.includes(';') ? ';' : ',';
}

export function parseCsv(buffer: Buffer): ParseResult {
  const records: string[][] = parse(buffer, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: detectDelimiter(buffer),
  });

  if (records.length === 0) {
    return { rows: [], totalRows: 0, failedRows: 0 };
  }

  const headers = records[0].map(normalizeHeader);
  const dateCol = findColumn(headers, DATE_HEADERS);
  const labelCol = findColumn(headers, LABEL_HEADERS);
  const amountCol = findColumn(headers, AMOUNT_HEADERS);
  const debitCol = findColumn(headers, DEBIT_HEADERS);
  const creditCol = findColumn(headers, CREDIT_HEADERS);

  if (dateCol === -1 || labelCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    throw new Error(
      "Colonnes non reconnues : le fichier doit contenir une date, un libellé, et un montant (ou débit/crédit)",
    );
  }

  const dataRows = records.slice(1);
  const rows = [];
  let failedRows = 0;

  for (const record of dataRows) {
    const date = parseDate(record[dateCol] ?? '');
    const label = (record[labelCol] ?? '').trim();

    let amount: number | null = null;
    if (amountCol !== -1) {
      amount = parseAmount(record[amountCol] ?? '');
    } else {
      const debit = parseAmount(record[debitCol] ?? '') ?? 0;
      const credit = parseAmount(record[creditCol] ?? '') ?? 0;
      amount = credit - Math.abs(debit);
    }

    if (!date || !label || amount === null) {
      failedRows += 1;
      continue;
    }

    rows.push({ date, label, amount });
  }

  return { rows, totalRows: dataRows.length, failedRows };
}
