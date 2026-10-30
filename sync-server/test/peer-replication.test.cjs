'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPeerReplication, normalizePeers } = require('../peerReplication');
const { normalizeClients } = require('../validation');

const TOKEN = 'peer-test-token-with-at-least-thirty-two-bytes';

function makePeerConfig(overrides = {}) {
  const identity = {
    token: 'local-peer-token-with-at-least-thirty-two-bytes',
    tenantId: 'tenant-test',
    branchId: 'branch-a',
    deviceId: 'peer-branch-b',
    canServePeerSync: true,
    canReplicateBranches: ['branch-b'],
  };
  const [normalizedIdentity] = normalizeClients([identity]);
  const [peer] = normalizePeers([{
    peerId: 'branch-b',
    url: 'http://127.0.0.1:47822',
    token: TOKEN,
    tenantId: 'tenant-test',
    branchId: 'branch-b',
    localDeviceId: 'peer-branch-b',
    ...overrides,
  }], [normalizedIdentity]);
  return { peer, identity: normalizedIdentity };
}

function makeEvent(overrides = {}) {
  return {
    eventId: 'event-branch-b-1',
    tenantId: 'tenant-test',
    branchId: 'branch-b',
    deviceId: 'device-branch-b',
    entityType: 'customer',
    entityId: 'customer-1',
    operationType: 'CREATE',
    entityVersion: 1,
    schemaVersion: 1,
    dataScope: 'TENANT',
    payload: { name: 'Customer' },
    createdAt: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

test('peer configuration requires a local credential scoped to the remote branch', () => {
  const identity = {
    token: 'local-peer-token-with-at-least-thirty-two-bytes',
    tenantId: 'tenant-test',
    branchId: 'branch-a',
    deviceId: 'peer-branch-b',
    canServePeerSync: true,
    canReplicateBranches: ['branch-c'],
  };
  const [normalizedIdentity] = normalizeClients([identity]);
  assert.throws(() => normalizePeers([{
    peerId: 'branch-b',
    url: 'http://127.0.0.1:47822',
    token: TOKEN,
    tenantId: 'tenant-test',
    branchId: 'branch-b',
    localDeviceId: 'peer-branch-b',
  }], [normalizedIdentity]), /authorized for branch branch-b/i);
  assert.throws(() => normalizePeers([{
    peerId: 'branch-b',
    url: 'http://192.168.1.20:47822',
    token: TOKEN,
    tenantId: 'tenant-test',
    branchId: 'branch-b',
    localDeviceId: 'peer-branch-b',
  }], [normalizeClients([{
    ...identity,
    canReplicateBranches: ['branch-b'],
  }])[0]]), /HTTPS/i);
});

test('peer replication persists its cursor only after every event is applied', async () => {
  const { peer } = makePeerConfig();
  let cursor = '0';
  let attempts = 0;
  const pool = {
    async query(sql, params) {
      if (sql.startsWith('SELECT cursor')) return { rows: [{ cursor }] };
      if (sql.startsWith('INSERT INTO sync_peer_cursors')) {
        cursor = params[2];
        return { rows: [] };
      }
      throw new Error(`Unexpected peer cursor query: ${sql}`);
    },
  };
  const worker = createPeerReplication({
    pool,
    peers: [peer],
    logger: { error() {} },
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/sync/replicate/pull');
      assert.equal(options.headers.authorization, `Bearer ${TOKEN}`);
      return {
        ok: true,
        async json() {
          return { events: [makeEvent()], nextCursor: '12' };
        },
      };
    },
    applyEvent: async (_configuredPeer, event) => {
      attempts++;
      assert.equal(event.branchId, 'branch-b');
      if (attempts === 1) throw new Error('Temporary database failure');
    },
  });

  await worker.runOnce();
  assert.equal(cursor, '0');
  await worker.runOnce();
  assert.equal(cursor, '12');
  assert.equal(attempts, 2);
  assert.equal(worker.status()[0].lastError, null);
});

test('peer replication rejects cross-branch events without advancing the cursor', async () => {
  const { peer } = makePeerConfig();
  let cursor = '0';
  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT cursor')) return { rows: [{ cursor }] };
      if (sql.startsWith('INSERT INTO sync_peer_cursors')) {
        cursor = '12';
        return { rows: [] };
      }
      throw new Error(`Unexpected peer cursor query: ${sql}`);
    },
  };
  const worker = createPeerReplication({
    pool,
    peers: [peer],
    logger: { error() {} },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { events: [makeEvent({ branchId: 'branch-a' })], nextCursor: '12' };
      },
    }),
    applyEvent: async () => {
      throw new Error('An out-of-branch event must never be applied');
    },
  });

  await worker.runOnce();
  assert.equal(cursor, '0');
  assert.match(worker.status()[0].lastError, /outside its assigned tenant or branch/i);
});
