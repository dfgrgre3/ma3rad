const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createHttpSyncClient, createSyncRelay } = require('../electron/syncRelay');

const TOKEN_A = 'branch-a-token-000000000000000000000000000000';
const TOKEN_A_DEVICE_2 = 'branch-a-device-2-token-000000000000000000000';
const TOKEN_B = 'branch-b-token-000000000000000000000000000000';
const TOKEN_HQ = 'head-office-token-000000000000000000000000000000';
const TOKEN_OTHER_TENANT = 'other-tenant-token-0000000000000000000000000000';

async function setup(maxJournalBytes, journalLimits = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ceramisys-sync-relay-'));
  const encryptionKey = randomBytes(32);
  const relay = createSyncRelay({
    journalPath: path.join(directory, 'sync', 'events.jsonl'),
    encryptionKey,
    host: '127.0.0.1',
    port: 0,
    ...(maxJournalBytes ? { maxJournalBytes } : {}),
    ...journalLimits,
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

function requestFromAddress(port, localAddress) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/sync/pull',
      localAddress,
    }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
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

test('sync relay clears expired failed-auth addresses before enforcing capacity', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const context = await setup();
  try {
    const port = context.relay.status().port;
    for (let index = 0; index < 5000; index++) {
      const localAddress = `127.0.${Math.floor(index / 254)}.${(index % 254) + 1}`;
      assert.equal(await requestFromAddress(port, localAddress), 401);
    }

    assert.equal(await requestFromAddress(port, '127.0.20.1'), 429);
    t.mock.timers.setTime(Date.now() + 60000);
    assert.equal(await requestFromAddress(port, '127.0.20.1'), 401);
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

test('sync relay looks up high cursors without filtering the full journal', async () => {
  const context = await setup();
  try {
    const batch = Array.from({ length: 250 }, (_, index) => event(`scalable-${index}`));
    assert.equal((await context.a.pushEvents(batch)).acknowledged.length, batch.length);

    const originalFilter = Array.prototype.filter;
    let filteredJournal = false;
    Array.prototype.filter = function (...args) {
      if (this.length > 1 && this[0] && Number.isSafeInteger(this[0].sequence) && this[0].event) filteredJournal = true;
      return originalFilter.apply(this, args);
    };
    let result;
    try {
      result = await context.b.pullEvents('tenant-1', '254', 1);
    } finally {
      Array.prototype.filter = originalFilter;
    }

    assert.equal(filteredJournal, false, 'cursor lookup should not filter the journal from its beginning');
    assert.deepEqual(result.events.map((item) => item.eventId), ['scalable-249']);
    assert.equal(result.nextCursor, '255');
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay rotates future writes and preserves legacy cursors across restart', async () => {
  const context = await setup();
  try {
    const journalPath = path.join(context.directory, 'sync', 'events.jsonl');
    const largeEvents = Array.from({ length: 20 }, (_, index) =>
      event(`segmented-${index}`, { payload: { value: 'x'.repeat(900_000) } })
    );
    for (const largeEvent of largeEvents) {
      assert.deepEqual(await context.a.pushEvents([largeEvent]), {
        acknowledged: [largeEvent.eventId],
        failed: [],
      });
    }

    const names = await fs.readdir(path.dirname(journalPath));
    const segmentNames = names
      .filter((name) => name.startsWith('events.jsonl.segment-') && name.endsWith('.jsonl'))
      .sort();
    assert.ok(segmentNames.length >= 1, 'future writes should rotate to append-only segments');
    assert.ok(names.includes('events.jsonl'), 'the compatible legacy journal remains present');

    await context.relay.close();
    const restarted = createSyncRelay({
      journalPath,
      encryptionKey: context.encryptionKey,
      host: '127.0.0.1',
      port: 0,
      clients: [
        { token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' },
        { token: TOKEN_B, tenantId: 'tenant-1', branchId: 'branch-b', deviceId: 'device-b1' },
      ],
    });
    const address = await restarted.start();
    try {
      assert.equal(restarted.status().journalEvents, 25);
      const branchB = createHttpSyncClient({
        url: `http://127.0.0.1:${address.port}/`,
        token: TOKEN_B,
        tenantId: 'tenant-1',
        branchId: 'branch-b',
        deviceId: 'device-b1',
      });
      const branchA = createHttpSyncClient({
        url: `http://127.0.0.1:${address.port}/`,
        token: TOKEN_A,
        tenantId: 'tenant-1',
        branchId: 'branch-a',
        deviceId: 'device-a1',
      });
      const legacyPull = await branchB.pullEvents('tenant-1', '4', 1);
      assert.deepEqual(legacyPull.events.map((item) => item.eventId), ['initial-policy-supplier']);
      assert.equal(legacyPull.nextCursor, '5');

      const segmentPull = await branchB.pullEvents('tenant-1', '23', 5);
      assert.deepEqual(segmentPull.events.map((item) => item.eventId), ['segmented-18', 'segmented-19']);
      assert.equal(segmentPull.nextCursor, '25');
      assert.deepEqual(await branchA.pushEvents([largeEvents[0]]), {
        acknowledged: ['segmented-0'],
        failed: [],
      });
      const collision = await branchA.pushEvents([
        event('segmented-0', { payload: { value: 'changed' } }),
      ]);
      assert.equal(collision.acknowledged.length, 0);
      assert.match(collision.failed[0].error, /collision/i);

      const afterRestart = await branchA.pushEvents([event('policy-replayed-after-segmentation')]);
      assert.deepEqual(afterRestart, {
        acknowledged: ['policy-replayed-after-segmentation'],
        failed: [],
      });
      assert.equal(restarted.status().journalEvents, 26);
    } finally {
      await restarted.close();
    }
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay rejects writes at its total storage limit and refuses oversized journals on restart', async () => {
  const maxJournalBytes = 1_500_000;
  const context = await setup(maxJournalBytes);
  const journalPath = path.join(context.directory, 'sync', 'events.jsonl');
  try {
    const oversizedEvent = event('bounded-journal-1', { payload: { value: 'x'.repeat(900_000) } });
    assert.deepEqual(await context.a.pushEvents([oversizedEvent]), {
      acknowledged: [oversizedEvent.eventId],
      failed: [],
    });

    const rejected = await context.a.pushEvents([
      event('bounded-journal-2', { payload: { value: 'x'.repeat(900_000) } }),
    ]);
    assert.equal(rejected.acknowledged.length, 0);
    assert.match(rejected.failed[0].error, /journal is full/i);
    assert.ok(context.relay.status().journalBytes <= maxJournalBytes);
    assert.equal(context.relay.status().journalEvents, 6);

    const oversizedRestart = createSyncRelay({
      journalPath,
      encryptionKey: context.encryptionKey,
      host: '127.0.0.1',
      port: 0,
      maxJournalBytes: context.relay.status().journalBytes - 1,
      clients: [{ token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' }],
    });
    await assert.rejects(() => oversizedRestart.start(), /exceeds its .* storage limit/);
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});

test('sync relay enforces tenant and branch storage quotas', async () => {
  const tenantContext = await setup(undefined, {
    maxTenantJournalBytes: 20_000,
    maxBranchJournalBytes: 18_000,
  });
  try {
    const first = event('tenant-quota-1', { payload: { value: 'x'.repeat(7_000) } });
    assert.deepEqual(await tenantContext.a.pushEvents([first]), {
      acknowledged: [first.eventId],
      failed: [],
    });

    const second = event('tenant-quota-2', {
      branchId: 'branch-b',
      deviceId: 'device-b1',
      payload: { value: 'x'.repeat(7_000) },
    });
    const tenantRejected = await tenantContext.b.pushEvents([second]);
    assert.equal(tenantRejected.acknowledged.length, 0);
    assert.match(tenantRejected.failed[0].error, /tenant quota/i);
  } finally {
    await tenantContext.relay.close();
    await fs.rm(tenantContext.directory, { recursive: true, force: true });
  }

  const branchContext = await setup(undefined, {
    maxTenantJournalBytes: 30_000,
    maxBranchJournalBytes: 15_000,
  });
  try {
    const first = event('branch-quota-1', { payload: { value: 'x'.repeat(7_000) } });
    assert.deepEqual(await branchContext.a.pushEvents([first]), {
      acknowledged: [first.eventId],
      failed: [],
    });

    const second = event('branch-quota-2', {
      deviceId: 'device-a2',
      payload: { value: 'x'.repeat(7_000) },
    });
    const branchRejected = await branchContext.a2.pushEvents([second]);
    assert.equal(branchRejected.acknowledged.length, 0);
    assert.match(branchRejected.failed[0].error, /branch quota/i);
  } finally {
    await branchContext.relay.close();
    await fs.rm(branchContext.directory, { recursive: true, force: true });
  }
});

test('sync relay rejects HTTP except for loopback and requires TLS on non-loopback hosts', async () => {
  for (const host of [
    '192.168.1.10',
    '100.63.255.255',
    '100.64.0.1',
    '100.127.255.254',
    '100.128.0.0',
    '[::ffff:100.64.0.1]',
    'branch.example',
  ]) {
    assert.throws(() => createHttpSyncClient({
      url: `http://${host}:47821/`,
      token: TOKEN_A,
      tenantId: 'tenant-1',
      branchId: 'branch-a',
      deviceId: 'device-a1',
    }), /HTTPS/);
  }
  assert.doesNotThrow(() => createHttpSyncClient({
    url: 'http://127.0.0.1:47821/',
    token: TOKEN_A,
    tenantId: 'tenant-1',
    branchId: 'branch-a',
    deviceId: 'device-a1',
  }));
  assert.doesNotThrow(() => createHttpSyncClient({
    url: 'https://branch.example:47821/',
    token: TOKEN_A,
    tenantId: 'tenant-1',
    branchId: 'branch-a',
    deviceId: 'device-a1',
  }));
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

test('sync relay reloads its durable journal and safely recovers an incomplete final record', async () => {
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
      clients: [
        { token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' },
        { token: TOKEN_B, tenantId: 'tenant-1', branchId: 'branch-b', deviceId: 'device-b1' },
      ],
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
      const restartedBranchB = createHttpSyncClient({
        url: `http://127.0.0.1:${address.port}/`,
        token: TOKEN_B,
        tenantId: 'tenant-1',
        branchId: 'branch-b',
        deviceId: 'device-b1',
      });
      const restartedPull = await restartedBranchB.pullEvents('tenant-1', null, 100);
      assert.ok(restartedPull.events.some((item) => item.eventId === 'survives-restart'));
      assert.equal(restartedPull.nextCursor, '6');
    } finally {
      await restarted.close();
    }

    const journalPath = path.join(context.directory, 'sync', 'events.jsonl');
    const validJournal = await fs.readFile(journalPath);
    const incompleteTail = Buffer.from('{"incomplete":');
    await fs.appendFile(journalPath, incompleteTail);
    const recovered = createSyncRelay({
      journalPath,
      encryptionKey: context.encryptionKey,
      host: '127.0.0.1',
      port: 0,
      clients: [{ token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' }],
    });
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(String(message));
    let recoveredAddress;
    try {
      recoveredAddress = await recovered.start();
    } finally {
      console.warn = originalWarn;
    }
    try {
      assert.equal(recovered.status().journalEvents, 6);
      assert.equal((await fs.readFile(journalPath)).compare(validJournal), 0);
      const quarantined = (await fs.readdir(path.dirname(journalPath)))
        .filter((name) => name.endsWith('.quarantine'));
      assert.equal(quarantined.length, 1);
      assert.deepEqual(
        await fs.readFile(path.join(path.dirname(journalPath), quarantined[0])),
        incompleteTail
      );
      assert.ok(warnings.some((warning) => warning.includes(quarantined[0])));

      const recoveredClient = createHttpSyncClient({
        url: `http://127.0.0.1:${recoveredAddress.port}/`,
        token: TOKEN_A,
        tenantId: 'tenant-1',
        branchId: 'branch-a',
        deviceId: 'device-a1',
      });
      const recoveredEvent = event('appends-after-recovery');
      assert.deepEqual(await recoveredClient.pushEvents([recoveredEvent]), {
        acknowledged: ['appends-after-recovery'],
        failed: [],
      });
      assert.equal(recovered.status().journalEvents, 7);
      await recovered.close();

      const completeTail = await fs.readFile(journalPath);
      assert.equal(completeTail[completeTail.length - 1], 0x0a);
      await fs.writeFile(journalPath, completeTail.subarray(0, -1));
      const completedTailRecovery = createSyncRelay({
        journalPath,
        encryptionKey: context.encryptionKey,
        host: '127.0.0.1',
        port: 0,
        clients: [{ token: TOKEN_A, tenantId: 'tenant-1', branchId: 'branch-a', deviceId: 'device-a1' }],
      });
      const completedTailWarnings = [];
      console.warn = (message) => completedTailWarnings.push(String(message));
      let completedTailAddress;
      try {
        completedTailAddress = await completedTailRecovery.start();
      } finally {
        console.warn = originalWarn;
      }
      try {
        assert.equal(completedTailRecovery.status().journalEvents, 7);
        assert.ok(completedTailWarnings.some((warning) => warning.includes('missing its newline delimiter')));
        const duplicateClient = createHttpSyncClient({
          url: `http://127.0.0.1:${completedTailAddress.port}/`,
          token: TOKEN_A,
          tenantId: 'tenant-1',
          branchId: 'branch-a',
          deviceId: 'device-a1',
        });
        assert.deepEqual(await duplicateClient.pushEvents([recoveredEvent]), {
          acknowledged: ['appends-after-recovery'],
          failed: [],
        });
        assert.equal(completedTailRecovery.status().journalEvents, 7);
      } finally {
        await completedTailRecovery.close();
      }
    } finally {
      await recovered.close();
    }
  } finally {
    await context.relay.close();
    await fs.rm(context.directory, { recursive: true, force: true });
  }
});
