import type { ColumnInfo, StorageStats, TableCount, TableInfo } from '../../../types/admin/dataAdmin';
import { DataAdminBaseService } from './DataAdminBaseService';
import { CORE_PROTECTED_TABLES, IDENTIFIER } from './dataAdminConstants';
import { AuditService } from '../security/AuditService';

export class DataAdminBrowseService extends DataAdminBaseService {
  listTables(): TableInfo[] {
    this.require('admin.data');
    const tables = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    );
    return tables.map(({ name }) => {
      if (!IDENTIFIER.test(name)) return { name, rows: 0 };
      const count = this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${name}"`)[0]?.c ?? 0;
      return { name, rows: Number(count) };
    });
  }

  getColumns(table: string): ColumnInfo[] {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const rows = this.db.query<{ name: string; type: string; notnull: number; pk: number; dfltValue?: string | null }>(
      `PRAGMA table_info("${table}")`,
    );
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      notNull: Boolean(row.notnull),
      primaryKey: Boolean(row.pk),
      defaultValue: row.dfltValue ?? null,
    }));
  }

  getRows(table: string, options: { limit?: number; offset?: number; search?: string } = {}): any[] {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const limit = Math.min(Math.max(Math.floor(options.limit || 50), 1), 500);
    const offset = Math.max(Math.floor(options.offset || 0), 0);
    return this.db.query(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`, [limit, offset]);
  }

  getStorageStats(): StorageStats {
    this.require('admin.data');
    const binary = this.db.exportDatabaseBinary();
    let localStorageBytes = 0;
    try {
      const raw = localStorage.getItem('ceramics_erp_sqlite_db') || '';
      localStorageBytes = Math.ceil((raw.length * 3) / 4);
    } catch {
      localStorageBytes = 0;
    }
    const tables = this.listTables();
    return {
      databaseBytes: binary.length,
      localStorageBytes,
      tableCount: tables.length,
      totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    };
  }

  integrityCheck(): string[] {
    this.require('admin.data');
    const rows = this.db.query<Record<string, unknown>>('PRAGMA integrity_check');
    return rows.map((row) => String(Object.values(row)[0]));
  }

  vacuum(): void {
    const user = this.require('admin.data');
    this.db.getDatabase().exec('VACUUM;');
    this.db.saveToStorage();
    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: 'ضغط قاعدة البيانات (VACUUM)',
      module: 'ADMIN',
    });
  }

  getPrimaryKeyColumns(table: string): string[] {
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const rows = this.db.query<{ name: string; pk: number }>(`PRAGMA table_info("${table}")`);
    return rows
      .filter((row) => Number(row.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((row) => String(row.name));
  }

  listDeletableTables(): TableInfo[] {
    return this.listTables().filter((table) => !CORE_PROTECTED_TABLES.includes(table.name));
  }

  countTableRows(tables: string[]): TableCount[] {
    this.require('admin.data');
    return tables.map((table) => {
      if (!IDENTIFIER.test(table)) throw new Error(`اسم الجدول غير صالح: ${table}`);
      const rows = Number(this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`)[0]?.c ?? 0);
      return { table, rows };
    });
  }
}
