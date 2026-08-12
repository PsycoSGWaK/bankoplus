export interface ParsedRow {
  date: string; // ISO AAAA-MM-JJ
  label: string;
  amount: number;
  // Référence bancaire de la transaction, quand le format source en fournit
  // une (ex. colonne "Reference" d'un export CSV). Absente pour le PDF et
  // les CSV sans colonne dédiée.
  externalRef?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  totalRows: number;
  failedRows: number;
}
