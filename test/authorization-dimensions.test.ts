import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthorizationService } from '../src/services/domains/auth/authorization/AuthorizationService.ts';
import { PermissionChecker } from '../src/services/domains/auth/permissions/permissionChecker.ts';

const ROLE = 'TEST_AUTH_DIMS';
const USER_ID = 'usr_auth_dims_test';

function setup() {
  const db = DatabaseManager.getInstance();
  db.run('INSERT OR IGNORE INTO roles (id, code, name) VALUES (?, ?, ?)', [`role_${ROLE.toLowerCase()}`, ROLE, 'اختبار أبعاد الصلاحيات']);
  for (const code of ['sales.create', 'sales.pos.view', 'sales.view']) {
    db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [ROLE, code]);
  }
  db.run(
    'INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [USER_ID, USER_ID, 'test-only', USER_ID, ROLE]
  );
  PermissionChecker.invalidate();
  return {
    id: USER_ID,
    username: USER_ID,
    fullName: USER_ID,
    role: ROLE,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  } as any;
}

function cleanup() {
  const db = DatabaseManager.getInstance();
  db.run(`DELETE FROM approval_requests WHERE requested_by = ? AND reference_type = 'AUTH_AMOUNT_LIMIT'`, [USER_ID]);
  db.run('DELETE FROM users WHERE id = ?', [USER_ID]);
  db.run('DELETE FROM role_permissions WHERE role_code = ?', [ROLE]);
  db.run('DELETE FROM roles WHERE code = ?', [ROLE]);
  db.run('DELETE FROM permission_amount_limits WHERE scope_id IN (?, ?)', [ROLE, USER_ID]);
  PermissionChecker.invalidate();
}

test('amount dimension: DENY limit blocks oversized operations only', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const user = setup();
  try {
    db.run(
      `INSERT INTO permission_amount_limits (id, permission_code, scope_type, scope_id, max_amount, on_exceed)
       VALUES ('lim_test_deny', 'sales.create', 'ROLE', ?, 10000, 'DENY')`,
      [ROLE]
    );
    const small = AuthorizationService.evaluate(user, 'sales.create', { amount: 50, operation: 'sales.create' });
    assert.equal(small.allowed, true);
    const big = AuthorizationService.evaluate(user, 'sales.create', { amount: 500, operation: 'sales.create' });
    assert.equal(big.allowed, false);
    assert.equal(big.allowed === false && big.dimension, 'amount');
  } finally {
    cleanup();
  }
});

test('amount dimension: REQUIRE_APPROVAL creates a pending approval request', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const user = setup();
  try {
    db.run(
      `INSERT INTO permission_amount_limits (id, permission_code, scope_type, scope_id, max_amount, on_exceed)
       VALUES ('lim_test_approval', 'sales.create', 'ROLE', ?, 10000, 'REQUIRE_APPROVAL')`,
      [ROLE]
    );
    const decision = AuthorizationService.evaluate(user, 'sales.create', { amount: 500, operation: 'sales.create', branchId: null });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.requiresApproval, true);
    assert.ok(decision.approvalRequestId, 'expected an approval request id');
    const row = db.query<{ status: string; request_type: string }>(
      'SELECT status, request_type FROM approval_requests WHERE id = ?',
      [decision.approvalRequestId]
    )[0];
    assert.equal(row?.status, 'PENDING');
    assert.equal(row?.request_type, 'OTHER');
    // إعادة التقييم بنفس العملية تعيد استخدام الطلب المعلق بدل تكراره.
    const again = AuthorizationService.evaluate(user, 'sales.create', { amount: 700, operation: 'sales.create' });
    assert.equal(again.allowed, false);
    if (!again.allowed) assert.equal(again.approvalRequestId, decision.approvalRequestId);
  } finally {
    cleanup();
  }
});

test('amount dimension: approved request permits once, then is consumed', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const user = setup();
  try {
    db.run(
      `INSERT INTO permission_amount_limits (id, permission_code, scope_type, scope_id, max_amount, on_exceed)
       VALUES ('lim_test_consume', 'sales.create', 'ROLE', ?, 10000, 'REQUIRE_APPROVAL')`,
      [ROLE]
    );
    const first = AuthorizationService.evaluate(user, 'sales.create', { amount: 500, operation: 'sales.create' });
    assert.equal(first.allowed, false);
    if (first.allowed) return;
    const requestId = first.approvalRequestId!;
    // محاكاة اعتماد المدير — req_type يبقى AUTH_AMOUNT_LIMIT كـreference_type.
    db.run(
      `UPDATE approval_requests SET status = 'APPROVED', decided_by = ?, decided_at = ? WHERE id = ?`,
      [USER_ID, new Date().toISOString(), requestId]
    );
    // إعادة المحاولة بنفس العملية → مسموح ويُستهلك الاعتماد.
    const retry = AuthorizationService.evaluate(user, 'sales.create', { amount: 500, operation: 'sales.create' });
    assert.equal(retry.allowed, true);
    const consumed = db.query<{ reference_id: string | null }>(
      'SELECT reference_id FROM approval_requests WHERE id = ?', [requestId]
    )[0];
    assert.ok(consumed?.reference_id, 'expected approval to be consumed');
    // محاولة ثالثة بنفس المبلغ → لا يوجد اعتماد مستهلك → طلب جديد معلق.
    const third = AuthorizationService.evaluate(user, 'sales.create', { amount: 500, operation: 'sales.create' });
    assert.equal(third.allowed, false);
    if (!third.allowed) {
      assert.equal(third.requiresApproval, true);
      assert.notEqual(third.approvalRequestId, requestId);
    }
  } finally {
    cleanup();
  }
});

test('screen dimension: route rule + page view enforced together', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  // دور يملك sales.pos.view فقط — يفتح /pos لكن ليس /sales (يتطلب sales.view).
  const SCREEN_ROLE = 'TEST_AUTH_SCREEN';
  const SCREEN_USER = 'usr_auth_screen_test';
  db.run('INSERT OR IGNORE INTO roles (id, code, name) VALUES (?, ?, ?)', [`role_${SCREEN_ROLE.toLowerCase()}`, SCREEN_ROLE, 'اختبار بُعد الشاشة']);
  db.run('INSERT OR IGNORE INTO role_permissions (role_code, permission_code) VALUES (?, ?)', [SCREEN_ROLE, 'sales.pos.view']);
  db.run(
    'INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [SCREEN_USER, SCREEN_USER, 'test-only', SCREEN_USER, SCREEN_ROLE]
  );
  PermissionChecker.invalidate();
  const user = {
    id: SCREEN_USER, username: SCREEN_USER, fullName: SCREEN_USER, role: SCREEN_ROLE,
    isActive: true, createdAt: '', updatedAt: '',
  } as any;
  try {
    assert.equal(
      AuthorizationService.evaluate(user, 'sales.pos.view', { path: '/pos' }).allowed,
      true
    );
    const denied = AuthorizationService.evaluate(user, 'sales.pos.view', { path: '/sales' });
    assert.equal(denied.allowed, false);
    if (!denied.allowed) assert.equal(denied.dimension, 'screen');
    // بدون path (سياق خدمة) لا يُطبَّق بُعد الشاشة.
    assert.equal(AuthorizationService.evaluate(user, 'sales.pos.view').allowed, true);
  } finally {
    db.run('DELETE FROM users WHERE id = ?', [SCREEN_USER]);
    db.run('DELETE FROM role_permissions WHERE role_code = ?', [SCREEN_ROLE]);
    db.run('DELETE FROM roles WHERE code = ?', [SCREEN_ROLE]);
    PermissionChecker.invalidate();
  }
});
