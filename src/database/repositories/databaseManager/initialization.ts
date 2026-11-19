import type { Database } from 'sql.js';
import type { MigrationReport } from '../../migrations';
import { DEFAULT_BRANCH_ID } from '../../migrations/settings';
import type { DatabaseManager } from '../databaseManager';
import { DB_STORAGE_KEY } from './constants';
import type { DatabaseFileApi } from './constants';
import { applyPerformancePragmas, initializeSqlEngine } from './engine';
import type { DatabaseManagerInternals } from './internals';
import { markDirty } from './mutationSync';
import { clearQueryCache } from './queries';
import { readBrowserSnapshot, writeBrowserSnapshot } from './storage';
import { base64ToBytes, toUint8Array } from './utils';

/**
 * Database initialization: sql.js engine + snapshot loading, opening the
 * database, pre-migration backup, migration run/failure handling, initial
 * persistence, legacy column fixes, schema signature, seeding and the
 * desktop-only "create fresh after recovery" flow.
 * Extracted from databaseManager.ts; behaviour is identical.
 */

export async function initializeDatabase(host: DatabaseManager): Promise<Database> {
  const h = host as unknown as DatabaseManagerInternals;
  const initializationStartedAt = performance.now();
  clearQueryCache(host);
  if (h.db) {
    h.db?.close();
    h.db = null;
  }

  const fileApi = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
  const sqlEngineStartedAt = performance.now();
  const snapshotLoadStartedAt = performance.now();
  const [, loadedDatabase] = await Promise.all([
    initializeSqlEngine(host).then(() => {
      console.info('[performance] SQL.js engine initialized', JSON.stringify({
        durationMs: Math.round((performance.now() - sqlEngineStartedAt) * 100) / 100,
      }));
    }),
    loadSavedBytes(host, fileApi).then((result) => {
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
  const isFreshDatabase = await openDatabase(host, savedBytes);
  console.info('[performance] SQLite database opened', JSON.stringify({
    durationMs: Math.round((performance.now() - databaseOpenStartedAt) * 100) / 100,
    isFreshDatabase,
  }));
  selectStorageBackend(host, fileApi);
  await backupBeforeGrossProfitMigration(host, savedBytes, loadedFromFile, isFreshDatabase, fileApi);
  // sql.js has copied the database into WASM memory; don't retain the raw
  // IPC snapshot while migrations and later exports allocate more memory.
  savedBytes = null;

  // When the schema bundle fingerprint already matches, runMigrations takes
  // its steady-state fast path and cannot change sqlite_master, so both
  // full-schema signature serializations are pure overhead — skip them.
  const { runMigrations, isSchemaBundleCurrent } = await import('../../migrations');
  const schemaBundleCurrent = isSchemaBundleCurrent(host.getDatabase());
  const schemaBeforeMigrations = schemaBundleCurrent ? '' : getSchemaSignature(host);
  const legacyDataChanged = ensureLegacySalesInvoiceStatusColumns(host);
  const migrationStartedAt = performance.now();
  const report = runMigrations(host.getDatabase());
  console.info('[performance] Database migrations completed', JSON.stringify({
    durationMs: Math.round((performance.now() - migrationStartedAt) * 100) / 100,
    applied: report.applied.length,
    failed: report.failed.length,
  }));
  await handleMigrationFailures(host, report, isFreshDatabase, fileApi);

  const databaseChanged = isFreshDatabase
    || legacyDataChanged
    || report.applied.length > 0
    || (!schemaBundleCurrent && schemaBeforeMigrations !== getSchemaSignature(host));
  const persistenceStartedAt = performance.now();
  await persistInitializedDatabase(host, isFreshDatabase, databaseChanged);
  console.info('[performance] Initial database persistence completed', JSON.stringify({
    durationMs: Math.round((performance.now() - persistenceStartedAt) * 100) / 100,
    databaseChanged,
  }));
  // Worker sync during flush can replay connection pragmas onto this
  // connection; foreign-key enforcement is a hard requirement, so re-assert it.
  host.getDatabase().run('PRAGMA foreign_keys = ON');
  h.forceFreshAfterRecovery = false;
  h.initializedSuccessfully = true;
  console.info('[performance] Database initialization completed', JSON.stringify({
    durationMs: Math.round((performance.now() - initializationStartedAt) * 100) / 100,
    databaseChanged,
  }));
  return host.getDatabase();
}

async function loadSavedBytes(
  host: DatabaseManager,
  fileApi: DatabaseFileApi | undefined
): Promise<{ savedBytes: Uint8Array | null; loadedFromFile: boolean }> {
  const h = host as unknown as DatabaseManagerInternals;
  let savedBytes: Uint8Array | null = null;
  let loadedFromFile = false;
  if (fileApi?.load) {
    let loaded: Uint8Array | null;
    try {
      loaded = await fileApi.load();
    } catch (error) {
      throw await databaseRecoveryError(error);
    }
    if (loaded !== null) {
      savedBytes = toUint8Array(loaded);
      if (!savedBytes) throw new Error('تعذر قراءة ملف قاعدة البيانات بسبب صيغة بيانات غير صالحة.');
      loadedFromFile = true;
      h.storageBackend = 'file';
    }
  }

  if (!h.forceFreshAfterRecovery && savedBytes === null && typeof indexedDB !== 'undefined') {
    try {
      savedBytes = await readBrowserSnapshot();
      if (savedBytes) h.storageBackend = 'indexedDB';
      else if (typeof localStorage !== 'undefined') {
        const legacy = localStorage.getItem(DB_STORAGE_KEY);
        if (legacy) {
          savedBytes = base64ToBytes(legacy);
          h.migratedLegacyStorage = true;
        }
      }
    } catch (error) {
      throw await databaseRecoveryError(error);
    }
  }

  if (!h.forceFreshAfterRecovery && savedBytes === null && typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem(DB_STORAGE_KEY);
    if (legacy) {
      try {
        savedBytes = base64ToBytes(legacy);
        h.migratedLegacyStorage = true;
        console.log('[database] Found legacy database snapshot; migrating it to a file.');
      } catch (e) {
        console.error('Failed to decode legacy database snapshot', e);
      }
    }
  }

  return { savedBytes, loadedFromFile };
}

async function openDatabase(host: DatabaseManager, savedBytes: Uint8Array | null): Promise<boolean> {
  const h = host as unknown as DatabaseManagerInternals;
  if (savedBytes !== null) {
    if (savedBytes.length === 0) {
      throw await databaseRecoveryError(new Error('ملف قاعدة البيانات فارغ.'));
    }
    try {
      const loadedDb = new h.SQL.Database(savedBytes);
      // Verify file is a valid readable SQLite database immediately
      loadedDb.exec("SELECT 1 FROM sqlite_master LIMIT 1");
      applyPerformancePragmas(loadedDb);
      h.db = loadedDb;
      console.log(`[database] Loaded existing SQLite database (${h.storageBackend === 'file' ? 'file' : 'legacy storage'}).`);
    } catch (e) {
      throw await databaseRecoveryError(e);
    }
    return false;
  } else {
    console.log('Creating fresh SQLite database and running migrations...');
    const freshDb = new h.SQL.Database();
    applyPerformancePragmas(freshDb);
    h.db = freshDb;
    return true;
  }
}

function selectStorageBackend(host: DatabaseManager, fileApi: DatabaseFileApi | undefined): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.storageBackend || h.storageBackend === 'none') {
    h.storageBackend = fileApi?.save ? 'file' : (typeof indexedDB !== 'undefined' ? 'indexedDB' : (typeof localStorage !== 'undefined' ? 'localStorage' : 'none'));
  }
}

async function backupBeforeGrossProfitMigration(
  host: DatabaseManager,
  savedBytes: Uint8Array | null,
  loadedFromFile: boolean,
  isFreshDatabase: boolean,
  fileApi: DatabaseFileApi | undefined
): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  // Bring the database up to the current schema. This runs on BOTH paths:
  // a saved database is loaded as an opaque blob, so tables and columns added
  // since it was created only ever arrive through here.
  if (!isFreshDatabase && !isMigrationApplied(host, '045_reconcile_invoice_gross_profit')) {
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
      h.db?.close();
      h.db = null;
      throw new Error(`توقف الترحيل المالي قبل تعديل البيانات لعدم إنشاء نسخة احتياطية: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function handleMigrationFailures(
  host: DatabaseManager,
  report: MigrationReport,
  isFreshDatabase: boolean,
  fileApi: DatabaseFileApi | undefined
): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
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
    h.db?.close();
    h.db = null;
    throw new Error(`Database migration failed (${report.failed[0].id}): ${report.failed[0].error}.${backupMessage}`);
  }
}

async function persistInitializedDatabase(host: DatabaseManager, isFreshDatabase: boolean, databaseChanged: boolean): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  // Seed reference data only for a genuinely new database — migrations already
  // hold everything an existing database needs.
  if (isFreshDatabase) {
    seedInitialData(host);
  }
  if (!databaseChanged) return;
  markDirty(host);
  host.saveToStorage();
  await host.flush();
  if (h.lastPersistError) {
    h.db?.close();
    h.db = null;
    throw new Error(`تعذر حفظ قاعدة البيانات على وسيط التخزين. لم يبدأ النظام لتجنب العمل على بيانات غير محفوظة. ${h.lastPersistError}`);
  }
}

async function databaseRecoveryError(cause: unknown): Promise<Error & { code: string }> {
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

function isMigrationApplied(host: DatabaseManager, id: string): boolean {
  const h = host as unknown as DatabaseManagerInternals;
  const migrationTable = h.db?.exec(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`
  )[0]?.values.length;
  if (!migrationTable) return false;
  return Boolean(h.db?.exec(
    'SELECT 1 FROM schema_migrations WHERE id = ?',
    [id]
  )[0]?.values.length);
}

function ensureLegacySalesInvoiceStatusColumns(host: DatabaseManager): boolean {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.db) return false;
  const salesInvoices = h.db.exec('SELECT name FROM sqlite_master WHERE type = "table" AND name = "sales_invoices"');
  if ((salesInvoices[0]?.values?.length ?? 0) === 0) return false;

  const columnInfo = new Map<string, { notNull: boolean }>(
    (h.db.exec('PRAGMA table_info(sales_invoices)')[0]?.values ?? [])
      .map((row: unknown[]) => [String(row[1]), { notNull: Number(row[3]) === 1 }])
  );
  let changed = false;

  if (!columnInfo.has('payment_status')) {
    h.db.run("ALTER TABLE sales_invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'PAID'");
    columnInfo.set('payment_status', { notNull: true });
    changed = true;
  }
  if (!columnInfo.has('invoice_status')) {
    h.db.run("ALTER TABLE sales_invoices ADD COLUMN invoice_status TEXT NOT NULL DEFAULT 'COMPLETED'");
    columnInfo.set('invoice_status', { notNull: true });
    changed = true;
  }

  const paymentStatusInfo = columnInfo.get('payment_status');
  if (paymentStatusInfo && !paymentStatusInfo.notNull) {
    h.db.run(`UPDATE sales_invoices SET payment_status = 'PAID' WHERE payment_status IS NULL`);
    changed = changed || h.db.getRowsModified() > 0;
  }
  const invoiceStatusInfo = columnInfo.get('invoice_status');
  if (invoiceStatusInfo && !invoiceStatusInfo.notNull) {
    h.db.run(`UPDATE sales_invoices SET invoice_status = 'COMPLETED' WHERE invoice_status IS NULL`);
    changed = changed || h.db.getRowsModified() > 0;
  }
  return changed;
}

function getSchemaSignature(host: DatabaseManager): string {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.db) return '';
  return JSON.stringify(h.db.exec(
    `SELECT type, name, tbl_name, sql FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%'
     ORDER BY type, name`
  )[0]?.values ?? []);
}

export async function createFreshAfterRecovery(host: DatabaseManager): Promise<void> {
  const h = host as unknown as DatabaseManagerInternals;
  const recoveryApi = typeof window !== 'undefined' ? window.ceramisys?.db?.createFreshAfterRecovery : undefined;
  if (!recoveryApi) throw new Error('إنشاء قاعدة جديدة بعد التعذر متاح فقط من تطبيق سطح المكتب.');
  const result = await recoveryApi();
  if (!result?.ok) throw new Error('تعذر أرشفة قاعدة البيانات السابقة قبل إنشاء قاعدة جديدة.');
  h.db = null;
  h.forceFreshAfterRecovery = true;
  h.storageBackend = 'none';
  h.lastPersistError = null;
  h.lastPersistErrorCode = null;
}

function seedInitialData(host: DatabaseManager): void {
  const h = host as unknown as DatabaseManagerInternals;
  if (!h.db) return;
  const db = h.db;

  // Hash admin default password (admin123)
  // Pre-computed hash for 'admin123' to eliminate synchronous bcrypt overhead during initial startup:
  const adminHash = '$2a$10$uURy9H8RJQFCDiqtDkMxWewz1KO8N8Psb6xos3wzxgECbo0Yel0ra';

  // 1. Initial Admin User
  db.run(`
    INSERT INTO users (id, username, password_hash, full_name, role, phone, pin_code, is_active, branch_id, branch_scope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALL')
  `, ['usr_admin', 'admin', adminHash, 'مدير النظام', 'ADMIN', null, null, 1, DEFAULT_BRANCH_ID]);

  // 2. System settings, default branch, roles and price lists are all seeded by
  //    migrations (see DEFAULT_SETTINGS and MIGRATIONS in ./migrations) so that
  //    databases created before a key existed pick it up too.

  // 3. Default Warehouse
  db.run(`
    INSERT INTO warehouses (id, name, code, location, warehouse_type, is_default, is_active, branch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['wh_main', 'المعرض الرئيسي', 'MAIN-01', 'صالة العرض والمخزن الملحق', 'SHOWROOM', 1, 1, DEFAULT_BRANCH_ID]);

  db.run(`
    INSERT INTO warehouses (id, name, code, location, warehouse_type, is_default, is_active, branch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['wh_ext', 'المخزن الخارجي الرئيسي', 'EXT-01', 'المنطقة الصناعية - عنبر 4', 'MAIN_WAREHOUSE', 0, 1, DEFAULT_BRANCH_ID]);

  // 4. Default Cash Register
  db.run(`
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
    db.run(`
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
    db.run(`
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
    db.run(`
      INSERT INTO expense_categories (id, name, description)
      VALUES (?, ?, ?)
    `, [id, name, desc]);
  }
}
