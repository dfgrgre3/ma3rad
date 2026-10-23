import type { Database } from 'sql.js';
import { SCHEMA_SQL } from './schema';

/**
 * Schema migration engine.
 *
 * The database lives as a binary blob in localStorage and is loaded back
 * verbatim, so `SCHEMA_SQL` used to run exactly once — on the very first
 * launch. Every table, index or column added afterwards never reached an
 * existing install, and any query touching it failed with "no such table".
 *
 * `runMigrations()` closes that gap and is safe to call on every startup:
 *
 *   1. Re-executes SCHEMA_SQL. Every statement in it is
 *      `CREATE TABLE/INDEX IF NOT EXISTS`, so this is a no-op for tables that
 *      already exist and creates the ones that don't.
 *   2. Applies the ordered MIGRATIONS list. Anything SCHEMA_SQL cannot express
 *      — `ALTER TABLE … ADD COLUMN`, one-shot backfills, seed rows that
 *      `seedInitialData()` will never re-run — lives here, gated on the
 *      `schema_migrations` ledger so it runs at most once per database.
 *
 * Adding a new table: put it in SCHEMA_SQL, nothing else needed.
 * Adding a column to an existing table: add a migration below. Never edit a
 * migration that has shipped — append a new one.
 */

// ─── Default system settings ──────────────────────────────────────────────────
// Single source of truth, shared by the fresh-database seed and by the
// backfill migration so new keys reach databases created before they existed.
export const DEFAULT_SETTINGS: Record<string, string> = {
  showroomName: 'معرض الأندلس للسيراميك والبورسلين والتشطيبات',
  tagline: 'أكبر تشكيلة سيراميك وبورسلين ومواد تشطيب بأفضل الأسعار',
  phone: '01012345678',
  phone2: '01234567890',
  address: 'شارع المعارض الرئيسي - أمام مجمع البنوك',
  taxNumber: '123-456-789',
  commercialRecord: 'CR-998877',
  currency: 'EGP',
  currencySymbol: 'ج.م',
  defaultTaxPercentage: '0',
  isTaxInclusive: '0',
  enableNegativeStock: '0',
  costingMethod: 'AVERAGE_COST',
  receiptHeader: 'معرض الأندلس للسيراميك والبورسلين\nأهلاً بكم ونتشرف بخدمتكم دائماً',
  receiptFooter: 'البضاعة المباعة ترد خلال 14 يوماً بالحالة الأصلية ومع الفاتورة\nشكراً لزيارتكم',
  autoBackupIntervalHours: '24',

  // Added alongside the branches / approvals / delivery modules.
  defaultBranchId: 'br_main',
  discountApprovalThresholdPercent: '10',
  requireApprovalForStockAdjustments: '1',
  requireApprovalForPriceChanges: '1',
  lowStockAlertThresholdM2: '20',
  defaultDeliveryFee: '0',
  installmentGraceDays: '3',
  sessionTimeoutMinutes: '480',
  maxFailedLoginAttempts: '5',

  // Branding & appearance — controlled from the Admin Control Center.
  brandName: 'CeramiSys ERP',
  brandShortName: 'C',
  brandLogoDataUrl: '',
  brandPrimaryColor: '#0284c7',
  brandAccentColor: '#4f46e5',
  themeMode: 'light',
  fontFamily: 'Cairo',
  showBrandText: '1',
  sidebarStyle: 'default',
};

// Keys added after the original settings backfill. Migration 012 inserts any
// missing key into databases that were created before it existed.
const EXTENDED_SETTINGS_KEYS = [
  'brandName', 'brandShortName', 'brandLogoDataUrl', 'brandPrimaryColor',
  'brandAccentColor', 'themeMode', 'fontFamily', 'showBrandText', 'sidebarStyle',
];

export const DEFAULT_BRANCH_ID = 'br_main';

// ─── SQLite introspection helpers ─────────────────────────────────────────────
function tableExists(db: Database, table: string): boolean {
  const res = db.exec(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  return (res[0]?.values?.length ?? 0) > 0;
}

function columnExists(db: Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false;
  // PRAGMA does not accept bound parameters, and `table` is always a literal
  // from the MIGRATIONS list below — never user input.
  const res = db.exec(`PRAGMA table_info(${table})`);
  const nameIdx = res[0]?.columns?.indexOf('name') ?? -1;
  if (nameIdx < 0) return false;
  return (res[0]?.values ?? []).some((row) => String(row[nameIdx]) === column);
}

/**
 * Adds a column only if the table exists and the column does not.
 * SQLite's ADD COLUMN cannot carry PRIMARY KEY/UNIQUE, and with foreign keys
 * enabled a REFERENCES column must default to NULL — so `definition` should
 * stay a plain nullable column.
 */
function addColumn(db: Database, table: string, column: string, definition: string): boolean {
  if (!tableExists(db, table)) return false;
  if (columnExists(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

// ─── Migrations ───────────────────────────────────────────────────────────────
export interface Migration {
  id: string;
  description: string;
  up: (db: Database) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_seed_default_branch',
    description: 'Create the main branch row so branch_id has something to point at',
    up: (db) => {
      db.run(
        `INSERT OR IGNORE INTO branches (id, code, name, phone, address, is_main, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [
          DEFAULT_BRANCH_ID,
          'BR-01',
          'الفرع الرئيسي',
          DEFAULT_SETTINGS.phone,
          DEFAULT_SETTINGS.address,
        ]
      );
    },
  },

  {
    id: '002_branch_id_columns',
    description: 'Add branch_id to the pre-branches tables and attach existing rows to the main branch',
    up: (db) => {
      const targets = [
        'warehouses',
        'cash_registers',
        'sales_invoices',
        'purchase_invoices',
        'expenses',
        'customers',
        'users',
      ];

      for (const table of targets) {
        const added = addColumn(db, table, 'branch_id', 'TEXT REFERENCES branches(id)');
        if (added) {
          // Existing rows predate branches; they all belong to the main branch.
          db.run(`UPDATE ${table} SET branch_id = ? WHERE branch_id IS NULL`, [DEFAULT_BRANCH_ID]);
        }
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_warehouses_branch ON warehouses(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_branch ON sales_invoices(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pur_inv_branch ON purchase_invoices(branch_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id)');
    },
  },

  {
    id: '003_sales_pipeline_columns',
    description: 'Link invoices to sales reps, orders and projects for commissions and project P&L',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'sales_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'sales_invoices', 'order_id', 'TEXT REFERENCES orders(id)');
      addColumn(db, 'sales_invoices', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'quotations', 'sales_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'quotations', 'lead_id', 'TEXT REFERENCES leads(id)');
      addColumn(db, 'quotations', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'customer_payments', 'project_id', 'TEXT REFERENCES projects(id)');
      addColumn(db, 'customers', 'assigned_rep_id', 'TEXT REFERENCES employees(id)');
      addColumn(db, 'customers', 'price_list_id', 'TEXT REFERENCES price_lists(id)');

      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_rep ON sales_invoices(sales_rep_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_inv_project ON sales_invoices(project_id)');
    },
  },

  {
    id: '004_seed_system_roles',
    description: 'Seed the six built-in roles referenced by users.role',
    up: (db) => {
      const roles: Array<[string, string, string]> = [
        ['ADMIN', 'مدير النظام', 'صلاحية كاملة على كل وحدات النظام'],
        ['MANAGER', 'مدير', 'إدارة المبيعات والمخازن والتقارير والموافقات'],
        ['ACCOUNTANT', 'محاسب', 'الخزينة والمصروفات والديون والتقارير المالية'],
        ['SALES', 'مبيعات', 'العملاء وعروض الأسعار والفواتير'],
        ['CASHIER', 'كاشير', 'نقطة البيع والتحصيل وإغلاق الوردية'],
        ['WAREHOUSE', 'مستودع', 'المخزون والتحويلات والجرد والتوصيل'],
      ];
      for (const [code, name, description] of roles) {
        db.run(
          `INSERT OR IGNORE INTO roles (id, code, name, description, is_system)
           VALUES (?, ?, ?, ?, 1)`,
          [`role_${code.toLowerCase()}`, code, name, description]
        );
      }
    },
  },

  {
    id: '005_backfill_system_settings',
    description: 'Insert any DEFAULT_SETTINGS key the database does not have yet',
    up: (db) => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
      }
    },
  },

  {
    id: '006_seed_default_price_list',
    description: 'Seed the default retail price list so products always resolve a price',
    up: (db) => {
      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        ['pl_retail', 'PL-RETAIL', 'قائمة أسعار التجزئة', 'RETAIL', DEFAULT_SETTINGS.currency]
      );
      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 0, 1)`,
        ['pl_wholesale', 'PL-WHOLESALE', 'قائمة أسعار الجملة', 'WHOLESALE', DEFAULT_SETTINGS.currency]
      );
      db.run(
        `INSERT OR IGNORE INTO price_lists (id, code, name, customer_type, currency, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, 0, 1)`,
        ['pl_contractor', 'PL-CONTRACTOR', 'قائمة أسعار المقاولين', 'CONTRACTOR', DEFAULT_SETTINGS.currency]
      );
    },
  },

  {
    id: '007_performance_indexes',
    description: 'Add composite indexes for frequent ledger, invoice, payment and notification lookups',
    up: (db) => {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_inv_tx_prod_wh_date ON inventory_transactions(product_id, warehouse_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_customer_date ON sales_invoices(customer_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_sales_inv_date_status ON sales_invoices(date, payment_status, invoice_status)',
        'CREATE INDEX IF NOT EXISTS idx_sales_items_product ON sales_invoice_items(product_id, invoice_id)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_inv_supplier_date ON purchase_invoices(supplier_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_date ON customer_payments(customer_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date ON supplier_payments(supplier_id, date)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date ON notifications(user_id, is_read, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_audit_module_date ON audit_logs(module, created_at)',
      ];
      for (const sql of indexes) db.exec(sql);
    },
  },

  {
    id: '008_cloud_sync_and_accounting',
    description: 'Add cloud/hybrid sync tables, chart of accounts, journal entries, and ceramic batch tracking',
    up: (db) => {
      // 1. Cloud & Branch Sync
      db.exec(`
        CREATE TABLE IF NOT EXISTS branch_sync_config (
          id TEXT PRIMARY KEY,
          server_url TEXT NOT NULL DEFAULT 'https://cloud.ceramisys-erp.com/api/v1/sync',
          api_key TEXT DEFAULT 'sk_live_demo_sync_token_2026',
          branch_code TEXT NOT NULL DEFAULT 'BR-01',
          branch_name TEXT NOT NULL DEFAULT 'الفرع الرئيسي - المعرض',
          sync_mode TEXT NOT NULL DEFAULT 'HYBRID_AUTO' CHECK(sync_mode IN ('OFFLINE', 'HYBRID_AUTO', 'CLOUD_CENTRAL')),
          sync_interval_seconds INTEGER NOT NULL DEFAULT 60,
          last_synced_at TEXT,
          last_sync_status TEXT DEFAULT 'IDLE' CHECK(last_sync_status IN ('IDLE', 'SYNCING', 'SUCCESS', 'ERROR')),
          latency_ms INTEGER DEFAULT 45,
          is_enabled INTEGER DEFAULT 1,
          auto_resolve_conflicts TEXT DEFAULT 'SERVER_WINS' CHECK(auto_resolve_conflicts IN ('SERVER_WINS', 'LOCAL_WINS', 'MANUAL'))
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY,
          entity_table TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
          payload_json TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_TRANSIT', 'ACKNOWLEDGED', 'FAILED')),
          retry_count INTEGER DEFAULT 0,
          error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_inbox (
          id TEXT PRIMARY KEY,
          origin_branch_code TEXT NOT NULL,
          entity_table TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          received_at TEXT DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'APPLIED' CHECK(status IN ('PENDING', 'APPLIED', 'CONFLICT', 'IGNORED'))
        );

        CREATE TABLE IF NOT EXISTS sync_conflict_logs (
          id TEXT PRIMARY KEY,
          entity_table TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          origin_branch TEXT NOT NULL,
          conflict_type TEXT NOT NULL,
          local_data TEXT,
          remote_data TEXT,
          resolved_action TEXT,
          resolved_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- 2. General Ledger / Chart of Accounts
        CREATE TABLE IF NOT EXISTS chart_of_accounts (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
          parent_code TEXT,
          balance REAL NOT NULL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
          id TEXT PRIMARY KEY,
          entry_number TEXT UNIQUE NOT NULL,
          date TEXT NOT NULL,
          description TEXT NOT NULL,
          reference_type TEXT,
          reference_id TEXT,
          total_debit REAL NOT NULL DEFAULT 0,
          total_credit REAL NOT NULL DEFAULT 0,
          is_posted INTEGER DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS journal_entry_lines (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          debit REAL NOT NULL DEFAULT 0,
          credit REAL NOT NULL DEFAULT 0,
          description TEXT,
          FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
          FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        );

        -- 3. Ceramic Batches / Lots / Shades / Calibers
        CREATE TABLE IF NOT EXISTS product_batches (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          batch_number TEXT NOT NULL,
          tone_shade TEXT NOT NULL,
          caliber TEXT DEFAULT '0',
          production_date TEXT,
          quantity_m2 REAL NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id, warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
        CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
        CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);
      `);

      // Seed initial sync config if not present
      db.run(`
        INSERT OR IGNORE INTO branch_sync_config (id, server_url, api_key, branch_code, branch_name, sync_mode, sync_interval_seconds, last_synced_at, last_sync_status, latency_ms, is_enabled)
        VALUES ('sync_cfg_main', '', '', 'BR-01', 'الفرع والمعرض الرئيسي', 'OFFLINE', 60, NULL, 'IDLE', 0, 0)
      `);

      // Seed standard Chart of Accounts
      const initialAccounts: Array<[string, string, string, string, string | null]> = [
        ['acc_1101', '1101', 'الصندوق والخزينة الرئيسية', 'ASSET', null],
        ['acc_1102', '1102', 'الحسابات البنكية', 'ASSET', null],
        ['acc_1103', '1103', 'العملاء والمدينون (الحسابات الآجلة)', 'ASSET', null],
        ['acc_1104', '1104', 'مخزون السيراميك والبورسلين والتشطيبات', 'ASSET', null],
        ['acc_1105', '1105', 'شيكات تحت التحصيل', 'ASSET', null],
        ['acc_2101', '2101', 'الموردون ومصانع السيراميك الدائنون', 'LIABILITY', null],
        ['acc_2102', '2102', 'ضريبة القيمة المضافة المستحقة', 'LIABILITY', null],
        ['acc_3101', '3101', 'رأس المال وحقوق الملكية', 'EQUITY', null],
        ['acc_3102', '3102', 'الأرباح المحتجزة / المرحلة', 'EQUITY', null],
        ['acc_4101', '4101', 'إيرادات مبيعات السيراميك والبورسلين', 'REVENUE', null],
        ['acc_4102', '4102', 'إيرادات خدمات النقل والتوصيل والمشال', 'REVENUE', null],
        ['acc_5101', '5101', 'تكلفة البضاعة المباعة (COGS)', 'EXPENSE', null],
        ['acc_5201', '5201', 'مصروفات تشغيلية وإدارية', 'EXPENSE', null],
        ['acc_5202', '5202', 'أجور ومرتبات العاملين', 'EXPENSE', null],
        ['acc_5203', '5203', 'إيجارات المعارض والمستودعات', 'EXPENSE', null],
        ['acc_5204', '5204', 'مصروفات صيانة ووقود سيارات التوصيل', 'EXPENSE', null],
      ];

      for (const [id, code, name, type, parent] of initialAccounts) {
        db.run(
          `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
           VALUES (?, ?, ?, ?, ?, 0, 1)`,
          [id, code, name, type, parent]
        );
      }
    },
  },

  {
    id: '009_project_links',
    description: 'Link sales invoices to projects for project revenue tracking',
    up: (db) => {
      addColumn(db, 'sales_invoices', 'project_id', 'TEXT');
    },
  },

  {
    id: '010_employee_compat',
    description: 'Add legacy-friendly employee columns used by the HR screens and backfill them from canonical columns',
    up: (db) => {
      const added: Record<string, boolean> = {};
      added.name = addColumn(db, 'employees', 'name', 'TEXT');
      added.location = addColumn(db, 'employees', 'location', 'TEXT');
      added.role = addColumn(db, 'employees', 'role', 'TEXT');
      added.salary_type = addColumn(db, 'employees', 'salary_type', "TEXT DEFAULT 'MONTHLY'");
      added.status = addColumn(db, 'employees', 'status', "TEXT DEFAULT 'ACTIVE'");
      added.joined_date = addColumn(db, 'employees', 'joined_date', 'TEXT');

      if (added.name) db.run(`UPDATE employees SET name = full_name WHERE name IS NULL`);
      if (added.location) db.run(`UPDATE employees SET location = '' WHERE location IS NULL`);
      if (added.role) db.run(`UPDATE employees SET role = job_title WHERE role IS NULL`);
      if (added.status) db.run(`UPDATE employees SET status = CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END`);
      if (added.joined_date) db.run(`UPDATE employees SET joined_date = hired_at WHERE joined_date IS NULL`);

      db.exec('CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name)');
    },
  },

  {
    id: '011_sales_pipeline_completion',
    description: 'Complete the sales pipeline: link quotations/orders to invoices, track returned amounts and invoice payments',
    up: (db) => {
      addColumn(db, 'quotations', 'warehouse_id', 'TEXT');
      addColumn(db, 'quotations', 'converted_invoice_id', 'TEXT');
      addColumn(db, 'quotations', 'updated_at', 'TEXT');
      addColumn(db, 'quotation_items', 'discount_amount', 'REAL DEFAULT 0');
      addColumn(db, 'quotation_items', 'size', 'TEXT');
      addColumn(db, 'quotation_items', 'sku', 'TEXT');
      addColumn(db, 'orders', 'invoice_id', 'TEXT');
      addColumn(db, 'orders', 'quotation_id', 'TEXT');
      addColumn(db, 'orders', 'branch_id', 'TEXT');
      addColumn(db, 'orders', 'sales_rep_id', 'TEXT');
      addColumn(db, 'sales_invoices', 'returned_amount', 'REAL DEFAULT 0');
      addColumn(db, 'sales_returns', 'register_id', 'TEXT');
      addColumn(db, 'sales_returns', 'shift_id', 'TEXT');
      addColumn(db, 'customer_payments', 'invoice_id', 'TEXT');

      db.run(
        `UPDATE sales_invoices SET returned_amount = COALESCE((
           SELECT SUM(sr.total_amount) FROM sales_returns sr
           WHERE sr.original_invoice_id = sales_invoices.id
         ), 0)
         WHERE returned_amount IS NULL OR returned_amount = 0`
      );

      db.exec('CREATE INDEX IF NOT EXISTS idx_quote_invoice ON quotations(converted_invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_order_invoice ON orders(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_customer_payments_invoice ON customer_payments(invoice_id)');
    },
  },

  {
    id: 'seed_walkin_customer',
    description: 'Seed the default walk-in cash customer used by the POS screen',
    up: (db) => {
      db.run(
        `INSERT OR IGNORE INTO customers (
           id, code, name, phone, customer_type, credit_limit, current_balance, total_purchases, notes
         ) VALUES ('cust_cash', 'CASH-001', 'عميل نقدي (بيع مباشر)', '01000000000', 'RETAIL', 0, 0, 0, 'حساب افتراضي لفواتير البيع النقدي السريع من شاشة نقطة البيع')`
      );
    },
  },

  {
    id: '011_user_permission_effect',
    description: 'Allow per-user permission overrides to grant OR deny a capability',
    up: (db) => {
      addColumn(db, 'user_permissions', 'effect', "TEXT NOT NULL DEFAULT 'GRANT'");
    },
  },

  {
    id: '012_extended_branding_settings',
    description: 'Insert branding/appearance keys introduced with the admin control center',
    up: (db) => {
      for (const key of EXTENDED_SETTINGS_KEYS) {
        db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [
          key,
          DEFAULT_SETTINGS[key],
        ]);
      }
    },
  },

  {
    id: '013_sales_pages_completion',
    description: 'Order delivery tracking, status timeline, quotation follow-ups, and return refund methods',
    up: (db) => {
      addColumn(db, 'orders', 'delivery_notes', 'TEXT');
      addColumn(db, 'orders', 'delivered_at', 'TEXT');
      addColumn(db, 'order_items', 'invoiced_m2', 'REAL DEFAULT 0');
      addColumn(db, 'order_items', 'notes', 'TEXT');

      addColumn(db, 'quotations', 'follow_up_date', 'TEXT');
      addColumn(db, 'quotations', 'follow_up_notes', 'TEXT');
      addColumn(db, 'quotations', 'converted_order_id', 'TEXT');
      addColumn(db, 'quotations', 'contact_count', 'INTEGER DEFAULT 0');
      addColumn(db, 'quotations', 'last_contact_at', 'TEXT');

      addColumn(db, 'sales_returns', 'refund_method', "TEXT DEFAULT 'CASH'");

      db.exec(`
        CREATE TABLE IF NOT EXISTS order_status_history (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          from_status TEXT,
          to_status TEXT NOT NULL,
          note TEXT,
          created_by TEXT,
          created_by_name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_quotations_followup ON quotations(follow_up_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_quotations_order ON quotations(converted_order_id)');
    },
  },

  {
    id: '014_users_custom_roles',
    description: 'Drop the built-in-role CHECK constraint so custom roles can be assigned to users',
    up: (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      try {
        db.exec('DROP TABLE IF EXISTS users_new');
        db.exec(`
          CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            phone TEXT,
            pin_code TEXT,
            branch_id TEXT REFERENCES branches(id),
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
        db.exec(`
          INSERT INTO users_new (id, username, password_hash, full_name, role, phone, pin_code, branch_id, is_active, created_at, updated_at)
          SELECT id, username, password_hash, full_name, role, phone, pin_code, branch_id, is_active, created_at, updated_at FROM users;
        `);
        db.exec('DROP TABLE users');
        db.exec('ALTER TABLE users_new RENAME TO users');
      } finally {
        db.exec('PRAGMA foreign_keys = ON');
      }
    },
  },

  {
    id: '015_cloud_sync_honest',
    description: 'Remove the seeded demo sync endpoint and disable sync until a real server is configured',
    up: (db) => {
      db.run(`
        UPDATE branch_sync_config
        SET server_url = '', api_key = '', is_enabled = 0,
            last_sync_status = 'IDLE', latency_ms = 0, last_synced_at = NULL
        WHERE api_key LIKE 'sk_live_demo%'
           OR server_url LIKE '%cloud.ceramisys-erp.com%'
      `);
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
export interface MigrationReport {
  applied: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
}

function appliedIds(db: Database): Set<string> {
  const res = db.exec('SELECT id FROM schema_migrations');
  return new Set((res[0]?.values ?? []).map((row) => String(row[0])));
}

/**
 * Brings any database — brand new or years old — up to the current schema.
 * Call on every startup, before any service issues a query.
 *
 * A migration that throws is left unrecorded so it retries on the next launch,
 * and the remaining migrations still run: one broken step must not brick the
 * app or block the others, which are independent.
 */
export function runMigrations(db: Database): MigrationReport {
  const report: MigrationReport = { applied: [], skipped: [], failed: [] };

  // 1. Create anything missing. Every statement is IF NOT EXISTS, so this is
  //    a no-op on an up-to-date database.
  db.exec(SCHEMA_SQL);

  // 2. Apply the ordered migration list.
  const done = appliedIds(db);

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.skipped.push(migration.id);
      continue;
    }
    try {
      migration.up(db);
      db.run('INSERT OR REPLACE INTO schema_migrations (id, description) VALUES (?, ?)', [
        migration.id,
        migration.description,
      ]);
      report.applied.push(migration.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failed.push({ id: migration.id, error: message });
      console.error(`❌ Migration ${migration.id} failed:`, message);
    }
  }

  if (report.applied.length > 0) {
    console.log(`✅ Applied ${report.applied.length} migration(s):`, report.applied.join(', '));
  }

  return report;
}
