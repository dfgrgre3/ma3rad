import './integration.setup.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { TenantIdentityProvisioningService } from '../src/services/domains/platform/TenantIdentityProvisioningService.ts';
import { CentralTenantUserSyncService } from '../src/services/domains/platform/CentralTenantUserSyncService.ts';

const db = () => DatabaseManager.getInstance();

function userByUsername(username: string) {
  return db().query<any>('SELECT * FROM users WHERE username = ?', [username])[0];
}

function installBridge(jobs: any[], reports: any[]) {
  (globalThis as any).window = {
    ceramisys: {
      central: {
        getStatus: async () => ({ configured: true, activated: true }),
        request: async (req: any) => {
          if (req.path === '/api/v1/device/provisioning/pending') {
            return { ok: true, status: 200, body: { success: true, data: jobs } };
          }
          if (req.path.startsWith('/api/v1/device/provisioning/') && req.path.endsWith('/result')) {
            reports.push(JSON.parse(req.body));
            return { ok: true, status: 200, body: { success: true, data: { status: 'DONE' } } };
          }
          return { ok: false, status: 404, body: { success: false, error: 'unexpected path ' + req.path } };
        },
      },
    },
  };
}

before(async () => {
  await db().initialize();
});

after(() => {
  delete (globalThis as any).window;
});

test('PROVISION job creates a local ERP login with the temporary password and reports the identity id', async () => {
  const reports: any[] = [];
  const job = {
    id: 'tpj_test_1',
    tenantUserId: 'tuser_1',
    event: 'PROVISION',
    payload: {
      username: 'central.user1',
      fullName: 'Central User One',
      phone: '01000000001',
      role: 'accountant',
      temporaryPassword: 'Temp@12345',
      mode: 'DIRECT_CREATE',
    },
  };
  installBridge([job], reports);

  await TenantIdentityProvisioningService.sync();

  const user = userByUsername('central.user1');
  assert.ok(user, 'user must exist in the local users table');
  assert.equal(user.full_name, 'Central User One');
  assert.equal(user.role, 'ACCOUNTANT');
  assert.equal(Number(user.is_active), 1);
  assert.ok(bcrypt.compareSync('Temp@12345', user.password_hash), 'temporary password must be the login password');

  assert.equal(reports.length, 1);
  assert.equal(reports[0].ok, true);
  assert.equal(reports[0].identityUserId, user.id);
});

test('STATUS job suspends and reactivates the provisioned account', async () => {
  const reports: any[] = [];
  installBridge([
    { id: 'tpj_test_2', tenantUserId: 'tuser_1', event: 'STATUS', payload: { username: 'central.user1', isActive: false } },
  ], reports);
  await TenantIdentityProvisioningService.sync();
  assert.equal(Number(userByUsername('central.user1').is_active), 0);

  installBridge([
    { id: 'tpj_test_3', tenantUserId: 'tuser_1', event: 'STATUS', payload: { username: 'central.user1', isActive: true } },
  ], reports);
  await TenantIdentityProvisioningService.sync();
  assert.equal(Number(userByUsername('central.user1').is_active), 1);
});

test('UPDATE job renames the user and changes role', async () => {
  const reports: any[] = [];
  installBridge([
    {
      id: 'tpj_test_4',
      tenantUserId: 'tuser_1',
      event: 'UPDATE',
      payload: {
        username: 'central.user1.renamed',
        previousUsername: 'central.user1',
        fullName: 'Renamed User',
        role: 'sales',
      },
    },
  ], reports);
  await TenantIdentityProvisioningService.sync();

  assert.equal(userByUsername('central.user1'), undefined, 'old username must be gone');
  const user = userByUsername('central.user1.renamed');
  assert.ok(user);
  assert.equal(user.full_name, 'Renamed User');
  assert.equal(user.role, 'SALES');
});

test('DELETE job removes the user and dependent rows', async () => {
  const reports: any[] = [];
  installBridge([
    { id: 'tpj_test_5', tenantUserId: 'tuser_1', event: 'DELETE', payload: { username: 'central.user1.renamed' } },
  ], reports);
  await TenantIdentityProvisioningService.sync();

  assert.equal(userByUsername('central.user1.renamed'), undefined);
  const leftovers = db().query<any>(
    `SELECT ub.user_id FROM users_branches ub LEFT JOIN users u ON u.id = ub.user_id WHERE ub.user_id NOT IN (SELECT id FROM users)`
  );
  assert.equal(leftovers.length, 0);
});

test('reverse sync reports local user mutations to the device channel', async () => {
  const reports: any[] = [];
  const calls: any[] = [];
  (globalThis as any).window = {
    ceramisys: {
      central: {
        getStatus: async () => ({ configured: true, activated: true }),
        request: async (req: any) => {
          calls.push(req);
          if (req.path === '/api/v1/device/tenant-users/report') {
            reports.push(JSON.parse(req.body));
            return { ok: true, status: 200, body: { success: true, data: { received: 1 } } };
          }
          if (req.path === '/api/v1/device/provisioning/pending') {
            return { ok: true, status: 200, body: { success: true, data: [] } };
          }
          return { ok: false, status: 404, body: { success: false } };
        },
      },
    },
  };

  CentralTenantUserSyncService.report({
    event: 'UPSERT',
    identityUserId: 'usr_local_1',
    username: 'local.user',
    fullName: 'Local User',
    role: 'SALES',
    isActive: true,
  });
  // flush is fire-and-forget; wait for the request to land
  for (let i = 0; i < 50 && reports.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.equal(reports.length, 1);
  assert.equal(reports[0].reports.length, 1);
  assert.equal(reports[0].reports[0].username, 'local.user');
  assert.equal(reports[0].reports[0].identityUserId, 'usr_local_1');
  const reportCall = calls.find((c) => c.path === '/api/v1/device/tenant-users/report');
  assert.ok(reportCall, 'report must go through the bridge');
  assert.equal(reportCall.headers['X-Device-Id'] !== undefined, true);
});

test('suppression blocks reverse reporting during provisioning', async () => {
  const seen: any[] = [];
  (globalThis as any).window = {
    ceramisys: {
      central: {
        getStatus: async () => ({ configured: true, activated: true }),
        request: async (req: any) => {
          seen.push(req.path);
          return { ok: true, status: 200, body: { success: true, data: {} } };
        },
      },
    },
  };

  CentralTenantUserSyncService.suppress(() => {
    CentralTenantUserSyncService.report({ event: 'UPSERT', username: 'suppressed.user' });
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(seen.includes('/api/v1/device/tenant-users/report'), false, 'suppressed reports must not be sent');
});

test('failed jobs are reported back instead of throwing', async () => {
  const reports: any[] = [];
  installBridge([
    { id: 'tpj_test_6', tenantUserId: 'tuser_missing', event: 'STATUS', payload: { username: 'does.not.exist', isActive: false } },
  ], reports);
  await TenantIdentityProvisioningService.sync();

  assert.equal(reports.length, 1);
  assert.equal(reports[0].ok, false);
  assert.match(String(reports[0].error), /not found/i);
});
