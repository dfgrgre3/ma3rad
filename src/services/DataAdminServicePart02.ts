import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { localDateString } from '../utils/date';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import type { TableInfo, ColumnInfo, StorageStats, TableCount, DeleteResult } from './dataAdminTypes';
import { IDENTIFIER, CORE_PROTECTED_TABLES } from './dataAdminConstants';
import { DataAdminServicePart01 } from './DataAdminServicePart01';
import { BackupService } from './BackupService';

export class DataAdminServicePart02 extends DataAdminServicePart01 {
private async prepareDeletion(reason: string): Promise<{ id: string; fullName: string; reason: string }> {
    const user = this.require('admin.data.delete');
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5) throw new Error('سبب الحذف مطلوب (5 أحرف على الأقل).');
    const snapshot = await new BackupService().createLocalSnapshot('pre_delete', user);
    if (!snapshot.ok) throw new Error(`أُلغيت العملية لأن النسخة الاحتياطية السابقة للحذف فشلت: ${snapshot.error || 'unknown error'}`);
    return { ...user, reason: normalizedReason };
  }

public async deleteTableData(tables: string[], reason: string): Promise<DeleteResult> {
    const user = await this.prepareDeletion(reason);
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
      JSON.stringify({ tables: result.tables, reason: user.reason })
    );
    await this.db.flush();
    return result;
  }

public async deleteRows(table: string, keys: Array<Record<string, unknown>>, reason: string): Promise<DeleteResult> {
    const user = await this.prepareDeletion(reason);
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

    this.logDeletion(user, `حذف ${deleted} سجل من ${table}`, JSON.stringify({ keys: keys.slice(0, 50), reason: user.reason }));
    await this.db.flush();
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

public async deleteByDateRange(table: string, column: string, from: string, to: string, reason: string): Promise<DeleteResult> {
    const user = await this.prepareDeletion(reason);
    this.assertDeletableTable(table);
    if (!from || !to) throw new Error('يجب تحديد تاريخ البداية والنهاية.');
    if (from > to) throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');

    const deleted = this.db.executeTransaction((manager) => {
      if (!IDENTIFIER.test(table)) throw new Error('اسم الجدول غير صالح.');
      if (!this.getColumns(table).some((c) => c.name === column)) {
        throw new Error(`العمود غير موجود في الجدول: ${column}`);
      }
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

    this.logDeletion(user, `حذف ${deleted} سجل من ${table} بين ${from} و ${to}`, JSON.stringify({ table, column, from, to, reason: user.reason }));
    await this.db.flush();
    return { deleted, tables: [{ table, rows: deleted }] };
  }
}
