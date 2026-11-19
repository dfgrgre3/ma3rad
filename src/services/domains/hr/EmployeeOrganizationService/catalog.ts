import { v4 as uuidv4 } from 'uuid';
import type { User } from '../../../../types/auth/identity';
import type {
  EmployeeCostCenter,
  EmployeeJobGrade,
  EmployeeJobTitle,
  EmployeeJobTitleRow,
  OrgServiceDeps,
} from './types';
import { audit, requireDepartment } from './context';

export function getJobTitles(
  deps: OrgServiceDeps,
  actor: User,
  departmentId?: string
): EmployeeJobTitle[] {
  const { db, branchAccess, departmentAccess } = deps;
  const branchId = branchAccess.getCurrentBranchId(actor);
  branchAccess.requireBranchAccess(branchId, actor);
  if (departmentId) requireDepartment(deps, departmentId, actor);
  const departmentScope = departmentAccess.sqlScope('d.id', actor);
  return db.query<EmployeeJobTitleRow>(
    `SELECT jt.id, jt.department_id AS departmentId, jt.title, jt.is_active AS isActive
     FROM employee_job_titles jt
     LEFT JOIN departments d ON d.id = jt.department_id
     WHERE jt.is_active = 1 AND (jt.department_id = ? OR jt.department_id IS NULL)
       AND (d.branch_id = ? OR d.branch_id IS NULL OR jt.department_id IS NULL)
       AND (jt.department_id IS NULL OR ${departmentScope.clause})
     ORDER BY jt.title`,
    [departmentId || '', branchId, ...departmentScope.params]
  ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
}

export function createJobTitle(
  deps: OrgServiceDeps,
  actor: User,
  input: { title: string; departmentId?: string | null }
): EmployeeJobTitle {
  const { db } = deps;
  const title = input.title?.trim();
  if (!title) throw new Error('المسمى الوظيفي مطلوب.');
  if (title.length > 100) throw new Error('المسمى الوظيفي لا يتجاوز 100 حرف.');
  if (input.departmentId) requireDepartment(deps, input.departmentId, actor);
  const departmentId = input.departmentId || null;
  const existing = db.query<{ id: string }>(
    `SELECT id FROM employee_job_titles
     WHERE COALESCE(department_id, '') = COALESCE(?, '') AND lower(title) = lower(?)`,
    [departmentId, title]
  )[0];
  if (existing) throw new Error('هذا المسمى الوظيفي مسجل بالفعل.');
  const id = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO employee_job_titles (id, department_id, title, created_by)
     VALUES (?, ?, ?, ?)`,
    [id, departmentId, title, actor.id]
  );
  audit(deps, actor, 'إضافة مسمى وظيفي', id, { title, departmentId });
  return { id, title, departmentId, isActive: true };
}

export function updateJobTitle(
  deps: OrgServiceDeps,
  actor: User,
  id: string,
  titleValue: string
): EmployeeJobTitle {
  const { db } = deps;
  const existing = db.query<EmployeeJobTitleRow>(
    `SELECT id, department_id AS departmentId, title, is_active AS isActive
     FROM employee_job_titles WHERE id = ? AND is_active = 1`,
    [id]
  )[0];
  if (!existing) throw new Error('المسمى الوظيفي غير موجود أو غير نشط.');
  if (existing.departmentId) requireDepartment(deps, existing.departmentId, actor);
  const title = titleValue?.trim();
  if (!title) throw new Error('المسمى الوظيفي مطلوب.');
  if (title.length > 100) throw new Error('المسمى الوظيفي لا يتجاوز 100 حرف.');
  if (db.query(
    `SELECT id FROM employee_job_titles
     WHERE id != ? AND COALESCE(department_id, '') = COALESCE(?, '')
       AND lower(title) = lower(?)`,
    [id, existing.departmentId, title]
  ).length) throw new Error('هذا المسمى الوظيفي مسجل بالفعل.');
  db.run(
    'UPDATE employee_job_titles SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title, id]
  );
  audit(deps, actor, 'تعديل مسمى وظيفي', id, { title });
  return { ...existing, title, isActive: Boolean(existing.isActive) };
}

export function deactivateJobTitle(deps: OrgServiceDeps, actor: User, id: string): void {
  const { db } = deps;
  const title = db.query<{ departmentId: string | null }>(
    'SELECT department_id AS departmentId FROM employee_job_titles WHERE id = ? AND is_active = 1',
    [id]
  )[0];
  if (!title) throw new Error('المسمى الوظيفي غير موجود أو غير نشط.');
  if (title.departmentId) requireDepartment(deps, title.departmentId, actor);
  db.run('UPDATE employee_job_titles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  audit(deps, actor, 'تعطيل مسمى وظيفي', id, {});
}

export function getJobGrades(
  deps: OrgServiceDeps,
  actor: User,
  branchId = deps.branchAccess.getCurrentBranchId()
): EmployeeJobGrade[] {
  const { db, branchAccess } = deps;
  branchAccess.requireBranchAccess(branchId, actor);
  return db.query<any>(`
    SELECT id, branch_id AS branchId, name, level, min_salary / 100.0 AS minSalary, max_salary / 100.0 AS maxSalary,
      description, is_active AS isActive
    FROM job_grades
    WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
    ORDER BY level, name
  `, [branchId]).map((row) => ({
    id: row.id,
    branchId: row.branchId || null,
    name: row.name,
    level: Number(row.level) || 1,
    minSalary: Number(row.minSalary) || 0,
    maxSalary: Number(row.maxSalary) || 0,
    description: row.description || null,
    isActive: Boolean(row.isActive),
  }));
}

export function createJobGrade(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    name: string; branchId?: string; level?: number; minSalary?: number; maxSalary?: number; description?: string;
  }
): EmployeeJobGrade {
  const { db, branchAccess } = deps;
  const name = input.name?.trim();
  if (!name) throw new Error('اسم الدرجة الوظيفية مطلوب.');
  const branchId = input.branchId || branchAccess.getCurrentBranchId(actor);
  branchAccess.requireBranchAccess(branchId, actor);
  const id = `grade_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO job_grades (id, branch_id, company_id, name, level, min_salary, max_salary, description)
     VALUES (?, ?, (SELECT company_id FROM branches WHERE id = ?), ?, ?, ROUND(?*100), ROUND(?*100), ?)`,
    [id, branchId, branchId, name, Math.max(1, Number(input.level) || 1),
     Math.max(0, Number(input.minSalary) || 0), Math.max(0, Number(input.maxSalary) || 0),
     input.description?.trim() || null]
  );
  audit(deps, actor, 'إضافة درجة وظيفية', id, { name, branchId });
  return getJobGrades(deps, actor, branchId).find((row) => row.id === id)!;
}

export function deactivateJobGrade(deps: OrgServiceDeps, actor: User, id: string): void {
  const { db } = deps;
  db.run('UPDATE job_grades SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  audit(deps, actor, 'تعطيل درجة وظيفية', id, {});
}

export function getCostCenters(
  deps: OrgServiceDeps,
  actor: User,
  branchId = deps.branchAccess.getCurrentBranchId()
): EmployeeCostCenter[] {
  const { db, branchAccess } = deps;
  branchAccess.requireBranchAccess(branchId, actor);
  return db.query<any>(`
    SELECT id, branch_id AS branchId, code, name, is_active AS isActive
    FROM cost_centers
    WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
    ORDER BY code, name
  `, [branchId]).map((row) => ({
    id: row.id,
    branchId: row.branchId || null,
    code: row.code,
    name: row.name,
    isActive: Boolean(row.isActive),
  }));
}

export function createCostCenter(
  deps: OrgServiceDeps,
  actor: User,
  input: { code: string; name: string; branchId?: string }
): EmployeeCostCenter {
  const { db, branchAccess } = deps;
  const code = input.code?.trim();
  const name = input.name?.trim();
  if (!code) throw new Error('رمز مركز التكلفة مطلوب.');
  if (!name) throw new Error('اسم مركز التكلفة مطلوب.');
  const branchId = input.branchId || branchAccess.getCurrentBranchId(actor);
  branchAccess.requireBranchAccess(branchId, actor);
  const id = `cc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  db.run(
    `INSERT INTO cost_centers (id, branch_id, code, name)
     VALUES (?, ?, ?, ?)`,
    [id, branchId, code, name]
  );
  audit(deps, actor, 'إضافة مركز تكلفة', id, { code, name, branchId });
  return getCostCenters(deps, actor, branchId).find((row) => row.id === id)!;
}

export function deactivateCostCenter(deps: OrgServiceDeps, actor: User, id: string): void {
  const { db } = deps;
  db.run('UPDATE cost_centers SET is_active = 0 WHERE id = ?', [id]);
  audit(deps, actor, 'تعطيل مركز تكلفة', id, {});
}
