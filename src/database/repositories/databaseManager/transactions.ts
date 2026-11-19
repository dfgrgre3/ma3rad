import type { Database } from 'sql.js';
import type { DatabaseManager } from '../databaseManager';
import { AppError, toAppError } from '../../../errors/appError';
import { logger } from '../../../utils/logger';
import type { DatabaseManagerInternals } from './internals';
import { markDirty } from './mutationSync';
import { persistSnapshotSynchronously } from './persistence';
import { clearQueryCache } from './queries';

/**
 * executeTransaction / executeFinancialTransaction / executeDurableTransaction.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export function executeFinancialTransaction<T>(host: DatabaseManager, callback: (db: DatabaseManager) => T): T {
  return executeTransaction(host, callback, { immediatePersist: true, durableSync: true });
}

export function executeTransaction<T>(
  host: DatabaseManager,
  callback: (db: DatabaseManager) => T,
  options?: { immediatePersist?: boolean; durableSync?: boolean },
): T {
  const h = host as unknown as DatabaseManagerInternals;
  if (options?.immediatePersist) h.immediatePersistRequested = true;
  if (options?.durableSync) h.durableSyncRequested = true;
  if (h.transactionDepth === 0 && h.lastPersistError) {
    throw new AppError(
      `توقفت المعاملات لأن آخر عملية لم تُحفظ على القرص: ${h.lastPersistError}`,
      'DATABASE_PERSIST_FAILED',
      true,
    );
  }
  const db = host.getDatabase();
  const depth = h.transactionDepth;
  const isOuterTransaction = depth === 0;
  const savepoint = `db_nested_${depth}`;
  if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
  else db.exec(`SAVEPOINT ${savepoint};`);
  h.transactionDepth++;
  let depthReleased = false;
  let committed = false;
  try {
    const result = callback(host);
    h.transactionDepth--;
    depthReleased = true;
    if (isOuterTransaction) {
      db.exec('COMMIT;');
      committed = true;
      clearQueryCache(host);
      markDirty(host);
      const persistImmediately = h.immediatePersistRequested;
      const durableSync = h.durableSyncRequested;
      h.immediatePersistRequested = false;
      h.durableSyncRequested = false;
      if (durableSync) {
        // Financial writes demand a synchronous durable snapshot: on the
        // Electron file backend this blocks until the encrypted file write
        // completes (or throws). Throws propagate through the catch below
        // with committed=true so callers see an honest failure.
        persistSnapshotSynchronously(host);
      } else if (persistImmediately) {
        // Financial writes skip the debounce/idle delay so the snapshot
        // reaches durable storage within ~one frame instead of seconds.
        host.saveToStorage(true);
        if (h.dirtySinceLastSave) host.scheduleDebouncedSave(0);
      } else {
        host.scheduleDebouncedSave();
      }
    } else {
      db.exec(`RELEASE SAVEPOINT ${savepoint};`);
    }
    return result;
  } catch (error) {
    if (!depthReleased) h.transactionDepth--;
    if (isOuterTransaction) {
      h.immediatePersistRequested = false;
      h.durableSyncRequested = false;
    }
    if (!committed) rollbackTransaction(db, isOuterTransaction, savepoint);
    logger.error(
      committed
        ? 'Transaction committed in memory but could not be persisted:'
        : 'Transaction rolled back due to error:',
      error instanceof Error ? error : new Error(String(error)),
      { committed }
    );
    throw toAppError(error, 'DATABASE_TRANSACTION_FAILED');
  }
}

function rollbackTransaction(db: Database, isOuterTransaction: boolean, savepoint: string): void {
  if (isOuterTransaction) {
    try { db.exec('ROLLBACK;'); } catch { /* transaction may already be closed */ }
    return;
  }

  try {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
    db.exec(`RELEASE SAVEPOINT ${savepoint};`);
  } catch { /* savepoint may already have been released */ }
}

/**
 * Async variant of executeTransaction for financially critical writes.
 * The callback may be async; the outermost COMMIT is only released after it
 * resolves, and the method then waits until the snapshot is durably
 * persisted (flush) before returning — so a resolved promise means the
 * write survived a crash, not just the in-memory COMMIT.
 * Nested calls behave like savepoints and never flush on their own.
 */
export async function executeDurableTransaction<T>(
  host: DatabaseManager,
  callback: (db: DatabaseManager) => T | Promise<T>,
): Promise<T> {
  const h = host as unknown as DatabaseManagerInternals;
  if (h.transactionDepth === 0 && h.lastPersistError) {
    throw new AppError(
      `توقفت المعاملات لأن آخر عملية لم تُحفظ على القرص: ${h.lastPersistError}`,
      'DATABASE_PERSIST_FAILED',
      true,
    );
  }
  const db = host.getDatabase();
  const depth = h.transactionDepth;
  const isOuterTransaction = depth === 0;
  const savepoint = `db_nested_${depth}`;
  if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
  else db.exec(`SAVEPOINT ${savepoint};`);
  h.transactionDepth++;
  let depthReleased = false;
  let committed = false;
  try {
    const result = await callback(host);
    h.transactionDepth--;
    depthReleased = true;
    if (isOuterTransaction) {
      db.exec('COMMIT;');
      committed = true;
      clearQueryCache(host);
      markDirty(host);
      host.saveToStorage(true);
      await host.flush();
    } else {
      db.exec(`RELEASE SAVEPOINT ${savepoint};`);
    }
    return result;
  } catch (error) {
    if (!depthReleased) h.transactionDepth--;
    if (!committed) rollbackTransaction(db, isOuterTransaction, savepoint);
    logger.error(
      committed
        ? 'Transaction committed in memory but could not be persisted:'
        : 'Transaction rolled back due to error:',
      error instanceof Error ? error : new Error(String(error)),
      { committed }
    );
    throw toAppError(error, 'DATABASE_TRANSACTION_FAILED');
  }
}
