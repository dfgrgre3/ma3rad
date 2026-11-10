import {
  MAX_SPREADSHEET_COLUMNS,
  MAX_SPREADSHEET_CELLS,
  MAX_SPREADSHEET_ROWS,
  type ParsedSpreadsheetSheet,
} from './SpreadsheetImportService_part01';

const DELIMITERS = [',', ';', '\t', '|'];

const countSeparators = (line: string, delimiter: string): number => {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count++;
    }
  }
  return quoted ? 0 : count;
};

export const looksLikeDelimitedText = (text: string): boolean => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return false;
  return DELIMITERS.some(delimiter =>
    countSeparators(lines[0], delimiter) > 0 && countSeparators(lines[1], delimiter) > 0);
};

export const decodeDelimitedText = (bytes: Uint8Array): string => {
  try {
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    } else {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    if (text.includes('\0')) throw new Error('يحتوي الملف على بيانات ثنائية.');
    return text.replace(/^\uFEFF/, '');
  } catch (error) {
    if (error instanceof Error && error.message === 'يحتوي الملف على بيانات ثنائية.') throw error;
    throw new Error('ترميز الملف غير مدعوم. احفظه بصيغة UTF-8 ثم حاول مجددًا.');
  }
};

export const parseDelimitedText = (text: string, name: string): ParsedSpreadsheetSheet => {
  const firstLine = text.split(/\r?\n/).find(line => line.trim());
  if (!firstLine) throw new Error('الملف لا يحتوي على صفوف بيانات.');
  const detectedDelimiter = DELIMITERS
    .map(candidate => ({ candidate, count: countSeparators(firstLine, candidate) }))
    .sort((left, right) => right.count - left.count)[0];
  const delimiter = detectedDelimiter?.count ? detectedDelimiter.candidate : '\0';

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(value => value.trim())) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('توجد علامة اقتباس غير مغلقة في الملف.');
  row.push(cell);
  if (row.some(value => value.trim())) matrix.push(row);
  if (matrix.length < 2) throw new Error('الملف لا يحتوي على صفوف بيانات بعد العناوين.');

  const headers = matrix[0].map((header, index) => header.trim() || `حقل ${index + 1}`);
  if (headers.length > MAX_SPREADSHEET_COLUMNS || new Set(headers).size !== headers.length) {
    throw new Error(`عناوين الأعمدة غير صالحة أو تتجاوز الحد الأقصى (${MAX_SPREADSHEET_COLUMNS}).`);
  }
  const rows = matrix.slice(1);
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new Error(`عدد الصفوف يتجاوز الحد الأقصى (${MAX_SPREADSHEET_ROWS.toLocaleString()}).`);
  }
  if (rows.length * headers.length > MAX_SPREADSHEET_CELLS) {
    throw new Error(`حجم نطاق البيانات يتجاوز الحد الأقصى (${MAX_SPREADSHEET_CELLS.toLocaleString()} خلية).`);
  }
  return {
    name,
    headers,
    rows: rows.map(values =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))),
  };
};
