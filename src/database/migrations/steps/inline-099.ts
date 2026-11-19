import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn, DEFAULT_SETTINGS, tableExists } from '../support';

export const MIGRATION_099_RESTAURANT_TABLE_KITCHEN_WORKFLOW: Migration = {
    id: '099_restaurant_table_kitchen_workflow',
    description: 'Add restaurant tables, kitchen tickets, recipe production links, and invoice idempotency',
    up: (db: Database) => {
      addColumn(db, 'sales_invoices', 'restaurant_order_id', 'TEXT');
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoices_restaurant_order
          ON sales_invoices(restaurant_order_id)
          WHERE restaurant_order_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS restaurant_tables (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          table_number INTEGER NOT NULL CHECK(table_number > 0),
          capacity INTEGER NOT NULL DEFAULT 2 CHECK(capacity > 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, table_number),
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_active
          ON restaurant_tables(branch_id, is_active, table_number);

        CREATE TABLE IF NOT EXISTS restaurant_menu_items (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          is_available INTEGER NOT NULL DEFAULT 1 CHECK(is_available IN (0, 1)),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, product_id),
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_restaurant_menu_branch_available
          ON restaurant_menu_items(branch_id, is_available);

        CREATE TABLE IF NOT EXISTS restaurant_orders (
          id TEXT PRIMARY KEY,
          order_number TEXT NOT NULL UNIQUE,
          branch_id TEXT NOT NULL,
          table_id TEXT,
          service_mode TEXT NOT NULL CHECK(service_mode IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY')),
          customer_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'BILLED', 'CANCELLED')),
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
          FOREIGN KEY (customer_id) REFERENCES customers(id),
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_restaurant_orders_branch_status
          ON restaurant_orders(branch_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table_status
          ON restaurant_orders(table_id, status);

        CREATE TABLE IF NOT EXISTS restaurant_order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity REAL NOT NULL CHECK(quantity > 0),
          unit_price REAL NOT NULL CHECK(unit_price >= 0),
          notes TEXT,
          kitchen_status TEXT NOT NULL DEFAULT 'NEW'
            CHECK(kitchen_status IN ('NEW', 'PREPARING', 'READY', 'SERVED')),
          production_order_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES restaurant_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id),
          FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order
          ON restaurant_order_items(order_id, kitchen_status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_order_items_production
          ON restaurant_order_items(production_order_id)
          WHERE production_order_id IS NOT NULL;
      `);
    },
};

export const MIGRATION_100_BRANCH_SCOPED_FINANCIAL_CLOSURES: Migration = {
    id: '100_branch_scoped_financial_closures',
    description: 'Associate financial reconciliation closures with the active branch',
    up: (db: Database) => {
      addColumn(db, 'sales_financial_reconciliations', 'branch_id', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_financial_reconciliations_branch_period
          ON sales_financial_reconciliations(branch_id, date_from, date_to, closed_at DESC);
      `);
    },
};

export const MIGRATION_101_ORDER_DEPOSITS: Migration = {
    id: '101_order_deposits',
    description: 'Track order deposits and their receipt/settlement links.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_deposits (
          id TEXT PRIMARY KEY,
          deposit_number TEXT NOT NULL UNIQUE,
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          customer_id TEXT NOT NULL REFERENCES customers(id),
          amount REAL NOT NULL CHECK(amount > 0),
          payment_method TEXT NOT NULL,
          register_id TEXT REFERENCES cash_registers(id),
          shift_id TEXT REFERENCES cash_shifts(id),
          receipt_id TEXT REFERENCES customer_payments(id),
          bank_account_id TEXT REFERENCES bank_accounts(id),
          invoice_id TEXT REFERENCES sales_invoices(id),
          date TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_order_deposits_order ON order_deposits(order_id, date);
      `);
    },
};

export const MIGRATION_102_ORDER_DEPOSIT_ACCOUNT: Migration = {
    id: '102_order_deposit_account',
    description: 'Add the customer order deposits liability account.',
    up: (db: Database) => {
      db.run(`INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
        VALUES ('acc_2106', '2106', 'دفعات مقدمة من العملاء', 'LIABILITY', NULL, 0, 1)`);
    },
};

export const MIGRATION_103_ORDER_LIFECYCLE_DIMENSIONS: Migration = {
    id: '103_order_lifecycle_dimensions',
    description: 'Separate order delivery, billing, and financial lifecycle states.',
    up: (db: Database) => {
      addColumn(db, 'orders', 'delivery_status', "TEXT NOT NULL DEFAULT 'PENDING'");
      addColumn(db, 'orders', 'billing_status', "TEXT NOT NULL DEFAULT 'NOT_INVOICED'");
      addColumn(db, 'orders', 'financial_status', "TEXT NOT NULL DEFAULT 'UNPAID'");
      db.exec(`
        UPDATE orders SET
          billing_status = CASE WHEN invoice_id IS NOT NULL THEN 'INVOICED' ELSE 'NOT_INVOICED' END,
          financial_status = CASE WHEN paid_amount >= total_amount - 0.009 THEN 'PAID' WHEN paid_amount > 0 THEN 'PARTIAL' ELSE 'UNPAID' END,
          delivery_status = CASE
            WHEN EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.delivered_m2 > 0)
              AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.delivered_m2 + 0.009 < oi.quantity_m2) THEN 'DELIVERED'
            WHEN EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND oi.delivered_m2 > 0) THEN 'PARTIAL'
            ELSE 'PENDING' END;
      `);
    },
};

export const MIGRATION_101_USER_TWO_FACTOR_AUTH: Migration = {
    id: '101_user_two_factor_auth',
    description: 'Per-user TOTP/HOTP secrets and hashed recovery codes',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_2fa (
          user_id TEXT PRIMARY KEY,
          secret TEXT NOT NULL,
          algorithm TEXT NOT NULL DEFAULT 'TOTP',
          period INTEGER NOT NULL DEFAULT 30,
          counter INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 0,
          recovery_codes TEXT NOT NULL DEFAULT '[]',
          hardware_token_id TEXT,
          setup_date TEXT,
          last_used_counter INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    },
};

export const MIGRATION_102_CANONICAL_PRICING_PROMOTIONS: Migration = {
    id: '102_canonical_pricing_promotions',
    description: 'Map legacy promotion fields to the pricing service fields used by POS.',
    up: (db: Database) => {
      db.exec(`
        UPDATE promotions
        SET promotion_type = CASE UPPER(type)
              WHEN 'PERCENT' THEN 'PERCENTAGE'
              WHEN 'PERCENTAGE' THEN 'PERCENTAGE'
              WHEN 'AMOUNT' THEN 'FIXED_AMOUNT'
              WHEN 'FIXED_AMOUNT' THEN 'FIXED_AMOUNT'
              WHEN 'BOGO' THEN 'BUY_X_GET_Y'
              WHEN 'BUY_X_GET_Y' THEN 'BUY_X_GET_Y'
              WHEN 'BUNDLE' THEN 'BUNDLE_PRICE'
              WHEN 'BUNDLE_PRICE' THEN 'BUNDLE_PRICE'
              WHEN 'COUPON' THEN CASE WHEN COALESCE(value, 0) > 100 THEN 'FIXED_AMOUNT' ELSE 'PERCENTAGE' END
              ELSE promotion_type
            END,
            discount_percentage = CASE
              WHEN UPPER(type) IN ('PERCENT', 'PERCENTAGE') THEN COALESCE(value, discount_percentage)
              WHEN UPPER(type) = 'COUPON' AND COALESCE(value, 0) <= 100 THEN COALESCE(value, discount_percentage)
              ELSE discount_percentage
            END,
            discount_amount = CASE
              WHEN UPPER(type) IN ('AMOUNT', 'FIXED_AMOUNT', 'BUNDLE', 'BUNDLE_PRICE') THEN COALESCE(value, discount_amount)
              WHEN UPPER(type) = 'COUPON' AND COALESCE(value, 0) > 100 THEN COALESCE(value, discount_amount)
              ELSE discount_amount
            END,
            buy_quantity = COALESCE(buy_qty, buy_quantity),
            get_quantity = COALESCE(get_qty, get_quantity),
            min_order_amount = COALESCE(min_amount, min_order_amount),
            starts_at = COALESCE(start_date, starts_at),
            ends_at = COALESCE(end_date, ends_at)
        WHERE type IS NOT NULL;
      `);
      const legacyTargets = db.exec(
        'SELECT id, product_ids, category_ids FROM promotions WHERE product_ids IS NOT NULL OR category_ids IS NOT NULL'
      )[0]?.values ?? [];
      legacyTargets.forEach((row, rowIndex) => {
        const promotionId = String(row[0]);
        for (const [column, targetType] of [[row[1], 'PRODUCT'], [row[2], 'CATEGORY']] as const) {
          if (typeof column !== 'string') continue;
          try {
            const ids: unknown = JSON.parse(column);
            if (!Array.isArray(ids)) continue;
            ids.filter((id): id is string => typeof id === 'string' && id.length > 0).forEach((targetId, index) => {
              db.run(
                'INSERT OR IGNORE INTO promotion_targets (id, promotion_id, target_type, target_id) VALUES (?, ?, ?, ?)',
                [`migration_${rowIndex}_${targetType}_${index}`, promotionId, targetType, targetId]
              );
            });
            db.run('UPDATE promotions SET applies_to = ? WHERE id = ? AND applies_to = \'ALL\'',
              [targetType === 'PRODUCT' ? 'PRODUCTS' : 'CATEGORIES', promotionId]);
          } catch {
            // Preserve its intended scope with no targets, so malformed legacy
            // JSON cannot accidentally turn a targeted offer into an all-items offer.
            db.run('UPDATE promotions SET applies_to = ? WHERE id = ? AND applies_to = \'ALL\'',
              [targetType === 'PRODUCT' ? 'PRODUCTS' : 'CATEGORIES', promotionId]);
          }
        }
      });
    },
};

export const MIGRATION_103_DEFAULT_BUSINESS_TYPE: Migration = {
    id: '103_default_business_type',
    description: 'Persist the canonical default business type for legacy databases.',
    up: (db: Database) => {
      db.run('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)', [
        'businessType', DEFAULT_SETTINGS.businessType,
      ]);
    },
};

export const MIGRATION_103_LEGACY_FIXED_ASSET_COUNT_SNAPSHOT_COLUMNS: Migration = {
    id: '103_legacy_fixed_asset_count_snapshot_columns',
    description: 'Backfill required status/location columns on older fixed asset count snapshot tables.',
    up: (db: Database) => {
      if (!tableExists(db, 'fixed_asset_count_snapshots')) return;

      addColumn(db, 'fixed_asset_count_snapshots', 'registered_status', "TEXT NOT NULL DEFAULT 'UNKNOWN'");
      addColumn(db, 'fixed_asset_count_snapshots', 'registered_location', 'TEXT');

      db.exec(`
        UPDATE fixed_asset_count_snapshots
        SET registered_status = (
          SELECT fa.status FROM fixed_assets fa WHERE fa.id = fixed_asset_count_snapshots.asset_id
        )
        WHERE registered_status IS NULL OR registered_status = '';

        UPDATE fixed_asset_count_snapshots
        SET registered_location = (
          SELECT fa.location FROM fixed_assets fa WHERE fa.id = fixed_asset_count_snapshots.asset_id
        )
        WHERE registered_location IS NULL;
      `);
    },
};

export const MIGRATION_104_JOURNAL_ENTRIES_REFERENCE_UNIQUE: Migration = {
    id: '104_journal_entries_reference_unique',
    description: 'Enforce one journal entry per (reference_type, reference_id) when existing data allows it',
    up: (db: Database) => {
      const dupes = db.exec(`
        SELECT reference_type, reference_id, COUNT(*) AS c
        FROM journal_entries
        WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
        GROUP BY reference_type, reference_id
        HAVING c > 1
        LIMIT 1
      `);
      const dupRows = dupes[0]?.values ?? [];
      if (dupRows.length > 0) {
        // Never rewrite the accounting audit trail automatically. Fresh and
        // reconciled databases get the hard guarantee; legacy databases with
        // duplicates keep the existing programmatic idempotency and must be
        // reconciled manually (the migration is recorded as applied and does
        // not retry).
        console.warn(
          '[104_journal_entries_reference_unique] Skipped unique index: duplicate (reference_type, reference_id) rows exist. Reconcile them, then the index will be created on the next run.'
        );
        return;
      }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_reference_unique
          ON journal_entries(reference_type, reference_id)
          WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
      `);
    },
};

export const MIGRATION_113_TABLE_FIRST_INVOICE_DEFAULT: Migration = {
    id: '113_table_first_invoice_default',
    description: 'Use the simple table-first invoice for installations on the legacy default template.',
    up: (db: Database) => {
      db.run(
        "UPDATE system_settings SET value = 'table' WHERE key = 'defaultInvoiceTemplate' AND value = 'classic'",
      );
      db.run(
        "UPDATE system_settings SET value = 'minimal' WHERE key = 'invoiceTableStyle' AND value = 'bordered'",
      );
    },
};

export const MIGRATION_114_PRODUCT_FORM_FIELD_PREFERENCES_AND_TONES: Migration = {
    id: '114_product_form_field_preferences_and_tones',
    description: 'Persist per-user product form defaults and managed ceramic tones.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_form_field_preferences (
          user_id TEXT NOT NULL,
          field_key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, field_key),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS product_tone_options (
          tone TEXT PRIMARY KEY COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO product_tone_options (tone)
        SELECT DISTINCT TRIM(tone)
        FROM products
        WHERE tone IS NOT NULL AND TRIM(tone) <> '';
      `);
    },
};
