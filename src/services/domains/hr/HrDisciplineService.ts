import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ApprovalService } from '../approvals/ApprovalService';
import { localDateString } from '../../../utils/shared/date';
import { NotificationService } from '../notifications/NotificationService';

export interface HrViolation { id: string; employeeId: string; violationType: string; description: string | null; occurredAt: string; severity: string; status: string; reportedBy: string | null; createdAt: string; }
export interface HrWarning { id: string; employeeId: string; violationId: string | null; warningType: string; issuedAt: string; issuedBy: string | null; notes: string | null; status: string; createdAt: string; }
export interface HrPenalty { id: string; employeeId: string; violationId: string | null; penaltyType: string; amount: number; status: string; approvedBy: string | null; approvedAt: string | null; payrollTransactionId: string | null; notes: string | null; createdBy: string | null; createdAt: string; }
export interface HrComplaint { id: string; employeeId: string; subject: string; description: string | null; status: string; submittedAt: string; resolvedAt: string | null; resolution: string | null; assignedTo: string | null; createdAt: string; }
export interface HrAppeal { id: string; referenceType: string; referenceId: string; employeeId: string; reason: string; status: string; decidedBy: string | null; decidedAt: string | null; decision: string | null; createdAt: string; }
export interface HrAttachment { id: string; referenceType: string; referenceId: string; fileName: string; filePath: string | null; uploadedBy: string | null; createdAt: string; }

export class HrDisciplineService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() { const actor = AuthService.requireAuth(); PermissionService.requireAny(actor, ['ui.employees.employees.view', 'employees.payroll.view', 'employees.payroll.manage']); return actor; }
  private static requireManage() { const actor = AuthService.requireAuth(); ModuleRegistryService.assertModuleEnabled('hr'); PermissionService.require(actor, 'employees.payroll.manage'); return actor; }

  private static audit(actor: ReturnType<typeof AuthService.requireAuth>, action: string, recordId: string, values: unknown): void {
    this.db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]);
  }

  // Violations
  static createViolation(input: { employeeId: string; violationType: string; description?: string; occurredAt: string; severity?: string }): HrViolation {
    const actor = this.requireManage();
    const id = `vio_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_violations (id, employee_id, violation_type, description, occurred_at, severity, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.violationType.trim(), input.description?.trim() || null, input.occurredAt, input.severity || 'MINOR', actor.id]);
    this.audit(actor, 'تسجيل مخالفة', id, input);
    try { new NotificationService().createNotification('SYSTEM', `مخالفة: ${input.violationType}`, `تم تسجيل مخالفة للموظف ${input.employeeId}`, undefined, 'HR_VIOLATION', id); } catch { /* ignore */ }
    return this.getViolations(input.employeeId).find((v) => v.id === id)!;
  }
  static getViolations(employeeId?: string): HrViolation[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_violations WHERE ${where} ORDER BY occurred_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, violationType: r.violationType, description: r.description || null,
      occurredAt: r.occurredAt, severity: r.severity, status: r.status, reportedBy: r.reportedBy || null, createdAt: r.createdAt,
    }));
  }
  static closeViolation(id: string): void { const actor = this.requireManage(); this.db.run(`UPDATE hr_violations SET status = 'CLOSED' WHERE id = ?`, [id]); this.audit(actor, 'إغلاق مخالفة', id, {}); }

  // Warnings
  static issueWarning(input: { employeeId: string; violationId?: string | null; warningType?: string; issuedAt: string; notes?: string }): HrWarning {
    const actor = this.requireManage();
    const id = `wrn_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_warnings (id, employee_id, violation_id, warning_type, issued_at, issued_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.violationId || null, input.warningType || 'WRITTEN', input.issuedAt, actor.id, input.notes?.trim() || null]);
    this.audit(actor, 'إصدار إنذار', id, input);
    try { new NotificationService().createNotification('SYSTEM', 'إنذار وظيفي', `تم إصدار إنذار للموظف ${input.employeeId}`, undefined, 'HR_WARNING', id); } catch { /* ignore */ }
    return this.getWarnings(input.employeeId).find((w) => w.id === id)!;
  }
  static getWarnings(employeeId?: string): HrWarning[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_warnings WHERE ${where} ORDER BY issued_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, violationId: r.violationId || null, warningType: r.warningType,
      issuedAt: r.issuedAt, issuedBy: r.issuedBy || null, notes: r.notes || null, status: r.status, createdAt: r.createdAt,
    }));
  }
  static cancelWarning(id: string): void { const actor = this.requireManage(); this.db.run(`UPDATE hr_warnings SET status = 'CANCELLED' WHERE id = ?`, [id]); this.audit(actor, 'إلغاء إنذار', id, {}); }

  // Penalties
  static createPenalty(input: { employeeId: string; violationId?: string | null; penaltyType?: string; amount?: number; notes?: string }): HrPenalty {
    const actor = this.requireManage();
    const id = `pen_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_penalties (id, employee_id, violation_id, penalty_type, amount, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.violationId || null, input.penaltyType || 'FINANCIAL', Math.max(0, Number(input.amount) || 0), input.notes?.trim() || null, actor.id]);
    this.audit(actor, 'إنشاء جزاء', id, input);
    return this.getPenalties(input.employeeId).find((p) => p.id === id)!;
  }
  static getPenalties(employeeId?: string): HrPenalty[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_penalties WHERE ${where} ORDER BY created_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, violationId: r.violationId || null, penaltyType: r.penaltyType,
      amount: Number(r.amount) || 0, status: r.status, approvedBy: r.approvedBy || null, approvedAt: r.approvedAt || null,
      payrollTransactionId: r.payrollTransactionId || null, notes: r.notes || null, createdBy: r.createdBy || null, createdAt: r.createdAt,
    }));
  }
  static requestPenaltyApproval(penaltyId: string): string {
    const actor = this.requireManage();
    const penalty = this.db.query<{ employeeId: string; amount: number; notes: string | null }>(
      'SELECT employee_id AS employeeId, amount, notes FROM hr_penalties WHERE id = ?', [penaltyId]
    )[0];
    if (!penalty) throw new Error('الجزاء غير موجود.');
    const approval = new ApprovalService().createRequest({
      requestType: 'OTHER',
      title: `اعتماد جزاء مالي: ${penalty.amount}`,
      description: penalty.notes || 'جزاء مالي',
      priority: 'NORMAL',
      referenceType: 'HR_PENALTY',
      referenceId: penaltyId,
      branchId: this.branchAccess.getCurrentBranchId(actor),
    });
    try { new NotificationService().createNotification('SYSTEM', 'طلب اعتماد جزاء', `تم إنشاء طلب اعتماد جزاء للموظف ${penalty.employeeId}`, undefined, 'HR_PENALTY', penaltyId); } catch { /* ignore */ }
    this.audit(actor, 'طلب اعتماد جزاء', penaltyId, { approvalId: approval.id });
    return approval.id;
  }
  static approvePenalty(penaltyId: string): void {
    const actor = this.requireManage();
    const penalty = this.db.query<{ employeeId: string; amount: number; status: string; notes: string | null }>(
      'SELECT employee_id AS employeeId, amount, status, notes FROM hr_penalties WHERE id = ?', [penaltyId]
    )[0];
    if (!penalty) throw new Error('الجزاء غير موجود.');
    if (penalty.status !== 'DRAFT' && penalty.status !== 'APPROVED') throw new Error('الجزاء غير قابل للاعتماد.');
    const amount = Number(penalty.amount) || 0;
    let txId: string | null = null;
    this.db.executeTransaction((db) => {
      db.run(`UPDATE hr_penalties SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [actor.id, penaltyId]);
      if (amount > 0) {
        txId = `ptx_${uuidv4().substring(0, 8)}`;
        const today = localDateString();
        db.run(
          `INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by, branch_id, payment_status)
           VALUES (?, ?, 'DEDUCTION', ?, ?, ?, ?, ?, 'PAID')`,
          [txId, penalty.employeeId, amount, today, `جزاء معتمد: ${penalty.notes || ''}`, actor.id,
           this.branchAccess.getCurrentBranchId(actor)]
        );
        db.run(`UPDATE hr_penalties SET status = 'POSTED', payroll_transaction_id = ? WHERE id = ?`, [txId, penaltyId]);
      }
      db.run(
        `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
         VALUES (?, ?, 'PENALTY', ?, ?, ?, ?)`,
        [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, penalty.employeeId, localDateString(),
         `PENALTY:${amount}`, penalty.notes || null, actor.id]
      );
      this.audit(actor, 'اعتماد جزاء', penaltyId, { amount, txId });
      try { new NotificationService().createNotification('SYSTEM', 'اعتماد جزاء', `تم اعتماد جزاء بقيمة ${amount} للموظف ${penalty.employeeId}`, undefined, 'HR_PENALTY', penaltyId); } catch { /* ignore */ }
    });
  }
  static cancelPenalty(id: string): void { const actor = this.requireManage(); this.db.run(`UPDATE hr_penalties SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]); this.audit(actor, 'إلغاء جزاء', id, {}); }

  // Complaints
  static createComplaint(input: { employeeId: string; subject: string; description?: string; assignedTo?: string }): HrComplaint {
    const actor = this.requireManage();
    const id = `cmp_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const submittedAt = localDateString();
    this.db.run(`INSERT INTO hr_complaints (id, employee_id, subject, description, submitted_at, assigned_to) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.subject.trim(), input.description?.trim() || null, submittedAt, input.assignedTo || null]);
    this.audit(actor, 'تقديم شكوى', id, input);
    try { new NotificationService().createNotification('SYSTEM', 'شكوى موظف', `تم تقديم شكوى: ${input.subject}`, undefined, 'HR_COMPLAINT', id); } catch { /* ignore */ }
    return this.getComplaints(input.employeeId).find((c) => c.id === id)!;
  }
  static getComplaints(employeeId?: string): HrComplaint[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_complaints WHERE ${where} ORDER BY submitted_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, subject: r.subject, description: r.description || null,
      status: r.status, submittedAt: r.submittedAt, resolvedAt: r.resolvedAt || null, resolution: r.resolution || null,
      assignedTo: r.assignedTo || null, createdAt: r.createdAt,
    }));
  }
  static resolveComplaint(id: string, resolution: string, status: 'RESOLVED' | 'REJECTED' = 'RESOLVED'): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE hr_complaints SET status = ?, resolved_at = ?, resolution = ? WHERE id = ?`, [status, localDateString(), resolution.trim(), id]);
    this.audit(actor, 'حل شكوى', id, { status, resolution });
  }

  // Appeals
  static createAppeal(input: { referenceType: string; referenceId: string; employeeId: string; reason: string }): HrAppeal {
    const actor = this.requireManage();
    const id = `apl_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_appeals (id, reference_type, reference_id, employee_id, reason) VALUES (?, ?, ?, ?, ?)`,
      [id, input.referenceType, input.referenceId, input.employeeId, input.reason.trim()]);
    this.audit(actor, 'تقديم تظلم', id, input);
    return this.getAppeals(input.employeeId).find((a) => a.id === id)!;
  }
  static getAppeals(employeeId?: string): HrAppeal[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_appeals WHERE ${where} ORDER BY created_at DESC`, params).map((r) => ({
      id: r.id, referenceType: r.referenceType, referenceId: r.referenceId, employeeId: r.employeeId,
      reason: r.reason, status: r.status, decidedBy: r.decidedBy || null, decidedAt: r.decidedAt || null,
      decision: r.decision || null, createdAt: r.createdAt,
    }));
  }
  static decideAppeal(id: string, approved: boolean, decision: string): void {
    const actor = this.requireManage();
    this.db.run(`UPDATE hr_appeals SET status = ?, decided_by = ?, decided_at = ?, decision = ? WHERE id = ?`,
      [approved ? 'APPROVED' : 'REJECTED', actor.id, localDateString(), decision.trim(), id]);
    try { new NotificationService().createNotification('SYSTEM', 'قرار تظلم', `تم ${approved ? 'قبول' : 'رفض'} التظلم ${id}`, undefined, 'HR_APPEAL', id); } catch { /* ignore */ }
    this.audit(actor, 'قرار تظلم', id, { approved, decision });
  }

  // Attachments
  static addAttachment(input: { referenceType: string; referenceId: string; fileName: string; filePath?: string }): HrAttachment {
    const actor = this.requireManage();
    const id = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_case_attachments (id, reference_type, reference_id, file_name, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.referenceType, input.referenceId, input.fileName.trim(), input.filePath?.trim() || null, actor.id]);
    this.audit(actor, 'إضافة مرفق', id, input);
    return this.getAttachments(input.referenceType, input.referenceId).find((a) => a.id === id)!;
  }
  static getAttachments(referenceType: string, referenceId: string): HrAttachment[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM hr_case_attachments WHERE reference_type = ? AND reference_id = ? ORDER BY created_at DESC`, [referenceType, referenceId]).map((r) => ({
      id: r.id, referenceType: r.referenceType, referenceId: r.referenceId, fileName: r.fileName,
      filePath: r.filePath || null, uploadedBy: r.uploadedBy || null, createdAt: r.createdAt,
    }));
  }
}
