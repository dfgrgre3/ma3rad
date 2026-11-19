import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { FinanceExtrasService } from '../src/services/domains/finance/FinanceExtrasService.ts';
import { FinancialStatementsService } from '../src/services/domains/reports/FinancialStatementsService.ts';
import { postLedgerEntry } from '../src/database/repositories/ledger.ts';
import { localDateString } from '../src/utils/shared/date.ts';

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

async function signInWithoutDefaultPassword() {
  const manager = DatabaseManager.getInstance();
  const bcrypt = (await import('bcryptjs')).default;
  manager.run('UPDATE users SET password_hash = ? WHERE username = ?', [bcrypt.hashSync('AcctCycle2026!', 10), 'admin']);
  return AuthService.login('admin', 'AcctCycle2026!');
}

test('accounting cycle: manual posting is branch-attributed, immutable, reversible, and sourced', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const actor = await signInWithoutDefaultPassword();
  const service = new FinanceExtrasService();
  const branchId = new BranchAccessService().getCurrentBranchId(actor);
  const accounts = service.getAccounts();
  const cash = accounts.find((account) => account.code === '1101');
  const revenue = accounts.find((account) => account.code === '4101');
  assert.ok(cash && revenue, 'cash and revenue accounts are required');

  const entryId = service.createJournalEntry({
    date: localDateString(),
    description: 'TEST manual journal hardening',
    createdBy: actor.id,
    lines: [
      { accountId: cash.id, debit: 125.25, credit: 0 },
      { accountId: revenue.id, debit: 0, credit: 125.25 },
    ],
  });

  const stored = manager.query<{
    referenceType: string; referenceId: string; isPosted: number; branchId: string | null; companyId: string | null;
  }>('SELECT reference_type AS referenceType, reference_id AS referenceId, is_posted AS isPosted, branch_id AS branchId, company_id AS companyId FROM journal_entries WHERE id = ?', [entryId])[0];
  assert.ok(stored);
  assert.equal(stored.referenceType, 'MANUAL_JOURNAL');
  assert.equal(stored.isPosted, 1);
  assert.equal(stored.branchId, branchId, 'manual entries must belong to the active branch so reports include them');
  assert.ok(stored.companyId, 'manual entries must carry an owning company');

  const listed = service.getJournalEntries().find((entry) => entry.id === entryId);
  assert.equal(listed?.sourceLabel, 'قيد يدوي', 'manual entries expose their source');
  assert.throws(() => service.deleteJournalEntry(entryId), /قيد مرحّل/, 'posted entries cannot be deleted');

  const trial = service.getTrialBalance();
  const totalDebit = round2(trial.reduce((sum, row) => sum + Number(row.debit), 0));
  const totalCredit = round2(trial.reduce((sum, row) => sum + Number(row.credit), 0));
  assert.equal(totalDebit, totalCredit, 'trial balance must balance');
  assert.ok(trial.find((row) => row.code === '1101'));

  const reversalId = service.reverseJournalEntry(entryId, { reason: 'TEST reversal' });
  const reversal = manager.query<{ referenceType: string; referenceId: string; isPosted: number }>(
    'SELECT reference_type AS referenceType, reference_id AS referenceId, is_posted AS isPosted FROM journal_entries WHERE id = ?',
    [reversalId],
  )[0];
  assert.equal(reversal?.referenceType, 'MANUAL_REVERSAL');
  assert.equal(reversal?.referenceId, entryId);
  assert.throws(() => service.reverseJournalEntry(entryId), /تم عكس هذا القيد/);
  assert.throws(() => service.reverseJournalEntry(reversalId), /مرتبط بمستند تشغيلي|قيد عكسي/);

  const netCash = Number(manager.query<{ net: number }>(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS net
    FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE l.entry_id IN (?, ?) AND a.code = '1101'
  `, [entryId, reversalId])[0]?.net || 0);
  assert.equal(round2(netCash), 0, 'the reversal must neutralise the original entry');
});

test('accounting cycle: party sub-ledger statement and dated reconciliation', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const actor = await signInWithoutDefaultPassword();
  const statements = new FinancialStatementsService();
  const branchId = new BranchAccessService().getCurrentBranchId(actor);
  const companyId = manager.query<{ companyId: string }>(
    'SELECT company_id AS companyId FROM branches WHERE id = ?', [branchId],
  )[0]?.companyId;
  assert.ok(companyId);

  const customerId = 'cust_accounting_cycle_test';
  const today = localDateString();
  const openEntryId = postLedgerEntry(manager.getDatabase(), {
    date: today,
    description: 'TEST subledger opening event',
    referenceType: 'TEST_SUBLEDGER_OPEN',
    referenceId: 'test_subledger_open',
    createdBy: actor.id,
    branchId,
    lines: [
      { accountCode: '1103', debit: 50, credit: 0 },
      { accountCode: '4101', debit: 0, credit: 50 },
    ],
  });
  const collectEntryId = postLedgerEntry(manager.getDatabase(), {
    date: today,
    description: 'TEST subledger collection event',
    referenceType: 'TEST_SUBLEDGER_COLLECT',
    referenceId: 'test_subledger_collect',
    createdBy: actor.id,
    branchId,
    lines: [
      { accountCode: '1101', debit: 20, credit: 0 },
      { accountCode: '1103', debit: 0, credit: 20 },
    ],
  });
  manager.run(`INSERT OR REPLACE INTO customers (id, code, name, phone, current_balance, total_purchases)
    VALUES (?, 'CUST-ACCT-CYCLE', 'Test accounting customer', '01000000000', 13000, 0)`, [customerId]);
  manager.run(`INSERT OR REPLACE INTO finance_subledger_party_baselines
    (company_id, party_type, party_id, balance, captured_at) VALUES (?, 'CUSTOMER', ?, 10000, ?)`,
    [companyId, customerId, new Date().toISOString()]);
  manager.run(`INSERT OR REPLACE INTO finance_subledger_events
    (id, journal_entry_id, company_id, party_type, party_id, account_code, amount, effective_date, reference_type, reference_id)
    VALUES ('sble_test_open', ?, ?, 'CUSTOMER', ?, '1103', 5000, ?, 'SALES_INVOICE', 'inv_test_open')`,
    [openEntryId, companyId, customerId, today]);
  manager.run(`INSERT OR REPLACE INTO finance_subledger_events
    (id, journal_entry_id, company_id, party_type, party_id, account_code, amount, effective_date, reference_type, reference_id)
    VALUES ('sble_test_collect', ?, ?, 'CUSTOMER', ?, '1103', -2000, ?, 'CUSTOMER_PAYMENT', 'pay_test_collect')`,
    [collectEntryId, companyId, customerId, today]);

  const options = await statements.getSubledgerParties('CUSTOMER');
  assert.ok(options.some((option) => option.id === customerId), 'party is exposed in the sub-ledger selector');

  const statement = await statements.getPartyStatement('CUSTOMER', customerId, today, today);
  assert.equal(statement.opening, 100);
  assert.equal(statement.closing, 130);
  assert.equal(statement.lines.length, 2);
  assert.equal(statement.lines[0].debit, 50);
  assert.equal(statement.lines[1].credit, 20);
  assert.equal(statement.masterStatus, 'MATCH', 'as-of-today statement reconciles to the customer master balance');

  manager.run('UPDATE customers SET current_balance = 13100 WHERE id = ?', [customerId]);
  assert.equal((await statements.getPartyStatement('CUSTOMER', customerId, today, today)).masterStatus, 'DIFFERENCE');
  manager.run('DELETE FROM customers WHERE id = ?', [customerId]);
  manager.run('DELETE FROM finance_subledger_events WHERE id IN (?, ?)', ['sble_test_open', 'sble_test_collect']);
  manager.run('DELETE FROM finance_subledger_party_baselines WHERE company_id = ? AND party_id = ?', [companyId, customerId]);
  manager.executeTransaction(() => {
    for (const entryId of [openEntryId, collectEntryId]) {
      const lines = manager.query<{ accountId: string; net: number }>(
        'SELECT account_id AS accountId, debit - credit AS net FROM journal_entry_lines WHERE entry_id = ?', [entryId],
      );
      for (const line of lines) {
        manager.run('UPDATE chart_of_accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?', [line.net, line.accountId]);
      }
      manager.run('DELETE FROM journal_entry_lines WHERE entry_id = ?', [entryId]);
      manager.run('DELETE FROM journal_entries WHERE id = ?', [entryId]);
    }
  });
});
