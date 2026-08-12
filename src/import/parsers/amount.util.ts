/**
 * Parse un montant au format français ("1 234,56" ou "-45,67") ou anglo-saxon
 * ("1,234.56"). Retourne null si la valeur n'est pas un montant exploitable.
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isFrench = /,\d{1,2}$/.test(trimmed);
  const normalized = isFrench
    ? trimmed.replace(/[ .]/g, '').replace(',', '.')
    : trimmed.replace(/,/g, '');

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Parse une date "JJ/MM/AAAA" ou "AAAA-MM-JJ" vers un ISO "AAAA-MM-JJ". */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;

  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (french) {
    const [, day, month, year] = french;
    return `${year}-${month}-${day}`;
  }

  return null;
}
