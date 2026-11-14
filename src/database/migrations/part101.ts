import type { Migration } from './support';
import { tableExists, addColumn, columnExists } from './support';
import { queryLedgerRows } from '../repositories/ledger';

export const MIGRATION_PART_101: Migration[] = [
  {
    id: '150_plan_versioning_and_price_locks',
    description:
      'Add plan versioning, price history, subscription price locks, upgrade rules, and extend coupons/subscriptions/tenants for plan lifecycle management.',
    disableForeignKeys: true,
    up: (db) => {
      // ── New tables (idempotent) ──
      db.exec(`
        CREATE TABLE IF NOT EXISTS platform_plan_versions (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          billing_cycle TEXT NOT NULL DEFAULT 'YEARLY',
          price REAL NOT NULL DEFAULT 0,
          monthly_price REAL NOT NULL DEFAULT 0,
          yearly_price REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'EGP',
          seats_limit INTEGER NOT NULL DEFAULT 1,
          branches_limit INTEGER NOT NULL DEFAULT 1,
          devices_limit INTEGER NOT NULL DEFAULT 1,
          storage_limit_mb INTEGER NOT NULL DEFAULT 500,
          max_products INTEGER NOT NULL DEFAULT 1000,
          max_warehouses INTEGER NOT NULL DEFAULT 2,
          trial_days INTEGER NOT NULL DEFAULT 14,
          included_modules TEXT NOT NULL DEFAULT '[]',
          features TEXT NOT NULL DEFAULT '[]',
          permissions TEXT NOT NULL DEFAULT '[]',
          offline_grace_period_days INTEGER NOT NULL DEFAULT 14,
          effective_from TEXT NOT NULL,
          is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
          change_note TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (plan_id) REFERENCES platform_plans(id) ON DELETE CASCADE,
          UNIQUE(plan_id, version)
        );
        CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON platform_plan_versions(plan_id);
        CREATE INDEX IF NOT EXISTS idx_plan_versions_effective ON platform_plan_versions(effective_from);

        CREATE TABLE IF NOT EXISTS platform_price_history (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          old_price REAL,
          new_price REAL NOT NULL,
          currency TEXT NOT NULL DEFAULT 'EGP',
          effective_from TEXT NOT NULL,
          reason TEXT,
          actor_id TEXT,
          actor_name TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (plan_id) REFERENCES platform_plans(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_price_history_plan ON platform_price_history(plan_id, effective_from);

        CREATE TABLE IF NOT EXISTS platform_subscription_price_locks (
          id TEXT PRIMARY KEY,
          subscription_id TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          locked_price REAL NOT NULL,
          locked_monthly_price REAL NOT NULL DEFAULT 0,
          locked_yearly_price REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'EGP',
          expires_at TEXT,
          is_grandfathered INTEGER NOT NULL DEFAULT 0 CHECK(is_grandfathered IN (0,1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (subscription_id) REFERENCES platform_subscriptions(id) ON DELETE CASCADE,
          FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
        );
        CREATE INDEX IF NOT EXISTS idx_price_locks_subscription ON platform_subscription_price_locks(subscription_id);

        CREATE TABLE IF NOT EXISTS platform_plan_upgrade_rules (
          id TEXT PRIMARY KEY,
          from_plan_id TEXT NOT NULL,
          to_plan_id TEXT NOT NULL,
          allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
          upgrade_fee_percent REAL NOT NULL DEFAULT 0,
          requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_plan_id) REFERENCES platform_plans(id),
          FOREIGN KEY (to_plan_id) REFERENCES platform_plans(id),
          UNIQUE(from_plan_id, to_plan_id)
        );
        CREATE INDEX IF NOT EXISTS idx_upgrade_rules_from ON platform_plan_upgrade_rules(from_plan_id);
        CREATE INDEX IF NOT EXISTS idx_upgrade_rules_to ON platform_plan_upgrade_rules(to_plan_id);
      `);

      // ── Extend platform_plans (existing table) ──
      const planCols: Array<{ name: string; def: string }> = [
        { name: 'current_version', def: 'INTEGER NOT NULL DEFAULT 1' },
        { name: 'versioned', def: 'INTEGER NOT NULL DEFAULT 0 CHECK(versioned IN (0,1))' },
      ];
      for (const col of planCols) {
        if (!columnExists(db, 'platform_plans', col.name)) {
          addColumn(db, 'platform_plans', col.name, col.def);
        }
      }

      // ── Extend platform_subscriptions (existing table) ──
      const subCols: Array<{ name: string; def: string }> = [
        { name: 'locked_price', def: 'REAL' },
        { name: 'locked_currency', def: 'TEXT DEFAULT \'EGP\'' },
        { name: 'coupon_code', def: 'TEXT' },
        { name: 'plan_version', def: 'INTEGER DEFAULT 1' },
        { name: 'last_change_type', def: 'TEXT' },
        { name: 'trial_ends_at', def: 'TEXT' },
        { name: 'is_trial', def: 'INTEGER NOT NULL DEFAULT 0 CHECK(is_trial IN (0,1))' },
      ];
      for (const col of subCols) {
        if (!columnExists(db, 'platform_subscriptions', col.name)) {
          addColumn(db, 'platform_subscriptions', col.name, col.def);
        }
      }

      // ── Extend platform_coupons (existing table) ──
      const couponCols: Array<{ name: string; def: string }> = [
        { name: 'plan_id', def: 'TEXT' },
        { name: 'first_payment_only', def: 'INTEGER NOT NULL DEFAULT 0 CHECK(first_payment_only IN (0,1))' },
        { name: 'min_subtotal', def: 'REAL NOT NULL DEFAULT 0' },
        { name: 'starts_at', def: 'TEXT' },
        { name: 'notes', def: 'TEXT' },
      ];
      for (const col of couponCols) {
        if (!columnExists(db, 'platform_coupons', col.name)) {
          addColumn(db, 'platform_coupons', col.name, col.def);
        }
      }

      // ── Migrate existing active plans: snapshot current state as version 1 ──
      if (tableExists(db, 'platform_plans')) {
        const plans = queryLedgerRows<{ id: string; code: string; name: string }>(db, 'SELECT id, code, name FROM platform_plans');
        for (const p of plans) {
          db.run(
            `INSERT OR IGNORE INTO platform_plan_versions
              (id, plan_id, version, name, description, billing_cycle, price, monthly_price, yearly_price,
               currency, seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products,
               max_warehouses, trial_days, included_modules, features, permissions,
               offline_grace_period_days, effective_from, is_current, change_note, created_by, created_at)
             SELECT
               'pv_' || id || '_1',
               id, 1, name, description, billing_cycle, price, monthly_price, yearly_price,
               currency, seats_limit, branches_limit, devices_limit, storage_limit_mb, max_products,
               max_warehouses, trial_days, included_modules, features, permissions,
               offline_grace_period_days, created_at, 1, 'إصدار أولي للخطة', 'system', created_at
             FROM platform_plans WHERE id = ?`,
            [p.id]
          );
        }
      }
    },
  },
];
