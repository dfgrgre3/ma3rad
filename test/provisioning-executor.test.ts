import './integration.setup.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { platformAdminService } from '../src/services/domains/platform/PlatformAdminService.ts';
import { provisioningExecutorService } from '../src/services/domains/platform/ProvisioningExecutorService.ts';
import { identityLinkService } from '../src/services/domains/platform/IdentityLinkService.ts';

function ensurePlatformOwner(db: DatabaseManager) {
  const existing = db.query<any>(`SELECT id FROM users WHERE username = 'platform'`)[0];
  if (existing) return;
  const passwordHash = bcrypt.hashSync('Platform@2026', 10);
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ('usr_platform_test', 'platform', ?, 'Platform Owner', 'SUPER_ADMIN', 1, ?, ?)`,
    [passwordHash, now, now]
  );
}

function createTenant(suffix: string) {
  return platformAdminService.createTenant({
    name: `Provisioning ${suffix}`,
    code: `PRV${suffix}`,
    phone: '01000000000',
  } as any);
}

function col(row: any, snake: string) {
  // DatabaseManager normalizes snake_case columns to camelCase on read.
  if (!row) return undefined;
  const camel = snake.replace(/_([a-z])/g, (_, c) => String(c).toUpperCase());
  const value = row[camel];
  return value !== undefined ? value : row[snake];
}

async function waitForCondition(condition: () => boolean, timeoutMs = 3000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  assert.ok(condition(), 'condition was not met within the timeout');
}

function rowFor(db: DatabaseManager, userId: string) {
  return db.query<any>('SELECT * FROM platform_tenant_users WHERE id = ?', [userId])[0];
}

function queueRowFor(db: DatabaseManager, userId: string) {
  return db.query<any>('SELECT * FROM provisioning_queue WHERE tenant_user_id = ? ORDER BY created_at DESC LIMIT 1', [userId])[0];
}

const createdTenantIds: string[] = [];

before(async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  ensurePlatformOwner(db);
  AuthService.login('platform', 'Platform@2026');
});

after(() => {
  AuthService.logout();
  delete (globalThis as any).window;
});

test('DIRECT_CREATE stores hashed secrets, reports PENDING and never fabricates an identity', async () => {
  const db = DatabaseManager.getInstance();
  const tenant = createTenant(Date.now().toString().slice(-6));
  createdTenantIds.push(tenant.id);

  const result = platformAdminService.createTenantUser(tenant.id, {
    fullName: 'Direct Create User',
    provisionIdentity: true,
    provisioningMode: 'DIRECT_CREATE',
  } as any);

  assert.equal(result.user.provisioningStatus, 'PENDING');
  assert.equal(result.user.identityUserId ?? null, null);
  assert.equal((result as any).provisioned, false);
  assert.ok(result.inviteCode, 'plaintext invite is returned once');
  assert.ok(result.temporaryPassword, 'plaintext temporary password is returned once');

  const row = rowFor(db, result.user.id);
  assert.ok(row);
  assert.notEqual(col(row,'invite_code'), result.inviteCode, 'invite code must be hashed at rest');
  assert.notEqual(col(row,'temporary_password'), result.temporaryPassword, 'temporary password must be hashed at rest');
  assert.ok(bcrypt.compareSync(result.inviteCode!, col(row,'invite_code')));
  assert.ok(bcrypt.compareSync(result.temporaryPassword!, col(row,'temporary_password')));
  assert.equal(col(row,'provisioned_at'), null, 'PROVISIONED must never be claimed before execution');

  // The mapped directory object never exposes the stored hashes.
  assert.equal(result.user.inviteCode ?? null, null);
  assert.equal(result.user.temporaryPassword ?? null, null);
});

test('executor defers without a configured channel (fail closed, no attempt burned)', async () => {
  const db = DatabaseManager.getInstance();
  const tenant = createTenant(Date.now().toString().slice(-6));
  createdTenantIds.push(tenant.id);

  const result = platformAdminService.createTenantUser(tenant.id, {
    fullName: 'Deferred User',
    provisionIdentity: true,
    provisioningMode: 'DIRECT_CREATE',
  } as any);

  delete (globalThis as any).window;
  await provisioningExecutorService.processPending(50);
  await waitForCondition(() => {
    const pendingRow = rowFor(DatabaseManager.getInstance(), result.user.id);
    return col(pendingRow, 'last_error') != null;
  });

  const row = rowFor(db, result.user.id);
  assert.equal(col(row, 'provisioning_status'), 'PENDING', 'no channel must never become PROVISIONED');
  const job = queueRowFor(db, result.user.id);
  assert.ok(['PENDING', 'FAILED'].includes(job.status));
  assert.equal(Number(job.attempts), 0, 'deferral must not consume retry attempts');
});

test('executor completes provisioning through a configured channel and links identity', async () => {
  const db = DatabaseManager.getInstance();
  const tenant = createTenant(Date.now().toString().slice(-6));
  createdTenantIds.push(tenant.id);

  const result = platformAdminService.createTenantUser(tenant.id, {
    fullName: 'Provisioned User',
    provisionIdentity: true,
    provisioningMode: 'DIRECT_CREATE',
  } as any);

  // Point the executor at a mocked central channel that confirms creation.
  db.run(`INSERT OR REPLACE INTO platform_settings (key, value, updated_at) VALUES ('platform.provisioningPath', '/api/v1/tenants/provision-user', ?)`, [new Date().toISOString()]);
  (globalThis as any).window = {
    ceramisys: {
      central: {
        request: async (req: any) => {
          assert.equal(req.path, '/api/v1/tenants/provision-user');
          assert.equal(req.method, 'POST');
          assert.equal(req.headers['Idempotency-Key'], req.body.idempotencyKey);
          return { ok: true, data: { identityUserId: 'ident_test_1' } };
        },
      },
    },
  };

  await provisioningExecutorService.processPending(50);
  await waitForCondition(() => col(rowFor(DatabaseManager.getInstance(), result.user.id), 'provisioning_status') === 'PROVISIONED');

  const row = rowFor(db, result.user.id);
  assert.equal(col(row, 'provisioning_status'), 'PROVISIONED');
  assert.equal(col(row,'identity_user_id'), 'ident_test_1');
  assert.ok(col(row,'provisioned_at'), 'provisioned_at must be set by the executor');
  assert.equal(col(row,'last_error'), null);

  const link = identityLinkService.findByTenantUser(result.user.id);
  assert.ok(link, 'identity link must be created on success');
  assert.equal(link!.linkType, 'TENANT_USER');

  const job = queueRowFor(db, result.user.id);
  assert.equal(job.status, 'PROVISIONED');

  delete (globalThis as any).window;
});

test('executor marks FAILED with the endpoint message when the channel rejects the job', async () => {
  const db = DatabaseManager.getInstance();
  const tenant = createTenant(Date.now().toString().slice(-6));
  createdTenantIds.push(tenant.id);

  const result = platformAdminService.createTenantUser(tenant.id, {
    fullName: 'Rejected User',
    provisionIdentity: true,
    provisioningMode: 'DIRECT_CREATE',
  } as any);

  db.run(`INSERT OR REPLACE INTO platform_settings (key, value, updated_at) VALUES ('platform.provisioningPath', '/api/v1/tenants/provision-user', ?)`, [new Date().toISOString()]);
  (globalThis as any).window = {
    ceramisys: {
      central: {
        request: async () => ({ ok: false, error: 'tenant endpoint said no' }),
      },
    },
  };

  const jobBefore = Number(queueRowFor(db, result.user.id)?.attempts ?? 0);
  await provisioningExecutorService.processPending(50);

  const transientJob = queueRowFor(db, result.user.id);
  assert.equal(transientJob.status, 'RETRYING', 'a transient failure retries rather than going terminal');
  assert.ok(Number(transientJob.attempts) > jobBefore);

  // Drive the job to the terminal attempt cap.
  for (let i = 0; i < 6; i += 1) {
    await provisioningExecutorService.processPending(50);
  }
  await waitForCondition(() => col(rowFor(DatabaseManager.getInstance(), result.user.id), 'provisioning_status') === 'FAILED');

  const row = rowFor(db, result.user.id);
  assert.equal(col(row, 'provisioning_status'), 'FAILED');
  assert.match(String(col(row, 'last_error')), /tenant endpoint said no/);

  const job = queueRowFor(db, result.user.id);
  assert.equal(job.status, 'FAILED');
  assert.ok(Number(job.attempts) >= 5);

  delete (globalThis as any).window;
  db.run(`DELETE FROM platform_settings WHERE key = 'platform.provisioningPath'`);
});

test('invite resend stores a fresh hash and never the plaintext', async () => {
  const db = DatabaseManager.getInstance();
  const tenant = createTenant(Date.now().toString().slice(-6));
  createdTenantIds.push(tenant.id);

  const result = platformAdminService.createTenantUser(tenant.id, {
    fullName: 'Invite User',
    provisionIdentity: true,
    provisioningMode: 'INVITE',
  } as any);

  assert.equal(result.user.provisioningStatus, 'INVITED');
  assert.equal(result.user.identityUserId ?? null, null, 'invites do not fabricate identities either');
  assert.ok(bcrypt.compareSync(result.inviteCode!, col(rowFor(db, result.user.id), 'invite_code')));

  const resent = platformAdminService.resendTenantUserInvite(result.user.id);
  assert.ok(resent.inviteCode, 'a fresh plaintext code is returned once');
  assert.notEqual(resent.inviteCode, result.inviteCode, 'resend must rotate the invite code');

  const row = rowFor(db, result.user.id);
  assert.notEqual(col(row,'invite_code'), resent.inviteCode, 'resent invite must be hashed at rest');
  assert.ok(bcrypt.compareSync(resent.inviteCode!, col(row,'invite_code')));
  assert.equal(resent.user.inviteCode ?? null, null, 'mapped user must not expose the hash or plaintext');
});
