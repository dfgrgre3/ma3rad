import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { CashierService } from '../src/services/CashierService.ts';
import { PartnerService } from '../src/services/PartnerService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import type { User } from '../src/types/identity.ts';

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

test('partner operations and permission catalog are independently permission guarded', async () => {
  const db = await boot();
  const service = new PartnerService();
  const permissions = PermissionService.getCatalog();
  for (const code of [
    'partners.view',
    'partners.manage',
    'partners.transactions',
    'partners.profits.distribute',
    'partners.print',
  ]) {
    assert.ok(permissions.some((permission) => permission.code === code), `${code} is configurable`);
  }
  assert.equal(db.query<{ count: number }>(`
    SELECT COUNT(*) AS count FROM role_permissions
    WHERE role_code = 'ACCOUNTANT' AND permission_code IN ('partners.view', 'partners.manage', 'partners.transactions', 'partners.profits.distribute', 'partners.print')
  `)[0].count, 5);

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
