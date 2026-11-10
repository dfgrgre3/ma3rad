import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { PermissionService } from './PermissionService';
import type { User } from '../../../types/auth/identity';

export type DepartmentScope = 'ALL' | 'ASSIGNED';

export class EmployeeDepartmentAccessService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireManageUsers(): User {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.branches.branches.manage_users');
    return actor;
  }

  public sqlScope(departmentColumn: string, actor = AuthService.requireAuth()): { clause: string; params: string[] } {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(departmentColumn)) {
      throw new Error('عمود نطاق القسم غير صالح.');
    }
    if (actor.role === 'ADMIN') return { clause: '1 = 1', params: [] };
    const scope = this.db.query<{ departmentScope: DepartmentScope }>(
      'SELECT department_scope AS departmentScope FROM users WHERE id = ? AND is_active = 1',
      [actor.id]
    )[0]?.departmentScope;
    if (scope === 'ALL') return { clause: '1 = 1', params: [] };
    if (scope !== 'ASSIGNED') throw new Error('تعذر تحديد نطاق أقسام الموارد البشرية للمستخدم.');
    return {
      clause: `EXISTS (
        SELECT 1 FROM users_departments ud
        WHERE ud.user_id = ? AND ud.department_id = ${departmentColumn}
      )`,
      params: [actor.id],
    };
  }

  public getScope(userId: string): DepartmentScope {
    const actor = this.requireManageUsers();
    const scope = this.db.query<{ departmentScope: DepartmentScope }>(
      'SELECT department_scope AS departmentScope FROM users WHERE id = ? AND is_active = 1',
      [userId]
    )[0]?.departmentScope;
    if (scope !== 'ALL' && scope !== 'ASSIGNED') throw new Error('المستخدم غير موجود أو غير نشط.');
    if (actor.id !== userId && actor.role !== 'ADMIN') {
      const accessibleBranches = this.branchAccess.getAccessibleBranchIds(actor);
      if (accessibleBranches !== null) {
        const targetBranches = this.db.query<{ branchId: string }>(
          `SELECT ub.branch_id AS branchId FROM users_branches ub
           WHERE ub.user_id = ?`,
          [userId]
        ).map((row) => row.branchId);
        if (targetBranches.some((id) => !accessibleBranches.includes(id))) {
          throw new Error('لا يمكنك إدارة نطاق أقسام مستخدم خارج فروعك.');
        }
      }
    }
    return scope;
  }

  public getAssignedDepartmentIds(userId: string): string[] {
    this.getScope(userId);
    const scope = this.branchAccess.sqlScope('d.branch_id');
    return this.db.query<{ departmentId: string }>(
      `SELECT ud.department_id AS departmentId
       FROM users_departments ud
       JOIN departments d ON d.id = ud.department_id
       WHERE ud.user_id = ? AND ${scope.clause}
       ORDER BY d.name`,
      [userId, ...scope.params]
    ).map((row) => row.departmentId);
  }

  public getAvailableDepartments(userId: string): Array<{ id: string; name: string; branchId: string | null }> {
    const actor = this.requireManageUsers();
    const accessibleBranches = this.branchAccess.getAccessibleBranchIds(actor);
    if (accessibleBranches === null) {
      return this.db.query(
        `SELECT id, name, branch_id AS branchId
         FROM departments WHERE is_active = 1 ORDER BY name`
      );
    }
    if (!accessibleBranches.length) return [];
    const branchClause = `d.branch_id IN (${accessibleBranches.map(() => '?').join(', ')}) OR d.branch_id IS NULL`;
    const targetIds = this.db.query<{ branchId: string }>(
      'SELECT branch_id AS branchId FROM users_branches WHERE user_id = ?',
      [userId]
    ).map((row) => row.branchId);
    if (targetIds.some((id) => !accessibleBranches.includes(id))) {
      throw new Error('لا يمكنك إدارة نطاق أقسام مستخدم خارج فروعك.');
    }
    return this.db.query(
      `SELECT d.id, d.name, d.branch_id AS branchId
       FROM departments d WHERE d.is_active = 1 AND (${branchClause})
       ORDER BY d.name`,
      accessibleBranches
    );
  }

  public updateAccess(userId: string, scope: DepartmentScope, departmentIds: string[]): void {
    const actor = this.requireManageUsers();
    if (scope !== 'ALL' && scope !== 'ASSIGNED') throw new Error('نطاق الأقسام غير صالح.');
    const target = this.db.query<{ id: string; role: string; branchScope: string }>(
      `SELECT id, role, branch_scope AS branchScope FROM users WHERE id = ? AND is_active = 1`,
      [userId]
    )[0];
    if (!target) throw new Error('المستخدم غير موجود أو غير نشط.');
    if (target.role === 'ADMIN' && scope !== 'ALL') {
      throw new Error('حساب المدير المركزي يحتفظ بنطاق جميع الأقسام.');
    }
    const ids = [...new Set(departmentIds)];
    if (scope === 'ASSIGNED' && !ids.length) throw new Error('اختر قسمًا واحدًا على الأقل قبل تقييد نطاق المستخدم.');
    const available = new Set(this.getAvailableDepartments(userId).map((department) => department.id));
    if (ids.some((id) => !available.has(id))) {
      throw new Error('أحد الأقسام المحددة خارج نطاق فروعك أو غير نشط.');
    }
    this.db.executeTransaction((db) => {
      db.run('DELETE FROM users_departments WHERE user_id = ?', [userId]);
      for (const departmentId of ids) {
        db.run(
          `INSERT INTO users_departments (user_id, department_id, assigned_by)
           VALUES (?, ?, ?)`,
          [userId, departmentId, actor.id]
        );
      }
      db.run('UPDATE users SET department_scope = ? WHERE id = ?', [scope, userId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تحديث نطاق أقسام المستخدم', 'HR', ?, ?)`,
        [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, userId,
          JSON.stringify({ scope, departmentIds: ids })]
      );
    });
  }
}
