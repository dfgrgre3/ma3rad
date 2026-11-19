import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { EmployeeDepartmentAccessService } from '../../auth/EmployeeDepartmentAccessService';
import type {
  EmployeeServiceActor,
  PayrollPaymentMethod,
  PayrollRunStatus,
  PayrollTransactionInput,
  PayrollTxType,
  SalaryType,
} from './types';

export interface PayrollQueryServices {
  branchAccess: BranchAccessService;
  departmentAccess: EmployeeDepartmentAccessService;
}

export function buildTransactionsQuery(
  employeeId: string | undefined,
  actor: EmployeeServiceActor,
  services: PayrollQueryServices
): { sql: string; params: any[] } {
  const { branchAccess, departmentAccess } = services;
  const scope = branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
  const departmentScope = departmentAccess.sqlScope('e.department_id', actor);
  if (employeeId) {
    return {
      sql: `SELECT pt.*, e.name AS employee_name
       FROM payroll_transactions pt
       LEFT JOIN employees e ON e.id = pt.employee_id
       WHERE pt.employee_id = ? AND ${scope.clause} AND ${departmentScope.clause}
       ORDER BY pt.date DESC, pt.created_at DESC`,
      params: [employeeId, ...scope.params, ...departmentScope.params],
    };
  }
  return {
    sql: `SELECT pt.*, e.name AS employee_name
     FROM payroll_transactions pt
     LEFT JOIN employees e ON e.id = pt.employee_id
     WHERE ${scope.clause} AND ${departmentScope.clause}
     ORDER BY pt.date DESC, pt.created_at DESC`,
    params: [...scope.params, ...departmentScope.params],
  };
}

export function ensureSalaryAccrual(
  db: DatabaseManager,
  employeeId: string,
  date: string,
  createdBy: string
): void {
  const period = date.slice(0, 7);
  const referenceId = `${employeeId}:${period}`;
  const accrued = db.query(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_SALARY_ACCRUAL' AND reference_id=?`, [referenceId])[0];
  if (accrued) return;
  const runAccrual = db.query(
    `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_RUN_ACCRUAL' AND reference_id=?`,
    [referenceId]
  )[0];
  if (runAccrual) return;

  const employee = db.query<{ name: string; baseSalary: number; salaryType: SalaryType }>(
    'SELECT name,base_salary / 100.0 AS baseSalary,salary_type AS salaryType FROM employees WHERE id=?',
    [employeeId]
  )[0];
  const salary = Math.round((Number(employee?.baseSalary || 0) * (employee?.salaryType === 'DAILY' ? 26 : 1)) * 100) / 100;
  if (salary <= 0) return;

  postLedgerEntry(db.getDatabase(), {
    date: `${period}-01`,
    description: `Salary accrual for ${employee?.name || employeeId} (${period})`,
    referenceType: 'PAYROLL_SALARY_ACCRUAL',
    referenceId,
    createdBy,
    lines: [{ accountCode: '5202', debit: salary, credit: 0 }, { accountCode: '2104', debit: 0, credit: salary }],
  });
}

export function applyAdvancesToSalary(
  db: DatabaseManager,
  employeeId: string,
  date: string,
  createdBy: string
): void {
  const period = date.slice(0, 7);
  const referenceId = `${employeeId}:${period}`;
  const applied = db.query(
    `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_ADVANCE_APPLICATION' AND reference_id=?`,
    [referenceId]
  )[0];
  if (applied) return;

  const advances = Number(db.query<{ amount: number }>(
    `SELECT COALESCE(SUM(amount),0) / 100.0 AS amount FROM payroll_transactions WHERE employee_id=? AND type='ADVANCE' AND substr(date,1,7)=?`,
    [employeeId, period]
  )[0]?.amount || 0);
  if (advances <= 0) return;

  postLedgerEntry(db.getDatabase(), {
    date,
    description: `Apply employee advances to salary (${period})`,
    referenceType: 'PAYROLL_ADVANCE_APPLICATION',
    referenceId,
    createdBy,
    lines: [{ accountCode: '2104', debit: advances, credit: 0 }, { accountCode: '1202', debit: 0, credit: advances }],
  });
}

export function getPayrollPayable(db: DatabaseManager, employeeId: string, date: string): number {
  const period = date.slice(0, 7);
  return Number(db.query<{ amount: number }>(`
    SELECT COALESCE(SUM(l.credit-l.debit),0) / 100.0 AS amount
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id=l.entry_id AND e.is_posted=1
    JOIN chart_of_accounts a ON a.id=l.account_id
    WHERE a.code='2104' AND (
      (e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION') AND e.reference_id=?)
      OR (e.reference_type IN ('PAYROLL_RUN_ACCRUAL','PAYROLL_RUN_ATTENDANCE_DEDUCTION','PAYROLL_RUN_TAX','PAYROLL_RUN_COMMISSION','PAYROLL_RUN_LOAN_DEDUCTION') AND e.reference_id=?)
      OR (e.reference_type='PAYROLL_TRANSACTION' AND e.reference_id IN (
        SELECT id FROM payroll_transactions
        WHERE employee_id=? AND substr(date,1,7)=? AND type IN ('BONUS','DEDUCTION','SALARY_PAYOUT')
      ))
    )
  `, [`${employeeId}:${period}`, `${employeeId}:${period}`, employeeId, period])[0]?.amount || 0);
}

export function getPayrollPostingLines(
  type: PayrollTxType,
  amount: number,
  payable: number,
  paymentAccountCode = '1101'
) {
  switch (type) {
    case 'ADVANCE':
      return [{ accountCode: '1202', debit: amount, credit: 0 }, { accountCode: paymentAccountCode, debit: 0, credit: amount }];
    case 'BONUS':
      return [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2104', debit: 0, credit: amount }];
    case 'DEDUCTION':
      return [{ accountCode: '2104', debit: amount, credit: 0 }, { accountCode: '5202', debit: 0, credit: amount }];
    case 'SALARY_PAYOUT':
      return [
        { accountCode: '2104', debit: Math.min(amount, Math.max(0, payable)), credit: 0 },
        { accountCode: paymentAccountCode, debit: 0, credit: amount },
      ];
  }
}

export function resolveBankAccount(
  db: DatabaseManager,
  bankAccountId: string,
  branchId: string
): { id: string; accountNumber: string; bankName: string; glAccountCode: string } {
  const row = db.query<any>(
    `SELECT ba.id, ba.account_number AS accountNumber, ba.bank_name AS bankName,
            ba.branch_id AS branchId, coa.code AS glAccountCode
     FROM bank_accounts ba
     JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
     WHERE ba.id = ? AND ba.is_active = 1`,
    [bankAccountId]
  )[0];
  if (!row) throw new Error('الحساب البنكي المحدد غير موجود أو غير نشط.');
  if (row.branchId && row.branchId !== branchId) {
    throw new Error('الحساب البنكي المحدد لا يتبع فرع دورة الرواتب.');
  }
  return row;
}

export interface PayrollPaymentResolution {
  method: PayrollPaymentMethod;
  registerId: string | null;
  bankAccountId: string | null;
  walletProvider: string | null;
  walletNumber: string | null;
  referenceNumber: string | null;
  proofReference: string | null;
  creditAccountCode: string;
}

export function resolvePayrollPayment(
  db: DatabaseManager,
  branchAccess: BranchAccessService,
  data: PayrollTransactionInput,
  branchId: string,
  actor: EmployeeServiceActor,
  registerId: string | null
): PayrollPaymentResolution {
  const employee = db.query<any>(
    `SELECT salary_payment_method AS salaryPaymentMethod, bank_name AS bankName,
            bank_account_number AS bankAccountNumber, wallet_provider AS walletProvider,
            wallet_number AS walletNumber
     FROM employees WHERE id = ?`,
    [data.employeeId]
  )[0];
  const method: PayrollPaymentMethod = data.paymentMethod
    || (employee?.salaryPaymentMethod === 'BANK_TRANSFER' || employee?.salaryPaymentMethod === 'WALLET'
      ? employee.salaryPaymentMethod
      : 'CASH');
  const referenceNumber = data.referenceNumber?.trim() || null;
  const proofReference = data.proofReference?.trim() || null;

  if (method === 'BANK_TRANSFER') {
    let bankAccountId = data.bankAccountId?.trim() || null;
    if (!bankAccountId && employee?.bankAccountNumber) {
      const matched = db.query<{ id: string }>(
        `SELECT id FROM bank_accounts
         WHERE is_active = 1 AND replace(replace(upper(account_number), ' ', ''), '-', '') =
               replace(replace(upper(?), ' ', ''), '-', '')
           AND (branch_id = ? OR branch_id IS NULL)
         ORDER BY branch_id IS NULL LIMIT 1`,
        [employee.bankAccountNumber, branchId]
      )[0];
      bankAccountId = matched?.id ?? null;
    }
    if (!bankAccountId) {
      throw new Error(`حدد الحساب البنكي لصرف راتب الموظف ${data.employeeId}؛ لا يوجد حساب مطابق لرقم حسابه.`);
    }
    const bank = resolveBankAccount(db, bankAccountId, branchId);
    return {
      method, registerId: null, bankAccountId: bank.id,
      walletProvider: null, walletNumber: null, referenceNumber, proofReference,
      creditAccountCode: bank.glAccountCode || '1102',
    };
  }

  if (method === 'WALLET') {
    const walletProvider = data.walletProvider?.trim() || employee?.walletProvider || employee?.bankName || null;
    const walletNumber = data.walletNumber?.trim() || employee?.walletNumber || employee?.bankAccountNumber || null;
    if (!walletProvider || !walletNumber) {
      throw new Error(`بيانات المحفظة الإلكترونية غير مكتملة للموظف ${data.employeeId}.`);
    }
    return {
      method, registerId: null, bankAccountId: null,
      walletProvider, walletNumber, referenceNumber, proofReference,
      creditAccountCode: '1107',
    };
  }

  if (registerId) branchAccess.requireRegisterAccess(registerId, actor, branchId);
  if (!registerId && (data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT')) {
    throw new Error('يجب تحديد خزينة فرع الموظف للصرف النقدي.');
  }
  return {
    method: 'CASH', registerId, bankAccountId: null, walletProvider: null,
    walletNumber: null, referenceNumber, proofReference, creditAccountCode: '1101',
  };
}

export function persistPayrollTransaction(
  db: DatabaseManager,
  branchAccess: BranchAccessService,
  data: PayrollTransactionInput,
  amount: number,
  id: string,
  registerId: string | null,
  branchId: string,
  actor: EmployeeServiceActor,
  accountingPeriod: string | undefined,
  getEmployeeName: (employeeId: string) => string | undefined
): void {
  const payment = resolvePayrollPayment(db, branchAccess, data, branchId, actor, registerId);
  db.run(
    `INSERT INTO payroll_transactions
       (id,employee_id,type,amount,date,notes,created_by,register_id,branch_id,
        payment_method,bank_account_id,wallet_provider,wallet_number,reference_number,proof_reference,payment_status)
     VALUES (?,?,?,ROUND(?*100),?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.employeeId, data.type, amount, data.date, data.notes, actor.id, payment.registerId,
      branchId, payment.method, payment.bankAccountId, payment.walletProvider, payment.walletNumber,
      payment.referenceNumber, payment.proofReference, 'PAID']
  );

  const accountingDate = accountingPeriod ? `${accountingPeriod}-01` : data.date;
  if (data.type === 'DEDUCTION' || data.type === 'SALARY_PAYOUT') {
    ensureSalaryAccrual(db, data.employeeId, accountingDate, actor.id);
  }
  if (data.type === 'SALARY_PAYOUT') {
    applyAdvancesToSalary(db, data.employeeId, accountingDate, actor.id);
  }

  const payable = data.type === 'SALARY_PAYOUT'
    ? getPayrollPayable(db, data.employeeId, accountingDate)
    : 0;
  if (data.type === 'SALARY_PAYOUT' && amount > payable + 0.009) {
    throw new Error(`Salary payout exceeds accrued payroll payable (${payable}).`);
  }
  const lines = getPayrollPostingLines(data.type, amount, payable, payment.creditAccountCode);
  postLedgerEntry(db.getDatabase(), {
    date: data.date,
    description: `Payroll ${data.type} for ${getEmployeeName(data.employeeId) || data.employeeId}`,
    referenceType: 'PAYROLL_TRANSACTION',
    referenceId: id,
    createdBy: actor.id,
    lines,
  });

  if (data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT') {
    if (payment.method === 'CASH' && payment.registerId) {
      db.run('UPDATE cash_registers SET current_balance = current_balance - ROUND(?*100) WHERE id=?', [amount, payment.registerId]);
    } else if (payment.method === 'BANK_TRANSFER' && payment.bankAccountId) {
      db.run('UPDATE bank_accounts SET current_balance = current_balance - ROUND(?*100), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [amount, payment.bankAccountId]);
    }
  }
  db.run(
    `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
    [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, `Payroll ${data.type}`, 'HR', id,
      JSON.stringify({
        employeeId: data.employeeId, amount, date: data.date, paymentMethod: payment.method,
        bankAccountId: payment.bankAccountId, walletProvider: payment.walletProvider,
        walletNumber: payment.walletNumber, referenceNumber: payment.referenceNumber,
        proofReference: payment.proofReference,
      })]
  );
}

export function assertPayrollPeriodEditable(db: DatabaseManager, branchId: string, date: string): void {
  const run = db.query<{ status: PayrollRunStatus }>(
    `SELECT status FROM payroll_runs WHERE branch_id = ? AND period = ?`,
    [branchId, date.slice(0, 7)]
  )[0];
  if (run && run.status !== 'DRAFT') {
    throw new Error('الفترة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديل حركاتها أو حضورها.');
  }
}
