import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { postLedgerEntry } from '../src/database/repositories/ledger.ts';
import { ConsistencyAuditService } from '../src/services/domains/finance/ConsistencyAuditService.ts';

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const user = AuthService.login('admin', 'admin123');
  user.mustChangePassword = false;
  user.securityKeySetupRequired = false;
  AuthService.setCurrentUser(user);
  return manager;
}

function rebuildBalances(db: DatabaseManager): void {
  db.run(`UPDATE chart_of_accounts SET balance = COALESCE((
    SELECT SUM(l.debit - l.credit)
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    WHERE l.account_id = chart_of_accounts.id AND e.is_posted = 1
  ), 0)`);
}

test('GL_VS_JOURNAL audit detects chart_of_accounts balance drift and passes after rebuild', async () => {
  const db = await boot();
  const actor = AuthService.requireAuth();
  const today = new Date().toISOString().slice(0, 10);

  // A real balanced posting moves both the journal and the cached balance.
  postLedgerEntry(db.getDatabase(), {
    date: today,
    description: 'GL drift audit seed entry',
    referenceType: 'TEST_GL_DRIFT',
    referenceId: 'gl_drift_seed',
    createdBy: actor.id,
    lines: [
      { accountCode: '1101', debit: 100, credit: 0 },
      { accountCode: '4101', debit: 0, credit: 100 },
    ],
  });

  const before = new ConsistencyAuditService().runAudit({ runType: 'GL_VS_JOURNAL' });
  assert.equal(before.status, 'PASSED', 'fresh posted entry must not drift');

  // Simulate incremental-update drift on the cached balance column.
  db.run(`UPDATE chart_of_accounts SET balance = balance + 25 WHERE code = '1101'`);

  const drifted = new ConsistencyAuditService().runAudit({ runType: 'GL_VS_JOURNAL' });
  assert.equal(drifted.status, 'DISCREPANCY');
  const check = drifted.summary['GL_VS_JOURNAL'];
  assert.equal(check.status, 'DISCREPANCY');
  const hit = check.discrepancies.find((d) => d.key === '1101');
  assert.ok(hit, 'expected a discrepancy row for account 1101');
  assert.equal(Number(hit!.variance), 25);
  assert.equal(Number(hit!.expected), 100, 'journal-derived balance stays authoritative');
  assert.equal(Number(hit!.actual), 125, 'cached balance carries the drift');

  // The audit run itself is recorded for traceability.
  const run = db.query<{ status: string }>(
    `SELECT status FROM reconciliation_runs ORDER BY created_at DESC, rowid DESC LIMIT 1`
  )[0];
  assert.equal(run.status, 'DISCREPANCY');

  // Rebuilding balances from journal lines (migration 042 semantics) clears it.
  rebuildBalances(db);
  const repaired = new ConsistencyAuditService().runAudit({ runType: 'GL_VS_JOURNAL' });
  assert.equal(repaired.status, 'PASSED');
});
