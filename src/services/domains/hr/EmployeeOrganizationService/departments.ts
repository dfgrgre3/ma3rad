import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type {
  DepartmentNode,
  EmployeeDepartment,
  EmployeeDepartmentRow,
  OrgServiceDeps,
} from './types';
import { audit, requireDepartment } from './context';

export function getDepartments(
  deps: OrgServiceDeps,
  actor: User,
  branchId = deps.branchAccess.getCurrentBranchId()
): EmployeeDepartment[] {
  const { db, branchAccess, departmentAccess } = deps;
  branchAccess.requireBranchAccess(branchId, actor);
  const departmentScope = departmentAccess.sqlScope('d.id', actor);
  return db.query<EmployeeDepartmentRow>(
    `SELECT d.id, d.name, d.branch_id AS branchId, d.description, d.is_active AS isActive
     FROM departments d
     WHERE d.is_active = 1 AND (d.branch_id = ? OR d.branch_id IS NULL) AND ${departmentScope.clause}
     ORDER BY d.name`,
    [branchId, ...departmentScope.params]
  ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
}

export function createDepartment(
  deps: OrgServiceDeps,
  actor: User,
  input: { name: string; branchId?: string; description?: string }
): EmployeeDepartment {
  const { db, branchAccess, departmentAccess } = deps;
  departmentAccess.requireAllDepartmentAccess(actor);
  const name = input.name?.trim();
  if (!name) throw new Error('اسم القسم مطلوب.');
  if (name.length > 100) throw new Error('اسم القسم لا يتجاوز 100 حرف.');
  const branchId = input.branchId || branchAccess.getCurrentBranchId(actor);
  branchAccess.requireBranchAccess(branchId, actor);
  if (db.query(
    'SELECT id FROM departments WHERE lower(name) = lower(?)',
    [name]
  ).length) throw new Error('يوجد قسم بهذا الاسم بالفعل.');
  const id = `dep_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO departments (id, name, branch_id, description, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    [id, name, branchId, input.description?.trim() || null]
  );
  audit(deps, actor, 'إضافة قسم موارد بشرية', id, { name, branchId });
  return requireDepartment(deps, id, actor);
}

export function updateDepartment(
  deps: OrgServiceDeps,
  actor: User,
  id: string,
  patch: { name: string; description?: string }
): EmployeeDepartment {
  const { db } = deps;
  requireDepartment(deps, id, actor);
  const name = patch.name?.trim();
  if (!name) throw new Error('اسم القسم مطلوب.');
  if (name.length > 100) throw new Error('اسم القسم لا يتجاوز 100 حرف.');
  if (db.query(
    'SELECT id FROM departments WHERE lower(name) = lower(?) AND id != ?',
    [name, id]
  ).length) throw new Error('يوجد قسم بهذا الاسم بالفعل.');
  db.run(
    'UPDATE departments SET name = ?, description = ? WHERE id = ?',
    [name, patch.description?.trim() || null, id]
  );
  audit(deps, actor, 'تعديل قسم موارد بشرية', id, patch);
  return requireDepartment(deps, id, actor);
}

export function deactivateDepartment(deps: OrgServiceDeps, actor: User, id: string): void {
  const { db } = deps;
  requireDepartment(deps, id, actor);
  db.run('UPDATE departments SET is_active = 0 WHERE id = ?', [id]);
  audit(deps, actor, 'تعطيل قسم موارد بشرية', id, {});
}

export function updateDepartmentStructure(
  deps: OrgServiceDeps,
  actor: User,
  id: string,
  patch: {
    parentId?: string | null;
    managerEmployeeId?: string | null;
    requiredHeadcount?: number;
    costCenterId?: string | null;
  }
): void {
  const { db } = deps;
  requireDepartment(deps, id, actor);
  if (patch.parentId) {
    if (patch.parentId === id) throw new Error('لا يمكن جعل القسم والدًا لنفسه.');
    requireDepartment(deps, patch.parentId, actor);
  }
  if (patch.managerEmployeeId) {
    const manager = db.query<{ id: string }>('SELECT id FROM employees WHERE id = ?', [patch.managerEmployeeId])[0];
    if (!manager) throw new Error('مدير القسم غير موجود.');
  }
  db.run(
    `UPDATE departments SET parent_department_id = ?, manager_employee_id = ?,
       required_headcount = COALESCE(?, required_headcount), cost_center_id = COALESCE(?, cost_center_id)
     WHERE id = ?`,
    [patch.parentId === undefined ? null : patch.parentId,
     patch.managerEmployeeId === undefined ? null : patch.managerEmployeeId,
     patch.requiredHeadcount ?? null,
     patch.costCenterId ?? null,
     id]
  );
  audit(deps, actor, 'تحديث هيكل قسم', id, patch);
}

export function getOrgTree(
  deps: OrgServiceDeps,
  actor: User,
  branchId = deps.branchAccess.getCurrentBranchId()
): DepartmentNode[] {
  const { db, branchAccess } = deps;
  branchAccess.requireBranchAccess(branchId, actor);
  const departments = db.query<any>(`
    SELECT d.id, d.name, d.parent_department_id AS parentId, d.manager_employee_id AS managerEmployeeId,
      COALESCE(e.name, '—') AS managerName, COALESCE(d.required_headcount, 0) AS requiredHeadcount
    FROM departments d
    LEFT JOIN employees e ON e.id = d.manager_employee_id
    WHERE d.is_active = 1 AND (d.branch_id = ? OR d.branch_id IS NULL)
    ORDER BY d.name
  `, [branchId]);
  const counts = db.query<any>(`
    SELECT department_id AS departmentId, COUNT(*) AS actual
    FROM employees WHERE is_active = 1 AND branch_id = ? AND department_id IS NOT NULL
    GROUP BY department_id
  `, [branchId]);
  const countMap = new Map(counts.map((row) => [row.departmentId, Number(row.actual) || 0]));
  const nodes: DepartmentNode[] = departments.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId || null,
    managerEmployeeId: row.managerEmployeeId || null,
    managerName: row.managerName || null,
    requiredHeadcount: Number(row.requiredHeadcount) || 0,
    actualHeadcount: countMap.get(row.id) || 0,
    children: [],
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: DepartmentNode[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function getVacancies(
  deps: OrgServiceDeps,
  actor: User,
  branchId = deps.branchAccess.getCurrentBranchId()
): Array<{
  departmentId: string; departmentName: string; required: number; actual: number; vacant: number;
}> {
  const tree = getOrgTree(deps, actor, branchId);
  const result: Array<{ departmentId: string; departmentName: string; required: number; actual: number; vacant: number; }> = [];
  const walk = (node: DepartmentNode) => {
    result.push({
      departmentId: node.id,
      departmentName: node.name,
      required: node.requiredHeadcount,
      actual: node.actualHeadcount,
      vacant: Math.max(0, node.requiredHeadcount - node.actualHeadcount),
    });
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return result;
}
