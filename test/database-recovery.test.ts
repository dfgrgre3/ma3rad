import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';

test('database recovery preserves unreadable data and requires an explicit fresh-database choice', async () => {
  let loadMode: 'read-error' | 'corrupt' | 'missing' = 'read-error';
  let preserveCalls = 0;
  let saveCalls = 0;
  let archiveCalls = 0;
  let diskFull = true;
  (globalThis as any).window.ceramisys = {
    db: {
      load: async () => {
        if (loadMode === 'read-error') throw new Error('temporary read failure');
        return loadMode === 'corrupt' ? new Uint8Array([1, 2, 3]) : null;
      },
      preserveCorrupt: async () => {
        preserveCalls++;
        return { path: 'recovery/corrupt.sqlite', bytes: 3 };
      },
      createFreshAfterRecovery: async () => {
        archiveCalls++;
        loadMode = 'missing';
        return { ok: true, path: 'recovery/replaced.sqlite' };
      },
      save: async () => {
        saveCalls++;
        if (diskFull) return { ok: false, error: 'ENOSPC' };
        return { ok: true };
      },
    },
  };

  const manager = DatabaseManager.getInstance();
  await assert.rejects(manager.initialize(), (error: any) => error.code === 'DATABASE_RECOVERY_REQUIRED');
  assert.equal(preserveCalls, 1, 'a raw backup is attempted on read failure');
  assert.equal(saveCalls, 0, 'a read failure never creates or saves a fresh database');

  loadMode = 'corrupt';
  await assert.rejects(manager.initialize(), (error: any) => error.code === 'DATABASE_RECOVERY_REQUIRED');
  assert.equal(preserveCalls, 2, 'the unreadable database is copied before recovery is offered');
  assert.equal(saveCalls, 0, 'a corrupt database is never overwritten automatically');

  await manager.createFreshAfterRecovery();
  assert.equal(archiveCalls, 1, 'fresh creation uses the explicit recovery action');
  await assert.rejects(manager.initialize(), /تعذر حفظ قاعدة البيانات/);
  assert.equal(saveCalls, 1, 'disk-full failures are surfaced instead of starting an unsaved database');
  diskFull = false;
  await manager.initialize();
  assert.equal(saveCalls, 2, 'a retry can persist the explicitly created database');
});
