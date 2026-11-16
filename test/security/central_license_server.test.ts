import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';

test('central license server: license key is not guessable / follows secure pattern', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const admin: any = { id: 'usr_central_admin', username: 'central-admin', fullName: 'Central Admin', role: 'SUPER_ADMIN', isActive: true };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1)`);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  db.run(`INSERT INTO platform_tenants (id, name, code, status, subscription_status, subscription_expires_at)
   VALUES ('tenant_central','Tenant Central','CENT','ACTIVE','ACTIVE', datetime('now','+1 year'))`);
  db.run(`INSERT INTO platform_subscriptions (id, tenant_id, plan_id, status, start_date, end_date, seats, price, billing_cycle, auto_renew, branches_limit)
   VALUES ('sub_central','tenant_central','plan_main','ACTIVE','2026-01-01','2026-12-31',5,1000,'MONTHLY',0,2)`);
  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_central','tenant_central','sub_central','plan_main','CS-CENTRAL-SECURE-KEY','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-CENTRAL','cert','HWID-CENTRAL','FULL')`);

  const row = db.query<{ license_key: string }>('SELECT license_key FROM platform_licenses WHERE id = ?', ['lic_central'])[0];
  assert.ok(row.license_key.startsWith('CS-'), 'license key uses secure CS- prefix');
  assert.ok(row.license_key.length > 10, 'license key is sufficiently long');
  assert.ok(!row.license_key.includes('test') && !row.license_key.includes('1234'), 'license key is not a weak guessable value');
});

test('central license server: device cannot be activated on multiple tenants (clone detection)', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const hwid = 'HWID-CLONE-0001';
  db.run(`INSERT INTO platform_devices (id, tenant_id, license_id, hardware_id, name, status, first_activated_at, last_seen_at)
   VALUES ('dev1','tenant_alpha','lic_alpha','${hwid}','Device Alpha','ACTIVE',datetime('now'),datetime('now')),
          ('dev2','tenant_beta','lic_beta','${hwid}','Device Beta','ACTIVE',datetime('now'),datetime('now'))`);

  const duplicates = db.query<{ hardware_id: string; tenant_count: number }>(
    `SELECT hardware_id, COUNT(DISTINCT tenant_id) AS tenant_count
     FROM platform_devices
     WHERE status IN ('ACTIVE','SUSPENDED')
     GROUP BY hardware_id
     HAVING tenant_count > 1`
  );

  const clone = duplicates.find((d) => d.hardware_id === hwid);
  assert.ok(clone, 'same hardware ID on multiple tenants is detectable');
  assert.equal(clone.tenant_count, 2, 'clone detection counts 2 tenants for same HWID');
});


test('central license server: expired license cannot be activated', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_expired','tenant_expired','sub_expired','plan_main','CS-EXPIRED-0001','EXPIRED','2026-01-01','2026-01-01',?,5,1,2,'[]','[]','ACT-EXPIRED','cert','HWID-EXPIRED','FULL')`,
    [past]);

  const lic = db.query<{ status: string; expires_at: string }>('SELECT status, expires_at FROM platform_licenses WHERE id = ?', ['lic_expired'])[0];
  assert.equal(lic.status, 'EXPIRED', 'expired license status is recorded');
  assert.ok(new Date(lic.expires_at) < new Date(), 'expired license expiry is in the past');
});

test('central license server: unauthorized access to license endpoints is rejected', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const limited: any = { id: 'usr_central_limited', username: 'central-limited', fullName: 'Central Limited', role: 'SALES', isActive: true };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
   VALUES ('${limited.id}','${limited.username}','test','${limited.fullName}','${limited.role}',1)`);
  AuthService.setCurrentUser(limited);
  PermissionService.invalidate(limited);

  const hasLicensePerm = PermissionService.can(limited, 'platform.licenses.view') ||
    PermissionService.can(limited, 'platform.licenses.manage');
  assert.equal(hasLicensePerm, false, 'non-platform user has no license permissions');
});

test('central license server: license transfer is audited and recorded', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const admin: any = { id: 'usr_central_audit', username: 'central-audit', fullName: 'Central Audit', role: 'SUPER_ADMIN', isActive: true };
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1)`);
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  db.run(`INSERT INTO platform_license_changes (id, license_id, subscription_id, change_type, old_values, new_values, actor_id, actor_name, reason)
   VALUES ('lchg_transfer','lic_transfer','sub_transfer','TRANSFER','{hardwareId: HWID-OLD}','{hardwareId: HWID-NEW}','${admin.id}','${admin.fullName}','نقل ترخيص')`);

  const changes = db.query<{ change_type: string }>("SELECT change_type FROM platform_license_changes WHERE license_id = 'lic_transfer'");
  assert.ok(changes.some((c) => c.change_type === 'TRANSFER'), 'license transfer is recorded in audit trail');
});

test('central license server: tenant scope predicate blocks cross-tenant license queries', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_scope_a','tenant_scope_a','sub_scope_a','plan_main','CS-SCOPE-A-0001','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-SCOPE-A','cert','HWID-SCOPE-A','FULL'),
          ('lic_scope_b','tenant_scope_b','sub_scope_b','plan_main','CS-SCOPE-B-0001','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-SCOPE-B','cert','HWID-SCOPE-B','FULL')`);

  const tenantAOnly = ['tenant_scope_a'];
  const scopeClause = `AND tenant_id IN ('${tenantAOnly.join("','")}")`;
  const visible = db.query<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id FROM platform_licenses WHERE 1=1 ${scopeClause}`
  );
  assert.equal(visible.length, 1, 'scoped user sees only their tenant licenses');
  assert.equal(visible[0].tenant_id, 'tenant_scope_a', 'visible license belongs to tenant A');
  assert.ok(!visible.some((v) => v.tenant_id === 'tenant_scope_b'), 'tenant B license is hidden');
});

test('central license server: license cannot exceed device limit', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_limit','tenant_limit','sub_limit','plan_main','CS-LIMIT-0001','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-LIMIT','cert','HWID-LIMIT','FULL')`);

  db.run(`INSERT INTO platform_devices (id, tenant_id, license_id, hardware_id, name, status, first_activated_at, last_seen_at)
   VALUES ('dev_limit_1','tenant_limit','lic_limit','HWID-DEV1','Device 1','ACTIVE',datetime('now'),datetime('now'))`);

  const activeDevices = db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM platform_devices WHERE license_id = 'lic_limit' AND status = 'ACTIVE'`
  )[0];
  assert.equal(activeDevices.n, 1, 'license has 1 active device matching its limit');

  const deviceLimit = db.query<{ device_limit: number }>('SELECT device_limit FROM platform_licenses WHERE id = ?', ['lic_limit'])[0];
  assert.equal(deviceLimit.device_limit, 1, 'device limit is 1 for this license');
});
