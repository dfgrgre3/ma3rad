import * as XLSX from 'xlsx';
import { MAX_SPREADSHEET_CELLS, MAX_SPREADSHEET_COLUMNS, MAX_SPREADSHEET_DATA_BYTES, MAX_SPREADSHEET_ROWS, MAX_SPREADSHEET_SHEETS } from './SpreadsheetImportService_part01';
import type { WorkbookBounds } from './SpreadsheetImportService_part01';

export const getSheetRange = (name: string, sheet: XLSX.WorkSheet): XLSX.Range | undefined => {
  const fullRef = (sheet as XLSX.WorkSheet & { '!fullref'?: string })['!fullref'];
  const ref = fullRef || sheet['!ref'];
  if (!ref) return undefined;

  try {
    return XLSX.utils.decode_range(ref);
  } catch {
    throw new Error(`نطاق البيانات في الورقة «${name}» غير صالح.`);
  }
};

export const validateSheetDimensions = (name: string, range: XLSX.Range): { rowCount: number; columnCount: number } => {
  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  if (rowCount > MAX_SPREADSHEET_ROWS + 1) {
    throw new Error(`عدد الصفوف في الورقة «${name}» يتجاوز الحد الأقصى (${MAX_SPREADSHEET_ROWS} صف بيانات).`);
  }
  if (columnCount > MAX_SPREADSHEET_COLUMNS) {
    throw new Error(`عدد الأعمدة في الورقة «${name}» يتجاوز الحد الأقصى (${MAX_SPREADSHEET_COLUMNS}).`);
  }
  return { rowCount, columnCount };
};

export const validateWorkbookTotals = (totals: WorkbookBounds): void => {
  if (totals.totalRows > MAX_SPREADSHEET_ROWS) {
    throw new Error(`إجمالي صفوف البيانات في المصنف يتجاوز الحد الأقصى (${MAX_SPREADSHEET_ROWS}).`);
  }
  if (totals.totalCells > MAX_SPREADSHEET_CELLS) {
    throw new Error(`حجم نطاق البيانات يتجاوز الحد الأقصى (${MAX_SPREADSHEET_CELLS.toLocaleString()} خلية).`);
  }
};

export const countSheetDataBytes = (sheet: XLSX.WorkSheet, totalDataBytes: number): number => {
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const value = (sheet[address] as XLSX.CellObject | undefined)?.v;
    if (typeof value === 'string') totalDataBytes += value.length * 2;
    if (totalDataBytes > MAX_SPREADSHEET_DATA_BYTES) {
      throw new Error(`حجم محتوى الخلايا يتجاوز الحد الأقصى (${MAX_SPREADSHEET_DATA_BYTES / 1024 / 1024} ميجابايت).`);
    }
  }
  return totalDataBytes;
};

export const validateSheetBounds = (name: string, sheet: XLSX.WorkSheet, totals: WorkbookBounds): void => {
  const range = getSheetRange(name, sheet);
  if (!range) return;

  const { rowCount, columnCount } = validateSheetDimensions(name, range);
  totals.totalRows += Math.max(0, rowCount - 1);
  totals.totalCells += rowCount * columnCount;
  validateWorkbookTotals(totals);
  totals.totalDataBytes = countSheetDataBytes(sheet, totals.totalDataBytes);
};

export const validateWorkbookBounds = (workbook: XLSX.WorkBook): void => {
  if (workbook.SheetNames.length > MAX_SPREADSHEET_SHEETS) {
    throw new Error(`يحتوي المصنف على عدد أوراق يتجاوز الحد الأقصى (${MAX_SPREADSHEET_SHEETS}).`);
  }

  const totals: WorkbookBounds = { totalRows: 0, totalCells: 0, totalDataBytes: 0 };
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    validateSheetBounds(name, sheet, totals);
  }
};
