import type { User } from '../../../../types/auth/identity';
import type { LeaveServiceDeps } from './types';

export function employeeDataScope(
  deps: Pick<LeaveServiceDeps, 'branchAccess' | 'departmentAccess'>,
  actor: User
) {
  const branch = deps.branchAccess.sqlScope('e.branch_id', undefined, actor);
  const department = deps.departmentAccess.sqlScope('e.department_id', actor);
  return {
    clause: `(${branch.clause}) AND (${department.clause})`,
    params: [...branch.params, ...department.params],
  };
}
