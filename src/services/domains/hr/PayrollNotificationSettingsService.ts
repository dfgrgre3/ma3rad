import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { User } from '../../../types/auth/identity';

export interface PayrollNotificationSettings {
  branchId: string;
  branchName: string;
  enabled: boolean;
  dueHorizonDays: number;
  overdueHorizonDays: number;
  notifyDue: boolean;
  notifyOverdue: boolean;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface PayrollNotificationSettingsInput {
  branchId: string;
  enabled?: boolean;
  dueHorizonDays?: number;
  overdueHorizonDays?: number;
  notifyDue?: boolean;
  notifyOverdue?: boolean;
}

function validateSettings(input: PayrollNotificationSettingsInput): void {
  if (input.dueHorizonDays !== undefined) {
    if (!Number.isInteger(input.dueHorizonDays) || input.dueHorizonDays < 1 || input.dueHorizonDays > 30) {
      throw new Error('أيام التنبيه المبكر يجب أن تكون بين 1 و 30 يوماً.');
    }
  }
  if (input.overdueHorizonDays !== undefined) {
    if (!Number.isInteger(input.overdueHorizonDays) || input.overdueHorizonDays < 0 || input.overdueHorizonDays > 30) {
      throw new Error('أيام التنبيه المتأخر يجب أن تكون بين 0 و 30 يوماً.');
    }
  }
}

export class PayrollNotificationSettingsService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireManage(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'employees.payroll.manage');
    return actor;
  }

  private static requireView(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'employees.payroll.view', 'employees.payroll.manage', 'employees.view',
    ]);
    return actor;
  }

  /** الحصول على إعدادات فرع واحد */
  static getSettings(branchId: string): PayrollNotificationSettings | null {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);

    const row = this.db.query<any>(`
      SELECT pns.*, b.name AS branchName, u.full_name AS updatedByName
      FROM payroll_notification_settings pns
      JOIN branches b ON b.id = pns.branch_id
      LEFT JOIN users u ON u.id = pns.updated_by
      WHERE pns.branch_id = ?
    `, [branchId])[0];

    if (!row) return null;

    return {
      branchId: row.branch_id,
      branchName: row.branchName,
      enabled: Boolean(row.enabled),
      dueHorizonDays: Number(row.due_horizon_days),
      overdueHorizonDays: Number(row.overdue_horizon_days),
      notifyDue: Boolean(row.notify_due),
      notifyOverdue: Boolean(row.notify_overdue),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by || undefined,
      updatedByName: row.updatedByName || undefined,
    };
  }

  /** الحصول على إعدادات جميع الفروع المسموحة للمستخدم */
  static getAllSettings(): PayrollNotificationSettings[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('pns.branch_id', undefined, actor);

    const rows = this.db.query<any>(`
      SELECT pns.*, b.name AS branchName, u.full_name AS updatedByName
      FROM payroll_notification_settings pns
      JOIN branches b ON b.id = pns.branch_id
      LEFT JOIN users u ON u.id = pns.updated_by
      WHERE ${scope.clause}
      ORDER BY b.name
    `, [...scope.params]);

    return rows.map((row) => ({
      branchId: row.branch_id,
      branchName: row.branchName,
      enabled: Boolean(row.enabled),
      dueHorizonDays: Number(row.due_horizon_days),
      overdueHorizonDays: Number(row.overdue_horizon_days),
      notifyDue: Boolean(row.notify_due),
      notifyOverdue: Boolean(row.notify_overdue),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by || undefined,
      updatedByName: row.updatedByName || undefined,
    }));
  }

  /** إنشاء أو تحديث إعدادات فرع */
  static upsertSettings(input: PayrollNotificationSettingsInput): PayrollNotificationSettings {
    const actor = this.requireManage();
    validateSettings(input);
    this.branchAccess.requireBranchAccess(input.branchId, actor);

    const existing = this.db.query<any>(
      'SELECT branch_id FROM payroll_notification_settings WHERE branch_id = ?',
      [input.branchId]
    )[0];

    const now = new Date().toISOString();

    if (existing) {
      // تحديث
      const updates: string[] = [];
      const params: any[] = [];

      if (input.enabled !== undefined) { updates.push('enabled = ?'); params.push(input.enabled ? 1 : 0); }
      if (input.dueHorizonDays !== undefined) { updates.push('due_horizon_days = ?'); params.push(input.dueHorizonDays); }
      if (input.overdueHorizonDays !== undefined) { updates.push('overdue_horizon_days = ?'); params.push(input.overdueHorizonDays); }
      if (input.notifyDue !== undefined) { updates.push('notify_due = ?'); params.push(input.notifyDue ? 1 : 0); }
      if (input.notifyOverdue !== undefined) { updates.push('notify_overdue = ?'); params.push(input.notifyOverdue ? 1 : 0); }

      if (updates.length === 0) {
        return this.getSettings(input.branchId)!;
      }

      updates.push('updated_at = ?', 'updated_by = ?');
      params.push(now, actor.id, input.branchId);

      this.db.run(
        `UPDATE payroll_notification_settings SET ${updates.join(', ')} WHERE branch_id = ?`,
        params
      );
    } else {
      // إنشاء جديد
      this.db.run(
        `INSERT INTO payroll_notification_settings (
          branch_id, enabled, due_horizon_days, overdue_horizon_days,
          notify_due, notify_overdue, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.branchId,
          input.enabled !== undefined ? (input.enabled ? 1 : 0) : 1,
          input.dueHorizonDays ?? 7,
          input.overdueHorizonDays ?? 0,
          input.notifyDue !== undefined ? (input.notifyDue ? 1 : 0) : 1,
          input.notifyOverdue !== undefined ? (input.notifyOverdue ? 1 : 0) : 1,
          actor.id,
          now,
        ]
      );
    }

    return this.getSettings(input.branchId)!;
  }

  /** الحصول على الإعدادات الفعالة لفرع (مع القيم الافتراضية إذا لم توجد) */
  static getEffectiveSettings(branchId: string): PayrollNotificationSettings {
    const settings = this.getSettings(branchId);
    if (settings) return settings;

    // إرجاع القيم الافتراضية
    const branch = this.db.query<{ name: string }>(
      'SELECT name FROM branches WHERE id = ?',
      [branchId]
    )[0];

    return {
      branchId,
      branchName: branch?.name || 'غير معروف',
      enabled: true,
      dueHorizonDays: 7,
      overdueHorizonDays: 0,
      notifyDue: true,
      notifyOverdue: true,
      updatedAt: new Date().toISOString(),
    };
  }

  /** التحقق مما إذا كان يجب إرسال تنبيه مستحق قريباً لفرع معين */
  static shouldNotifyDue(branchId: string): boolean {
    const settings = this.getEffectiveSettings(branchId);
    return settings.enabled && settings.notifyDue;
  }

  /** التحقق مما إذا كان يجب إرسال تنبيه متأخر لفرع معين */
  static shouldNotifyOverdue(branchId: string): boolean {
    const settings = this.getEffectiveSettings(branchId);
    return settings.enabled && settings.notifyOverdue;
  }

  /** الحصول على فترة التنبيه المبكر لفرع معين */
  static getDueHorizonDays(branchId: string): number {
    return this.getEffectiveSettings(branchId).dueHorizonDays;
  }

  /** الحصول على فترة التنبيه المتأخر لفرع معين */
  static getOverdueHorizonDays(branchId: string): number {
    return this.getEffectiveSettings(branchId).overdueHorizonDays;
  }
}