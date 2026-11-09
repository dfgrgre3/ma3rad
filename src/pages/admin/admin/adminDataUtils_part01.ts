import * as XLSX from 'xlsx';

export const MAX_ADMIN_DATA_IMPORT_FILE_SIZE = 100 * 1024 * 1024;

export interface ExportSheet {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export function downloadExcel(fileName: string, sheets: ExportSheet[]): void {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const sheet of sheets) {
    const baseName = sheet.name.replace(/[\\/?*:[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet';
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
