import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { EmployeeService } from '../src/services/domains/hr/EmployeeService.ts';
import { AttendanceService } from '../src/services/domains/hr/AttendanceService.ts';
import { AttendanceTimeService } from '../src/services/domains/hr/AttendanceTimeService.ts';
import { localDateString } from '../src/utils/shared/date.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('payroll aggregates all attendance periods and operation shift presence without double counting', async () => {
  const db = await bootstrap();
  const employee = EmployeeService.create({
    name: 'موظف توحيد الحضور',
    location: 'اختبار',
    role: 'فني',
    phone: '0109000001',
    email: '',
    baseSalary: 2600,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2020-07-01',
  });
  const shift = AttendanceService.saveShift({
    name: `وردية توحيد ${employee.id}`,
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    graceMinutes: 0,
    overtimeAfterMinutes: 0,
    workdays: [0, 1, 2, 3, 4, 5, 6],
  });
  AttendanceService.assignShift(employee.id, shift.id, '2020-07-01');
  db.run(
    `INSERT INTO operation_shifts
       (id, shift_number, definition_id, branch_id, business_date, scheduled_start, scheduled_end, status)
     VALUES ('os_unified_1', 'OS-UNIFIED-1', ?, ?, '2020-07-06', '2020-07-06T09:00:00', '2020-07-06T17:00:00', 'CLOSED'),
            ('os_unified_2', 'OS-UNIFIED-2', ?, ?, '2020-07-07', '2020-07-07T09:00:00', '2020-07-07T17:00:00', 'CLOSED')`,
    [shift.id, employee.branchId, shift.id, employee.branchId]
  );
  // Two periods on the same day: the daily summary must hold their sum.
  db.run(
    `INSERT INTO employee_attendance_periods
       (id, employee_id, operation_shift_id, attendance_date, check_in_at, check_out_at,
        worked_minutes, late_minutes, overtime_minutes, status, source, recorded_by)
     VALUES ('period_a', ?, 'os_unified_1', '2020-07-06', '2020-07-06T09:00:00', '2020-07-06T13:00:00',
             240, 10, 30, 'CLOSED', 'OPERATIONS_SHIFT', 'usr_admin'),
            ('period_b', ?, 'os_unified_1', '2020-07-06', '2020-07-06T14:00:00', '2020-07-06T18:30:00',
             270, 0, 30, 'CLOSED', 'OPERATIONS_SHIFT', 'usr_admin')`,
    [employee.id, employee.id]
  );
  // Presence row for the same operation shift duplicates period_a/period_b.
  db.run(
    `INSERT INTO operation_shift_staff
       (id, operation_shift_id, employee_id, role, status, check_in_at, check_out_at, late_minutes, overtime_minutes)
     VALUES ('staff_dup', 'os_unified_1', ?, 'STAFF', 'PRESENT',
             '2020-07-06T09:00:00', '2020-07-06T18:30:00', 10, 60)`,
    [employee.id]
  );
  // Staff-only presence on the next day has no attendance period and must still count once.
  db.run(
    `INSERT INTO operation_shift_staff
       (id, operation_shift_id, employee_id, role, status, check_in_at, check_out_at, late_minutes, overtime_minutes)
     VALUES ('staff_only', 'os_unified_2', ?, 'STAFF', 'PRESENT',
             '2020-07-07T09:10:00', '2020-07-07T17:00:00', 10, 60)`,
    [employee.id]
  );
  AttendanceTimeService.syncDailySummary(employee.id, '2020-07-06', 'usr_admin');
  AttendanceTimeService.syncDailySummary(employee.id, '2020-07-07', 'usr_admin');

  const unified = AttendanceTimeService.getUnifiedRows(employee.branchId, '2020-07-01', '2020-07-31');
  const sixth = unified.find((row) => row.date === '2020-07-06')!;
  const seventh = unified.find((row) => row.date === '2020-07-07')!;
  assert.equal(sixth.workedMinutes, 510, 'two periods are summed');
  assert.equal(sixth.periodCount, 2, 'the duplicate operation staff row is not counted as a third period');
  assert.equal(sixth.lateMinutes, 10);
  assert.equal(seventh.workedMinutes, 470, 'staff-only presence contributes its worked minutes');
  assert.equal(seventh.periodCount, 1);

  const dailySixth = q('SELECT * FROM attendance WHERE employee_id=? AND date=?', [employee.id, '2020-07-06'])[0];
  assert.equal(dailySixth.workedMinutes, 510);
  assert.equal(dailySixth.overtimeMinutes, 60);

  AttendanceService.approveOvertime(dailySixth.id);
  const dailySeventh = q('SELECT * FROM attendance WHERE employee_id=? AND date=?', [employee.id, '2020-07-07'])[0];
  AttendanceService.approveOvertime(dailySeventh.id);

  const run = EmployeeService.calculatePayrollRun('2020-07');
  const item = run.items.find((row) => row.employeeId === employee.id)!;
  assert.equal(item.overtimeMinutes, 120, 'approved overtime is 60+60, not the duplicated 180');
  assert.equal(item.lateMinutes, 20);
  assert.ok(item.overtimeAmount > 0, 'approved overtime is paid once for the unified minutes');
});

test('bulk payroll pays cash, bank transfer and wallet with references, proofs and reconciliation', async () => {
  const db = await bootstrap();
  // Keep the employee created by the previous test out of this payroll period.
  const previousEmployee = q("SELECT id FROM employees WHERE phone='0109000001'")[0];
  if (previousEmployee) EmployeeService.update(previousEmployee.id, { status: 'SUSPENDED' });
  const createEmployee = (name: string, phone: string, extra: Record<string, unknown>) => EmployeeService.create({
    name,
    location: 'اختبار',
    role: 'موظف',
    phone,
    email: '',
    baseSalary: 1000,
    salaryType: 'MONTHLY',
    status: 'ACTIVE',
    joinedDate: '2020-08-01',
    ...extra,
  });
  const cashEmployee = createEmployee('موظف نقدي', '0109000002', { salaryPaymentMethod: 'CASH' });
  const bankEmployee = createEmployee('موظف بنكي', '0109000003', {
    salaryPaymentMethod: 'BANK_TRANSFER', bankName: 'بنك الاختبار', bankAccountNumber: 'BANK-100',
  });
  const walletEmployee = createEmployee('موظف محفظة', '0109000004', {
    salaryPaymentMethod: 'WALLET', walletProvider: 'فودافون كاش', walletNumber: '0109000004',
  });
  db.run(
    `INSERT INTO bank_accounts
       (id, account_name, bank_name, account_number, opening_balance, current_balance, gl_account_id, branch_id, is_active)
     VALUES ('bank_payroll_test', 'حساب الرواتب', 'بنك الاختبار', 'BANK-100', 10000, 10000, 'acc_1102', ?, 1)`,
    [bankEmployee.branchId]
  );

  const run = EmployeeService.calculatePayrollRun('2020-08');
  const bankItem = run.items.find((row) => row.employeeId === bankEmployee.id)!;
  assert.equal(bankItem.paymentMethod, 'BANK_TRANSFER');
  assert.equal(bankItem.details.walletProvider, null);
  assert.equal(run.items.find((row) => row.employeeId === walletEmployee.id)?.paymentMethod, 'WALLET');
  assert.equal(run.items.find((row) => row.employeeId === cashEmployee.id)?.paymentMethod, 'CASH');
  EmployeeService.approvePayrollRun(run.id);

  assert.throws(
    () => EmployeeService.payPayrollRun(run.id, {
      payments: {
        [cashEmployee.id]: { method: 'BANK_TRANSFER', bankAccountId: 'missing_bank' },
      },
    }),
    /الحساب البنكي المحدد غير موجود/
  );
  assert.equal(q('SELECT status FROM payroll_runs WHERE id=?', [run.id])[0].status, 'APPROVED');
  assert.equal(
    q("SELECT COUNT(*) AS count FROM payroll_transactions WHERE type='SALARY_PAYOUT' AND notes LIKE 'صرف دورة الرواتب 2020-08%'")[0].count,
    0,
    'a failed destination never writes a partial payout'
  );

  const paid = EmployeeService.payPayrollRun(run.id, {
    batchReference: 'BATCH-AUG-2020',
    payments: {
      [bankEmployee.id]: { proofReference: 'SWIFT-PROOF-1', referenceNumber: 'TRX-1001' },
      [walletEmployee.id]: { referenceNumber: 'WALLET-2002', proofReference: 'WALLET-PROOF-2' },
    },
  });
  assert.equal(paid.status, 'PAID');
  const bankPaid = paid.items.find((row) => row.employeeId === bankEmployee.id)!;
  const walletPaid = paid.items.find((row) => row.employeeId === walletEmployee.id)!;
  assert.equal(bankPaid.payoutStatus, 'PAID');
  assert.equal(bankPaid.paymentReference, 'TRX-1001');
  assert.equal(bankPaid.paymentProof, 'SWIFT-PROOF-1');
  assert.ok(bankPaid.payoutTransactionId);
  assert.equal(walletPaid.paymentReference, 'WALLET-2002');

  const transactions = q(
    `SELECT employee_id AS employeeId, payment_method AS paymentMethod, bank_account_id AS bankAccountId,
            reference_number AS referenceNumber, proof_reference AS proofReference
     FROM payroll_transactions WHERE type='SALARY_PAYOUT' AND notes LIKE 'صرف دورة الرواتب 2020-08%'`
  );
  assert.equal(transactions.length, 3);
  assert.equal(transactions.find((row) => row.employeeId === bankEmployee.id)?.paymentMethod, 'BANK_TRANSFER');
  assert.equal(transactions.find((row) => row.employeeId === bankEmployee.id)?.bankAccountId, 'bank_payroll_test');
  assert.equal(transactions.find((row) => row.employeeId === walletEmployee.id)?.paymentMethod, 'WALLET');
  assert.equal(transactions.find((row) => row.employeeId === cashEmployee.id)?.paymentMethod, 'CASH');
  assert.equal(
    q("SELECT current_balance AS balance FROM bank_accounts WHERE id='bank_payroll_test'")[0].balance,
    10000 - bankItem.netAmount
  );

  const bankCredit = q(
    `SELECT COALESCE(SUM(l.credit),0) AS amount FROM journal_entry_lines l
     JOIN journal_entries e ON e.id=l.entry_id
     JOIN chart_of_accounts a ON a.id=l.account_id
     WHERE e.reference_id = ? AND a.code='1102'`,
    [bankPaid.payoutTransactionId]
  )[0].amount;
  assert.equal(bankCredit, bankItem.netAmount, 'bank payout credits the bank ledger account');
  const walletCredit = q(
    `SELECT COALESCE(SUM(l.credit),0) AS amount FROM journal_entry_lines l
     JOIN journal_entries e ON e.id=l.entry_id
     JOIN chart_of_accounts a ON a.id=l.account_id
     WHERE e.reference_id = ? AND a.code='1107'`,
    [walletPaid.payoutTransactionId]
  )[0].amount;
  assert.equal(walletCredit, walletPaid.netAmount, 'wallet payout credits the e-wallet clearing account');

  const reconciliation = EmployeeService.getPayrollPaymentReconciliation(paid.id);
  assert.equal(reconciliation.isBalanced, true);
  assert.equal(reconciliation.expectedTotal, reconciliation.paidTotal);
  assert.equal(reconciliation.byMethod.find((row) => row.method === 'BANK_TRANSFER')?.count, 1);
  assert.equal(reconciliation.byMethod.find((row) => row.method === 'WALLET')?.count, 1);
  assert.equal(reconciliation.byMethod.find((row) => row.method === 'CASH')?.count, 1);

  const options = EmployeeService.getPayrollPayoutOptions();
  assert.ok(options.bankAccounts.some((row) => row.id === 'bank_payroll_test'));
  assert.ok(options.registers.length > 0);
  assert.equal(localDateString().length, 10);
});
