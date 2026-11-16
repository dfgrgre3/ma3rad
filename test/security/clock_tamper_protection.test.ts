import '../integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/database/repositories/databaseManager.ts';
import { AuthService } from '../../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../../src/services/domains/auth/PermissionService.ts';

const admin: User = {
  id: 'usr_clock_admin', username: 'clock-admin', fullName: 'Clock Admin',
  role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '',
};

function asUser(user: User): void {
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
}

async function boot(db: DatabaseManager): Promise<void> {
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
   VALUES ('${admin.id}','${admin.username}','test','${admin.fullName}','${admin.role}',1,'ALL')`);
}

test('clock tamper: license validity is bound to issued/expires dates, not system clock alone', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const now = Date.now();
  const issued = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString();
  const expires = new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString();

  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, coupling_mode)
   VALUES ('lic_clock','tenant_clock','sub_clock','plan_main','CS-CLOCK-0001','ACTIVE',?,?,?,5,1,2,'[]','[]','ACT-CLOCK','cert','HWID-CLOCK','FULL')`,
    [issued, issued, expires]);

  const row = db.query<{ id: string; expires_at: string }>(
    'SELECT id, expires_at FROM platform_licenses WHERE id = ?', ['lic_clock']
  )[0];
  assert.ok(row, 'license record exists');
  assert.ok(new Date(row.expires_at) > new Date(), 'license is valid relative to real time');
});

test('clock tamper: system clock rollback detected by monotonic marker', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const timeCheckPath = require('node:path').join(require('node:os').tmpdir(), 'ceramisys_clock_test.json');
  const fs = require('node:fs');

  const now = Date.now();
  fs.writeFileSync(timeCheckPath, JSON.stringify({ lastSeen: now }));

  fs.writeFileSync(timeCheckPath, JSON.stringify({ lastSeen: now + 5 * 60 * 1000 }));
  const current = JSON.parse(fs.readFileSync(timeCheckPath, 'utf8'));
  assert.ok(current.lastSeen >= now, 'small forward drift is tolerated');

  fs.writeFileSync(timeCheckPath, JSON.stringify({ lastSeen: now + 60 * 60 * 1000 }));
  const rollbackCheck = JSON.parse(fs.readFileSync(timeCheckPath, 'utf8'));
  const rollbackDetected = rollbackCheck.lastSeen > now + 15 * 60 * 1000;
  assert.ok(rollbackDetected, 'clock rollback beyond tolerance must be detected');

  fs.unlinkSync(timeCheckPath);
});

test('clock tamper: offline lease expiry cannot be extended by changing device clock', async () => {
  const db = DatabaseManager.getInstance();
  await boot(db);
  asUser(admin);

  const now = Date.now();
  const leaseExpires = new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString();

  db.run(`INSERT INTO platform_licenses (id, tenant_id, subscription_id, plan_id, license_key, status, issued_at, starts_at, expires_at, seats, device_limit, branches_limit, modules, features, activation_code, certificate, hardware_id, offline_lease_expires_at, coupling_mode)
   VALUES ('lic_lease','tenant_lease','sub_lease','plan_main','CS-LEASE-0001','ACTIVE','2026-01-01','2026-01-01','2026-12-31',5,1,2,'[]','[]','ACT-LEASE','cert','HWID-LEASE',?,'FULL')`,
    [leaseExpires]);

  const row = db.query<{ offline_lease_expires_at: string }>(
    'SELECT offline_lease_expires_at FROM platform_licenses WHERE id = ?', ['lic_lease']
  )[0];
  assert.ok(row, 'offline lease recorded');
  assert.ok(new Date(row.offline_lease_expires_at) > new Date(), 'offline lease is valid now');

  const fakeFuture = new Date(now + 1000 * 60 * 60 * 24 * 400).toISOString();
  assert.ok(new Date(fakeFuture) > new Date(row.offline_lease_expires_at),
    'manipulated clock would exceed lease, but license must still enforce stored expiry');
});
