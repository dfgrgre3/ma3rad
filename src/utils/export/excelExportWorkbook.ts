import * as XLSX from 'xlsx';
import type { ExportColumn } from './exportTypes';

export interface ExcelWorkbookRequest {
  title: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  companyName: string;
  kpis?: Array<{ label: string; value: string | number; hint?: string }>;
}

export function createExcelWorkbook(request: ExcelWorkbookRequest): Uint8Array {
  const { title, subtitle, columns, rows, companyName, kpis } = request;
  const header = columns.map((column) => column.label);
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      return value === null || value === undefined ? '' : value;
    })
  );
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
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(16, column.label.length + 5) }));
  sheet['!views'] = [{ RTL: true }];

  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(book, sheet, 'التقرير');
  const result = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}
