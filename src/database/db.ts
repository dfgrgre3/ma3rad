import type { Database } from 'sql.js';
import { runMigrations, DEFAULT_BRANCH_ID } from './migrations';
import bcrypt from 'bcryptjs';

const DB_STORAGE_KEY = 'ceramics_erp_sqlite_db';

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
    out[snakeToCamel(key)] = row[key];
  }
  return out as T;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;
  private SQL: any = null;
  private transactionDepth = 0;
  private pageCache = new Map<string, { expiresAt: number; value: any }>();
  private readonly pageCacheTtlMs = 15000;
  private persistQueue: Promise<void> = Promise.resolve();
  private lastPersistError: string | null = null;
  private storageBackend: 'file' | 'localStorage' | 'none' = 'none';
  private migratedLegacyStorage = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<Database> {
    if (this.db) return this.db;

    // Resolve the sql.js engine + wasm URL in a runtime-agnostic way:
    //  - Browser / Vite bundler: load the browser distribution. sql.js is a
    //    CommonJS build whose `module.exports` is the init function, with
    //    `module.exports.default` set to itself for interop. The bundler's
    //    CommonJS interop can expose the callable through EITHER the module
    //    or a nested `.default` chain — walk down until we have a function.
    //  - Node (`node --test`): the test harness injects a global `initSqlJs`
    //    that points at the CommonJS build and a real wasm file path.
    let initSqlJsFn: any;
    let wasmUrl: string | undefined;

    const injected = (globalThis as any)?.initSqlJs;
    if (typeof injected === 'function') {
      // Harness-injected initializer (also lets hosts override sql.js).
      initSqlJsFn = injected;
      wasmUrl = undefined;
    } else {
      let candidate: any;
      try {
        // @ts-ignore - sql.js does not declare its distributable entry points.
        candidate = await import('sql.js/dist/sql-wasm-browser.js');
      } catch {
        // Fallback for runtimes whose ESM bundler cannot import the browser
        // distribution (e.g. plain `node --test`). Load it via require.
        try {
          const { createRequire } = await import('node:module');
          const __require = createRequire(import.meta.url);
          candidate = __require('sql.js');
        } catch {
          candidate = undefined;
        }
      }

      // Recursively unwrap `.default` interop wrappers until a callable
      // function is found (or the chain bottoms out) instead of the fragile
      // single-step `mod.default ?? mod`.
      for (let depth = 0; depth < 8; depth++) {
        if (typeof candidate === 'function') break;
        const next = candidate && (candidate as any).default;
        if (next === undefined || next === null || next === candidate) break;
        candidate = next;
      }
      initSqlJsFn = candidate;

      try {
        // @ts-ignore - Vite resolves this wasm asset URL at build time.
        wasmUrl = (await import('sql.js/dist/sql-wasm-browser.wasm?url')).default;
      } catch {
        wasmUrl = undefined;
      }
    }

    if (typeof initSqlJsFn !== 'function') {
      throw new TypeError(
        'sql.js could not be resolved to a callable init function ' +
        `(got: ${typeof initSqlJsFn}). The installed sql.js build may be ` +
        'incompatible with the active runtime.'
      );
    }

    console.log('🔄 Loading SQL.js engine. WASM URL:', wasmUrl);
    try {
      this.SQL = await initSqlJsFn({
        locateFile: (_file: string) => wasmUrl,
      });
      console.log('✅ SQL.js engine ready.');
    } catch (err) {
      console.error('❌ SQL.js failed to load:', err);
      throw err;
    }

    // Prefer the real SQLite file managed by the Electron main process. The
    // previous localStorage snapshot is only used to migrate existing installs.
    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    let savedBytes: Uint8Array | null = null;
    let isFreshDatabase = true;

    if (fileApi?.load) {
      try {
        savedBytes = toUint8Array(await fileApi.load());
        if (savedBytes && savedBytes.length > 0) this.storageBackend = 'file';
      } catch (e) {
        console.error('Failed to load SQLite file, falling back to local storage', e);
      }
    }

    if (!savedBytes && typeof localStorage !== 'undefined') {
      const legacy = localStorage.getItem(DB_STORAGE_KEY);
      if (legacy) {
        try {
          savedBytes = base64ToBytes(legacy);
          this.migratedLegacyStorage = true;
          console.log('✅ Found legacy database snapshot; migrating it to a file.');
        } catch (e) {
          console.error('Failed to decode legacy database snapshot', e);
        }
      }
    }

    if (savedBytes && savedBytes.length > 0) {
      try {
        this.db = new this.SQL.Database(savedBytes);
        isFreshDatabase = false;
        console.log(`✅ Loaded existing SQLite database (${this.storageBackend === 'file' ? 'file' : 'legacy storage'}).`);
      } catch (e) {
        console.error('Failed to load saved database, initializing fresh schema', e);
        this.db = new this.SQL.Database();
      }
    } else {
      console.log('Creating fresh SQLite database and running migrations...');
      this.db = new this.SQL.Database();
    }

    if (!this.storageBackend || this.storageBackend === 'none') {
      this.storageBackend = fileApi?.save ? 'file' : (typeof localStorage !== 'undefined' ? 'localStorage' : 'none');
    }

    // Bring the database up to the current schema. This runs on BOTH paths:
    // a saved database is loaded as an opaque blob, so tables and columns added
    // since it was created only ever arrive through here.
    const report = runMigrations(this.getDatabase());
    if (report.failed.length > 0) {
      console.error('⚠️ Some migrations did not apply; they will be retried on next launch.', report.failed);
      throw new Error(`Database migration failed (${report.failed[0].id}): ${report.failed[0].error}`);
    }

    // Seed reference data only for a genuinely new database — migrations already
    // hold everything an existing database needs.
    if (isFreshDatabase) {
      this.seedInitialData();
    }

    this.saveToStorage();
    return this.getDatabase();
  }

  private seedInitialData(): void {
    if (!this.db) return;

    // Hash admin default password (admin123)
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin123', salt);

    // 1. Initial Admin User
    this.db.run(`
      INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['usr_admin', 'admin', adminHash, 'مدير النظام', 'ADMIN', '01000000000', '1234', 1, DEFAULT_BRANCH_ID]);

    // 2. System settings, default branch, roles and price lists are all seeded by
    //    migrations (see DEFAULT_SETTINGS and MIGRATIONS in ./migrations) so that
    //    databases created before a key existed pick it up too.

    // 3. Default Warehouse
    this.db.run(`
      INSERT INTO warehouses (id, name, code, location, is_default, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['wh_main', 'المعرض الرئيسي', 'MAIN-01', 'صالة العرض والمخزن الملحق', 1, 1, DEFAULT_BRANCH_ID]);

    this.db.run(`
      INSERT INTO warehouses (id, name, code, location, is_default, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['wh_ext', 'المخزن الخارجي الرئيسي', 'EXT-01', 'المنطقة الصناعية - عنبر 4', 0, 1, DEFAULT_BRANCH_ID]);

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

  public saveToStorage(): void {
    if (!this.db) return;
    let snapshot: Uint8Array;
    try {
      snapshot = this.exportSnapshot();
    } catch (e) {
      this.lastPersistError = e instanceof Error ? e.message : String(e);
      console.error('Failed to export SQLite database snapshot', e);
      return;
    }
    this.persist(snapshot);
  }

  /**
   * Serializes writes so a slow disk (or concurrent transaction) can never
   * overwrite a newer snapshot with an older one.
   */
  private persist(snapshot: Uint8Array): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
        if (fileApi?.save) {
          const result = await fileApi.save(snapshot);
          if (!result?.ok) throw new Error(result?.error || 'فشل حفظ قاعدة البيانات على القرص');
          this.storageBackend = 'file';
          this.lastPersistError = null;
          if (this.migratedLegacyStorage && typeof localStorage !== 'undefined') {
            try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
            this.migratedLegacyStorage = false;
          }
          return;
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(DB_STORAGE_KEY, bytesToBase64(snapshot));
          this.storageBackend = 'localStorage';
          this.lastPersistError = null;
          return;
        }
        this.storageBackend = 'none';
      })
      .catch((e) => {
        this.lastPersistError = e instanceof Error ? e.message : String(e);
        console.error('Failed to persist SQLite database', e);
      });
  }

  /** Wait for all pending disk writes (used before shutdown/backup/restore). */
  public async flush(): Promise<void> {
    await this.persistQueue;
  }

  public getStorageBackend(): 'file' | 'localStorage' | 'none' {
    return this.storageBackend;
  }

  public getLastPersistError(): string | null {
    return this.lastPersistError;
  }

  public getDatabase(): Database {
    if (!this.db) {
      throw new Error('Database not initialized! Call DatabaseManager.getInstance().initialize() first.');
    }
    return this.db;
  }

  public getDb(): Database {
    return this.getDatabase();
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
    return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
  }

  public executeTransaction<T>(callback: (db: DatabaseManager) => T): T {
    const db = this.getDatabase();
    const isOuterTransaction = this.transactionDepth === 0;
    if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
    this.transactionDepth++;
    try {
      const result = callback(this);
      this.transactionDepth--;
      if (isOuterTransaction) {
        db.exec('COMMIT;');
        this.saveToStorage();
      }
      return result;
    } catch (error) {
      this.transactionDepth--;
      if (isOuterTransaction) {
        db.exec('ROLLBACK;');
        this.saveToStorage();
      }
      console.error('Transaction rolled back due to error:', error);
      throw error;
    }
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    const db = this.getDatabase();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(snakeToCamelKeys(stmt.getAsObject()) as unknown as T);
    }
    stmt.free();
    return results;
  }

  public run(sql: string, params: any[] = []): void {
    this.pageCache.clear();
    const db = this.getDatabase();
    db.run(sql, params);
    // Do not persist intermediate state that might be rolled back.
    if (this.transactionDepth === 0) this.saveToStorage();
  }

  /** Execute a bounded list query and its count query without loading all rows. */
  public queryPage<T = any>(
    dataSql: string,
    countSql: string,
    params: any[] = [],
    page = 1,
    pageSize = 25,
  ): { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number } {
    const safePageSize = Math.min(Math.max(Math.floor(pageSize) || 25, 1), 100);
    const cacheKey = JSON.stringify([dataSql, countSql, params, page, safePageSize]);
    const cached = this.pageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.pageCache.delete(cacheKey);
    const totalItems = Number(this.query<any>(countSql, params)[0]?.totalItems ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const safePage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const items = this.query<T>(`${dataSql} LIMIT ? OFFSET ?`, [...params, safePageSize, (safePage - 1) * safePageSize]);
    return { items, page: safePage, pageSize: safePageSize, totalItems, totalPages };
  }

  public exportDatabaseBinary(): Uint8Array {
    return this.exportSnapshot();
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

  public importDatabaseBinary(bytes: Uint8Array): void {
    if (!this.SQL) throw new Error('SQL engine not loaded');
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
    this.saveToStorage();
  }
}
