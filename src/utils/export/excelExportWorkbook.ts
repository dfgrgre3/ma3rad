import * as XLSX from 'xlsx';
import type { ExportColumn, ExportSheet } from './exportTypes';

export interface ExcelWorkbookRequest {
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  companyName: string;
  kpis?: Array<{ label: string; value: string | number; hint?: string }>;
  sheets?: ExportSheet[];
}

const sheetBody = (columns: ExportColumn[], rows: Array<Record<string, unknown>>) =>
  rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      return value === null || value === undefined ? '' : value;
    })
  );

const applySheetStyle = (sheet: XLSX.WorkSheet, columns: ExportColumn[]) => {
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(16, column.label.length + 5) }));
  sheet['!views'] = [{ RTL: true }];
};

const safeSheetName = (name: string, fallback: string) => {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31);
  return cleaned || fallback;
};

export function createExcelWorkbook(request: ExcelWorkbookRequest): Uint8Array {
  const { title, subtitle, columns, rows, companyName, kpis, sheets } = request;
  const header = columns.map((column) => column.label);
  const body = sheetBody(columns, rows);
  const meta: unknown[][] = [
    [companyName],
    [title],
    [subtitle],
    [],
  ];

  if (kpis && kpis.length > 0) {
    meta.push(['المؤشرات الإجمالية:']);
    meta.push(kpis.map((kpi) => `${kpi.label}: ${kpi.value}`));
    meta.push([]);
  }

  const sheet = XLSX.utils.aoa_to_sheet([...meta, header, ...body]);
  applySheetStyle(sheet, columns);

  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(book, sheet, 'التقرير');

  (sheets || []).forEach((extra, index) => {
    const extraSheet = XLSX.utils.aoa_to_sheet([
      [extra.name],
      [],
      extra.columns.map((column) => column.label),
      ...sheetBody(extra.columns, extra.rows),
    ]);
    applySheetStyle(extraSheet, extra.columns);
    XLSX.utils.book_append_sheet(book, extraSheet, safeSheetName(extra.name, `بيانات ${index + 2}`));
  });

  const result = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}
