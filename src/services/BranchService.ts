import { DatabaseManager } from '../database/db';
import type { Branch, BranchWarehouse, UserBranch, CreateBranchDTO } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';

export class BranchService {
  private db = DatabaseManager.getInstance();

  public getAllBranches(): Branch[] {
    return this.db.query<any>(`
      SELECT b.*, u.full_name as managerName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      ORDER BY b.name ASC
    `) as Branch[];
  }

  public getBranchById(id: string): Branch | null {
    const rows = this.db.query<any>(`
      SELECT b.*, u.full_name as managerName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      WHERE b.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  public getDefaultBranch(): Branch | null {
    const rows = this.db.query<any>(`
      SELECT b.*, u.full_name as managerName
      FROM branches b
      LEFT JOIN users u ON b.manager_id = u.id
      WHERE b.is_default = 1 AND b.is_active = 1
      LIMIT 1
    `);
    return rows.length > 0 ? rows[0] : null;
  }

  public createBranch(dto: CreateBranchDTO): Branch {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.create');
    const id = `br_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
    return this.db.executeTransaction((sqliteDb) => {
      if (dto.isDefault) {
        sqliteDb.run('UPDATE branches SET is_default = 0 WHERE is_default = 1');
      }
      sqliteDb.run(`
        INSERT INTO branches (id, name, code, address, phone, manager_id, is_default, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [id, dto.name, dto.code, dto.address || null, dto.phone || null, dto.managerId || null, dto.isDefault ? 1 : 0, now]);
      return this.getBranchById(id)!;
    });
  }

  public updateBranch(id: string, updates: Partial<CreateBranchDTO>): Branch {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.update');
    const existing = this.getBranchById(id);
    if (!existing) throw new Error('الفرع غير موجود.');
    if (updates.isDefault) {
      this.db.run('UPDATE branches SET is_default = 0 WHERE is_default = 1');
    }
    const fields: string[] = [];
    const params: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.code !== undefined) { fields.push('code = ?'); params.push(updates.code); }
    if (updates.address !== undefined) { fields.push('address = ?'); params.push(updates.address); }
    if (updates.phone !== undefined) { fields.push('phone = ?'); params.push(updates.phone); }
    if (updates.managerId !== undefined) { fields.push('manager_id = ?'); params.push(updates.managerId); }
    if (updates.isDefault !== undefined) { fields.push('is_default = ?'); params.push(updates.isDefault ? 1 : 0); }
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      this.db.run(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    return this.getBranchById(id)!;
  }

  public deleteBranch(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.delete');
    const existing = this.getBranchById(id);
    if (!existing) throw new Error('الفرع غير موجود.');
    if (existing.isDefault) throw new Error('لا يمكن حذف الفرع الافتراضي.');
    this.db.run('DELETE FROM branches WHERE id = ?', [id]);
  }

  public getBranchWarehouses(branchId: string): BranchWarehouse[] {
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
    const id = `bw_${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();
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
    this.db.run('DELETE FROM branch_warehouses WHERE branch_id = ? AND warehouse_id = ?', [branchId, warehouseId]);
  }

  public getUserBranches(userId: string): Branch[] {
    return this.db.query<any>(`
      SELECT b.*, u.full_name as managerName
      FROM branches b
      JOIN users_branches ub ON ub.branch_id = b.id
      LEFT JOIN users u ON b.manager_id = u.id
      WHERE ub.user_id = ?
      ORDER BY b.name ASC
    `, [userId]);
  }

  public assignUserToBranch(userId: string, branchId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    const branch = this.getBranchById(branchId);
    if (!branch) throw new Error('الفرع غير موجود.');
    this.db.run(`
      INSERT OR IGNORE INTO users_branches (user_id, branch_id)
      VALUES (?, ?)
    `, [userId, branchId]);
  }

  public removeUserFromBranch(userId: string, branchId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'branches.manage_users');
    this.db.run('DELETE FROM users_branches WHERE user_id = ? AND branch_id = ?', [userId, branchId]);
  }

  public getBranchStats(): Array<{ branchId: string; branchName: string; totalSales: number; totalOrders: number }> {
    return this.db.query<any>(`
      SELECT b.id as branchId, b.name as branchName,
             COALESCE(SUM(si.total_amount), 0) as totalSales,
             COUNT(si.id) as totalOrders
      FROM branches b
      LEFT JOIN sales_invoices si ON si.branch_id = b.id AND si.invoice_status != 'VOID'
      GROUP BY b.id, b.name
      ORDER BY totalSales DESC
    `);
  }
}