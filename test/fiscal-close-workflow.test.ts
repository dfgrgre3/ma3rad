import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { FinanceEnterpriseService } from '../src/services/domains/finance/FinanceEnterpriseService.ts';
import { postLedgerEntry } from '../src/database/repositories/ledger.ts';

function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return DatabaseManager.getInstance().query<T>(sql, params)[0];
}

test('fiscal close workflow: years, periods, checks, tasks, adjustments, openings, audit', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new FinanceEnterpriseService();

  // -----------------------------------------------------------------
  // 1. Fiscal year creation: custom periods + overlap protection
  // -----------------------------------------------------------------
  const yearId = service.createFiscalYear({
    yearCode: 'FY2049WF',
    name: 'سنة اختبار سير عمل الإقفال',
    startDate: '2049-01-01',
    endDate: '2049-12-31',
    periods: [
      { name: 'النصف الأول 2049', startDate: '2049-01-01', endDate: '2049-06-30', type: 'SEMI_ANNUAL' },
      { name: 'النصف الثاني 2049', startDate: '2049-07-01', endDate: '2049-12-31', type: 'SEMI_ANNUAL' },
    ],
  });

  const periods = service.getFiscalPeriods(yearId);
  assert.equal(periods.length, 2, 'custom fiscal periods must be created');
  assert.equal(periods[0].periodNumber, 1);
  assert.equal(periods[1].periodNumber, 2);
  assert.ok(periods.every((period) => period.status === 'OPEN'));

  // Overlapping year for the same company must be rejected.
  assert.throws(() => service.createFiscalYear({
    yearCode: 'FY2049OV',
    name: 'سنة متداخلة',
    startDate: '2049-06-01',
    endDate: '2050-05-31',
  }), /متداخلة/);

  // Overlapping custom periods inside the new year must be rejected.
  assert.throws(() => service.createFiscalYear({
    yearCode: 'FY2049BADPERIODS',
    name: 'سنة بفترات متداخلة',
    startDate: '2049-01-01',
    endDate: '2049-12-31',
    periods: [
      { name: 'A', startDate: '2049-01-01', endDate: '2049-08-31' },
      { name: 'B', startDate: '2049-08-01', endDate: '2049-12-31' },
    ],
  }), /متداخلة/);

  const h1 = periods[0];
  const h2 = periods[1];

  // -----------------------------------------------------------------
  // 2. Automated close tasks (defaults, CRUD, completion trail)
  // -----------------------------------------------------------------
  const generated = service.generateDefaultPeriodTasks(h1.id);
  assert.ok(generated > 0, 'default close tasks must be generated');
  assert.throws(() => service.generateDefaultPeriodTasks(h1.id), /بالفعل/);

  const tasks = service.getPeriodCloseTasks(h1.id);
  assert.equal(tasks.length, generated);
  // CamelCase projection: task rows must expose assignee/due-date fields.
  assert.ok('assigneeUserId' in tasks[0]);
  assert.ok('dueDate' in tasks[0]);

  const manualTaskId = service.createPeriodCloseTask({
    fiscalPeriodId: h1.id,
    title: 'مراجعة كشف البنك',
    dueDate: '2049-07-05',
    priority: 'HIGH',
  });
  let manualTask = service.getPeriodCloseTasks(h1.id).find((task) => task.id === manualTaskId);
  assert.ok(manualTask, 'manual task must be listed');
  assert.equal(manualTask!.dueDate, '2049-07-05');
  assert.equal(manualTask!.status, 'PENDING');

  service.updatePeriodCloseTask(manualTaskId, { status: 'COMPLETED' });
  manualTask = service.getPeriodCloseTasks(h1.id).find((task) => task.id === manualTaskId);
  assert.equal(manualTask!.status, 'COMPLETED');
  assert.ok(manualTask!.completedAt, 'completing a task must stamp completedAt');
  assert.ok(manualTask!.completedBy, 'completing a task must stamp completedBy');
  // The assignee and due date must survive a status-only patch (camelCase reads).
  assert.equal(manualTask!.dueDate, '2049-07-05');

  const disposableTaskId = service.createPeriodCloseTask({
    fiscalPeriodId: h1.id,
    title: 'مهمة قابلة للحذف',
  });
  service.deletePeriodCloseTask(disposableTaskId);
  assert.equal(service.getPeriodCloseTasks(h1.id).some((task) => task.id === disposableTaskId), false);

  // -----------------------------------------------------------------
  // 3. Period adjustment lifecycle: draft -> approval -> posting
  // -----------------------------------------------------------------
  const adjustmentId = service.createPeriodAdjustment({
    fiscalPeriodId: h1.id,
    adjustmentType: 'OTHER',
    description: 'استحقاق مصروفات تشغيلية',
    amount: 1500,
    debitAccountCode: '5201',
    creditAccountCode: '1101',
  });

  let adjustment = service.getPeriodAdjustments(h1.id).find((row) => row.id === adjustmentId);
  assert.equal(adjustment!.status, 'DRAFT');
  assert.equal(adjustment!.debitAccountCode, '5201');
  assert.equal(adjustment!.creditAccountCode, '1101');

  service.submitPeriodAdjustment(adjustmentId);
  adjustment = service.getPeriodAdjustments(h1.id).find((row) => row.id === adjustmentId);
  assert.equal(adjustment!.status, 'PENDING_APPROVAL');

  // The creator may not approve their own adjustment (separation of duties).
  assert.throws(() => service.approvePeriodAdjustment(adjustmentId), /فصل المهام/);

  // A second authorised user approves and posts it.
  const secondPassword = 'Closer#2049Aa';
  AuthService.provisionCentralAccount({
    username: 'closer2',
    password: secondPassword,
    fullName: 'مدقق الإقفال الثاني',
    role: 'admin',
  });
  AuthService.login('closer2', secondPassword);

  service.approvePeriodAdjustment(adjustmentId);
  adjustment = service.getPeriodAdjustments(h1.id).find((row) => row.id === adjustmentId);
  assert.equal(adjustment!.status, 'APPROVED');

  const entryId = service.postPeriodAdjustment(adjustmentId);
  assert.ok(entryId, 'posting an adjustment must create a journal entry');
  adjustment = service.getPeriodAdjustments(h1.id).find((row) => row.id === adjustmentId);
  assert.equal(adjustment!.status, 'POSTED');
  assert.equal(adjustment!.journalEntryId, entryId);

  const postedEntry = queryOne<{ debit: number; credit: number; isPosted: number }>(
    `SELECT total_debit AS debit, total_credit AS credit, is_posted AS isPosted
     FROM journal_entries WHERE id = ?`,
    [entryId],
  );
  assert.ok(postedEntry, 'the posted adjustment entry must exist');
  assert.equal(Number(postedEntry!.isPosted), 1);
  assert.ok(Math.abs(Number(postedEntry!.debit) - Number(postedEntry!.credit)) < 0.01, 'adjustment entry must balance');

  // -----------------------------------------------------------------
  // 4. Automated readiness checks: only FAIL blocks, WARNING passes
  // -----------------------------------------------------------------
  const checks = service.getPeriodCloseChecks(h1.id);
  assert.ok(checks.length > 0, 'period checks must be produced');
  for (const check of checks) {
    assert.equal(check.passed, check.status !== 'FAIL', `passed flag must mirror status for ${check.id}`);
    assert.ok(['PASS', 'WARNING', 'FAIL', 'NOT_APPLICABLE'].includes(check.status));
  }
  const blocking = checks.filter((check) => check.status === 'FAIL');
  assert.deepEqual(
    blocking.map((check) => `${check.id}:${check.issues.join('|')}`),
    [],
    'an empty, fully-posted period must not have blocking checks',
  );

  const summary = service.getFiscalYearSummary(yearId);
  assert.equal(summary.year?.id, yearId);
  assert.equal(summary.periods.length, 2);
  assert.equal(summary.openPeriods, 2);
  assert.equal(
    summary.blockingChecks,
    summary.readiness.filter((check) => check.status === 'FAIL').length,
    'summary must count FAIL checks only',
  );
  const yearPeriodsCheck = summary.readiness.find((check) => check.id === 'year_periods');
  assert.equal(yearPeriodsCheck?.status, 'FAIL', 'year readiness must fail while periods remain open');

  // -----------------------------------------------------------------
  // 5. Period workflow: OPEN -> IN_REVIEW -> PENDING_APPROVAL -> CLOSED -> LOCKED
  // -----------------------------------------------------------------
  assert.throws(() => service.lockPeriod(h1.id), /قبل إقفالها/);
  assert.equal(service.getPeriodWorkflow(h1.id).workflowState, 'OPEN');

  service.startPeriodReview(h1.id);
  assert.equal(service.getPeriodWorkflow(h1.id).workflowState, 'IN_REVIEW');

  service.submitPeriodForApproval(h1.id);
  assert.equal(service.getPeriodWorkflow(h1.id).workflowState, 'PENDING_APPROVAL');

  service.approveAndClosePeriod(h1.id, 'إقفال معتمد لاختبار سير العمل');
  const closedWorkflow = service.getPeriodWorkflow(h1.id);
  assert.equal(closedWorkflow.workflowState, 'CLOSED');
  assert.equal(closedWorkflow.period.status, 'CLOSED');
  assert.equal(
    service.getPeriodWorkflow(h2.id).workflowState,
    'OPEN',
    'closing one period must not affect sibling periods',
  );

  const report = service.getPeriodCloseReport(h1.id);
  assert.ok(report, 'a close snapshot report must be persisted after closing');
  assert.equal(report!.fiscalPeriodId, h1.id);

  // A closed period must reject new operational entries.
  assert.throws(() => postLedgerEntry(db.getDatabase(), {
    date: '2049-03-15',
    description: 'ترحيل بعد الإقفال يجب أن يُرفض',
    referenceType: 'TEST_CLOSED_PERIOD',
    referenceId: 'test_closed_period_2049',
    createdBy: AuthService.requireAuth().id,
    lines: [
      { accountCode: '1101', debit: 10, credit: 0 },
      { accountCode: '3101', debit: 0, credit: 10 },
    ],
  }), /مقفلة/);

  assert.throws(() => service.approveAndClosePeriod(h1.id), /مقفلة بالفعل/);

  service.lockPeriod(h1.id);
  assert.equal(service.getPeriodWorkflow(h1.id).workflowState, 'LOCKED');

  // Reopening a locked period is not allowed through the workflow.
  assert.throws(() => service.lockPeriod(h1.id), /قبل إقفالها/);

  // -----------------------------------------------------------------
  // 6. Audit trail and year-end opening balances
  // -----------------------------------------------------------------
  const audit = service.getFiscalCloseAudit('PERIOD', h1.id);
  assert.ok(audit.length > 0, 'period workflow actions must be audited');
  assert.ok(audit.some((row) => row.action === 'APPROVE_AND_CLOSE'));
  assert.ok(audit.some((row) => row.action === 'LOCK_PERIOD'));

  const adjustmentAudit = service.getFiscalCloseAudit('ADJUSTMENT', adjustmentId);
  assert.ok(adjustmentAudit.some((row) => row.action === 'APPROVE_ADJUSTMENT'));
  assert.ok(adjustmentAudit.some((row) => row.action === 'POST_ADJUSTMENT'));

  // Seed a historical balance in the source year so carry-forward produces rows.
  postLedgerEntry(db.getDatabase(), {
    date: '2026-06-01',
    description: 'رصيد تاريخي لاختبار الأرصدة الافتتاحية',
    referenceType: 'TEST_OPENING_SOURCE',
    referenceId: 'test_opening_source_2026',
    createdBy: AuthService.requireAuth().id,
    lines: [
      { accountCode: '1101', debit: 100, credit: 0 },
      { accountCode: '3101', debit: 0, credit: 100 },
    ],
  });

  const openingCount = service.generateFiscalYearOpenings(yearId);
  assert.ok(openingCount > 0, 'carry-forward must produce opening balance rows');
  const openings = service.getFiscalYearOpenings(yearId);
  assert.equal(openings.length, openingCount);
  assert.ok(openings.some((row) => row.accountCode === '1101'));
  assert.throws(() => service.generateFiscalYearOpenings(yearId), /موجودة بالفعل/);

  // Year readiness stays available after closing.
  const readiness = service.getFiscalYearReadiness(yearId);
  assert.ok(readiness.length > 0);
  assert.ok(readiness.every((check) => check.status !== 'FAIL' || check.issueCount > 0));
});
