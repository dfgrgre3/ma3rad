import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { MasterDataSyncService } from '../src/sync/MasterDataSyncService.ts';
import { SyncPolicyService } from '../src/sync/SyncPolicyService.ts';
import { PendingChangeService } from '../src/sync/PendingChangeService.ts';
import { SyncChangeApprovalService } from '../src/sync/SyncChangeApprovalService.ts';
import { AccountLinkService } from '../src/sync/AccountLinkService.ts';
import { OutboxRepository } from '../src/sync/OutboxRepository.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_sync_gate_admin',
  username: 'sync-gate-admin',
  fullName: 'Sync Gate Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const manager: User = {
  id: 'usr_sync_gate_manager',
  username: 'sync-gate-manager',
  fullName: 'Sync Gate Manager',
  role: 'MANAGER',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_sync_gate_admin', 'sync-gate-admin', 'test', 'Sync Gate Admin', 'ADMIN', 1),
            ('usr_sync_gate_manager', 'sync-gate-manager', 'test', 'Sync Gate Manager', 'MANAGER', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  return db;
}

function as(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

test('sync approvals: branch edits are staged, approved into the outbox, and rejected with notes', async () => {
  const db = await boot();
  const tenantId = `tenant-${uuidv4()}`;
  const branchId = `branch-${uuidv4()}`;
  const deviceId = `device-${uuidv4()}`;
  MasterDataSyncService.configure({ tenantId, branchId, deviceId, canManagePolicies: true });

  const policies = new SyncPolicyService(db);
  policies.update({ entityType: 'category', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' });

  const pending = new PendingChangeService(db);
  const approvals = new SyncChangeApprovalService(db);
  const outbox = new OutboxRepository(db);
  const master = new MasterDataSyncService(db);

  // Policy: every sub-account edit needs approval while this test runs.
  as(admin);
  pending.setMode('ALWAYS');
  assert.equal(pending.getMode(), 'ALWAYS');

  // A manager (non-owner) creating a category is staged, not published.
  as(manager);
  const firstCategory = `cat-stage-${uuidv4()}`;
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [firstCategory, 'Staged category']);
  const pendingBefore = pending.countPending();
  const outboxBefore = outbox.countPending();
  let stagedId = '';
  db.executeTransaction((transaction) => {
    stagedId = master.capture(transaction, 'category', firstCategory, 'CREATE') ?? '';
  });
  assert.match(stagedId, /^spc_/, 'the edit should be staged for approval');
  assert.equal(pending.countPending(), pendingBefore + 1);
  assert.equal(outbox.countPending(), outboxBefore, 'nothing reaches the outbox before approval');

  // Repeated edits to the same entity by the same user update the existing request.
  db.run('UPDATE categories SET name = ? WHERE id = ?', ['Staged category v2', firstCategory]);
  db.executeTransaction((transaction) => {
    master.capture(transaction, 'category', firstCategory, 'UPDATE');
  });
  assert.equal(pending.countPending(), pendingBefore + 1, 'duplicate pending requests are collapsed');

  // Sending a note reaches the requester and records it on the request.
  as(admin);
  const sent = approvals.sendNotes(stagedId, 'راجع الاسم قبل الاعتماد', [
    { userId: manager.id, label: manager.fullName },
  ]);
  assert.equal(sent, 1);
  const noteNotification = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'SYNC_APPROVAL_NOTE'`,
    [manager.id]
  )[0];
  assert.ok(Number(noteNotification.count) >= 1, 'the requester should be notified of the note');

  // Approving publishes exactly one outbox event for the entity.
  const approved = approvals.decide(stagedId, true, { notes: 'تمت المراجعة' });
  assert.equal(approved.status, 'APPLIED');
  assert.equal(approved.applied, true);
  assert.equal(outbox.countPending(), outboxBefore + 1, 'approval writes the change to the outbox');
  const status = db.query<{ status: string }>(
    'SELECT status FROM sync_pending_changes WHERE id = ?', [stagedId]
  )[0];
  assert.equal(status.status, 'APPLIED');

  // Rejecting a second change keeps data local and notifies the requester.
  as(manager);
  const secondCategory = `cat-reject-${uuidv4()}`;
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [secondCategory, 'Rejected category']);
  let rejectId = '';
  db.executeTransaction((transaction) => {
    rejectId = master.capture(transaction, 'category', secondCategory, 'CREATE') ?? '';
  });
  const outboxAfterSecondStage = outbox.countPending();
  as(admin);
  const rejected = approvals.decide(rejectId, false, { notes: 'غير مطلوب حاليًا' });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.applied, false);
  assert.equal(outbox.countPending(), outboxAfterSecondStage, 'a rejection never publishes');
  const rejection = db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'SYNC_APPROVAL'`,
    [manager.id]
  )[0];
  assert.ok(Number(rejection.count) >= 1, 'the requester should be notified of the rejection');

  // The owner is never gated.
  const ownerCategory = `cat-owner-${uuidv4()}`;
  db.run('INSERT INTO categories (id, name) VALUES (?, ?)', [ownerCategory, 'Owner category']);
  const ownerOutboxBefore = outbox.countPending();
  db.executeTransaction((transaction) => {
    master.capture(transaction, 'category', ownerCategory, 'CREATE');
  });
  assert.equal(outbox.countPending(), ownerOutboxBefore + 1, 'owner edits bypass the approval gate');

  // A link explicitly marked as "no approval" bypasses the gate even in ALWAYS mode.
  const linkService = new AccountLinkService(db);
  const issued = linkService.issue({
    companyName: 'فرع بدون اعتماد',
    password: 'secret-999',
    deviceId,
    requiresApproval: false,
  });
  linkService.linkWithCode({ code: String(issued.code), password: 'secret-999', deviceId });
  as(manager);
  assert.equal(pending.isApprovalRequired(), false, 'per-link opt-out overrides the ALWAYS policy');

  as(admin);
  pending.setMode('AUTO');
  MasterDataSyncService.configure(null);
});

test('account links: code or API token plus password activates a link and revoking blocks it', async () => {
  const db = await boot();
  as(admin);
  const service = new AccountLinkService(db);

  const codeIssue = service.issue({
    companyName: 'شركة الاختبار بالكود',
    password: 'secret-123',
    requiresApproval: true,
    permissions: ['ui.sales.view', 'ui.inventory.view'],
  });
  assert.match(String(codeIssue.code), /^LK-/);
  assert.equal(codeIssue.apiToken, null);
  const pendingLink = service.get(codeIssue.id);
  assert.equal(pendingLink?.status, 'PENDING');
  assert.deepEqual(service.getPermissions(codeIssue.id).sort(), ['ui.inventory.view', 'ui.sales.view']);

  // Wrong password is rejected.
  assert.throws(
    () => service.linkWithCode({ code: String(codeIssue.code), password: 'wrong-pass' }),
    /كلمة السر غير صحيحة/
  );

  const activated = service.linkWithCode({ code: String(codeIssue.code), password: 'secret-123', deviceId: 'dev-linked-1' });
  assert.equal(activated.status, 'ACTIVE');
  assert.equal(activated.deviceId, 'dev-linked-1');

  // API token variant.
  const tokenIssue = service.issue({
    companyName: 'شركة الاختبار بالمفتاح',
    password: 'secret-456',
    useApiToken: true,
    requiresApproval: false,
  });
  assert.match(String(tokenIssue.apiToken), /^lkn_/);
  assert.equal(tokenIssue.code, null);
  const tokenLink = service.linkWithApiToken({ apiToken: String(tokenIssue.apiToken), password: 'secret-456' });
  assert.equal(tokenLink.status, 'ACTIVE');
  assert.equal(tokenLink.requiresApproval, false);

  // Revoking prevents further activation.
  service.revoke(codeIssue.id);
  assert.equal(service.get(codeIssue.id)?.status, 'REVOKED');
  assert.throws(
    () => service.linkWithCode({ code: String(codeIssue.code), password: 'secret-123' }),
    /تم إلغاء هذا الربط/
  );

  const remaining = service.list();
  assert.ok(remaining.some((link) => link.id === tokenIssue.id && link.status === 'ACTIVE'));
});
