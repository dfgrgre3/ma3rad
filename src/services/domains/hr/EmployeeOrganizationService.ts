import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { ApprovalService } from '../approvals/ApprovalService';
import { localDateString } from '../../../utils/shared/date';
import { NotificationService } from '../notifications/NotificationService';
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

export interface EmployeeJobGrade {
  id: string;
  branchId: string | null;
  name: string;
  level: number;
  minSalary: number;
  maxSalary: number;
  description: string | null;
  isActive: boolean;
}

export interface EmployeeCostCenter {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  isActive: boolean;
}

export interface EmployeeTransfer {
  id: string;
  employeeId: string;
  fromBranchId: string | null;
  toBranchId: string | null;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromJobTitle: string | null;
  toJobTitle: string | null;
  transferDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface EmployeeLifecycleEvent {
  id: string;
  employeeId: string;
  eventType: string;
  eventDate: string;
  fromValue: string | null;
  toValue: string | null;
  notes: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface EmployeeOnboardingTask {
  id: string;
  employeeId: string;
  taskName: string;
  category: string;
  dueDate: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface EmployeeCustodyItem {
  id: string;
  employeeId: string;
  itemName: string;
  itemType: string;
  serialNumber: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: 'ASSIGNED' | 'RETURNED' | 'LOST';
  notes: string | null;
  createdAt: string;
}

export interface EmployeeProbationReview {
  id: string;
  employeeId: string;
  reviewDate: string;
  reviewerId: string | null;
  score: number;
  rating: string;
  recommendation: string;
  notes: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  createdAt: string;
}

export interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
  managerEmployeeId: string | null;
  managerName: string | null;
  requiredHeadcount: number;
  actualHeadcount: number;
  children: DepartmentNode[];
}

type EmployeeDepartmentRow = Omit<EmployeeDepartment, 'isActive'> & { isActive: number };
type EmployeeJobTitleRow = Omit<EmployeeJobTitle, 'isActive'> & { isActive: number };

export class EmployeeOrganizationService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

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
    const scope = this.departmentAccess.sqlScope('d.id', actor);
    if (!this.db.query(`SELECT 1 FROM departments d WHERE d.id = ? AND ${scope.clause}`, [id, ...scope.params]).length) {
      throw new Error('القسم خارج نطاق الأقسام المصرح بها.');
    }
    return { ...department, isActive: Boolean(department.isActive) };
  }

  public getDepartments(branchId = this.branchAccess.getCurrentBranchId()): EmployeeDepartment[] {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);
    const departmentScope = this.departmentAccess.sqlScope('d.id', actor);
    return this.db.query<EmployeeDepartmentRow>(
      `SELECT d.id, d.name, d.branch_id AS branchId, d.description, d.is_active AS isActive
       FROM departments d
       WHERE d.is_active = 1 AND (d.branch_id = ? OR d.branch_id IS NULL) AND ${departmentScope.clause}
       ORDER BY d.name`,
      [branchId, ...departmentScope.params]
    ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  }

  public createDepartment(input: { name: string; branchId?: string; description?: string }): EmployeeDepartment {
    const actor = this.requireManage();
    this.departmentAccess.requireAllDepartmentAccess(actor);
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
    this.requireDepartment(id, actor);
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
    const departmentScope = this.departmentAccess.sqlScope('d.id', actor);
    return this.db.query<EmployeeJobTitleRow>(
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
  public updateDepartmentStructure(id: string, patch: {
    parentId?: string | null;
    managerEmployeeId?: string | null;
    requiredHeadcount?: number;
    costCenterId?: string | null;
  }): void {
    const actor = this.requireManage();
    this.requireDepartment(id, actor);
    if (patch.parentId) {
      if (patch.parentId === id) throw new Error('لا يمكن جعل القسم والدًا لنفسه.');
      this.requireDepartment(patch.parentId, actor);
    }
    if (patch.managerEmployeeId) {
      const manager = this.db.query<{ id: string }>('SELECT id FROM employees WHERE id = ?', [patch.managerEmployeeId])[0];
      if (!manager) throw new Error('مدير القسم غير موجود.');
    }
    this.db.run(
      `UPDATE departments SET parent_department_id = ?, manager_employee_id = ?,
         required_headcount = COALESCE(?, required_headcount), cost_center_id = COALESCE(?, cost_center_id)
       WHERE id = ?`,
      [patch.parentId === undefined ? null : patch.parentId,
       patch.managerEmployeeId === undefined ? null : patch.managerEmployeeId,
       patch.requiredHeadcount ?? null,
       patch.costCenterId ?? null,
       id]
    );
    this.audit(actor, 'تحديث هيكل قسم', id, patch);
  }

  public getOrgTree(branchId = this.branchAccess.getCurrentBranchId()): DepartmentNode[] {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);
    const departments = this.db.query<any>(`
      SELECT d.id, d.name, d.parent_department_id AS parentId, d.manager_employee_id AS managerEmployeeId,
        COALESCE(e.name, '—') AS managerName, COALESCE(d.required_headcount, 0) AS requiredHeadcount
      FROM departments d
      LEFT JOIN employees e ON e.id = d.manager_employee_id
      WHERE d.is_active = 1 AND (d.branch_id = ? OR d.branch_id IS NULL)
      ORDER BY d.name
    `, [branchId]);
    const counts = this.db.query<any>(`
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

  public getVacancies(branchId = this.branchAccess.getCurrentBranchId()): Array<{
    departmentId: string; departmentName: string; required: number; actual: number; vacant: number;
  }> {
    const tree = this.getOrgTree(branchId);
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

  public getJobGrades(branchId = this.branchAccess.getCurrentBranchId()): EmployeeJobGrade[] {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);
    return this.db.query<any>(`
      SELECT id, branch_id AS branchId, name, level, min_salary AS minSalary, max_salary AS maxSalary,
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

  public createJobGrade(input: {
    name: string; branchId?: string; level?: number; minSalary?: number; maxSalary?: number; description?: string;
  }): EmployeeJobGrade {
    const actor = this.requireManage();
    const name = input.name?.trim();
    if (!name) throw new Error('اسم الدرجة الوظيفية مطلوب.');
    const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const id = `grade_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO job_grades (id, branch_id, company_id, name, level, min_salary, max_salary, description)
       VALUES (?, ?, (SELECT company_id FROM branches WHERE id = ?), ?, ?, ?, ?, ?)`,
      [id, branchId, branchId, name, Math.max(1, Number(input.level) || 1),
       Math.max(0, Number(input.minSalary) || 0), Math.max(0, Number(input.maxSalary) || 0),
       input.description?.trim() || null]
    );
    this.audit(actor, 'إضافة درجة وظيفية', id, { name, branchId });
    return this.getJobGrades(branchId).find((row) => row.id === id)!;
  }

  public deactivateJobGrade(id: string): void {
    const actor = this.requireManage();
    this.db.run('UPDATE job_grades SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    this.audit(actor, 'تعطيل درجة وظيفية', id, {});
  }

  public getCostCenters(branchId = this.branchAccess.getCurrentBranchId()): EmployeeCostCenter[] {
    const actor = this.requireView();
    this.branchAccess.requireBranchAccess(branchId, actor);
    return this.db.query<any>(`
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

  public createCostCenter(input: { code: string; name: string; branchId?: string }): EmployeeCostCenter {
    const actor = this.requireManage();
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code) throw new Error('رمز مركز التكلفة مطلوب.');
    if (!name) throw new Error('اسم مركز التكلفة مطلوب.');
    const branchId = input.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const id = `cc_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO cost_centers (id, branch_id, code, name)
       VALUES (?, ?, ?, ?)`,
      [id, branchId, code, name]
    );
    this.audit(actor, 'إضافة مركز تكلفة', id, { code, name, branchId });
    return this.getCostCenters(branchId).find((row) => row.id === id)!;
  }

  public deactivateCostCenter(id: string): void {
    const actor = this.requireManage();
    this.db.run('UPDATE cost_centers SET is_active = 0 WHERE id = ?', [id]);
    this.audit(actor, 'تعطيل مركز تكلفة', id, {});
  }

  public transferEmployee(input: {
    employeeId: string;
    toBranchId?: string | null;
    toDepartmentId?: string | null;
    toJobTitle?: string | null;
    toGradeId?: string | null;
    transferDate: string;
    reason?: string;
  }): EmployeeTransfer {
    const actor = this.requireManage();
    const employee = this.db.query<any>(`
      SELECT id, branch_id AS branchId, department_id AS departmentId, role AS jobTitle, job_grade_id AS gradeId
      FROM employees WHERE id = ?
    `, [input.employeeId])[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    const id = `trf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const toBranchId = input.toBranchId || employee.branchId;
    const toDepartmentId = input.toDepartmentId || employee.departmentId;
    if (input.toDepartmentId) this.requireDepartment(input.toDepartmentId, actor);
    if (toBranchId) this.branchAccess.requireBranchAccess(toBranchId, actor);
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO employee_transfers
           (id, employee_id, from_branch_id, to_branch_id, from_department_id, to_department_id,
            from_job_title, to_job_title, from_grade_id, to_grade_id, transfer_date, reason,
            approved_by, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.employeeId, employee.branchId, toBranchId, employee.departmentId, toDepartmentId,
         employee.jobTitle, input.toJobTitle || employee.jobTitle, employee.gradeId, input.toGradeId || employee.gradeId,
         input.transferDate, input.reason?.trim() || null, actor.id, actor.id]
      );
      db.run(
        `UPDATE employees SET branch_id = ?, department_id = ?, role = COALESCE(?, role),
           job_title = COALESCE(?, job_title), job_grade_id = COALESCE(?, job_grade_id), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [toBranchId, toDepartmentId, input.toJobTitle || null, input.toJobTitle || null,
         input.toGradeId || null, input.employeeId]
      );
      db.run(
        `INSERT INTO employee_lifecycle_events
           (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
         VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?)`,
        [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.transferDate,
         `${employee.branchId || ''}/${employee.departmentId || ''}`,
         `${toBranchId || ''}/${toDepartmentId || ''}`, input.reason?.trim() || null, actor.id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'نقل موظف', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, input.employeeId,
         JSON.stringify({ toBranchId, toDepartmentId, toJobTitle: input.toJobTitle })]
      );
    });
    return {
      id,
      employeeId: input.employeeId,
      fromBranchId: employee.branchId || null,
      toBranchId: toBranchId || null,
      fromDepartmentId: employee.departmentId || null,
      toDepartmentId: toDepartmentId || null,
      fromJobTitle: employee.jobTitle || null,
      toJobTitle: input.toJobTitle || employee.jobTitle || null,
      transferDate: input.transferDate,
      reason: input.reason?.trim() || null,
      status: 'APPROVED',
      approvedBy: actor.id,
      createdAt: new Date().toISOString(),
    };
  }

  public getTransfers(employeeId?: string): EmployeeTransfer[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) {
      where = 'et.employee_id = ?';
      params.push(employeeId);
    }
    return this.db.query<any>(`
      SELECT et.id, et.employee_id AS employeeId, et.from_branch_id AS fromBranchId,
        et.to_branch_id AS toBranchId, et.from_department_id AS fromDepartmentId,
        et.to_department_id AS toDepartmentId, et.from_job_title AS fromJobTitle,
        et.to_job_title AS toJobTitle, et.transfer_date AS transferDate,
        et.reason, et.status, et.approved_by AS approvedBy, et.created_at AS createdAt
      FROM employee_transfers et
      WHERE ${where}
      ORDER BY et.transfer_date DESC, et.created_at DESC
    `, params).map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      fromBranchId: row.fromBranchId || null,
      toBranchId: row.toBranchId || null,
      fromDepartmentId: row.fromDepartmentId || null,
      toDepartmentId: row.toDepartmentId || null,
      fromJobTitle: row.fromJobTitle || null,
      toJobTitle: row.toJobTitle || null,
      transferDate: row.transferDate,
      reason: row.reason || null,
      status: row.status,
      approvedBy: row.approvedBy || null,
      createdAt: row.createdAt,
    }));
  }

  public addLifecycleEvent(input: {
    employeeId: string; eventType: string; eventDate: string;
    fromValue?: string | null; toValue?: string | null; notes?: string;
  }): EmployeeLifecycleEvent {
    const actor = this.requireManage();
    const id = `ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO employee_lifecycle_events
         (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.eventType, input.eventDate,
       input.fromValue || null, input.toValue || null, input.notes?.trim() || null, actor.id]
    );
    this.audit(actor, 'حدث دورة حياة موظف', id, { employeeId: input.employeeId, eventType: input.eventType });
    return {
      id,
      employeeId: input.employeeId,
      eventType: input.eventType,
      eventDate: input.eventDate,
      fromValue: input.fromValue || null,
      toValue: input.toValue || null,
      notes: input.notes?.trim() || null,
      actorId: actor.id,
      createdAt: new Date().toISOString(),
    };
  }

  public getLifecycleEvents(employeeId: string): EmployeeLifecycleEvent[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, employee_id AS employeeId, event_type AS eventType, event_date AS eventDate,
        from_value AS fromValue, to_value AS toValue, notes, actor_id AS actorId, created_at AS createdAt
      FROM employee_lifecycle_events
      WHERE employee_id = ?
      ORDER BY event_date DESC, created_at DESC
    `, [employeeId]).map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      eventType: row.eventType,
      eventDate: row.eventDate,
      fromValue: row.fromValue || null,
      toValue: row.toValue || null,
      notes: row.notes || null,
      actorId: row.actorId || null,
      createdAt: row.createdAt,
    }));
  }

  public createOnboardingChecklist(employeeId: string, tasks?: string[]): EmployeeOnboardingTask[] {
    const actor = this.requireManage();
    const employee = this.db.query<{ id: string }>('SELECT id FROM employees WHERE id = ?', [employeeId])[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    const defaultTasks = tasks && tasks.length ? tasks : [
      'استلام مستندات التعيين',
      'فتح ملف الموظف',
      'تسليم بطاقة/صلاحيات النظام',
      'تسليم العهد والمعدات',
      'شرح سياسات المنشأة',
      'إدخال في أنظمة الحضور والرواتب',
    ];
    const created: EmployeeOnboardingTask[] = [];
    for (const taskName of defaultTasks) {
      const id = `onb_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      this.db.run(
        `INSERT INTO employee_onboarding_tasks (id, employee_id, task_name, category, due_date)
         VALUES (?, ?, ?, 'ONBOARDING', ?)`,
        [id, employeeId, taskName, null]
      );
      created.push(this.getOnboardingTasks(employeeId).find((row) => row.id === id)!);
    }
    this.db.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, notes, actor_id)
       VALUES (?, ?, 'ONBOARDING', ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, localDateString(), 'إنشاء قائمة تأهيل', actor.id]
    );
    return created;
  }

  public getOnboardingTasks(employeeId: string): EmployeeOnboardingTask[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, employee_id AS employeeId, task_name AS taskName, category, due_date AS dueDate,
        status, completed_at AS completedAt, completed_by AS completedBy, notes, created_at AS createdAt
      FROM employee_onboarding_tasks WHERE employee_id = ? ORDER BY created_at
    `, [employeeId]).map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      taskName: row.taskName,
      category: row.category,
      dueDate: row.dueDate || null,
      status: row.status,
      completedAt: row.completedAt || null,
      completedBy: row.completedBy || null,
      notes: row.notes || null,
      createdAt: row.createdAt,
    }));
  }

  public completeOnboardingTask(taskId: string, notes?: string): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE employee_onboarding_tasks
       SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, completed_by = ?, notes = COALESCE(?, notes)
       WHERE id = ?`,
      [actor.id, notes?.trim() || null, taskId]
    );
  }

  public cancelOnboardingTask(taskId: string): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE employee_onboarding_tasks SET status = 'CANCELLED' WHERE id = ?`, [taskId]);
    this.audit(actor, 'إلغاء مهمة تأهيل', taskId, {});
  }

  public assignCustodyItem(input: {
    employeeId: string; itemName: string; itemType?: string; serialNumber?: string; notes?: string;
  }): EmployeeCustodyItem {
    const actor = this.requireManage();
    const id = `cus_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const assignedAt = localDateString();
    this.db.run(
      `INSERT INTO employee_custody_items (id, employee_id, item_name, item_type, serial_number, assigned_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.itemName.trim(), input.itemType || 'EQUIPMENT',
       input.serialNumber?.trim() || null, assignedAt, input.notes?.trim() || null]
    );
    this.db.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
       VALUES (?, ?, 'CUSTODY_ASSIGN', ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, assignedAt,
       input.itemName.trim(), input.notes?.trim() || null, actor.id]
    );
    return this.getCustodyItems(input.employeeId).find((row) => row.id === id)!;
  }

  public returnCustodyItem(id: string, status: 'RETURNED' | 'LOST' = 'RETURNED', notes?: string): void {
    const actor = this.requireManage();
    const item = this.db.query<{ employeeId: string; itemName: string }>(
      'SELECT employee_id AS employeeId, item_name AS itemName FROM employee_custody_items WHERE id = ?',
      [id]
    )[0];
    if (!item) throw new Error('عنصر العهدة غير موجود.');
    this.db.run(
      `UPDATE employee_custody_items SET status = ?, returned_at = ?, notes = COALESCE(?, notes) WHERE id = ?`,
      [status, localDateString(), notes?.trim() || null, id]
    );
    this.db.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
       VALUES (?, ?, 'CUSTODY_RETURN', ?, ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, item.employeeId, localDateString(),
       item.itemName, status, notes?.trim() || null, actor.id]
    );
    this.audit(actor, 'إرجاع عهدة', id, { status });
  }

  public getCustodyItems(employeeId: string): EmployeeCustodyItem[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, employee_id AS employeeId, item_name AS itemName, item_type AS itemType,
        serial_number AS serialNumber, assigned_at AS assignedAt, returned_at AS returnedAt,
        status, notes, created_at AS createdAt
      FROM employee_custody_items WHERE employee_id = ? ORDER BY assigned_at DESC
    `, [employeeId]).map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      itemName: row.itemName,
      itemType: row.itemType,
      serialNumber: row.serialNumber || null,
      assignedAt: row.assignedAt,
      returnedAt: row.returnedAt || null,
      status: row.status,
      notes: row.notes || null,
      createdAt: row.createdAt,
    }));
  }

  public createProbationReview(input: {
    employeeId: string; reviewDate: string; reviewerId?: string; score: number;
    rating?: string; recommendation?: string; notes?: string; status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  }): EmployeeProbationReview {
    const actor = this.requireManage();
    const id = `prb_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO employee_probation_reviews
         (id, employee_id, review_date, reviewer_id, score, rating, recommendation, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.reviewDate, input.reviewerId || actor.id,
       Math.max(0, Number(input.score) || 0), input.rating || 'SATISFACTORY',
       input.recommendation || 'CONTINUE', input.notes?.trim() || null, input.status || 'DRAFT']
    );
    this.db.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
       VALUES (?, ?, 'PROBATION_REVIEW', ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.reviewDate,
       input.recommendation || 'CONTINUE', input.notes?.trim() || null, actor.id]
    );
    return this.getProbationReviews(input.employeeId).find((row) => row.id === id)!;
  }

  public getProbationReviews(employeeId: string): EmployeeProbationReview[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, employee_id AS employeeId, review_date AS reviewDate, reviewer_id AS reviewerId,
        score, rating, recommendation, notes, status, created_at AS createdAt
      FROM employee_probation_reviews WHERE employee_id = ? ORDER BY review_date DESC
    `, [employeeId]).map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      reviewDate: row.reviewDate,
      reviewerId: row.reviewerId || null,
      score: Number(row.score) || 0,
      rating: row.rating,
      recommendation: row.recommendation,
      notes: row.notes || null,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  public submitProbationReview(id: string): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE employee_probation_reviews SET status = 'SUBMITTED' WHERE id = ?`, [id]);
    this.audit(actor, 'تقديم تقييم فترة اختبار', id, {});
  }

  public requestOffboardingApproval(input: {
    employeeId: string; reason: string; branchId?: string;
  }): string {
    const actor = this.requireManage();
    const employee = this.db.query<{ branchId: string | null; name: string }>(
      'SELECT branch_id AS branchId, COALESCE(name, full_name) AS name FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    const branchId = input.branchId || employee.branchId || this.branchAccess.getCurrentBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const approval = new ApprovalService().createRequest({
      requestType: 'OTHER',
      title: `إخلاء طرف وإنهاء خدمة: ${employee.name}`,
      description: input.reason,
      priority: 'HIGH',
      referenceType: 'EMPLOYEE',
      referenceId: input.employeeId,
      branchId,
    });
    this.db.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
       VALUES (?, ?, 'OFFBOARDING_REQUEST', ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, localDateString(),
       'PENDING_APPROVAL', input.reason, actor.id]
    );
    return approval.id;
  }

  public finalizeOffboarding(employeeId: string, terminationDate: string, notes?: string): void {
    const actor = this.requireManage();
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE employees SET status = 'TERMINATED', terminated_at = ?, is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [terminationDate, employeeId]
      );
      db.run(
        `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
         VALUES (?, ?, 'TERMINATION', ?, 'TERMINATED', ?, ?)`,
        [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, terminationDate, notes?.trim() || null, actor.id]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنهاء خدمة', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, employeeId,
         JSON.stringify({ terminationDate, notes })]
      );
    });
  }

  public runProbationCycle(today = localDateString()): string[] {
    const actor = this.requireManage();
    const employees = this.db.query<{ id: string; probationEndDate: string }>(`
      SELECT id, probation_end_date AS probationEndDate
      FROM employees
      WHERE is_active = 1 AND status IN ('PROBATION', 'ACTIVE')
        AND probation_end_date IS NOT NULL AND probation_end_date <= ?
    `, [today]);
    const created: string[] = [];
    for (const employee of employees) {
      const existing = this.db.query<{ id: string }>(
        `SELECT id FROM employee_probation_reviews WHERE employee_id = ? AND review_date >= ?`,
        [employee.id, employee.probationEndDate]
      );
      if (existing.length) continue;
      const review = this.createProbationReview({
        employeeId: employee.id,
        reviewDate: employee.probationEndDate,
        score: 0,
        rating: 'SATISFACTORY',
        recommendation: 'CONTINUE',
        notes: 'تقييم تلقائي (period probation)',
        status: 'DRAFT',
      });
      created.push(review.id);
    }
    this.audit(actor, 'تشغيل دورة تقييم فترة الاختبار', 'SYSTEM', { created: created.length, today });
    return created;
  }

  public promoteEmployee(input: {
    employeeId: string;
    newRole?: string;
    newGradeId?: string | null;
    newBaseSalary?: number;
    effectiveDate: string;
    reason?: string;
    createBonus?: boolean;
    bonusAmount?: number;
  }): void {
    const actor = this.requireManage();
    const employee = this.db.query<{ branchId: string | null; role: string; jobGradeId: string | null; baseSalary: number }>(
      `SELECT branch_id AS branchId, role, job_grade_id AS jobGradeId, base_salary AS baseSalary FROM employees WHERE id = ?`,
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE employees SET role = COALESCE(?, role), job_title = COALESCE(?, job_title),
           job_grade_id = COALESCE(?, job_grade_id), base_salary = COALESCE(?, base_salary),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.newRole || null, input.newRole || null, input.newGradeId || null,
         input.newBaseSalary ?? null, input.employeeId]
      );
      db.run(
        `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
         VALUES (?, ?, 'PROMOTION', ?, ?, ?, ?, ?)`,
        [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.effectiveDate,
         `${employee.role}/${employee.jobGradeId || ''}`,
         `${input.newRole || employee.role}/${input.newGradeId || employee.jobGradeId || ''}`,
         input.reason?.trim() || null, actor.id]
      );
      if (input.createBonus && (input.bonusAmount || 0) > 0) {
        db.run(
          `INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by, branch_id, payment_status)
           VALUES (?, ?, 'BONUS', ?, ?, ?, ?, ?, 'PAID')`,
          [`ptx_${uuidv4().substring(0, 8)}`, input.employeeId, input.bonusAmount, input.effectiveDate,
           `مكافأة ترقية: ${input.reason || ''}`, actor.id, employee.branchId]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'ترقية موظف', 'HR', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, input.employeeId,
         JSON.stringify({ newRole: input.newRole, newGradeId: input.newGradeId, effectiveDate: input.effectiveDate })]
      );
    });
  }

  public notifyHrAlerts(): void {
    AuthService.requireAuth();
    const notifications = new NotificationService();
    const today = localDateString();

    const probationDue = this.db.query<{ id: string; name: string; probationEndDate: string }>(`
      SELECT id, COALESCE(name, full_name) AS name, probation_end_date AS probationEndDate
      FROM employees
      WHERE is_active = 1 AND status IN ('PROBATION','ACTIVE')
        AND probation_end_date IS NOT NULL AND probation_end_date <= ?
    `, [today]);
    for (const employee of probationDue) {
      notifications.createNotification('SYSTEM',
        `تقييم فترة اختبار: ${employee.name}`,
        `انتهت فترة اختبار الموظف ${employee.name} في ${employee.probationEndDate}.`,
        undefined, 'EMPLOYEE_PROBATION', employee.id);
    }

    const overdueOnboarding = this.db.query<{ employeeId: string; count: number }>(`
      SELECT employee_id AS employeeId, COUNT(*) AS count
      FROM employee_onboarding_tasks
      WHERE status = 'PENDING' AND (due_date IS NULL OR due_date <= ?)
      GROUP BY employee_id
    `, [today]);
    for (const row of overdueOnboarding) {
      notifications.createNotification('SYSTEM',
        'مهام تأهيل متأخرة',
        `لدى الموظف ${row.employeeId} ${row.count} مهمة تأهيل متأخرة.`,
        undefined, 'EMPLOYEE_ONBOARDING', row.employeeId);
    }

    const vacancies = this.getVacancies();
    const totalVacant = vacancies.reduce((sum, row) => sum + row.vacant, 0);
    if (totalVacant > 0) {
      notifications.createNotification('SYSTEM',
        'شواغر وظيفية',
        `يوجد ${totalVacant} شاغر وظيفي في الأقسام.`,
        undefined, 'HR_VACANCIES', 'GLOBAL');
    }
  }

  public getOnboardingReport(): Array<{ employeeId: string; total: number; completed: number; pending: number; overdue: number }> {
    this.requireView();
    const today = localDateString();
    const rows = this.db.query<any>(`
      SELECT employee_id AS employeeId,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'PENDING' AND (due_date IS NULL OR due_date <= ?) THEN 1 ELSE 0 END) AS overdue
      FROM employee_onboarding_tasks
      GROUP BY employee_id
    `, [today]);
    return rows.map((row) => ({
      employeeId: row.employeeId,
      total: Number(row.total) || 0,
      completed: Number(row.completed) || 0,
      pending: Number(row.pending) || 0,
      overdue: Number(row.overdue) || 0,
    }));
  }

  public getProbationReport(): Array<{ employeeId: string; reviewDate: string; score: number; rating: string; recommendation: string; status: string }> {
    this.requireView();
    return this.db.query<any>(`
      SELECT employee_id AS employeeId, review_date AS reviewDate, score, rating, recommendation, status
      FROM employee_probation_reviews
      ORDER BY review_date DESC
    `).map((row) => ({
      employeeId: row.employeeId,
      reviewDate: row.reviewDate,
      score: Number(row.score) || 0,
      rating: row.rating,
      recommendation: row.recommendation,
      status: row.status,
    }));
  }

}
