import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';

test('a transaction reports failure when durable storage fails after COMMIT', async () => {
  let persistedSnapshot: Uint8Array | null = null;
  let attemptedSnapshot: Uint8Array | null = null;
  let failNextSave = false;

  (globalThis as any).window.ceramisys = {
    db: {
      load: async () => null,
      saveSync: (bytes: Uint8Array) => {
        attemptedSnapshot = new Uint8Array(bytes);
        if (failNextSave) {
          failNextSave = false;
          return { ok: false, code: 'ENOSPC', error: 'disk full' };
        }
        persistedSnapshot = new Uint8Array(bytes);
        return { ok: true };
      },
    },
  };

  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  assert.ok(persistedSnapshot);
  const existingSnapshot = new Uint8Array(persistedSnapshot);
  failNextSave = true;

  assert.throws(() => manager.executeTransaction((transaction) => {
    transaction.run(
      `INSERT INTO system_settings (key, value) VALUES ('durability_failure_sentinel', 'committed')`,
    );
  }), (error: any) => error.code === 'DATABASE_PERSIST_FAILED' && /disk full/.test(error.message));

  assert.ok(attemptedSnapshot, 'the committed transaction must be offered to durable storage');
  const initSqlJs = (globalThis as any).initSqlJs;
  const SQL = await initSqlJs();
  const attemptedDb = new SQL.Database(attemptedSnapshot);
  assert.equal(attemptedDb.exec(
    `SELECT value FROM system_settings WHERE key='durability_failure_sentinel'`,
  )[0]?.values[0]?.[0], 'committed', 'the failed write was attempted after the in-memory COMMIT');
  attemptedDb.close();

  const persistedDb = new SQL.Database(existingSnapshot);
  assert.equal(persistedDb.exec(
    `SELECT value FROM system_settings WHERE key='durability_failure_sentinel'`,
  ).length, 0, 'a failed durable write leaves the prior on-disk snapshot unchanged');
  persistedDb.close();

  manager.saveToStorage();
  await manager.flush();
});
