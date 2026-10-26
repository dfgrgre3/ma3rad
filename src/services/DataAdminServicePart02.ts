import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { localDateString } from '../utils/date';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import type { TableInfo, ColumnInfo, StorageStats, TableCount, DeleteResult } from './dataAdminTypes';
import { IDENTIFIER, CORE_PROTECTED_TABLES } from './dataAdminConstants';
import { DataAdminServicePart01 } from './DataAdminServicePart01';

export class DataAdminServicePart02 extends DataAdminServicePart01 {
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
