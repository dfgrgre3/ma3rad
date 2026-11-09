import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { CashierService } from '../src/services/finance/CashierService.ts';
import { PartnerService } from '../src/services/customers/PartnerService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_partner_admin',
  username: 'partner-admin',
  fullName: 'Partner Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES (?, ?, 'test', ?, 'ADMIN', 1, 'ALL')`,
    [admin.id, admin.username, admin.fullName]
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

test('partner accounts preserve financial history, post balanced entries and reconcile cash shifts', async () => {
  const db = await boot();
  db.run("UPDATE cash_registers SET current_balance = 0 WHERE id = 'cr_main'");
  db.run("UPDATE chart_of_accounts SET balance = -1000 WHERE code = '3102'");
  const service = new PartnerService();
  const primary = service.createPartner({
    name: 'Partner Alpha',
    ownershipPercent: 60,
    capitalAmount: 1200,
  });
  const secondary = service.createPartner({
    name: 'Partner Beta',
    ownershipPercent: 40,
    capitalAmount: 800,
  });
  const cashier = new CashierService();
  const shift = cashier.openShift('cr_main', admin.id, 0);

  service.postTransaction({
    partnerId: primary.id,
    transactionType: 'CAPITAL_CONTRIBUTION',
    amount: 1000,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Initial contribution',
  });
  service.postTransaction({
    partnerId: primary.id,
    transactionType: 'WITHDRAWAL',
    amount: 200,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Capital withdrawal',
  });
  service.postTransaction({
    partnerId: primary.id,
    transactionType: 'PARTNER_EXPENSE_PAID',
    amount: 75,
    description: 'Paid business supplies',
  });
  service.distributeProfits(500, [
    { partnerId: primary.id, amount: 300 },
    { partnerId: secondary.id, amount: 200 },
  ]);
  service.postTransaction({
    partnerId: primary.id,
    transactionType: 'PROFIT_DISTRIBUTION',
    amount: 50,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Profit payment',
  });
  service.postTransaction({
    partnerId: primary.id,
    transactionType: 'COMPANY_EXPENSE_FOR_PARTNER',
    amount: 25,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Personal expense paid by company',
  });

  const statement = service.getPartnerStatement(primary.id);
  assert.equal(statement.partner.capitalAmount, 1200);
  assert.equal(statement.partner.capitalContributions, 1000);
  assert.equal(statement.partner.withdrawals, 200);
  assert.equal(statement.partner.profitsDue, 300);
  assert.equal(statement.partner.profitsDistributed, 50);
  assert.equal(statement.partner.expensesPaid, 75);
  assert.equal(statement.partner.expensesForPartner, 25);
  assert.equal(statement.partner.netBalance, 1100);
  assert.equal(statement.transactions.length, 6);
  assert.equal(statement.transactions[0].runningBalance, 1100);
  assert.equal(statement.transactions.at(-1)?.runningBalance, 1000);
  assert.throws(() => db.run(
    'UPDATE partner_account_transactions SET description = ? WHERE id = ?',
    ['Edited history', statement.transactions[0].id]
  ), /Partner account history is immutable/);
  assert.throws(() => db.run(
    'DELETE FROM partner_account_transactions WHERE id = ?',
    [statement.transactions[0].id]
  ), /Partner account history is immutable/);

  assert.equal(db.query<{ currentBalance: number }>(
    "SELECT current_balance AS currentBalance FROM cash_registers WHERE id = 'cr_main'"
  )[0].currentBalance, 725);
  const closedShift = cashier.closeShift(shift.id, 725, 'partner transactions');
  assert.equal(closedShift.expectedEndingCash, 725);
  assert.equal(closedShift.totalPartnerInflows, 1000);
  assert.equal(closedShift.totalPartnerOutflows, 275);

  const unbalancedEntries = db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM journal_entries
    WHERE reference_type = 'PARTNER_TRANSACTION' AND ABS(total_debit - total_credit) > 0.001
  `)[0].count;
  assert.equal(unbalancedEntries, 0);
  assert.equal(db.query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM audit_logs WHERE module = 'PARTNERS'"
  )[0].count, 8);
  assert.ok(db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM journal_entry_lines l
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE a.code IN (?, ?, ?)
  `, [`3103_${primary.id}`, `2103_${primary.id}`, `1106_${primary.id}`])[0].count > 0);

  const branchId = db.query<{ branchId: string }>(
    "SELECT branch_id AS branchId FROM cash_registers WHERE id = 'cr_main'"
  )[0].branchId;
  db.executeTransaction((transaction) => service.allocateSaleProfit(transaction, {
    invoiceId: 'inv_partner_auto',
    invoiceNumber: 'INV-PARTNER-AUTO',
    companyId: primary.companyId,
    branchId,
    transactionDate: '2025-03-01',
    profit: 1000,
    actorId: admin.id,
  }));
  assert.equal(service.getPartnerStatement(primary.id).partner.profitsDue, 900);
  assert.equal(service.getPartnerStatement(secondary.id).partner.profitsDue, 600);

  db.executeTransaction((transaction) => service.adjustSaleProfitAllocation(transaction, {
    invoiceId: 'inv_partner_auto',
    invoiceNumber: 'INV-PARTNER-AUTO',
    branchId,
    transactionDate: '2025-03-02',
    invoiceProfit: 1000,
    targetProfit: 500,
    actorId: admin.id,
  }));
  assert.equal(service.getPartnerStatement(primary.id).partner.profitsDue, 600);
  assert.equal(service.getPartnerStatement(secondary.id).partner.profitsDue, 400);

  db.executeTransaction((transaction) => service.adjustSaleProfitAllocation(transaction, {
    invoiceId: 'inv_partner_auto',
    invoiceNumber: 'INV-PARTNER-AUTO',
    branchId,
    transactionDate: '2025-03-03',
    invoiceProfit: 1000,
    targetProfit: 0,
    actorId: admin.id,
  }));
  assert.equal(service.getPartnerStatement(primary.id).partner.profitsDue, 300);
  assert.equal(service.getPartnerStatement(secondary.id).partner.profitsDue, 200);

  assert.throws(() => service.postTransaction({
    partnerId: primary.id,
    transactionType: 'WITHDRAWAL',
    amount: 900,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Overdraw',
  }), /رأس المال المتاح/);
  assert.throws(() => service.distributeProfits(10, [
    { partnerId: primary.id, amount: 10 },
  ]), /كل الشركاء النشطين/);
});

test('partner accounts support loans, drawings, adjustments, filtered statements and auditable reversals', async () => {
  const db = await boot();
  db.run("UPDATE cash_registers SET current_balance = 5000 WHERE id = 'cr_main'");
  db.run("UPDATE chart_of_accounts SET balance = -1000 WHERE code = '3102'");
  const service = new PartnerService();
  const partner = service.createPartner({ name: 'Partner Gamma', ownershipPercent: 0, capitalAmount: 0 });

  service.postTransaction({
    partnerId: partner.id, transactionType: 'PARTNER_LOAN', amount: 1000,
    transactionDate: '2026-01-01', paymentType: 'CASH', registerId: 'cr_main',
    referenceNumber: 'LOAN-1', description: 'شريك أقرض الشركة',
  });
  service.postTransaction({
    partnerId: partner.id, transactionType: 'LOAN_REPAYMENT', amount: 300,
    transactionDate: '2026-01-02', paymentType: 'CASH', registerId: 'cr_main',
    description: 'سداد جزء من القرض',
  });
  service.postTransaction({
    partnerId: partner.id, transactionType: 'PERSONAL_DRAWING', amount: 200,
    transactionDate: '2026-01-02', paymentType: 'CASH', registerId: 'cr_main',
    description: 'مسحوبات شخصية',
  });
  service.postTransaction({
    partnerId: partner.id, transactionType: 'ADJUSTMENT_INCREASE', amount: 150,
    transactionDate: '2026-01-03', description: 'تسوية رصيد افتتاحي',
  });
  service.postTransaction({
    partnerId: partner.id, transactionType: 'ADJUSTMENT_DECREASE', amount: 50,
    transactionDate: '2026-01-04', description: 'تصحيح تسوية',
  });

  let statement = service.getPartnerStatement(partner.id);
  assert.equal(statement.partner.loansReceived, 1000);
  assert.equal(statement.partner.loansRepaid, 300);
  assert.equal(statement.partner.personalDrawings, 200);
  assert.equal(statement.partner.adjustments, 100);
  assert.equal(statement.partner.netBalance, 600);
  assert.equal(db.query<{ currentBalance: number }>(
    "SELECT current_balance AS currentBalance FROM cash_registers WHERE id = 'cr_main'"
  )[0].currentBalance, 5500);

  const filtered = service.getPartnerStatement(partner.id, {
    from: '2026-01-02', to: '2026-01-03',
  });
  assert.equal(filtered.openingBalance, 1000);
  assert.equal(filtered.periodInflows, 150);
  assert.equal(filtered.periodOutflows, 500);
  assert.equal(filtered.closingBalance, 650);
  assert.equal(filtered.transactions.length, 3);

  const adjustment = service.getPartnerStatement(partner.id, {
    types: ['ADJUSTMENT_INCREASE'],
  }).transactions[0];
  assert.equal(adjustment.amount, 150);

  const loan = statement.transactions.find((transaction) => transaction.transactionType === 'PARTNER_LOAN')!;
  service.reverseTransaction(loan.id, 'إلغاء القرض المكرر');
  assert.equal(db.query<{ currentBalance: number }>(
    "SELECT current_balance AS currentBalance FROM cash_registers WHERE id = 'cr_main'"
  )[0].currentBalance, 4500);
  assert.throws(() => service.reverseTransaction(loan.id, 'محاولة ثانية'), /تم عكس هذه الحركة مسبقًا/);

  const reversedAdjustment = service.reverseTransaction(adjustment.id, 'تسوية خاطئة');
  assert.equal(reversedAdjustment.transactionType, 'REVERSAL');
  assert.equal(reversedAdjustment.reversalOfType, 'ADJUSTMENT_INCREASE');
  statement = service.getPartnerStatement(partner.id);
  assert.equal(statement.partner.netBalance, -550);
  assert.equal(statement.partner.adjustments, -50);
  assert.equal(statement.transactions.find((transaction) => transaction.id === loan.id)?.isReversed, true);
  assert.equal(statement.transactions.find((transaction) => transaction.id === adjustment.id)?.isReversed, true);

  const overview = service.getOverview();
  assert.equal(overview.totalNetBalance, db.query<{ total: number }>(
    'SELECT COALESCE(SUM(balance_effect), 0) AS total FROM partner_account_transactions'
  )[0].total);

  // Isolate the new partner so the profit allocation batch can be verified end-to-end.
  db.run('UPDATE business_partners SET is_active = 0 WHERE id <> ?', [partner.id]);
  db.run('UPDATE business_partners SET ownership_percent = 100 WHERE id = ?', [partner.id]);
  service.distributeProfits(100, [{ partnerId: partner.id, amount: 100 }], '2026-01-10', 'أرباح اختبار');
  const history = service.getProfitDistributionHistory();
  const createdBatchId = db.query<{ batchId: string }>(`
    SELECT allocation_batch_id AS batchId
    FROM partner_account_transactions
    WHERE transaction_type = 'PROFIT_ALLOCATION' AND description LIKE '%أرباح اختبار%'
    ORDER BY rowid DESC
    LIMIT 1
  `)[0].batchId;
  const createdBatch = history.find((batch) => batch.batchId === createdBatchId);
  assert.ok(createdBatch, 'new distribution batch is listed');
  const batchLines = service.getProfitDistributionBatch(createdBatch.batchId);
  assert.equal(batchLines.length, 1);
  assert.equal(batchLines[0].partnerName, partner.name);
  assert.equal(batchLines[0].amount, 100);
  assert.equal(service.getPartnerStatement(partner.id).partner.profitsDue, 100);

  const withdrawalPartner = service.createPartner({ name: 'Partner Delta', ownershipPercent: 0, capitalAmount: 0 });
  service.postTransaction({
    partnerId: withdrawalPartner.id, transactionType: 'PARTNER_LOAN', amount: 25,
    paymentType: 'CASH', registerId: 'cr_main', description: 'قرض صغير',
  });
  assert.throws(() => service.updatePartner(withdrawalPartner.id, {
    name: withdrawalPartner.name,
    ownershipPercent: 0,
    capitalAmount: 0,
    isActive: false,
  }), /رصيد قائم/);
});

test('partner capital payments update paid-basis ownership and preserve payment evidence', async () => {
  const db = await boot();
  db.run("UPDATE cash_registers SET current_balance = 0 WHERE id = 'cr_main'");
  db.run('UPDATE business_partners SET is_active = 0');
  const bankGlAccount = db.query<{ id: string }>(
    "SELECT id FROM chart_of_accounts WHERE code = '1102' AND type = 'ASSET' AND is_active = 1"
  )[0];
  assert.ok(bankGlAccount);
  db.run(`
    INSERT INTO bank_accounts (id, account_name, bank_name, account_number, currency, opening_balance,
      current_balance, gl_account_id, branch_id, is_active)
    VALUES ('bank_partner_test', 'Partner Test Bank', 'Test Bank', 'PT-001', 'EGP', 10000,
      10000, ?, (SELECT branch_id FROM cash_registers WHERE id = 'cr_main'), 1)
  `, [bankGlAccount.id]);
  const service = new PartnerService();
  const first = service.createPartner({
    name: 'Paid-basis Partner One',
    ownershipPercent: 0,
    capitalAmount: 1000,
    ownershipMode: 'AUTO',
    ownershipBasis: 'PAID_CONTRIBUTIONS',
    initialPaidAmount: 500,
    initialPaymentType: 'BANK_TRANSFER',
    initialBankAccountId: 'bank_partner_test',
  });
  const second = service.createPartner({
    name: 'Paid-basis Partner Two',
    ownershipPercent: 0,
    capitalAmount: 1000,
    ownershipMode: 'AUTO',
    ownershipBasis: 'PAID_CONTRIBUTIONS',
    initialPaidAmount: 500,
    initialRegisterId: 'cr_main',
  });

  const firstAfterSecond = service.getPartnerStatement(first.id).partner;
  assert.equal(firstAfterSecond.ownershipPercent, 50);
  assert.equal(second.ownershipPercent, 50);
  assert.equal(firstAfterSecond.profitSharePercent, 50);
  assert.equal(first.capitalPaid, 500);
  assert.equal(first.remainingCapital, 500);

  service.postTransaction({
    partnerId: first.id,
    transactionType: 'CAPITAL_CONTRIBUTION',
    amount: 250,
    paymentType: 'BANK_TRANSFER',
    bankAccountId: 'bank_partner_test',
    description: 'Second capital installment',
    attachments: [{
      name: 'receipt.pdf',
      type: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,JVBERi0=',
    }],
  });

  const updatedFirst = service.getPartnerStatement(first.id).partner;
  const updatedSecond = service.getPartnerStatement(second.id).partner;
  assert.equal(updatedFirst.ownershipPercent, 60);
  assert.equal(updatedSecond.ownershipPercent, 40);
  assert.equal(updatedFirst.capitalPaid, 750);
  assert.equal(updatedFirst.remainingCapital, 250);
  const contribution = service.getPartnerStatement(first.id).transactions
    .find((transaction) => transaction.description === 'Second capital installment');
  assert.equal(contribution?.attachments[0]?.name, 'receipt.pdf');
  assert.match(contribution?.referenceNumber || '', /^PAR-\d{8}-[A-F0-9]{8}$/);
  assert.equal(db.query<{ balance: number }>(
    "SELECT current_balance AS balance FROM bank_accounts WHERE id = 'bank_partner_test'"
  )[0].balance, 10750);

  const capitalHistory = service.getPartnerCapitalHistory(first.id);
  assert.ok(capitalHistory.length > 0);
  assert.ok(db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM partner_ownership_history
    WHERE partner_id IN (?, ?)
  `, [first.id, second.id])[0].count > 0);
  assert.throws(() => db.run(
    'UPDATE partner_ownership_history SET reason = ? WHERE partner_id = ?',
    ['overwrite history', first.id]
  ), /immutable/);
  assert.throws(() => service.postTransaction({
    partnerId: first.id,
    transactionType: 'CAPITAL_CONTRIBUTION',
    amount: 251,
    paymentType: 'CASH',
    registerId: 'cr_main',
    description: 'Overcommit capital',
  }), /رأس المال المتبقي/);
  service.reverseTransaction(contribution!.id, 'إلغاء إيصال الاختبار');
  assert.equal(db.query<{ balance: number }>(
    "SELECT current_balance AS balance FROM bank_accounts WHERE id = 'bank_partner_test'"
  )[0].balance, 10500);
  assert.equal(service.getPartnerStatement(first.id).partner.remainingCapital, 500);
  assert.equal(service.getPartnerStatement(first.id).partner.ownershipPercent, 50);
  assert.equal(service.getPartnerStatement(second.id).partner.ownershipPercent, 50);
});

test('partner operations and permission catalog are independently permission guarded', async () => {
  const db = await boot();
  const service = new PartnerService();
  const permissions = PermissionService.getCatalog();
  for (const code of [
    'partners.view',
    'partners.manage',
    'partners.transactions',
    'partners.profits.distribute',
    'partners.adjust',
    'partners.reverse',
    'partners.export',
    'partners.print',
  ]) {
    assert.ok(permissions.some((permission) => permission.code === code), `${code} is configurable`);
  }
  assert.equal(db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM role_permissions
    WHERE role_code = 'ACCOUNTANT' AND permission_code IN ('partners.view', 'partners.manage', 'partners.transactions', 'partners.profits.distribute', 'partners.adjust', 'partners.reverse', 'partners.export', 'partners.print')
  `)[0].count, 8);

  const salesUser: User = {
    ...admin,
    id: 'usr_partner_sales',
    username: 'partner-sales',
    role: 'SALES',
  };
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES (?, ?, 'test', ?, 'SALES', 1)`,
    [salesUser.id, salesUser.username, salesUser.fullName]
  );
  AuthService.setCurrentUser(salesUser);
  PermissionService.invalidate(salesUser);
  assert.throws(() => service.getPartners(), /صلاحية/);

  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
});
