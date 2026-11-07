import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';

test('startup skips unchanged database writes and transaction save failures stay visible', async () => {
  let persistedSnapshot: Uint8Array | null = null;
  let attemptedSnapshot: Uint8Array | null = null;
  let failNextSave = false;
  let saveCalls = 0;

  (globalThis as any).window.ceramisys = {
    db: {
      load: async () => persistedSnapshot,
      save: async (bytes: Uint8Array) => {
        saveCalls++;
        attemptedSnapshot = bytes;
        if (failNextSave) {
          failNextSave = false;
          return { ok: false, code: 'ENOSPC', error: 'disk full' };
        }
        persistedSnapshot = bytes;
        return { ok: true };
      },
    },
  };

  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  assert.ok(persistedSnapshot);
  const savesAfterInitialSetup = saveCalls;
  (manager as any).initializedSuccessfully = false;
  await manager.initialize();
  assert.equal(saveCalls, savesAfterInitialSetup, 'a current database should not be exported and rewritten on every launch');

  const existingSnapshot = persistedSnapshot;
  attemptedSnapshot = null;
  failNextSave = true;

  manager.executeTransaction((transaction) => {
    transaction.run(
      `INSERT INTO system_settings (key, value) VALUES ('durability_failure_sentinel', 'committed')`,
    );
  });
  assert.equal(attemptedSnapshot, null, 'committed transactions should not synchronously export the database');
  await assert.rejects(
    manager.flush(),
    (error: any) => error.code === 'DATABASE_PERSIST_FAILED' && /disk full/.test(error.message),
  );

  assert.ok(attemptedSnapshot, 'the committed transaction must be offered to durable storage');
  assert.equal(manager.query(
    `SELECT value FROM system_settings WHERE key='durability_failure_sentinel'`,
  )[0]?.value, 'committed', 'the failed write was attempted after the in-memory COMMIT');
  assert.equal(persistedSnapshot, existingSnapshot, 'a failed write leaves the prior on-disk snapshot unchanged');

  manager.saveToStorage();
  await manager.flush();
  assert.notEqual(persistedSnapshot, existingSnapshot, 'a later successful save persists the committed data');

  const sql = await (globalThis as any).initSqlJs();
  const restoredDatabase = new sql.Database(persistedSnapshot);
  try {
    const restoredValue = restoredDatabase.exec(
      `SELECT value FROM system_settings WHERE key='durability_failure_sentinel'`,
    )[0]?.values[0]?.[0];
    assert.equal(
      restoredValue,
      'committed',
      'the successful snapshot can be reopened and contains the committed write',
    );
  } finally {
    restoredDatabase.close();
  }
});

test('database manager state survives module re-evaluation during HMR', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  DatabaseManager.setNumberFormatter(() => 'HMR-PERSISTED');
  manager.run(
    `INSERT OR REPLACE INTO system_settings (key, value) VALUES ('database_hmr_sentinel', 'preserved')`,
  );

  try {
    const reloadedDatabaseModule = await import('../src/database/db.ts?hmr=database-manager-state');
    const reloadedManager = reloadedDatabaseModule.DatabaseManager.getInstance();

    assert.equal(reloadedManager, manager, 'module re-evaluation must reuse the live database manager');
    assert.equal(
      reloadedManager.query<{ ready: number }>('SELECT 1 AS ready')[0]?.ready,
      1,
      'database access remains available after module re-evaluation',
    );
    assert.equal(
      reloadedManager.query<{ value: string }>(
        `SELECT value FROM system_settings WHERE key='database_hmr_sentinel'`,
      )[0]?.value,
      'preserved',
      'database rows remain readable after module re-evaluation',
    );
    assert.equal(
      reloadedManager.executeTransaction((transaction) => transaction.nextNumber('HMR')),
      'HMR-PERSISTED',
      'static manager configuration also survives module re-evaluation',
    );
  } finally {
    DatabaseManager.setNumberFormatter(null);
  }
});
