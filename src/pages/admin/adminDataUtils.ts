import * as XLSX from 'xlsx';
import type { DataImportSheet } from '../../services/dataAdminTypes';
import { validateSpreadsheetFileHeader } from '../../services/SpreadsheetImportService';

const MAX_ADMIN_DATA_IMPORT_FILE_SIZE = 100 * 1024 * 1024;

interface ExportSheet {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export function downloadExcel(fileName: string, sheets: ExportSheet[]): void {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const sheet of sheets) {
    const baseName = sheet.name.replace(/[\\/?*:\[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet';
    let name = baseName;
    let suffix = 1;
    while (usedNames.has(name.toLowerCase())) {
      const ending = `_${suffix++}`;
      name = `${baseName.slice(0, 31 - ending.length)}${ending}`;
    }
    usedNames.add(name.toLowerCase());

    const data = [
      sheet.columns,
      ...sheet.rows.map((row) => sheet.columns.map((column) => row[column] ?? '')),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), name);
  }

  XLSX.writeFile(workbook, fileName);
}

export function parseAdminDataWorkbook(buffer: ArrayBuffer, fileName: string): DataImportSheet[] {
  if (fileName.split('.').pop()?.toLowerCase() !== 'xlsx') {
    throw new Error('استيراد إدارة البيانات يقبل ملف XLSX المُصدّر من النظام فقط.');
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_ADMIN_DATA_IMPORT_FILE_SIZE) {
    throw new Error(`حجم الملف فارغ أو يتجاوز الحد المسموح (${MAX_ADMIN_DATA_IMPORT_FILE_SIZE / 1024 / 1024} ميجابايت).`);
  }
  validateSpreadsheetFileHeader('xlsx', new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8)));

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false, sheetRows: 1_000_001 });
  } catch {
    throw new Error('تعذر قراءة ملف Excel. تأكد من سلامة الملف وأنه صادر من النظام.');
  }
  if (workbook.SheetNames.length === 0 || workbook.SheetNames.length > 500) {
    throw new Error('عدد أوراق العمل في الملف غير صالح.');
  }

  let totalRows = 0;
  let totalCells = 0;
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`تعذر قراءة ورقة «${name}».`);
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue;
      const cell = sheet[address] as XLSX.CellObject;
      if (cell.f !== undefined) throw new Error(`لا يُسمح بالمعادلات في ورقة «${name}».`);
      if (cell.t === 'e') throw new Error(`تحتوي ورقة «${name}» على خلية Excel غير صالحة.`);
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    if (matrix.length === 0) throw new Error(`ورقة «${name}» لا تحتوي على عناوين أعمدة.`);
    const columns = matrix[0].map((value) => typeof value === 'string' ? value : '');
    if (columns.length === 0 || columns.length > 500 ||
      columns.some((column) => !column) || new Set(columns).size !== columns.length) {
      throw new Error(`عناوين الأعمدة في ورقة «${name}» غير صالحة.`);
    }

    const rows = matrix.slice(1)
      .filter((values) => values.some((value) => value !== null && value !== undefined && value !== ''))
      .map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
    totalRows += rows.length;
    totalCells += rows.length * columns.length;
    if (totalRows > 1_000_000 || totalCells > 5_000_000) {
      throw new Error('حجم بيانات ملف Excel يتجاوز الحد المسموح للاستيراد.');
    }
    return { name, columns, rows };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatImportValue(value: unknown): string {
  if (value instanceof Uint8Array) return `[بيانات ثنائية: ${formatBytes(value.byteLength)}]`;
  if (value instanceof ArrayBuffer) return `[بيانات ثنائية: ${formatBytes(value.byteLength)}]`;
  return String(value ?? 'فارغ');
}
