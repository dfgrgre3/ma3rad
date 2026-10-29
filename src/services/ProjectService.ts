import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
import { localDateString } from '../utils/date';
import { ModuleRegistryService } from './ModuleRegistryService';

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectType = 'BUILDING' | 'VILLA' | 'APARTMENT' | 'COMPOUND' | 'COMMERCIAL' | 'OTHER';

export interface Project {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  branchId?: string | null;
  projectType: ProjectType;
  contractorName?: string | null;
  contractorPhone?: string | null;
  engineerName?: string | null;
  engineerPhone?: string | null;
  address?: string | null;
  city?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  contractValue: number;
  totalSold: number;
  totalPaid: number;
  outstandingAmount: number;
  status: ProjectStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  unitsCount?: number;
  deliveredUnits?: number;
  invoicedAmount?: number;
}

export interface ProjectUnit {
  id: string;
  projectId: string;
  parentId?: string | null;
  unitType: 'BUILDING' | 'FLOOR' | 'APARTMENT' | 'ROOM';
  name: string;
  areaM2: number;
  sortOrder: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DELIVERED';
  notes?: string | null;
  createdAt: string;
}

export interface ProjectProduct {
  id: string;
  projectId: string;
  unitId?: string | null;
  unitName?: string;
  productId: string;
  productName: string;
  plannedQuantityM2: number;
  deliveredQuantityM2: number;
  agreedPriceM2: number;
  notes?: string | null;
  createdAt: string;
}

export type ProjectTaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type ProjectTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProjectRiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ProjectRiskProbability = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProjectRiskStatus = 'OPEN' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED';
export type ProjectChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ProjectDeliverableStatus = 'PENDING' | 'IN_PROGRESS' | 'DELIVERED' | 'ACCEPTED' | 'REJECTED';

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  assigneeName: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  progress: number;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dependencyIds?: string[];
}

export interface ProjectTaskDependency {
  id: string;
  projectId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface ProjectTimeEntry {
  id: string;
  projectId: string;
  taskId: string | null;
  taskTitle?: string | null;
  employeeName: string | null;
  entryDate: string;
  hours: number;
  description: string | null;
  billable: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ProjectBudgetLine {
  id: string;
  projectId: string;
  category: string;
  description: string | null;
  plannedAmount: number;
  actualAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBudgetSummary {
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  contractValue: number;
  remainingContract: number;
  byCategory: Array<{ category: string; plannedAmount: number; actualAmount: number }>;
}

export interface ProjectTimeSummary {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  byTask: Array<{ taskId: string | null; taskTitle: string; hours: number }>;
}

export interface ProjectRisk {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  severity: ProjectRiskSeverity;
  probability: ProjectRiskProbability;
  status: ProjectRiskStatus;
  mitigation: string | null;
  ownerName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChangeRequest {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  costImpact: number;
  timeImpactDays: number;
  status: ProjectChangeStatus;
  requestedBy: string | null;
  requesterName?: string | null;
  decidedBy: string | null;
  deciderName?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDeliverable {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: ProjectDeliverableStatus;
  deliveredAt: string | null;
  acceptedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const TASK_STATUSES: ProjectTaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const TASK_PRIORITIES: ProjectTaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const RISK_SEVERITIES: ProjectRiskSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const RISK_PROBABILITIES: ProjectRiskProbability[] = ['LOW', 'MEDIUM', 'HIGH'];
const RISK_STATUSES: ProjectRiskStatus[] = ['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED'];
const DELIVERABLE_STATUSES: ProjectDeliverableStatus[] = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'REJECTED'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string | undefined | null, label: string): void {
  if (!value) return;
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD.`);
  }
}

function assertAmount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} يجب أن يكون رقماً غير سالب.`);
}

export class ProjectService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private scopedProject(id: string): Project | null {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.sqlScope('p.branch_id', undefined, actor);
    const rows = this.db.query<Project>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
       FROM projects p JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], progress: this.computeProgress(rows[0]) };
  }

  private requireProject(id: string): Project {
    const project = this.scopedProject(id);
    if (!project) throw new Error('المشروع غير موجود أو ليس لديك صلاحية الوصول إليه.');
    return project;
  }

  private requireWrite(permission: 'projects.create' | 'projects.update' | 'projects.delete'): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, permission);
  }

  public getProjects(search = '', status?: string): Project[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    const scope = this.branchAccess.sqlScope('p.branch_id', undefined, actor);
    let sql = `
      SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE ${scope.clause}`;
    const params: any[] = [...scope.params];
    if (search.trim()) {
      sql += ` AND (p.name LIKE ? OR p.code LIKE ? OR c.name LIKE ? OR p.contractor_name LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (status && status !== 'ALL') {
      sql += ` AND p.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY p.created_at DESC`;

    return this.db.query<Project>(sql, params).map((p) => ({
      ...p,
      progress: this.computeProgress(p),
    }));
  }

  private computeProgress(p: Project): number {
    if (p.status === 'COMPLETED') return 100;
    if (p.status === 'CANCELLED') return 0;
    if (p.unitsCount && p.unitsCount > 0) {
      return Math.round(((p.deliveredUnits || 0) / p.unitsCount) * 100);
    }
    return p.status === 'ACTIVE' ? 25 : p.status === 'ON_HOLD' ? 15 : 0;
  }

  public getProjectById(id: string): Project | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    return this.scopedProject(id);
  }

  public createProject(input: {
    name: string; customerId: string; projectType?: ProjectType; branchId?: string;
    contractorName?: string; contractorPhone?: string; engineerName?: string; engineerPhone?: string;
    address?: string; city?: string; startDate?: string; expectedEndDate?: string;
    contractValue?: number; status?: ProjectStatus; notes?: string;
  }): Project {
    const actor = AuthService.requireAuth();
    this.requireWrite('projects.create');
    if (!input.name.trim()) throw new Error('اسم المشروع مطلوب.');
    if (!input.customerId) throw new Error('يجب اختيار العميل.');

    const customer = this.db.query<{ id: string }>('SELECT id FROM customers WHERE id = ?', [input.customerId])[0];
    if (!customer) throw new Error('العميل المحدد غير موجود.');

    const branchId = input.branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);

    const id = `prj_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PRJ');
      db.run(
        `INSERT INTO projects (
          id, code, name, customer_id, branch_id, project_type, contractor_name, contractor_phone,
          engineer_name, engineer_phone, address, city, start_date, expected_end_date,
          contract_value, outstanding_amount, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.customerId, branchId, input.projectType || 'BUILDING',
          input.contractorName || null, input.contractorPhone || null,
          input.engineerName || null, input.engineerPhone || null,
          input.address || null, input.city || null, input.startDate || null,
          input.expectedEndDate || null, input.contractValue || 0, input.contractValue || 0,
          input.status || 'PLANNED', input.notes || null, actor.id,
        ]
      );
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إضافة مشروع جديد', 'PROJECTS', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ name: input.name, branchId })]
      );
      return this.scopedProject(id)!;
    });
  }

  public updateProject(id: string, patch: Partial<Project>): Project {
    const actor = AuthService.requireAuth();
    this.requireWrite('projects.update');
    const existing = this.requireProject(id);
    if (patch.branchId) this.branchAccess.requireBranchAccess(patch.branchId, actor);

    this.db.run(
      `UPDATE projects SET
        name = COALESCE(?, name), project_type = COALESCE(?, project_type),
        branch_id = COALESCE(?, branch_id),
        contractor_name = COALESCE(?, contractor_name), contractor_phone = COALESCE(?, contractor_phone),
        engineer_name = COALESCE(?, engineer_name), engineer_phone = COALESCE(?, engineer_phone),
        address = COALESCE(?, address), city = COALESCE(?, city),
        start_date = COALESCE(?, start_date), expected_end_date = COALESCE(?, expected_end_date),
        actual_end_date = ?, contract_value = COALESCE(?, contract_value),
        total_paid = COALESCE(?, total_paid), outstanding_amount = COALESCE(?, outstanding_amount),
        status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ?
      WHERE id = ?`,
      [
        patch.name ?? null, patch.projectType ?? null, patch.branchId ?? null,
        patch.contractorName ?? null, patch.contractorPhone ?? null,
        patch.engineerName ?? null, patch.engineerPhone ?? null,
        patch.address ?? null, patch.city ?? null, patch.startDate ?? null,
        patch.expectedEndDate ?? null,
        patch.status === 'COMPLETED' ? localDateString() : existing.actualEndDate ?? null,
        patch.contractValue ?? null, patch.totalPaid ?? null, patch.outstandingAmount ?? null,
        patch.status ?? null, patch.notes ?? null, new Date().toISOString(), id,
      ]
    );
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
       VALUES (?, ?, ?, 'تعديل مشروع', 'PROJECTS', ?, ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(existing), JSON.stringify(patch)]
    );
    return this.requireProject(id);
  }

  public deleteProject(id: string): void {
    const actor = AuthService.requireAuth();
    this.requireWrite('projects.delete');
    this.requireProject(id);
    const linkedInvoices = this.db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sales_invoices WHERE project_id = ? AND invoice_status != 'VOID'`,
      [id]
    )[0]?.count ?? 0;
    if (Number(linkedInvoices) > 0) {
      throw new Error('لا يمكن حذف مشروع مرتبط بفواتير بيع. أغلق المشروع أو ألغِ الفواتير أولاً.');
    }
    this.db.run(`DELETE FROM projects WHERE id = ?`, [id]);
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
       VALUES (?, ?, ?, 'حذف مشروع', 'PROJECTS', ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id]
    );
  }

  public getUnits(projectId: string): ProjectUnit[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectUnit>(
      `SELECT * FROM project_units WHERE project_id = ? ORDER BY sort_order, name`,
      [projectId]
    );
  }

  public createUnit(input: {
    projectId: string; parentId?: string; unitType: ProjectUnit['unitType'];
    name: string; areaM2?: number; status?: ProjectUnit['status']; notes?: string;
  }): ProjectUnit {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.name.trim()) throw new Error('اسم الوحدة مطلوب.');
    if (input.parentId) {
      const parent = this.db.query<{ projectId: string }>(
        `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
        [input.parentId]
      )[0];
      if (!parent || parent.projectId !== input.projectId) {
        throw new Error('الوحدة الأصلية لا تتبع المشروع المحدد.');
      }
    }
    const id = `unit_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO project_units (id, project_id, parent_id, unit_type, name, area_m2, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.parentId || null, input.unitType, input.name.trim(),
        input.areaM2 || 0, input.status || 'PENDING', input.notes || null,
      ]
    );
    return this.db.query<ProjectUnit>(`SELECT * FROM project_units WHERE id = ?`, [id])[0];
  }

  public updateUnit(id: string, patch: Partial<ProjectUnit>): void {
    this.requireWrite('projects.update');
    const unit = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
      [id]
    )[0];
    if (!unit) throw new Error('الوحدة غير موجودة.');
    this.requireProject(unit.projectId);
    this.db.run(
      `UPDATE project_units SET
        name = COALESCE(?, name), unit_type = COALESCE(?, unit_type),
        area_m2 = COALESCE(?, area_m2), status = COALESCE(?, status), notes = COALESCE(?, notes)
       WHERE id = ?`,
      [patch.name ?? null, patch.unitType ?? null, patch.areaM2 ?? null, patch.status ?? null, patch.notes ?? null, id]
    );
  }

  public deleteUnit(id: string): void {
    this.requireWrite('projects.update');
    const unit = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
      [id]
    )[0];
    if (!unit) throw new Error('الوحدة غير موجودة.');
    this.requireProject(unit.projectId);
    this.db.run(`DELETE FROM project_units WHERE id = ?`, [id]);
  }

  public getProjectProducts(projectId: string): ProjectProduct[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectProduct>(
      `SELECT pp.*, u.name AS unit_name FROM project_products pp
       LEFT JOIN project_units u ON u.id = pp.unit_id
       WHERE pp.project_id = ? ORDER BY pp.created_at`,
      [projectId]
    );
  }

  public addProjectProduct(input: {
    projectId: string; unitId?: string; productId: string; plannedQuantityM2: number;
    agreedPriceM2?: number; notes?: string;
  }): ProjectProduct {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    const product = this.db.query<{ name: string }>(`SELECT name FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج غير موجود.');
    if (!(input.plannedQuantityM2 > 0)) throw new Error('الكمية المخططة يجب أن تكون أكبر من صفر.');
    if (input.unitId) {
      const unit = this.db.query<{ projectId: string }>(
        `SELECT project_id AS projectId FROM project_units WHERE id = ?`,
        [input.unitId]
      )[0];
      if (!unit || unit.projectId !== input.projectId) {
        throw new Error('الوحدة المحددة لا تتبع المشروع.');
      }
    }

    const id = `pp_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO project_products (id, project_id, unit_id, product_id, product_name, planned_quantity_m2, agreed_price_m2, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.unitId || null, input.productId, product.name,
        input.plannedQuantityM2, input.agreedPriceM2 || 0, input.notes || null,
      ]
    );
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [input.projectId, new Date().toISOString(), input.projectId]
    );
    return this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];
  }

  public updateProjectProduct(id: string, patch: { deliveredQuantityM2?: number; agreedPriceM2?: number; notes?: string }): void {
    this.requireWrite('projects.update');
    const existing = this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('بند المشروع غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(
      `UPDATE project_products SET
        delivered_quantity_m2 = COALESCE(?, delivered_quantity_m2),
        agreed_price_m2 = COALESCE(?, agreed_price_m2),
        notes = COALESCE(?, notes) WHERE id = ?`,
      [patch.deliveredQuantityM2 ?? null, patch.agreedPriceM2 ?? null, patch.notes ?? null, id]
    );
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [existing.projectId, new Date().toISOString(), existing.projectId]
    );
  }

  public deleteProjectProduct(id: string): void {
    this.requireWrite('projects.update');
    const existing = this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];
    if (!existing) return;
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_products WHERE id = ?`, [id]);
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [existing.projectId, new Date().toISOString(), existing.projectId]
    );
  }

  // ─── Project controls ────────────────────────────────────────────────────────

  private requireApprove(): void {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('projects');
    PermissionService.require(actor, 'projects.approve');
  }

  private audit(action: string, recordId: string, values?: unknown): void {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId,
        values === undefined ? null : JSON.stringify(values),
      ]
    );
  }

  private requireTask(projectId: string, taskId: string): ProjectTask {
    const task = this.db.query<ProjectTask>(
      `SELECT * FROM project_tasks WHERE id = ? AND project_id = ?`,
      [taskId, projectId]
    )[0];
    if (!task) throw new Error('المهمة غير موجودة داخل هذا المشروع.');
    return task;
  }

  public getTasks(projectId: string): ProjectTask[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    const tasks = this.db.query<ProjectTask>(
      `SELECT * FROM project_tasks WHERE project_id = ? ORDER BY sort_order, created_at`,
      [projectId]
    );
    if (tasks.length === 0) return tasks;
    const dependencies = this.db.query<ProjectTaskDependency>(
      `SELECT * FROM project_task_dependencies WHERE project_id = ?`,
      [projectId]
    );
    return tasks.map((task) => ({
      ...task,
      progress: Number(task.progress) || 0,
      dependencyIds: dependencies
        .filter((dependency) => dependency.taskId === task.id)
        .map((dependency) => dependency.dependsOnTaskId),
    }));
  }

  public createTask(input: {
    projectId: string; title: string; description?: string; status?: ProjectTaskStatus;
    priority?: ProjectTaskPriority; assigneeName?: string; startDate?: string; dueDate?: string;
    progress?: number; sortOrder?: number;
  }): ProjectTask {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان المهمة مطلوب.');
    const status = input.status || 'TODO';
    if (!TASK_STATUSES.includes(status)) throw new Error('حالة المهمة غير صالحة.');
    const priority = input.priority || 'MEDIUM';
    if (!TASK_PRIORITIES.includes(priority)) throw new Error('أولوية المهمة غير صالحة.');
    const progress = input.progress ?? (status === 'DONE' ? 100 : 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new Error('نسبة إنجاز المهمة يجب أن تكون بين 0 و100.');
    }
    assertDate(input.startDate, 'تاريخ بداية المهمة');
    assertDate(input.dueDate, 'تاريخ استحقاق المهمة');
    if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
      throw new Error('تاريخ استحقاق المهمة يجب أن يكون بعد تاريخ البداية.');
    }

    const actor = AuthService.requireAuth();
    const id = `task_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_tasks (
         id, project_id, title, description, status, priority, assignee_name,
         start_date, due_date, completed_at, progress, sort_order, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null, status, priority,
        input.assigneeName?.trim() || null, input.startDate || null, input.dueDate || null,
        status === 'DONE' ? now : null, Math.round(progress), input.sortOrder ?? 0, actor.id, now, now,
      ]
    );
    this.audit('إضافة مهمة مشروع', id, { projectId: input.projectId, title: input.title.trim(), status });
    return this.requireTask(input.projectId, id);
  }

  public updateTask(id: string, patch: {
    title?: string; description?: string; status?: ProjectTaskStatus; priority?: ProjectTaskPriority;
    assigneeName?: string; startDate?: string | null; dueDate?: string | null;
    progress?: number; sortOrder?: number;
  }): ProjectTask {
    this.requireWrite('projects.update');
    const location = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_tasks WHERE id = ?`,
      [id]
    )[0];
    if (!location) throw new Error('المهمة غير موجودة.');
    this.requireProject(location.projectId);
    const existing = this.requireTask(location.projectId, id);

    if (patch.status && !TASK_STATUSES.includes(patch.status)) throw new Error('حالة المهمة غير صالحة.');
    if (patch.priority && !TASK_PRIORITIES.includes(patch.priority)) throw new Error('أولوية المهمة غير صالحة.');
    if (patch.progress !== undefined && (!Number.isFinite(patch.progress) || patch.progress < 0 || patch.progress > 100)) {
      throw new Error('نسبة إنجاز المهمة يجب أن تكون بين 0 و100.');
    }
    assertDate(patch.startDate, 'تاريخ بداية المهمة');
    assertDate(patch.dueDate, 'تاريخ استحقاق المهمة');

    const status = patch.status ?? existing.status;
    const progress = status === 'DONE'
      ? 100
      : patch.progress ?? Number(existing.progress) ?? 0;
    const completedAt = status === 'DONE'
      ? existing.completedAt || new Date().toISOString()
      : null;

    this.db.run(
      `UPDATE project_tasks SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         status = ?, priority = COALESCE(?, priority),
         assignee_name = COALESCE(?, assignee_name),
         start_date = COALESCE(?, start_date), due_date = COALESCE(?, due_date),
         completed_at = ?, progress = ?, sort_order = COALESCE(?, sort_order),
         updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null, status,
        patch.priority ?? null, patch.assigneeName?.trim() || null,
        patch.startDate ?? null, patch.dueDate ?? null,
        completedAt, Math.round(progress), patch.sortOrder ?? null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل مهمة مشروع', id, patch);
    return this.requireTask(location.projectId, id);
  }

  public deleteTask(id: string): void {
    this.requireWrite('projects.update');
    const location = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_tasks WHERE id = ?`,
      [id]
    )[0];
    if (!location) throw new Error('المهمة غير موجودة.');
    this.requireProject(location.projectId);
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM project_task_dependencies WHERE task_id = ? OR depends_on_task_id = ?`, [id, id]);
      db.run(`DELETE FROM project_tasks WHERE id = ?`, [id]);
    });
    this.audit('حذف مهمة مشروع', id, { projectId: location.projectId });
  }

  public addTaskDependency(input: { projectId: string; taskId: string; dependsOnTaskId: string }): ProjectTaskDependency {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (input.taskId === input.dependsOnTaskId) throw new Error('لا يمكن أن تعتمد المهمة على نفسها.');
    this.requireTask(input.projectId, input.taskId);
    this.requireTask(input.projectId, input.dependsOnTaskId);

    const duplicate = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`,
      [input.taskId, input.dependsOnTaskId]
    )[0];
    if (duplicate) throw new Error('هذه التبعية مسجلة بالفعل.');

    // Reject cycles: the dependency target must not already (transitively) depend on the task.
    const edges = this.db.query<{ taskId: string; dependsOnTaskId: string }>(
      `SELECT task_id AS taskId, depends_on_task_id AS dependsOnTaskId
       FROM project_task_dependencies WHERE project_id = ?`,
      [input.projectId]
    );
    const stack = [input.dependsOnTaskId];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === input.taskId) throw new Error('هذه التبعية تنشئ حلقة دائرية بين المهام.');
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges) {
        if (edge.taskId === current) stack.push(edge.dependsOnTaskId);
      }
    }

    const id = `dep_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_task_dependencies (id, project_id, task_id, depends_on_task_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.projectId, input.taskId, input.dependsOnTaskId, new Date().toISOString()]
    );
    this.audit('إضافة تبعية مهمة', id, input);
    return this.db.query<ProjectTaskDependency>(
      `SELECT * FROM project_task_dependencies WHERE id = ?`,
      [id]
    )[0];
  }

  public removeTaskDependency(projectId: string, dependencyId: string): void {
    this.requireWrite('projects.update');
    this.requireProject(projectId);
    const dependency = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies WHERE id = ? AND project_id = ?`,
      [dependencyId, projectId]
    )[0];
    if (!dependency) throw new Error('التبعية غير موجودة.');
    this.db.run(`DELETE FROM project_task_dependencies WHERE id = ?`, [dependencyId]);
    this.audit('حذف تبعية مهمة', dependencyId, { projectId });
  }

  public removeTaskDependencyByPair(projectId: string, taskId: string, dependsOnTaskId: string): void {
    this.requireWrite('projects.update');
    this.requireProject(projectId);
    const dependency = this.db.query<{ id: string }>(
      `SELECT id FROM project_task_dependencies
       WHERE project_id = ? AND task_id = ? AND depends_on_task_id = ?`,
      [projectId, taskId, dependsOnTaskId]
    )[0];
    if (!dependency) throw new Error('التبعية غير موجودة.');
    this.removeTaskDependency(projectId, dependency.id);
  }

  public getTimeEntries(projectId: string): ProjectTimeEntry[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectTimeEntry>(
      `SELECT t.*, task.title AS task_title
       FROM project_time_entries t
       LEFT JOIN project_tasks task ON task.id = t.task_id
       WHERE t.project_id = ?
       ORDER BY t.entry_date DESC, t.created_at DESC`,
      [projectId]
    );
  }

  public addTimeEntry(input: {
    projectId: string; taskId?: string; employeeName?: string; entryDate: string;
    hours: number; description?: string; billable?: boolean;
  }): ProjectTimeEntry {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.entryDate) throw new Error('تاريخ تسجيل الوقت مطلوب.');
    assertDate(input.entryDate, 'تاريخ تسجيل الوقت');
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
      throw new Error('عدد الساعات يجب أن يكون أكبر من صفر ولا يتجاوز 24.');
    }
    if (input.taskId) this.requireTask(input.projectId, input.taskId);

    const actor = AuthService.requireAuth();
    const id = `time_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_time_entries (
         id, project_id, task_id, employee_name, entry_date, hours, description, billable, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.taskId || null, input.employeeName?.trim() || null,
        input.entryDate, input.hours, input.description?.trim() || null,
        input.billable === false ? 0 : 1, actor.id, new Date().toISOString(),
      ]
    );
    this.audit('تسجيل وقت مشروع', id, { projectId: input.projectId, hours: input.hours });
    return this.getTimeEntries(input.projectId).find((entry) => entry.id === id)!;
  }

  public deleteTimeEntry(id: string): void {
    this.requireWrite('projects.update');
    const entry = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_time_entries WHERE id = ?`,
      [id]
    )[0];
    if (!entry) throw new Error('سجل الوقت غير موجود.');
    this.requireProject(entry.projectId);
    this.db.run(`DELETE FROM project_time_entries WHERE id = ?`, [id]);
    this.audit('حذف سجل وقت مشروع', id, { projectId: entry.projectId });
  }

  public getTimeSummary(projectId: string): ProjectTimeSummary {
    const entries = this.getTimeEntries(projectId);
    const summary: ProjectTimeSummary = {
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      byTask: [],
    };
    const byTask = new Map<string, { taskId: string | null; taskTitle: string; hours: number }>();
    for (const entry of entries) {
      const hours = Number(entry.hours) || 0;
      summary.totalHours += hours;
      if (Number(entry.billable) === 1) summary.billableHours += hours;
      else summary.nonBillableHours += hours;
      const key = entry.taskId || '__none__';
      const current = byTask.get(key) || {
        taskId: entry.taskId || null,
        taskTitle: entry.taskTitle || 'بدون مهمة',
        hours: 0,
      };
      current.hours += hours;
      byTask.set(key, current);
    }
    summary.byTask = [...byTask.values()].sort((a, b) => b.hours - a.hours);
    return summary;
  }

  public getBudgetLines(projectId: string): ProjectBudgetLine[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectBudgetLine>(
      `SELECT * FROM project_budget_lines WHERE project_id = ? ORDER BY category, created_at`,
      [projectId]
    );
  }

  public addBudgetLine(input: {
    projectId: string; category: string; description?: string;
    plannedAmount: number; actualAmount?: number; notes?: string;
  }): ProjectBudgetLine {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.category?.trim()) throw new Error('بند الميزانية مطلوب.');
    assertAmount(input.plannedAmount, 'المبلغ المخطط');
    assertAmount(input.actualAmount ?? 0, 'المبلغ الفعلي');

    const id = `bud_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_budget_lines (
         id, project_id, category, description, planned_amount, actual_amount, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.category.trim(), input.description?.trim() || null,
        input.plannedAmount, input.actualAmount ?? 0, input.notes?.trim() || null, now, now,
      ]
    );
    this.audit('إضافة بند ميزانية مشروع', id, { projectId: input.projectId, category: input.category.trim() });
    return this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0];
  }

  public updateBudgetLine(id: string, patch: {
    category?: string; description?: string; plannedAmount?: number; actualAmount?: number; notes?: string;
  }): ProjectBudgetLine {
    this.requireWrite('projects.update');
    const existing = this.db.query<ProjectBudgetLine>(
      `SELECT * FROM project_budget_lines WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('بند الميزانية غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.category !== undefined && !patch.category.trim()) throw new Error('بند الميزانية مطلوب.');
    if (patch.plannedAmount !== undefined) assertAmount(patch.plannedAmount, 'المبلغ المخطط');
    if (patch.actualAmount !== undefined) assertAmount(patch.actualAmount, 'المبلغ الفعلي');

    this.db.run(
      `UPDATE project_budget_lines SET
         category = COALESCE(?, category), description = COALESCE(?, description),
         planned_amount = COALESCE(?, planned_amount), actual_amount = COALESCE(?, actual_amount),
         notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        patch.category?.trim() || null, patch.description?.trim() || null,
        patch.plannedAmount ?? null, patch.actualAmount ?? null,
        patch.notes?.trim() || null, new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل بند ميزانية مشروع', id, patch);
    return this.db.query<ProjectBudgetLine>(`SELECT * FROM project_budget_lines WHERE id = ?`, [id])[0];
  }

  public deleteBudgetLine(id: string): void {
    this.requireWrite('projects.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_budget_lines WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('بند الميزانية غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_budget_lines WHERE id = ?`, [id]);
    this.audit('حذف بند ميزانية مشروع', id, { projectId: existing.projectId });
  }

  public getBudgetSummary(projectId: string): ProjectBudgetSummary {
    const lines = this.getBudgetLines(projectId);
    const project = this.requireProject(projectId);
    const byCategory = new Map<string, { category: string; plannedAmount: number; actualAmount: number }>();
    let plannedTotal = 0;
    let actualTotal = 0;
    for (const line of lines) {
      const planned = Number(line.plannedAmount) || 0;
      const actual = Number(line.actualAmount) || 0;
      plannedTotal += planned;
      actualTotal += actual;
      const current = byCategory.get(line.category) || {
        category: line.category,
        plannedAmount: 0,
        actualAmount: 0,
      };
      current.plannedAmount += planned;
      current.actualAmount += actual;
      byCategory.set(line.category, current);
    }
    return {
      plannedTotal,
      actualTotal,
      variance: plannedTotal - actualTotal,
      contractValue: Number(project.contractValue) || 0,
      remainingContract: (Number(project.contractValue) || 0) - actualTotal,
      byCategory: [...byCategory.values()].sort((a, b) => b.plannedAmount - a.plannedAmount),
    };
  }

  public getRisks(projectId: string): ProjectRisk[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectRisk>(
      `SELECT * FROM project_risks WHERE project_id = ? ORDER BY
         CASE status WHEN 'OPEN' THEN 0 WHEN 'MITIGATED' THEN 1 WHEN 'ACCEPTED' THEN 2 ELSE 3 END,
         CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         created_at DESC`,
      [projectId]
    );
  }

  public createRisk(input: {
    projectId: string; title: string; description?: string; severity?: ProjectRiskSeverity;
    probability?: ProjectRiskProbability; mitigation?: string; ownerName?: string;
  }): ProjectRisk {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان الخطر مطلوب.');
    const severity = input.severity || 'MEDIUM';
    if (!RISK_SEVERITIES.includes(severity)) throw new Error('درجة الخطورة غير صالحة.');
    const probability = input.probability || 'MEDIUM';
    if (!RISK_PROBABILITIES.includes(probability)) throw new Error('احتمالية الخطر غير صالحة.');

    const actor = AuthService.requireAuth();
    const id = `risk_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_risks (
         id, project_id, title, description, severity, probability, status,
         mitigation, owner_name, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        severity, probability, input.mitigation?.trim() || null,
        input.ownerName?.trim() || null, actor.id, now, now,
      ]
    );
    this.audit('إضافة خطر مشروع', id, { projectId: input.projectId, title: input.title.trim(), severity });
    return this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
  }

  public updateRisk(id: string, patch: {
    title?: string; description?: string; severity?: ProjectRiskSeverity;
    probability?: ProjectRiskProbability; status?: ProjectRiskStatus;
    mitigation?: string; ownerName?: string;
  }): ProjectRisk {
    this.requireWrite('projects.update');
    const existing = this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('الخطر غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('عنوان الخطر مطلوب.');
    if (patch.severity && !RISK_SEVERITIES.includes(patch.severity)) throw new Error('درجة الخطورة غير صالحة.');
    if (patch.probability && !RISK_PROBABILITIES.includes(patch.probability)) throw new Error('احتمالية الخطر غير صالحة.');
    if (patch.status && !RISK_STATUSES.includes(patch.status)) throw new Error('حالة الخطر غير صالحة.');

    this.db.run(
      `UPDATE project_risks SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         severity = COALESCE(?, severity), probability = COALESCE(?, probability),
         status = COALESCE(?, status), mitigation = COALESCE(?, mitigation),
         owner_name = COALESCE(?, owner_name), updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null,
        patch.severity ?? null, patch.probability ?? null, patch.status ?? null,
        patch.mitigation?.trim() || null, patch.ownerName?.trim() || null,
        new Date().toISOString(), id,
      ]
    );
    this.audit('تعديل خطر مشروع', id, patch);
    return this.db.query<ProjectRisk>(`SELECT * FROM project_risks WHERE id = ?`, [id])[0];
  }

  public deleteRisk(id: string): void {
    this.requireWrite('projects.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_risks WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('الخطر غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_risks WHERE id = ?`, [id]);
    this.audit('حذف خطر مشروع', id, { projectId: existing.projectId });
  }

  public getChangeRequests(projectId: string): ProjectChangeRequest[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectChangeRequest>(
      `SELECT c.*, ru.full_name AS requester_name, du.full_name AS decider_name
       FROM project_change_requests c
       LEFT JOIN users ru ON ru.id = c.requested_by
       LEFT JOIN users du ON du.id = c.decided_by
       WHERE c.project_id = ?
       ORDER BY CASE c.status WHEN 'PENDING' THEN 0 ELSE 1 END, c.created_at DESC`,
      [projectId]
    );
  }

  public createChangeRequest(input: {
    projectId: string; title: string; description?: string;
    costImpact?: number; timeImpactDays?: number;
  }): ProjectChangeRequest {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان طلب التغيير مطلوب.');
    const costImpact = input.costImpact ?? 0;
    if (!Number.isFinite(costImpact)) throw new Error('الأثر المالي غير صالح.');
    const timeImpactDays = input.timeImpactDays ?? 0;
    if (!Number.isInteger(timeImpactDays)) throw new Error('الأثر الزمني يجب أن يكون عدداً صحيحاً من الأيام.');

    const actor = AuthService.requireAuth();
    const id = `chg_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_change_requests (
         id, project_id, title, description, cost_impact, time_impact_days, status,
         requested_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        costImpact, timeImpactDays, actor.id, now, now,
      ]
    );
    this.audit('طلب تغيير مشروع', id, { projectId: input.projectId, title: input.title.trim(), costImpact, timeImpactDays });
    return this.getChangeRequests(input.projectId).find((request) => request.id === id)!;
  }

  public decideChangeRequest(id: string, decision: 'APPROVED' | 'REJECTED', note?: string): ProjectChangeRequest {
    this.requireApprove();
    const existing = this.db.query<{ projectId: string; status: ProjectChangeStatus }>(
      `SELECT project_id AS projectId, status FROM project_change_requests WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('طلب التغيير غير موجود.');
    this.requireProject(existing.projectId);
    if (existing.status !== 'PENDING') throw new Error('لا يمكن البت في طلب تغيير ليس قيد الانتظار.');

    const actor = AuthService.requireAuth();
    this.db.run(
      `UPDATE project_change_requests SET
         status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [decision, actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.audit(decision === 'APPROVED' ? 'اعتماد طلب تغيير' : 'رفض طلب تغيير', id, { decision, note: note || null });
    return this.getChangeRequests(existing.projectId).find((request) => request.id === id)!;
  }

  public cancelChangeRequest(id: string, note?: string): ProjectChangeRequest {
    const actor = AuthService.requireAuth();
    this.requireWrite('projects.update');
    const existing = this.db.query<{ projectId: string; status: ProjectChangeStatus; requestedBy: string | null }>(
      `SELECT project_id AS projectId, status, requested_by AS requestedBy
       FROM project_change_requests WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('طلب التغيير غير موجود.');
    this.requireProject(existing.projectId);
    if (existing.status !== 'PENDING') throw new Error('لا يمكن إلغاء طلب تغيير تم البت فيه.');
    if (existing.requestedBy !== actor.id && !PermissionService.can(actor, 'projects.approve')) {
      throw new Error('ليس لديك صلاحية إلغاء طلب التغيير هذا.');
    }
    this.db.run(
      `UPDATE project_change_requests SET
         status = 'CANCELLED', decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ?
       WHERE id = ?`,
      [actor.id, new Date().toISOString(), note?.trim() || null, new Date().toISOString(), id]
    );
    this.audit('إلغاء طلب تغيير', id, { note: note || null });
    return this.getChangeRequests(existing.projectId).find((request) => request.id === id)!;
  }

  public getDeliverables(projectId: string): ProjectDeliverable[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.view');
    this.requireProject(projectId);
    return this.db.query<ProjectDeliverable>(
      `SELECT * FROM project_deliverables WHERE project_id = ?
       ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3 END,
                due_date, created_at`,
      [projectId]
    );
  }

  public createDeliverable(input: {
    projectId: string; title: string; description?: string; dueDate?: string; notes?: string;
  }): ProjectDeliverable {
    this.requireWrite('projects.update');
    this.requireProject(input.projectId);
    if (!input.title?.trim()) throw new Error('عنوان المخرج مطلوب.');
    assertDate(input.dueDate, 'تاريخ استحقاق المخرج');

    const id = `dlv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO project_deliverables (
         id, project_id, title, description, due_date, status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        id, input.projectId, input.title.trim(), input.description?.trim() || null,
        input.dueDate || null, input.notes?.trim() || null, now, now,
      ]
    );
    this.audit('إضافة مخرج مشروع', id, { projectId: input.projectId, title: input.title.trim() });
    return this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
  }

  public updateDeliverable(id: string, patch: {
    title?: string; description?: string; dueDate?: string | null;
    status?: ProjectDeliverableStatus; notes?: string;
  }): ProjectDeliverable {
    this.requireWrite('projects.update');
    const existing = this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('المخرج غير موجود.');
    this.requireProject(existing.projectId);
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('عنوان المخرج مطلوب.');
    if (patch.status && !DELIVERABLE_STATUSES.includes(patch.status)) throw new Error('حالة المخرج غير صالحة.');
    assertDate(patch.dueDate, 'تاريخ استحقاق المخرج');

    const status = patch.status ?? existing.status;
    const now = new Date().toISOString();
    const deliveredAt = status === 'DELIVERED' || status === 'ACCEPTED'
      ? existing.deliveredAt || now
      : null;
    const acceptedAt = status === 'ACCEPTED'
      ? existing.acceptedAt || now
      : null;

    this.db.run(
      `UPDATE project_deliverables SET
         title = COALESCE(?, title), description = COALESCE(?, description),
         due_date = COALESCE(?, due_date), status = ?,
         delivered_at = ?, accepted_at = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        patch.title?.trim() || null, patch.description?.trim() || null, patch.dueDate ?? null,
        status, deliveredAt, acceptedAt, patch.notes?.trim() || null, now, id,
      ]
    );
    this.audit('تعديل مخرج مشروع', id, { status, ...patch });
    return this.db.query<ProjectDeliverable>(`SELECT * FROM project_deliverables WHERE id = ?`, [id])[0];
  }

  public deleteDeliverable(id: string): void {
    this.requireWrite('projects.update');
    const existing = this.db.query<{ projectId: string }>(
      `SELECT project_id AS projectId FROM project_deliverables WHERE id = ?`,
      [id]
    )[0];
    if (!existing) throw new Error('المخرج غير موجود.');
    this.requireProject(existing.projectId);
    this.db.run(`DELETE FROM project_deliverables WHERE id = ?`, [id]);
    this.audit('حذف مخرج مشروع', id, { projectId: existing.projectId });
  }
}
