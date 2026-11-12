import { localDateString } from '../../../utils/shared/date';
import { DataAdminBaseService } from './DataAdminBaseService';
import { IDENTIFIER } from './dataAdminConstants';

type ExportSheet = {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

function queryColumnName(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase());
}

export class DataAdminExportService extends DataAdminBaseService {
  exportTableData(table: string): { fileName: string; sheets: ExportSheet[] } {
    this.require('admin.data.export');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    return {
      fileName: `${table}_${localDateString()}.xlsx`,
      sheets: [this.getExportSheet(table)],
    };
  }

  exportAllData(): { fileName: string; sheets: ExportSheet[] } {
    this.require('admin.data.export');
    const tables = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    );
    return {
      fileName: `ceramisys_full_export_${localDateString()}.xlsx`,
      sheets: tables.filter((table) => IDENTIFIER.test(table.name)).map((table) => this.getExportSheet(table.name)),
    };
  }

  private getExportSheet(table: string): ExportSheet {
    const columns = this.db.query<{ name: string }>(`PRAGMA table_info("${table}")`).map((column) => column.name);
    const rawRows = this.db.query<Record<string, unknown>>(`SELECT * FROM "${table}"`);
    const rows = rawRows.map((row) => Object.fromEntries(
      columns.map((column) => [column, row[queryColumnName(column)] ?? null]),
    ));
    return { name: table, columns, rows };
  }
}
