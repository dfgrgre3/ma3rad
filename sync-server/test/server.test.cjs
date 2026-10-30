'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
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

function createMemoryPool(initialPolicies = []) {
  const events = new Map();
  const cursors = new Map();
  const policies = new Map(initialPolicies);
  let sequence = 0;

  function toEventRow(event) {
    return {
      sequence: String(event.sequence),
      eventId: event.eventId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      deviceId: event.deviceId,
      entityType: event.entityType,
      entityId: event.entityId,
      operationType: event.operationType,
      entityVersion: event.entityVersion,
      schemaVersion: event.schemaVersion,
      dataScope: event.dataScope,
      payload: event.payload,
      createdAt: new Date(event.createdAt).toISOString(),
    };
  }

  return {
    events,
    async query(sql, params = []) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS') || sql === 'SELECT 1') return { rows: [] };
      if (sql.startsWith('SELECT cursor::text')) {
        return { rows: cursors.has(params[1]) ? [{ cursor: cursors.get(params[1]) }] : [] };
      }
      if (sql.startsWith('INSERT INTO sync_peer_cursors')) {
        cursors.set(params[1], params[2]);
        return { rows: [] };
      }
      if (sql.includes('SELECT sequence::text AS sequence')) {
        const rows = [...events.values()]
          .filter((event) => event.tenantId === params[0] &&
            BigInt(event.sequence) > BigInt(params[1]) &&
            event.branchId === params[2] &&
            event.deviceId !== params[3])
          .sort((left, right) => Number(left.sequence) - Number(right.sequence))
          .slice(0, params[4])
          .map(toEventRow);
        return { rows };
      }
      if (sql.includes('COALESCE(MAX(sequence)')) {
        const branchId = sql.includes('branch_id = $2') ? params[1] : null;
        const minimum = BigInt(sql.includes('branch_id = $2') ? params[2] : params[1]);
        const sequences = [...events.values()]
          .filter((event) => event.tenantId === params[0] &&
            (!branchId || event.branchId === branchId))
          .map((event) => BigInt(event.sequence));
        const max = sequences.reduce((value, candidate) => candidate > value ? candidate : value, minimum);
        return { rows: [{ cursor: max.toString() }] };
      }
      throw new Error(`Unexpected memory-pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
          if (sql.includes('FROM sync_entity_policies')) {
            const policy = policies.get(params[1]);
            return { rows: policy ? [policy] : [] };
          }
          if (sql.includes('INSERT INTO sync_events')) {
            const key = `${params[0]}\0${params[1]}`;
            if (events.has(key)) return { rowCount: 0, rows: [] };
            const event = {
              sequence: ++sequence,
              tenantId: params[0],
              eventId: params[1],
              branchId: params[2],
              deviceId: params[3],
              entityType: params[4],
              entityId: params[5],
              operationType: params[6],
              entityVersion: params[7],
              schemaVersion: params[8],
              dataScope: params[9],
              payload: JSON.parse(params[10]),
              createdAt: params[11],
            };
            events.set(key, event);
            return { rowCount: 1, rows: [{ sequence: String(sequence) }] };
          }
          if (sql.includes('FROM sync_events WHERE tenant_id')) {
            const event = events.get(`${params[0]}\0${params[1]}`);
            return { rows: event ? [toEventRow(event)] : [] };
          }
          throw new Error(`Unexpected memory-pool transaction query: ${sql}`);
        },
        release() {},
      };
    },
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
  assert.throws(() => normalizeClients([{
    ...identity,
    canServePeerSync: true,
    canReadAllBranches: true,
    canReplicateBranches: ['branch-remote'],
  }]), /must not read all/i);
  assert.throws(() => normalizeClients([{
    ...identity,
    canServePeerSync: true,
    canReplicateBranches: [identity.branchId],
  }]), /own branch/i);
});

test('peer credentials preserve remote branch and device identities only for authorized branches', () => {
  const [peerIdentity] = normalizeClients([{
    ...identity,
    canServePeerSync: true,
    canReplicateBranches: ['branch-remote'],
  }]);
  const remoteEvent = makeEvent({
    branchId: 'branch-remote',
    deviceId: 'original-remote-device',
  });
  const replicated = validateEvent(remoteEvent, peerIdentity, { allowReplication: true });
  assert.equal(replicated.branchId, 'branch-remote');
  assert.equal(replicated.deviceId, 'original-remote-device');
  assert.throws(() => validateEvent(remoteEvent, peerIdentity), /branch/i);
  assert.throws(() => validateEvent(
    { ...remoteEvent, branchId: 'another-branch' },
    peerIdentity,
    { allowReplication: true }
  ), /branch/i);
  const policyEvent = makeEvent({
    branchId: 'branch-remote',
    deviceId: 'original-remote-device',
    entityType: 'sync_policy',
    entityId: 'customer',
    operationType: 'UPSERT',
    payload: {
      policy: {
        entityType: 'customer',
        enabled: true,
        outboundEnabled: true,
        inboundEnabled: true,
        dataScope: 'TENANT',
      },
    },
  });
  assert.throws(() => validateEvent(policyEvent, peerIdentity, { allowReplication: true }), /head-office/i);
  const [policyPeerIdentity] = normalizeClients([{
    ...identity,
    canServePeerSync: true,
    canReplicateBranches: ['branch-remote'],
    canReplicatePolicies: true,
  }]);
  assert.doesNotThrow(() => validateEvent(policyEvent, policyPeerIdentity, { allowReplication: true }));
});

test('Docker environment example configures an isolated branch and its direct peer', async () => {
  const contents = await fs.readFile(path.join(__dirname, '..', '.env.example'), 'utf8');
  const dockerfile = await fs.readFile(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  const clientsMatch = contents.match(/^CERAMISYS_SYNC_CLIENTS='([^']+)'$/m);
  const peersMatch = contents.match(/^CERAMISYS_SYNC_PEERS='([^']+)'$/m);
  assert.ok(clientsMatch, 'example must define a single-quoted CERAMISYS_SYNC_CLIENTS JSON array');
  assert.ok(peersMatch, 'example must define a single-quoted CERAMISYS_SYNC_PEERS JSON array');

  const clients = normalizeClients(JSON.parse(clientsMatch[1]));
  assert.equal(clients.length, 2);
  assert.equal(new Set(clients.map((client) => client.token)).size, clients.length);
  assert.ok(clients.every((client) => Buffer.byteLength(client.token) >= 32));
  assert.deepEqual(
    clients.filter((client) => client.canManageSyncPolicies).map((client) => client.deviceId),
    ['device-1'],
  );
  const peerIdentity = clients.find((client) => client.deviceId === 'peer-branch-2');
  assert.equal(peerIdentity.canServePeerSync, true);
  assert.deepEqual(peerIdentity.canReplicateBranches, ['branch-2']);

  const [peer] = JSON.parse(peersMatch[1]);
  assert.equal(peer.peerId, 'branch-2');
  assert.equal(peer.branchId, 'branch-2');
  assert.equal(peer.localDeviceId, 'peer-branch-2');
  assert.ok(Buffer.byteLength(peer.token) >= 32);
  assert.match(dockerfile, /COPY .*peerReplication\.js .*schema\.sql/);
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

test('peer pull is restricted to the authenticated server branch', async () => {
  const queries = [];
  const peerIdentity = {
    token: 'peer-pull-token-with-at-least-thirty-two-bytes',
    tenantId: identity.tenantId,
    branchId: 'branch-test',
    deviceId: 'peer-remote',
    canServePeerSync: true,
    canReplicateBranches: ['branch-remote'],
  };
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [] };
      if (sql.includes('SELECT sequence::text AS sequence')) return { rows: [] };
      if (sql.includes('COALESCE(MAX(sequence)')) return { rows: [{ cursor: String(params[2]) }] };
      throw new Error(`Unexpected peer pull query: ${sql}`);
    },
    async connect() {
      throw new Error('Peer pull must not open a write transaction');
    },
  };
  const service = createSyncServer({ pool, clients: [peerIdentity], port: 0 });
  const address = await service.start();
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/sync/replicate/pull?scope=${identity.tenantId}&cursor=0&limit=100`,
      { headers: { authorization: `Bearer ${peerIdentity.token}` } }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { events: [], nextCursor: '0' });
    const pullQuery = queries.find(({ sql }) => sql.includes('SELECT sequence::text AS sequence'));
    assert.match(pullQuery.sql, /branch_id = \$3 AND device_id <> \$4/);
    assert.deepEqual(pullQuery.params, [identity.tenantId, '0', 'branch-test', 'peer-remote', 101]);
  } finally {
    await service.close();
  }
});

test('peer push accepts only authorized source branches and preserves original device identity', async () => {
  const peerIdentity = {
    token: 'peer-push-token-with-at-least-thirty-two-bytes',
    tenantId: identity.tenantId,
    branchId: 'branch-test',
    deviceId: 'peer-remote',
    canServePeerSync: true,
    canReplicateBranches: ['branch-remote'],
  };
  const storedEvents = new Map();
  const pool = {
    async query(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [] };
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
          if (sql.includes('INSERT INTO sync_events')) {
            storedEvents.set(params[1], { branchId: params[2], deviceId: params[3] });
            return { rowCount: 1, rows: [{ sequence: '1' }] };
          }
          throw new Error(`Unexpected peer push query: ${sql}`);
        },
        release() {},
      };
    },
  };
  const service = createSyncServer({ pool, clients: [peerIdentity], port: 0 });
  const address = await service.start();
  const remoteEvent = makeEvent({
    eventId: 'remote-event',
    branchId: 'branch-remote',
    deviceId: 'original-remote-device',
  });
  const push = (path, event) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${peerIdentity.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ events: [event] }),
  });
  try {
    const replicatedResponse = await push('/sync/replicate/push', remoteEvent);
    assert.deepEqual(await replicatedResponse.json(), { acknowledged: ['remote-event'], failed: [] });
    assert.deepEqual(storedEvents.get('remote-event'), {
      branchId: 'branch-remote',
      deviceId: 'original-remote-device',
    });

    const ordinaryResponse = await push('/sync/push', { ...remoteEvent, eventId: 'forbidden-event' });
    assert.equal(ordinaryResponse.status, 403);
    assert.equal(storedEvents.has('forbidden-event'), false);
  } finally {
    await service.close();
  }
});

test('two branch servers exchange source-branch events over the peer protocol', async () => {
  const tenantId = 'tenant-p2p-test';
  const branchBDevice = {
    token: 'branch-b-device-token-with-at-least-thirty-two-bytes',
    tenantId,
    branchId: 'branch-b',
    deviceId: 'device-branch-b',
  };
  const branchBPeerA = {
    token: 'branch-b-issued-peer-token-with-at-least-thirty-two-bytes',
    tenantId,
    branchId: 'branch-b',
    deviceId: 'peer-branch-a',
    canServePeerSync: true,
    canReplicateBranches: ['branch-a'],
  };
  const branchAPeerB = {
    token: 'branch-a-issued-peer-token-with-at-least-thirty-two-bytes',
    tenantId,
    branchId: 'branch-a',
    deviceId: 'peer-branch-b',
    canServePeerSync: true,
    canReplicateBranches: ['branch-b'],
  };
  const policy = { enabled: true, outboundEnabled: true, dataScope: 'TENANT' };
  const branchBPool = createMemoryPool([['customer', policy]]);
  const branchAPool = createMemoryPool();
  const branchB = createSyncServer({
    pool: branchBPool,
    clients: [branchBDevice, branchBPeerA],
    port: 0,
  });
  const branchBAddress = await branchB.start();
  const configuredBranchA = createSyncServer({
    pool: branchAPool,
    clients: [branchAPeerB],
    peers: [{
      peerId: 'branch-b',
      url: `http://127.0.0.1:${branchBAddress.port}`,
      token: branchBPeerA.token,
      tenantId,
      branchId: 'branch-b',
      localDeviceId: 'peer-branch-b',
    }],
    port: 0,
  });
  const branchAAddress = await configuredBranchA.start();
  try {
    await configuredBranchA.peerReplication.runOnce();
    const sourceEvent = makeEvent({
      eventId: 'branch-b-source-event',
      tenantId,
      branchId: 'branch-b',
      deviceId: branchBDevice.deviceId,
      dataScope: 'TENANT',
    });
    const sourceResponse = await fetch(`http://127.0.0.1:${branchBAddress.port}/sync/push`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${branchBDevice.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ events: [sourceEvent] }),
    });
    assert.deepEqual(await sourceResponse.json(), {
      acknowledged: [sourceEvent.eventId],
      failed: [],
    });

    await configuredBranchA.peerReplication.runOnce();
    const replicated = branchAPool.events.get(`${tenantId}\0${sourceEvent.eventId}`);
    assert.ok(replicated, 'branch A must durably store branch B event');
    assert.equal(replicated.branchId, 'branch-b');
    assert.equal(replicated.deviceId, branchBDevice.deviceId);
  } finally {
    await configuredBranchA.close();
    await branchB.close();
  }
});

test('sync event ID deduplication rejects a changed creation timestamp', async () => {
  const events = new Map();
  const policies = new Map([['customer', { enabled: true, outboundEnabled: true, dataScope: 'TENANT' }]]);
  const pool = {
    async query(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [] };
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.includes('FROM sync_entity_policies')) {
            return { rows: [policies.get(params[1])] };
          }
          if (sql.includes('INSERT INTO sync_events')) {
            const key = `${params[0]}\0${params[1]}`;
            if (events.has(key)) return { rowCount: 0, rows: [] };
            events.set(key, {
              branchId: params[2],
              deviceId: params[3],
              entityType: params[4],
              entityId: params[5],
              operationType: params[6],
              entityVersion: params[7],
              schemaVersion: params[8],
              dataScope: params[9],
              payload: JSON.parse(params[10]),
              createdAt: params[11],
            });
            return { rowCount: 1, rows: [{ sequence: '1' }] };
          }
          if (sql.includes('FROM sync_events WHERE tenant_id')) {
            const stored = events.get(`${params[0]}\0${params[1]}`);
            return {
              rows: stored ? [{
                ...stored,
                createdAt: new Date(stored.createdAt).toISOString().replace(/(\.\d{3})Z$/, '$1Z'),
              }] : [],
            };
          }
          throw new Error(`Unexpected SQL in sync test: ${sql}`);
        },
        release() {},
      };
    },
  };
  const service = createSyncServer({ pool, clients: [identity], port: 0 });
  const address = await service.start();
  const push = async (event) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/sync/push`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    });
    return response.json();
  };
  const event = makeEvent({ createdAt: '2026-10-30T00:00:00.000Z' });
  try {
    assert.deepEqual(await push(event), { acknowledged: [event.eventId], failed: [] });
    const replay = await push({ ...event, createdAt: '2026-10-30T00:00:00.500Z' });
    assert.deepEqual(replay.acknowledged, []);
    assert.match(replay.failed[0].error, /collision/i);
  } finally {
    await service.close();
  }
});
