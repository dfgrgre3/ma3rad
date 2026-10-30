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
    id: '101_dynamic_application_configuration',
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
    id: '102_scoped_application_configuration',
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
];
