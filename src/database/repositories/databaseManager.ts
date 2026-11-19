import type { Database } from 'sql.js';
import { getDatabaseManagerState, LEGACY_X86_BUILD } from './databaseManager/constants';
import { applyPerformancePragmas, initializeSqlEngine } from './databaseManager/engine';
import { createFreshAfterRecovery, initializeDatabase } from './databaseManager/initialization';
import {
  exportDatabaseAsync,
  execAsync,
  importDatabaseAsync,
  queryAsync,
  runAsync,
} from './databaseManager/asyncApi';
import {
  exportDatabaseBinary,
  exportDatabaseBytes,
  importDatabaseBinary,
  importDatabaseBytes,
  inspectDatabaseBinary,
  readImportTablesBinary,
} from './databaseManager/binaryIO';
import { getDatabase, nextNumber } from './databaseManager/databaseAccess';
import {
  getMutationSeq,
  setMutationForwarder,
  suppressPersistence,
} from './databaseManager/mutationSync';
import {
  flush,
  getLastPersistError,
  getPersistenceStatus,
  getStorageBackend,
  saveToStorage,
  scheduleDebouncedSave,
} from './databaseManager/persistence';
import {
  getQueryCacheStats,
  getQueryStats,
  getSlowQueryStats,
  query,
  queryPage,
  run,
} from './databaseManager/queries';
import {
  executeDurableTransaction,
  executeFinancialTransaction,
  executeTransaction,
} from './databaseManager/transactions';

/**
 * Central SQLite (sql.js) database manager — singleton.
 *
 * This file is intentionally thin: the implementation is split by
 * responsibility into the sibling `databaseManager/` modules. Every public
 * method below delegates to the corresponding module function, passing the
 * instance (`this`) so private state stays encapsulated. The public API is
 * identical to the original monolithic implementation.
 */
export class DatabaseManager {
  private db: Database | null = null;
  private databaseFacade: Database | null = null;
  private databaseFacadeTarget: Database | null = null;
  private SQL: any = null;
  private transactionDepth = 0;
  private queryCache = new Map<string, { expiresAt: number; sizeBytes: number; value: unknown }>();
  private queryCacheSizeBytes = 0;
  private queryCacheHits = 0;
  private queryCacheMisses = 0;
  private totalQueries = 0;
  private failedQueries = 0;
  private slowQueryCount = 0;
  private slowestQueryMs = 0;
  private readonly slowQueryThresholdMs = 250;
  private recentSlowQueries: Array<{ timestamp: string; durationMs: number; statement: string }> = [];
  private readonly queryCacheTtlMs = 5000;
  private readonly queryCacheMaxEntries = LEGACY_X86_BUILD ? 150 : 300;
  private readonly queryCacheMaxEntryBytes = LEGACY_X86_BUILD ? 256 * 1024 : 512 * 1024;
  private readonly queryCacheMaxSizeBytes = LEGACY_X86_BUILD ? 4 * 1024 * 1024 : 16 * 1024 * 1024;
  private persistQueue: Promise<void> = Promise.resolve();
  private pendingSnapshot: { bytes: Uint8Array; seq: number } | null = null;
  private isPersisting = false;
  // Full-DB snapshot export (sql.js `db.export()`) is synchronous and runs on
  // the renderer UI thread. Skip exports when nothing changed since the last
  // snapshot was taken so read-only interactions stay free of multi-megabyte
  // serialization stalls. `mutationSeq` guards against clearing the flag for
  // changes that happen while a snapshot persists in the background.
  private dirtySinceLastSave = true;
  private mutationSeq = 0;
  private lastSnapshotSeq = 0;
  // Set when any transaction in the current stack asks for immediate
  // persistence; consumed by the outermost COMMIT so nested financial
  // operations still trigger an immediate snapshot write.
  private immediatePersistRequested = false;
  // Set when any transaction in the stack demands a synchronous durable write
  // (executeFinancialTransaction). Consumed by the outermost COMMIT: on the
  // Electron file backend the snapshot is written through a blocking IPC so a
  // resolved financial operation is already on disk.
  private durableSyncRequested = false;
  // Highest mutationSeq already persisted through the synchronous durable
  // path; queued async snapshots at or below it are redundant and skipped.
  private lastSyncPersistedSeq = -1;
  // Track when a critical financial transaction is in progress to ensure
  // durable persistence before returning success to the user.
  private criticalTransactionInProgress = false;
  private lastPersistError: string | null = null;
  private lastPersistErrorCode: string | null = null;
  private initializedSuccessfully = false;
  private initializationPromise: Promise<Database> | null = null;
  private storageBackend: 'file' | 'indexedDB' | 'localStorage' | 'none' = 'none';
  private migratedLegacyStorage = false;
  private forceFreshAfterRecovery = false;
  private debounceSaveTimer: any = null;
  private idleSaveHandle: number | null = null;
  private idleSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInProgress = false;
  private lastSaveStartMs = 0;
  // Minimum gap between full-DB exports. sql.js db.export() on a ~10 MB database
  // takes ~50-200 ms and blocks the UI thread; throttling to 3s prevents save storms.
  private readonly SAVE_MIN_INTERVAL_MS = 3000;
  // Set inside the database Web Worker: the worker holds a replica used only
  // for off-thread queries, so it must never write snapshots — persistence is
  // owned exclusively by the renderer's DatabaseManager (file API / IndexedDB).
  private persistenceSuppressed = false;
  // Optional callback (installed by databaseAsyncService) that mirrors every
  // mutation to the worker replica as a plain SQL statement, so the worker
  // stays in sync without full-database snapshot transfers.
  private mutationForwarder: ((kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]) => void) | null = null;
  // Serializes snapshot exports so a slow worker export can never be overtaken
  // by a newer one and write an older snapshot to disk last.
  private saveChain: Promise<void> = Promise.resolve();

  private constructor() {}

  public static getInstance(): DatabaseManager {
    const state = getDatabaseManagerState();
    if (!state.instance) {
      state.instance = new DatabaseManager();
    }
    return state.instance;
  }

  /**
   * Installed by `AppConfigService` so administrator-defined numbering
   * templates apply to every existing `nextNumber()` caller without touching
   * the individual document services.
   */
  public static setNumberFormatter(
    formatter: ((prefix: string, seq: number, date: Date) => string) | null,
  ): void {
    getDatabaseManagerState().numberFormatter = formatter;
  }

  /**
   * Initializes only the sql.js engine with an empty in-memory database.
   * Used inside the database Web Worker, which must NOT read the persisted
   * snapshot itself (browser snapshots may be encrypted with a key that only
   * exists on the main thread's localStorage). The authoritative state is
   * pushed from the main thread via importDatabaseBytes right after init.
   */
  public async initializeEngineOnly(): Promise<void> {
    if (this.db) return;
    if (!this.SQL) {
      await initializeSqlEngine(this);
    }
    const emptyDb = new this.SQL.Database();
    applyPerformancePragmas(emptyDb);
    this.db = emptyDb;
    this.initializedSuccessfully = true;
  }

  public initialize(): Promise<Database> {
    if (this.db && this.initializedSuccessfully) return Promise.resolve(this.db);
    if (this.initializationPromise) return this.initializationPromise;

    const initialization = initializeDatabase(this);
    this.initializationPromise = initialization;
    void initialization.finally(() => {
      if (this.initializationPromise === initialization) this.initializationPromise = null;
    }).catch(() => {
      // The original promise carries the initialization failure to its callers.
    });
    return initialization;
  }

  public async createFreshAfterRecovery(): Promise<void> {
    return createFreshAfterRecovery(this);
  }

  public scheduleDebouncedSave(delayMs = 3000): void {
    scheduleDebouncedSave(this, delayMs);
  }

  public saveToStorage(force = false): void {
    saveToStorage(this, force);
  }

  /** Wait for all pending disk writes (used before shutdown/backup/restore). */
  public async flush(): Promise<void> {
    return flush(this);
  }

  public getStorageBackend(): 'file' | 'indexedDB' | 'localStorage' | 'none' {
    return getStorageBackend(this);
  }

  public getLastPersistError(): string | null {
    return getLastPersistError(this);
  }

  public getPersistenceStatus(): {
    status: 'saving' | 'saved' | 'error' | 'unencrypted' | 'unavailable';
    encryption?: 'encrypted-at-rest' | 'plaintext' | 'file-encrypted' | 'unknown';
    error?: string;
    code?: string;
  } {
    return getPersistenceStatus(this);
  }

  public getDatabase(): Database {
    return getDatabase(this);
  }

  public getDb(): Database {
    return this.getDatabase();
  }

  /**
   * Esporta l'intero database come Uint8Array (binary snapshot di sql.js).
   * Utile per trasferire lo stato del database a un Web Worker e tornare indietro.
   */
  public exportDatabaseBytes(): Uint8Array {
    return exportDatabaseBytes(this);
  }

  /**
   * Sostituisce il database in memoria con i bytes forniti (es. ricevuti da un Web Worker).
   * Dopo questa chiamata tutte le query successive lavoreranno sul nuovo stato.
   */
  public importDatabaseBytes(bytes: Uint8Array): void {
    importDatabaseBytes(this, bytes);
  }

  // ============================================================================
  // واجهة غير متزامنة (Async API) — تُنفذ العمليات في Web Worker منفصل
  // لمنع تجميد واجهة المستخدم عند استدعاء أي استعلام SQLite أو تصدير قاعدة البيانات.
  // ============================================================================

  /**
   * تنفيذ استعلام SELECT بشكل غير متزامن في Web Worker (لا يحجب واجهة المستخدم).
   * يعيد نفس تنسيق النتيجة الخاص بـ `query` (مصفوفة من الكائنات بمفاتيح camelCase).
   */
  public async queryAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return queryAsync<T>(this, sql, params);
  }

  /**
   * تنفيذ INSERT/UPDATE/DELETE بشكل غير متزامن في Web Worker.
   */
  public async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    return runAsync(this, sql, params);
  }

  /**
   * تنفيذ SQL خام (transactions, PRAGMA) بشكل غير متزامن في Web Worker.
   */
  public async execAsync(sql: string): Promise<void> {
    return execAsync(this, sql);
  }

  /**
   * تصدير قاعدة البيانات بشكل غير متزامن من Web Worker.
   * يعيد Uint8Array يمكن حفظه في indexedDB أو ملف.
   */
  public async exportDatabaseAsync(): Promise<Uint8Array> {
    return exportDatabaseAsync(this);
  }

  /**
   * استيراد قاعدة بيانات ثنائية بشكل غير متزامن إلى Web Worker والخيط الرئيسي.
   */
  public async importDatabaseAsync(bytes: Uint8Array): Promise<void> {
    return importDatabaseAsync(this, bytes);
  }

  /**
   * Collision-proof, transaction-safe sequential document number generator.
   * Example: nextNumber('INV') -> 'INV-2026-000001'
   * Must be called INSIDE an executeTransaction() callback so the counter
   * is atomically incremented with the document it names (prevents gaps/duplicates).
   */
  public nextNumber(prefix: string): string {
    return nextNumber(this, prefix);
  }

  /**
   * executeTransaction for financially critical writes (journal entries,
   * invoices, payments, period closes). On the Electron file backend the
   * snapshot is exported and written through a blocking IPC before this
   * method returns, so a resolved call means the write is already durable on
   * disk — a persistence failure throws instead of reporting success.
   * Nested calls propagate the requirement to the outermost COMMIT and never
   * flush independently. In browser/test environments without the synchronous
   * file channel the write falls back to the immediate async persist path
   * (best-effort durability); use executeDurableTransaction when an async
   * boundary is available and a guaranteed flush is required.
   */
  public executeFinancialTransaction<T>(callback: (db: DatabaseManager) => T): T {
    return executeFinancialTransaction(this, callback);
  }

  public executeTransaction<T>(
    callback: (db: DatabaseManager) => T,
    options?: { immediatePersist?: boolean; durableSync?: boolean },
  ): T {
    return executeTransaction(this, callback, options);
  }

  /**
   * Async variant of executeTransaction for financially critical writes.
   * The callback may be async; the outermost COMMIT is only released after it
   * resolves, and the method then waits until the snapshot is durably
   * persisted (flush) before returning — so a resolved promise means the
   * write survived a crash, not just the in-memory COMMIT.
   * Nested calls behave like savepoints and never flush on their own.
   */
  public async executeDurableTransaction<T>(
    callback: (db: DatabaseManager) => T | Promise<T>,
  ): Promise<T> {
    return executeDurableTransaction(this, callback);
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    return query(this, sql, params);
  }

  public run(sql: string, params: any[] = []): void {
    run(this, sql, params);
  }

  /**
   * Disables all snapshot persistence. Used inside the database Web Worker,
   * which keeps a replica solely for off-thread queries — the renderer's
   * DatabaseManager is the single writer of database snapshots.
   */
  public suppressPersistence(): void {
    suppressPersistence(this);
  }

  /** Monotonic counter bumped on every mutation; used to detect main↔worker drift. */
  public getMutationSeq(): number {
    return getMutationSeq(this);
  }

  /**
   * Installs the callback that mirrors mutations to the database Web Worker.
   * Installed once by databaseAsyncService; safe to call with null to detach.
   */
  public setMutationForwarder(
    forwarder: ((kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]) => void) | null,
  ): void {
    setMutationForwarder(this, forwarder);
  }

  public getQueryStats(): {
    totalQueries: number;
    failedQueries: number;
    slowQueryCount: number;
    slowestQueryMs: number;
  } {
    return getQueryStats(this);
  }

  public getSlowQueryStats(): {
    thresholdMs: number;
    count: number;
    slowestQueryMs: number;
    recent: Array<{ timestamp: string; durationMs: number; statement: string }>;
  } {
    return getSlowQueryStats(this);
  }

  /** Execute a bounded list query and its count query without loading all rows. */
  public queryPage<T = any>(
    dataSql: string,
    countSql: string,
    params: any[] = [],
    page = 1,
    pageSize = 25,
    countParams: any[] = params,
  ): { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number } {
    return queryPage(this, dataSql, countSql, params, page, pageSize, countParams);
  }

  public getQueryCacheStats(): {
    entries: number;
    sizeBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    return getQueryCacheStats(this);
  }

  public exportDatabaseBinary(): Uint8Array {
    return exportDatabaseBinary(this);
  }

  public readImportTablesBinary(bytes: Uint8Array): Array<{
    name: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  }> {
    return readImportTablesBinary(this, bytes);
  }

  public async importDatabaseBinary(bytes: Uint8Array): Promise<void> {
    return importDatabaseBinary(this, bytes);
  }

  /**
   * Inspects and tests restoring a database binary in isolation without affecting the live database.
   * Runs SQLite PRAGMA integrity_check and counts key entities (invoices, products, customers, journal entries).
   */
  public inspectDatabaseBinary(bytes: Uint8Array): {
    valid: boolean;
    integrity: string;
    productsCount: number;
    invoicesCount: number;
    customersCount: number;
    journalEntriesCount: number;
    error?: string;
  } {
    return inspectDatabaseBinary(this, bytes);
  }
}
