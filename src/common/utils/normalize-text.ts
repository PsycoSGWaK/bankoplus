/** Majuscules, sans accents — pour comparer libellés de transaction et mots-clés de façon fiable. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}
