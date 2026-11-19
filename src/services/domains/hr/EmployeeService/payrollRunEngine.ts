import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { localDateString } from '../../../../utils/shared/date';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { AttendanceTimeService } from '../AttendanceTimeService';
import { PayrollSocialInsuranceService } from '../PayrollSocialInsuranceService';
import { PayrollTaxService } from '../PayrollTaxService';
import {
  countLeaveDays,
  countScheduledWorkdays,
  daysBetweenInclusive,
  isEmployeeScheduledOn,
  roundMoney,
  WORKING_HOURS_PER_DAY,
} from './utils';
import type {
  EmployeeServiceActor,
  PayrollPayOptions,
  PayrollRun,
  PayrollRunItem,
  PayrollTransactionInput,
  PayrollTxType,
  SalaryType,
} from './types';
import {
  persistPayrollTransaction,
  resolvePayrollPayment,
  type PayrollPaymentResolution,
} from './payrollTransactions';

export function getPayrollSourceRows(db: DatabaseManager, period: string, branchId: string) {
  const [year, month] = period.split('-').map(Number);
  const periodStart = `${period}-01`;
  const periodEnd = localDateString(new Date(year, month, 0));
  const employees = db.query<any>(
    `SELECT e.id, e.name, e.branch_id AS branchId, e.salary_type AS salaryType,
            e.salary_payment_method AS salaryPaymentMethod, e.bank_name AS bankName,
            e.bank_account_number AS bankAccountNumber, e.wallet_provider AS walletProvider,
            e.wallet_number AS walletNumber,
            COALESCE(e.company_id, b.company_id) AS companyId,
            COALESCE((
              SELECT sh.next_salary FROM employee_salary_history sh
              WHERE sh.employee_id = e.id AND sh.effective_date <= ?
              ORDER BY sh.effective_date DESC, sh.created_at DESC LIMIT 1
            ), (
              SELECT sh.previous_salary FROM employee_salary_history sh
              WHERE sh.employee_id = e.id AND sh.effective_date > ?
              ORDER BY sh.effective_date, sh.created_at LIMIT 1
            ), e.base_salary / 100.0) AS baseSalary,
            e.joined_date AS joinedDate,
            e.terminated_at AS terminatedAt,
            c.salary / 100.0 AS contractSalary, c.start_date AS contractStartDate, c.end_date AS contractEndDate,
            c.salary_components_json AS salaryComponentsJson,
            CASE WHEN EXISTS (
              SELECT 1 FROM employee_contracts hx
              WHERE hx.employee_id = e.id AND hx.status IN ('ACTIVE', 'TERMINATED')
                AND hx.start_date <= ?
            ) THEN 1 ELSE 0 END AS hasContractHistory,
            COALESCE(co.working_days_per_month, 26) AS workingDays,
            COALESCE(co.overtime_multiplier, 1.5) AS overtimeMultiplier,
            COALESCE(co.payroll_tax_rate, 0) AS taxRate
     FROM employees e
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN companies co ON co.id = b.company_id
     LEFT JOIN employee_contracts c ON c.id = (
       SELECT ec.id FROM employee_contracts ec
       WHERE ec.employee_id = e.id AND ec.status IN ('ACTIVE', 'TERMINATED')
         AND ec.start_date <= ? AND (ec.end_date IS NULL OR ec.end_date >= ?)
       ORDER BY ec.start_date DESC LIMIT 1
     )
     WHERE e.branch_id = ? AND e.joined_date <= ?
       AND (e.terminated_at IS NULL OR e.terminated_at >= ?)
      AND (e.status NOT IN ('SUSPENDED', 'RESIGNED', 'TERMINATED') OR e.terminated_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM employee_final_settlements fs
        WHERE fs.employee_id = e.id AND substr(fs.termination_date, 1, 7) = ?
      )
     ORDER BY e.name, e.id`,
    [periodEnd, periodEnd, periodEnd, periodEnd, periodStart, branchId, periodEnd, periodStart, period]
  );
  const attendanceRows = AttendanceTimeService.getUnifiedRows(branchId, periodStart, periodEnd);
  const shiftRows = db.query<any>(
    `SELECT a.employee_id AS employeeId, a.effective_from AS effectiveFrom,
            a.effective_to AS effectiveTo, s.workdays_json AS workdaysJson,
            s.name AS shiftName, s.start_time AS startTime, s.end_time AS endTime,
            s.break_minutes AS breakMinutes, s.grace_minutes AS graceMinutes,
            s.overtime_after_minutes AS overtimeAfterMinutes
     FROM employee_shift_assignments a
     JOIN attendance_shifts s ON s.id = a.shift_id AND s.is_active = 1
     JOIN employees e ON e.id = a.employee_id
     WHERE e.branch_id = ? AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
     ORDER BY a.employee_id, a.effective_from`,
    [branchId, periodEnd, periodStart]
  );
  const holidayRows = db.query<{ date: string }>(
    'SELECT date FROM attendance_holidays WHERE branch_id = ? AND date BETWEEN ? AND ? ORDER BY date',
    [branchId, periodStart, periodEnd]
  );
  const leaveRows = db.query<any>(
    `SELECT l.employee_id AS employeeId, l.start_date AS startDate, l.end_date AS endDate
     FROM employee_leave_requests l
     WHERE l.branch_id = ? AND l.status = 'APPROVED' AND l.leave_type = 'UNPAID'
       AND l.start_date <= ? AND l.end_date >= ?
     ORDER BY l.employee_id, l.start_date, l.end_date`,
    [branchId, periodEnd, periodStart]
  );
  const transactionRows = db.query<any>(
    `SELECT employee_id AS employeeId, type, SUM(amount) / 100.0 AS amount
     FROM payroll_transactions
     WHERE branch_id = ? AND date BETWEEN ? AND ?
     GROUP BY employee_id, type
     ORDER BY employee_id, type`,
    [branchId, periodStart, periodEnd]
  );
  const commissionRows = db.query<any>(
    `SELECT id, employee_id AS employeeId, commission_amount / 100.0 AS amount, status
     FROM commissions
     WHERE branch_id = ? AND period_month = ? AND status IN ('APPROVED', 'PENDING')
     ORDER BY employee_id, id`,
    [branchId, period]
  );
  return {
    periodStart,
    periodEnd,
    calendarDays: daysBetweenInclusive(periodStart, periodEnd),
    employees,
    attendanceRows,
    shiftRows,
    holidayRows,
    leaveRows,
    transactionRows,
    commissionRows,
  };
}

export type PayrollSourceRows = ReturnType<typeof getPayrollSourceRows>;

export type CalculatedPayrollItem = { item: PayrollRunItem; warnings: string[] };

/** Per-employee payroll computation for a draft run (pure DB reads + math). */
export function computePayrollRunItems(
  db: DatabaseManager,
  sourceRows: PayrollSourceRows,
  branchId: string
): CalculatedPayrollItem[] {
  const {
    periodStart, periodEnd, calendarDays, employees, attendanceRows, shiftRows, holidayRows,
    leaveRows, transactionRows, commissionRows,
  } = sourceRows;
  const rowsByEmployee = <T extends { employeeId: string }>(rows: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) grouped.set(row.employeeId, [...(grouped.get(row.employeeId) ?? []), row]);
    return grouped;
  };
  const attendanceByEmployee = rowsByEmployee(attendanceRows);
  const leavesByEmployee = rowsByEmployee(leaveRows);
  const transactionsByEmployee = rowsByEmployee(transactionRows);
  const commissionsByEmployee = rowsByEmployee(commissionRows);
  const calculated: CalculatedPayrollItem[] = [];

  for (const employee of employees) {
    const warnings: string[] = [];
    const workingDays = Number(employee.workingDays) > 0 ? Number(employee.workingDays) : 26;
    if (employee.hasContractHistory && !employee.contractStartDate) continue;
    const employeeShifts = shiftRows.filter((row) => row.employeeId === employee.id);
    const holidayDates = new Set(holidayRows.map((row) => row.date));
    const overtimeMultiplier = Number(employee.overtimeMultiplier) > 0 ? Number(employee.overtimeMultiplier) : 1.5;
    const taxRate = Math.max(0, Number(employee.taxRate) || 0);
    const contractStart = employee.contractStartDate && employee.contractStartDate > employee.joinedDate
      ? employee.contractStartDate
      : employee.joinedDate;
    const eligibleStart = contractStart > periodStart ? contractStart : periodStart;
    const employeeEnd = [employee.terminatedAt, employee.contractEndDate].filter(Boolean).sort()[0] as string | undefined;
    const eligibleEnd = employeeEnd && employeeEnd < periodEnd ? employeeEnd : periodEnd;
    const employedDays = daysBetweenInclusive(eligibleStart, eligibleEnd);
    if (!employedDays) continue;

    const salary = Math.max(0, Number(employee.contractSalary ?? employee.baseSalary) || 0);
    let salaryComponents: Array<{ name: string; amount: number }> = [];
    try {
      const parsed = JSON.parse(employee.salaryComponentsJson || '[]') as unknown;
      if (!Array.isArray(parsed) || parsed.some((component) =>
        !component || typeof component.name !== 'string' || !component.name.trim()
        || typeof component.amount !== 'number' || !Number.isFinite(component.amount) || component.amount < 0
      )) throw new Error('Invalid salary components');
      salaryComponents = parsed;
    } catch {
      throw new Error(`مكونات الراتب في عقد الموظف ${employee.name} غير صالحة؛ تعذر احتساب دورة الرواتب.`);
    }
    const fixedComponentTotal = salaryComponents.reduce((sum, component) =>
      sum + (Number.isFinite(Number(component.amount)) ? Math.max(0, Number(component.amount)) : 0), 0);
    const salaryType: SalaryType = employee.salaryType === 'DAILY' ? 'DAILY' : 'MONTHLY';
    const fullMonthWorkdays = countScheduledWorkdays(
      periodStart, periodEnd, employeeShifts, holidayDates, workingDays, calendarDays
    );
    const expectedWorkdaysExact = countScheduledWorkdays(
      eligibleStart, eligibleEnd, employeeShifts, holidayDates, workingDays, calendarDays
    );
    const expectedWorkdays = roundMoney(expectedWorkdaysExact);
    const dailyRate = salaryType === 'DAILY'
      ? salary + fixedComponentTotal
      : (salary + fixedComponentTotal) / Math.max(1, fullMonthWorkdays);
    const baseAmount = salaryType === 'DAILY'
      ? roundMoney(dailyRate * expectedWorkdaysExact)
      : roundMoney((salary + fixedComponentTotal) * employedDays / calendarDays);
    const attendance = attendanceByEmployee.get(employee.id) ?? [];
    const leaves = leavesByEmployee.get(employee.id) ?? [];
    const inUnpaidLeave = (date: string) => leaves.some((leave) =>
      date >= leave.startDate && date <= leave.endDate && date >= eligibleStart && date <= eligibleEnd
    );
    const absentDays = attendance.filter((row) =>
      row.status === 'ABSENT' && row.date >= eligibleStart && row.date <= eligibleEnd
        && isEmployeeScheduledOn(row.date, employeeShifts, holidayDates) && !inUnpaidLeave(row.date)
    ).length;
    const unpaidLeaveCalendarDays = leaves.reduce((total, leave) => {
      const start = leave.startDate > eligibleStart ? leave.startDate : eligibleStart;
      const end = leave.endDate < eligibleEnd ? leave.endDate : eligibleEnd;
      return total + countLeaveDays(start, end, employeeShifts, holidayDates);
    }, 0);
    const unpaidLeaveDays = Math.min(expectedWorkdaysExact, roundMoney(unpaidLeaveCalendarDays));
    const lateMinutes = attendance.reduce((sum, row) =>
      row.date >= eligibleStart && row.date <= eligibleEnd && ['PRESENT', 'LATE'].includes(row.status)
        && isEmployeeScheduledOn(row.date, employeeShifts, holidayDates)
        ? sum + Math.max(0, Number(row.lateMinutes) || 0) : sum, 0);
    const overtimeMinutes = attendance.reduce((sum, row) =>
      row.date >= eligibleStart && row.date <= eligibleEnd && ['PRESENT', 'LATE'].includes(row.status)
        ? sum + Math.max(0, Number(row.approvedOvertimeMinutes) || 0) : sum, 0);
    const hourlyRate = dailyRate / WORKING_HOURS_PER_DAY;
    const overtimeAmount = roundMoney(hourlyRate * (overtimeMinutes / 60) * overtimeMultiplier);
    const attendanceDeductionAmount = roundMoney(
      dailyRate * Math.min(expectedWorkdaysExact, absentDays + unpaidLeaveDays)
        + hourlyRate * lateMinutes / 60
    );
    const transactions = transactionsByEmployee.get(employee.id) ?? [];
    const amountFor = (type: PayrollTxType) => Number(transactions.find((row) => row.type === type)?.amount) || 0;
    const bonusAmount = roundMoney(amountFor('BONUS'));
    const advanceAmount = roundMoney(amountFor('ADVANCE'));
    const manualDeductionAmount = roundMoney(amountFor('DEDUCTION'));
    const previousPayoutAmount = roundMoney(amountFor('SALARY_PAYOUT'));
    const commissions = commissionsByEmployee.get(employee.id) ?? [];
    const approvedCommissions = commissions.filter((row) => row.status === 'APPROVED');
    const commissionAmount = roundMoney(approvedCommissions.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const allowanceAmount = roundMoney(Number(db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount FROM hr_allowances
       WHERE employee_id = ? AND is_active = 1 AND frequency = 'MONTHLY'
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
      [employee.id, periodEnd, periodStart]
    )[0]?.amount) || 0);
    const dueLoanInstallments = db.query<{ id: string; amount: number }>(
      `SELECT i.id, i.amount / 100.0 AS amount FROM hr_loan_installments i
       JOIN hr_loans l ON l.id = i.loan_id
       WHERE l.employee_id = ? AND l.status = 'ACTIVE' AND i.status = 'PENDING' AND i.due_date <= ?`,
      [employee.id, periodEnd]
    );
    const loanDeductionAmount = roundMoney(dueLoanInstallments.reduce(
      (sum, row) => sum + (Number(row.amount) || 0), 0
    ));
    const grossAmount = roundMoney(baseAmount + overtimeAmount + bonusAmount + commissionAmount + allowanceAmount);
    const tax = PayrollTaxService.calculate({
      employeeId: employee.id,
      companyId: employee.companyId || null,
      date: periodEnd,
      grossAmount,
      baseAmount,
      legacyRate: Number(taxRate) || 0,
    });
    const taxAmount = tax.taxAmount;

    // Social insurance calculation (Egyptian tamkeen)
    const socialInsurance = PayrollSocialInsuranceService.calculateSocialInsurance(
      employee.companyId || 'cmp_main',
      periodEnd,
      grossAmount
    );
    const socialInsuranceBase = socialInsurance.contributionBase;
    const socialInsuranceEmployeeShare = socialInsurance.employeeShareAmount;
    const socialInsuranceEmployerShare = socialInsurance.employerShareAmount;
    const socialInsuranceTotal = socialInsurance.totalAmount;

    const netAmount = roundMoney(
      grossAmount - attendanceDeductionAmount - manualDeductionAmount - advanceAmount - previousPayoutAmount - taxAmount - loanDeductionAmount - socialInsuranceEmployeeShare
    );

    if (!employee.contractSalary && !employee.hasContractHistory && salaryType !== 'DAILY') warnings.push('لا يوجد عقد نشط يغطي الفترة؛ استُخدم الراتب الأساسي المسجل.');
    if (salaryComponents.length) warnings.push('يتضمن الراتب الأساسي المحسوب مكونات ثابتة من العقد.');
    if (!employeeShifts.length) warnings.push('لم تُعيّن وردية للموظف؛ استُخدم متوسط أيام الشركة ولم يُتحقق من أيام الأسبوع والعطلات.');
    if (attendance.length < Math.floor(expectedWorkdays)) warnings.push('سجلات الحضور أقل من أيام العمل المتوقعة؛ لم يُحتسب اليوم غير المسجل غيابًا.');
    if (tax.source === 'LEGACY_FLAT' && Number(taxRate) > 0) warnings.push('الضريبة محسوبة بالنسبة الثابتة للشركة؛ أنشئ قاعدة ضريبية لتفعيل الشرائح والمعفيات.');
    if (tax.source === 'LEGACY_FLAT' && Number(taxRate) <= 0 && !tax.ruleId) warnings.push('لا توجد قاعدة ضريبة سارية؛ لم تُحتسب ضريبة.');
    if (commissions.some((row) => row.status === 'PENDING')) warnings.push('توجد عمولات معلقة لم تدخل في صافي الراتب.');
    if (allowanceAmount > 0) warnings.push(`أُضيفت بدلات شهرية بقيمة ${allowanceAmount} إلى إجمالي الراتب.`);
    if (loanDeductionAmount > 0) warnings.push(`خُصمت أقساط قروض بقيمة ${loanDeductionAmount} من صافي الراتب.`);
    if (previousPayoutAmount > 0) warnings.push('توجد دفعات راتب سابقة في الفترة وخُصمت من الصافي.');
    if (netAmount < 0) warnings.push('صافي الراتب سالب؛ يجب تسوية السلف أو الخصومات قبل الاعتماد.');

    calculated.push({
      warnings,
      item: {
        id: `prit_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        employeeId: employee.id,
        branchId,
        employeeName: employee.name,
        salaryType,
        baseSalary: salary,
        expectedWorkdays,
        absentDays,
        unpaidLeaveDays,
        lateMinutes,
        overtimeMinutes,
        baseAmount,
        overtimeAmount,
        bonusAmount,
        commissionAmount,
        allowanceAmount,
        loanDeductionAmount,
        advanceAmount,
        manualDeductionAmount,
        attendanceDeductionAmount,
        taxAmount,
        socialInsuranceBase,
        socialInsuranceEmployeeShare,
        socialInsuranceEmployerShare,
        socialInsuranceTotal,
        grossAmount,
        netAmount,
        warnings,
        paymentMethod: (employee.salaryPaymentMethod === 'BANK_TRANSFER' || employee.salaryPaymentMethod === 'WALLET')
          ? employee.salaryPaymentMethod
          : 'CASH',
        paymentReference: null,
        paymentProof: null,
        paidAmount: 0,
        payoutStatus: 'PENDING',
        details: {
          workingDaysPerMonth: workingDays,
          workingHoursPerDay: WORKING_HOURS_PER_DAY,
          overtimeMultiplier,
          taxRate,
          salaryComponents,
          salaryComponentTotal: fixedComponentTotal,
          previousPayoutAmount,
          commissionIds: approvedCommissions.map((row) => row.id),
          loanInstallmentIds: dueLoanInstallments.map((row) => row.id),
          salaryPaymentMethod: employee.salaryPaymentMethod || 'CASH',
          bankName: employee.bankName || null,
          bankAccountNumber: employee.bankAccountNumber || null,
          walletProvider: employee.walletProvider || null,
          walletNumber: employee.walletNumber || null,
          taxRuleId: tax.ruleId,
          taxRuleName: tax.ruleName,
          taxSource: tax.source,
          taxBasis: tax.taxableBasis,
          taxableAmount: tax.taxableAmount,
          taxExemptionAmount: tax.exemptionAmount,
          taxDependentAllowance: tax.dependentAllowanceAmount,
          taxDependents: tax.dependents,
          taxBreakdown: tax.lines,
          socialInsuranceRuleId: socialInsurance.ruleId,
          socialInsuranceRuleName: socialInsurance.ruleName,
          socialInsuranceCeilingApplied: socialInsurance.ceilingApplied,
        },
        payoutTransactionId: null,
      },
    });
  }

  return calculated;
}

export interface SavePayrollRunDraftArgs {
  existingRunId: string;
  isRecalculation: boolean;
  period: string;
  branchId: string;
  sourceFingerprint: string;
  actor: EmployeeServiceActor;
  calculated: CalculatedPayrollItem[];
}

/** Transaction body that persists a freshly calculated (or recalculated) DRAFT run. */
export function savePayrollRunDraft(db: DatabaseManager, args: SavePayrollRunDraftArgs): void {
  const { existingRunId, isRecalculation, period, branchId, sourceFingerprint, actor, calculated } = args;
  if (isRecalculation) {
    db.run('DELETE FROM payroll_run_items WHERE payroll_run_id = ?', [existingRunId]);
    db.run(
      'UPDATE payroll_runs SET created_by = ?, created_at = ?, source_fingerprint = ? WHERE id = ?',
      [actor.id, new Date().toISOString(), sourceFingerprint, existingRunId]
    );
  } else {
    db.run(
      `INSERT INTO payroll_runs (id, period, branch_id, status, source_fingerprint, created_by, created_at)
       VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [existingRunId, period, branchId, sourceFingerprint, actor.id, new Date().toISOString()]
    );
  }
  for (const { item } of calculated) {
    db.run(
      `INSERT INTO payroll_run_items (
         id, payroll_run_id, employee_id, branch_id, employee_name, salary_type, base_salary,
         expected_workdays, absent_days, unpaid_leave_days, late_minutes, overtime_minutes,
         base_amount, overtime_amount, bonus_amount, commission_amount, allowance_amount,
         loan_deduction_amount, advance_amount,
         manual_deduction_amount, attendance_deduction_amount, tax_amount,
         social_insurance_base, social_insurance_employee_share, social_insurance_employer_share, social_insurance_total,
         gross_amount, net_amount, warning_json, detail_json, payment_method, payout_status
       ) VALUES (?, ?, ?, ?, ?, ?, ROUND(?*100), ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ?, ?, ?, ?)`,
      [
        item.id, existingRunId, item.employeeId, item.branchId, item.employeeName, item.salaryType,
        item.baseSalary, item.expectedWorkdays, item.absentDays, item.unpaidLeaveDays, item.lateMinutes,
        item.overtimeMinutes, item.baseAmount, item.overtimeAmount, item.bonusAmount, item.commissionAmount,
        item.allowanceAmount, item.loanDeductionAmount, item.advanceAmount,
        item.manualDeductionAmount, item.attendanceDeductionAmount, item.taxAmount,
        item.socialInsuranceBase, item.socialInsuranceEmployeeShare, item.socialInsuranceEmployerShare, item.socialInsuranceTotal,
        item.grossAmount, item.netAmount, JSON.stringify(item.warnings), JSON.stringify(item.details),
        item.paymentMethod, item.payoutStatus,
      ]
    );
  }
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, 'Calculate payroll run', 'HR', ?, ?)`,
    [
      `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, existingRunId,
      JSON.stringify({ period, branchId, employeeCount: calculated.length }),
    ]
  );
}

/** Transaction body that posts all ledger entries and marks a DRAFT run APPROVED. */
export function approvePayrollRunInTransaction(db: DatabaseManager, run: PayrollRun, actor: EmployeeServiceActor, id: string, now: string): void {
  for (const item of run.items) {
    const referenceId = `${item.employeeId}:${run.period}`;
    const legacyAccrual = db.query<{ id: string }>(
      `SELECT id FROM journal_entries
       WHERE reference_type = 'PAYROLL_SALARY_ACCRUAL' AND reference_id = ?`,
      [referenceId]
    )[0];
    const wages = roundMoney(item.baseAmount + item.overtimeAmount + item.allowanceAmount);
    const legacyAmount = legacyAccrual
      ? Number(db.query<{ amount: number }>(
        `SELECT COALESCE(SUM(l.credit - l.debit), 0) / 100.0 AS amount
         FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE l.entry_id = ? AND a.code = '2104'`,
        [legacyAccrual.id]
      )[0]?.amount || 0)
      : 0;
    const wageAdjustment = roundMoney(wages - legacyAmount);
    if (Math.abs(wageAdjustment) > 0.009) {
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Payroll run wage adjustment for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_ACCRUAL',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: wageAdjustment > 0
          ? [
            { accountCode: '5202', debit: wageAdjustment, credit: 0 },
            { accountCode: '2104', debit: 0, credit: wageAdjustment },
          ]
          : [
            { accountCode: '2104', debit: Math.abs(wageAdjustment), credit: 0 },
            { accountCode: '5202', debit: 0, credit: Math.abs(wageAdjustment) },
          ],
      });
    }
    if (item.attendanceDeductionAmount > 0) {
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Payroll attendance deductions for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_ATTENDANCE_DEDUCTION',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: [
          { accountCode: '2104', debit: item.attendanceDeductionAmount, credit: 0 },
          { accountCode: '5202', debit: 0, credit: item.attendanceDeductionAmount },
        ],
      });
    }
    if (item.taxAmount > 0) {
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Payroll tax withholding for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_TAX',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: [
          { accountCode: '2104', debit: item.taxAmount, credit: 0 },
          { accountCode: '2106', debit: 0, credit: item.taxAmount },
        ],
      });
    }
    if (item.socialInsuranceTotal > 0) {
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Social insurance contributions for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_SOCIAL_INSURANCE',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: [
          { accountCode: '2104', debit: item.socialInsuranceEmployeeShare, credit: 0 },
          { accountCode: '5203', debit: item.socialInsuranceEmployerShare, credit: 0 },
          { accountCode: '2107', debit: 0, credit: item.socialInsuranceTotal },
        ],
      });
    }
    const commissionIds = item.details.commissionIds;
    if (commissionIds.length) {
      const stillApproved = db.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM commissions
         WHERE employee_id = ? AND period_month = ? AND status = 'APPROVED'
           AND id IN (${commissionIds.map(() => '?').join(', ')})`,
        [item.employeeId, run.period, ...commissionIds]
      )[0]?.count ?? 0;
      if (Number(stillApproved) !== commissionIds.length) {
        throw new Error(`تغيرت حالة عمولات الموظف ${item.employeeName} بعد احتساب الدورة؛ أعد الاحتساب.`);
      }
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Move approved commissions to payroll payable for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_COMMISSION',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: [
          { accountCode: '2103', debit: item.commissionAmount, credit: 0 },
          { accountCode: '2104', debit: 0, credit: item.commissionAmount },
        ],
      });
    }
    if (item.allowanceAmount > 0) {
      const currentAllowances = roundMoney(Number(db.query<{ amount: number }>(
        `SELECT COALESCE(SUM(amount), 0) / 100.0 AS amount FROM hr_allowances
         WHERE employee_id = ? AND is_active = 1 AND frequency = 'MONTHLY'
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
        [item.employeeId, `${run.period}-31`, `${run.period}-01`]
      )[0]?.amount) || 0);
      if (Math.abs(currentAllowances - item.allowanceAmount) > 0.009) {
        throw new Error(`تغيرت بدلات الموظف ${item.employeeName} بعد احتساب الدورة؛ أعد الاحتساب.`);
      }
    }
    const loanInstallmentIds = item.details.loanInstallmentIds ?? [];
    if (loanInstallmentIds.length) {
      const stillPending = db.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM hr_loan_installments
         WHERE id IN (${loanInstallmentIds.map(() => '?').join(', ')}) AND status = 'PENDING'`,
        loanInstallmentIds
      )[0]?.count ?? 0;
      if (Number(stillPending) !== loanInstallmentIds.length) {
        throw new Error(`تغيرت حالة أقساط قروض الموظف ${item.employeeName} بعد احتساب الدورة؛ أعد الاحتساب.`);
      }
      postLedgerEntry(db.getDatabase(), {
        date: `${run.period}-01`,
        description: `Payroll loan installment deduction for ${item.employeeName} (${run.period})`,
        referenceType: 'PAYROLL_RUN_LOAN_DEDUCTION',
        referenceId,
        createdBy: actor.id,
        branchId: item.branchId,
        lines: [
          { accountCode: '2104', debit: item.loanDeductionAmount, credit: 0 },
          { accountCode: '1202', debit: 0, credit: item.loanDeductionAmount },
        ],
      });
    }
  }
  db.run(
    `UPDATE payroll_runs SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ? AND status = 'DRAFT'`,
    [actor.id, now, id]
  );
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, 'Approve payroll run', 'HR', ?, ?)`,
    [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ period: run.period })]
  );
}

export interface PayrollPayoutResolution {
  item: PayrollRunItem;
  data: PayrollTransactionInput;
  payment: PayrollPaymentResolution;
}

/**
 * Resolves every payout destination before writing anything so a missing bank
 * account or wallet never leaves a half-paid payroll run.
 */
export function buildPayrollPayoutPlan(
  db: DatabaseManager,
  branchAccess: BranchAccessService,
  run: PayrollRun,
  options: PayrollPayOptions,
  actor: EmployeeServiceActor,
  today: string,
  batchReference: string
): PayrollPayoutResolution[] {
  return run.items.filter((item) => item.netAmount > 0).map((item) => {
    const instruction = options.payments?.[item.employeeId] ?? {};
    const method = instruction.method || item.paymentMethod || 'CASH';
    const registerId = method === 'CASH'
      ? (instruction.registerId
        || options.defaultRegisterId
        || branchAccess.getDefaultRegisterId(item.branchId, actor))
      : null;
    const bankAccountId = method === 'BANK_TRANSFER'
      ? (instruction.bankAccountId || options.defaultBankAccountId || null)
      : null;
    const data: PayrollTransactionInput = {
      employeeId: item.employeeId,
      type: 'SALARY_PAYOUT',
      amount: item.netAmount,
      date: today,
      notes: `صرف دورة الرواتب ${run.period} - ${batchReference}`,
      paymentMethod: method,
      registerId: registerId || undefined,
      bankAccountId: bankAccountId || undefined,
      walletProvider: instruction.walletProvider,
      walletNumber: instruction.walletNumber,
      referenceNumber: instruction.referenceNumber || batchReference,
      proofReference: instruction.proofReference,
    };
    const payment = resolvePayrollPayment(
      db, branchAccess, data, item.branchId, actor, registerId
    );
    return { item, data, payment };
  });
}

export function resolvePayrollBatchReference(run: PayrollRun, options: PayrollPayOptions): string {
  return options.batchReference?.trim()
    || `PAY-${run.period}-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Transaction body that pays every resolved item and marks the run PAID. */
export function persistPayrollPayouts(
  db: DatabaseManager,
  branchAccess: BranchAccessService,
  resolved: PayrollPayoutResolution[],
  run: PayrollRun,
  actor: EmployeeServiceActor,
  batchReference: string,
  id: string,
  today: string,
  getEmployeeName: (employeeId: string) => string | undefined
): void {
  const paidTotal = resolved.reduce((sum, row) => sum + row.item.netAmount, 0);
  for (const row of resolved) {
    const { item, data, payment } = row;
    const txId = `ptx_${uuidv4().substring(0, 8)}`;
    persistPayrollTransaction(db, branchAccess, data, item.netAmount, txId, payment.registerId, item.branchId,
      actor, run.period, getEmployeeName);
    db.run(
      `UPDATE payroll_run_items SET payout_transaction_id = ?, payment_method = ?,
         bank_account_id = ?, wallet_provider = ?, wallet_number = ?, payment_reference = ?,
         payment_proof = ?, paid_amount = ROUND(?*100), payout_status = 'PAID'
       WHERE id = ?`,
      [txId, payment.method, payment.bankAccountId, payment.walletProvider, payment.walletNumber,
        payment.referenceNumber, payment.proofReference, item.netAmount, item.id]
    );
    if (item.details.commissionIds.length) {
      db.run(
        `UPDATE commissions SET status = 'PAID', paid_at = ?
         WHERE status = 'APPROVED' AND id IN (${item.details.commissionIds.map(() => '?').join(', ')})`,
        [today, ...item.details.commissionIds]
      );
    }
    const paidLoanInstallmentIds = item.details.loanInstallmentIds ?? [];
    if (paidLoanInstallmentIds.length) {
      db.run(
        `UPDATE hr_loan_installments SET status = 'PAID', payroll_transaction_id = ?
         WHERE id IN (${paidLoanInstallmentIds.map(() => '?').join(', ')}) AND status = 'PENDING'`,
        [txId, ...paidLoanInstallmentIds]
      );
      const paidLoans = db.query<{ loanId: string }>(
        `SELECT DISTINCT loan_id AS loanId FROM hr_loan_installments
         WHERE id IN (${paidLoanInstallmentIds.map(() => '?').join(', ')})`,
        paidLoanInstallmentIds
      );
      for (const loan of paidLoans) {
        const remaining = Number(db.query<{ remaining: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS remaining FROM hr_loan_installments
           WHERE loan_id = ? AND status = 'PENDING'`,
          [loan.loanId]
        )[0]?.remaining) || 0;
        db.run(
          `UPDATE hr_loans SET remaining_balance = ?,
             status = CASE WHEN ? <= 0.009 THEN 'COMPLETED' ELSE status END
           WHERE id = ?`,
          [remaining, remaining, loan.loanId]
        );
      }
    }
  }
  db.run(
    `UPDATE payroll_runs SET status = 'PAID', paid_by = ?, paid_at = ?,
       payment_batch_reference = ?, paid_total = ROUND(?*100)
     WHERE id = ? AND status = 'APPROVED'`,
    [actor.id, new Date().toISOString(), batchReference, paidTotal, id]
  );
  db.run(
    `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
     VALUES (?, ?, ?, 'Pay payroll run', 'HR', ?, ?)`,
    [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
      JSON.stringify({
        period: run.period, batchReference, paidTotal,
        methods: resolved.reduce((counts, row) => {
          counts[row.payment.method] = (counts[row.payment.method] || 0) + 1;
          return counts;
        }, {} as Record<string, number>),
      })]
  );
}
