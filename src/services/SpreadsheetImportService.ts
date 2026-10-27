import * as XLSX from 'xlsx';

export const MAX_SPREADSHEET_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 20_000;
export const MAX_SPREADSHEET_COLUMNS = 100;
export const MAX_SPREADSHEET_CELLS = 250_000;
export const MAX_SPREADSHEET_DATA_BYTES = 8 * 1024 * 1024;
export const MAX_SPREADSHEET_SHEETS = 20;

export interface ParsedSpreadsheetSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ParsedSpreadsheet {
  buffer: ArrayBuffer;
  sheets: ParsedSpreadsheetSheet[];
}

export const validateSpreadsheetFileMetadata = (fileName: string, size: number): string => {
  const extension = fileName.split('.').pop()?.toLocaleLowerCase();
  if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
    throw new Error('نوع الملف غير مدعوم. اختر ملف Excel بصيغة XLSX أو XLS أو ملف CSV.');
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error('الملف فارغ أو حجمه غير صالح.');
  if (size > MAX_SPREADSHEET_FILE_SIZE) {
    throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${MAX_SPREADSHEET_FILE_SIZE / 1024 / 1024} ميجابايت).`);
  }
  return extension;
};

export const validateSpreadsheetFileHeader = (extension: string, header: Uint8Array): void => {
  const isZip = header[0] === 0x50 && header[1] === 0x4b &&
    ((header[2] === 0x03 && header[3] === 0x04) ||
      (header[2] === 0x05 && header[3] === 0x06) ||
      (header[2] === 0x07 && header[3] === 0x08));
  const isLegacyExcel = header.length >= 8 &&
    header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0 &&
    header[4] === 0xa1 && header[5] === 0xb1 && header[6] === 0x1a && header[7] === 0xe1;

  if (extension === 'xlsx' && !isZip) throw new Error('محتوى الملف لا يطابق امتداد XLSX.');
  if (extension === 'xls' && !isLegacyExcel) throw new Error('محتوى الملف لا يطابق امتداد XLS.');
  if (extension === 'csv') {
    const isUtf16 = (header[0] === 0xff && header[1] === 0xfe) || (header[0] === 0xfe && header[1] === 0xff);
    const hasNullByte = header.some(byte => byte === 0);
    if (isZip || isLegacyExcel || (hasNullByte && !isUtf16)) {
      throw new Error('محتوى الملف لا يبدو نصًا صالحًا بصيغة CSV.');
    }
  }
}

interface WorkbookBounds {
  totalRows: number;
  totalCells: number;
  totalDataBytes: number;
}

const getSheetRange = (name: string, sheet: XLSX.WorkSheet): XLSX.Range | undefined => {
  const fullRef = (sheet as XLSX.WorkSheet & { '!fullref'?: string })['!fullref'];
  const ref = fullRef || sheet['!ref'];
  if (!ref) return undefined;

  try {
    return XLSX.utils.decode_range(ref);
  } catch {
    throw new Error(`نطاق البيانات في الورقة «${name}» غير صالح.`);
  }
};

const validateSheetDimensions = (name: string, range: XLSX.Range): { rowCount: number; columnCount: number } => {
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

const validateWorkbookTotals = (totals: WorkbookBounds): void => {
  if (totals.totalRows > MAX_SPREADSHEET_ROWS) {
    throw new Error(`إجمالي صفوف البيانات في المصنف يتجاوز الحد الأقصى (${MAX_SPREADSHEET_ROWS}).`);
  }
  if (totals.totalCells > MAX_SPREADSHEET_CELLS) {
    throw new Error(`حجم نطاق البيانات يتجاوز الحد الأقصى (${MAX_SPREADSHEET_CELLS.toLocaleString()} خلية).`);
  }
};

const countSheetDataBytes = (sheet: XLSX.WorkSheet, totalDataBytes: number): number => {
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

const validateSheetBounds = (name: string, sheet: XLSX.WorkSheet, totals: WorkbookBounds): void => {
  const range = getSheetRange(name, sheet);
  if (!range) return;

  const { rowCount, columnCount } = validateSheetDimensions(name, range);
  totals.totalRows += Math.max(0, rowCount - 1);
  totals.totalCells += rowCount * columnCount;
  validateWorkbookTotals(totals);
  totals.totalDataBytes = countSheetDataBytes(sheet, totals.totalDataBytes);
};

const validateWorkbookBounds = (workbook: XLSX.WorkBook): void => {
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

export const parseSpreadsheetBuffer = (buffer: ArrayBuffer, fileName: string): ParsedSpreadsheet => {
  const extension = validateSpreadsheetFileMetadata(fileName, buffer.byteLength);
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  validateSpreadsheetFileHeader(extension, bytes);

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
