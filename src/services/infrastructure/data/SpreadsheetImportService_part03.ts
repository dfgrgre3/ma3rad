import * as XLSX from 'xlsx';
import { MAX_SPREADSHEET_ROWS, validateSpreadsheetFileHeader, validateSpreadsheetFileMetadata } from './SpreadsheetImportService_part01';
import type { ParsedSpreadsheet } from './SpreadsheetImportService_part01';
import { validateWorkbookBounds } from './SpreadsheetImportService_part02';
import { decodeDelimitedText, parseDelimitedText } from './DelimitedTextImport';

export const parseSpreadsheetBuffer = (buffer: ArrayBuffer, fileName: string): ParsedSpreadsheet => {
  const extension = validateSpreadsheetFileMetadata(fileName, buffer.byteLength);
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  validateSpreadsheetFileHeader(extension, bytes);

  if (extension === 'csv') {
    const name = fileName.replace(/\.[^.]+$/, '');
    return {
      buffer,
      sheets: [parseDelimitedText(decodeDelimitedText(new Uint8Array(buffer)), name)],
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      sheetRows: MAX_SPREADSHEET_ROWS + 1,
    });
  } catch {
    throw new Error('تعذر تحليل الملف. تحقق من سلامة ملف Excel أو CSV ثم حاول مجددًا.');
  }

  validateWorkbookBounds(workbook);
  const sheets = workbook.SheetNames.flatMap(name => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    return rows.length ? [{ name, headers: Object.keys(rows[0]), rows }] : [];
  });
  if (!sheets.length) throw new Error('الملف لا يحتوي على صفوف بيانات.');
  return { buffer, sheets };
};
