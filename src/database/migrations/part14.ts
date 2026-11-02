import type { Migration } from '../migrationSupport';

/**
 * Dynamic Application Configuration Engine storage.
 *
 * Entries hold the resolved override for a target (`page:/sales`,
 * `section:/dashboard#sec-pulse`, `text:shell.brand.name`, ...). Rules are the
 * zero-code DOM/text bindings that let an administrator hide or relabel any
 * section of any page without editing that page.
 */
export const MIGRATION_PART_14: Migration[] = [
  {
    id: '105_dynamic_application_configuration',
    description: 'Add dynamic application configuration entries, DOM rules and version history',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_config_entries (
          domain TEXT NOT NULL,
          key TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          label TEXT NOT NULL DEFAULT '',
          value TEXT NOT NULL DEFAULT '',
          sort_order INTEGER,
          required INTEGER,
          props_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT,
          PRIMARY KEY (domain, key)
        );

        CREATE INDEX IF NOT EXISTS idx_app_config_entries_domain
          ON app_config_entries(domain, key);

        CREATE TABLE IF NOT EXISTS app_config_rules (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK(kind IN ('selector', 'text')),
          page_path TEXT NOT NULL DEFAULT '*',
          selector TEXT,
          match_text TEXT,
          replacement_text TEXT,
          action TEXT NOT NULL DEFAULT 'hide' CHECK(action IN ('hide', 'show', 'text')),
          enabled INTEGER NOT NULL DEFAULT 1,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_app_config_rules_page
          ON app_config_rules(page_path, enabled);

        CREATE TABLE IF NOT EXISTS app_config_versions (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL UNIQUE,
          snapshot_json TEXT NOT NULL,
          created_by TEXT,
          created_by_name TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_app_config_versions_version
          ON app_config_versions(version DESC);
      `);
    },
  },
  {
    id: '106_scoped_application_configuration',
    description: 'Add scope-aware configuration overrides, origin tracking and scoped version history',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_config_scope_entries (
          scope_type TEXT NOT NULL CHECK(scope_type IN (
            'platform', 'tenant', 'activity', 'company', 'branch', 'device', 'user'
          )),
          scope_id TEXT NOT NULL,
          domain TEXT NOT NULL,
          key TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          label TEXT NOT NULL DEFAULT '',
          value TEXT NOT NULL DEFAULT '',
          sort_order INTEGER,
          required INTEGER,
          props_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT,
          PRIMARY KEY (scope_type, scope_id, domain, key)
        );

        CREATE INDEX IF NOT EXISTS idx_app_config_scope_entries_lookup
          ON app_config_scope_entries(scope_type, scope_id, domain);

        CREATE TABLE IF NOT EXISTS app_config_scope_versions (
          id TEXT PRIMARY KEY,
          scope_type TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_by TEXT,
          created_by_name TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_app_config_scope_versions_target
          ON app_config_scope_versions(scope_type, scope_id, version DESC);
      `);
    },
  },
  {
    id: '107_inventory_count_type_options',
    description: 'Allow every supported stock count type in the stock count table',
    disableForeignKeys: true,
    up: (db) => {
      db.exec(`
        CREATE TABLE stock_counts_type_upgrade (
          id TEXT PRIMARY KEY,
          count_number TEXT UNIQUE NOT NULL,
          warehouse_id TEXT NOT NULL,
          date TEXT NOT NULL,
          count_type TEXT DEFAULT 'FULL'
            CHECK(count_type IN ('FULL', 'PARTIAL', 'SPOT', 'PERIODIC', 'SURPRISE', 'BLIND')),
          status TEXT DEFAULT 'DRAFT'
            CHECK(status IN ('DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED')),
          total_items INTEGER DEFAULT 0,
          items_with_variance INTEGER DEFAULT 0,
          total_variance_value REAL DEFAULT 0,
          posted_at TEXT,
          posted_by TEXT,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          is_blind INTEGER DEFAULT 0,
          approval_status TEXT DEFAULT 'PENDING',
          approved_by TEXT,
          approved_at TEXT,
          rejection_reason TEXT,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (posted_by) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        INSERT INTO stock_counts_type_upgrade (
          id, count_number, warehouse_id, date, count_type, status, total_items,
          items_with_variance, total_variance_value, posted_at, posted_by, notes,
          created_by, created_at, is_blind, approval_status, approved_by, approved_at,
          rejection_reason
        )
        SELECT
          id, count_number, warehouse_id, date, count_type, status, total_items,
          items_with_variance, total_variance_value, posted_at, posted_by, notes,
          created_by, created_at, is_blind, approval_status, approved_by, approved_at,
          rejection_reason
        FROM stock_counts;

        DROP TABLE stock_counts;
        ALTER TABLE stock_counts_type_upgrade RENAME TO stock_counts;
        CREATE INDEX IF NOT EXISTS idx_counts_status ON stock_counts(status);
      `);
    },
  },
  {
    id: '108_receivables_company_scope',
    description: 'Scope other receivables and related records to a legal company',
    up: (db) => {
      try { db.exec("ALTER TABLE receivables ADD COLUMN company_id TEXT NOT NULL DEFAULT 'cmp_main'"); } catch { /* already present */ }
      db.exec(`
        UPDATE receivables SET company_id = 'cmp_main' WHERE company_id IS NULL OR company_id = '';
        CREATE INDEX IF NOT EXISTS idx_receivables_company_status_due ON receivables(company_id, status, due_date);
      `);
    },
  },
  {
    id: '109_return_idempotency_keys',
    description: 'Add idempotency keys to sales and purchase returns for safe retries',
    up: (db) => {
      try { db.exec("ALTER TABLE sales_returns ADD COLUMN idempotency_key TEXT"); } catch { /* already present */ }
      try { db.exec("ALTER TABLE purchase_returns ADD COLUMN idempotency_key TEXT"); } catch { /* already present */ }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_returns_idempotency
          ON sales_returns(idempotency_key) WHERE idempotency_key IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_returns_idempotency
          ON purchase_returns(idempotency_key) WHERE idempotency_key IS NOT NULL;
      `);
    },
  },
];
