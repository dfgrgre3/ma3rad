import type { Migration } from './support';
import { addColumn, columnExists, tableExists } from './support';

export const MIGRATION_PART_100: Migration = {
  id: '195_platform_license_enhancements',
  description: 'Add branches_limit, starts_at, offline_grace_period_days, coupling_mode to licenses and subscriptions; add offline_grace_period_days to plans; add license/subscription change log tables.',
  up: (db) => {
    // ── platform_plans: offline_grace_period_days ─────────────────────────
    if (tableExists(db, 'platform_plans')) {
      if (!columnExists(db, 'platform_plans', 'offline_grace_period_days')) {
        addColumn(db, 'platform_plans', 'offline_grace_period_days', 'INTEGER NOT NULL DEFAULT 14');
      }
    }

    // ── platform_subscriptions: branches_limit ────────────────────────────
    if (tableExists(db, 'platform_subscriptions')) {
      if (!columnExists(db, 'platform_subscriptions', 'branches_limit')) {
        addColumn(db, 'platform_subscriptions', 'branches_limit', 'INTEGER NOT NULL DEFAULT 1');
      }
    }

    // ── platform_licenses: new columns ───────────────────────────────────
    if (tableExists(db, 'platform_licenses')) {
      const licenseColumns: Array<[string, string]> = [
        ['starts_at', 'TEXT'],
        ['branches_limit', 'INTEGER NOT NULL DEFAULT 1'],
        ['offline_grace_period_days', 'INTEGER'],
        ['coupling_mode', "TEXT DEFAULT 'FULL' CHECK(coupling_mode IN ('FULL','EXPIRY_ONLY','NONE'))"],
      ];
      for (const [column, definition] of licenseColumns) {
        if (!columnExists(db, 'platform_licenses', column)) {
          addColumn(db, 'platform_licenses', column, definition);
        }
      }
    }

    // ── platform_license_changes table ──────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_license_changes (
        id TEXT PRIMARY KEY,
        license_id TEXT NOT NULL,
        subscription_id TEXT,
        change_type TEXT NOT NULL
          CHECK(change_type IN ('ISSUE','RENEW','SUSPEND','REVOKE','TRANSFER','MODULE_CHANGE','LIMIT_CHANGE','COUPLING_CHANGE','STATUS_CHANGE')),
        old_values TEXT,
        new_values TEXT,
        actor_id TEXT,
        actor_name TEXT,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (license_id) REFERENCES platform_licenses(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE SET NULL
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_platform_license_changes_license
        ON platform_license_changes(license_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_platform_license_changes_type
        ON platform_license_changes(change_type);
    `);

    // ── platform_subscription_changes table ─────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS platform_subscription_changes (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        change_type TEXT NOT NULL
          CHECK(change_type IN ('CREATE','RENEW','SUSPEND','CANCEL','EXPIRE','PLAN_CHANGE','LIMIT_CHANGE','SEATS_CHANGE','BRANCHES_CHANGE')),
        old_values TEXT,
        new_values TEXT,
        actor_id TEXT,
        actor_name TEXT,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_sub
        ON platform_subscription_changes(subscription_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_platform_subscription_changes_type
        ON platform_subscription_changes(change_type);
    `);
  },
};
