import type { Database } from 'sql.js';
import type { MigrationReport } from '../migrations';
import { DEFAULT_BRANCH_ID } from '../migrations/settings';
import { AppError, toAppError } from '../../errors/appError';
import { logger } from '../../utils/logger';

const DB_STORAGE_KEY = 'ceramics_erp_sqlite_db';
const DB_IDB_NAME = 'ceramisys_database';
const DB_IDB_STORE = 'snapshots';
const DB_IDB_KEY = 'main';
const DB_IDB_KEY_STORE = 'keys';
const DB_IDB_ENCRYPTION_KEY_ID = 'main';
const DB_IDB_VERSION = 2;
const DB_ENCRYPTION_KEY_KEY = 'ceramisys_db_encryption_key';
// Tracks whether the last persisted browser snapshot was ciphertext. Updated
// on every browser write/read so getPersistenceStatus() can report the real
// at-rest encryption state instead of assuming IndexedDB is always plaintext.
let lastKnownBrowserSnapshotEncrypted: boolean | null = null;
const SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS = 500;
const SLOW_SNAPSHOT_PERSIST_THRESHOLD_MS = 10000;
const LEGACY_X86_BUILD = typeof __CERAMISYS_LEGACY_BUILD__ !== 'undefined'
  && __CERAMISYS_LEGACY_BUILD__;
type DatabaseFileApi = NonNullable<NonNullable<Window['ceramisys']>['db']>;
type IdleCallbackHost = typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};
type DatabaseManagerState = {
  instance: DatabaseManager | null;
  numberFormatter: ((prefix: string, seq: number, date: Date) => string) | null;
};
const DATABASE_MANAGER_STATE_KEY = '__ceramisysDatabaseManagerState__';

function getDatabaseManagerState(): DatabaseManagerState {
  const runtime = globalThis as typeof globalThis & {
    __ceramisysDatabaseManagerState__?: DatabaseManagerState;
  };
  if (!runtime[DATABASE_MANAGER_STATE_KEY]) {
    runtime[DATABASE_MANAGER_STATE_KEY] = { instance: null, numberFormatter: null };
  }
  return runtime[DATABASE_MANAGER_STATE_KEY]!;
}

/**
 * Production builds must never persist the database snapshot unencrypted:
 * the browser fallback key lives in localStorage next to the data, so a
 * plaintext snapshot would expose the entire business database to any script
 * running on the origin. Development/test builds keep the legacy plaintext
 * fallback so local previews and unit tests keep working.
 */
function isProductionBuild(): boolean {
  try {
    return typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { PROD?: boolean } }).env?.PROD);
  } catch {
    return false;
  }
}

const SQLITE_IMAGE_HEADER = 'SQLite format 3\0';

function isSqliteImage(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_IMAGE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_IMAGE_HEADER.length; i++) {
    if (bytes[i] !== SQLITE_IMAGE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Encryption utilities for IndexedDB storage using Web Crypto API (AES-GCM).
 * Falls back to unencrypted storage if crypto is unavailable.
 */
async function getOrCreateEncryptionKey(): Promise<CryptoKey | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('[database] Web Crypto API not available, using unencrypted storage');
      return null;
    }

    // Preferred: a non-extractable CryptoKey persisted in IndexedDB. Page
    // script can use it for encrypt/decrypt but can never export the raw key
    // material, unlike a JWK stored in localStorage next to the data.
    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await openDatabaseStorage();
        try {
          const stored = await new Promise<unknown>((resolve, reject) => {
            const request = db
              .transaction(DB_IDB_KEY_STORE, 'readonly')
              .objectStore(DB_IDB_KEY_STORE)
              .get(DB_IDB_ENCRYPTION_KEY_ID);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (stored instanceof CryptoKey) return stored;
        } finally {
          db.close();
        }
      } catch {
        // Fall through to the legacy localStorage key or generate a new one.
      }
    }

    // Legacy path: existing installs keep an exportable JWK in localStorage.
    if (typeof localStorage !== 'undefined') {
      const storedKey = localStorage.getItem(DB_ENCRYPTION_KEY_KEY);
      if (storedKey) {
        const keyData = JSON.parse(storedKey);
        return await crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
      }
    }

    // Generate a fresh non-extractable key and persist the CryptoKey object
    // itself in IndexedDB (structured clone keeps it non-exportable).
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    if (typeof indexedDB !== 'undefined') {
      try {
        const db = await openDatabaseStorage();
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(DB_IDB_KEY_STORE, 'readwrite');
            transaction.objectStore(DB_IDB_KEY_STORE).put(key, DB_IDB_ENCRYPTION_KEY_ID);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Browser key storage write aborted'));
          });
        } finally {
          db.close();
        }
        return key;
      } catch (error) {
        console.warn('[database] Could not persist encryption key in IndexedDB; falling back to localStorage JWK:', error);
      }
    }

    // Last resort for environments without IndexedDB: exportable JWK in
    // localStorage (legacy behaviour, weaker threat model).
    if (typeof localStorage !== 'undefined') {
      const exportableKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const exportedKey = await crypto.subtle.exportKey('jwk', exportableKey);
      localStorage.setItem(DB_ENCRYPTION_KEY_KEY, JSON.stringify(exportedKey));
      return exportableKey;
    }

    return key;
  } catch (error) {
    console.warn('[database] Failed to setup encryption, using unencrypted storage:', error);
    return null;
  }
}

async function encryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data.buffer as ArrayBuffer
  );
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

async function decryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
}

function openDatabaseStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_IDB_NAME, DB_IDB_VERSION);
    request.onupgradeneeded = () => {
      const result = request.result;
      if (!result.objectStoreNames.contains(DB_IDB_STORE)) result.createObjectStore(DB_IDB_STORE);
      if (!result.objectStoreNames.contains(DB_IDB_KEY_STORE)) result.createObjectStore(DB_IDB_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser database storage'));
  });
}

async function readBrowserSnapshot(): Promise<Uint8Array | null> {
  if (typeof indexedDB !== 'undefined') {
    const db = await openDatabaseStorage();
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(DB_IDB_STORE, 'readonly').objectStore(DB_IDB_STORE).get(DB_IDB_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stored = toUint8Array(value);
      if (stored) {
        // Try to decrypt if encryption key is available
        const key = await getOrCreateEncryptionKey();
        if (key) {
          try {
            const plaintext = await decryptData(stored, key);
            lastKnownBrowserSnapshotEncrypted = true;
            return plaintext;
          } catch (decryptError) {
            // Only accept plaintext when it is recognizably a legacy SQLite
            // image — never feed ciphertext back into sql.js as if it were data.
            if (isSqliteImage(stored)) {
              console.warn('[database] Snapshot is not decryptable; treating it as legacy unencrypted data:', decryptError);
              lastKnownBrowserSnapshotEncrypted = false;
              return stored;
            }
            throw new Error('Database snapshot could not be decrypted and is not a valid SQLite image', { cause: decryptError });
          }
        }
        lastKnownBrowserSnapshotEncrypted = false;
        return stored;
      }
    } finally { db.close(); }
  }
  return null;
}

async function writeBrowserSnapshot(bytes: Uint8Array, key = DB_IDB_KEY): Promise<void> {
  // Resolve the key once up front so the plaintext guard covers both the
  // IndexedDB and localStorage branches.
  const encryptionKey = await getOrCreateEncryptionKey();
  if (!encryptionKey && isProductionBuild()) {
    throw new Error(
      'Encrypted browser storage is unavailable (Web Crypto API missing or key setup failed). ' +
      'Refusing to persist the database unencrypted in a production build.'
    );
  }
  if (typeof indexedDB !== 'undefined') {
    const db = await openDatabaseStorage();
    try {
      const dataToWrite = encryptionKey ? await encryptData(bytes, encryptionKey) : bytes;

      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(DB_IDB_STORE, 'readwrite');
        transaction.objectStore(DB_IDB_STORE).put(dataToWrite, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Browser database storage write aborted'));
      });
      lastKnownBrowserSnapshotEncrypted = encryptionKey != null;
    } finally { db.close(); }
    return;
  }
  if (typeof localStorage !== 'undefined') {
    // The legacy localStorage path stores a plaintext base64 snapshot. That
    // is tolerable for development previews/tests, but a production build
    // must never expose the whole business database as readable text — fail
    // the save instead of silently downgrading to plaintext.
    if (isProductionBuild()) {
      throw new Error(
        'Refusing to persist the database snapshot in plaintext localStorage in a production build. ' +
        'Encrypted IndexedDB storage or the desktop file backend is required.'
      );
    }
    localStorage.setItem(key === DB_IDB_KEY ? DB_STORAGE_KEY : key, bytesToBase64(bytes));
    lastKnownBrowserSnapshotEncrypted = false;
    return;
  }
  throw new Error('No browser database storage is available');
}

// Removes the browser snapshot (encrypted or plaintext) once the encrypted file backend is
// authoritative, so no copy of the database lingers on disk.
// Backup snapshots stored under other keys are left untouched.
async function deleteBrowserSnapshot(): Promise<void> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const db = await openDatabaseStorage();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(DB_IDB_STORE, 'readwrite');
          transaction.objectStore(DB_IDB_STORE).delete(DB_IDB_KEY);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error || new Error('Browser database storage delete aborted'));
        });
        if (db.objectStoreNames.contains(DB_IDB_KEY_STORE)) {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(DB_IDB_KEY_STORE, 'readwrite');
            transaction.objectStore(DB_IDB_KEY_STORE).delete(DB_IDB_ENCRYPTION_KEY_ID);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Browser key storage delete aborted'));
          });
        }
        lastKnownBrowserSnapshotEncrypted = null;
      } finally { db.close(); }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DB_STORAGE_KEY);
      // Also remove encryption key when deleting snapshot for security
      localStorage.removeItem(DB_ENCRYPTION_KEY_KEY);
    }
  } catch { /* best effort: a stale copy must not break the encrypted save */ }
}

function persistenceErrorMessage(error: unknown, fallbackCode: string): string {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    if (typeof current === 'string' && current.trim()) return current.trim();
    if (typeof current !== 'object') break;
    seen.add(current);
    const message = typeof current.message === 'string' ? current.message.trim() : '';
    const code = typeof current.code === 'string' ? current.code.trim() : '';
    const errno = typeof current.errno === 'string' || typeof current.errno === 'number' ? String(current.errno) : '';
    const syscall = typeof current.syscall === 'string' ? current.syscall.trim() : '';
    const path = typeof current.path === 'string' ? current.path.trim() : '';
    const details = [code && `[${code}]`, errno && `errno ${errno}`, syscall, path].filter(Boolean).join(' ');
    if (message || details) return [message, details].filter(Boolean).join(' — ');
    current = current.cause;
  }
  return `تعذر حفظ قاعدة البيانات (الرمز: ${fallbackCode}). راجع سجل التطبيق لمعرفة تفاصيل الخطأ.`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}

// sql.js returns rows keyed by raw DB column names (snake_case). The service
// layer and the TypeScript interfaces use camelCase, so normalize row keys here.
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_match, c: string) => c.toUpperCase());
}

function snakeToCamelKeys<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camel = snakeToCamel(key);
    out[camel] = row[key];
    // Some platform-domain mappers still read the raw snake_case key; keep it
    // alongside the camelCase alias so both access styles resolve.
    if (camel !== key) out[key] = row[key];
  }
  return out as T;
}

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
      await this.initializeSqlEngine();
    }
    const emptyDb = new this.SQL.Database();
    this.applyPerformancePragmas(emptyDb);
    this.db = emptyDb;
    this.initializedSuccessfully = true;
  }

  public initialize(): Promise<Database> {
    if (this.db && this.initializedSuccessfully) return Promise.resolve(this.db);
    if (this.initializationPromise) return this.initializationPromise;

    const initialization = this.initializeDatabase();
    this.initializationPromise = initialization;
    void initialization.finally(() => {
      if (this.initializationPromise === initialization) this.initializationPromise = null;
    }).catch(() => {
      // The original promise carries the initialization failure to its callers.
    });
    return initialization;
  }

  private async initializeDatabase(): Promise<Database> {
    const initializationStartedAt = performance.now();
    this.clearQueryCache();
    if (this.db) {
      this.db?.close();
      this.db = null;
    }

    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    const sqlEngineStartedAt = performance.now();
    const snapshotLoadStartedAt = performance.now();
    const [, loadedDatabase] = await Promise.all([
      this.initializeSqlEngine().then(() => {
        console.info('[performance] SQL.js engine initialized', JSON.stringify({
          durationMs: Math.round((performance.now() - sqlEngineStartedAt) * 100) / 100,
        }));
      }),
      this.loadSavedBytes(fileApi).then((result) => {
        console.info('[performance] Database snapshot loaded', JSON.stringify({
          durationMs: Math.round((performance.now() - snapshotLoadStartedAt) * 100) / 100,
          bytes: result.savedBytes?.byteLength ?? 0,
          loadedFromFile: result.loadedFromFile,
        }));
        return result;
      }),
    ]);
    let savedBytes = loadedDatabase.savedBytes;
    const { loadedFromFile } = loadedDatabase;
    const databaseOpenStartedAt = performance.now();
    const isFreshDatabase = await this.openDatabase(savedBytes);
    console.info('[performance] SQLite database opened', JSON.stringify({
      durationMs: Math.round((performance.now() - databaseOpenStartedAt) * 100) / 100,
      isFreshDatabase,
    }));
    this.selectStorageBackend(fileApi);
    await this.backupBeforeGrossProfitMigration(savedBytes, loadedFromFile, isFreshDatabase, fileApi);
    // sql.js has copied the database into WASM memory; don't retain the raw
    // IPC snapshot while migrations and later exports allocate more memory.
    savedBytes = null;

    // When the schema bundle fingerprint already matches, runMigrations takes
    // its steady-state fast path and cannot change sqlite_master, so both
    // full-schema signature serializations are pure overhead — skip them.
    const { runMigrations, isSchemaBundleCurrent } = await import('../migrations');
    const schemaBundleCurrent = isSchemaBundleCurrent(this.getDatabase());
    const schemaBeforeMigrations = schemaBundleCurrent ? '' : this.getSchemaSignature();
    const legacyDataChanged = this.ensureLegacySalesInvoiceStatusColumns();
    const migrationStartedAt = performance.now();
    const report = runMigrations(this.getDatabase());
    console.info('[performance] Database migrations completed', JSON.stringify({
      durationMs: Math.round((performance.now() - migrationStartedAt) * 100) / 100,
      applied: report.applied.length,
      failed: report.failed.length,
    }));
    await this.handleMigrationFailures(report, isFreshDatabase, fileApi);

    const databaseChanged = isFreshDatabase
      || legacyDataChanged
      || report.applied.length > 0
      || (!schemaBundleCurrent && schemaBeforeMigrations !== this.getSchemaSignature());
    const persistenceStartedAt = performance.now();
    await this.persistInitializedDatabase(isFreshDatabase, databaseChanged);
    console.info('[performance] Initial database persistence completed', JSON.stringify({
      durationMs: Math.round((performance.now() - persistenceStartedAt) * 100) / 100,
      databaseChanged,
    }));
    this.forceFreshAfterRecovery = false;
    this.initializedSuccessfully = true;
    console.info('[performance] Database initialization completed', JSON.stringify({
      durationMs: Math.round((performance.now() - initializationStartedAt) * 100) / 100,
      databaseChanged,
    }));
    return this.getDatabase();
  }

  private async initializeSqlEngine(): Promise<void> {
    const { initSqlJsFn, wasmUrl } = await this.resolveSqlJs();
    if (typeof initSqlJsFn !== 'function') {
      throw new TypeError(
        'sql.js could not be resolved to a callable init function ' +
        `(got: ${typeof initSqlJsFn}). The installed sql.js build may be ` +
        'incompatible with the active runtime.'
      );
    }

    console.log('[database] Loading SQL.js engine. WASM URL:', wasmUrl);
    try {
      this.SQL = await initSqlJsFn({
        locateFile: (_file: string) => wasmUrl,
      });
      console.log('[database] SQL.js engine ready.');
    } catch (err) {
      console.error('[database] SQL.js failed to load:', err);
      throw err;
    }
  }

  private async resolveSqlJs(): Promise<{ initSqlJsFn: any; wasmUrl?: string }> {
    // Resolve the sql.js engine + wasm URL in a runtime-agnostic way:
    //  - Browser / Vite bundler: load the browser distribution. sql.js is a
    //    CommonJS build whose `module.exports` is the init function, with
    //    `module.exports.default` set to itself for interop. The bundler's
    //    CommonJS interop can expose the callable through EITHER the module
    //    or a nested `.default` chain — walk down until we have a function.
    //  - Node (`node --test`): the test harness injects a global `initSqlJs`
    //    that points at the CommonJS build and a real wasm file path.
    let _initSqlJsFn: any;
    let wasmUrl: string | undefined;

    const injected = (globalThis as any)?.initSqlJs;
    if (typeof injected === 'function') {
      // Harness-injected initializer (also lets hosts override sql.js).
      return { initSqlJsFn: injected, wasmUrl };
    }

    const candidate = this.unwrapSqlJsInitializer(await this.loadSqlJsModule());
    try {
      // @ts-expect-error - Vite resolves this wasm asset URL at build time.
      wasmUrl = (await import('sql.js/dist/sql-wasm-browser.wasm?url')).default;
    } catch {
      wasmUrl = undefined;
    }

    return { initSqlJsFn: candidate, wasmUrl };
  }

  private async loadSqlJsModule(): Promise<any> {
    try {
      // @ts-expect-error - sql.js does not declare its distributable entry points.
      return await import('sql.js/dist/sql-wasm-browser.js');
    } catch {
      // Fallback for runtimes whose ESM bundler cannot import the browser distribution.
      try {
        const nodeModuleId = 'node:module';
        const { createRequire } = await import(/* @vite-ignore */ nodeModuleId);
        const __require = createRequire(import.meta.url);
        return __require('sql.js');
      } catch {
        return undefined;
      }
    }
  }

  private unwrapSqlJsInitializer(candidate: any): any {
    // Interop can expose the initializer through nested `.default` wrappers.
    for (let depth = 0; depth < 8; depth++) {
      if (typeof candidate === 'function') break;
      const next = candidate && candidate.default;
      if (next === undefined || next === null || next === candidate) break;
      candidate = next;
    }
    return candidate;
  }

  private async loadSavedBytes(
    fileApi: DatabaseFileApi | undefined
  ): Promise<{ savedBytes: Uint8Array | null; loadedFromFile: boolean }> {
    let savedBytes: Uint8Array | null = null;
    let loadedFromFile = false;
    if (fileApi?.load) {
      let loaded: Uint8Array | null;
      try {
        loaded = await fileApi.load();
      } catch (error) {
        throw await this.databaseRecoveryError(error);
      }
      if (loaded !== null) {
        savedBytes = toUint8Array(loaded);
        if (!savedBytes) throw new Error('تعذر قراءة ملف قاعدة البيانات بسبب صيغة بيانات غير صالحة.');
        loadedFromFile = true;
        this.storageBackend = 'file';
      }
    }

    if (!this.forceFreshAfterRecovery && savedBytes === null && typeof indexedDB !== 'undefined') {
      try {
        savedBytes = await readBrowserSnapshot();
        if (savedBytes) this.storageBackend = 'indexedDB';
        else if (typeof localStorage !== 'undefined') {
          const legacy = localStorage.getItem(DB_STORAGE_KEY);
          if (legacy) {
            savedBytes = base64ToBytes(legacy);
            this.migratedLegacyStorage = true;
          }
        }
      } catch (error) {
        throw await this.databaseRecoveryError(error);
      }
    }

    if (!this.forceFreshAfterRecovery && savedBytes === null && typeof localStorage !== 'undefined') {
      const legacy = localStorage.getItem(DB_STORAGE_KEY);
      if (legacy) {
        try {
          savedBytes = base64ToBytes(legacy);
          this.migratedLegacyStorage = true;
          console.log('[database] Found legacy database snapshot; migrating it to a file.');
        } catch (e) {
          console.error('Failed to decode legacy database snapshot', e);
        }
      }
    }

    return { savedBytes, loadedFromFile };
  }

  private async openDatabase(savedBytes: Uint8Array | null): Promise<boolean> {
    if (savedBytes !== null) {
      if (savedBytes.length === 0) {
        throw await this.databaseRecoveryError(new Error('ملف قاعدة البيانات فارغ.'));
      }
      try {
        const loadedDb = new this.SQL.Database(savedBytes);
        // Verify file is a valid readable SQLite database immediately
        loadedDb.exec("SELECT 1 FROM sqlite_master LIMIT 1");
        this.applyPerformancePragmas(loadedDb);
        this.db = loadedDb;
        console.log(`[database] Loaded existing SQLite database (${this.storageBackend === 'file' ? 'file' : 'legacy storage'}).`);
      } catch (e) {
        throw await this.databaseRecoveryError(e);
      }
      return false;
    } else {
      console.log('Creating fresh SQLite database and running migrations...');
      const freshDb = new this.SQL.Database();
      this.applyPerformancePragmas(freshDb);
      this.db = freshDb;
      return true;
    }
  }

  private applyPerformancePragmas(database: Database): void {
    try {
      database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -4000;
      `);
    } catch {
      // Keep going if a pragma is unsupported by the engine build
    }
  }

  private selectStorageBackend(fileApi: DatabaseFileApi | undefined): void {
    if (!this.storageBackend || this.storageBackend === 'none') {
      this.storageBackend = fileApi?.save ? 'file' : (typeof indexedDB !== 'undefined' ? 'indexedDB' : (typeof localStorage !== 'undefined' ? 'localStorage' : 'none'));
    }
  }

  private async backupBeforeGrossProfitMigration(
    savedBytes: Uint8Array | null,
    loadedFromFile: boolean,
    isFreshDatabase: boolean,
    fileApi: DatabaseFileApi | undefined
  ): Promise<void> {
    // Bring the database up to the current schema. This runs on BOTH paths:
    // a saved database is loaded as an opaque blob, so tables and columns added
    // since it was created only ever arrive through here.
    if (!isFreshDatabase && !this.isMigrationApplied('045_reconcile_invoice_gross_profit')) {
      try {
        if (!savedBytes) throw new Error('تعذر الوصول إلى نسخة قاعدة البيانات الأصلية.');
        if (loadedFromFile && fileApi?.backup) {
          const backup = await fileApi.backup('before-gross-profit-policy');
          if (!backup?.ok || !backup.path) throw new Error(backup?.error || 'لم يتم إنشاء نسخة احتياطية.');
        } else if (typeof indexedDB !== 'undefined' || typeof localStorage !== 'undefined') {
          await writeBrowserSnapshot(savedBytes, `before_gross_profit_${Date.now()}`);
        } else {
          throw new Error('لا يتوفر وسيط لإنشاء نسخة احتياطية قبل الترحيل.');
        }
      } catch (error) {
        this.db?.close();
        this.db = null;
        throw new Error(`توقف الترحيل المالي قبل تعديل البيانات لعدم إنشاء نسخة احتياطية: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async handleMigrationFailures(
    report: MigrationReport,
    isFreshDatabase: boolean,
    fileApi: DatabaseFileApi | undefined
  ): Promise<void> {
    if (report.failed.length > 0) {
      console.error('[database] Some migrations did not apply; they will be retried on next launch.', report.failed);
      let backupMessage = '';
      if (!isFreshDatabase && fileApi?.preserveCorrupt) {
        try {
          const backup = await fileApi.preserveCorrupt();
          backupMessage = ` نسخة الاستعادة الخام: ${backup.path}.`;
        } catch (backupError) {
          backupMessage = ` تعذر إنشاء نسخة خام: ${backupError instanceof Error ? backupError.message : String(backupError)}.`;
        }
      }
      this.db?.close();
      this.db = null;
      throw new Error(`Database migration failed (${report.failed[0].id}): ${report.failed[0].error}.${backupMessage}`);
    }
  }

  private async persistInitializedDatabase(isFreshDatabase: boolean, databaseChanged: boolean): Promise<void> {
    // Seed reference data only for a genuinely new database — migrations already
    // hold everything an existing database needs.
    if (isFreshDatabase) {
      this.seedInitialData();
    }

    if (!databaseChanged) return;
    this.markDirty();
    this.saveToStorage();
    await this.flush();
    if (this.lastPersistError) {
      this.db?.close();
      this.db = null;
      throw new Error(`تعذر حفظ قاعدة البيانات على وسيط التخزين. لم يبدأ النظام لتجنب العمل على بيانات غير محفوظة. ${this.lastPersistError}`);
    }
  }

  private async databaseRecoveryError(cause: unknown): Promise<Error & { code: string }> {
    const message = cause instanceof Error ? cause.message : String(cause);
    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    if (fileApi?.preserveCorrupt) {
      try {
        const backup = await fileApi.preserveCorrupt();
        return Object.assign(
          new Error(`تعذر فتح قاعدة البيانات الموجودة. تم حفظ نسخة خام للاستعادة في: ${backup.path}. لن تُكتب قاعدة جديدة فوق الملف الأصلي.`),
          { code: 'DATABASE_RECOVERY_REQUIRED' }
        );
      } catch (backupError) {
        const backupMessage = backupError instanceof Error ? backupError.message : String(backupError);
        return Object.assign(
          new Error(`تعذر فتح قاعدة البيانات الموجودة (${message})، كما تعذر حفظ نسخة استعادة خام (${backupMessage}). لم يتم تعديل الملف الأصلي.`),
          { code: 'DATABASE_RECOVERY_REQUIRED' }
        );
      }
    }
    return Object.assign(
      new Error(`تعذر فتح قاعدة البيانات الموجودة (${message}). لم يتم إنشاء قاعدة جديدة أو الكتابة فوق الملف.`),
      { code: 'DATABASE_RECOVERY_REQUIRED' }
    );
  }

  private isMigrationApplied(id: string): boolean {
    const migrationTable = this.db?.exec(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`
    )[0]?.values.length;
    if (!migrationTable) return false;
    return Boolean(this.db?.exec(
      'SELECT 1 FROM schema_migrations WHERE id = ?',
      [id]
    )[0]?.values.length);
  }

  private ensureLegacySalesInvoiceStatusColumns(): boolean {
    if (!this.db) return false;
    const salesInvoices = this.db.exec('SELECT name FROM sqlite_master WHERE type = "table" AND name = "sales_invoices"');
    if ((salesInvoices[0]?.values?.length ?? 0) === 0) return false;

    const columnInfo = new Map<string, { notNull: boolean }>(
      (this.db.exec('PRAGMA table_info(sales_invoices)')[0]?.values ?? [])
        .map((row: unknown[]) => [String(row[1]), { notNull: Number(row[3]) === 1 }])
    );
    let changed = false;

    if (!columnInfo.has('payment_status')) {
      this.db.run("ALTER TABLE sales_invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'PAID'");
      columnInfo.set('payment_status', { notNull: true });
      changed = true;
    }
    if (!columnInfo.has('invoice_status')) {
      this.db.run("ALTER TABLE sales_invoices ADD COLUMN invoice_status TEXT NOT NULL DEFAULT 'COMPLETED'");
      columnInfo.set('invoice_status', { notNull: true });
      changed = true;
    }

    const paymentStatusInfo = columnInfo.get('payment_status');
    if (paymentStatusInfo && !paymentStatusInfo.notNull) {
      this.db.run(`UPDATE sales_invoices SET payment_status = 'PAID' WHERE payment_status IS NULL`);
      changed = changed || this.db.getRowsModified() > 0;
    }
    const invoiceStatusInfo = columnInfo.get('invoice_status');
    if (invoiceStatusInfo && !invoiceStatusInfo.notNull) {
      this.db.run(`UPDATE sales_invoices SET invoice_status = 'COMPLETED' WHERE invoice_status IS NULL`);
      changed = changed || this.db.getRowsModified() > 0;
    }
    return changed;
  }

  private getSchemaSignature(): string {
    if (!this.db) return '';
    return JSON.stringify(this.db.exec(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )[0]?.values ?? []);
  }

  public async createFreshAfterRecovery(): Promise<void> {
    const recoveryApi = typeof window !== 'undefined' ? window.ceramisys?.db?.createFreshAfterRecovery : undefined;
    if (!recoveryApi) throw new Error('إنشاء قاعدة جديدة بعد التعذر متاح فقط من تطبيق سطح المكتب.');
    const result = await recoveryApi();
    if (!result?.ok) throw new Error('تعذر أرشفة قاعدة البيانات السابقة قبل إنشاء قاعدة جديدة.');
    this.db = null;
    this.forceFreshAfterRecovery = true;
    this.storageBackend = 'none';
    this.lastPersistError = null;
    this.lastPersistErrorCode = null;
  }

  private seedInitialData(): void {
    if (!this.db) return;

    // Hash admin default password (admin123)
    // Pre-computed hash for 'admin123' to eliminate synchronous bcrypt overhead during initial startup:
    const adminHash = '$2a$10$uURy9H8RJQFCDiqtDkMxWewz1KO8N8Psb6xos3wzxgECbo0Yel0ra';

    // 1. Initial Admin User
    this.db.run(`
      INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALL')
    `, ['usr_admin', 'admin', adminHash, 'مدير النظام', 'ADMIN', null, null, 1, DEFAULT_BRANCH_ID]);

    // 2. System settings, default branch, roles and price lists are all seeded by
    //    migrations (see DEFAULT_SETTINGS and MIGRATIONS in ./migrations) so that
    //    databases created before a key existed pick it up too.

    // 3. Default Warehouse
    this.db.run(`
      INSERT INTO warehouses (id, name, code, location, warehouse_type, is_default, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['wh_main', 'المعرض الرئيسي', 'MAIN-01', 'صالة العرض والمخزن الملحق', 'SHOWROOM', 1, 1, DEFAULT_BRANCH_ID]);

    this.db.run(`
      INSERT INTO warehouses (id, name, code, location, warehouse_type, is_default, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['wh_ext', 'المخزن الخارجي الرئيسي', 'EXT-01', 'المنطقة الصناعية - عنبر 4', 'MAIN_WAREHOUSE', 0, 1, DEFAULT_BRANCH_ID]);

    // 4. Default Cash Register
    this.db.run(`
      INSERT INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['cr_main', 'الخزينة الرئيسية (كاشير 1)', 0, 1, 1, DEFAULT_BRANCH_ID]);

    // 5. Default Categories
    const categories = [
      ['cat_floor', 'سيراميك أرضيات', null, 'بلاط وسيراميك مخصص للأرضيات'],
      ['cat_wall', 'سيراميك حوائط ومطابخ', null, 'سيراميك حوائط، حمامات ومطابخ'],
      ['cat_porcelain', 'بورسلين مستورد ومحلي', null, 'بورسلين أرضيات وحوائط عالي المتانة'],
      ['cat_adhesives', 'مواد لصق ومواد تشطيب', null, 'لواصق سيراميك، روبة، فواصل تمدد، زوايا'],
      ['cat_sanitary', 'أدوات صحية وخلاطات', null, 'خلاطات، أحواض، أطقم حمامات']
    ];

    for (const [id, name, parentId, desc] of categories) {
      this.db.run(`
        INSERT INTO categories (id, name, parent_id, description)
        VALUES (?, ?, ?, ?)
      `, [id, name, parentId, desc]);
    }

    // 6. Default Brands
    const brands = [
      ['br_cleo', 'سيراميكا كليوباترا', 'مصر'],
      ['br_glam', 'رويال للبورسلين والسيراميك', 'مصر'],
      ['br_alf', 'سيراميكا ألفا', 'مصر'],
      ['br_prima', 'سيراميكا بريما', 'مصر'],
      ['br_sav', 'سيراميكا سيراميكا', 'مصر'],
      ['br_sika', 'سيكا للكيماويات والبناء', 'سويسرا']
    ];

    for (const [id, name, country] of brands) {
      this.db.run(`
        INSERT INTO brands (id, name, country)
        VALUES (?, ?, ?)
      `, [id, name, country]);
    }

    // 7. Default Expense Categories
    const expenseCats = [
      ['exp_rent', 'إيجار المقر والمخازن', 'إيجار شهري للمعارض'],
      ['exp_utilities', 'كهرباء ومياه وغاز', 'فواتير المرافق العامة'],
      ['exp_salaries', 'رواتب وأجور موظفين', 'أجور المبيعات والمخازن'],
      ['exp_transport', 'مشال ونقل وبنزين', 'مصاريف سيارات المعرض والنقل'],
      ['exp_maint', 'صيانة ونظافة وضيافة', 'مصاريف تشغيلية دورية']
    ];

    for (const [id, name, desc] of expenseCats) {
      this.db.run(`
        INSERT INTO expense_categories (id, name, description)
        VALUES (?, ?, ?)
      `, [id, name, desc]);
    }
  }

  public scheduleDebouncedSave(delayMs = 3000): void {
    if (this.persistenceSuppressed || this.transactionDepth > 0) return;
    if (this.debounceSaveTimer) clearTimeout(this.debounceSaveTimer);
    this.cancelIdleSave();
    this.debounceSaveTimer = setTimeout(() => {
      this.debounceSaveTimer = null;
      // Throttle: if a save just completed recently, skip this debounced save
      // to avoid back-to-back full-database exports that freeze the UI.
      const now = Date.now();
      if (now - this.lastSaveStartMs < this.SAVE_MIN_INTERVAL_MS) {
        // Too soon after the last save; re-schedule instead of skipping entirely so
        // we don't silently lose pending changes (setting dirtySinceLastSave=false here
        // was a data-loss bug — changes could go un-persisted until the next mutation).
        this.scheduleDebouncedSave(this.SAVE_MIN_INTERVAL_MS);
        return;
      }
      const idleHost = globalThis as IdleCallbackHost;
      if (typeof idleHost.requestIdleCallback === 'function') {
        this.idleSaveHandle = idleHost.requestIdleCallback(() => {
          this.idleSaveHandle = null;
          this.saveToStorage();
        }, { timeout: 10000 });
      } else {
        // requestIdleCallback not available (some Electron builds): give the renderer
        // 300 ms of idle time so button presses and form submissions can paint before
        // we start the synchronous multi-megabyte db.export().
        this.idleSaveTimer = setTimeout(() => {
          this.idleSaveTimer = null;
          this.saveToStorage();
        }, 300);
      }
    }, delayMs);
  }

  public saveToStorage(force = false): void {
    if (this.persistenceSuppressed || !this.db) return;
    if (this.debounceSaveTimer) {
      clearTimeout(this.debounceSaveTimer);
      this.debounceSaveTimer = null;
    }
    this.cancelIdleSave();
    if (!this.dirtySinceLastSave) return;
    if (this.saveInProgress) return; // Already saving; skip to avoid UI freeze
    const now = Date.now();
    if (!force && now - this.lastSaveStartMs < this.SAVE_MIN_INTERVAL_MS) {
      // Too soon after the last save; re-schedule instead of clearing the dirty
      // flag (clearing it here was a data-loss bug — changes could go
      // un-persisted until the next mutation).
      this.scheduleDebouncedSave(this.SAVE_MIN_INTERVAL_MS);
      return;
    }
    this.saveInProgress = true;
    this.lastSaveStartMs = now;
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
      this.saveChain = this.saveChain
        .then(() => this.performSaveToStorage())
        .finally(() => {
          this.saveInProgress = false;
          // Mutations that arrived while the export was in flight are not
          // covered by this snapshot (mutationSeq moved past lastSnapshotSeq);
          // schedule another save for them. A persist still in flight will
          // clear the dirty flag itself when it completes.
          if (this.dirtySinceLastSave && this.mutationSeq !== this.lastSnapshotSeq) {
            this.scheduleDebouncedSave(this.SAVE_MIN_INTERVAL_MS);
          }
        });
    });
  }

  private async performSaveToStorage(): Promise<void> {
    const exportBeganAt = performance.now();
    // Preferred path: export inside the database Web Worker so the
    // multi-megabyte synchronous db.export() never blocks the UI thread.
    // The worker is kept in sync via statement forwarding, so its snapshot is
    // identical to the main one. Any failure falls back to the main-thread
    // export so persistence never depends on the worker being healthy.
    const requestedSeq = this.mutationSeq;
    try {
      const { exportDatabaseAsync } = await this.importAsyncService();
      const snapshot = await exportDatabaseAsync();
      this.lastSnapshotSeq = requestedSeq;
      const exportDurationMs = Math.max(0, performance.now() - exportBeganAt);
      if (exportDurationMs >= SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS) {
        console.warn('[performance] Slow database snapshot export (worker)', JSON.stringify({
          durationMs: Math.round(exportDurationMs * 100) / 100,
          bytes: snapshot.byteLength,
        }));
      }
      this.persist(snapshot, requestedSeq);
      return;
    } catch (workerError) {
      console.warn('[database] Worker snapshot export unavailable; falling back to main-thread export.', workerError);
    }

    let snapshot: Uint8Array;
    const exportStartedAt = exportBeganAt;
    try {
      snapshot = this.exportSnapshot();
    } catch (e) {
      const failure = toAppError(e, 'DATABASE_SNAPSHOT_FAILED', 'تعذر إنشاء لقطة لقاعدة البيانات.');
      this.lastPersistError = persistenceErrorMessage(e, failure.code);
      this.lastPersistErrorCode = failure.code;
      console.error('Failed to export SQLite database snapshot', e);
      return;
    }
    this.lastSnapshotSeq = this.mutationSeq;
    const exportDurationMs = Math.max(0, performance.now() - exportStartedAt);
    if (exportDurationMs >= SLOW_SNAPSHOT_EXPORT_THRESHOLD_MS) {
      console.warn('[performance] Slow database snapshot export', JSON.stringify({
        durationMs: Math.round(exportDurationMs * 100) / 100,
        bytes: snapshot.byteLength,
      }));
    }
    this.persist(snapshot, this.lastSnapshotSeq);
  }

  /**
   * Serializes writes so a slow disk (or concurrent transaction) can never
   * overwrite a newer snapshot with an older one. `seq` is the mutationSeq the
   * snapshot was exported at, used to drop snapshots superseded by a
   * synchronous durable write.
   */
  private persist(snapshot: Uint8Array, seq: number): void {
    this.pendingSnapshot = { bytes: snapshot, seq };
    if (this.isPersisting) return;
    this.isPersisting = true;
    this.persistQueue = this.persistQueue
      .then(async () => {
        while (this.pendingSnapshot) {
          const nextSnapshot = this.pendingSnapshot;
          this.pendingSnapshot = null;
          await this.persistSnapshot(nextSnapshot.bytes, nextSnapshot.seq);
        }
      })
      .finally(() => {
        this.isPersisting = false;
        if (this.pendingSnapshot) this.persist(this.pendingSnapshot.bytes, this.pendingSnapshot.seq);
      });
  }

  private async persistSnapshot(snapshot: Uint8Array, seq: number): Promise<void> {
    // A synchronous durable write already landed a newer (or equal) snapshot —
    // persisting this older export would only waste a multi-megabyte write.
    if (seq >= 0 && seq <= this.lastSyncPersistedSeq) return;
    const persistStartedAt = performance.now();
    let persistSucceeded = false;
    try {
      if (await this.persistToFile(snapshot)) {
        persistSucceeded = true;
        return;
      }
      if (typeof indexedDB !== 'undefined' || typeof localStorage !== 'undefined') {
        await writeBrowserSnapshot(snapshot);
        persistSucceeded = true;
        this.storageBackend = typeof indexedDB !== 'undefined' ? 'indexedDB' : 'localStorage';
        if (this.migratedLegacyStorage && typeof localStorage !== 'undefined' && typeof indexedDB !== 'undefined') {
          try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* keep the migrated copy if cleanup is blocked */ }
          this.migratedLegacyStorage = false;
        }
        this.lastPersistError = null;
        this.lastPersistErrorCode = null;
      } else {
        this.storageBackend = 'none';
      }
    } catch (error) {
      const failure = toAppError(error, 'DATABASE_PERSIST_FAILED', 'تعذر حفظ قاعدة البيانات.');
      this.lastPersistError = persistenceErrorMessage(error, failure.code);
      this.lastPersistErrorCode = failure.code;
      console.error('Failed to persist SQLite database', error);
    } finally {
      // The snapshot reflects every mutation up to `lastSnapshotSeq`. Clear
      // the dirty flag only when the write actually reached durable storage
      // and no newer mutation happened since the export started, otherwise
      // the next save exports the newer state or retries the failed write.
      if (persistSucceeded && this.mutationSeq === this.lastSnapshotSeq) {
        this.dirtySinceLastSave = false;
      }
      const durationMs = Math.max(0, performance.now() - persistStartedAt);
      if (durationMs >= SLOW_SNAPSHOT_PERSIST_THRESHOLD_MS) {
        console.warn('[performance] Slow database snapshot persistence', JSON.stringify({
          durationMs: Math.round(durationMs * 100) / 100,
          bytes: snapshot.byteLength,
          backend: this.storageBackend,
        }));
      }
    }
  }

  private cancelIdleSave(): void {
    if (this.idleSaveTimer) {
      clearTimeout(this.idleSaveTimer);
      this.idleSaveTimer = null;
    }
    if (this.idleSaveHandle === null) return;
    const idleHost = globalThis as IdleCallbackHost;
    idleHost.cancelIdleCallback?.(this.idleSaveHandle);
    this.idleSaveHandle = null;
  }

  private async persistToFile(snapshot: Uint8Array): Promise<boolean> {
    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    if (!fileApi?.save) return false;

    const result = await fileApi.save(snapshot);
    if (!result?.ok) {
      throw new AppError(result?.error || 'تعذر حفظ قاعدة البيانات على القرص.',
        result?.code || 'DATABASE_SAVE_FAILED', result?.retryable !== false);
    }
    this.storageBackend = 'file';
    this.lastPersistError = null;
    this.lastPersistErrorCode = null;
    void deleteBrowserSnapshot();
    if (this.migratedLegacyStorage && typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
      this.migratedLegacyStorage = false;
    }
    return true;
  }

  /** Wait for all pending disk writes (used before shutdown/backup/restore). */
  public async flush(): Promise<void> {
    if (this.persistenceSuppressed) return;
    if (this.debounceSaveTimer || this.idleSaveHandle !== null || this.idleSaveTimer !== null) {
      clearTimeout(this.debounceSaveTimer);
      this.debounceSaveTimer = null;
      this.cancelIdleSave();
    }
    // Force a final snapshot for anything still dirty — including changes that
    // arrived while a previous save was in flight. Poll briefly because the
    // export is scheduled on a macrotask and `persistQueue` may not include it
    // yet when we first check. A persist failure stops the loop so flush()
    // reports it instead of silently retrying within the same call.
    const deadline = Date.now() + 30000;
    // A save already in flight when flush() starts counts as this flush's
    // attempt — if it fails we report the error instead of retrying silently.
    let attemptedSave = this.saveInProgress || this.isPersisting || this.pendingSnapshot !== null;
    while (this.dirtySinceLastSave && Date.now() < deadline) {
      const saveActive = this.saveInProgress || this.isPersisting || this.pendingSnapshot !== null;
      if (!saveActive) {
        if (attemptedSave && this.lastPersistError) break;
        this.saveToStorage(true);
        attemptedSave = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // Bound the drain wait as well: a stuck disk write must surface as an
    // error instead of hanging durable transactions (invoices, payments)
    // forever.
    const persistDeadline = Date.now() + 60000;
    while (this.isPersisting || this.pendingSnapshot) {
      const remaining = persistDeadline - Date.now();
      if (remaining <= 0) {
        throw new AppError(
          'انتهت مهلة انتظار حفظ تغييرات قاعدة البيانات على القرص.',
          'DATABASE_PERSIST_TIMEOUT',
          true,
        );
      }
      await Promise.race([
        this.persistQueue,
        new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining))),
      ]);
    }
    if (this.lastPersistError) {
      throw new AppError(`تعذر حفظ تغييرات قاعدة البيانات: ${this.lastPersistError}`, 'DATABASE_PERSIST_FAILED', true, {
        cause: new AppError(this.lastPersistError, this.lastPersistErrorCode || 'DATABASE_SAVE_FAILED', true),
      });
    }
  }

  public getStorageBackend(): 'file' | 'indexedDB' | 'localStorage' | 'none' {
    return this.storageBackend;
  }

  public getLastPersistError(): string | null {
    return this.lastPersistError;
  }

  public getPersistenceStatus(): {
    status: 'saving' | 'saved' | 'error' | 'unencrypted' | 'unavailable';
    encryption?: 'encrypted-at-rest' | 'plaintext' | 'file-encrypted' | 'unknown';
    error?: string;
    code?: string;
  } {
    if (this.lastPersistError) return { status: 'error', error: this.lastPersistError, code: this.lastPersistErrorCode || 'DATABASE_PERSIST_FAILED' };
    if (this.storageBackend === 'none') return { status: 'unavailable' };
    if (this.debounceSaveTimer || this.idleSaveHandle !== null || this.idleSaveTimer !== null || this.isPersisting || this.pendingSnapshot || this.saveInProgress) {
      return { status: 'saving' };
    }
    if (this.storageBackend === 'file') {
      return { status: 'saved', encryption: 'file-encrypted' };
    }
    if (this.storageBackend === 'localStorage') {
      return { status: 'unencrypted', encryption: 'plaintext' };
    }
    if (this.storageBackend === 'indexedDB') {
      // IndexedDB snapshots are AES-GCM ciphertext whenever the Web Crypto
      // key is available; only report 'unencrypted' when we actually wrote or
      // read a plaintext snapshot.
      return lastKnownBrowserSnapshotEncrypted === true
        ? { status: 'saved', encryption: 'encrypted-at-rest' }
        : {
            status: 'unencrypted',
            encryption: lastKnownBrowserSnapshotEncrypted === false ? 'plaintext' : 'unknown',
          };
    }
    return { status: 'saved', encryption: 'unknown' };
  }

  public getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized! Call DatabaseManager.getInstance().initialize() first.');
    }
    if (this.databaseFacadeTarget !== this.db || !this.databaseFacade) {
      const database = this.db;
      this.databaseFacadeTarget = database;
      this.databaseFacade = new Proxy(database, {
        get: (target, property) => {
          const value = Reflect.get(target, property, target);
          if (property === 'run' || property === 'exec') {
            return (...args: unknown[]) => {
              const sql = args[0];
              const applyAndForward = () => {
                try {
                  const result = Reflect.apply(value, target, args);
                  this.forwardMutation(
                    property,
                    typeof sql === 'string' ? sql : '',
                    Array.isArray(args[1]) ? args[1] : [],
                  );
                  return result;
                } catch (error) {
                  // exec() can apply several statements before failing, so a
                  // failed exec may still have mutated the database. Mirror it
                  // to the worker replica as well — it will fail identically
                  // and its error response triggers a resync if needed. A
                  // failed run() is a no-op on both sides, so it is skipped.
                  if (property === 'exec') {
                    this.forwardMutation(
                      'exec',
                      typeof sql === 'string' ? sql : '',
                      Array.isArray(args[1]) ? args[1] : [],
                    );
                  }
                  throw error;
                }
              };
              return this.trackQuery(typeof sql === 'string' ? sql : '', () => {
                if (typeof sql !== 'string' || this.isMutatingSql(sql)) {
                  this.clearQueryCache();
                  this.markDirty();
                }
                if (property === 'exec' && typeof sql === 'string') {
                  const params = Array.isArray(args[1]) ? args[1] : [];
                  const cacheKey = this.createQueryCacheKey(sql, params);
                  if (cacheKey) {
                    const key = `exec:${cacheKey}`;
                    const cached = this.getCachedQuery<unknown>(key);
                    if (cached !== undefined) return cached;
                    const result = applyAndForward();
                    this.setCachedQuery(key, result);
                    return result;
                  }
                }
                return applyAndForward();
              });
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }
    return this.databaseFacade;
  }

  public getDb(): Database {
    return this.getDatabase();
  }

  /**
   * Esporta l'intero database come Uint8Array (binary snapshot di sql.js).
   * Utile per trasferire lo stato del database a un Web Worker e tornare indietro.
   */
  public exportDatabaseBytes(): Uint8Array {
    const db = this.getDatabase();
    return db.export();
  }

  /**
   * Sostituisce il database in memoria con i bytes forniti (es. ricevuti da un Web Worker).
   * Dopo questa chiamata tutte le query successive lavoreranno sul nuovo stato.
   */
  public importDatabaseBytes(bytes: Uint8Array): void {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    const candidate = new this.SQL.Database(bytes);
    try {
      const integrity = candidate.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
      if (integrity !== 'ok') {
        throw new Error('Imported database failed integrity check');
      }
      // Schema invariant: the snapshot must contain the core application
      // tables before it is allowed to replace the live database.
      const tables = candidate.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = new Set((tables[0]?.values || []).map((row: unknown[]) => String(row[0])));
      const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
      const missingTables = requiredTables.filter((name) => !names.has(name));
      if (missingTables.length > 0) {
        throw new Error(`Imported database is missing required tables: ${missingTables.join(', ')}`);
      }
      const foreignKeyResults = candidate.exec('PRAGMA foreign_key_check');
      const violationCount = foreignKeyResults.reduce(
        (total: number, result: { values?: unknown[] }) => total + (result?.values?.length ?? 0),
        0,
      );
      if (violationCount > 0) {
        throw new Error(`Imported database contains ${violationCount} foreign key violation(s)`);
      }
    } catch (error) {
      candidate.close();
      throw error;
    }
    this.db = candidate;
    this.databaseFacade = null;
    this.databaseFacadeTarget = null;
    this.clearQueryCache();
    this.markDirty();
    this.notifyDatabaseReplaced();
    this.scheduleDebouncedSave();
  }

  // ============================================================================
  // واجهة غير متزامنة (Async API) — تُنفذ العمليات في Web Worker منفصل
  // لمنع تجميد واجهة المستخدم عند استدعاء أي استعلام SQLite أو تصدير قاعدة البيانات.
  // ============================================================================

  private async importAsyncService(): Promise<typeof import('../databaseAsyncService')> {
    return import('../databaseAsyncService');
  }

  /**
   * تنفيذ استعلام SELECT بشكل غير متزامن في Web Worker (لا يحجب واجهة المستخدم).
   * يعيد نفس تنسيق النتيجة الخاص بـ `query` (مصفوفة من الكائنات بمفاتيح camelCase).
   */
  public async queryAsync<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { queryAsync } = await this.importAsyncService();
    return queryAsync<T>(sql, params);
  }

  /**
   * تنفيذ INSERT/UPDATE/DELETE بشكل غير متزامن في Web Worker.
   */
  public async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    const { runAsync } = await this.importAsyncService();
    return runAsync(sql, params);
  }

  /**
   * تنفيذ SQL خام (transactions, PRAGMA) بشكل غير متزامن في Web Worker.
   */
  public async execAsync(sql: string): Promise<void> {
    const { execAsync } = await this.importAsyncService();
    return execAsync(sql);
  }

  /**
   * تصدير قاعدة البيانات بشكل غير متزامن من Web Worker.
   * يعيد Uint8Array يمكن حفظه في indexedDB أو ملف.
   */
  public async exportDatabaseAsync(): Promise<Uint8Array> {
    const { exportDatabaseAsync } = await this.importAsyncService();
    return exportDatabaseAsync();
  }

  /**
   * استيراد قاعدة بيانات ثنائية بشكل غير متزامن إلى Web Worker والخيط الرئيسي.
   */
  public async importDatabaseAsync(bytes: Uint8Array): Promise<void> {
    const { importDatabaseAsync } = await this.importAsyncService();
    return importDatabaseAsync(bytes);
  }

  /**
   * Collision-proof, transaction-safe sequential document number generator.
   * Example: nextNumber('INV') -> 'INV-2026-000001'
   * Must be called INSIDE an executeTransaction() callback so the counter
   * is atomically incremented with the document it names (prevents gaps/duplicates).
   */
  public nextNumber(prefix: string): string {
    this.run('INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)', [prefix]);
    const row = this.query<{ value: number }>('SELECT value FROM sequence_counters WHERE name = ?', [prefix])[0];
    const next = (row?.value ?? 0) + 1;
    this.run('UPDATE sequence_counters SET value = ? WHERE name = ?', [next, prefix]);
    const year = new Date().getFullYear();
    const custom = getDatabaseManagerState().numberFormatter?.(prefix, next, new Date());
    if (custom) return custom;
    return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
  }

  /**
   * Synchronously exports the current snapshot and writes it through the
   * Electron `db:save-sync` IPC channel, which performs the encrypted file
   * write in the main process before replying. Only used by
   * executeFinancialTransaction; any failure throws so the caller never sees
   * a successful result for a write that is not on disk.
   */
  private persistSnapshotSynchronously(): void {
    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    if (typeof fileApi?.saveSync !== 'function' || !this.db) {
      // No synchronous durable channel (browser build, tests, older Electron
      // preload): degrade to the immediate async persist. Durability is then
      // best-effort — callers needing a hard guarantee must use
      // executeDurableTransaction.
      this.saveToStorage(true);
      if (this.dirtySinceLastSave) this.scheduleDebouncedSave(0);
      return;
    }

    const snapshot = this.exportSnapshot();
    const seq = this.mutationSeq;
    this.lastSnapshotSeq = seq;

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
      this.saveToStorage(true);
      if (this.dirtySinceLastSave) this.scheduleDebouncedSave(0);
      return;
    }

    if (!result?.ok) {
      const failure = new AppError(
        result?.error || 'تعذر حفظ قاعدة البيانات على القرص.',
        result?.code || 'DATABASE_SAVE_FAILED',
        result?.retryable !== false,
      );
      this.lastPersistError = persistenceErrorMessage(result?.error, failure.code);
      this.lastPersistErrorCode = failure.code;
      throw failure;
    }

    this.lastSyncPersistedSeq = seq;
    this.storageBackend = 'file';
    this.lastPersistError = null;
    this.lastPersistErrorCode = null;
    void deleteBrowserSnapshot();
    if (this.migratedLegacyStorage && typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
      this.migratedLegacyStorage = false;
    }
    this.dirtySinceLastSave = false;
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
    return this.executeTransaction(callback, { immediatePersist: true, durableSync: true });
  }

  public executeTransaction<T>(
    callback: (db: DatabaseManager) => T,
    options?: { immediatePersist?: boolean; durableSync?: boolean },
  ): T {
    if (options?.immediatePersist) this.immediatePersistRequested = true;
    if (options?.durableSync) this.durableSyncRequested = true;
    if (this.transactionDepth === 0 && this.lastPersistError) {
      throw new AppError(
        `توقفت المعاملات لأن آخر عملية لم تُحفظ على القرص: ${this.lastPersistError}`,
        'DATABASE_PERSIST_FAILED',
        true,
      );
    }
    const db = this.getDatabase();
    const depth = this.transactionDepth;
    const isOuterTransaction = depth === 0;
    const savepoint = `db_nested_${depth}`;
    if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
    else db.exec(`SAVEPOINT ${savepoint};`);
    this.transactionDepth++;
    let depthReleased = false;
    let committed = false;
    try {
      const result = callback(this);
      this.transactionDepth--;
      depthReleased = true;
      if (isOuterTransaction) {
        db.exec('COMMIT;');
        committed = true;
        this.clearQueryCache();
        this.markDirty();
        const persistImmediately = this.immediatePersistRequested;
        const durableSync = this.durableSyncRequested;
        this.immediatePersistRequested = false;
        this.durableSyncRequested = false;
        if (durableSync) {
          // Financial writes demand a synchronous durable snapshot: on the
          // Electron file backend this blocks until the encrypted file write
          // completes (or throws). Throws propagate through the catch below
          // with committed=true so callers see an honest failure.
          this.persistSnapshotSynchronously();
        } else if (persistImmediately) {
          // Financial writes skip the debounce/idle delay so the snapshot
          // reaches durable storage within ~one frame instead of seconds.
          this.saveToStorage(true);
          if (this.dirtySinceLastSave) this.scheduleDebouncedSave(0);
        } else {
          this.scheduleDebouncedSave();
        }
      } else {
        db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      }
      return result;
    } catch (error) {
      if (!depthReleased) this.transactionDepth--;
      if (isOuterTransaction) {
        this.immediatePersistRequested = false;
        this.durableSyncRequested = false;
      }
      if (!committed) this.rollbackTransaction(db, isOuterTransaction, savepoint);
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

  private rollbackTransaction(db: Database, isOuterTransaction: boolean, savepoint: string): void {
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
  public async executeDurableTransaction<T>(
    callback: (db: DatabaseManager) => T | Promise<T>,
  ): Promise<T> {
    if (this.transactionDepth === 0 && this.lastPersistError) {
      throw new AppError(
        `توقفت المعاملات لأن آخر عملية لم تُحفظ على القرص: ${this.lastPersistError}`,
        'DATABASE_PERSIST_FAILED',
        true,
      );
    }
    const db = this.getDatabase();
    const depth = this.transactionDepth;
    const isOuterTransaction = depth === 0;
    const savepoint = `db_nested_${depth}`;
    if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
    else db.exec(`SAVEPOINT ${savepoint};`);
    this.transactionDepth++;
    let depthReleased = false;
    let committed = false;
    try {
      const result = await callback(this);
      this.transactionDepth--;
      depthReleased = true;
      if (isOuterTransaction) {
        db.exec('COMMIT;');
        committed = true;
        this.clearQueryCache();
        this.markDirty();
        this.saveToStorage(true);
        await this.flush();
      } else {
        db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      }
      return result;
    } catch (error) {
      if (!depthReleased) this.transactionDepth--;
      if (!committed) this.rollbackTransaction(db, isOuterTransaction, savepoint);
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

  public query<T = any>(sql: string, params: any[] = []): T[] {
    return this.trackQuery(sql, () => {
      const cacheKey = this.createQueryCacheKey(sql, params);
      if (cacheKey) {
        const cached = this.getCachedQuery<T[]>(`query:${cacheKey}`);
        if (cached !== undefined) return cached;
      }

      const db = this.getDatabase();
      const stmt = db.prepare(sql);
      const results: Record<string, unknown>[] = [];
      try {
        stmt.bind(params);
        while (stmt.step()) {
          results.push(snakeToCamelKeys(stmt.getAsObject()));
        }
      } finally {
        stmt.free();
      }
      if (cacheKey) this.setCachedQuery(`query:${cacheKey}`, results);
      return results as T[];
    });
  }

  public run(sql: string, params: any[] = []): void {
    this.trackQuery(sql, () => {
      this.clearQueryCache();
      const db = this.db;
      if (!db) {
        throw new Error('Database not initialized! Call DatabaseManager.getInstance().initialize() first.');
      }
      db.run(sql, params);
      this.markDirty();
      this.forwardMutation('run', sql, params);
      // Debounce writes outside transactions so sequential queries don't export full snapshots repeatedly
      if (this.transactionDepth === 0) {
        this.scheduleDebouncedSave();
      }
    });
  }

  private markDirty(): void {
    this.dirtySinceLastSave = true;
    this.mutationSeq++;
  }

  /**
   * Disables all snapshot persistence. Used inside the database Web Worker,
   * which keeps a replica solely for off-thread queries — the renderer's
   * DatabaseManager is the single writer of database snapshots.
   */
  public suppressPersistence(): void {
    this.persistenceSuppressed = true;
    if (this.debounceSaveTimer) {
      clearTimeout(this.debounceSaveTimer);
      this.debounceSaveTimer = null;
    }
    this.cancelIdleSave();
  }

  /** Monotonic counter bumped on every mutation; used to detect main↔worker drift. */
  public getMutationSeq(): number {
    return this.mutationSeq;
  }

  /**
   * Installs the callback that mirrors mutations to the database Web Worker.
   * Installed once by databaseAsyncService; safe to call with null to detach.
   */
  public setMutationForwarder(
    forwarder: ((kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]) => void) | null,
  ): void {
    this.mutationForwarder = forwarder;
  }

  private forwardMutation(kind: 'run' | 'exec' | 'reset', sql: string, params: unknown[]): void {
    try {
      this.mutationForwarder?.(kind, sql, params);
    } catch {
      // Forwarding must never break a write that already succeeded locally.
    }
  }

  /**
   * The whole database was replaced (import/restore). Individual statement
   * forwarding cannot express this — the worker must resync from a snapshot.
   */
  private notifyDatabaseReplaced(): void {
    this.forwardMutation('reset', '', []);
  }

  private trackQuery<T>(sql: string, operation: () => T): T {
    const startedAt = performance.now();
    this.totalQueries++;
    try {
      return operation();
    } catch (error) {
      this.failedQueries++;
      throw error;
    } finally {
      const durationMs = Math.max(0, performance.now() - startedAt);
      if (durationMs >= this.slowQueryThresholdMs) {
        this.slowQueryCount++;
        this.slowestQueryMs = Math.max(this.slowestQueryMs, durationMs);
        const statement = sql
          .replace(/'(?:''|[^'])*'/g, '?')
          .replace(/\b\d+\b/g, '?')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        this.recentSlowQueries.push({
          timestamp: new Date().toISOString(),
          durationMs: Math.round(durationMs * 100) / 100,
          statement,
        });
        const slowQueryHistoryLimit = LEGACY_X86_BUILD ? 10 : 50;
        if (this.recentSlowQueries.length > slowQueryHistoryLimit) this.recentSlowQueries.shift();
      }
    }
  }

  public getQueryStats(): {
    totalQueries: number;
    failedQueries: number;
    slowQueryCount: number;
    slowestQueryMs: number;
  } {
    return {
      totalQueries: this.totalQueries,
      failedQueries: this.failedQueries,
      slowQueryCount: this.slowQueryCount,
      slowestQueryMs: this.slowestQueryMs,
    };
  }

  public getSlowQueryStats(): {
    thresholdMs: number;
    count: number;
    slowestQueryMs: number;
    recent: Array<{ timestamp: string; durationMs: number; statement: string }>;
  } {
    return {
      thresholdMs: this.slowQueryThresholdMs,
      count: this.slowQueryCount,
      slowestQueryMs: this.slowestQueryMs,
      recent: this.recentSlowQueries.map((query) => ({ ...query })),
    };
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
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
    const totalItems = Number(this.query<any>(countSql, countParams)[0]?.totalItems ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const items = this.query<T>(`${dataSql} LIMIT ? OFFSET ?`, [...params, safePageSize, (safePage - 1) * safePageSize]);
    return { items, page: safePage, pageSize: safePageSize, totalItems, totalPages };
  }

  private createQueryCacheKey(sql: string, params: unknown[]): string | null {
    if (
      this.transactionDepth > 0
      || !/^\s*SELECT\b/i.test(sql)
      || /\b(random|randomblob|changes|last_insert_rowid|current_time|current_date|current_timestamp)\b/i.test(sql)
      || /\b(date|datetime|julianday|unixepoch|strftime)\s*\([^)]*['"]now['"]/i.test(sql)
      || !params.every((value) =>
        value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
      )
    ) {
      return null;
    }

    try {
      return JSON.stringify([sql, params]);
    } catch {
      return null;
    }
  }

  private getCachedQuery<T>(key: string): T | undefined {
    const entry = this.queryCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) {
        this.queryCache.delete(key);
        this.queryCacheSizeBytes -= entry.sizeBytes;
      }
      this.queryCacheMisses++;
      return undefined;
    }

    this.queryCacheHits++;
    this.queryCache.delete(key);
    this.queryCache.set(key, entry);
    return this.cloneCachedValue(entry.value) as T;
  }

  private setCachedQuery(key: string, value: unknown): void {
    if (!this.isCacheSafeValue(value)) return;
    let sizeBytes: number;
    try {
      sizeBytes = JSON.stringify(value).length * 2;
    } catch {
      return;
    }
    if (sizeBytes > this.queryCacheMaxEntryBytes) return;

    const previous = this.queryCache.get(key);
    if (previous) this.queryCacheSizeBytes -= previous.sizeBytes;
    this.queryCache.delete(key);
    this.queryCache.set(key, {
      expiresAt: Date.now() + this.queryCacheTtlMs,
      sizeBytes,
      value: this.cloneCachedValue(value),
    });
    this.queryCacheSizeBytes += sizeBytes;
    this.expireQueryCache();
  }

  private cloneCachedValue<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch {
        // Fall back to JSON serialization if object contains non-cloneable items
      }
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isCacheSafeValue(value: unknown): boolean {
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
    ) return true;
    if (Array.isArray(value)) return value.every((item) => this.isCacheSafeValue(item));
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Object.values(value).every((item) => this.isCacheSafeValue(item));
  }

  private expireQueryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.queryCache) {
      if (entry.expiresAt <= now) {
        this.queryCache.delete(key);
        this.queryCacheSizeBytes -= entry.sizeBytes;
      }
    }

    while (
      this.queryCache.size > this.queryCacheMaxEntries
      || this.queryCacheSizeBytes > this.queryCacheMaxSizeBytes
    ) {
      const oldest = this.queryCache.entries().next();
      if (oldest.done) break;
      this.queryCache.delete(oldest.value[0]);
      this.queryCacheSizeBytes -= oldest.value[1].sizeBytes;
    }
  }

  private isMutatingSql(sql: string): boolean {
    if (/\b(insert|update|delete|replace|create|drop|alter|vacuum|reindex|attach|detach)\b/i.test(sql)) {
      return true;
    }
    return !/^\s*(select|explain|pragma|begin|commit|savepoint|release|rollback)\b/i.test(sql);
  }

  private clearQueryCache(): void {
    this.queryCache.clear();
    this.queryCacheSizeBytes = 0;
  }

  public getQueryCacheStats(): {
    entries: number;
    sizeBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    this.expireQueryCache();
    const requests = this.queryCacheHits + this.queryCacheMisses;
    return {
      entries: this.queryCache.size,
      sizeBytes: this.queryCacheSizeBytes,
      hits: this.queryCacheHits,
      misses: this.queryCacheMisses,
      hitRate: requests > 0 ? (this.queryCacheHits / requests) * 100 : 0,
    };
  }

  public exportDatabaseBinary(): Uint8Array {
    return this.exportSnapshot();
  }

  public readImportTablesBinary(bytes: Uint8Array): Array<{
    name: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  }> {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    let candidate: Database | undefined;
    try {
      const importedDatabase = new this.SQL.Database(bytes) as Database;
      candidate = importedDatabase;
      const integrity = importedDatabase.exec('PRAGMA integrity_check')[0]?.values[0]?.[0];
      if (integrity !== 'ok') throw new Error('ملف النسخة الاحتياطية تالف أو غير مكتمل.');

      const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
      const availableTables = new Set(
        (importedDatabase.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0]?.values || [])
          .map((row: unknown[]) => String(row[0]))
      );
      if (!requiredTables.every((table) => availableTables.has(table))) {
        throw new Error('الملف لا يحتوي على نسخة احتياطية صالحة للنظام.');
      }

      let totalRows = 0;
      let totalCells = 0;
      const sheets: Array<{
        name: string;
        columns: string[];
        rows: Array<Record<string, unknown>>;
      }> = [...availableTables]
        .filter((name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        .sort()
        .map((name: string) => {
          const columns = (importedDatabase.exec(`PRAGMA table_info("${name}")`)[0]?.values || [])
            .map((column: unknown[]) => String(column[1]));
          const statement = importedDatabase.prepare(`SELECT * FROM "${name}"`);
          const rows: Array<Record<string, unknown>> = [];
          try {
            while (statement.step()) {
              const row = statement.getAsObject() as Record<string, unknown>;
              rows.push(row);
              totalRows++;
              totalCells += columns.length;
              if (totalRows > 1_000_000 || totalCells > 5_000_000) {
                throw new Error('حجم بيانات النسخة يتجاوز الحد المسموح للدمج.');
              }
            }
          } finally {
            statement.free();
          }
          return { name, columns, rows };
        });
      return sheets;
    } finally {
      candidate?.close();
    }
  }

  private exportSnapshot(): Uint8Array {
    const db = this.getDatabase();
    const snapshot = db.export();
    db.run('PRAGMA foreign_keys = ON');
    const foreignKeysEnabled = Number(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0]) === 1;
    if (!foreignKeysEnabled) {
      throw new Error('SQLite foreign key enforcement could not be restored after database export.');
    }
    return snapshot;
  }

  public async importDatabaseBinary(bytes: Uint8Array): Promise<void> {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    const { runMigrations } = await import('../migrations');
    this.clearQueryCache();
    let imported: Database | undefined;
    try {
      const candidate = new this.SQL.Database(bytes);
      imported = candidate;
      const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
      const tables = candidate.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = new Set((tables[0]?.values || []).map((row: unknown[]) => String(row[0])));
      if (!requiredTables.every((name) => names.has(name))) {
        throw new Error('الملف لا يحتوي على نسخة احتياطية صالحة للنظام.');
      }
      const integrity = candidate.exec('PRAGMA integrity_check');
      if (integrity[0]?.values[0]?.[0] !== 'ok') {
        throw new Error('Backup database failed SQLite integrity_check.');
      }
      // Migrate and validate the candidate in isolation so failed restores
      // cannot replace the database currently used by this session.
      const migrationReport = runMigrations(candidate);
      if (migrationReport.failed.length > 0) {
        throw new Error(`Database migration failed (${migrationReport.failed[0].id}): ${migrationReport.failed[0].error}`);
      }
      const migratedIntegrity = candidate.exec('PRAGMA integrity_check');
      if (migratedIntegrity[0]?.values[0]?.[0] !== 'ok') {
        throw new Error('Restored database failed SQLite integrity_check after migrations.');
      }
      const foreignKeyErrors = candidate.exec('PRAGMA foreign_key_check');
      if (foreignKeyErrors[0]?.values.length) {
        throw new Error('Restored database contains foreign key violations.');
      }
    } catch (error) {
      imported?.close();
      throw new Error(`تعذر استعادة النسخة الاحتياطية: ${error instanceof Error ? error.message : 'ملف غير صالح'}`);
    }

    if (typeof imported === 'undefined') throw new Error('Backup database was not initialized.');
    this.db = imported;
    this.databaseFacade = null;
    this.databaseFacadeTarget = null;
    this.clearQueryCache();
    this.markDirty();
    this.notifyDatabaseReplaced();
    this.saveToStorage();
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
    if (!this.SQL) throw new Error('SQL engine not loaded');
    try {
      const candidate = new this.SQL.Database(bytes);
      const integrity = String(candidate.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] || 'unknown');
      if (integrity !== 'ok') {
        candidate.close();
        return {
          valid: false,
          integrity,
          productsCount: 0,
          invoicesCount: 0,
          customersCount: 0,
          journalEntriesCount: 0,
          error: 'فشل فحص سلامة الملف SQLite integrity_check',
        };
      }
      const count = (tbl: string) => {
        try {
          return Number(candidate.exec(`SELECT COUNT(*) FROM ${tbl}`)[0]?.values[0]?.[0] || 0);
        } catch {
          return 0;
        }
      };
      const productsCount = count('products');
      const invoicesCount = count('sales_invoices');
      const customersCount = count('customers');
      const journalEntriesCount = count('journal_entries');
      candidate.close();
      return { valid: true, integrity, productsCount, invoicesCount, customersCount, journalEntriesCount };
    } catch (err) {
      return {
        valid: false,
        integrity: 'failed',
        productsCount: 0,
        invoicesCount: 0,
        customersCount: 0,
        journalEntriesCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
