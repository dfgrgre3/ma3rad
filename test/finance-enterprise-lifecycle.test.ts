import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { FinanceEnterpriseService } from '../src/services/FinanceEnterpriseService.ts';
import { FinanceExtrasService } from '../src/services/FinanceExtrasService.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return DatabaseManager.getInstance().query<T>(sql, params)[0];
}

test('5.5: Finance & Accounting Enterprise Lifecycle', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const adminUser = queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'admin'`);
  assert.ok(adminUser?.id, 'Admin user must exist');
  const adminId = adminUser!.id;

  const financeService = new FinanceEnterpriseService();
  const extrasService = new FinanceExtrasService();

  // ──────────────────────────────────────────────────────────
  // 1. Chart of Accounts Integrity: Triggers prevent deleting used accounts
  // ──────────────────────────────────────────────────────────
  const testParentAcc = 'acc_test_parent';
  const testChildAcc = 'acc_test_child';
  db.run(`INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
    VALUES (?, '9900', 'حساب أب تجريبي', 'EXPENSE', NULL, 0, 1)`, [testParentAcc]);
  db.run(`INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
    VALUES (?, '9901', 'حساب فرعي تجريبي', 'EXPENSE', '9900', 0, 1)`, [testChildAcc]);

  // Attempting to delete parent account while child exists should fail via trigger
  assert.throws(() => {
    db.run(`DELETE FROM chart_of_accounts WHERE id = ?`, [testParentAcc]);
  }, /لا يمكن حذف حساب أب يتبعه حسابات فرعية نشطة/);

  // Post a dummy journal entry to child account
  const jvId = postLedgerEntry(db.getDatabase(), {
    date: '2025-01-15',
    description: 'قيد تجربة رقابة حذف الحسابات',
    referenceType: 'TEST_AUDIT',
    referenceId: 'test_audit_01',
    createdBy: adminId,
    lines: [
      { accountCode: '9901', debit: 500, credit: 0 },
      { accountCode: '1101', debit: 0, credit: 500 },
    ],
  });
  assert.ok(jvId, 'Entry should post successfully');

  // Attempting to delete child account that now has journal entry lines should fail via trigger
  assert.throws(() => {
    db.run(`DELETE FROM chart_of_accounts WHERE id = ?`, [testChildAcc]);
  }, /لا يمكن حذف حساب مرتبط بقيود يومية أو حركات محاسبية/);

  // ──────────────────────────────────────────────────────────
  // 2. Fiscal Periods & Closing Cycle
  // ──────────────────────────────────────────────────────────
  const yearCode = 'FY2025';
  const existingFy = queryOne<{ id: string }>(`SELECT id FROM fiscal_years WHERE year_code = ?`, [yearCode]);
  let fyId = existingFy?.id;
  if (!fyId) {
    fyId = financeService.createFiscalYear({
      yearCode,
      name: 'السنة المالية 2025',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
  }

  const periods = financeService.getFiscalPeriods(fyId);
  assert.equal(periods.length, 12, 'Must have 12 monthly periods');

  // Close January 2025
  const janPeriod = periods.find(p => p.periodNumber === 1);
  assert.ok(janPeriod, 'January period must exist');

  financeService.closePeriod(janPeriod!.id, 'محضر إقفال شهر يناير 2025');
  const updatedJan = queryOne<{ status: string }>(`SELECT status FROM fiscal_periods WHERE id = ?`, [janPeriod!.id]);
  assert.equal(updatedJan?.status, 'CLOSED', 'January period must be CLOSED');

  // Attempting to post another transaction dated in closed January should be rejected
  assert.throws(() => {
    postLedgerEntry(db.getDatabase(), {
      date: '2025-01-20',
      description: 'محاولة ترحيل في فترة مقفلة',
      referenceType: 'TEST_CLOSED',
      referenceId: 'test_closed_01',
      createdBy: adminId,
      lines: [
        { accountCode: '1101', debit: 100, credit: 0 },
        { accountCode: '4101', debit: 0, credit: 100 },
      ],
    });
  }, /لا يمكن الترحيل في فترة محاسبية/);

  // Reopen January with reason
  financeService.reopenPeriod(janPeriod!.id, 'تسوية محاسبية استثنائية بإذن الإدارة');
  const reopenedJan = queryOne<{ status: string }>(`SELECT status FROM fiscal_periods WHERE id = ?`, [janPeriod!.id]);
  assert.equal(reopenedJan?.status, 'OPEN', 'January period should be OPEN again');

  // Year-end closing simulation
  // Post sample revenue and expense in 2025
  postLedgerEntry(db.getDatabase(), {
    date: '2025-06-15',
    description: 'مبيعات منتصف السنة 2025',
    referenceType: 'TEST_REV_2025',
    referenceId: 'test_rev_2025',
    createdBy: adminId,
    lines: [
      { accountCode: '1101', debit: 12000, credit: 0 },
      { accountCode: '4101', debit: 0, credit: 12000 },
    ],
  });
  postLedgerEntry(db.getDatabase(), {
    date: '2025-07-20',
    description: 'مصروفات تشغيلية 2025',
    referenceType: 'TEST_EXP_2025',
    referenceId: 'test_exp_2025',
    createdBy: adminId,
    lines: [
      { accountCode: '5201', debit: 4000, credit: 0 },
      { accountCode: '1101', debit: 0, credit: 4000 },
    ],
  });

  // Close fiscal year
  const closingEntryId = financeService.closeFiscalYear(fyId!, '3102');
  assert.ok(closingEntryId, 'Closing entry must be generated');

  const closedFy = queryOne<{ status: string; closing_entry_id: string }>(`SELECT status, closing_entry_id FROM fiscal_years WHERE id = ?`, [fyId!]);
  assert.equal(closedFy?.status, 'CLOSED', 'Fiscal year must be CLOSED');
  assert.equal(closedFy?.closing_entry_id, closingEntryId);

  // ──────────────────────────────────────────────────────────
  // 3. Bank Accounts & Bank Reconciliation
  // ──────────────────────────────────────────────────────────
  const bankAccId = financeService.saveBankAccount({
    accountName: 'حساب بنك مصر للاختبار',
    bankName: 'بنك مصر',
    accountNumber: 'BM-TEST-998877',
    currency: 'EGP',
    openingBalance: 50000,
    glAccountId: 'acc_1102',
  });
  assert.ok(bankAccId, 'Bank account must be created');

  // Post deposit transaction to bank
  postLedgerEntry(db.getDatabase(), {
    date: '2026-02-10',
    description: 'إيداع نقدي بالحساب البنكي',
    referenceType: 'TEST_BANK_DEP',
    referenceId: 'test_bank_dep_01',
    createdBy: adminId,
    lines: [
      { accountCode: '1102', debit: 25000, credit: 0 },
      { accountCode: '1101', debit: 0, credit: 25000 },
    ],
  });

  const unreconciled = financeService.getUnreconciledBankTransactions(bankAccId, '2026-02-28');
  assert.ok(unreconciled.length > 0, 'Must have unreconciled transactions');

  const rec = financeService.createBankReconciliation({
    bankAccountId: bankAccId,
    statementDate: '2026-02-28',
    statementBalance: 25000, // Matching the deposit
    clearedTransactions: unreconciled.filter(t => t.amount === 25000),
    notes: 'مطابقة دورية ناجحة لشهر فبراير',
  });
  assert.ok(rec.id, 'Reconciliation record must exist');
  assert.equal(rec.status, 'RECONCILED');

  // ──────────────────────────────────────────────────────────
  // 4. Cheques Lifecycle Integration
  // ──────────────────────────────────────────────────────────
  const chqId = `chq_test_${Date.now()}`;
  db.run(`
    INSERT INTO cheques (id, cheque_number, type, party_type, party_name, bank_name, amount, due_date, status, created_by)
    VALUES (?, 'CHQ-9901', 'RECEIVED', 'CUSTOMER', 'شركة الأهرام للتطوير', 'CIB', 75000, '2026-03-15', 'PENDING', ?)
  `, [chqId, adminId]);

  // Transition: PENDING -> DEPOSITED
  financeService.transitionChequeStatus(chqId, 'DEPOSITED', { bankAccountId: bankAccId });
  let chq = queryOne<any>(`SELECT status, bank_account_id, deposited_at FROM cheques WHERE id = ?`, [chqId]);
  assert.equal(chq?.status, 'DEPOSITED');
  assert.equal(chq?.bank_account_id, bankAccId);

  // Transition: DEPOSITED -> CLEARED (Posts: Dr Bank 1102 / Cr Cheques under collection 1105)
  financeService.transitionChequeStatus(chqId, 'CLEARED', { date: '2026-03-15' });
  chq = queryOne<any>(`SELECT status, clearing_entry_id FROM cheques WHERE id = ?`, [chqId]);
  assert.equal(chq?.status, 'CLEARED');
  assert.ok(chq?.clearing_entry_id, 'Must link clearance journal entry');

  const clearJvLines = db.query<any>(`
    SELECT a.code, l.debit, l.credit
    FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE l.entry_id = ?
  `, [chq.clearing_entry_id]);
  assert.equal(clearJvLines.find((l: any) => l.code === '1102')?.debit, 75000, 'Bank debit 75,000');
  assert.equal(clearJvLines.find((l: any) => l.code === '1105')?.credit, 75000, 'Cheques under collection credit 75,000');

  // Transition: CLEARED -> BOUNCED (Bounced cheque reversal + 100 EGP fee)
  financeService.transitionChequeStatus(chqId, 'BOUNCED', {
    bounceReason: 'توقيع غير مطابق',
    bounceFee: 100,
    date: '2026-03-16',
  });
  chq = queryOne<any>(`SELECT status, bounce_reason, bounce_fee, bounce_entry_id FROM cheques WHERE id = ?`, [chqId]);
  assert.equal(chq?.status, 'BOUNCED');
  assert.equal(chq?.bounce_fee, 100);
  assert.ok(chq?.bounce_entry_id, 'Must link bounce journal entry');

  // Transition: BOUNCED -> RE_PRESENTED
  financeService.transitionChequeStatus(chqId, 'RE_PRESENTED', { notes: 'تم تصحيح التوقيع وإعادة تقديمه' });
  chq = queryOne<any>(`SELECT status FROM cheques WHERE id = ?`, [chqId]);
  assert.equal(chq?.status, 'RE_PRESENTED');

  // Verify Audit History
  const history = financeService.getChequeHistory(chqId);
  assert.ok(history.length >= 4, 'Must have at least 4 state transition logs');

  // ──────────────────────────────────────────────────────────
  // 5. Cost Centers & Budgets
  // ──────────────────────────────────────────────────────────
  const ccId = financeService.saveCostCenter({
    code: 'CC-TEST-EXP',
    name: 'معرض التجمع الخامس - تشغيل',
    description: 'مركز تكلفة تجريبي',
  });
  assert.ok(ccId, 'Cost center must exist');

  const bgtId = financeService.saveBudget({
    name: 'موازنة صيانة ومصروفات 2026',
    fiscalYearId: fyId!,
    costCenterId: ccId,
    items: [
      { accountId: 'acc_5201', allocatedAmount: 100000, notes: 'مصروفات صيانة دورية' },
    ],
  });
  assert.ok(bgtId, 'Budget must exist');

  const budgetReport = financeService.getBudgetWithItems(bgtId);
  assert.ok(budgetReport?.items?.length, 'Budget items must be loaded');
  assert.equal(budgetReport!.items![0].allocatedAmount, 100000);

  // ──────────────────────────────────────────────────────────
  // 6. Cash Flow Forecasting
  // ──────────────────────────────────────────────────────────
  const forecast = financeService.getCashFlowForecast(60);
  assert.ok(forecast.days !== undefined, 'Forecast days must exist');
  assert.ok(typeof forecast.currentCashBalance === 'number', 'Current cash balance must be numeric');
  assert.ok(typeof forecast.projectedEndBalance === 'number', 'Projected end balance must be numeric');

  // ──────────────────────────────────────────────────────────
  // 7. E-Payment Gateway Settlements
  // ──────────────────────────────────────────────────────────
  const gwId = financeService.savePaymentGateway({
    name: 'ماكينة نقاط بيع بنك مصر التجريبية',
    providerCode: 'POS_BM_TEST',
    glAccountId: 'acc_1106',
    commissionRate: 2.0, // 2%
    fixedFee: 1.0,
    settlementPeriodDays: 1,
  });

  const settleId = financeService.recordGatewaySettlement({
    gatewayId: gwId,
    settlementDate: '2026-03-20',
    grossAmount: 10000,
    commissionAmount: 201, // 2% + 1 EGP
    taxDeduction: 0,
    bankAccountId: bankAccId,
    notes: 'تسوية مبيعات عطلة نهاية الأسبوع',
  });
  assert.ok(settleId, 'Settlement record must be saved');

  const settleRecord = queryOne<any>(`SELECT net_amount, journal_entry_id FROM payment_gateway_settlements WHERE id = ?`, [settleId]);
  assert.equal(settleRecord?.net_amount, 9799, 'Net deposited amount must be 10,000 - 201 = 9,799');
  assert.ok(settleRecord?.journal_entry_id, 'Must create balanced ledger entry');

  const settleJvLines = db.query<any>(`
    SELECT a.code, l.debit, l.credit
    FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE l.entry_id = ?
  `, [settleRecord.journal_entry_id]);
  assert.equal(settleJvLines.find((l: any) => l.code === '1102')?.debit, 9799, 'Dr Bank 9,799');
  assert.equal(settleJvLines.find((l: any) => l.code === '5207')?.debit, 201, 'Dr Gateway fees 201');
  assert.equal(settleJvLines.find((l: any) => l.code === '1106')?.credit, 10000, 'Cr Gateway clearing 10,000');
});
