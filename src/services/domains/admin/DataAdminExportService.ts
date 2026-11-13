import { localDateString } from '../../../utils/shared/date';
import { AuditService } from '../security/AuditService';
import { DataAdminBaseService } from './DataAdminBaseService';
import {
  assertExportableTable,
  EXPORT_PROTECTED_TABLES,
  IDENTIFIER,
  isSensitiveExportColumn,
} from './dataAdminConstants';

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
    const user = this.require('admin.data.export');
    assertExportableTable(table);
    const sheet = this.getExportSheet(table);
    this.logExport(user, 'تصدير جدول بيانات', [table], sheet.rows.length);
    return {
      fileName: `${table}_${localDateString()}.xlsx`,
      sheets: [sheet],
    };
  }

  exportAllData(): { fileName: string; sheets: ExportSheet[] } {
    const user = this.require('admin.data.export');
    const tables = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    );
    const exportable = tables
      .filter((table) => IDENTIFIER.test(table.name))
      .filter((table) => !EXPORT_PROTECTED_TABLES.has(table.name));
    const sheets = exportable.map((table) => this.getExportSheet(table.name));
    this.logExport(
      user,
      'تصدير جميع بيانات النظام',
      sheets.map((sheet) => sheet.name),
      sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
    );
    return {
      fileName: `ceramisys_full_export_${localDateString()}.xlsx`,
      sheets,
    };
  }

  private getExportSheet(table: string): ExportSheet {
    assertExportableTable(table);
    const allColumns = this.db.query<{ name: string }>(`PRAGMA table_info("${table}")`).map((column) => column.name);
    const columns = allColumns.filter((column) => !isSensitiveExportColumn(column));
    if (columns.length === 0) {
      return { name: table, columns: [], rows: [] };
    }
    const selected = columns.map((column) => `"${column}"`).join(', ');
    const rawRows = this.db.query<Record<string, unknown>>(`SELECT ${selected} FROM "${table}"`);
    const rows = rawRows.map((row) => Object.fromEntries(
      columns.map((column) => [column, row[queryColumnName(column)] ?? null]),
    ));
    return { name: table, columns, rows };
  }

  private logExport(
    user: { id: string; fullName: string },
    description: string,
    tables: string[],
    rowCount: number,
  ): void {
    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: description,
      module: 'ADMIN',
      newValues: JSON.stringify({
        kind: 'DATA_EXPORT',
        tables,
        rowCount,
        exportedAt: new Date().toISOString(),
      }),
    });
  }
}