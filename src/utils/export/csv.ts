const FORMULA_PREFIX = /^[\s]*[=+\-@\t\r]/;

/**
 * Quotes a value for CSV output and neutralises spreadsheet formulas so an
 * imported cell cannot execute when the file is opened in Excel or Sheets.
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}