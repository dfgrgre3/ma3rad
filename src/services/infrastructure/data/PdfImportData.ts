import type { ParsedSpreadsheetSheet } from './SpreadsheetImportService';

const MAX_PDF_IMPORT_ROWS = 10_000;
const MAX_PDF_IMPORT_COLUMNS = 100;

const uniqueHeaders = (values: string[]): string[] => {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `حقل ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
};

const splitTableLine = (line: string): string[] => {
  if (line.includes('|')) {
    const normalized = line.trim();
    const cells = normalized.split('|').map(value => value.trim());
    if (normalized.startsWith('|') && normalized.endsWith('|')) {
      cells.pop();
      cells.shift();
    }
    return cells;
  }
  if (line.includes('\t')) return line.split('\t').map(value => value.trim());
  return line.split(/\s{2,}/).map(value => value.trim());
};

export const parsePdfExtractedText = (text: string, sheetName: string): ParsedSpreadsheetSheet => {
  const lines = text
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error('لم يتم العثور على نص قابل للاستيراد في ملف PDF.');

  let table: string[][] | null = null;
  for (let headerIndex = 0; headerIndex < lines.length; headerIndex++) {
    const header = splitTableLine(lines[headerIndex]);
    if (header.length < 2 || header.length > MAX_PDF_IMPORT_COLUMNS) continue;

    const matchingRows = lines.slice(headerIndex + 1)
      .map(splitTableLine)
      .filter(row => row.length === header.length)
      .filter(row => !row.every(value => /^:?-{3,}:?$/.test(value)));
    if (!matchingRows.length) continue;

    table = [header, ...matchingRows];
    break;
  }

  if (table) {
    const headers = uniqueHeaders(table[0]);
    const rows = table.slice(1, MAX_PDF_IMPORT_ROWS + 1).map(values =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))
    );
    return { name: sheetName, headers, rows };
  }

  const labeledValues = lines.flatMap(line => {
    const match = line.match(/^([^:：]{1,80})\s*[:：]\s*(.+)$/);
    return match ? [{ label: match[1].trim(), value: match[2].trim() }] : [];
  });

  if (labeledValues.length >= 2) {
    const headers = uniqueHeaders(labeledValues.map(item => item.label));
    const row = Object.fromEntries(headers.map((header, index) => [header, labeledValues[index]?.value || '']));
    return { name: sheetName, headers, rows: [row] };
  }

  return {
    name: sheetName,
    headers: ['النص المستخرج'],
    rows: lines.slice(0, MAX_PDF_IMPORT_ROWS).map(value => ({ 'النص المستخرج': value })),
  };
};
