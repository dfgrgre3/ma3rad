import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import type { User } from '../types';

export interface BranchSqlScope {
  clause: string;
  params: string[];
}

export class BranchAccessService {
  private db = DatabaseManager.getInstance();

  private actor(): User {
    return AuthService.requireAuth();
  }

  public getAccessibleBranchIds(user = this.actor()): string[] | null {
    if (user.role === 'ADMIN') return null;
    const scope = this.db.query<{ branchScope: string }>(
      'SELECT branch_scope AS branchScope FROM users WHERE id = ? AND is_active = 1',
      [user.id]
    )[0]?.branchScope;
    if (!scope) throw new Error('تعذر تحديد نطاق الفروع للمستخدم الحالي.');
    if (scope === 'ALL') {
      PermissionService.require(user, 'branches.access_all');
      return null;
    }
    return this.db.query<{ branchId: string }>(
      `SELECT ub.branch_id AS branchId
       FROM users_branches ub
       JOIN branches b ON b.id = ub.branch_id
       WHERE ub.user_id = ?`,
      [user.id]
    ).map(row => row.branchId);
  }

  public hasBranchAccess(branchId: string, user = this.actor()): boolean {
    const allowed = this.getAccessibleBranchIds(user);
    if (allowed === null) return true;
    return allowed.includes(branchId);
  }

  public requireBranchAccess(branchId: string, user = this.actor()): void {
    if (!this.hasBranchAccess(branchId, user)) {
      throw new Error('ليس لديك صلاحية الوصول إلى بيانات هذا الفرع.');
    }
  }

  public requireRegisterAccess(registerId: string, user = this.actor(), expectedBranchId?: string): string {
    const register = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM cash_registers WHERE id = ? AND is_active = 1',
      [registerId]
    )[0];
    if (!register) throw new Error('الخزينة المحددة غير موجودة أو غير نشطة.');
    if (!register.branchId) throw new Error('الخزينة غير مرتبطة بفرع.');
    this.requireBranchAccess(register.branchId, user);
    if (expectedBranchId && register.branchId !== expectedBranchId) {
      throw new Error('يجب استخدام خزينة تابعة لفرع المعاملة.');
    }
    return register.branchId;
  }

  public requireShiftAccess(
    shiftId: string,
    user = this.actor(),
    expectedRegisterId?: string
  ): { branchId: string; registerId: string; status: string } {
    const shift = this.db.query<{ branchId: string | null; registerId: string; status: string }>(
      `SELECT cs.branch_id AS branchId, cs.register_id AS registerId, cs.status
       FROM cash_shifts cs WHERE cs.id = ?`,
      [shiftId]
    )[0];
    if (!shift) throw new Error('الوردية المحددة غير موجودة.');
    const branchId = this.requireRegisterAccess(shift.registerId, user, shift.branchId || undefined);
    if (expectedRegisterId && shift.registerId !== expectedRegisterId) {
      throw new Error('الوردية لا تتبع الخزينة المحددة.');
    }
    return { branchId, registerId: shift.registerId, status: shift.status };
  }

  public getDefaultRegisterId(branchId: string, user = this.actor()): string {
    this.requireBranchAccess(branchId, user);
    const register = this.db.query<{ id: string }>(
      `SELECT id FROM cash_registers
       WHERE branch_id = ? AND is_active = 1
       ORDER BY is_default DESC, id ASC LIMIT 1`,
      [branchId]
    )[0];
    if (!register) throw new Error('لا توجد خزينة نشطة مرتبطة بفرع المعاملة.');
    this.requireRegisterAccess(register.id, user, branchId);
    return register.id;
  }

  public getDefaultAccessibleBranchId(user = this.actor()): string {
    const allowed = this.getAccessibleBranchIds(user);
    const defaultBranch = this.db.query<{ id: string }>(
      `SELECT id FROM branches WHERE is_main = 1 AND is_active = 1
       ${allowed === null ? '' : `AND id IN (${allowed.map(() => '?').join(', ') || "''"})`}
       ORDER BY id LIMIT 1`,
      allowed ?? []
    )[0]?.id;
    if (defaultBranch) return defaultBranch;
    if (allowed?.length) return allowed[0];
    throw new Error('لا يوجد فرع متاح للمستخدم الحالي.');
  }

  public requireWarehouseAccess(warehouseId: string, user = this.actor()): string {
    const warehouse = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM warehouses WHERE id = ? AND is_active = 1',
      [warehouseId]
    )[0];
    if (!warehouse) throw new Error('المخزن المحدد غير موجود أو غير نشط.');

    const branchIds = warehouse.branchId
      ? [warehouse.branchId]
      : this.db.query<{ branchId: string }>(
        `SELECT branch_id AS branchId FROM branch_warehouses
         WHERE warehouse_id = ? ORDER BY is_primary DESC, branch_id ASC`,
        [warehouseId]
      ).map(row => row.branchId);
    if (!branchIds.length) throw new Error('المخزن غير مرتبط بفرع.');

    const allowed = this.getAccessibleBranchIds(user);
    const branchId = allowed === null ? branchIds[0] : branchIds.find(id => allowed.includes(id));
    if (!branchId) throw new Error('ليس لديك صلاحية الوصول إلى المخزن المحدد.');
    return branchId;
  }

  /**
   * Branch scope for tables that reach a branch through a warehouse join.
   * `warehouseAlias` must point at the joined `warehouses` row, and
   * `branchWarehousesAlias` at an optional `branch_warehouses` join used as a fallback
   * for warehouses without a direct `branch_id`.
   */
  public warehouseBranchScope(
    warehouseAlias = 'w',
    branchWarehousesAlias?: string,
    user = this.actor()
  ): BranchSqlScope {
    const fallback = branchWarehousesAlias
      ? `${branchWarehousesAlias}.branch_id`
      : `(SELECT bw.branch_id FROM branch_warehouses bw
          WHERE bw.warehouse_id = ${warehouseAlias}.id
          ORDER BY bw.is_primary DESC, bw.branch_id ASC LIMIT 1)`;
    return this.sqlScope(`${warehouseAlias}.branch_id`, fallback, user);
  }

  /**
   * Branch scope for supplier claims. A claim carries no branch of its own; it
   * reaches one through its purchase invoice, goods receipt warehouse, or
   * purchase order (in that order of reliability). Claims with none of these
   * links are treated as out of scope, which fails closed.
   */
  public supplierClaimBranchScope(alias = 'supplier_claims', user = this.actor()): BranchSqlScope {
    return this.sqlScope(
      `COALESCE(
        (SELECT pi.branch_id FROM purchase_invoices pi WHERE pi.id = ${alias}.purchase_invoice_id),
        (SELECT w.branch_id FROM goods_receipt_notes g
           LEFT JOIN warehouses w ON w.id = g.warehouse_id
          WHERE g.id = ${alias}.grn_id),
        (SELECT w.branch_id FROM purchase_orders po
           LEFT JOIN warehouses w ON w.id = po.warehouse_id
          WHERE po.id = ${alias}.purchase_order_id)
      )`,
      undefined,
      user
    );
  }

  public sqlScope(branchExpression: string, fallbackBranchExpression?: string, user = this.actor()): BranchSqlScope {
    const allowed = this.getAccessibleBranchIds(user);
    if (allowed === null) return { clause: '1 = 1', params: [] };
    if (!allowed.length) return { clause: '1 = 0', params: [] };

    const placeholders = allowed.map(() => '?').join(', ');
    const direct = `${branchExpression} IN (${placeholders})`;
    const fallback = fallbackBranchExpression
      ? ` OR (${branchExpression} IS NULL AND ${fallbackBranchExpression} IN (${placeholders}))`
      : '';
    return {
      clause: `(${direct}${fallback})`,
      params: fallback ? [...allowed, ...allowed] : [...allowed],
    };
  }
}
