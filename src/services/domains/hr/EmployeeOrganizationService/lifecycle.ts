import { v4 as uuidv4 } from 'uuid';
import { localDateString } from '../../../../utils/shared/date';
import { AuthService } from '../../auth/AuthService';
import { ApprovalService } from '../../approvals/ApprovalService';
import { NotificationService } from '../../notifications/NotificationService';
import type { User } from '../../../../types/auth/identity';
import type { OrgServiceDeps } from './types';
import { requireView } from './context';
import { getVacancies } from './departments';

export function requestOffboardingApproval(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string; reason: string; branchId?: string;
  }
): string {
  const { db, branchAccess } = deps;
  const employee = db.query<{ branchId: string | null; name: string }>(
    'SELECT branch_id AS branchId, COALESCE(name, full_name) AS name FROM employees WHERE id = ?',
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  const branchId = input.branchId || employee.branchId || branchAccess.getCurrentBranchId(actor);
  branchAccess.requireBranchAccess(branchId, actor);
  const approval = new ApprovalService().createRequest({
    requestType: 'OTHER',
    title: `إخلاء طرف وإنهاء خدمة: ${employee.name}`,
    description: input.reason,
    priority: 'HIGH',
    referenceType: 'EMPLOYEE',
    referenceId: input.employeeId,
    branchId,
  });
  db.run(
    `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
     VALUES (?, ?, 'OFFBOARDING_REQUEST', ?, ?, ?, ?)`,
    [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, localDateString(),
     'PENDING_APPROVAL', input.reason, actor.id]
  );
  return approval.id;
}

export function finalizeOffboarding(
  deps: OrgServiceDeps,
  actor: User,
  employeeId: string,
  terminationDate: string,
  notes?: string
): void {
  const { db } = deps;
  db.executeTransaction((txnDb) => {
    txnDb.run(
      `UPDATE employees SET status = 'TERMINATED', terminated_at = ?, is_active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [terminationDate, employeeId]
    );
    txnDb.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, to_value, notes, actor_id)
       VALUES (?, ?, 'TERMINATION', ?, 'TERMINATED', ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, employeeId, terminationDate, notes?.trim() || null, actor.id]
    );
    txnDb.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'إنهاء خدمة', 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, employeeId,
       JSON.stringify({ terminationDate, notes })]
    );
  });
}

export function promoteEmployee(
  deps: OrgServiceDeps,
  actor: User,
  input: {
    employeeId: string;
    newRole?: string;
    newGradeId?: string | null;
    newBaseSalary?: number;
    effectiveDate: string;
    reason?: string;
    createBonus?: boolean;
    bonusAmount?: number;
  }
): void {
  const { db } = deps;
  const employee = db.query<{ branchId: string | null; role: string; jobGradeId: string | null; baseSalary: number }>(
    `SELECT branch_id AS branchId, role, job_grade_id AS jobGradeId, base_salary / 100.0 AS baseSalary FROM employees WHERE id = ?`,
    [input.employeeId]
  )[0];
  if (!employee) throw new Error('الموظف غير موجود.');
  db.executeTransaction((txnDb) => {
    txnDb.run(
      `UPDATE employees SET role = COALESCE(?, role), job_title = COALESCE(?, job_title),
         job_grade_id = COALESCE(?, job_grade_id), base_salary = COALESCE(ROUND(?*100), base_salary),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.newRole || null, input.newRole || null, input.newGradeId || null,
       input.newBaseSalary ?? null, input.employeeId]
    );
    txnDb.run(
      `INSERT INTO employee_lifecycle_events (id, employee_id, event_type, event_date, from_value, to_value, notes, actor_id)
       VALUES (?, ?, 'PROMOTION', ?, ?, ?, ?, ?)`,
      [`ev_${uuidv4().replace(/-/g, '').slice(0, 16)}`, input.employeeId, input.effectiveDate,
       `${employee.role}/${employee.jobGradeId || ''}`,
       `${input.newRole || employee.role}/${input.newGradeId || employee.jobGradeId || ''}`,
       input.reason?.trim() || null, actor.id]
    );
    if (input.createBonus && (input.bonusAmount || 0) > 0) {
      txnDb.run(
        `INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by, branch_id, payment_status)
         VALUES (?, ?, 'BONUS', ROUND(?*100), ?, ?, ?, ?, 'PAID')`,
        [`ptx_${uuidv4().substring(0, 8)}`, input.employeeId, input.bonusAmount, input.effectiveDate,
         `مكافأة ترقية: ${input.reason || ''}`, actor.id, employee.branchId]
      );
    }
    txnDb.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, 'ترقية موظف', 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, input.employeeId,
       JSON.stringify({ newRole: input.newRole, newGradeId: input.newGradeId, effectiveDate: input.effectiveDate })]
    );
  });
}

export function notifyHrAlerts(deps: OrgServiceDeps): void {
  const { db } = deps;
  AuthService.requireAuth();
  const notifications = new NotificationService();
  const today = localDateString();

  const probationDue = db.query<{ id: string; name: string; probationEndDate: string }>(`
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

  const overdueOnboarding = db.query<{ employeeId: string; count: number }>(`
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

  const actor = requireView();
  const vacancies = getVacancies(deps, actor);
  const totalVacant = vacancies.reduce((sum, row) => sum + row.vacant, 0);
  if (totalVacant > 0) {
    notifications.createNotification('SYSTEM',
      'شواغر وظيفية',
      `يوجد ${totalVacant} شاغر وظيفي في الأقسام.`,
      undefined, 'HR_VACANCIES', 'GLOBAL');
  }
}
