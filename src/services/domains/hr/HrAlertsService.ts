import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { PayrollNotificationSettingsService } from './PayrollNotificationSettingsService';
import { localDateString, addLocalDays } from '../../../utils/shared/date';
import type { User } from '../../../types/auth/identity';
import type { NotificationType } from '../../../types/notifications';

const CONTRACT_NOTICE_HORIZON_DAYS = 30;
const DOCUMENT_EXPIRY_HORIZON_DAYS = 30;
const LEAVE_LOW_BALANCE_THRESHOLD = 5;
const LEAVE_CARRYOVER_HORIZON_DAYS = 60;

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isDateSoon(date: string | null | undefined, horizon: string): boolean {
  if (!date) return false;
  return date <= horizon;
}

export class HrAlertsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  private requireView(): User {
    const actor = AuthService.requireAuth();
    ModuleRegistryService.assertModuleEnabled('hr');
    PermissionService.requireAny(actor, [
      'hr.contracts.view', 'hr.documents.view', 'hr.leave.view', 'employees.payroll.view', 'employees.view',
    ]);
    return actor;
  }

  /** إشعارات العقود التي تقترب من الانتهاء أو انتهت الصلاحية */
  private checkContractExpiries(actor: User, horizon: string): { created: number } {
    let created = 0;
    const scope = this.branchAccess.sqlScope('c.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    const rows = this.db.query<any>(`
      SELECT c.id, c.contract_number AS contractNumber, c.employee_id AS employeeId, e.name AS employeeName,
             c.end_date AS endDate, c.renewal_notice_days AS renewalNoticeDays, c.status,
             c.job_title AS jobTitle
      FROM employee_contracts c
      JOIN employees e ON e.id = c.employee_id
      WHERE c.status = 'ACTIVE' AND c.end_date IS NOT NULL
        AND ${scope.clause} AND ${departmentScope.clause}
    `, [...scope.params, ...departmentScope.params]);

    for (const row of rows) {
      const noticeDays = Number(row.renewalNoticeDays) || CONTRACT_NOTICE_HORIZON_DAYS;
      const noticeStart = addDays(row.endDate, -noticeDays);
      const alreadyExpired = row.endDate < localDateString();
      const expiringSoon = !alreadyExpired && isDateSoon(noticeStart, horizon);
      const referenceType = 'HR_CONTRACT';
      const referenceId = row.id;

      if (alreadyExpired) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_CONTRACT_EXPIRY' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          this.createNotification(
            'HR_CONTRACT_EXPIRY',
            'انتهاء عقد موظف',
            `انتهى عقد الموظف "${row.employeeName}" (${row.contractNumber}) في ${row.endDate} وكان مخصصاً للوظيفة "${row.jobTitle}".`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      } else if (expiringSoon) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_CONTRACT_EXPIRY' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          const daysLeft = Math.round(
            (new Date(`${row.endDate}T00:00:00Z`).getTime() - new Date(`${localDateString()}T00:00:00Z`).getTime()) / 86_400_000
          );
          this.createNotification(
            'HR_CONTRACT_EXPIRY',
            'عقد يقترب من الانتهاء',
            `عقد الموظف "${row.employeeName}" (${row.contractNumber}) ينتهي خلال ${daysLeft} يوماً في ${row.endDate}. يفضل البدء في إجراءات التجديد.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      }
    }
    return { created };
  }

  /** إشعارات قرب انتهاء فترة الاختبار للموظفين */
  private checkProbationEnds(actor: User, horizon: string): { created: number } {
    let created = 0;
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    const rows = this.db.query<any>(`
      SELECT e.id, e.name AS employeeName, e.code, e.probation_end_date AS probationEndDate, e.status, e.job_title AS jobTitle
      FROM employees e
      WHERE e.status = 'PROBATION' AND e.probation_end_date IS NOT NULL
        AND ${scope.clause} AND ${departmentScope.clause}
    `, [...scope.params, ...departmentScope.params]);

    for (const row of rows) {
      const alreadyEnded = row.probationEndDate < localDateString();
      const endingSoon = !alreadyEnded && isDateSoon(row.probationEndDate, horizon);
      const referenceType = 'HR_PROBATION';
      const referenceId = row.id;

      if (alreadyEnded) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_PROBATION_END' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          this.createNotification(
            'HR_PROBATION_END',
            'انتهاء فترة اختبار موظف',
            `انتهت فترة اختبار الموظف "${row.employeeName}" (${row.code}) في ${row.probationEndDate} دون تعديل حالته. يفضل مراجعة حالته الوظيفية.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      } else if (endingSoon) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_PROBATION_END' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          const daysLeft = Math.round(
            (new Date(`${row.probationEndDate}T00:00:00Z`).getTime() - new Date(`${localDateString()}T00:00:00Z`).getTime()) / 86_400_000
          );
          this.createNotification(
            'HR_PROBATION_END',
            'قرب انتهاء فترة اختبار',
            `فترة اختبار الموظف "${row.employeeName}" (${row.code}) تنتهي خلال ${daysLeft} يوماً في ${row.probationEndDate}.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      }
    }
    return { created };
  }

  /** إشعارات انتهاء صلاحية مستندات الموظفين (هوية، رخصة، شهادات، تأمين صحي) */
  private checkDocumentExpiries(actor: User, horizon: string): { created: number } {
    let created = 0;
    const scope = this.branchAccess.sqlScope('d.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    const rows = this.db.query<any>(`
      SELECT d.id, d.title, d.document_type AS documentType, d.expires_at AS expiresAt,
             d.status, e.name AS employeeName, e.code AS employeeCode, d.confidentiality
      FROM employee_documents d
      JOIN employees e ON e.id = d.employee_id
      WHERE d.status = 'ACTIVE' AND d.expires_at IS NOT NULL
        AND ${scope.clause} AND ${departmentScope.clause}
    `, [...scope.params, ...departmentScope.params]);

    for (const row of rows) {
      const alreadyExpired = row.expiresAt < localDateString();
      const expiringSoon = !alreadyExpired && isDateSoon(row.expiresAt, horizon);
      const referenceType = 'HR_DOCUMENT';
      const referenceId = row.id;

      if (alreadyExpired) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_DOCUMENT_EXPIRY' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          this.createNotification(
            'HR_DOCUMENT_EXPIRY',
            'انتهاء صلاحية مستند موظف',
            `انتهى صلاحية مستند "${row.title}" (${row.documentType}) للموظف "${row.employeeName}" (${row.employeeCode}) في ${row.expiresAt}.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      } else if (expiringSoon) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_DOCUMENT_EXPIRY' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          const daysLeft = Math.round(
            (new Date(`${row.expiresAt}T00:00:00Z`).getTime() - new Date(`${localDateString()}T00:00:00Z`).getTime()) / 86_400_000
          );
          this.createNotification(
            'HR_DOCUMENT_EXPIRY',
            'مستند يقترب من انتهاء الصلاحية',
            `مستند "${row.title}" (${row.documentType}) للموظف "${row.employeeName}" (${row.employeeCode}) ينتهي خلال ${daysLeft} يوماً في ${row.expiresAt}.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      }
    }
    return { created };
  }

  /** إشعارات أرصدة الإجازات السنوية المنخفضة وقرب موعد الترحيل */
  private checkLeaveBalances(actor: User, horizon: string): { created: number } {
    let created = 0;
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    const today = localDateString();
    const year = Number(today.slice(0, 4));
    const yearEnd = `${year}-12-31`;

    const rows = this.db.query<any>(`
      SELECT e.id, e.name AS employeeName, e.code, e.status
      FROM employees e
      WHERE e.status IN ('ACTIVE', 'PROBATION')
        AND ${scope.clause} AND ${departmentScope.clause}
    `, [...scope.params, ...departmentScope.params]);

    for (const row of rows) {
      const referenceType = 'HR_LEAVE_BALANCE';
      const referenceId = row.id;

      // الرصيد السنوي الممنوح (يُضاف عبر حركات الرصيد، وتُخصم الإجازات المعتمدة منه)
      const grantedRow = this.db.query<{ days: number }>(`
        SELECT COALESCE(SUM(t.days_delta), 0) AS days
        FROM employee_leave_balance_transactions t
        WHERE t.employee_id = ? AND t.leave_year = ? AND t.effective_date <= ?
      `, [row.id, year, today])[0];

      const granted = Number(grantedRow?.days || 0);
      const available = Math.max(0, granted);

      if (available <= LEAVE_LOW_BALANCE_THRESHOLD && granted > 0) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_LEAVE_BALANCE' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          this.createNotification(
            'HR_LEAVE_BALANCE',
            'رصيد إجازات سنوي منخفض',
            `رصيد الإجازات السنوية المتاح للموظف "${row.employeeName}" (${row.code}) هو ${available} يوماً فقط للسنة ${year}.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      }

      // قرب موعد نهاية السنة والتفقد بشأن الترحيل
      const carryoverRow = this.db.query<{ days: number }>(`
        SELECT COALESCE(SUM(t.days_delta), 0) AS days
        FROM employee_leave_balance_transactions t
        WHERE t.employee_id = ? AND t.leave_year = ? AND t.transaction_type = 'CARRYOVER' AND t.effective_date <= ?
      `, [row.id, year, today])[0];

      const carryoverDays = Number(carryoverRow?.days || 0);
      const daysToYearEnd = Math.round(
        (new Date(`${yearEnd}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000
      );

      if (carryoverDays === 0 && available > 0 && daysToYearEnd <= LEAVE_CARRYOVER_HORIZON_DAYS) {
        const exists = this.db.query<any>(
          `SELECT id FROM notifications WHERE type = 'HR_LEAVE_BALANCE' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
          [referenceType, referenceId]
        );
        if (exists.length === 0) {
          this.createNotification(
            'HR_LEAVE_BALANCE',
            'قرب موعد ترحيل الإجازات السنوية',
            `يتبقى ${daysToYearEnd} يوماً على نهاية السنة ${year}. رصيد الإجازات غير المستهلكة للموظف "${row.employeeName}" (${row.code}) هو ${available} يوماً وقد يفقد إذا لم يُرحّل أو يُستخدم.`,
            actor.id, referenceType, referenceId
          );
          created += 1;
        }
      }
    }
    return { created };
  }

  /** إشعارات أقساط القروض المستحقة للموظفين */
  private checkLoanInstallments(actor: User, horizon: string): { created: number } {
    let created = 0;
    // HR loans inherit their branch from the employee; hr_loans has no branch_id.
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);

    const rows = this.db.query<any>(`
      SELECT i.id, i.due_date AS dueDate, i.amount, i.status,
             l.id AS loanId, l.employee_id AS employeeId, e.name AS employeeName, e.code AS employeeCode
      FROM hr_loan_installments i
      JOIN hr_loans l ON l.id = i.loan_id
      JOIN employees e ON e.id = l.employee_id
      WHERE i.status = 'PENDING' AND i.due_date <= ?
        AND ${scope.clause} AND ${departmentScope.clause}
      ORDER BY i.due_date ASC
    `, [...scope.params, ...departmentScope.params, horizon]);

    for (const row of rows) {
      const overdue = row.dueDate < localDateString();
      const referenceType = 'HR_LOAN';
      const referenceId = row.id;

      const exists = this.db.query<any>(
        `SELECT id FROM notifications WHERE type = 'HR_LOAN_DUE' AND reference_type = ? AND reference_id = ? AND is_read = 0`,
        [referenceType, referenceId]
      );
      if (exists.length > 0) continue;

      if (overdue) {
        this.createNotification(
          'HR_LOAN_DUE',
          'قسط قرض متأخر',
          `قسط قرض الموظف "${row.employeeName}" (${row.employeeCode}) بمبلغ ${Number(row.amount).toFixed(2)} ج.م كان مستحقاً في ${row.dueDate} ولم يُسدد بعد.`,
          actor.id, referenceType, referenceId
        );
      } else {
        const daysLeft = Math.round(
          (new Date(`${row.dueDate}T00:00:00Z`).getTime() - new Date(`${localDateString()}T00:00:00Z`).getTime()) / 86_400_000
        );
        this.createNotification(
          'HR_LOAN_DUE',
          'قسط قرض مستحق قريباً',
          `قسط قرض الموظف "${row.employeeName}" (${row.employeeCode}) بمبلغ ${Number(row.amount).toFixed(2)} ج.م يستحق خلال ${daysLeft} يوماً في ${row.dueDate}.`,
          actor.id, referenceType, referenceId
        );
      }
      created += 1;
    }
    return { created };
  }

  /** إشعارات مواعيد استحقاق صرف الرواتب (مستحقة قريباً أو متأخرة) */
  private checkPayrollDues(actor: User, horizon: string): { created: number } {
    let created = 0;
    const scope = this.branchAccess.sqlScope('fce.branch_id', undefined, actor);

    // استعلام أحداث الرواتب من التقويم المالي (event_type = 'PAYROLL')
    const rows = this.db.query<any>(`
      SELECT fce.id, fce.title, fce.due_date AS dueDate, fce.amount, fce.paid_amount AS paidAmount,
             fce.status, fce.reference, fce.branch_id AS branchId, b.name AS branchName
      FROM financial_calendar_events fce
      JOIN branches b ON b.id = fce.branch_id
      WHERE fce.event_type = 'PAYROLL'
        AND fce.status NOT IN ('PAID', 'COLLECTED', 'CANCELLED')
        AND fce.amount > fce.paid_amount
        AND fce.due_date <= ?
        AND ${scope.clause}
      ORDER BY fce.due_date ASC
    `, [...scope.params, horizon]);

    for (const row of rows) {
      const overdue = row.dueDate < localDateString();
      const referenceType = 'HR_PAYROLL';
      const referenceId = row.id;

      // التحقق من إعدادات الفرع
      if (overdue && !PayrollNotificationSettingsService.shouldNotifyOverdue(row.branchId)) continue;
      if (!overdue && !PayrollNotificationSettingsService.shouldNotifyDue(row.branchId)) continue;

      const exists = this.db.query<any>(
        `SELECT id FROM notifications WHERE type IN ('HR_PAYROLL_DUE', 'HR_PAYROLL_OVERDUE') AND reference_type = ? AND reference_id = ? AND is_read = 0`,
        [referenceType, referenceId]
      );
      if (exists.length > 0) continue;

      const remaining = Number(row.amount) - Number(row.paidAmount || 0);
      const daysLeft = Math.round(
        (new Date(`${row.dueDate}T00:00:00Z`).getTime() - new Date(`${localDateString()}T00:00:00Z`).getTime()) / 86_400_000
      );

      // استخدام فترة التنبيه المخصصة للفرع
      const dueHorizonDays = PayrollNotificationSettingsService.getDueHorizonDays(row.branchId);
      const isDueSoon = !overdue && daysLeft <= dueHorizonDays;

      if (overdue) {
        this.createNotification(
          'HR_PAYROLL_OVERDUE',
          'صرف رواتب متأخر',
          `صرف رواتب ${row.branchName} (${row.title}) متأخر منذ ${Math.abs(daysLeft)} يوماً. المتبقي للصرف: ${remaining.toLocaleString('ar-EG')} ج.م. تاريخ الاستحقاق كان ${row.dueDate}.`,
          actor.id, referenceType, referenceId
        );
      } else if (isDueSoon) {
        this.createNotification(
          'HR_PAYROLL_DUE',
          'صرف رواتب مستحق قريباً',
          `صرف رواتب ${row.branchName} (${row.title}) مستحق خلال ${daysLeft} يوماً (${row.dueDate}). المبلغ المتبقي: ${remaining.toLocaleString('ar-EG')} ج.م.`,
          actor.id, referenceType, referenceId
        );
      }
      created += 1;
    }
    return { created };
  }

  private createNotification(
    type: NotificationType,
    title: string,
    message: string,
    userId: string | undefined,
    referenceType: string,
    referenceId: string
  ): void {
    const id = `ntf_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO notifications (id, user_id, type, title, message, is_read, reference_type, reference_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)`,
      [id, userId || null, type, title, message, referenceType, referenceId]
    );
  }

  /** تشغيل جميع فحوصات التنبيهات الخاصة بالموارد البشرية */
  public runHrAlerts(): { created: number; details: string[] } {
    const actor = this.requireView();
    const horizon = localDateString(addLocalDays(new Date(), CONTRACT_NOTICE_HORIZON_DAYS));
    const details: string[] = [];

    const contracts = this.checkContractExpiries(actor, horizon);
    if (contracts.created > 0) details.push(`العقود: ${contracts.created} تنبيه`);

    const probation = this.checkProbationEnds(actor, horizon);
    if (probation.created > 0) details.push(`فترات الاختبار: ${probation.created} تنبيه`);

    const documents = this.checkDocumentExpiries(actor, horizon);
    if (documents.created > 0) details.push(`مستندات الموظفين: ${documents.created} تنبيه`);

    const leaves = this.checkLeaveBalances(actor, horizon);
    if (leaves.created > 0) details.push(`أرصدة الإجازات: ${leaves.created} تنبيه`);

    const loans = this.checkLoanInstallments(actor, horizon);
    if (loans.created > 0) details.push(`أقساط القروض: ${loans.created} تنبيه`);

    const payroll = this.checkPayrollDues(actor, horizon);
    if (payroll.created > 0) details.push(`مواعيد صرف الرواتب: ${payroll.created} تنبيه`);

    const total = contracts.created + probation.created + documents.created + leaves.created + loans.created + payroll.created;
    return { created: total, details };
  }
}
