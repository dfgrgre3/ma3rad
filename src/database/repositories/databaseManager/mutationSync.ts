import type { DatabaseManager } from '../databaseManager';
import type { DatabaseManagerInternals, MutationForwarder } from './internals';
import { cancelIdleSave } from './persistence';

/**
 * Dirty/mutation tracking and the worker statement forwarder.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export function markDirty(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  h.dirtySinceLastSave = true;
  h.mutationSeq++;
}

/**
 * Disables all snapshot persistence. Used inside the database Web Worker,
 * which keeps a replica solely for off-thread queries — the renderer's
 * DatabaseManager is the single writer of database snapshots.
 */
export function suppressPersistence(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  h.persistenceSuppressed = true;
  if (h.debounceSaveTimer) {
    clearTimeout(h.debounceSaveTimer);
    h.debounceSaveTimer = null;
  }
  cancelIdleSave(host);
}

/** Monotonic counter bumped on every mutation; used to detect main↔worker drift. */
export function getMutationSeq(host: DatabaseManager): number {
  const h = host as unknown as DatabaseManagerInternals;
  return h.mutationSeq;
}

/**
 * Installs the callback that mirrors mutations to the database Web Worker.
 * Installed once by databaseAsyncService; safe to call with null to detach.
 */
export function setMutationForwarder(
  host: DatabaseManager,
  forwarder: MutationForwarder | null,
): void {
  const h = host as unknown as DatabaseManagerInternals;
  h.mutationForwarder = forwarder;
}

export function forwardMutation(host: DatabaseManager, kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]): void {
  const h = host as unknown as DatabaseManagerInternals;
  try {
    h.mutationForwarder?.(kind, sql, params);
  } catch {
    // Forwarding must never break a write that already succeeded locally.
  }
}

/**
 * The whole database was replaced (import/restore). Individual statement
 * forwarding cannot express this — the worker must resync from a snapshot.
 */
export function notifyDatabaseReplaced(host: DatabaseManager): void {
  forwardMutation(host, 'reset', '', []);
}
