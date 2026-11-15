'use strict';

process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { initDatabase, getDb, migrateAuditChain } = require('../lib/db');
const { recordAuditEvent, verifyAuditChain } = require('../lib/audit');
const { AUDIT_GENESIS_HASH } = require('../lib/db');
const { tempDbPath, removeDbFiles } = require('./helpers.cjs');

const dbPath = tempDbPath('audit');

before(async () => {
  await initDatabase({ filename: dbPath });
});

after(async () => {
  await getDb().close();
  removeDbFiles(dbPath);
});

test('audit events form a verifiable hash chain', async () => {
  const first = await recordAuditEvent({ action: 'TEST_ONE', resourceType: 'test', resourceId: '1' });
  const second = await recordAuditEvent({
    action: 'TEST_TWO',
    resourceType: 'test',
    resourceId: '2',
    afterData: { value: 42 },
  });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);

  const rows = await getDb().all('SELECT * FROM platform_audit_events ORDER BY sequence ASC');
  assert.equal(rows[0].prev_hash, AUDIT_GENESIS_HASH);
  assert.equal(rows[1].prev_hash, rows[0].record_hash);

  const result = await verifyAuditChain();
  assert.equal(result.isValid, true);
  assert.equal(result.checkedCount, 2);
  assert.equal(result.lastHash, rows[1].record_hash);
});

test('audit table is append-only at the database level', async () => {
  const db = getDb();
  await assert.rejects(
    () => db.run(`UPDATE platform_audit_events SET action = 'TAMPERED' WHERE sequence = 1`),
    /append-only/
  );
  await assert.rejects(() => db.run('DELETE FROM platform_audit_events WHERE sequence = 1'), /append-only/);

  const row = await db.get('SELECT action FROM platform_audit_events WHERE sequence = 1');
  assert.equal(row.action, 'TEST_ONE');
});

test('tampering is detected even if the triggers are bypassed', async () => {
  const db = getDb();
  await db.exec('DROP TRIGGER IF EXISTS platform_audit_events_no_update');
  await db.run(`UPDATE platform_audit_events SET action = 'TAMPERED' WHERE sequence = 2`);

  const broken = await verifyAuditChain();
  assert.equal(broken.isValid, false);
  assert.equal(broken.reason, 'RECORD_HASH_MISMATCH');
  assert.equal(broken.brokenAtSequence, 2);

  // Restore protection for any later use of this database.
  await migrateAuditChain();
});
