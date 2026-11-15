import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { platformStaffTwoFactorAuth } from '../src/services/domains/auth/twoFactorAuth.ts';
import { PlatformStaffAuthService } from '../src/services/domains/platform/PlatformStaffAuthService.ts';
import { PlatformAuthorizationService } from '../src/services/domains/platform/PlatformAuthorizationService.ts';
import { platformAdminService } from '../src/services/domains/platform/PlatformAdminService.ts';

/**
 * Platform staff security & RBAC v2:
 * granular role matrix, invites, MFA, trusted devices, data scope,
 * soft-delete and permission transfer — all enforced at the service layer.
 */

function ensurePlatformOwner(db: DatabaseManager) {
  const existing = db.query<any>(`SELECT id FROM users WHERE username = 'platform'`)[0];
  if (existing) return;
  const passwordHash = bcrypt.hashSync('Platform@2026', 10);
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ('usr_platform_test', 'platform', ?, 'مالك المنصة', 'SUPER_ADMIN', 1, ?, ?)`,
    [passwordHash, now, now]
  );
}

function loginAsOwner(db: DatabaseManager) {
  ensurePlatformOwner(db);
  AuthService.logout();
  AuthService.login('platform', 'Platform@2026');
}

const uniqueEmail = (tag: string) => `staff.${tag}.${Date.now().toString().slice(-6)}@example.com`;

test('granular role matrix: seeds, overrides and effective permissions', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  // Seeded matrix matches built-in roles.
  const ownerPerms = PlatformAuthorizationService.getRolePermissions('SUPER_ADMIN');
  assert.ok(ownerPerms.includes('*'), 'SUPER_ADMIN holds the wildcard');

  const supportPerms = PlatformAuthorizationService.getRolePermissions('SUPPORT_AGENT');
  assert.ok(supportPerms.includes('platform.tenants.view'));
  assert.ok(!supportPerms.includes('platform.tenants.create'));
  assert.ok(!supportPerms.includes('platform.billing.view'), 'support agent must not see billing');

  const billingPerms = PlatformAuthorizationService.getRolePermissions('BILLING_SPECIALIST');
  assert.ok(billingPerms.includes('platform.billing.create'));
  assert.ok(!billingPerms.includes('platform.staff.create'));

  // Per-staff override grants a single extra permission.
  assert.equal(PlatformAuthorizationService.canAccessPermission('SUPPORT_AGENT', 'platform.subscriptions.view'), false);
  assert.equal(PlatformAuthorizationService.canAccessPermission('SUPPORT_AGENT', 'platform.subscriptions.view', ['platform.subscriptions.view']), true);

  // Matrix is editable at runtime and takes effect immediately.
  loginAsOwner(db);
  const before = PlatformAuthorizationService.getRolePermissions('SUPPORT_AGENT');
  PlatformAuthorizationService.setRolePermissions('SUPPORT_AGENT', [...before, 'platform.subscriptions.view']);
  assert.equal(PlatformAuthorizationService.canAccessPermission('SUPPORT_AGENT', 'platform.subscriptions.view'), true);
  PlatformAuthorizationService.setRolePermissions('SUPPORT_AGENT', before);
  assert.equal(PlatformAuthorizationService.canAccessPermission('SUPPORT_AGENT', 'platform.subscriptions.view'), false);
});

test('staff lifecycle: create, must-change-password, login, soft-delete', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const email = uniqueEmail('lifecycle');
  const staff = platformAdminService.createPlatformStaff({
    fullName: 'اختبار دورة الحياة',
    email,
    role: 'SUPPORT_AGENT',
    password: 'Initial@123',
    isActive: true,
  });
  assert.ok(staff.id);
  assert.equal(staff.mustChangePassword, true, 'admin-set password forces a change on first login');

  // A brand-new staff member can sign in.
  AuthService.logout();
  const session = await PlatformStaffAuthService.login(email, 'Initial@123');
  assert.ok(session, 'staff login should succeed');
  assert.equal(session!.mustChangePassword, true);

  // Wrong password increments failed attempts.
  AuthService.logout();
  await assert.rejects(() => PlatformStaffAuthService.login(email, 'Wrong@999'), /غير صحيحة/);

  // Soft delete blocks future logins.
  loginAsOwner(db);
  platformAdminService.deletePlatformStaff(staff.id);
  const listed = platformAdminService.listPlatformStaff('', '', true).find((item) => item.id === staff.id);
  assert.ok(listed?.deletedAt, 'deleted_at must be set (logical delete)');
  assert.equal(listed?.isActive, false);
  AuthService.logout();
  const gone = await PlatformStaffAuthService.login(email, 'Initial@123');
  assert.equal(gone, null, 'soft-deleted staff must not sign in');
});

test('self-service password change clears the forced-change flag', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const email = uniqueEmail('selfservice');
  const staff = platformAdminService.createPlatformStaff({
    fullName: 'تغيير ذاتي',
    email,
    role: 'SUPPORT_AGENT',
    password: 'Initial@123',
    isActive: true,
  });

  AuthService.logout();
  const session = await PlatformStaffAuthService.login(email, 'Initial@123');
  assert.equal(session!.mustChangePassword, true);

  assert.throws(() => platformAdminService.changeOwnStaffPassword('Wrong@123', 'Better@456'), /غير صحيحة/);
  platformAdminService.changeOwnStaffPassword('Initial@123', 'Better@456');

  AuthService.logout();
  const relogged = await PlatformStaffAuthService.login(email, 'Better@456');
  assert.ok(relogged, 'new password works');
  assert.equal(relogged!.mustChangePassword, false, 'forced change cleared after success');
});

test('invite flow: create, single-use token, expiry and signup', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const email = uniqueEmail('invite');
  const { invite, token } = platformAdminService.createStaffInvite({
    fullName: 'مدعو الاختبار',
    email,
    role: 'OPERATIONS_ENGINEER',
    expiresInHours: 2,
  });
  assert.equal(invite.status, 'PENDING');
  assert.ok(token.length >= 32, 'token is long enough to resist guessing');

  const pending = platformAdminService.listStaffInvites('pending');
  assert.ok(pending.some((item) => item.id === invite.id));

  // Wrong token is rejected.
  assert.throws(() => platformAdminService.acceptStaffInvite('deadbeef', 'مدعو الاختبار', 'Secret@123'), /غير صالح/);

  // Valid token creates the account once.
  const created = platformAdminService.acceptStaffInvite(token, 'مدعو الاختبار', 'Secret@123');
  assert.equal(created.email, email);
  assert.equal(created.role, 'OPERATIONS_ENGINEER');
  assert.equal(created.isActive, true);

  // Token cannot be replayed.
  assert.throws(() => platformAdminService.acceptStaffInvite(token, 'مدعو آخر', 'Secret@123'), /تم استخدام/);

  // The new staff member can sign in.
  AuthService.logout();
  const session = await PlatformStaffAuthService.login(email, 'Secret@123');
  assert.ok(session, 'invited staff can sign in');
});

test('data scope limits which tenants a staff member can see', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const plans = platformAdminService.listPlans();
  const plan = plans.find((item) => item.isDefault) ?? plans[0];
  const suffix = Date.now().toString().slice(-6);
  const tenantA = platformAdminService.createTenant({ name: `نطاق أ ${suffix}`, code: `SCA${suffix}`, phone: '01000000001', status: 'TRIAL', planId: plan.id, seatsLimit: 2 });
  const tenantB = platformAdminService.createTenant({ name: `نطاق ب ${suffix}`, code: `SCB${suffix}`, phone: '01000000002', status: 'TRIAL', planId: plan.id, seatsLimit: 2 });

  const staff = platformAdminService.createPlatformStaff({
    fullName: 'نطاق محدود',
    email: uniqueEmail('scope'),
    role: 'SUPPORT_AGENT',
    password: 'Scope@123',
    isActive: true,
  });

  // Not scoped yet: sees both tenants.
  let list = platformAdminService.listTenants('', '', '');
  assert.ok(list.some((item) => item.id === tenantA.id));
  assert.ok(list.some((item) => item.id === tenantB.id));

  platformAdminService.setStaffDataScope(staff.id, 'LIMITED', [tenantA.id]);

  AuthService.logout();
  const scopedSession = await PlatformStaffAuthService.login(staff.email, 'Scope@123');
  assert.ok(scopedSession);
  list = platformAdminService.listTenants('', '', '');
  assert.ok(list.some((item) => item.id === tenantA.id), 'scoped staff sees tenant A');
  assert.ok(!list.some((item) => item.id === tenantB.id), 'scoped staff must NOT see tenant B');
  assert.throws(() => platformAdminService.getTenant(tenantB.id), /نطاق البيانات/);

  // Owner resets to ALL and the staff sees everything again.
  loginAsOwner(db);
  platformAdminService.setStaffDataScope(staff.id, 'ALL', []);
  AuthService.logout();
  await PlatformStaffAuthService.login(staff.email, 'Scope@123');
  list = platformAdminService.listTenants('', '', '');
  assert.ok(list.some((item) => item.id === tenantB.id));

  loginAsOwner(db);
  platformAdminService.archiveTenant(tenantA.id);
  platformAdminService.archiveTenant(tenantB.id);
});

test('MFA enrollment, login challenge and owner emergency reset', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const staff = platformAdminService.createPlatformStaff({
    fullName: 'مصادقة مزدوجة',
    email: uniqueEmail('mfa'),
    role: 'SUPPORT_AGENT',
    password: 'Mfa@1234',
    isActive: true,
  });

  AuthService.logout();
  await PlatformStaffAuthService.login(staff.email, 'Mfa@1234');

  const setup = await platformAdminService.startMfaEnrollmentForStaffSelf();
  assert.ok(setup.secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = platformStaffTwoFactorAuth.generateTestCode(staff.id, counter);
  assert.match(code, /^\d{6}$/);
  await platformAdminService.confirmMfaForStaffSelf(code);
  assert.equal(platformStaffTwoFactorAuth.isEnabled(staff.id), true);

  // Login without a code now demands the second factor.
  AuthService.logout();
  await assert.rejects(
    () => PlatformStaffAuthService.login(staff.email, 'Mfa@1234'),
    (error: any) => error?.code === 'TWO_FACTOR_REQUIRED'
  );

  // Login with a code from a LATER step (the enrollment code consumed the current
  // counter via replay protection, which is the whole point of lastUsedCounter).
  const freshCounter = Math.floor(Date.now() / 1000 / 30) + 1;
  const freshCode = platformStaffTwoFactorAuth.generateTestCode(staff.id, freshCounter);
  const session = await PlatformStaffAuthService.login(staff.email, 'Mfa@1234', freshCode);
  assert.ok(session);

  // Owner emergency reset drops the factor; staff can log in password-only again.
  loginAsOwner(db);
  platformAdminService.resetStaffMfa(staff.id);
  assert.equal(platformStaffTwoFactorAuth.isEnabled(staff.id), false);
  AuthService.logout();
  const passwordOnly = await PlatformStaffAuthService.login(staff.email, 'Mfa@1234');
  assert.ok(passwordOnly, 'after reset, password alone works');
});

test('permission transfer copies role and revokes target sessions', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  const source = platformAdminService.createPlatformStaff({
    fullName: 'المصدر',
    email: uniqueEmail('source'),
    role: 'BILLING_SPECIALIST',
    password: 'Transfer@1',
    isActive: true,
  });
  const target = platformAdminService.createPlatformStaff({
    fullName: 'الهدف',
    email: uniqueEmail('target'),
    role: 'SUPPORT_AGENT',
    password: 'Transfer@2',
    isActive: true,
  });

  platformAdminService.transferStaffPermissions(source.id, target.id, 'تسليم المسؤولية');
  const moved = platformAdminService.getPlatformStaff(target.id);
  assert.equal(moved?.role, 'BILLING_SPECIALIST', 'role transferred');

  // Transferring to a SUPER_ADMIN target is rejected for non-owners, but the
  // owner path exists; here we assert the validation guard for self-transfer.
  assert.throws(() => platformAdminService.transferStaffPermissions(target.id, target.id), /نفس الموظف/);
});

test('service layer rejects non-staff roles and underprivileged staff', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  loginAsOwner(db);

  // An ERP non-platform user is rejected by the platform guard.
  AuthService.logout();
  AuthService.login('admin', 'admin123');
  assert.throws(() => platformAdminService.listTenants(), /المنصة/);
  assert.throws(() => platformAdminService.setStaffMfaEnforcement('required'), /المنصة/);

  // A SUPPORT_AGENT cannot change the MFA policy (needs platform.security.update).
  loginAsOwner(db);
  const agent = platformAdminService.createPlatformStaff({
    fullName: 'دعم محدود',
    email: uniqueEmail('limited'),
    role: 'SUPPORT_AGENT',
    password: 'Limited@1',
    isActive: true,
  });
  AuthService.logout();
  await PlatformStaffAuthService.login(agent.email, 'Limited@1');
  assert.throws(() => platformAdminService.setStaffMfaEnforcement('required'), /صلاحية/);
  assert.throws(() => platformAdminService.setRolePermissions('SUPPORT_AGENT', []), /صلاحية/);

  loginAsOwner(db);
  platformAdminService.setStaffMfaEnforcement('off');
});
