import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import type { User } from '../../../types/auth/identity';

export interface EmployeeDepartment {
  id: string;
  name: string;
  branchId: string | null;
  description: string | null;
  isActive: boolean;
}

export interface EmployeeJobTitle {
  id: string;
  departmentId: string | null;
  title: string;
  isActive: boolean;
}

type EmployeeDepartmentRow = Omit<EmployeeDepartment, 'isActive'> & { isActive: number };
type EmployeeJobTitleRow = Omit<EmployeeJobTitle, 'isActive'> & { isActive: number };

export class EmployeeOrganizationService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireManage(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.require(actor, 'ui.employees.employees.manage');
    return actor;
  }

  private requireView(): User {
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

  private audit(actor: User, action: string, recordId: string, values: unknown): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
    );
  }

  private requireDepartment(id: string, actor: User): EmployeeDepartment {
    const department = this.db.query<EmployeeDepartmentRow>(
      `SELECT id, name, branch_id AS branchId, description, is_active AS isActive
       FROM departments WHERE id = ?`,
      [id]
    )[0];
    if (!department || !department.isActive) throw new Error('القسم غير موجود أو غير نشط.');
    if (department.branchId) this.branchAccess.requireBranchAccess(department.branchId, actor);
    return { ...department, isActive: Boolean(department.isActive) };
  }

  public getDepartments(branchId = this.branchAccess.getCurrentBranchId()): EmployeeDepartment[] {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);
    return this.db.query<EmployeeDepartmentRow>(
      `SELECT id, name, branch_id AS branchId, description, is_active AS isActive
       FROM departments
       WHERE is_active = 1 AND (branch_id = ? OR branch_id IS NULL)
       ORDER BY name`,
      [branchId]
    ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  public createDepartment(input: { name: string; branchId?: string; description?: string }): EmployeeDepartment {
    const actor = this.requireManage();
    const name = input.name?.trim();
    if (!name) throw new Error('اسم القسم مطلوب.');
    if (name.length > 100) throw new Error('اسم القسم لا يتجاوز 100 حرف.');
    const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    if (this.db.query(
      'SELECT id FROM departments WHERE lower(name) = lower(?)',
      [name]
    ).length) throw new Error('يوجد قسم بهذا الاسم بالفعل.');
    const id = `dep_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO departments (id, name, branch_id, description, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [id, name, branchId, input.description?.trim() || null]
    );
    this.audit(actor, 'إضافة قسم موارد بشرية', id, { name, branchId });
    return this.requireDepartment(id, actor);
  }

  public updateDepartment(id: string, patch: { name: string; description?: string }): EmployeeDepartment {
    const actor = this.requireManage();
    const existing = this.requireDepartment(id, actor);
    const name = patch.name?.trim();
    if (!name) throw new Error('اسم القسم مطلوب.');
    if (name.length > 100) throw new Error('اسم القسم لا يتجاوز 100 حرف.');
    if (this.db.query(
      'SELECT id FROM departments WHERE lower(name) = lower(?) AND id != ?',
      [name, id]
    ).length) throw new Error('يوجد قسم بهذا الاسم بالفعل.');
    this.db.run(
      'UPDATE departments SET name = ?, description = ? WHERE id = ?',
      [name, patch.description?.trim() || null, id]
    );
    this.audit(actor, 'تعديل قسم موارد بشرية', id, patch);
    return this.requireDepartment(id, actor);
  }

  public deactivateDepartment(id: string): void {
    const actor = this.requireManage();
    this.requireDepartment(id, actor);
    this.db.run('UPDATE departments SET is_active = 0 WHERE id = ?', [id]);
    this.audit(actor, 'تعطيل قسم موارد بشرية', id, {});
  }

  public getJobTitles(departmentId?: string): EmployeeJobTitle[] {
    const actor = this.requireView();
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    if (departmentId) this.requireDepartment(departmentId, actor);
    return this.db.query<EmployeeJobTitleRow>(
      `SELECT jt.id, jt.department_id AS departmentId, jt.title, jt.is_active AS isActive
       FROM employee_job_titles jt
       LEFT JOIN departments d ON d.id = jt.department_id
       WHERE jt.is_active = 1 AND (jt.department_id = ? OR jt.department_id IS NULL)
         AND (d.branch_id = ? OR d.branch_id IS NULL OR jt.department_id IS NULL)
       ORDER BY jt.title`,
      [departmentId || '', branchId]
    ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  public createJobTitle(input: { title: string; departmentId?: string | null }): EmployeeJobTitle {
    const actor = this.requireManage();
    const title = input.title?.trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب.');
    if (title.length > 100) throw new Error('المسمى الوظيفي لا يتجاوز 100 حرف.');
    if (input.departmentId) this.requireDepartment(input.departmentId, actor);
    const departmentId = input.departmentId || null;
    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM employee_job_titles
       WHERE COALESCE(department_id, '') = COALESCE(?, '') AND lower(title) = lower(?)`,
      [departmentId, title]
    )[0];
    if (existing) throw new Error('هذا المسمى الوظيفي مسجل بالفعل.');
    const id = `job_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO employee_job_titles (id, department_id, title, created_by)
       VALUES (?, ?, ?, ?)`,
      [id, departmentId, title, actor.id]
    );
    this.audit(actor, 'إضافة مسمى وظيفي', id, { title, departmentId });
    return { id, title, departmentId, isActive: true };
  }

  public updateJobTitle(id: string, titleValue: string): EmployeeJobTitle {
    const actor = this.requireManage();
    const existing = this.db.query<EmployeeJobTitleRow>(
      `SELECT id, department_id AS departmentId, title, is_active AS isActive
       FROM employee_job_titles WHERE id = ? AND is_active = 1`,
      [id]
    )[0];
    if (!existing) throw new Error('المسمى الوظيفي غير موجود أو غير نشط.');
    if (existing.departmentId) this.requireDepartment(existing.departmentId, actor);
    const title = titleValue?.trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب.');
    if (title.length > 100) throw new Error('المسمى الوظيفي لا يتجاوز 100 حرف.');
    if (this.db.query(
      `SELECT id FROM employee_job_titles
       WHERE id != ? AND COALESCE(department_id, '') = COALESCE(?, '')
         AND lower(title) = lower(?)`,
      [id, existing.departmentId, title]
    ).length) throw new Error('هذا المسمى الوظيفي مسجل بالفعل.');
    this.db.run(
      'UPDATE employee_job_titles SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, id]
    );
    this.audit(actor, 'تعديل مسمى وظيفي', id, { title });
    return { ...existing, title, isActive: Boolean(existing.isActive) };
  }

  public deactivateJobTitle(id: string): void {
    const actor = this.requireManage();
    const title = this.db.query<{ departmentId: string | null }>(
      'SELECT department_id AS departmentId FROM employee_job_titles WHERE id = ? AND is_active = 1',
      [id]
    )[0];
    if (!title) throw new Error('المسمى الوظيفي غير موجود أو غير نشط.');
    if (title.departmentId) this.requireDepartment(title.departmentId, actor);
    this.db.run('UPDATE employee_job_titles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    this.audit(actor, 'تعطيل مسمى وظيفي', id, {});
  }
}
