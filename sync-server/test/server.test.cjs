'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSyncServer, readCursor } = require('../server');
const {
  normalizeClients,
  validateEvent,
} = require('../validation');

const TOKEN = 'server-test-token-with-at-least-thirty-two-bytes';
const identity = {
  token: TOKEN,
  tenantId: 'tenant-test',
  branchId: 'branch-test',
  deviceId: 'device-test',
};

function makeEvent(overrides = {}) {
  return {
    eventId: 'event-test',
    tenantId: identity.tenantId,
    branchId: identity.branchId,
    deviceId: identity.deviceId,
    entityType: 'customer',
    entityId: 'customer-test',
    operationType: 'CREATE',
    entityVersion: 1,
    schemaVersion: 1,
    dataScope: 'TENANT',
    payload: { name: 'Test customer' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('sync server validates event identity, payload safety, and policy authority', () => {
  const normalizedIdentity = normalizeClients([identity])[0];
  assert.equal(validateEvent(makeEvent(), normalizedIdentity).tenantId, 'tenant-test');
  assert.throws(() => validateEvent(makeEvent({ branchId: 'other-branch' }), normalizedIdentity), /branch/);
  assert.throws(() => validateEvent(makeEvent({ payload: { user: { password_hash: 'secret' } } }), normalizedIdentity), /sensitive/i);
  assert.throws(() => validateEvent(makeEvent({ createdAt: 'not-a-date' }), normalizedIdentity), /creation time/i);
  assert.throws(() => validateEvent(makeEvent({
    entityType: 'sync_policy',
    entityId: 'customer',
    operationType: 'UPSERT',
    payload: { policy: { entityType: 'customer', enabled: true, outboundEnabled: true, inboundEnabled: true, dataScope: 'TENANT' } },
  }), normalizedIdentity), /head-office/i);
});

test('sync server rejects duplicate device identities and short credentials', () => {
  assert.throws(() => normalizeClients([{ ...identity, token: 'short' }]), /32 bytes/i);
  assert.throws(() => normalizeClients([identity, { ...identity, token: `${TOKEN}-other` }]), /unique/i);
});

test('sync cursors accept bounded decimal values only', () => {
  assert.equal(readCursor(null), 0n);
  assert.equal(readCursor('12345'), 12345n);
  assert.throws(() => readCursor('-1'), /cursor/i);
  assert.throws(() => readCursor('1.5'), /cursor/i);
  assert.throws(() => readCursor('9223372036854775808'), /cursor/i);
});

test('sync server requires TLS for non-loopback listeners', () => {
  const pool = { query: async () => ({ rows: [] }), connect: async () => ({}) };
  assert.throws(() => createSyncServer({
    pool, clients: [identity], host: '0.0.0.0',
  }), /HTTPS certificate and key/i);
});

test('sync server exposes liveness and rejects unauthenticated sync access', async () => {
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { throw new Error('Database should not be used by unauthenticated requests'); },
  };
  const service = createSyncServer({ pool, clients: [identity], port: 0 });
  const address = await service.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const unauthorized = await fetch(`${baseUrl}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [makeEvent()] }),
    });
    assert.equal(unauthorized.status, 401);
  } finally {
    await service.close();
  }
});

test('sync pull is tenant-scoped, branch-visible, and excludes the sending device', async () => {
  const pullQueries = [];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [] };
      if (sql.includes('SELECT sequence::text AS sequence')) {
        pullQueries.push({ sql, params });
        return { rows: [] };
      }
      if (sql.includes('COALESCE(MAX(sequence)')) return { rows: [{ cursor: String(params[1]) }] };
      return { rows: [] };
    },
    async connect() { throw new Error('Pull must not open a write transaction'); },
  };
  const headOffice = {
    token: 'head-office-sync-token-with-at-least-thirty-two-bytes',
    tenantId: identity.tenantId,
    branchId: 'head-office',
    deviceId: 'device-hq',
    canReadAllBranches: true,
  };
  const service = createSyncServer({ pool, clients: [identity, headOffice], port: 0 });
  const address = await service.start();
  try {
    for (const token of [TOKEN, headOffice.token]) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/sync/pull?scope=${identity.tenantId}&cursor=0&limit=100`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).events, []);
    }
    assert.match(pullQueries[0].sql, /branch_id = \$3/);
    assert.match(pullQueries[0].sql, /device_id <> \$4/);
    assert.deepEqual(pullQueries[0].params, [identity.tenantId, '0', identity.branchId, identity.deviceId, 101]);
    assert.match(pullQueries[1].sql, /device_id <> \$3/);
    assert.deepEqual(pullQueries[1].params, [identity.tenantId, '0', headOffice.deviceId, 101]);
  } finally {
    await service.close();
  }
});
