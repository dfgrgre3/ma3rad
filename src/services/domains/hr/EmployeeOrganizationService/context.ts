import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import type { User } from '../../../../types/auth/identity';
import type {
  EmployeeDepartment,
  EmployeeDepartmentRow,
  OrgServiceDeps,
} from './types';

export function requireManage(): User {
  const actor = AuthService.requireAuth();
  ModuleRegistryService.assertModuleEnabled('hr');
  PermissionService.require(actor, 'ui.employees.employees.manage');
  return actor;
}

export function requireView(): User {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, [
    'ui.employees.employees.view',
    'ui.employees.employees.manage',
    'employees.payroll.view',
    'employees.payroll.manage',
    'employees.payroll.approve',
  ]);
  return actor;
}

export function audit(deps: OrgServiceDeps, actor: User, action: string, recordId: string, values: unknown): void {
  deps.db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
    [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
  );
}

export function requireDepartment(deps: OrgServiceDeps, id: string, actor: User): EmployeeDepartment {
  const { db, branchAccess, departmentAccess } = deps;
  const department = db.query<EmployeeDepartmentRow>(
    `SELECT id, name, branch_id AS branchId, description, is_active AS isActive
     FROM departments WHERE id = ?`,
    [id]
  )[0];
  if (!department || !department.isActive) throw new Error('القسم غير موجود أو غير نشط.');
  if (department.branchId) branchAccess.requireBranchAccess(department.branchId, actor);
  const scope = departmentAccess.sqlScope('d.id', actor);
  if (!db.query(`SELECT 1 FROM departments d WHERE d.id = ? AND ${scope.clause}`, [id, ...scope.params]).length) {
    throw new Error('القسم خارج نطاق الأقسام المصرح بها.');
  }
  return { ...department, isActive: Boolean(department.isActive) };
}
