import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { localDateString } from '../../../utils/shared/date';

export type ClearanceStatus = 'PENDING' | 'IN_PROGRESS' | 'ASSETS_RETURNED' | 'FINANCIAL_CLEARED' | 'CLEARED' | 'REJECTED' | 'CANCELLED';
export type ClearanceItemStatus = 'PENDING' | 'COMPLETED' | 'WAIVED' | 'NOT_APPLICABLE';
export type AssetClearanceStatus = 'PENDING' | 'RETURNED' | 'PARTIAL' | 'NOT_RETURNED';
export type FinancialClearanceStatus = 'PENDING' | 'CLEARED' | 'OUTSTANDING';

export interface EmployeeClearance {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  departmentId: string;
  departmentName: string;
  clearanceNumber: string;
  terminationDate: string;
  reason: string;
  status: ClearanceStatus;
  assetClearanceStatus: AssetClearanceStatus;
  financialClearanceStatus: FinancialClearanceStatus;
  clearanceCertificateIssued: boolean;
  certificateIssuedAt: string | null;
  certificateIssuedBy: string | null;
  exitInterviewDate: string | null;
  exitInterviewerId: string | null;
  exitInterviewerName: string | null;
  exitInterviewNotes: string | null;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  checklistItems: ClearanceChecklistItem[];
}

export interface ClearanceChecklistItem {
  id: string;
  clearanceId: string;
  itemName: string;
  category: string;
  status: ClearanceItemStatus;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  notes: string | null;
}

export interface ClearanceChecklistItemInput {
  itemName: string;
  category: string;
  status?: ClearanceItemStatus;
  notes?: string;
}

export interface CreateClearanceInput {
  employeeId: string;
  terminationDate: string;
  reason: string;
}

export interface ExitInterviewInput {
  clearanceId: string;
  interviewerId: string;
  interviewDate: string;
  reasonForLeaving: string | null;
  satisfactionScore: number | null;
  wouldRecommend: number | null;
  feedback: string | null;
  actionItems: string | null;
}

export interface ClearanceSummary {
  total: number;
  pending: number;
  inProgress: number;
  assetsReturned: number;
  financialCleared: number;
  cleared: number;
  rejected: number;
  cancelled: number;
}

function isValidDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export class EmployeeClearanceService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();
  private static notification = new NotificationService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'hr.contracts.view', 'hr.documents.view', 'employees.view',
    ]);
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'hr.contracts.manage', 'hr.documents.manage', 'employees.manage',
    ]);
    return actor;
  }

  private static currentCompanyId(actor = AuthService.requireAuth()): string {
    const branchId = this.branchAccess.getCurrentBranchId(actor);
    const row = this.db.query<{ companyId: string | null }>(
      'SELECT company_id AS companyId FROM branches WHERE id = ?',
      [branchId]
    )[0];
    if (!row?.companyId) throw new Error('فرع العمل الحالي غير مرتبط بشركة.');
    return row.companyId;
  }

  /* ========== Clearances ========== */

  static getEmployeeClearances(status?: ClearanceStatus): EmployeeClearance[] {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const conditions: string[] = ['c.company_id = ?'];
    const params: (string | number)[] = [companyId];
    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    conditions.push(scope.clause);
    params.push(...scope.params);

    const rows = this.db.query<any>(
      `SELECT c.id, c.employee_id AS employeeId, e.name AS employeeName,
              c.branch_id AS branchId, b.name AS branchName,
              c.department_id AS departmentId, d.name AS departmentName,
              c.clearance_number AS clearanceNumber, c.termination_date AS terminationDate,
              c.reason, c.status, c.asset_clearance_status AS assetClearanceStatus,
              c.financial_clearance_status AS financialClearanceStatus,
              c.clearance_certificate_issued AS clearanceCertificateIssued,
              c.certificate_issued_at AS certificateIssuedAt,
              c.certificate_issued_by AS certificateIssuedBy,
              u_issuer.full_name AS certificateIssuedByName,
              c.exit_interview_date AS exitInterviewDate,
              c.exit_interviewer_id AS exitInterviewerId,
              u_interviewer.full_name AS exitInterviewerName,
              c.exit_interview_notes AS exitInterviewNotes,
              c.requested_by AS requestedBy, req.full_name AS requestedByName,
              c.requested_at, c.decided_by AS decidedBy,
              dec.full_name AS decidedByName, c.decided_at, c.decision_note,
              c.created_at, c.updated_at
       FROM hr_employee_clearances c
       JOIN employees e ON e.id = c.employee_id
       JOIN branches b ON b.id = c.branch_id
       JOIN departments d ON d.id = c.department_id
       LEFT JOIN users u_issuer ON u_issuer.id = c.certificate_issued_by
       LEFT JOIN users u_interviewer ON u_interviewer.id = c.exit_interviewer_id
       LEFT JOIN employees req ON req.id = c.requested_by
       LEFT JOIN users dec ON dec.id = c.decided_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.status = 'PENDING' DESC, c.termination_date DESC, c.created_at DESC`,
      params
    );
    return rows.map((row) => ({
      ...row,
      checklistItems: this.getClearanceChecklistItems(row.id),
    }));
  }

  static getEmployeeClearance(clearanceId: string): EmployeeClearance | null {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const row = this.db.query<any>(
      `SELECT c.id, c.employee_id AS employeeId, e.name AS employeeName,
              c.branch_id AS branchId, b.name AS branchName,
              c.department_id AS departmentId, d.name AS departmentName,
              c.clearance_number AS clearanceNumber, c.termination_date AS terminationDate,
              c.reason, c.status, c.asset_clearance_status AS assetClearanceStatus,
              c.financial_clearance_status AS financialClearanceStatus,
              c.clearance_certificate_issued AS clearanceCertificateIssued,
              c.certificate_issued_at AS certificateIssuedAt,
              c.certificate_issued_by AS certificateIssuedBy,
              c.exit_interview_date AS exitInterviewDate,
              c.exit_interviewer_id AS exitInterviewerId,
              c.exit_interview_notes AS exitInterviewNotes,
              c.requested_by AS requestedBy, c.requested_at,
              c.decided_by AS decidedBy, c.decided_at, c.decision_note,
              c.created_at, c.updated_at
       FROM hr_employee_clearances c
       JOIN employees e ON e.id = c.employee_id
       JOIN branches b ON b.id = c.branch_id
       JOIN departments d ON d.id = c.department_id
       WHERE c.id = ? AND c.company_id = ? AND ${scope.clause}`,
      [clearanceId, companyId, ...scope.params]
    )[0];
    if (!row) return null;
    return {
      ...row,
      checklistItems: this.getClearanceChecklistItems(clearanceId),
      certificateIssuedByName: this.getUserName(row.certificateIssuedBy),
      exitInterviewerName: this.getUserName(row.exitInterviewerId),
      requestedByName: this.getEmployeeName(row.requestedBy),
      decidedByName: this.getUserName(row.decidedBy),
    };
  }

  private static getClearanceChecklistItems(clearanceId: string): ClearanceChecklistItem[] {
    return this.db.query<any>(
      `SELECT id, clearance_id AS clearanceId, item_name AS itemName,
              category, status,
              completed_by AS completedBy, completed_at AS completedAt, notes
       FROM hr_clearance_checklist_items
       WHERE clearance_id = ?
       ORDER BY category, item_name`,
      [clearanceId]
    );
  }

  static createEmployeeClearance(input: CreateClearanceInput): EmployeeClearance {
    const actor = this.requireManage();
    const employee = this.db.query<{ id: string; name: string; branch_id: string; department_id: string }>(
      'SELECT id, name, branch_id AS branchId, department_id AS departmentId FROM employees WHERE id = ?',
      [input.employeeId]
    )[0];
    if (!employee) throw new Error('الموظف غير موجود.');
    if (!isValidDate(input.terminationDate)) throw new Error('تاريخ إنهاء الخدمة غير صالح.');
    if (!input.reason?.trim()) throw new Error('سبب إنهاء الخدمة مطلوب.');

    // Check for existing non-cancelled clearance
    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM hr_employee_clearances WHERE employee_id = ? AND status NOT IN ('CANCELLED', 'REJECTED') LIMIT 1`,
      [input.employeeId]
    );
    if (existing.length) throw new Error('يوجد طلب إخلاء طرف نشط لهذا الموظف مسبقاً.');

    const clearanceNumber = `CLR-${localDateString().slice(0, 7)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const id = `clr_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    this.db.executeTransaction((db) => {
      db.run(
        `INSERT INTO hr_employee_clearances
           (id, employee_id, branch_id, department_id, clearance_number,
            termination_date, reason, status, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [id, input.employeeId, employee.branch_id, employee.department_id,
          clearanceNumber, input.terminationDate, input.reason.trim(), actor.id]
      );

      // Default checklist items
      const defaultItems = [
        { name: 'إعادة الأصول التشغيلية المسلمة للموظف', category: 'ASSETS' },
        { name: 'تسوية المبالغ المستحقة للسلف والقروض', category: 'FINANCIAL' },
        { name: 'تسوية الإجازات المستحقة والرصيد المتبقي', category: 'FINANCIAL' },
        { name: 'إلغاء صلاحيات الوصول للنظام والبريد الإلكتروني', category: 'SYSTEM_ACCESS' },
        { name: 'إجراء مقابلة الخروج (Exit Interview)', category: 'ADMINISTRATIVE' },
        { name: 'إصدار شهادة إخلاء الطرف النهائية', category: 'ADMINISTRATIVE' },
      ];
      for (const item of defaultItems) {
        db.run(
          `INSERT INTO hr_clearance_checklist_items
             (id, clearance_id, item_name, category, status)
           VALUES (?, ?, ?, ?, 'PENDING')`,
          [`cli_${uuidv4().replace(/-/g, '').slice(0, 14)}`, id, item.name, item.category]
        );
      }

      this.audit(db, actor, 'إنشاء طلب إخلاء طرف', id, {
        employeeId: input.employeeId, terminationDate: input.terminationDate, reason: input.reason,
      });
    });

    // Notify HR and department manager
    this.notification.createNotification(
      'SYSTEM', 'طلب إخلاء طرف جديد',
      `تم إنشاء طلب إخلاء طرف للموظف ${employee.name} اعتباراً من ${input.terminationDate}`,
      actor.id, 'HR_CLEARANCE', `${id}:created`
    );

    return this.getEmployeeClearance(id)!;
  }

  static updateChecklistItem(
    clearanceId: string,
    itemId: string,
    input: { status: ClearanceItemStatus; notes?: string; completedBy?: string }
  ): ClearanceChecklistItem {
    const actor = this.requireManage();
    const item = this.db.query<{ id: string; clearanceId: string }>(
      'SELECT id, clearance_id AS clearanceId FROM hr_clearance_checklist_items WHERE id = ?',
      [itemId]
    )[0];
    if (!item) throw new Error('عنصر قائمة التحقق غير موجود.');
    if (item.clearanceId !== clearanceId) throw new Error('عنصر القائمة لا يطابق طلب الإخلاء.');

    const now = new Date().toISOString();
    const completedBy = input.completedBy || actor.id;
    const completedAt = input.status === 'COMPLETED' ? now : null;

    this.db.run(
      `UPDATE hr_clearance_checklist_items SET status = ?, completed_by = ?,
         completed_at = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.status, completedBy, completedAt, input.notes || null, itemId]
    );

    // Recalculate clearance status based on checklist
    this.recalculateClearanceStatus(clearanceId, actor);

    this.auditActor(actor, 'تحديث عنصر قائمة إخلاء الطرف', itemId, {
      clearanceId, status: input.status, notes: input.notes,
    });

    return this.getClearanceChecklistItem(itemId)!;
  }

  private static getClearanceChecklistItem(itemId: string): ClearanceChecklistItem | null {
    const row = this.db.query<any>(
      `SELECT id, clearance_id AS clearanceId, item_name AS itemName, category, status,
              completed_by AS completedBy, completed_at AS completedAt, notes
       FROM hr_clearance_checklist_items WHERE id = ?`,
      [itemId]
    )[0];
    if (!row) return null;
    return {
      id: row.id, clearanceId: row.clearanceId, itemName: row.itemName,
      category: row.category, status: row.status,
      completedBy: row.completedBy, completedByName: this.getUserName(row.completedBy),
      completedAt: row.completedAt, notes: row.notes,
    };
  }

  private static recalculateClearanceStatus(clearanceId: string, actor: { id: string; fullName: string }): void {
    const clearance = this.db.query<any>(
      `SELECT c.*, e.name AS employeeName FROM hr_employee_clearances c
       JOIN employees e ON e.id = c.employee_id WHERE c.id = ?`,
      [clearanceId]
    )[0];
    if (!clearance) return;

    const items = this.getClearanceChecklistItems(clearanceId);
    const allCompleted = items.every((item) => item.status === 'COMPLETED' || item.status === 'WAIVED' || item.status === 'NOT_APPLICABLE');
    const hasPending = items.some((item) => item.status === 'PENDING');

    // Asset clearance: check facility assets assigned to employee
    const facilityAssets = this.db.query<any>(
      `SELECT fa.id, fa.name, fa.status FROM facility_assets fa
       WHERE fa.responsible_employee_id = ? OR fa.responsible_user_id = ?`,
      [clearance.employee_id, clearance.employee_id]
    );
    const assetStatus: AssetClearanceStatus = facilityAssets.length === 0
      ? 'RETURNED'
      : facilityAssets.every((a: any) => a.status === 'RETIRED' || a.status === 'OUT_OF_SERVICE')
        ? ('RETURNED' as AssetClearanceStatus)
        : ('PENDING' as AssetClearanceStatus);

    // Financial clearance: check if final settlement exists
    const settlement = this.db.query<{ id: string }>(
      'SELECT id FROM employee_final_settlements WHERE employee_id = ? LIMIT 1',
      [clearance.employee_id]
    )[0];
    const financialStatus: FinancialClearanceStatus = settlement ? ('CLEARED' as FinancialClearanceStatus) : ('PENDING' as FinancialClearanceStatus);

    let newStatus: ClearanceStatus = clearance.status;
    if (!allCompleted || hasPending) {
      newStatus = 'PENDING';
    } else if (assetStatus === 'NOT_RETURNED' || financialStatus === 'OUTSTANDING') {
      newStatus = 'IN_PROGRESS';
    } else if (assetStatus === 'RETURNED' && financialStatus === 'CLEARED') {
      newStatus = 'CLEARED';
    }

    this.db.run(
      `UPDATE hr_employee_clearances SET status = ?,
         asset_clearance_status = ?, financial_clearance_status = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, assetStatus, financialStatus, clearanceId]
    );

    if (newStatus !== clearance.status) {
      this.auditActor(actor, 'تحديث حالة إخلاء طرف تلقائياً', clearanceId, {
        previousStatus: clearance.status, newStatus, assetStatus, financialStatus,
      });
    }
  }

  static verifyAssetReturn(clearanceId: string, assetId: string, returned: boolean): void {
    const actor = this.requireManage();
    const clearance = this.db.query<{ id: string; employee_id: string }>(
      'SELECT id, employee_id AS employeeId FROM hr_employee_clearances WHERE id = ?',
      [clearanceId]
    )[0];
    if (!clearance) throw new Error('طلب إخلاء الطرف غير موجود.');

    const asset = this.db.query<{ id: string; status: string; responsible_employee_id: string | null }>(
      'SELECT id, status, responsible_employee_id FROM facility_assets WHERE id = ?',
      [assetId]
    )[0];
    if (!asset) throw new Error('الأصل غير موجود.');
    if (asset.responsible_employee_id !== clearance.employee_id) {
      throw new Error('هذا الأصل غير مسؤول عنه هذا الموظف.');
    }

    const newStatus = returned ? 'RETIRED' : 'MAINTENANCE';
    this.db.run(
      `UPDATE facility_assets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, assetId]
    );

    this.recalculateClearanceStatus(clearanceId, actor);
    this.auditActor(actor, returned ? 'تأكيد إرجاع أصل' : 'إعلام بعدم إرجاع أصل', clearanceId, {
      assetId, assetName: asset.status, returned,
    });
  }

  static createExitInterview(input: ExitInterviewInput): void {
    const actor = this.requireManage();
    const clearance = this.db.query<{ id: string; employee_id: string }>(
      'SELECT id, employee_id AS employeeId FROM hr_employee_clearances WHERE id = ?',
      [input.clearanceId]
    )[0];
    if (!clearance) throw new Error('طلب إخلاء الطرف غير موجود.');

    if (!isValidDate(input.interviewDate)) throw new Error('تاريخ المقابلة غير صالح.');
    if (input.satisfactionScore !== null && (input.satisfactionScore < 1 || input.satisfactionScore > 5)) {
      throw new Error('درجة الرضا يجب أن تكون بين 1 و 5.');
    }

    const id = `exit_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(
      `INSERT INTO hr_exit_interviews
         (id, clearance_id, employee_id, interviewer_id, interview_date,
          reason_for_leaving, satisfaction_score, would_recommend, feedback, action_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.clearanceId, clearance.employee_id, input.interviewerId,
        input.interviewDate, input.reasonForLeaving || null, input.satisfactionScore || null,
        input.wouldRecommend || null, input.feedback || null, input.actionItems || null]
    );

    this.db.run(
      `UPDATE hr_employee_clearances SET exit_interview_date = ?, exit_interviewer_id = ?,
         exit_interview_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [input.interviewDate, input.interviewerId, input.feedback || null, input.clearanceId]
    );

    this.auditActor(actor, 'إجراء مقابلة خروج', id, {
      clearanceId: input.clearanceId, employeeId: clearance.employee_id,
      satisfactionScore: input.satisfactionScore,
    });
  }

  static issueClearanceCertificate(clearanceId: string): void {
    const actor = this.requireManage();
    const clearance = this.db.query<{ id: string; status: string; certificateIssued: number }>(
      `SELECT id, status, clearance_certificate_issued AS certificateIssued FROM hr_employee_clearances WHERE id = ?`,
      [clearanceId]
    )[0];
    if (!clearance) throw new Error('طلب إخلاء الطرف غير موجود.');
    if (clearance.status !== 'CLEARED') throw new Error('لا يمكن إصدار الشهادة قبل إكمال إخلاء الطرف.');
    if (clearance.certificateIssued) throw new Error('تم إصدار الشهادة مسبقاً.');

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE hr_employee_clearances SET clearance_certificate_issued = 1,
         certificate_issued_at = ?, certificate_issued_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [now, actor.id, clearanceId]
    );

    this.auditActor(actor, 'إصدار شهادة إخلاء طرف', clearanceId, { issuedAt: now });
  }

  static approveClearance(clearanceId: string, decisionNote?: string): void {
    this.decideClearance(clearanceId, true, decisionNote);
  }

  static rejectClearance(clearanceId: string, decisionNote: string): void {
    if (!decisionNote?.trim()) throw new Error('سبب الرفض مطلوب.');
    this.decideClearance(clearanceId, false, decisionNote);
  }

  private static decideClearance(clearanceId: string, approve: boolean, decisionNote?: string): void {
    const actor = this.requireManage();
    const clearance = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_employee_clearances WHERE id = ?',
      [clearanceId]
    )[0];
    if (!clearance) throw new Error('طلب إخلاء الطرف غير موجود.');
    if (clearance.status !== 'PENDING' && clearance.status !== 'IN_PROGRESS') {
      throw new Error('لا يمكن البت في طلب إخلاء طرف بهذه الحالة.');
    }

    const now = new Date().toISOString();
    const newStatus = approve ? 'CLEARED' : 'REJECTED';
    this.db.run(
      `UPDATE hr_employee_clearances SET status = ?, decided_by = ?, decided_at = ?,
         decision_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, actor.id, now, decisionNote || null, clearanceId]
    );

    this.auditActor(actor, approve ? 'اعتماد إخلاء طرف' : 'رفض إخلاء طرف', clearanceId, {
      previousStatus: clearance.status, newStatus, decisionNote,
    });
  }

  static cancelClearance(clearanceId: string): void {
    const actor = this.requireManage();
    const clearance = this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM hr_employee_clearances WHERE id = ?',
      [clearanceId]
    )[0];
    if (!clearance) throw new Error('طلب إخلاء الطرف غير موجود.');
    if (clearance.status === 'CLEARED' || clearance.status === 'CANCELLED') {
      throw new Error('لا يمكن إلغاء إخلاء طرف معتمد أو ملغي.');
    }
    this.db.run(
      'UPDATE hr_employee_clearances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['CANCELLED', clearanceId]
    );
    this.auditActor(actor, 'إلغاء إخلاء طرف', clearanceId, {});
  }

  /* ========== Summary ========== */

  static getClearanceSummary(): ClearanceSummary {
    const actor = this.requireView();
    const companyId = this.currentCompanyId(actor);
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const rows = this.db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM hr_employee_clearances c
       WHERE c.company_id = ? AND ${scope.clause} GROUP BY status`,
      [companyId, ...scope.params]
    );
    const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      pending: counts.get('PENDING') ?? 0,
      inProgress: counts.get('IN_PROGRESS') ?? 0,
      assetsReturned: counts.get('ASSETS_RETURNED') ?? 0,
      financialCleared: counts.get('FINANCIAL_CLEARED') ?? 0,
      cleared: counts.get('CLEARED') ?? 0,
      rejected: counts.get('REJECTED') ?? 0,
      cancelled: counts.get('CANCELLED') ?? 0,
    };
  }

  /* ========== Helpers ========== */

  private static getUserName(userId: string | null): string | null {
    if (!userId) return null;
    const row = this.db.query<{ fullName: string }>('SELECT full_name AS fullName FROM users WHERE id = ?', [userId])[0];
    return row?.fullName ?? null;
  }

  private static getEmployeeName(employeeId: string): string | null {
    if (!employeeId) return null;
    const row = this.db.query<{ name: string }>('SELECT name FROM employees WHERE id = ?', [employeeId])[0];
    return row?.name ?? null;
  }

  private static auditActor(actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }

  private static audit(db: any, actor: { id: string; fullName: string }, action: string, recordId: string, values: object): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().replace(/-/g, '').slice(0, 12)}`, actor.id, actor.fullName, action, recordId,
        JSON.stringify(values)]
    );
  }
}
