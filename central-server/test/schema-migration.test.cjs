'use strict';

process.env.NODE_ENV = 'test';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const { initDatabase, getDb, migrateAuditChain, AUDIT_GENESIS_HASH } = require('../lib/db');
const { verifyAuditChain } = require('../lib/audit');
const { tempDbPath, removeDbFiles, openRawDatabase } = require('./helpers.cjs');

const createdPaths = [];

after(async () => {
  try {
    await getDb().close();
  } catch {
    // already closed
  }
  for (const filename of createdPaths) removeDbFiles(filename);
});

test('legacy audit rows are backfilled into the hash chain on first boot', async () => {
  const filename = tempDbPath('legacy-audit');
  createdPaths.push(filename);

  const raw = await openRawDatabase(filename);
  await raw.exec(`
    CREATE TABLE platform_audit_events (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL DEFAULT 'PLATFORM',
      actor_id TEXT,
      actor_name TEXT,
      tenant_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      before_data TEXT,
      after_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO platform_audit_events (id, action, resource_type, resource_id, created_at)
      VALUES ('legacy_1', 'TENANT_CREATED', 'platform_tenants', 't1', '2026-01-01T00:00:00.000Z');
    INSERT INTO platform_audit_events (id, action, resource_type, resource_id, created_at)
      VALUES ('legacy_2', 'LICENSE_ISSUED', 'platform_licenses', 'l1', '2026-01-02T00:00:00.000Z');
  `);
  await raw.close();

  await initDatabase({ filename });

  const rows = await getDb().all('SELECT * FROM platform_audit_events ORDER BY sequence ASC');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sequence, 1);
  assert.equal(rows[1].sequence, 2);
  assert.equal(rows[0].prev_hash, AUDIT_GENESIS_HASH);
  assert.equal(rows[1].prev_hash, rows[0].record_hash);
  assert.ok(rows.every((row) => typeof row.record_hash === 'string' && row.record_hash.length === 64));

  const verification = await verifyAuditChain();
  assert.equal(verification.isValid, true);
  assert.equal(verification.checkedCount, 2);

  // Triggers must be installed after the one-off backfill.
  await assert.rejects(
    () => getDb().run('DELETE FROM platform_audit_events WHERE sequence = 1'),
    /append-only/
  );
});

test('legacy admin tables and audit triggers migrate idempotently', async () => {
  const filename = tempDbPath('legacy-identity');
  createdPaths.push(filename);

  const raw = await openRawDatabase(filename);
  await raw.exec(`
    CREATE TABLE platform_admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
      permissions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE platform_admin_sessions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO platform_admins (id, username, password_hash, full_name)
      VALUES ('usr_legacy', 'legacy-admin', 'hash', 'Legacy Admin');
    INSERT INTO platform_admin_sessions (id, admin_id, token, expires_at)
      VALUES ('sess_legacy', 'usr_legacy', 'legacy-token', '2099-01-01T00:00:00.000Z');
  `);
  await raw.close();

  await initDatabase({ filename });

  const tables = (await getDb().all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((row) => row.name);
  assert.ok(tables.includes('platform_users'));
  assert.ok(!tables.includes('platform_admins'));
  assert.ok(tables.includes('platform_sessions'));
  assert.ok(!tables.includes('platform_admin_sessions'));

  const user = await getDb().get(`SELECT * FROM platform_users WHERE id = 'usr_legacy'`);
  assert.equal(user.username, 'legacy-admin');
  assert.equal(user.data_scope, 'ALL');

  const session = await getDb().get(`SELECT * FROM platform_sessions WHERE id = 'sess_legacy'`);
  assert.equal(session.user_id, 'usr_legacy');
  assert.ok(session.last_activity_at);

  // Second boot must be a no-op, not an error.
  await initDatabase({ filename });
  const triggers = await getDb().all(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'platform_audit_events_no_%'`
  );
  assert.equal(triggers.length, 2);

  // Re-running the audit migration keeps the triggers and the chain intact.
  await migrateAuditChain();
  const verification = await verifyAuditChain();
  assert.equal(verification.isValid, true);
});
