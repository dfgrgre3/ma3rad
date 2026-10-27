import type { Database } from 'sql.js';
import { runMigrations, DEFAULT_BRANCH_ID } from './migrations';
import bcrypt from 'bcryptjs';
import { AppError, toAppError } from '../errors/appError';

const DB_STORAGE_KEY = 'ceramics_erp_sqlite_db';
type DatabaseFileApi = NonNullable<NonNullable<Window['ceramisys']>['db']>;

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
  private pendingSnapshot: Uint8Array | null = null;
  private isPersisting = false;
  private lastPersistError: string | null = null;
  private lastPersistErrorCode: string | null = null;
  private initializedSuccessfully = false;
  private initializationPromise: Promise<Database> | null = null;
  private storageBackend: 'file' | 'localStorage' | 'none' = 'none';
  private migratedLegacyStorage = false;
  private forceFreshAfterRecovery = false;
  private debounceSaveTimer: any = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public initialize(): Promise<Database> {
    if (this.db && this.initializedSuccessfully) return this.db;
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
    if (this.db) {
      this.db?.close();
      this.db = null;
    }

    await this.initializeSqlEngine();

    const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    const { savedBytes, loadedFromFile } = await this.loadSavedBytes(fileApi);
    const isFreshDatabase = await this.openDatabase(savedBytes);
    this.selectStorageBackend(fileApi);
    await this.backupBeforeGrossProfitMigration(savedBytes, loadedFromFile, isFreshDatabase, fileApi);

    this.ensureLegacySalesInvoiceStatusColumns();
    const report = runMigrations(this.getDatabase());
    await this.handleMigrationFailures(report, isFreshDatabase, fileApi);

    await this.persistInitializedDatabase(isFreshDatabase);
    this.forceFreshAfterRecovery = false;
    this.initializedSuccessfully = true;
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
    let initSqlJsFn: any;
    let wasmUrl: string | undefined;

    const injected = (globalThis as any)?.initSqlJs;
    if (typeof injected === 'function') {
      // Harness-injected initializer (also lets hosts override sql.js).
      return { initSqlJsFn: injected, wasmUrl };
    }

    const candidate = this.unwrapSqlJsInitializer(await this.loadSqlJsModule());
    try {
      // @ts-ignore - Vite resolves this wasm asset URL at build time.
      wasmUrl = (await import('sql.js/dist/sql-wasm-browser.wasm?url')).default;
    } catch {
      wasmUrl = undefined;
    }

    return { initSqlJsFn: candidate, wasmUrl };
  }

  private async loadSqlJsModule(): Promise<any> {
    try {
      // @ts-ignore - sql.js does not declare its distributable entry points.
      return await import('sql.js/dist/sql-wasm-browser.js');
    } catch {
      // Fallback for runtimes whose ESM bundler cannot import the browser distribution.
      try {
        const { createRequire } = await import('node:module');
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

    if (!this.forceFreshAfterRecovery && savedBytes === null && typeof localStorage !== 'undefined') {
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
        this.db = loadedDb;
        console.log(`✅ Loaded existing SQLite database (${this.storageBackend === 'file' ? 'file' : 'legacy storage'}).`);
      } catch (e) {
        throw await this.databaseRecoveryError(e);
      }
      return false;
    } else {
      console.log('Creating fresh SQLite database and running migrations...');
      this.db = new this.SQL.Database();
      return true;
    }
  }

  private selectStorageBackend(fileApi: DatabaseFileApi | undefined): void {
    if (!this.storageBackend || this.storageBackend === 'none') {
      this.storageBackend = fileApi?.save ? 'file' : (typeof localStorage !== 'undefined' ? 'localStorage' : 'none');
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
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem(
            `${DB_STORAGE_KEY}_before_gross_profit_${Date.now()}`,
            bytesToBase64(savedBytes)
          );
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
    report: ReturnType<typeof runMigrations>,
    isFreshDatabase: boolean,
    fileApi: DatabaseFileApi | undefined
  ): Promise<void> {
    if (report.failed.length > 0) {
      console.error('⚠️ Some migrations did not apply; they will be retried on next launch.', report.failed);
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

  private async persistInitializedDatabase(isFreshDatabase: boolean): Promise<void> {
    // Seed reference data only for a genuinely new database — migrations already
    // hold everything an existing database needs.
    if (isFreshDatabase) {
      this.seedInitialData();
    }

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

  private ensureLegacySalesInvoiceStatusColumns(): void {
    if (!this.db) return;
    const salesInvoices = this.db.exec('SELECT name FROM sqlite_master WHERE type = "table" AND name = "sales_invoices"');
    if ((salesInvoices[0]?.values?.length ?? 0) === 0) return;

    const columns = new Set(
      (this.db.exec('PRAGMA table_info(sales_invoices)')[0]?.values ?? []).map((row) => String(row[1]))
    );

    if (!columns.has('payment_status')) {
      this.db.run("ALTER TABLE sales_invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'PAID'");
    }
    if (!columns.has('invoice_status')) {
      this.db.run("ALTER TABLE sales_invoices ADD COLUMN invoice_status TEXT NOT NULL DEFAULT 'COMPLETED'");
    }

    this.db.run(`UPDATE sales_invoices SET payment_status = 'PAID' WHERE payment_status IS NULL`);
    this.db.run(`UPDATE sales_invoices SET invoice_status = 'COMPLETED' WHERE invoice_status IS NULL`);
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
    // SECURITY: Default password should be changed immediately after first login
    // Consider using environment variable or prompting user on first run
    const DEFAULT_ADMIN_PASSWORD = 'admin123';
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, salt);

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

  public scheduleDebouncedSave(delayMs = 150): void {
    if (this.transactionDepth > 0) return;
    if (this.debounceSaveTimer) clearTimeout(this.debounceSaveTimer);
    this.debounceSaveTimer = setTimeout(() => {
      this.debounceSaveTimer = null;
      this.saveToStorage();
    }, delayMs);
  }

  public saveToStorage(): void {
    if (!this.db) return;
    if (this.debounceSaveTimer) {
      clearTimeout(this.debounceSaveTimer);
      this.debounceSaveTimer = null;
    }
    let snapshot: Uint8Array;
    try {
      snapshot = this.exportSnapshot();
    } catch (e) {
      const failure = toAppError(e, 'DATABASE_SNAPSHOT_FAILED', 'تعذر إنشاء لقطة لقاعدة البيانات.');
      this.lastPersistError = persistenceErrorMessage(e, failure.code);
      this.lastPersistErrorCode = failure.code;
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
    this.pendingSnapshot = snapshot;
    if (this.isPersisting) return;
    this.isPersisting = true;
    this.persistQueue = this.persistQueue
      .then(async () => {
        while (this.pendingSnapshot) {
          const nextSnapshot = this.pendingSnapshot;
          this.pendingSnapshot = null;
          await this.persistSnapshot(nextSnapshot);
        }
      })
      .finally(() => {
        this.isPersisting = false;
        if (this.pendingSnapshot) this.persist(this.pendingSnapshot);
      });
  }

  private async persistSnapshot(snapshot: Uint8Array): Promise<void> {
    try {
      if (await this.persistToFile(snapshot)) return;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DB_STORAGE_KEY, bytesToBase64(snapshot));
        this.storageBackend = 'localStorage';
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
    }
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
    if (this.migratedLegacyStorage && typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(DB_STORAGE_KEY); } catch { /* ignore */ }
      this.migratedLegacyStorage = false;
    }
    return true;
  }

  /** Wait for all pending disk writes (used before shutdown/backup/restore). */
  public async flush(): Promise<void> {
    if (this.debounceSaveTimer) {
      clearTimeout(this.debounceSaveTimer);
      this.debounceSaveTimer = null;
      this.saveToStorage();
    }
    do {
      await this.persistQueue;
    } while (this.isPersisting || this.pendingSnapshot);
    if (this.lastPersistError) {
      throw new AppError(`تعذر حفظ تغييرات قاعدة البيانات: ${this.lastPersistError}`, 'DATABASE_PERSIST_FAILED', true, {
        cause: new AppError(this.lastPersistError, this.lastPersistErrorCode || 'DATABASE_SAVE_FAILED', true),
      });
    }
  }

  public getStorageBackend(): 'file' | 'localStorage' | 'none' {
    return this.storageBackend;
  }

  public getLastPersistError(): string | null {
    return this.lastPersistError;
  }

  public getPersistenceStatus(): { status: 'saving' | 'saved' | 'error' | 'unencrypted' | 'unavailable'; error?: string; code?: string } {
    if (this.lastPersistError) return { status: 'error', error: this.lastPersistError, code: this.lastPersistErrorCode || 'DATABASE_PERSIST_FAILED' };
    if (this.storageBackend === 'none') return { status: 'unavailable' };
    if (this.debounceSaveTimer || this.isPersisting || this.pendingSnapshot) return { status: 'saving' };
    if (this.storageBackend === 'localStorage') return { status: 'unencrypted' };
    return { status: 'saved' };
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
    const depth = this.transactionDepth;
    const isOuterTransaction = depth === 0;
    const savepoint = `db_nested_${depth}`;
    if (isOuterTransaction) db.exec('BEGIN TRANSACTION;');
    else db.exec(`SAVEPOINT ${savepoint};`);
    this.transactionDepth++;
    let depthReleased = false;
    try {
      const result = callback(this);
      this.transactionDepth--;
      depthReleased = true;
      if (isOuterTransaction) {
        db.exec('COMMIT;');
        this.saveToStorage();
      } else {
        db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      }
      return result;
    } catch (error) {
      if (!depthReleased) this.transactionDepth--;
      this.rollbackTransaction(db, isOuterTransaction, savepoint);
      console.error('Transaction rolled back due to error:', error);
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

  public query<T = any>(sql: string, params: any[] = []): T[] {
    const db = this.getDatabase();
    const stmt = db.prepare(sql);
    const results: T[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(snakeToCamelKeys(stmt.getAsObject()) as unknown as T);
      }
    } finally {
      stmt.free();
    }
    return results;
  }

  public run(sql: string, params: any[] = []): void {
    this.pageCache.clear();
    const db = this.getDatabase();
    db.run(sql, params);
    // Debounce writes outside transactions so sequential queries don't export full snapshots repeatedly
    if (this.transactionDepth === 0) {
      this.scheduleDebouncedSave();
    }
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
