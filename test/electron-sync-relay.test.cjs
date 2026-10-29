const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createHttpSyncClient, createSyncRelay } = require('../electron/syncRelay');

const TOKEN_A = 'branch-a-token-000000000000000000000000000000';
const TOKEN_A_DEVICE_2 = 'branch-a-device-2-token-000000000000000000000';
const TOKEN_B = 'branch-b-token-000000000000000000000000000000';
const TOKEN_HQ = 'head-office-token-000000000000000000000000000000';
const TOKEN_OTHER_TENANT = 'other-tenant-token-0000000000000000000000000000';

async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-sync-relay-'));
  const encryptionKey = randomBytes(32);
  const relay = createSyncRelay({
    journalPath: path.join(directory, 'sync', 'events.jsonl'),
    encryptionKey,
    host: '127.0.0.1',
    port: 0,
    clients: [
      { token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' },
      { token: TOKEN_A_DEVICE_2, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a2' },
      { token: TOKEN_B, tenantId: 'tenant-1', branchId: 'branch-b', deviceId: 'device-b1' },
      {
        token: TOKEN_HQ,
        tenantId: 'tenant-1',
        branchId: 'head-office',
        deviceId: 'device-hq',
        canReadAllBranches: true,
        canManageSyncPolicies: true,
      },
      { token: TOKEN_OTHER_TENANT, tenantId: 'tenant-2', branchId: 'branch-c', deviceId: 'device-c1' },
    ],
  });
  const address = await relay.start();
  const url = `http://127.0.0.1:${address.port}/`;
  const client = (token, branchId, deviceId, tenantId = 'tenant-1') =>
    createHttpSyncClient({ url, token, tenantId, branchId, deviceId });
  const context = {
    directory,
    encryptionKey,
    relay,
    a: client(TOKEN_A, 'branch-a', 'device-a1'),
    a2: client(TOKEN_A_DEVICE_2, 'branch-a', 'device-a2'),
    b: client(TOKEN_B, 'branch-b', 'device-b1'),
    hq: client(TOKEN_HQ, 'head-office', 'device-hq'),
    otherTenant: client(TOKEN_OTHER_TENANT, 'branch-c', 'device-c1', 'tenant-2'),
  };
  const policies = ['category', 'brand', 'product', 'customer', 'supplier'].map((entityType) =>
    event(`initial-policy-${entityType}`, {
      branchId: 'head-office',
      deviceId: 'device-hq',
      entityType: 'sync_policy',
      entityId: entityType,
      operationType: 'UPSERT',
      dataScope: 'TENANT',
      payload: {
        policy: {
          entityType,
          enabled: true,
          outboundEnabled: true,
          inboundEnabled: true,
          dataScope: 'TENANT',
        },
      },
    })
  );
  const result = await context.hq.pushEvents(policies);
  assert.equal(result.acknowledged.length, policies.length, 'head office should seed all entity policies');
  return context;
}

function event(eventId, overrides = {}) {
  return {
    eventId,
    tenantId: 'tenant-1',
    branchId: 'branch-a',
    deviceId: 'device-a1',
    entityType: 'customer',
    entityId: 'customer-1',
    operationType: 'CREATE',
    entityVersion: 1,
    schemaVersion: 1,
    dataScope: 'TENANT',
    payload: { name: 'Customer' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('sync relay authenticates devices and rejects event identity spoofing', async () => {
  const context = await setup();
  try {
    const response = await fetch(`http://127.0.0.1:${context.relay.status().port}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [event('unauthenticated')] }),
    });
    assert.equal(response.status, 401);

    await assert.rejects(() => context.a.pushEvents([
      event('spoofed-branch', { branchId: 'branch-b' }),
    ]), /another branch/);
    await assert.rejects(() => context.a.pushEvents([
      event('spoofed-device', { deviceId: 'device-b1' }),
    ]), /another device/);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay deduplicates event IDs and detects changed event content', async () => {
  const context = await setup();
  try {
    const first = event('dedupe-1');
    assert.deepEqual(await context.a.pushEvents([first]), {
      acknowledged: ['dedupe-1'],
      failed: [],
    });
    assert.deepEqual(await context.a.pushEvents([first]), {
      acknowledged: ['dedupe-1'],
      failed: [],
    });
    const collision = await context.a.pushEvents([event('dedupe-1', { payload: { name: 'Changed' } })]);
    assert.equal(collision.acknowledged.length, 0);
    assert.match(collision.failed[0].error, /collision/i);
    assert.equal(context.relay.status().journalEvents, 6);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay applies tenant, branch, and device visibility while advancing cursors', async () => {
  const context = await setup();
  try {
    assert.deepEqual(await context.a.pushEvents([
      event('tenant-visible'),
      event('branch-private', { dataScope: 'BRANCH' }),
    ]), {
      acknowledged: ['tenant-visible', 'branch-private'],
      failed: [],
    });

    const branchB = await context.b.pullEvents('tenant-1', null, 100);
    assert.ok(branchB.events.some((item) => item.eventId === 'tenant-visible'));
    assert.equal(branchB.nextCursor, '7');

    const sameBranchDevice = await context.a2.pullEvents('tenant-1', null, 100);
    assert.ok(sameBranchDevice.events.some((item) => item.eventId === 'tenant-visible'));
    assert.ok(sameBranchDevice.events.some((item) => item.eventId === 'branch-private'));
    assert.equal(sameBranchDevice.events.filter((item) => item.entityType === 'sync_policy').length, 5);

    const headOffice = await context.hq.pullEvents('tenant-1', null, 100);
    assert.ok(headOffice.events.some((item) => item.eventId === 'tenant-visible'));
    assert.ok(headOffice.events.some((item) => item.eventId === 'branch-private'));

    const otherTenant = await context.otherTenant.pullEvents('tenant-2', null, 100);
    assert.deepEqual(otherTenant.events, []);
    assert.equal(otherTenant.nextCursor, '7');
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay rejects secret-bearing events and requires TLS on non-loopback hosts', async () => {
  assert.throws(() => createHttpSyncClient({
    url: 'http://192.168.1.10:47821/',
    token: TOKEN_A,
    tenantId: 'tenant-1',
    branchId: 'branch-a',
    deviceId: 'device-a1',
  }), /HTTPS/);
  assert.throws(() => createSyncRelay({
    journalPath: 'sync-events.jsonl',
    encryptionKey: randomBytes(32),
    host: '0.0.0.0',
    clients: [],
  }), /HTTPS certificate and key are required/);

  const context = await setup();
  try {
    const result = await context.a.pushEvents([
      event('contains-secret', { payload: { user: { password_hash: 'not-for-sync' } } }),
    ]);
    assert.equal(result.acknowledged.length, 0);
    assert.match(result.failed[0].error, /sensitive payload field/i);
    assert.equal(context.relay.status().journalEvents, 5);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('only the authorized head-office device can publish organization sync policies', async () => {
  const context = await setup();
  const deniedPolicyEvent = event('hq-policy-denied', {
    entityType: 'sync_policy',
    entityId: 'category',
    operationType: 'UPSERT',
    dataScope: 'TENANT',
    payload: {
      policy: {
        entityType: 'category',
        enabled: false,
        outboundEnabled: false,
        inboundEnabled: false,
        dataScope: 'BRANCH',
      },
    },
  });
  const policyEvent = event('hq-policy', {
    branchId: 'head-office',
    deviceId: 'device-hq',
    entityType: 'sync_policy',
    entityId: 'category',
    operationType: 'UPSERT',
    dataScope: 'TENANT',
    payload: {
      policy: {
        entityType: 'category',
        enabled: false,
        outboundEnabled: false,
        inboundEnabled: false,
        dataScope: 'BRANCH',
      },
    },
  });
  try {
    const denied = await context.a.pushEvents([deniedPolicyEvent]);
    assert.equal(denied.acknowledged.length, 0);
    assert.match(denied.failed[0].error, /head-office/i);
    assert.deepEqual(await context.hq.pushEvents([policyEvent]), {
      acknowledged: ['hq-policy'],
      failed: [],
    });
    const salesEvent = event('branch-sales-invoice', {
      entityType: 'sales_invoice',
      entityId: 'invoice-1',
      payload: { record: { id: 'invoice-1', entityType: 'sales_invoice', header: {}, lines: [] } },
    });
    const disabledSales = await context.a.pushEvents([salesEvent]);
    assert.equal(disabledSales.acknowledged.length, 0);
    assert.match(disabledSales.failed[0].error, /policy/i);
    const salesPolicyEvent = event('hq-sales-policy', {
      branchId: 'head-office',
      deviceId: 'device-hq',
      entityType: 'sync_policy',
      entityId: 'sales_invoice',
      operationType: 'UPSERT',
      dataScope: 'TENANT',
      payload: {
        policy: {
          entityType: 'sales_invoice',
          enabled: true,
          outboundEnabled: true,
          inboundEnabled: true,
          dataScope: 'TENANT',
        },
      },
    });
    assert.deepEqual(await context.hq.pushEvents([salesPolicyEvent]), {
      acknowledged: ['hq-sales-policy'],
      failed: [],
    });
    assert.deepEqual(await context.a.pushEvents([salesEvent]), {
      acknowledged: ['branch-sales-invoice'],
      failed: [],
    });
    const received = await context.b.pullEvents('tenant-1', null, 100);
    assert.ok(received.events.some((item) => item.eventId === 'hq-policy'));
    assert.ok(received.events.some((item) => item.eventId === 'branch-sales-invoice'));
    assert.equal(received.events.filter((item) => item.entityType === 'sync_policy').length, 7);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay reloads its durable journal and rejects corrupt or incomplete records', async () => {
  const context = await setup();
  try {
    const persistedEvent = event('survives-restart');
    await context.a.pushEvents([persistedEvent]);
    const journalBytes = await fs.readFile(path.join(context.directory, 'sync', 'events.jsonl'), 'utf8');
    assert.equal(journalBytes.includes('Customer'), false, 'journal payloads are encrypted at rest');
    await context.relay.close();
    const restarted = createSyncRelay({
      journalPath: path.join(context.directory, 'sync', 'events.jsonl'),
      encryptionKey: context.encryptionKey,
      host: '127.0.0.1',
      port: 0,
      clients: [{ token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' }],
    });
    const address = await restarted.start();
    try {
      assert.equal(restarted.status().journalEvents, 6);
      const restartedClient = createHttpSyncClient({
        url: `http://127.0.0.1:${address.port}/`,
        token: TOKEN_A,
        tenantId: 'tenant-1',
        branchId: 'branch-a',
        deviceId: 'device-a1',
      });
      assert.deepEqual(await restartedClient.pushEvents([persistedEvent]), {
        acknowledged: ['survives-restart'],
        failed: [],
      });
    } finally {
      await restarted.close();
    }

    await fs.appendFile(path.join(context.directory, 'sync', 'events.jsonl'), '{"incomplete":');
    const corrupted = createSyncRelay({
      journalPath: path.join(context.directory, 'sync', 'events.jsonl'),
      encryptionKey: context.encryptionKey,
      host: '127.0.0.1',
      port: 0,
      clients: [{ token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' }],
    });
    await assert.rejects(() => corrupted.start(), /incomplete final record/);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});
