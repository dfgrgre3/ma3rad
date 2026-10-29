import { DatabaseManager } from '../database/db';
import type { Branch, BranchWarehouse, UserBranch, CreateBranchDTO, User } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';

export class BranchService {
  private db = DatabaseManager.getInstance();
  private access = new BranchAccessService();

  public getAllBranches(): Branch[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.view');
    const scope = this.access.sqlScope('b.id', undefined, actor);
    return this.db.query<any>(`
      SELECT b.*, b.is_main AS is_default, u.full_name as managerName, c.name as companyName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      LEFT JOIN companies c ON c.id = b.company_id
      WHERE ${scope.clause}
      ORDER BY b.name ASC
    `, scope.params) as Branch[];
  }

  public getBranchById(id: string): Branch | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.view');
    this.access.requireBranchAccess(id, actor);
    const rows = this.db.query<any>(`
      SELECT b.*, b.is_main AS is_default, u.full_name as managerName, c.name as companyName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      LEFT JOIN companies c ON c.id = b.company_id
      WHERE b.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getDefaultBranch(): Branch | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.view');
    const scope = this.access.sqlScope('b.id', undefined, actor);
    const rows = this.db.query<any>(`
      SELECT b.*, b.is_main AS is_default, u.full_name as managerName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      WHERE b.is_main = 1 AND b.is_active = 1 AND ${scope.clause}
      LIMIT 1
    `, scope.params);
    return rows.length > 0 ? rows[0] : null;
  }

  public createBranch(dto: CreateBranchDTO): Branch {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.create');
    const companyId = this.resolveCompanyForNewBranch(dto.companyId, actor);
    const id = `br_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    return this.db.executeTransaction((sqliteDb) => {
      if (dto.isDefault) {
        sqliteDb.run('UPDATE branches SET is_main = 0 WHERE is_main = 1');
      }
      sqliteDb.run(`
        INSERT INTO branches (id, name, code, address, phone, manager_id, is_main, is_active, created_at, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [id, dto.name, dto.code, dto.address || null, dto.phone || null, dto.managerId || null, dto.isDefault ? 1 : 0, now, companyId]);
      sqliteDb.run(`
        INSERT INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
        VALUES (?, ?, 0, 1, 1, ?)
      `, [`cr_${id}`, `الخزينة الرئيسية - ${dto.code}`, id]);
      return this.getBranchRow(id)!;
    });
  }

  /**
   * Resolve the owning company for a new branch. Explicit input must be an
   * existing, active company inside the actor's scope; otherwise the actor's
   * current branch company is used.
   */
  private resolveCompanyForNewBranch(companyId: string | undefined, actor: User): string {
    if (companyId) {
      const company = this.db.query<{ isActive: number }>(
        'SELECT is_active AS isActive FROM companies WHERE id = ?',
        [companyId]
      )[0];
      if (!company) throw new Error('الشركة المحددة غير موجودة.');
      if (Number(company.isActive) !== 1) throw new Error('لا يمكن إضافة فرع لشركة معطلة.');
      this.access.requireCompanyAccess(companyId, actor);
      return companyId;
    }
    const accessible = this.access.getAccessibleBranchIds(actor);
    const preferredBranch = accessible === null
      ? this.db.query<{ companyId: string }>(
        'SELECT company_id AS companyId FROM branches WHERE is_main = 1 AND company_id IS NOT NULL LIMIT 1'
      )[0]
      : accessible.length
        ? this.db.query<{ companyId: string }>(
          `SELECT company_id AS companyId FROM branches
           WHERE id IN (${accessible.map(() => '?').join(', ')}) AND company_id IS NOT NULL
           ORDER BY is_main DESC, id ASC LIMIT 1`,
          accessible
        )[0]
        : undefined;
    if (!preferredBranch) throw new Error('تعذر تحديد الشركة المالكة للفرع الجديد. اختر شركة صريحة.');
    return preferredBranch.companyId;
  }

  public updateBranch(id: string, updates: Partial<CreateBranchDTO>): Branch {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.update');
    const existing = this.getBranchById(id);
    if (!existing) throw new Error('الفرع غير موجود.');
    if (updates.isDefault) {
      this.db.run('UPDATE branches SET is_main = 0 WHERE is_main = 1');
    }
    const fields: string[] = [];
    const params: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.code !== undefined) { fields.push('code = ?'); params.push(updates.code); }
    if (updates.address !== undefined) { fields.push('address = ?'); params.push(updates.address); }
    if (updates.phone !== undefined) { fields.push('phone = ?'); params.push(updates.phone); }
    if (updates.managerId !== undefined) { fields.push('manager_id = ?'); params.push(updates.managerId); }
    if (updates.companyId !== undefined) {
      const company = this.db.query<{ isActive: number }>(
        'SELECT is_active AS isActive FROM companies WHERE id = ?',
        [updates.companyId]
      )[0];
      if (!company) throw new Error('الشركة المحددة غير موجودة.');
      if (Number(company.isActive) !== 1) throw new Error('لا يمكن نقل فرع إلى شركة معطلة.');
      this.access.requireCompanyAccess(updates.companyId, actor);
      fields.push('company_id = ?');
      params.push(updates.companyId);
    }
    if (updates.isDefault !== undefined) { fields.push('is_main = ?'); params.push(updates.isDefault ? 1 : 0); }
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      this.db.run(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    return this.getBranchRow(id)!;
  }

  public deleteBranch(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.delete');
    const existing = this.getBranchById(id);
    if (!existing) throw new Error('الفرع غير موجود.');
    if (existing.isDefault) throw new Error('لا يمكن حذف الفرع الافتراضي.');
    const cashActivity = this.db.query<{ count: number }>(`
      SELECT
        (SELECT COUNT(*) FROM cash_shifts WHERE branch_id = ?) +
        (SELECT COUNT(*) FROM expenses WHERE branch_id = ?) +
        (SELECT COUNT(*) FROM customer_payments WHERE branch_id = ?) +
        (SELECT COUNT(*) FROM supplier_payments WHERE branch_id = ?) AS count
    `, [id, id, id, id])[0]?.count || 0;
    if (cashActivity > 0) {
      throw new Error('لا يمكن حذف فرع له حركات خزينة؛ عطّله بدلًا من حذف سجله المالي.');
    }
    this.db.executeTransaction((sqliteDb) => {
      sqliteDb.run('DELETE FROM cash_registers WHERE branch_id = ?', [id]);
      sqliteDb.run('DELETE FROM branches WHERE id = ?', [id]);
    });
  }

  public getBranchWarehouses(branchId: string): BranchWarehouse[] {
    this.access.requireBranchAccess(branchId);
    return this.db.query<any>(`
      SELECT bw.*, w.name as warehouseName
      FROM branch_warehouses bw
      JOIN warehouses w ON bw.warehouse_id = w.id
      WHERE bw.branch_id = ?
      ORDER BY bw.is_primary DESC, w.name ASC
    `, [branchId]);
  }

  public assignWarehouseToBranch(branchId: string, warehouseId: string, isPrimary = false): BranchWarehouse {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.update');
    this.access.requireBranchAccess(branchId, actor);
    const branch = this.getBranchRow(branchId);
    const warehouse = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM warehouses WHERE id = ?',
      [warehouseId]
    )[0];
    if (!branch) throw new Error('الفرع غير موجود.');
    if (!warehouse) throw new Error('المخزن غير موجود.');
    if (warehouse.branchId && warehouse.branchId !== branchId) {
      throw new Error('المخزن مرتبط بفرع آخر ولا يمكن إسناده لهذا الفرع.');
    }
    const id = `bw_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((sqliteDb) => {
      if (isPrimary) {
        sqliteDb.run('UPDATE branch_warehouses SET is_primary = 0 WHERE branch_id = ?', [branchId]);
      }
      sqliteDb.run(`
        INSERT INTO branch_warehouses (id, branch_id, warehouse_id, is_primary)
        VALUES (?, ?, ?, ?)
      `, [id, branchId, warehouseId, isPrimary ? 1 : 0]);
      return this.getBranchWarehouses(branchId).find((w: any) => w.id === id)!;
    });
  }

  public removeWarehouseFromBranch(branchId: string, warehouseId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.update');
    this.access.requireBranchAccess(branchId, actor);
    this.db.run('DELETE FROM branch_warehouses WHERE branch_id = ? AND warehouse_id = ?', [branchId, warehouseId]);
  }

  public getUserBranches(userId: string): Branch[] {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      PermissionService.require(actor, 'branches.manage_users');
    }
    const targetScope = this.getUserBranchScope(userId);
    if (targetScope === 'ALL') {
      if (actor.id !== userId) PermissionService.require(actor, 'branches.access_all');
      return this.getAllBranches();
    }
    const scope = this.access.sqlScope('b.id', undefined, actor);
    return this.db.query<any>(`
      SELECT b.*, b.is_main AS is_default, u.full_name as managerName
      FROM branches b
      JOIN users_branches ub ON ub.branch_id = b.id
      LEFT JOIN users u ON b.manager_id = u.id
      WHERE ub.user_id = ? AND ${scope.clause}
      ORDER BY b.name ASC
    `, [userId, ...scope.params]);
  }

  public getUserBranchScope(userId: string): 'ASSIGNED' | 'ALL' {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      PermissionService.require(actor, 'branches.manage_users');
    }
    const scope = this.db.query<{ branchScope: 'ASSIGNED' | 'ALL' }>(
      'SELECT branch_scope AS branchScope FROM users WHERE id = ?',
      [userId]
    )[0]?.branchScope;
    if (scope !== 'ASSIGNED' && scope !== 'ALL') throw new Error('المستخدم غير موجود أو نطاقه غير صالح.');
    if (scope === 'ALL' && actor.role !== 'ADMIN' && actor.id !== userId) {
      PermissionService.require(actor, 'branches.access_all');
    }
    return scope;
  }

  public getUserAssignedBranchIds(userId: string): string[] {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      PermissionService.require(actor, 'branches.manage_users');
    }
    const scope = this.access.sqlScope('ub.branch_id', undefined, actor);
    return this.db.query<{ branchId: string }>(
      `SELECT ub.branch_id AS branchId FROM users_branches ub
       WHERE ub.user_id = ? AND ${scope.clause} ORDER BY ub.branch_id`,
      [userId, ...scope.params]
    ).map(row => row.branchId);
  }

  public assignUserToBranch(userId: string, branchId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    this.access.requireBranchAccess(branchId, actor);
    if (!this.getBranchRow(branchId)) throw new Error('الفرع غير موجود.');
    const target = this.db.query<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    )[0];
    if (!target) {
      throw new Error('المستخدم غير موجود أو غير نشط.');
    }
    if (target.role === 'ADMIN') throw new Error('لا يمكن إسناد فروع إلى حساب المدير المركزي.');
    this.db.run(`
      INSERT OR IGNORE INTO users_branches (user_id, branch_id)
      VALUES (?, ?)
    `, [userId, branchId]);
  }

  public removeUserFromBranch(userId: string, branchId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    this.access.requireBranchAccess(branchId, actor);
    this.db.run('DELETE FROM users_branches WHERE user_id = ? AND branch_id = ?', [userId, branchId]);
  }

  public setUserBranchScope(userId: string, scope: 'ASSIGNED' | 'ALL'): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    if (scope === 'ALL') PermissionService.require(actor, 'branches.access_all');
    const target = this.db.query<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    )[0];
    if (!target) {
      throw new Error('المستخدم غير موجود أو غير نشط.');
    }
    if (target.role === 'ADMIN' && scope !== 'ALL') {
      throw new Error('حساب المدير يحتفظ دائمًا بالوصول المركزي.');
    }
    if (scope === 'ASSIGNED' && !this.db.query('SELECT branch_id FROM users_branches WHERE user_id = ? LIMIT 1', [userId]).length) {
      throw new Error('أسند المستخدم إلى فرع واحد على الأقل قبل تقييد نطاقه.');
    }
    const allowed = this.access.getAccessibleBranchIds(actor);
    if (scope === 'ASSIGNED' && allowed !== null && this.hasBranchesOutsideScope(userId, allowed)) {
      throw new Error('لا يمكن تقييد النطاق قبل مراجعة جميع الفروع المسندة للمستخدم.');
    }
    this.db.run('UPDATE users SET branch_scope = ? WHERE id = ?', [scope, userId]);
  }

  public updateUserBranchAccess(userId: string, scope: 'ASSIGNED' | 'ALL', branchIds: string[]): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    if (scope === 'ALL') PermissionService.require(actor, 'branches.access_all');
    const target = this.db.query<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ? AND is_active = 1',
      [userId]
    )[0];
    if (!target) {
      throw new Error('المستخدم غير موجود أو غير نشط.');
    }
    if (target.role === 'ADMIN' && scope !== 'ALL') {
      throw new Error('حساب المدير يحتفظ دائمًا بالوصول المركزي.');
    }

    const selectedBranchIds = [...new Set(branchIds)];
    if (scope === 'ASSIGNED' && !selectedBranchIds.length) {
      throw new Error('أسند المستخدم إلى فرع واحد على الأقل قبل تقييد نطاقه.');
    }
    const allowed = this.access.getAccessibleBranchIds(actor);
    if (allowed !== null && selectedBranchIds.some(id => !allowed.includes(id))) {
      throw new Error('لا يمكنك إسناد المستخدم إلى فرع خارج نطاق وصولك.');
    }
    if (scope === 'ASSIGNED' && allowed !== null && this.hasBranchesOutsideScope(userId, allowed)) {
      throw new Error('لا يمكن تقييد النطاق قبل مراجعة جميع الفروع المسندة للمستخدم.');
    }
    for (const branchId of selectedBranchIds) {
      if (!this.db.query('SELECT id FROM branches WHERE id = ? AND is_active = 1', [branchId]).length) {
        throw new Error('أحد الفروع المحددة غير موجود أو غير نشط.');
      }
    }

    this.db.executeTransaction((db) => {
      if (allowed === null) {
        db.run('DELETE FROM users_branches WHERE user_id = ?', [userId]);
      } else if (allowed.length) {
        db.run(
          `DELETE FROM users_branches WHERE user_id = ? AND branch_id IN (${allowed.map(() => '?').join(', ')})`,
          [userId, ...allowed]
        );
      }
      for (const branchId of selectedBranchIds) {
        db.run('INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, ?)', [userId, branchId]);
      }
      db.run('UPDATE users SET branch_scope = ? WHERE id = ?', [scope, userId]);
    });
  }

  public getBranchStats(): Array<{ branchId: string; branchName: string; totalSales: number; totalOrders: number }> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.view');
    const scope = this.access.sqlScope('b.id', undefined, actor);
    return this.db.query<any>(`
      SELECT b.id as branchId, b.name as branchName,
             COALESCE(SUM(si.total_amount), 0) as totalSales,
             COUNT(si.id) as totalOrders
      FROM branches b
      LEFT JOIN sales_invoices si ON si.branch_id = b.id AND si.invoice_status != 'VOID'
      WHERE ${scope.clause}
      GROUP BY b.id, b.name
      ORDER BY totalSales DESC
    `, scope.params);
  }

  /**
   * Verifies if a user has access to a specific branch at database / service layer.
   * Admins have universal access; non-admins must be assigned via users_branches.
   */
  public isUserAssignedToBranch(userId: string, branchId: string): boolean {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.id !== userId) return false;
    return this.access.hasBranchAccess(branchId, actor);
  }

  public requireBranchAccess(userId: string, branchId: string): void {
    const actor = AuthService.requireAuth();
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      throw new Error('لا يمكن التحقق من نطاق مستخدم آخر.');
    }
    this.access.requireBranchAccess(branchId, actor);
  }

  private getBranchRow(id: string): Branch | null {
    const rows = this.db.query<any>(`
      SELECT b.*, b.is_main AS is_default, u.full_name as managerName, c.name as companyName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      LEFT JOIN companies c ON c.id = b.company_id
      WHERE b.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  private hasBranchesOutsideScope(userId: string, allowedBranchIds: string[]): boolean {
    if (!allowedBranchIds.length) {
      return this.db.query(
        'SELECT 1 FROM users_branches WHERE user_id = ? LIMIT 1',
        [userId]
      ).length > 0;
    }
    return this.db.query(
      `SELECT 1 FROM users_branches WHERE user_id = ? AND branch_id NOT IN (${allowedBranchIds.map(() => '?').join(', ')}) LIMIT 1`,
      [userId, ...allowedBranchIds]
    ).length > 0;
  }
}