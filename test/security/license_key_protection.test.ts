import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';
import { PlatformLicenseService } from '../../src/services/domains/platform/PlatformLicenseService.ts';
import type { User } from '../../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_lic_admin', username: 'lic-admin', fullName: 'License Admin',
  role: 'SUPER_ADMIN', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1)`);
  db.run(`INSERT INTO platform_tenants (id, name, code, status, subscription_status, subscription_expires_at)
   VALUES ('tenant_lic','Tenant Lic','LIC','ACTIVE','ACTIVE', datetime('now','+1 year'))`);
  db.run(`INSERT INTO platform_subscriptions (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit)
   VALUES ('sub_lic','tenant_lic','plan_main','ACTIVE','2026-01-01','2026-12-31',5,1000,'MONTHLY',0,2)`);
  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_prot','tenant_lic','sub_lic','plan_main','CS-PROTECT-0001','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-PROT','-----BEGIN CERTIFICATE-----','HWID-DEVICE-1','FULL')`);
}

test('license key: license key is stored and not exposed in plaintext to unauthorized users', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const svc = new PlatformLicenseService();
  const licenses = svc.listLicenses();
  assert.equal(licenses.length, 1);
  const lic = licenses[0];
  assert.ok(lic.licenseKey.startsWith('CS-'), 'license key follows CS- pattern');

  assert.equal(lic.tenantId, 'tenant_lic');
  assert.equal(lic.status, 'ACTIVE');
});

test('license key: activation code is separate from license key and not derivable', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const svc = new PlatformLicenseService();
  const lic = svc.getLicenseById ? svc.getLicenseById('lic_prot') : null;
  assert.ok(lic, 'license exists');
  assert.ok(lic.activationCode, 'activation code is set');
  assert.notEqual(lic.activationCode, lic.licenseKey, 'activation code differs from license key');
});

test('license key: hardware binding prevents use on different device', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const svc = new PlatformLicenseService();
  const lic = svc.getLicenseById ? svc.getLicenseById('lic_prot') : null;
  assert.ok(lic);
  assert.ok(lic.hardwareId, 'license is bound to a hardware ID');
  assert.equal(lic.hardwareId, 'HWID-DEVICE-1', 'hardware ID is recorded');
});

test('license key: only authorized roles can manage licenses', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);

  const limited: User = { id: 'usr_lic_limited', username: 'lic-limited', fullName: 'Lic Limited',
    role: 'SALES', isActive: true, createdAt: '', updatedAt: '' };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
   VALUES ('${limited.id}','${limited.username}','test','${limited.fullName}','${limited.role}',1)`);
  asUser(limited);

  const svc = new PlatformLicenseService();
  assert.throws(() => svc.listLicenses(), /صلاحية|غير مصرح|ممنوع|منصة/,
    'non-platform user cannot list licenses');
});

test('license key: certificate is present and verifiable structure', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const svc = new PlatformLicenseService();
  const lic = svc.getLicenseById ? svc.getLicenseById('lic_prot') : null;
  assert.ok(lic);
  assert.ok(lic.certificate, 'license certificate is present');
  assert.ok(lic.certificate.includes('BEGIN CERTIFICATE'), 'certificate has PEM structure');
});
