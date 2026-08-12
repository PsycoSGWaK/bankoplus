// Aucune dépendance réseau importée dans ce fichier — voir la note de
// sécurité en tête de ParsingService. Ne rien y ajouter qui parle au réseau.
//
// Limite connue : ceci est un parseur heuristique, pas un parseur universel
// de relevés bancaires. Chaque banque a sa propre mise en page PDF ; ce
// parseur reconnaît un format ligne-par-ligne courant (date, libellé,
// montant signé). Les lignes qui ne correspondent pas au motif (en-têtes,
// pieds de page, soldes) sont silencieusement ignorées plutôt que comptées
// en échec — on ne peut pas savoir si elles étaient censées être des
// transactions.
import { PDFParse } from 'pdf-parse';
import { parseAmount, parseDate } from './amount.util';
import { ParseResult } from './parsed-row.interface';

const TRANSACTION_LINE =
  /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?[\d .]{1,15},\d{2})$/;

/** Logique pure de reconnaissance des lignes — séparée de l'extraction PDF pour être testable sans fichier réel. */
export function parseTransactionLines(text: string): ParseResult {
  const lines = text
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);

  const rows = [];
  let failedRows = 0;
  let candidates = 0;

  for (const line of lines) {
    const match = TRANSACTION_LINE.exec(line);
    if (!match) continue;

    candidates += 1;
    const [, rawDate, rawLabel, rawAmount] = match;
    const date = parseDate(rawDate);
    const amount = parseAmount(rawAmount);
    const label = rawLabel.trim();

    if (!date || !label || amount === null) {
      failedRows += 1;
      continue;
    }

    rows.push({ date, label, amount });
  }

  return { rows, totalRows: candidates, failedRows };
}

export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: buffer });
  let text: string;
  try {
    text = (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }

  return parseTransactionLines(text);
}
