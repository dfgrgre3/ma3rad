import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { localDateString } from '../utils/date';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';

export interface TableInfo {
  name: string;
  rows: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
}

export interface StorageStats {
  databaseBytes: number;
  localStorageBytes: number;
  tableCount: number;
  totalRows: number;
}

export interface TableCount {
  table: string;
  rows: number;
}

export interface DeleteResult {
  deleted: number;
  tables: TableCount[];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Core tables that keep the application usable and can never be cleared from the UI. */
export const CORE_PROTECTED_TABLES = [
  'users',
  'roles',
  'role_permissions',
  'permissions',
  'user_permissions',
  'system_settings',
  'schema_migrations',
];

/** Kept selected by default during a full reset so the audit trail and numbering survive. */
export const RESET_KEEP_BY_DEFAULT = [
  'audit_logs',
  'backup_history',
  'sequence_counters',
  'notification_preferences',
  'dynamic_entity_types',
];

/**
 * Data inspection, maintenance and guarded deletion tools for the admin center.
 * Never accepts arbitrary SQL; identifiers are validated and values parameterised.
 */
export class DataAdminService {
  private db = DatabaseManager.getInstance();

  private require(permission: string) {
    const user = AuthService.requireAuth();
    PermissionService.require(user, permission);
    return user;
  }

  public listTables(): TableInfo[] {
    this.require('admin.data');
    const tables = this.db.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`
    );
    return tables.map((t) => {
      if (!IDENTIFIER.test(t.name)) return { name: t.name, rows: 0 };
      const count = this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${t.name}"`)[0]?.c ?? 0;
      return { name: t.name, rows: Number(count) };
    });
  }

  public getColumns(table: string): ColumnInfo[] {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const rows = this.db.query<any>(`PRAGMA table_info("${table}")`);
    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      notNull: Boolean(r.notnull),
      primaryKey: Boolean(r.pk),
      defaultValue: r.dfltValue ?? null,
    }));
  }

  public getRows(table: string, options: { limit?: number; offset?: number; search?: string } = {}): any[] {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const limit = Math.min(Math.max(Math.floor(options.limit || 50), 1), 500);
    const offset = Math.max(Math.floor(options.offset || 0), 0);
    return this.db.query(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`, [limit, offset]);
  }

  public getStorageStats(): StorageStats {
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
      totalRows: tables.reduce((sum, t) => sum + t.rows, 0),
    };
  }

  public integrityCheck(): string[] {
    this.require('admin.data');
    const rows = this.db.query<any>('PRAGMA integrity_check');
    return rows.map((r) => String(Object.values(r)[0]));
  }

  public vacuum(): void {
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

  public exportTableJson(table: string): { fileName: string; content: string } {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const rows = this.db.query(`SELECT * FROM "${table}"`);
    return {
      fileName: `${table}_${localDateString()}.json`,
      content: JSON.stringify(rows, null, 2),
    };
  }

  public exportAllJson(): { fileName: string; content: string } {
    this.require('admin.data');
    const payload: Record<string, unknown[]> = {};
    for (const table of this.listTables()) {
      if (!IDENTIFIER.test(table.name)) continue;
      payload[table.name] = this.db.query(`SELECT * FROM "${table.name}"`);
    }
    return {
      fileName: `ceramisys_full_export_${localDateString()}.json`,
      content: JSON.stringify(payload, null, 2),
    };
  }

  // ─── Destructive maintenance ───────────────────────────────────────────────
  // All deletion goes through parameterised / validated identifiers and always
  // keeps core tables (users, roles, permissions, settings) intact.

  private assertDeletableTable(table: string): void {
    if (!IDENTIFIER.test(table)) throw new Error(`اسم الجدول غير صالح: ${table}`);
    if (CORE_PROTECTED_TABLES.includes(table)) throw new Error(`لا يمكن تفريغ جدول أساسي: ${table}`);
  }

  public getPrimaryKeyColumns(table: string): string[] {
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const rows = this.db.query<any>(`PRAGMA table_info("${table}")`);
    const keys = rows.filter((r) => Number(r.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk));
    return keys.map((r) => String(r.name));
  }

  private logDeletion(user: { id: string; fullName: string }, description: string, details: string): void {
    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: description,
      module: 'ADMIN',
      newValues: details,
    });
  }

  /** Every table that may be cleared from the UI, with its current row count. */
  public listDeletableTables(): TableInfo[] {
    return this.listTables().filter((table) => !CORE_PROTECTED_TABLES.includes(table.name));
  }

  public countTableRows(tables: string[]): TableCount[] {
    this.require('admin.data');
    return tables.map((table) => {
      if (!IDENTIFIER.test(table)) throw new Error(`اسم الجدول غير صالح: ${table}`);
      const rows = Number(this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`)[0]?.c ?? 0);
      return { table, rows };
    });
  }

  /** Clear all rows of the given tables inside one transaction (structure is kept). */
  public deleteTableData(tables: string[]): DeleteResult {
    const user = this.require('admin.data');
    const targets = [...new Set(tables)];
    if (targets.length === 0) throw new Error('لم يتم تحديد أي جدول للحذف.');
    targets.forEach((table) => this.assertDeletableTable(table));

    const result = this.db.executeTransaction((manager) => {
      // Defer FK checks until commit so table order does not matter.
      manager.run('PRAGMA defer_foreign_keys = ON');
      const detail: TableCount[] = [];
      let deleted = 0;
      for (const table of targets) {
        const rows = Number(manager.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`)[0]?.c ?? 0);
        manager.run(`DELETE FROM "${table}"`);
        detail.push({ table, rows });
        deleted += rows;
      }
      return { deleted, tables: detail };
    });

    this.logDeletion(
      user,
      `حذف بيانات ${result.tables.length} جدول`,
      JSON.stringify(result.tables)
    );
    return result;
  }

  /** Delete specific rows identified by their primary key values. */
  public deleteRows(table: string, keys: Array<Record<string, unknown>>): DeleteResult {
    const user = this.require('admin.data');
    this.assertDeletableTable(table);
    if (keys.length === 0) throw new Error('لم يتم تحديد أي سجل للحذف.');

    const pkColumns = this.getPrimaryKeyColumns(table);
    if (pkColumns.length === 0) throw new Error('لا يمكن تحديد السجلات: الجدول بدون مفتاح أساسي.');

    const deleted = this.db.executeTransaction((manager) => {
      let total = 0;
      for (const key of keys) {
        if (pkColumns.some((column) => key[column] === undefined || key[column] === null)) {
          throw new Error('بيانات المفتاح الأساسي غير مكتملة.');
        }
        const where = pkColumns.map((column) => `"${column}" = ?`).join(' AND ');
        const before = Number(
          manager.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}" WHERE ${where}`, pkColumns.map((c) => key[c]))[0]?.c ?? 0
        );
        manager.run(`DELETE FROM "${table}" WHERE ${where}`, pkColumns.map((c) => key[c]));
        total += before;
      }
      return total;
    });

    this.logDeletion(user, `حذف ${deleted} سجل من ${table}`, JSON.stringify(keys.slice(0, 50)));
    return { deleted, tables: [{ table, rows: deleted }] };
  }

  public countByDateRange(table: string, column: string, from: string, to: string): number {
    this.require('admin.data');
    if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
    const valid = this.getColumns(table).some((c) => c.name === column);
    if (!valid) throw new Error(`العمود غير موجود في الجدول: ${column}`);
    const row = this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM "${table}" WHERE date("${column}") BETWEEN date(?) AND date(?)`,
      [from, to]
    )[0];
    return Number(row?.c ?? 0);
  }

  /** Delete rows whose date column falls inside the inclusive [from, to] range. */
  public deleteByDateRange(table: string, column: string, from: string, to: string): DeleteResult {
    const user = this.require('admin.data');
    this.assertDeletableTable(table);
    if (!from || !to) throw new Error('يجب تحديد تاريخ البداية والنهاية.');
    if (from > to) throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');

    const deleted = this.db.executeTransaction((manager) => {
      manager.run('PRAGMA defer_foreign_keys = ON');
      const before = Number(
        manager.query<{ c: number }>(
          `SELECT COUNT(*) AS c FROM "${table}" WHERE date("${column}") BETWEEN date(?) AND date(?)`,
          [from, to]
        )[0]?.c ?? 0
      );
      manager.run(
        `DELETE FROM "${table}" WHERE date("${column}") BETWEEN date(?) AND date(?)`,
        [from, to]
      );
      return before;
    });

    this.logDeletion(user, `حذف ${deleted} سجل من ${table} بين ${from} و ${to}`, JSON.stringify({ table, column, from, to }));
    return { deleted, tables: [{ table, rows: deleted }] };
  }
}
