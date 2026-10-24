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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Read-only data inspection + maintenance tools for the admin center.
 * Never accepts arbitrary SQL or unquoted identifiers from the UI.
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
}
