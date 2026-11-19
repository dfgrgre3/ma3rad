import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { localDateString } from '../../../../utils/shared/date';
import { unscaleMoneyRow } from '../../../../utils/money';
import { PROJECT_MONEY_FIELDS, type Project, type ProjectStatus, type ProjectType } from './types';
import { ProjectServiceCore } from './core';

/** Project CRUD, listing and scoping. */
export class ProjectsLayer extends ProjectServiceCore {
  public getProjects(search = '', status?: string): Project[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    const scope = this.branchAccess.sqlScope('p.branch_id', undefined, actor);
    let sql = `
      SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id) AS units_count,
        (SELECT COUNT(*) FROM project_units u WHERE u.project_id = p.id AND u.status = 'DELIVERED') AS delivered_units,
        (SELECT COALESCE(SUM(si.total_amount), 0) / 100.0 FROM sales_invoices si WHERE si.project_id = p.id AND si.invoice_status != 'VOID') AS invoiced_amount
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

    return this.db.query<Project>(sql, params)
      .map((p) => unscaleMoneyRow(p, PROJECT_MONEY_FIELDS))
      .map((p) => ({
        ...p,
        progress: this.computeProgress(p),
      }));
  }

  public getProjectById(id: string): Project | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    return this.scopedProject(id);
  }

  public createProject(input: {
    name: string; customerId: string; projectType?: ProjectType; branchId?: string;
    contractorName?: string; contractorPhone?: string; engineerName?: string; engineerPhone?: string;
    address?: string; city?: string; startDate?: string; expectedEndDate?: string;
    contractValue?: number; status?: ProjectStatus; notes?: string;
  }): Project {
    const actor = AuthService.requireAuth();
    this.requireWrite('ui.projects.list.create');
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?)`,
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
    this.requireWrite('ui.projects.list.update');
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
        actual_end_date = ?, contract_value = COALESCE(ROUND(?*100), contract_value),
        total_paid = COALESCE(ROUND(?*100), total_paid), outstanding_amount = COALESCE(ROUND(?*100), outstanding_amount),
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
    this.requireWrite('ui.projects.list.delete');
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
}
