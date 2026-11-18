import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { writeAuditLog } from '../../security/auditWriter';
import { AuthService } from '../AuthService';
import { PermissionService } from '../PermissionService';
import { AuthorizationService } from '../authorization/AuthorizationService';
import { v4 as uuidv4 } from 'uuid';

export interface AmountLimit {
  id: string;
  permissionCode: string;
  scopeType: 'ROLE' | 'USER';
  scopeId: string;
  maxAmount: number;
  currency: string;
  onExceed: 'DENY' | 'REQUIRE_APPROVAL';
}

export interface WarehouseGrant {
  userId: string;
  warehouseId: string;
  warehouseName?: string;
}

/**
 * إدارة أبعاد التفويض الإضافية من الواجهة (المرحلة 5):
 * حدود مبالغ الصلاحيات (permission_amount_limits) ومنح مخازن المستخدمين
 * (user_warehouse_grants). كل تعديل يُسجَّل في audit_logs.
 */
export class AuthorizationAdminService {
  private static db() {
    return DatabaseManager.getInstance();
  }

  private static audit(action: string, recordId: string | null, oldValues: unknown, newValues: unknown): void {
    try {
      const actor = AuthService.getCurrentUser();
      writeAuditLog({
        userId: actor?.id || 'system',
        userName: actor?.fullName || 'النظام',
        action,
        module: 'ROLES',
        recordId: recordId || undefined,
        oldValues: oldValues == null ? undefined : JSON.stringify(oldValues),
        newValues: newValues == null ? undefined : JSON.stringify(newValues),
      });
    } catch {
      // auditing must never break the operation
    }
  }

  private static requireManage(): void {
    PermissionService.require(AuthService.getCurrentUser(), 'roles.manage');
  }

  // ── حدود المبالغ ──────────────────────────────────────────────

  public static listAmountLimits(scopeType?: 'ROLE' | 'USER', scopeId?: string): AmountLimit[] {
    const db = this.db();
    let sql = `SELECT id, permission_code AS permissionCode, scope_type AS scopeType,
                      scope_id AS scopeId, max_amount / 100.0 AS maxAmount, currency,
                      on_exceed AS onExceed
               FROM permission_amount_limits`;
    const params: string[] = [];
    const clauses: string[] = [];
    if (scopeType) { clauses.push('scope_type = ?'); params.push(scopeType); }
    if (scopeId) { clauses.push('scope_id = ?'); params.push(scopeId); }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY scope_type, scope_id, permission_code';
    return db.query<AmountLimit>(sql, params);
  }

  public static upsertAmountLimit(input: {
    permissionCode: string;
    scopeType: 'ROLE' | 'USER';
    scopeId: string;
    maxAmount: number;
    currency?: string;
    onExceed: 'DENY' | 'REQUIRE_APPROVAL';
  }): void {
    this.requireManage();
    const code = input.permissionCode.trim();
    if (!code) throw new Error('كود الصلاحية مطلوب.');
    if (!Number.isFinite(input.maxAmount) || input.maxAmount < 0) {
      throw new Error('الحد الأقصى يجب أن يكون رقمًا غير سالب.');
    }
    const db = this.db();
    const before = db.query<AmountLimit>(
      `SELECT id, permission_code AS permissionCode, scope_type AS scopeType, scope_id AS scopeId,
              max_amount / 100.0 AS maxAmount, currency, on_exceed AS onExceed
       FROM permission_amount_limits
       WHERE permission_code = ? AND scope_type = ? AND scope_id = ?`,
      [code, input.scopeType, input.scopeId]
    )[0] ?? null;
    db.run(
      `INSERT INTO permission_amount_limits
         (id, permission_code, scope_type, scope_id, max_amount, currency, on_exceed)
       VALUES (?, ?, ?, ?, ROUND(?*100), ?, ?)
       ON CONFLICT(permission_code, scope_type, scope_id) DO UPDATE SET
         max_amount = excluded.max_amount,
         currency = excluded.currency,
         on_exceed = excluded.on_exceed`,
      [
        `lim_${uuidv4().substring(0, 8)}`, code, input.scopeType, input.scopeId,
        input.maxAmount, input.currency?.trim() || 'EGP', input.onExceed,
      ]
    );
    this.audit('تعديل حد مبلغ صلاحية', code, before, input);
  }

  public static deleteAmountLimit(id: string): void {
    this.requireManage();
    const db = this.db();
    const before = db.query<AmountLimit>(
      `SELECT id, permission_code AS permissionCode, scope_type AS scopeType, scope_id AS scopeId,
              max_amount / 100.0 AS maxAmount, currency, on_exceed AS onExceed
       FROM permission_amount_limits WHERE id = ?`,
      [id]
    )[0] ?? null;
    db.run('DELETE FROM permission_amount_limits WHERE id = ?', [id]);
    this.audit('حذف حد مبلغ صلاحية', id, before, null);
  }

  // ── منح مخازن المستخدمين ──────────────────────────────────────

  public static listWarehouseGrants(userId: string): WarehouseGrant[] {
    return this.db().query<WarehouseGrant>(
      `SELECT g.user_id AS userId, g.warehouse_id AS warehouseId, w.name AS warehouseName
       FROM user_warehouse_grants g
       LEFT JOIN warehouses w ON w.id = g.warehouse_id
       WHERE g.user_id = ? ORDER BY w.name`,
      [userId]
    );
  }

  /** مجموعة فارغة = غير مقيّد؛ غير فارغة = قائمة بيضاء. */
  public static setWarehouseGrants(userId: string, warehouseIds: string[]): void {
    this.requireManage();
    const db = this.db();
    const before = this.listWarehouseGrants(userId).map((g) => g.warehouseId);
    db.executeTransaction(() => {
      db.run('DELETE FROM user_warehouse_grants WHERE user_id = ?', [userId]);
      for (const warehouseId of warehouseIds) {
        db.run(
          'INSERT OR IGNORE INTO user_warehouse_grants (user_id, warehouse_id) VALUES (?, ?)',
          [userId, warehouseId]
        );
      }
    });
    AuthorizationService.invalidate(userId);
    this.audit('تعديل منح مخازن المستخدم', userId, before, warehouseIds);
  }

  public static listWarehouses(): { id: string; name: string }[] {
    return this.db().query<{ id: string; name: string }>(
      'SELECT id, name FROM warehouses ORDER BY name'
    );
  }
}
