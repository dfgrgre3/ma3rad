import type { Database } from 'sql.js';

export type DatabaseStorageBackend = 'file' | 'indexedDB' | 'localStorage' | 'none';
export type MutationForwarder = (kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]) => void;
export type QueryCacheEntry = { expiresAt: number; sizeBytes: number; value: unknown };
export type SlowQueryRecord = { timestamp: string; durationMs: number; statement: string };
export type PendingSnapshot = { bytes: Uint8Array; seq: number };

/**
 * Internal view of `DatabaseManager`'s private instance state.
 *
 * The implementation of DatabaseManager is split across the sibling modules
 * in this folder. Those modules receive the `DatabaseManager` instance and
 * cast it to this interface to reach the private fields — TypeScript `private`
 * is compile-time only, so this is safe at runtime and keeps the public API
 * surface unchanged. Field names and types MUST stay in sync with the class.
 */
export interface DatabaseManagerInternals {
  db: Database | null;
  databaseFacade: Database | null;
  databaseFacadeTarget: Database | null;
  SQL: any;
  transactionDepth: number;
  queryCache: Map<string, QueryCacheEntry>;
  queryCacheSizeBytes: number;
  queryCacheHits: number;
  queryCacheMisses: number;
  totalQueries: number;
  failedQueries: number;
  slowQueryCount: number;
  slowestQueryMs: number;
  readonly slowQueryThresholdMs: number;
  recentSlowQueries: SlowQueryRecord[];
  readonly queryCacheTtlMs: number;
  readonly queryCacheMaxEntries: number;
  readonly queryCacheMaxEntryBytes: number;
  readonly queryCacheMaxSizeBytes: number;
  persistQueue: Promise<void>;
  pendingSnapshot: PendingSnapshot | null;
  isPersisting: boolean;
  dirtySinceLastSave: boolean;
  mutationSeq: number;
  lastSnapshotSeq: number;
  immediatePersistRequested: boolean;
  durableSyncRequested: boolean;
  lastSyncPersistedSeq: number;
  criticalTransactionInProgress: boolean;
  lastPersistError: string | null;
  lastPersistErrorCode: string | null;
  initializedSuccessfully: boolean;
  initializationPromise: Promise<Database> | null;
  storageBackend: DatabaseStorageBackend;
  migratedLegacyStorage: boolean;
  forceFreshAfterRecovery: boolean;
  debounceSaveTimer: any;
  idleSaveHandle: number | null;
  idleSaveTimer: ReturnType<typeof setTimeout> | null;
  saveInProgress: boolean;
  lastSaveStartMs: number;
  readonly SAVE_MIN_INTERVAL_MS: number;
  persistenceSuppressed: boolean;
  mutationForwarder: MutationForwarder | null;
  saveChain: Promise<void>;
}
