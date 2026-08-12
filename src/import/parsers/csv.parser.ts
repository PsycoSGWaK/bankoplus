// Aucune dépendance réseau importée dans ce fichier — voir la note de
// sécurité en tête de ParsingService. Ne rien y ajouter qui parle au réseau.
import { parse } from 'csv-parse/sync';
import { parseAmount, parseDate } from './amount.util';
import { ParseResult } from './parsed-row.interface';

// Chaque motif est une liste de sous-chaînes qui doivent TOUTES apparaître
// dans l'en-tête normalisé pour matcher. Les motifs sont essayés dans
// l'ordre — le premier qui trouve une colonne l'emporte. Nécessaire car les
// vrais exports bancaires ont souvent plusieurs colonnes "date" ou "libellé"
// (ex. Société Générale : "Date de comptabilisation", "Date operation",
// "Date de valeur", "Libelle simplifie", "Libelle operation"...).
const DATE_PATTERNS: string[][] = [
  ['date', 'operation'],
  ['date', 'valeur'],
  ['date', 'comptabilisation'],
  ['date'],
];
const LABEL_PATTERNS: string[][] = [
  ['libelle', 'simplifie'],
  ['libelle', 'operation'],
  ['libelle'],
  ['label'],
  ['description'],
  ['intitule'],
];
const AMOUNT_PATTERNS: string[][] = [['montant'], ['amount']];
const DEBIT_PATTERNS: string[][] = [['debit']];
const CREDIT_PATTERNS: string[][] = [['credit']];
// Optionnelle — sert uniquement à la déduplication (voir ImportService),
// aucune erreur si absente.
const REFERENCE_PATTERNS: string[][] = [['reference'], ['ref']];

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (marques combinantes après normalize('NFD'))
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function findColumn(headers: string[], patterns: string[][]): number {
  for (const pattern of patterns) {
    const index = headers.findIndex((h) => pattern.every((keyword) => h.includes(keyword)));
    if (index !== -1) return index;
  }
  return -1;
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
  const dateCol = findColumn(headers, DATE_PATTERNS);
  const labelCol = findColumn(headers, LABEL_PATTERNS);
  const amountCol = findColumn(headers, AMOUNT_PATTERNS);
  const debitCol = findColumn(headers, DEBIT_PATTERNS);
  const creditCol = findColumn(headers, CREDIT_PATTERNS);
  const referenceCol = findColumn(headers, REFERENCE_PATTERNS);

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

    const externalRef = referenceCol !== -1 ? (record[referenceCol] ?? '').trim() || undefined : undefined;
    rows.push({ date, label, amount, externalRef });
  }

  return { rows, totalRows: dataRows.length, failedRows };
}
