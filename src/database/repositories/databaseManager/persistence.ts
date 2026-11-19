import type { DatabaseManager } from '../databaseManager';
import { AppError, toAppError } from '../../../errors/appError';
import { DB_STORAGE_KEY } from './constants';
import type { IdleCallbackHost } from './constants';
import type { DatabaseManagerInternals } from './internals';
import { importAsyncService } from './asyncApi';
import { deleteBrowserSnapshot, getBrowserSnapshotEncryptionState, writeBrowserSnapshot } from './storage';
import { persistenceErrorMessage } from './utils';

const SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS = 500;
const SLOW_SNAPSHOT_PERSIST_THRESHOLD_MS = 10000;

/**
 * Snapshot export, debounced/idle saving, serialized persistence to the
 * configured backend (Electron file API, IndexedDB, localStorage) and flush.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export function scheduleDebouncedSave(host: DatabaseManager, delayMs = 3000): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.persistenceSuppressed || h.transactionDepth > 0) return;
  if (h.debounceSaveTimer) clearTimeout(h.debounceSaveTimer);
  cancelIdleSave(host);
  h.debounceSaveTimer = setTimeout(() => {
    h.debounceSaveTimer = null;
    // Throttle: if a save just completed recently, skip this debounced save
    // to avoid back-to-back full-database exports that freeze the UI.
    const now = Date.now();
    if (now - h.lastSaveStartMs < h.SAVE_MIN_INTERVAL_MS) {
      // Too soon after the last save; re-schedule instead of skipping entirely so
      // we don't silently lose pending changes (setting dirtySinceLastSave=false here
      // was a data-loss bug — changes could go un-persisted until the next mutation).
      scheduleDebouncedSave(host, h.SAVE_MIN_INTERVAL_MS);
      return;
    }
    const idleHost = globalThis as IdleCallbackHost;
    if (typeof idleHost.requestIdleCallback === 'function') {
      h.idleSaveHandle = idleHost.requestIdleCallback(() => {
        h.idleSaveHandle = null;
        saveToStorage(host);
      }, { timeout: 10000 });
    } else {
      // requestIdleCallback not available (some Electron builds): give the renderer
      // 300 ms of idle time so button presses and form submissions can paint before
      // we start the synchronous multi-megabyte db.export().
      h.idleSaveTimer = setTimeout(() => {
        h.idleSaveTimer = null;
        saveToStorage(host);
      }, 300);
    }
  }, delayMs);
}

export function saveToStorage(host: DatabaseManager, force = false): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.persistenceSuppressed || !h.db) return;
  if (h.debounceSaveTimer) {
    clearTimeout(h.debounceSaveTimer);
    h.debounceSaveTimer = null;
  }
  cancelIdleSave(host);
  if (!h.dirtySinceLastSave) return;
  if (h.saveInProgress) return; // Already saving; skip to avoid UI freeze
  const now = Date.now();
  if (!force && now - h.lastSaveStartMs < h.SAVE_MIN_INTERVAL_MS) {
    // Too soon after the last save; re-schedule instead of clearing the dirty
    // flag (clearing it here was a data-loss bug — changes could go
    // un-persisted until the next mutation).
    scheduleDebouncedSave(host, h.SAVE_MIN_INTERVAL_MS);
    return;
  }
  h.saveInProgress = true;
  h.lastSaveStartMs = now;
  // Yield to the browser before the synchronous, potentially multi-megabyte
  // db.export() so the current click/interaction frame can fully paint first.
  // queueMicrotask runs before the next render frame; setTimeout(0) or
  // MessageChannel yields past the paint checkpoint so the UI stays responsive.
  const scheduleExport = typeof MessageChannel !== 'undefined'
    ? (fn: () => void) => { const ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(null); }
    : (fn: () => void) => setTimeout(fn, 0);
  scheduleExport(() => {
    // Exports are serialized through saveChain so snapshots reach disk in
    // mutation order even when the worker export resolves asynchronously.
    h.saveChain = h.saveChain
      .then(() => performSaveToStorage(host))
      .finally(() => {
        h.saveInProgress = false;
        // Mutations that arrived while the export was in flight are not
        // covered by this snapshot (mutationSeq moved past lastSnapshotSeq);
        // schedule another save for them. A persist still in flight will
        // clear the dirty flag itself when it completes.
        if (h.dirtySinceLastSave && h.mutationSeq !== h.lastSnapshotSeq) {
          scheduleDebouncedSave(host, h.SAVE_MIN_INTERVAL_MS);
        }
      });
  });
}

async function performSaveToStorage(host: DatabaseManager): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  const exportBeganAt = performance.now();
  // Preferred path: export inside the database Web Worker so the
  // multi-megabyte synchronous db.export() never blocks the UI thread.
  // The worker is kept in sync via statement forwarding, so its snapshot is
  // identical to the main one. Any failure falls back to the main-thread
  // export so persistence never depends on the worker being healthy.
  const requestedSeq = h.mutationSeq;
  try {
    const service = await importAsyncService();
    const snapshot = await service.exportDatabaseAsync();
    h.lastSnapshotSeq = requestedSeq;
    const exportDurationMs = Math.max(0, performance.now() - exportBeganAt);
    if (exportDurationMs >= SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS) {
      console.warn('[performance] Slow database snapshot export (worker)', JSON.stringify({
        durationMs: Math.round(exportDurationMs * 100) / 100,
        bytes: snapshot.byteLength,
      }));
    }
    persist(host, snapshot, requestedSeq);
    return;
  } catch (workerError) {
    console.warn('[database] Worker snapshot export unavailable; falling back to main-thread export.', workerError);
  }

  let snapshot: Uint8Array;
  const exportStartedAt = exportBeganAt;
  try {
    snapshot = exportSnapshot(host);
  } catch (e) {
    const failure = toAppError(e, 'DATABASE_SNAPSHOT_FAILED', 'تعذر إنشاء لقطة لقاعدة البيانات.');
    h.lastPersistError = persistenceErrorMessage(e, failure.code);
    h.lastPersistErrorCode = failure.code;
    console.error('Failed to export SQLite database snapshot', e);
    return;
  }
  h.lastSnapshotSeq = h.mutationSeq;
  const exportDurationMs = Math.max(0, performance.now() - exportStartedAt);
  if (exportDurationMs >= SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS) {
    console.warn('[performance] Slow database snapshot export', JSON.stringify({
      durationMs: Math.round(exportDurationMs * 100) / 100,
      bytes: snapshot.byteLength,
    }));
  }
  persist(host, snapshot, h.lastSnapshotSeq);
}

/**
 * Serializes writes so a slow disk (or concurrent transaction) can never
 * overwrite a newer snapshot with an older one. `seq` is the mutationSeq the
 * snapshot was exported at, used to drop snapshots superseded by a
 * synchronous durable write.
 */
function persist(host: DatabaseManager, snapshot: Uint8Array, seq: number): void {
  const h = host as unknown as DatabaseManagerInternals;
  h.pendingSnapshot = { bytes: snapshot, seq };
  if (h.isPersisting) return;
  h.isPersisting = true;
  h.persistQueue = h.persistQueue
    .then(async () => {
      while (h.pendingSnapshot) {
        const nextSnapshot = h.pendingSnapshot;
        h.pendingSnapshot = null;
        await persistSnapshot(host, nextSnapshot.bytes, nextSnapshot.seq);
      }
    })
    .finally(() => {
      h.isPersisting = false;
      if (h.pendingSnapshot) persist(host, h.pendingSnapshot.bytes, h.pendingSnapshot.seq);
    });
}

async function persistSnapshot(host: DatabaseManager, snapshot: Uint8Array, seq: number): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  // A synchronous durable write already landed a newer (or equal) snapshot —
  // persisting this older export would only waste a multi-megabyte write.
  if (seq >= 0 && seq <= h.lastSyncPersistedSeq) return;
  const persistStartedAt = performance.now();
  let persistSucceeded = false;
  try {
    if (await persistToFile(host, snapshot)) {
      persistSucceeded = true;
      return;
    }
    if (typeof indexedDB !== 'undefined' || typeof localStorage !== 'undefined') {
      await writeBrowserSnapshot(snapshot);
      persistSucceeded = true;
      h.storageBackend = typeof indexedDB !== 'undefined' ? 'indexedDB' : 'localStorage';
      if (h.migratedLegacyStorage && typeof localStorage !== 'undefined' && typeof indexedDB !== 'undefined') {
        try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* keep the migrated copy if cleanup is blocked */ }
        h.migratedLegacyStorage = false;
      }
      h.lastPersistError = null;
      h.lastPersistErrorCode = null;
    } else {
      h.storageBackend = 'none';
    }
  } catch (error) {
    const failure = toAppError(error, 'DATABASE_PERSIST_FAILED', 'تعذر حفظ قاعدة البيانات.');
    h.lastPersistError = persistenceErrorMessage(error, failure.code);
    h.lastPersistErrorCode = failure.code;
    console.error('Failed to persist SQLite database', error);
  } finally {
    // The snapshot reflects every mutation up to `lastSnapshotSeq`. Clear
    // the dirty flag only when the write actually reached durable storage
    // and no newer mutation happened since the export started, otherwise
    // the next save exports the newer state or retries the failed write.
    if (persistSucceeded && h.mutationSeq === h.lastSnapshotSeq) {
      h.dirtySinceLastSave = false;
    }
    const durationMs = Math.max(0, performance.now() - persistStartedAt);
    if (durationMs >= SLOW_SNAPSHOT_PERSIST_THRESHOLD_MS) {
      console.warn('[performance] Slow database snapshot persistence', JSON.stringify({
        durationMs: Math.round(durationMs * 100) / 100,
        bytes: snapshot.byteLength,
        backend: h.storageBackend,
      }));
    }
  }
}

export function cancelIdleSave(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.idleSaveTimer) {
    clearTimeout(h.idleSaveTimer);
    h.idleSaveTimer = null;
  }
  if (h.idleSaveHandle === null) return;
  const idleHost = globalThis as IdleCallbackHost;
  idleHost.cancelIdleCallback?.(h.idleSaveHandle);
  h.idleSaveHandle = null;
}

async function persistToFile(host: DatabaseManager, snapshot: Uint8Array): Promise<boolean> {
  const h = host as unknown as DatabaseManagerInternals;
  const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
  if (!fileApi?.save) return false;

  const result = await fileApi.save(snapshot);
  if (!result?.ok) {
    throw new AppError(result?.error || 'تعذر حفظ قاعدة البيانات على القرص.',
      result?.code || 'DATABASE_SAVE_FAILED', result?.retryable !== false);
  }
  h.storageBackend = 'file';
  h.lastPersistError = null;
  h.lastPersistErrorCode = null;
  void deleteBrowserSnapshot();
  if (h.migratedLegacyStorage && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
    h.migratedLegacyStorage = false;
  }
  return true;
}

/** Wait for all pending disk writes (used before shutdown/backup/restore). */
export async function flush(host: DatabaseManager): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.persistenceSuppressed) return;
  if (h.debounceSaveTimer || h.idleSaveHandle !== null || h.idleSaveTimer !== null) {
    clearTimeout(h.debounceSaveTimer);
    h.debounceSaveTimer = null;
    cancelIdleSave(host);
  }
  // Force a final snapshot for anything still dirty — including changes that
  // arrived while a previous save was in flight. Poll briefly because the
  // export is scheduled on a macrotask and `persistQueue` may not include it
  // yet when we first check. A persist failure stops the loop so flush()
  // reports it instead of silently retrying within the same call.
  const deadline = Date.now() + 30000;
  // A save already in flight when flush() starts counts as this flush's
  // attempt — if it fails we report the error instead of retrying silently.
  let attemptedSave = h.saveInProgress || h.isPersisting || h.pendingSnapshot !== null;
  while (h.dirtySinceLastSave && Date.now() < deadline) {
    const saveActive = h.saveInProgress || h.isPersisting || h.pendingSnapshot !== null;
    if (!saveActive) {
      if (attemptedSave && h.lastPersistError) break;
      saveToStorage(host, true);
      attemptedSave = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // Bound the drain wait as well: a stuck disk write must surface as an
  // error instead of hanging durable transactions (invoices, payments)
  // forever.
  const persistDeadline = Date.now() + 60000;
  while (h.isPersisting || h.pendingSnapshot) {
    const remaining = persistDeadline - Date.now();
    if (remaining <= 0) {
      throw new AppError(
        'انتهت مهلة انتظار حفظ تغييرات قاعدة البيانات على القرص.',
        'DATABASE_PERSIST_TIMEOUT',
        true,
      );
    }
    await Promise.race([
      h.persistQueue,
      new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining))),
    ]);
  }
  if (h.lastPersistError) {
    throw new AppError(`تعذر حفظ تغييرات قاعدة البيانات: ${h.lastPersistError}`, 'DATABASE_PERSIST_FAILED', true, {
      cause: new AppError(h.lastPersistError, h.lastPersistErrorCode || 'DATABASE_SAVE_FAILED', true),
    });
  }
}

export function getStorageBackend(host: DatabaseManager): 'file' | 'indexedDB' | 'localStorage' | 'none' {
  const h = host as unknown as DatabaseManagerInternals;
  return h.storageBackend;
}

export function getLastPersistError(host: DatabaseManager): string | null {
  const h = host as unknown as DatabaseManagerInternals;
  return h.lastPersistError;
}

export function getPersistenceStatus(host: DatabaseManager): {
  status: 'saving' | 'saved' | 'error' | 'unencrypted' | 'unavailable';
  encryption?: 'encrypted-at-rest' | 'plaintext' | 'file-encrypted' | 'unknown';
  error?: string;
  code?: string;
} {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.lastPersistError) return { status: 'error', error: h.lastPersistError, code: h.lastPersistErrorCode || 'DATABASE_PERSIST_FAILED' };
  if (h.storageBackend === 'none') return { status: 'unavailable' };
  if (h.debounceSaveTimer || h.idleSaveHandle !== null || h.idleSaveTimer !== null || h.isPersisting || h.pendingSnapshot || h.saveInProgress) {
    return { status: 'saving' };
  }
  if (h.storageBackend === 'file') {
    return { status: 'saved', encryption: 'file-encrypted' };
  }
  if (h.storageBackend === 'localStorage') {
    return { status: 'unencrypted', encryption: 'plaintext' };
  }
  if (h.storageBackend === 'indexedDB') {
    // IndexedDB snapshots are AES-GCM ciphertext whenever the Web Crypto
    // key is available; only report 'unencrypted' when we actually wrote or
    // read a plaintext snapshot.
    return getBrowserSnapshotEncryptionState() === true
      ? { status: 'saved', encryption: 'encrypted-at-rest' }
      : {
          status: 'unencrypted',
          encryption: getBrowserSnapshotEncryptionState() === false ? 'plaintext' : 'unknown',
        };
  }
  return { status: 'saved', encryption: 'unknown' };
}

/**
 * Synchronously exports the current snapshot and writes it through the
 * Electron `db:save-sync` IPC channel, which performs the encrypted file
 * write in the main process before replying. Only used by
 * executeFinancialTransaction; any failure throws so the caller never sees
 * a successful result for a write that is not on disk.
 */
export function persistSnapshotSynchronously(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
  if (typeof fileApi?.saveSync !== 'function' || !h.db) {
    // No synchronous durable channel (browser build, tests, older Electron
    // preload): degrade to the immediate async persist. Durability is then
    // best-effort — callers needing a hard guarantee must use
    // executeDurableTransaction.
    saveToStorage(host, true);
    if (h.dirtySinceLastSave) host.scheduleDebouncedSave(0);
    return;
  }

  const snapshot = exportSnapshot(host);
  const seq = h.mutationSeq;
  h.lastSnapshotSeq = seq;

  let result: { ok?: boolean; code?: string; retryable?: boolean; error?: string } | undefined;
  try {
    result = fileApi.saveSync(snapshot);
  } catch (error) {
    result = {
      ok: false,
      code: 'DATABASE_SAVE_FAILED',
      retryable: true,
      error: persistenceErrorMessage(error, 'DATABASE_SAVE_FAILED'),
    };
  }

  if (result?.code === 'DATABASE_SYNC_UNAVAILABLE') {
    // Electron without synchronous secure-storage APIs cannot offer a
    // blocking durable write; degrade rather than break every commit.
    console.warn('[database] Synchronous durable save unavailable; falling back to async persist.');
    saveToStorage(host, true);
    if (h.dirtySinceLastSave) host.scheduleDebouncedSave(0);
    return;
  }

  if (!result?.ok) {
    const failure = new AppError(
      result?.error || 'تعذر حفظ قاعدة البيانات على القرص.',
      result?.code || 'DATABASE_SAVE_FAILED',
      result?.retryable !== false,
    );
    h.lastPersistError = persistenceErrorMessage(result?.error, failure.code);
    h.lastPersistErrorCode = failure.code;
    throw failure;
  }

  h.lastSyncPersistedSeq = seq;
  h.storageBackend = 'file';
  h.lastPersistError = null;
  h.lastPersistErrorCode = null;
  void deleteBrowserSnapshot();
  if (h.migratedLegacyStorage && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
    h.migratedLegacyStorage = false;
  }
  h.dirtySinceLastSave = false;
}

export function exportSnapshot(host: DatabaseManager): Uint8Array {
  const db = host.getDatabase();
  const snapshot = db.export();
  db.run('PRAGMA foreign_keys = ON');
  const foreignKeysEnabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
  if (!foreignKeysEnabled) {
    throw new Error('SQLite foreign key enforcement could not be restored after database export.');
  }
  return snapshot;
}
