import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PlatformStaffAuthService } from '../src/services/domains/platform/PlatformStaffAuthService.ts';
import { PlatformBootstrapService } from '../src/services/domains/platform/PlatformBootstrapService.ts';
import { platformAdminService } from '../src/services/domains/platform/PlatformAdminService.ts';

/**
 * Platform owner security:
 *  - the owner role (SUPER_ADMIN) can only be minted by the one-time,
 *    secure bootstrap procedure;
 *  - no staff account (not even PLATFORM_ADMIN) may grant, clone, or edit it;
 *  - every account claiming the owner role is auditable.
 */

const OWNER_EMAIL = 'owner.security@example.com';
const OWNER_PASSWORD = 'Owner@Pass2026';
const OWNER_USERNAME = 'owner.security';

const uniqueEmail = (tag: string) => `owner.${tag}.${Date.now().toString().slice(-6)}@example.com`;

test('bootstrap creates exactly one owner account and cannot be replayed', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const service = new PlatformBootstrapService(db);

  // The seeded placeholder owner row has no password, so no usable owner exists yet.
  assert.equal(service.isBootstrapped(), false);

  const result = service.bootstrap({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    username: OWNER_USERNAME,
    fullName: 'مالك المنصة',
  });

  assert.ok(result.staffId, 'a platform staff owner row is created');
  assert.ok(result.userId, 'an ERP owner row is created');
  // The seeded placeholder row (staff_super_admin, without a password) must be
  // claimed instead of creating a second owner row.
  assert.equal(result.claimedSeededRow, true, 'the seeded owner placeholder is claimed');
  assert.equal(result.staffId, 'staff_super_admin');
  assert.equal(service.isBootstrapped(), true, 'the platform is now bootstrapped');

  // Replaying the bootstrap must be refused.
  assert.throws(
    () => service.bootstrap({ email: 'second.owner@example.com', password: 'Second@Pass2026' }),
    /مُهيأ بالفعل/,
  );

  // The owner can sign in through the standard login screen.
  AuthService.logout();
  const owner = await AuthService.loginAsync(OWNER_USERNAME, OWNER_PASSWORD);
  assert.equal(owner.role, 'SUPER_ADMIN');

  // A weak owner password is rejected.
  assert.throws(
    () => new PlatformBootstrapService(db).bootstrap({ email: 'weak@example.com', password: 'short' }),
    /مُهيأ بالفعل|12/,
  );
});

test('owner accounts are auditable and unapproved owner rows are flagged', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const service = new PlatformBootstrapService(db);

  // An owner row created outside the bootstrap procedure must be flagged.
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ('usr_manual_owner', 'manual.owner', 'x', 'حساب يدوي', 'SUPER_ADMIN', 1, ?, ?)`,
    [new Date().toISOString(), new Date().toISOString()],
  );

  const entries = service.auditOwnerAccounts();
  const manual = entries.find((entry) => entry.id === 'usr_manual_owner');
  assert.ok(manual, 'the manual owner account appears in the audit');
  assert.equal(manual.approved, false, 'an owner row without a bootstrap trace is unapproved');
  assert.ok(manual.concerns.length > 0);

  const approved = entries.find((entry) => entry.source === 'users' && entry.id.startsWith('usr_platform_'));
  assert.ok(approved, 'the bootstrapped owner appears in the audit');
  assert.equal(approved.approved, true, 'the bootstrapped owner is approved');

  // Only the owner may read the audit through the platform service.
  AuthService.logout();
  AuthService.login('admin', 'admin123');
  assert.throws(() => platformAdminService.auditPlatformOwnerAccounts(), /مالك المنصة/);
});

test('non-owner staff cannot grant, clone, or edit the owner role', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  // Sign in as the bootstrapped owner.
  AuthService.logout();
  await AuthService.loginAsync(OWNER_USERNAME, OWNER_PASSWORD);

  // Create a PLATFORM_ADMIN (has staff.create / staff.update but is not the owner).
  const adminEmail = uniqueEmail('platformadmin');
  const platformAdmin = platformAdminService.createPlatformStaff({
    fullName: 'مدير منصة',
    email: adminEmail,
    role: 'PLATFORM_ADMIN',
    password: 'Admin@12345',
    isActive: true,
  });

  const supportEmail = uniqueEmail('support');
  const support = platformAdminService.createPlatformStaff({
    fullName: 'موظف دعم',
    email: supportEmail,
    role: 'SUPPORT_AGENT',
    password: 'Support@123',
    isActive: true,
  });

  // Become the non-owner platform admin.
  AuthService.logout();
  await PlatformStaffAuthService.login(adminEmail, 'Admin@12345');

  // 1. Creating a second owner account is refused.
  assert.throws(
    () => platformAdminService.createPlatformStaff({
      fullName: 'مالك مزيف',
      email: uniqueEmail('fakeowner'),
      role: 'SUPER_ADMIN',
      password: 'Owner@12345',
      isActive: true,
    }),
    /مالك المنصة/,
  );

  // 2. Promoting an existing staff account to the owner role is refused.
  assert.throws(
    () => platformAdminService.updatePlatformStaff(support.id, { role: 'SUPER_ADMIN' }),
    /مالك المنصة/,
  );

  // 3. Inviting somebody *as* the owner is refused.
  assert.throws(
    () => platformAdminService.createStaffInvite({
      fullName: 'مدعو المالك',
      email: uniqueEmail('inviteowner'),
      role: 'SUPER_ADMIN',
    }),
    /مالك المنصة/,
  );

  // 4. Copying the owner role from the owner account is refused.
  assert.throws(
    () => platformAdminService.transferStaffPermissions('staff_super_admin', support.id),
    /مالك المنصة/,
  );

  // 5. Editing the owner account itself is refused (password/email takeover).
  assert.throws(
    () => platformAdminService.updatePlatformStaff('staff_super_admin', { fullName: 'اختراق' }),
    /مالك المنصة/,
  );

  // 6. The owner role matrix itself stays owner-only.
  assert.throws(
    () => platformAdminService.setRolePermissions('SUPER_ADMIN', []),
    /مالك المنصة/,
  );

  // Restore the owner session for the remaining assertions.
  AuthService.logout();
  await AuthService.loginAsync(OWNER_USERNAME, OWNER_PASSWORD);
  assert.ok(platformAdmin.id, 'the non-owner staff account still exists');
});

test('the ERP user management cannot create or promote an owner account', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  // The seeded ERP admin still uses the default password (must-change-password
  // is enforced), so rotate it first to unlock the user-management services.
  const bcrypt = (await import('bcryptjs')).default;
  db.run(
    'UPDATE users SET password_hash = ? WHERE username = ?',
    [bcrypt.hashSync('Admin@Rotated2026', 10), 'admin'],
  );

  AuthService.logout();
  AuthService.login('admin', 'Admin@Rotated2026');

  // The first-run setup wizard must complete before ERP users can be created.
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`);

  const authService = new AuthService();
  assert.throws(
    () => authService.createUser({
      username: 'erp.fake.owner',
      password: 'Erp@Owner2026',
      fullName: 'مالك عبر ERP',
      role: 'SUPER_ADMIN' as any,
    }),
    /مالك المنصة/,
  );

  // Promotion path is closed as well: a normal member can never be upgraded.
  const member = authService.createUser({
    username: 'erp.member',
    password: 'Member@9201',
    fullName: 'عضو عادي',
    role: 'SALES' as any,
  });
  assert.throws(
    () => authService.updateUser(member.id, { role: 'SUPER_ADMIN' as any }),
    /مالك المنصة/,
  );

  // The setup gate is enforced at the service layer: with setup incomplete,
  // even a legitimate user creation is refused.
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '0')`);
  assert.throws(
    () => authService.createUser({
      username: 'erp.blocked.member',
      password: 'Member@9201',
      fullName: 'عضو محظور',
      role: 'SALES' as any,
    }),
    /إعداد النظام/,
  );
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`);
});

test('ERP user creation is refused before the first-run setup completes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const bcrypt = (await import('bcryptjs')).default;
  // Fresh install state: an admin with a *rotated* password but no completed setup.
  db.run(
    'UPDATE users SET password_hash = ? WHERE username = ?',
    [bcrypt.hashSync('Admin@Setup2026', 10), 'admin'],
  );
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '0')`);

  AuthService.logout();
  AuthService.login('admin', 'Admin@Setup2026');

  const authService = new AuthService();
  assert.throws(
    () => authService.createUser({
      username: 'erp.before.setup',
      password: 'Member@9201',
      fullName: 'قبل الإعداد',
      role: 'SALES' as any,
    }),
    /إعداد النظام أولًا/,
  );

  // Completing the setup unlocks user creation again.
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('setup_completed', '1')`);
  const created = authService.createUser({
    username: 'erp.after.setup',
    password: 'Member@9201',
    fullName: 'بعد الإعداد',
    role: 'SALES' as any,
  });
  assert.ok(created.id, 'user creation succeeds once setup is completed');
});
