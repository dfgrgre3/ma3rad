import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { NotificationService } from '../notifications/NotificationService';
import { EmployeeService } from './EmployeeService';

export interface HrAllowance { id: string; employeeId: string; allowanceType: string; amount: number; frequency: string; effectiveFrom: string; effectiveTo: string | null; isActive: boolean; createdAt: string; }
export interface HrBenefit { id: string; employeeId: string; benefitType: string; provider: string | null; policyNumber: string | null; startDate: string; endDate: string | null; amount: number; status: string; createdAt: string; }
export interface HrLoan { id: string; employeeId: string; principal: number; installmentAmount: number; startDate: string; remainingBalance: number; status: string; notes: string | null; createdAt: string; }
export interface HrLoanInstallment { id: string; loanId: string; dueDate: string; amount: number; status: string; payrollTransactionId: string | null; createdAt: string; }
export interface HrLeaveSettlement { id: string; employeeId: string; leaveDays: number; amount: number; settlementDate: string; status: string; notes: string | null; createdAt: string; }

export class HrBenefitsService {
  private static db = DatabaseManager.getInstance();

  private static requireView() { const actor = AuthService.requireAuth(); PermissionService.requireAny(actor, ['ui.employees.employees.view', 'employees.payroll.view', 'employees.payroll.manage']); return actor; }
  private static requireManage() { const actor = AuthService.requireAuth(); ModuleRegistryService.assertModuleEnabled('hr'); PermissionService.require(actor, 'employees.payroll.manage'); return actor; }

  private static audit(actor: ReturnType<typeof AuthService.requireAuth>, action: string, recordId: string, values: unknown): void {
    this.db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, ?, 'HR', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, action, recordId, JSON.stringify(values)]);
  }

  // Allowances
  static createAllowance(input: { employeeId: string; allowanceType: string; amount: number; frequency?: string; effectiveFrom: string; effectiveTo?: string | null }): HrAllowance {
    const actor = this.requireManage();
    const id = `alw_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_allowances (id, employee_id, allowance_type, amount, frequency, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.allowanceType.trim(), Math.max(0, Number(input.amount) || 0), input.frequency || 'MONTHLY', input.effectiveFrom, input.effectiveTo || null]);
    this.audit(actor, 'إضافة بدل', id, input);
    try { new NotificationService().createNotification('SYSTEM', 'إضافة بدل', `تم إضافة بدل ${input.allowanceType} بقيمة ${input.amount} للموظف ${input.employeeId}`, undefined, 'HR_ALLOWANCE', id); } catch { /* ignore */ }
    return this.getAllowances(input.employeeId).find((a) => a.id === id)!;
  }
  static getAllowances(employeeId?: string): HrAllowance[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_allowances WHERE ${where} ORDER BY created_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, allowanceType: r.allowanceType, amount: Number(r.amount) || 0, frequency: r.frequency,
      effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo || null, isActive: Boolean(r.isActive), createdAt: r.createdAt,
    }));
  }
  static deactivateAllowance(id: string): void { const actor = this.requireManage(); this.db.run('UPDATE hr_allowances SET is_active = 0 WHERE id = ?', [id]); this.audit(actor, 'تعطيل بدل', id, {}); }

  static getAllowanceTotal(employeeId: string, period: string): number {
    const periodEnd = `${period}-31`;
    const rows = this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(amount), 0) AS amount FROM hr_allowances
      WHERE employee_id = ? AND is_active = 1 AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
        AND frequency = 'MONTHLY'
    `, [employeeId, periodEnd, `${period}-01`]);
    return Number(rows[0]?.amount) || 0;
  }

  // Benefits
  static createBenefit(input: { employeeId: string; benefitType: string; provider?: string; policyNumber?: string; startDate: string; endDate?: string | null; amount?: number }): HrBenefit {
    const actor = this.requireManage();
    const id = `ben_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_benefits (id, employee_id, benefit_type, provider, policy_number, start_date, end_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, input.benefitType.trim(), input.provider?.trim() || null, input.policyNumber?.trim() || null, input.startDate, input.endDate || null, Math.max(0, Number(input.amount) || 0)]);
    this.audit(actor, 'إضافة ميزة/تأمين', id, input);
    try { new NotificationService().createNotification('SYSTEM', 'إضافة ميزة/تأمين', `تم إضافة ${input.benefitType} للموظف ${input.employeeId}`, undefined, 'HR_BENEFIT', id); } catch { /* ignore */ }
    return this.getBenefits(input.employeeId).find((b) => b.id === id)!;
  }
  static getBenefits(employeeId?: string): HrBenefit[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_benefits WHERE ${where} ORDER BY start_date DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, benefitType: r.benefitType, provider: r.provider || null, policyNumber: r.policyNumber || null,
      startDate: r.startDate, endDate: r.endDate || null, amount: Number(r.amount) || 0, status: r.status, createdAt: r.createdAt,
    }));
  }
  static updateBenefitStatus(id: string, status: string): void { const actor = this.requireManage(); this.db.run('UPDATE hr_benefits SET status = ? WHERE id = ?', [status, id]); this.audit(actor, 'تحديث حالة ميزة', id, { status }); }

  // Loans
  static createLoan(input: { employeeId: string; principal: number; installmentAmount: number; startDate: string; notes?: string }): HrLoan {
    const actor = this.requireManage();
    const id = `lon_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const principal = Math.max(0, Number(input.principal) || 0);
    this.db.run(`INSERT INTO hr_loans (id, employee_id, principal, installment_amount, start_date, remaining_balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, principal, Math.max(0, Number(input.installmentAmount) || 0), input.startDate, principal, input.notes?.trim() || null]);
    // generate installments monthly until the principal is covered
    const installment = Math.max(0, Number(input.installmentAmount) || 0);
    if (installment > 0) {
      const [startYear, startMonth, startDay] = input.startDate.split('-').map(Number);
      let remaining = principal;
      let guard = 0;
      while (remaining > 0.009 && guard < 120) {
        const due = new Date(Date.UTC(startYear, startMonth - 1 + guard, startDay || 1));
        const dueDate = `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}-${String(due.getUTCDate()).padStart(2, '0')}`;
        const amt = Math.min(installment, remaining);
        this.db.run(`INSERT INTO hr_loan_installments (id, loan_id, due_date, amount) VALUES (?, ?, ?, ?)`,
          [`ins_${uuidv4().replace(/-/g, '').slice(0, 16)}`, id, dueDate, amt]);
        remaining = Math.max(0, remaining - amt);
        guard += 1;
      }
    }
    this.audit(actor, 'إنشاء قرض', id, input);
    const branchId = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?', [input.employeeId]
    )[0]?.branchId || null;
    if (principal > 0) {
      postLedgerEntry(this.db.getDatabase(), {
        date: input.startDate,
        description: `Employee loan ${id} disbursement for ${input.employeeId}`,
        referenceType: 'HR_LOAN_DISBURSEMENT',
        referenceId: `${input.employeeId}:${id}`,
        createdBy: actor.id,
        branchId,
        lines: [
          { accountCode: '1202', debit: principal, credit: 0 },
          { accountCode: '2104', debit: 0, credit: principal },
        ],
      });
    }
    try { new NotificationService().createNotification('SYSTEM', 'إنشاء قرض موظف', `تم إنشاء قرض بقيمة ${principal} للموظف ${input.employeeId}`, undefined, 'HR_LOAN', id); } catch { /* ignore */ }
    return this.getLoans(input.employeeId).find((l) => l.id === id)!;
  }
  static getLoans(employeeId?: string): HrLoan[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_loans WHERE ${where} ORDER BY created_at DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, principal: Number(r.principal) || 0, installmentAmount: Number(r.installmentAmount) || 0,
      startDate: r.startDate, remainingBalance: Number(r.remainingBalance) || 0, status: r.status, notes: r.notes || null, createdAt: r.createdAt,
    }));
  }
  static getInstallments(loanId: string): HrLoanInstallment[] {
    this.requireView();
    return this.db.query<any>(`SELECT * FROM hr_loan_installments WHERE loan_id = ? ORDER BY due_date`, [loanId]).map((r) => ({
      id: r.id, loanId: r.loanId, dueDate: r.dueDate, amount: Number(r.amount) || 0, status: r.status, payrollTransactionId: r.payrollTransactionId || null, createdAt: r.createdAt,
    }));
  }
  static getDueInstallments(employeeId: string, period: string): number {
    const periodEnd = `${period}-31`;
    const rows = this.db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(i.amount), 0) AS amount
      FROM hr_loan_installments i
      JOIN hr_loans l ON l.id = i.loan_id
      WHERE l.employee_id = ? AND i.status = 'PENDING' AND i.due_date <= ?
    `, [employeeId, periodEnd]);
    return Number(rows[0]?.amount) || 0;
  }
  static markInstallmentsPaid(employeeId: string, period: string, payrollTransactionId: string): void {
    const actor = this.requireManage();
    const periodEnd = `${period}-31`;
    const installments = this.db.query<{ id: string }>(`
      SELECT i.id FROM hr_loan_installments i
      JOIN hr_loans l ON l.id = i.loan_id
      WHERE l.employee_id = ? AND i.status = 'PENDING' AND i.due_date <= ?
    `, [employeeId, periodEnd]);
    for (const inst of installments) {
      this.db.run(`UPDATE hr_loan_installments SET status = 'PAID', payroll_transaction_id = ? WHERE id = ?`, [payrollTransactionId, inst.id]);
    }
    // update remaining balances
    const loans = this.db.query<{ id: string }>(`SELECT id FROM hr_loans WHERE employee_id = ? AND status = 'ACTIVE'`, [employeeId]);
    for (const loan of loans) {
      const remaining = this.db.query<{ remaining: number }>(`
        SELECT COALESCE(SUM(amount), 0) AS remaining FROM hr_loan_installments WHERE loan_id = ? AND status = 'PENDING'
      `, [loan.id])[0]?.remaining || 0;
      this.db.run(`UPDATE hr_loans SET remaining_balance = ?, status = CASE WHEN ? <= 0.009 THEN 'COMPLETED' ELSE 'ACTIVE' END WHERE id = ?`,
        [remaining, remaining, loan.id]);
    }
    this.audit(actor, 'تسديد أقساط قرض', employeeId, { period, payrollTransactionId, count: installments.length });
  }

  // Leave settlements
  static createLeaveSettlement(input: { employeeId: string; leaveDays: number; amount: number; settlementDate: string; notes?: string }): HrLeaveSettlement {
    const actor = this.requireManage();
    const id = `lvs_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    this.db.run(`INSERT INTO hr_leave_settlements (id, employee_id, leave_days, amount, settlement_date, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.employeeId, Math.max(0, Number(input.leaveDays) || 0), Math.max(0, Number(input.amount) || 0), input.settlementDate, input.notes?.trim() || null]);
    this.audit(actor, 'تسوية إجازات غير مستخدمة', id, input);
    return this.getLeaveSettlements(input.employeeId).find((s) => s.id === id)!;
  }
  static getLeaveSettlements(employeeId?: string): HrLeaveSettlement[] {
    this.requireView();
    const params: any[] = [];
    let where = '1 = 1';
    if (employeeId) { where = 'employee_id = ?'; params.push(employeeId); }
    return this.db.query<any>(`SELECT * FROM hr_leave_settlements WHERE ${where} ORDER BY settlement_date DESC`, params).map((r) => ({
      id: r.id, employeeId: r.employeeId, leaveDays: Number(r.leaveDays) || 0, amount: Number(r.amount) || 0,
      settlementDate: r.settlementDate, status: r.status, notes: r.notes || null, createdAt: r.createdAt,
    }));
  }
  static approveLeaveSettlement(id: string): void {
    const actor = this.requireManage();
    const settlement = this.db.query<{ employeeId: string; amount: number; settlementDate: string; status: string }>(
      `SELECT employee_id AS employeeId, amount, settlement_date AS settlementDate, status
       FROM hr_leave_settlements WHERE id = ?`, [id]
    )[0];
    if (!settlement) throw new Error('تسوية الإجازات غير موجودة.');
    if (settlement.status !== 'PENDING') throw new Error('التسوية ليست في حالة انتظار.');
    this.db.run(`UPDATE hr_leave_settlements SET status = 'APPROVED' WHERE id = ?`, [id]);
    if (Number(settlement.amount) > 0) {
      EmployeeService.addTransaction({
        employeeId: settlement.employeeId,
        type: 'BONUS',
        amount: Number(settlement.amount),
        date: settlement.settlementDate,
        notes: 'تسوية إجازات غير مستخدمة',
      });
    }
    try { new NotificationService().createNotification('SYSTEM', 'اعتماد تسوية إجازات', `تم اعتماد تسوية إجازات بقيمة ${settlement.amount} للموظف ${settlement.employeeId}`, undefined, 'HR_LEAVE_SETTLEMENT', id); } catch { /* ignore */ }
    this.audit(actor, 'اعتماد تسوية إجازات', id, { amount: settlement.amount });
  }
}
