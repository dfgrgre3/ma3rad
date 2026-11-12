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

export interface WorkbookBounds {
  totalRows: number;
  totalCells: number;
  totalDataBytes: number;
}
