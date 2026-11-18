const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startPendingRestoreWatcher } = require('../electron/centralAppBackup');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('pending restore watcher broadcasts only on signature changes and stops cleanly', async () => {
  let pending = { id: 'bak_1', restoreStatus: 'REQUESTED', name: 'nightly' };
  let calls = 0;
  const client = { pendingRestore: async () => { calls += 1; return pending; } };
  const broadcasts = [];

  const watcher = startPendingRestoreWatcher({
    client,
    broadcast: (value) => broadcasts.push(value),
    intervalMs: 15,
    firstCheckMs: 5,
  });

  await sleep(60);
  assert.equal(broadcasts.length, 1, 'initial pending restore is broadcast once');
  assert.equal(broadcasts[0].id, 'bak_1');

  await sleep(60);
  assert.equal(broadcasts.length, 1, 'unchanged signature is not re-broadcast');

  pending = { id: 'bak_1', restoreStatus: 'APPLIED', name: 'nightly' };
  await sleep(60);
  assert.equal(broadcasts.length, 2, 'status change triggers a new broadcast');
  assert.equal(broadcasts[1].restoreStatus, 'APPLIED');

  watcher.stop();
  const callsAtStop = calls;
  await sleep(50);
  assert.equal(calls, callsAtStop, 'stop() halts polling');
});

test('pending restore watcher stays silent when central is unreachable', async () => {
  const client = { pendingRestore: async () => { throw new Error('offline'); } };
  const broadcasts = [];
  const watcher = startPendingRestoreWatcher({
    client,
    broadcast: (value) => broadcasts.push(value),
    intervalMs: 10,
    firstCheckMs: 5,
  });
  await sleep(45);
  assert.equal(broadcasts.length, 0);
  watcher.stop();
});
