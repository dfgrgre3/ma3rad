import type { Database } from 'sql.js';
import { runMigrations, DEFAULT_BRANCH_ID } from './migrations';
import bcrypt from 'bcryptjs';

const DB_STORAGE_KEY = 'ceramics_erp_sqlite_db';

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

    // Check if database exists in localStorage (persistent offline desktop storage)
    const savedDbBase64 = localStorage.getItem(DB_STORAGE_KEY);
    let isFreshDatabase = true;

    if (savedDbBase64) {
      try {
        const binaryString = atob(savedDbBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        this.db = new this.SQL.Database(bytes);
        isFreshDatabase = false;
        console.log('✅ Loaded existing SQLite database from local storage.');
      } catch (e) {
        console.error('Failed to load saved database, initializing fresh schema', e);
        this.db = new this.SQL.Database();
      }
    } else {
      console.log('Creating fresh SQLite database and running migrations...');
      this.db = new this.SQL.Database();
    }

    // Bring the database up to the current schema. This runs on BOTH paths:
    // a saved database is loaded as an opaque blob, so tables and columns added
    // since it was created only ever arrive through here.
    const report = runMigrations(this.getDatabase());
    if (report.failed.length > 0) {
      console.error('⚠️ Some migrations did not apply; they will be retried on next launch.', report.failed);
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
    try {
      const data = this.db.export();
      let binary = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const base64 = btoa(binary);
      localStorage.setItem(DB_STORAGE_KEY, base64);
    } catch (e) {
      console.error('Failed to save SQLite database snapshot to localStorage', e);
    }
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
    const db = this.getDatabase();
    return db.export();
  }

  public importDatabaseBinary(bytes: Uint8Array): void {
    if (!this.SQL) throw new Error('SQL engine not loaded');
    let imported: Database;
    try {
      imported = new this.SQL.Database(bytes);
      const requiredTables = ['users', 'products', 'system_settings', 'sales_invoices'];
      const tables = imported.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = new Set((tables[0]?.values || []).map((row: unknown[]) => String(row[0])));
      if (!requiredTables.every((name) => names.has(name))) {
        throw new Error('الملف لا يحتوي على نسخة احتياطية صالحة للنظام.');
      }
    } catch (error) {
      throw new Error(`تعذر استعادة النسخة الاحتياطية: ${error instanceof Error ? error.message : 'ملف غير صالح'}`);
    }

    this.db = imported;
    // A backup can be older than the running build, so bring it up to the
    // current schema before anything queries it.
    runMigrations(this.db);
    this.saveToStorage();
  }
}
