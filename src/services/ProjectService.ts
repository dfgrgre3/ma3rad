import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';

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

export class ProjectService {
  private db = DatabaseManager.getInstance();

  public getProjects(search = '', status?: string): Project[] {
    let sql = `
      SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE 1 = 1`;
    const params: any[] = [];
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
    const rows = this.db.query<Project>(
      `SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
       FROM projects p JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    const p = rows[0];
    return { ...p, progress: this.computeProgress(p) };
  }

  public createProject(input: {
    name: string; customerId: string; projectType?: ProjectType;
    contractorName?: string; contractorPhone?: string; engineerName?: string; engineerPhone?: string;
    address?: string; city?: string; startDate?: string; expectedEndDate?: string;
    contractValue?: number; status?: ProjectStatus; notes?: string;
  }): Project {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.create');
    if (!input.name.trim()) throw new Error('اسم المشروع مطلوب.');
    if (!input.customerId) throw new Error('يجب اختيار العميل.');

    const id = `prj_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('PRJ');
      db.run(
        `INSERT INTO projects (
          id, code, name, customer_id, project_type, contractor_name, contractor_phone,
          engineer_name, engineer_phone, address, city, start_date, expected_end_date,
          contract_value, outstanding_amount, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, code, input.name.trim(), input.customerId, input.projectType || 'BUILDING',
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
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ name: input.name })]
      );
      return this.getProjectById(id)!;
    });
  }

  public updateProject(id: string, patch: Partial<Project>): Project {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    const existing = this.getProjectById(id);
    if (!existing) throw new Error('المشروع غير موجود.');

    this.db.run(
      `UPDATE projects SET
        name = COALESCE(?, name), project_type = COALESCE(?, project_type),
        contractor_name = COALESCE(?, contractor_name), contractor_phone = COALESCE(?, contractor_phone),
        engineer_name = COALESCE(?, engineer_name), engineer_phone = COALESCE(?, engineer_phone),
        address = COALESCE(?, address), city = COALESCE(?, city),
        start_date = COALESCE(?, start_date), expected_end_date = COALESCE(?, expected_end_date),
        actual_end_date = ?, contract_value = COALESCE(?, contract_value),
        total_paid = COALESCE(?, total_paid), outstanding_amount = COALESCE(?, outstanding_amount),
        status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ?
      WHERE id = ?`,
      [
        patch.name ?? null, patch.projectType ?? null, patch.contractorName ?? null,
        patch.contractorPhone ?? null, patch.engineerName ?? null, patch.engineerPhone ?? null,
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
    return this.getProjectById(id)!;
  }

  public deleteProject(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    this.db.run(`DELETE FROM projects WHERE id = ?`, [id]);
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id)
       VALUES (?, ?, ?, 'حذف مشروع', 'PROJECTS', ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id]
    );
  }

  public getUnits(projectId: string): ProjectUnit[] {
    return this.db.query<ProjectUnit>(
      `SELECT * FROM project_units WHERE project_id = ? ORDER BY sort_order, name`,
      [projectId]
    );
  }

  public createUnit(input: {
    projectId: string; parentId?: string; unitType: ProjectUnit['unitType'];
    name: string; areaM2?: number; status?: ProjectUnit['status']; notes?: string;
  }): ProjectUnit {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    if (!input.name.trim()) throw new Error('اسم الوحدة مطلوب.');
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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    this.db.run(
      `UPDATE project_units SET
        name = COALESCE(?, name), unit_type = COALESCE(?, unit_type),
        area_m2 = COALESCE(?, area_m2), status = COALESCE(?, status), notes = COALESCE(?, notes)
       WHERE id = ?`,
      [patch.name ?? null, patch.unitType ?? null, patch.areaM2 ?? null, patch.status ?? null, patch.notes ?? null, id]
    );
  }

  public deleteUnit(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    this.db.run(`DELETE FROM project_units WHERE id = ?`, [id]);
  }

  public getProjectProducts(projectId: string): ProjectProduct[] {
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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    const product = this.db.query<{ name: string }>(`SELECT name FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج غير موجود.');
    if (!(input.plannedQuantityM2 > 0)) throw new Error('الكمية المخططة يجب أن تكون أكبر من صفر.');

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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    const existing = this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];
    if (!existing) throw new Error('بند المشروع غير موجود.');
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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'projects.update');
    const existing = this.db.query<ProjectProduct>(`SELECT * FROM project_products WHERE id = ?`, [id])[0];
    if (!existing) return;
    this.db.run(`DELETE FROM project_products WHERE id = ?`, [id]);
    this.db.run(
      `UPDATE projects SET total_sold = (
        SELECT COALESCE(SUM(planned_quantity_m2 * agreed_price_m2), 0) FROM project_products WHERE project_id = ?
      ), updated_at = ? WHERE id = ?`,
      [existing.projectId, new Date().toISOString(), existing.projectId]
    );
  }
}
