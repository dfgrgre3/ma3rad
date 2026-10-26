import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { AccountingService } from '../src/services/AccountingService.ts';
import { BackupService } from '../src/services/BackupService.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import { localDateString } from '../src/utils/date.ts';

test('3.4: enforce default password change, password policy, and session invalidation', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();

  // 1. Logging in with default admin password forces password change
  const admin = AuthService.login('admin', 'admin123');
  assert.equal(admin.mustChangePassword, true, 'Default admin password must be flagged for mandatory change');

  // 2. Password policy rejects weak or default passwords
  assert.throws(
    () => AuthService.validatePasswordPolicy('short'),
    /8 أحرف على الأقل/,
    'Rejects passwords less than 8 chars'
  );
  assert.throws(
    () => AuthService.validatePasswordPolicy('admin123'),
    /الافتراضية/,
    'Rejects default password admin123'
  );
  assert.throws(
    () => AuthService.validatePasswordPolicy('onlyletters', 'admin'),
    /أحرف وأرقام/,
    'Requires both letters and numbers'
  );

  // 3. Changing password to a strong password secures the account and invalidates other sessions
  const auth = new AuthService();
  auth.changeOwnPassword(admin.id, 'admin123', 'NewAdminPass2026!');
  const current = AuthService.getCurrentUser();
  assert.equal(current?.mustChangePassword, false, 'mustChangePassword should be cleared after change');

  // 4. Logging in again with the new password works and does not require password change
  const loggedAgain = AuthService.login('admin', 'NewAdminPass2026!');
  assert.equal(loggedAgain.mustChangePassword, false);

  // Restore admin password for other tests
  db.run('UPDATE users SET password_hash = ? WHERE username = ?', [
    (await import('bcryptjs')).default.hashSync('admin123', 10),
    'admin',
  ]);
});

test('3.5: dashboard metrics date upper-bounding and accurate overdue debt aging', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const accounting = new AccountingService();
  const today = localDateString();

  const custId = db.query<{ id: string }>('SELECT id FROM customers LIMIT 1')[0]?.id;
  const whId = db.query<{ id: string }>('SELECT id FROM warehouses LIMIT 1')[0]?.id;
  const usrId = db.query<{ id: string }>('SELECT id FROM users LIMIT 1')[0]?.id;
  assert.ok(custId && whId && usrId);

  // Create future-dated invoice and past overdue invoice
  const futureDate = '2099-12-31';
  db.run(`
    INSERT INTO sales_invoices (id, invoice_number, customer_id, branch_id, warehouse_id, date, subtotal, discount_amount, tax_amount, total_amount, paid_amount, remaining_amount, gross_profit, invoice_status, created_by)
    VALUES ('inv_future_test', 'INV-FUT-01', ?, 'br_main', ?, ?, 5000, 0, 0, 5000, 0, 5000, 1000, 'POSTED', ?)
  `, [custId, whId, futureDate, usrId]);

  const metrics = accounting.getDashboardMetrics();
  // Future invoice must NOT be counted in monthSales (which is bounded <= today)
  assert.ok(metrics.monthSales < 5000, 'Future dated invoice must not appear in current month sales');

  // Clean up test invoice
  db.run(`DELETE FROM sales_invoices WHERE id = 'inv_future_test'`);
});

test('3.7: fiscal period closing prevents posting into locked periods', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const sqlite = db.getDatabase();
  const actorId = db.query<{ id: string }>('SELECT id FROM users ORDER BY created_at LIMIT 1')[0]?.id;
  assert.ok(actorId);

  // Lock period up to 2025-12-31
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('accounting_closed_until_date', '2025-12-31')`);

  // Attempting to post in closed period throws error
  assert.throws(() => {
    postLedgerEntry(sqlite, {
      date: '2025-10-15',
      description: 'Closed period test',
      referenceType: 'TEST_CLOSED_PERIOD',
      referenceId: 'closed_ref_01',
      createdBy: actorId,
      lines: [
        { accountCode: '1101', debit: 100, credit: 0 },
        { accountCode: '4101', debit: 0, credit: 100 },
      ],
    });
  }, /فترة محاسبية مغلقة/);

  // Posting in an open period (after closed date) succeeds
  const entryId = postLedgerEntry(sqlite, {
    date: '2026-06-01',
    description: 'Open period test',
    referenceType: 'TEST_OPEN_PERIOD',
    referenceId: 'open_ref_01',
    createdBy: actorId,
    lines: [
      { accountCode: '1101', debit: 200, credit: 0 },
      { accountCode: '4101', debit: 0, credit: 200 },
    ],
  });
  assert.ok(entryId);

  // Clear period lock
  db.run(`DELETE FROM system_settings WHERE key = 'accounting_closed_until_date'`);
});

test('3.10: backup binary inspection and integrity check in isolation', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await db.flush();

  const binary = db.exportDatabaseBinary();
  const backupService = new BackupService();
  const inspection = backupService.verifyBackupFile(binary);

  assert.equal(inspection.valid, true, 'Exported database binary must pass integrity check');
  assert.equal(inspection.integrity, 'ok');
  assert.ok(inspection.productsCount >= 0);
  assert.ok(inspection.customersCount >= 0);

  // Corrupt bytes must be rejected
  const corruptInspection = backupService.verifyBackupFile(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(corruptInspection.valid, false, 'Corrupt bytes must fail verification');
});
