import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { ModuleRegistryService } from '../../config/ModuleRegistryService';
import type { User } from '../../../../types/auth/identity';
import type { AttendanceDeps } from './types';

export function employeeDataScope(
  deps: Pick<AttendanceDeps, 'branchAccess' | 'departmentAccess'>,
  actor: User
) {
  const branch = deps.branchAccess.sqlScope('e.branch_id', undefined, actor);
  const department = deps.departmentAccess.sqlScope('e.department_id', actor);
  return {
    clause: `(${branch.clause}) AND (${department.clause})`,
    params: [...branch.params, ...department.params],
  };
}

export function requireView(): User {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, [
    'employees.attendance.view', 'employees.attendance.manage', 'employees.attendance.approve',
  ]);
  return actor;
}

export function requireManage(): User {
  const actor = AuthService.requireAuth();
  ModuleRegistryService.assertModuleEnabled('hr');
  PermissionService.require(actor, 'employees.attendance.manage');
  return actor;
}

export function requireApproval(): User {
  const actor = AuthService.requireAuth();
  ModuleRegistryService.assertModuleEnabled('hr');
  PermissionService.require(actor, 'employees.attendance.approve');
  return actor;
}

export function requireEmployeeBranch(
  deps: AttendanceDeps,
  employeeId: string,
  actor: User
): string {
  const { db, branchAccess, departmentAccess } = deps;
  const employee = db.query<{ branchId: string | null; departmentId: string | null }>(
    'SELECT branch_id AS branchId, department_id AS departmentId FROM employees WHERE id = ?',
    [employeeId]
  )[0];
  const branchId = employee?.branchId;
  if (!branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
  branchAccess.requireBranchAccess(branchId, actor);
  const departmentScope = departmentAccess.sqlScope('e.department_id', actor);
  const allowed = db.query(
    `SELECT 1 FROM employees e WHERE e.id = ? AND ${departmentScope.clause}`,
    [employeeId, ...departmentScope.params]
  ).length > 0;
  if (!allowed) throw new Error('الموظف خارج نطاق الأقسام المصرح بها.');
  return branchId;
}
