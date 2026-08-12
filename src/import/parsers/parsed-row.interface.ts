export interface ParsedRow {
  date: string; // ISO AAAA-MM-JJ
  label: string;
  amount: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  totalRows: number;
  failedRows: number;
}
