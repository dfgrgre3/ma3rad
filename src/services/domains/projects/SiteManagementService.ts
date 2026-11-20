import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ProjectService } from './ProjectService';
import { unscaleMoneyRow } from '../../../utils/money';

const SUBCONTRACTOR_MONEY_FIELDS = ['contract_value'] as const;
const REPORT_ITEM_MONEY_FIELDS = ['unit_cost', 'amount'] as const;
const SUB_CERT_MONEY_FIELDS = ['amount', 'retention_amount', 'net_amount', 'paid_amount'] as const;

export type SubcontractorStatus = 'ACTIVE' | 'INACTIVE' | 'COMPLETED';
export type SiteReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';
export type SiteReportItemType = 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'WORK';

export interface SiteReportItemInput {
  itemType: SiteReportItemType;
  productId?: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
}

/**
 * Construction site operations: subcontractors (مقاولون فرعيون) per project
 * and daily site reports (تقارير يومية للموقع) with material/labor/equipment
 * item lines. All records are scoped through the owning project's branch
 * and permission scope via ProjectService.getProjectById.
 */
export class SiteManagementService {
  private db = DatabaseManager.getInstance();
  private projects = new ProjectService();

  // ── المقاولون الفرعيون ──────────────────────────────────────────────────

  public getSubcontractors(projectId?: string) {
    this.requireView();
    if (projectId && !this.projects.getProjectById(projectId)) {
      throw new Error('المشروع غير موجود أو لا تملك صلاحية الوصول إليه.');
    }
    const ids = this.scopedProjectIds(projectId);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.query<any>(
      `SELECT s.*, p.name AS projectName, p.code AS projectCode
       FROM project_subcontractors s JOIN projects p ON p.id = s.project_id
       WHERE s.project_id IN (${placeholders}) ORDER BY s.created_at DESC`, ids
    ).map((row) => unscaleMoneyRow(row, SUBCONTRACTOR_MONEY_FIELDS));
  }

  public createSubcontractor(input: { projectId: string; name: string; phone?: string; specialty?: string; contractValue?: number; contractNumber?: string; contractDate?: string; scope?: string; retentionPercent?: number; notes?: string }) {
    const actor = this.requireWrite(input.projectId);
    if (!input.name.trim()) throw new Error('اسم المقاول الفرعي مطلوب.');
    const id = `psc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO project_subcontractors (id, project_id, name, phone, specialty, contract_value, contract_number, contract_date, scope, retention_percent, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ?)`,
      [id, input.projectId, input.name.trim(), input.phone?.trim() || null, input.specialty?.trim() || null,
       Number(input.contractValue) || 0, input.contractNumber?.trim() || null, input.contractDate || null,
       input.scope?.trim() || null, Number(input.retentionPercent) || 0, input.notes?.trim() || null, actor.id]
    );
    this.audit('إضافة مقاول فرعي للمشروع', id, { projectId: input.projectId, name: input.name.trim() });
    return { id };
  }

  public updateSubcontractorStatus(id: string, status: SubcontractorStatus) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.update');
    const row = this.db.query<any>('SELECT * FROM project_subcontractors WHERE id = ?', [id])[0];
    if (!row) throw new Error('المقاول الفرعي غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    this.db.run('UPDATE project_subcontractors SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    this.audit('تحديث حالة مقاول فرعي', id, { projectId: row.project_id, status });
  }

  // ── التقارير اليومية للموقع ────────────────────────────────────────────

  public getDailyReports(projectId?: string) {
    this.requireView();
    const ids = this.scopedProjectIds(projectId);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.query<any>(
      `SELECT r.*, p.name AS projectName, p.code AS projectCode,
              u.full_name AS createdByName, a.full_name AS approvedByName,
              (SELECT COUNT(*) FROM project_site_report_items i WHERE i.report_id = r.id) AS itemsCount,
              (SELECT COALESCE(SUM(i.amount),0) FROM project_site_report_items i WHERE i.report_id = r.id) / 100.0 AS itemsTotal
       FROM project_site_daily_reports r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users a ON a.id = r.approved_by
       WHERE r.project_id IN (${placeholders}) ORDER BY r.report_date DESC, r.created_at DESC`, ids
    );
  }

  public getDailyReport(id: string) {
    this.requireView();
    const row = this.db.query<any>(
      `SELECT r.*, p.name AS projectName, u.full_name AS createdByName, a.full_name AS approvedByName
       FROM project_site_daily_reports r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users a ON a.id = r.approved_by
       WHERE r.id = ?`, [id]
    )[0];
    if (!row) throw new Error('التقرير غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    const items = this.db.query<any>(
      `SELECT i.*, pr.name AS productName FROM project_site_report_items i
       LEFT JOIN products pr ON pr.id = i.product_id
       WHERE i.report_id = ? ORDER BY i.sort_order, i.created_at`, [id]
    ).map((item) => unscaleMoneyRow(item, REPORT_ITEM_MONEY_FIELDS));
    return { ...row, items };
  }

  public createDailyReport(input: { projectId: string; date: string; weather?: string; workersCount?: number; supervisorName?: string; summary?: string; items?: SiteReportItemInput[] }) {
    const actor = this.requireWrite(input.projectId);
    if (!input.date) throw new Error('تاريخ التقرير مطلوب.');
    const id = `psr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO project_site_daily_reports (id, project_id, report_date, weather, workers_count, supervisor_name, summary, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)`,
        [id, input.projectId, input.date, input.weather?.trim() || null,
         Math.max(0, Math.floor(Number(input.workersCount) || 0)), input.supervisorName?.trim() || null,
         input.summary?.trim() || null, actor.id]
      );
      (input.items || []).forEach((item, index) => {
        const description = item.description?.trim();
        if (!description) return;
        const quantity = Math.max(0, Number(item.quantity) || 0);
        const unitCost = Math.max(0, Number(item.unitCost) || 0);
        db.run(
          `INSERT INTO project_site_report_items (id, report_id, item_type, product_id, description, quantity, unit, unit_cost, amount, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?)`,
          [`psi_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.itemType, item.productId || null,
           description, quantity, item.unit?.trim() || null, unitCost, quantity * unitCost, index]
        );
      });
    });
    this.audit('إنشاء تقرير يومي للموقع', id, { projectId: input.projectId, date: input.date });
    return { id };
  }

  public approveDailyReport(id: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.approve');
    const row = this.db.query<any>('SELECT * FROM project_site_daily_reports WHERE id = ?', [id])[0];
    if (!row) throw new Error('التقرير غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    if (row.status === 'APPROVED') return;
    this.db.run(
      `UPDATE project_site_daily_reports SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, id]
    );
    this.audit('اعتماد التقرير اليومي للموقع', id, { projectId: row.project_id });
  }

  // ── مستخلصات المقاولين الباطنين ────────────────────────────────────────

  public getSubCertificates(projectId?: string) {
    this.requireView();
    const ids = this.scopedProjectIds(projectId);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.query<any>(
      `SELECT c.*, s.name AS subcontractorName, s.contract_number AS subcontractContractNumber,
              s.contract_value / 100.0 AS subcontractContractValue,
              p.name AS projectName, p.code AS projectCode,
              u.full_name AS createdByName, a.full_name AS reviewedByName
       FROM subcontractor_certificates c
       JOIN project_subcontractors s ON s.id = c.subcontractor_id
       JOIN projects p ON p.id = c.project_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users a ON a.id = c.reviewed_by
       WHERE c.project_id IN (${placeholders})
       ORDER BY c.created_at DESC`, ids
    ).map((row) => unscaleMoneyRow(row, SUB_CERT_MONEY_FIELDS));
  }

  public createSubCertificate(input: { subcontractorId: string; periodStart?: string; periodEnd?: string; description: string; amount: number }) {
    const actor = this.requireView();
    const sub = this.db.query<any>('SELECT * FROM project_subcontractors WHERE id = ?', [input.subcontractorId])[0];
    if (!sub) throw new Error('المقاول الباطن غير موجود.');
    if (!this.projects.getProjectById(sub.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    PermissionService.require(actor, 'ui.projects.list.update');
    if (!input.description.trim()) throw new Error('بيان الأعمال مطلوب.');
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) throw new Error('قيمة المستخلص يجب أن تكون أكبر من صفر.');
    const retentionPercent = Math.min(100, Math.max(0, Number(sub.retention_percent) || 0));
    const retentionAmount = Math.round(amount * retentionPercent) / 100;
    const netAmount = Math.round((amount - retentionAmount) * 100) / 100;
    const id = `psc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const certificateNumber = `SUB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-4).toUpperCase()}`;
    this.db.run(
      `INSERT INTO subcontractor_certificates
        (id, subcontractor_id, project_id, certificate_number, period_start, period_end, description,
         amount, retention_percent, retention_amount, net_amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ROUND(?*100), ROUND(?*100), 'DRAFT', ?)`,
      [id, sub.id, sub.project_id, certificateNumber, input.periodStart || null, input.periodEnd || null,
       input.description.trim(), amount, retentionPercent, retentionAmount, netAmount, actor.id]
    );
    this.audit('إنشاء مستخلص مقاول باطن', id, { subcontractorId: sub.id, projectId: sub.project_id, amount });
    return { id };
  }

  public submitSubCertificate(id: string) {
    const actor = this.requireView();
    PermissionService.require(actor, 'ui.projects.list.update');
    const row = this.db.query<any>('SELECT * FROM subcontractor_certificates WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخلص غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    if (row.status !== 'DRAFT') throw new Error('لا يمكن إرسال هذا المستخلص.');
    this.db.run(`UPDATE subcontractor_certificates SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    this.audit('إرسال مستخلص مقاول باطن', id, { projectId: row.project_id });
  }

  public approveSubCertificate(id: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.approve');
    const row = this.db.query<any>('SELECT * FROM subcontractor_certificates WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخلص غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    if (row.status !== 'SUBMITTED') throw new Error('لا يمكن اعتماد هذا المستخلص.');
    this.db.run(
      `UPDATE subcontractor_certificates SET status = 'APPROVED', reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, id]
    );
    this.audit('اعتماد مستخلص مقاول باطن', id, { projectId: row.project_id });
  }

  public paySubCertificate(id: string, paymentReference?: string) {
    const actor = this.requireView();
    PermissionService.require(actor, 'ui.projects.list.update');
    const row = this.db.query<any>('SELECT * FROM subcontractor_certificates WHERE id = ?', [id])[0];
    if (!row) throw new Error('المستخلص غير موجود.');
    if (!this.projects.getProjectById(row.project_id)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    if (row.status !== 'APPROVED') throw new Error('لا يمكن تسجيل دفعة إلا لمستخلص معتمد.');
    this.db.run(
      `UPDATE subcontractor_certificates
       SET paid_amount = net_amount, status = 'PAID', payment_reference = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [paymentReference?.trim() || null, id]
    );
    this.audit('تسجيل دفعة مستخلص مقاول باطن', id, { projectId: row.project_id });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.view');
    return actor;
  }

  private requireWrite(projectId: string) {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.projects.list.update');
    if (!this.projects.getProjectById(projectId)) throw new Error('المشروع غير موجود أو خارج نطاق صلاحيتك.');
    return actor;
  }

  private scopedProjectIds(projectId?: string): string[] {
    const visible = this.projects.getProjects().map((project) => project.id);
    if (!projectId) return visible;
    return visible.includes(projectId) ? [projectId] : [];
  }

  private audit(action: string, recordId: string, values: object) {
    const actor = AuthService.requireAuth();
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'PROJECTS', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]
    );
  }
}
