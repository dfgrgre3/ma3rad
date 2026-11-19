import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn } from '../support';

export const MIGRATION_074_MANUFACTURING_QUALITY_CHECKS: Migration = {
    id: '074_manufacturing_quality_checks',
    description: 'Add quality inspection records for manufacturing production orders',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS manufacturing_quality_checks (
          id TEXT PRIMARY KEY,
          production_order_id TEXT NOT NULL,
          inspection_type TEXT NOT NULL DEFAULT 'FINAL'
            CHECK(inspection_type IN ('INCOMING', 'IN_PROCESS', 'FINAL')),
          result TEXT NOT NULL DEFAULT 'PENDING'
            CHECK(result IN ('PASS', 'FAIL', 'PENDING', 'CONDITIONAL')),
          quantity_inspected REAL NOT NULL DEFAULT 0,
          quantity_accepted REAL NOT NULL DEFAULT 0,
          quantity_rejected REAL NOT NULL DEFAULT 0,
          notes TEXT,
          inspector_id TEXT,
          branch_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mfg_quality_order
          ON manufacturing_quality_checks(production_order_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_quality_branch
          ON manufacturing_quality_checks(branch_id);
      `);
    },
};

export const MIGRATION_075_MANUFACTURING_MAINTENANCE: Migration = {
    id: '075_manufacturing_maintenance',
    description: 'Add equipment maintenance records for manufacturing work centers',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS manufacturing_maintenance (
          id TEXT PRIMARY KEY,
          work_center_id TEXT,
          equipment_name TEXT NOT NULL,
          maintenance_type TEXT NOT NULL DEFAULT 'PREVENTIVE'
            CHECK(maintenance_type IN ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE')),
          status TEXT NOT NULL DEFAULT 'SCHEDULED'
            CHECK(status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
          scheduled_date TEXT,
          completed_date TEXT,
          cost REAL NOT NULL DEFAULT 0,
          notes TEXT,
          performed_by TEXT,
          branch_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL,
          FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_wc
          ON manufacturing_maintenance(work_center_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_branch
          ON manufacturing_maintenance(branch_id);
        CREATE INDEX IF NOT EXISTS idx_mfg_maintenance_status
          ON manufacturing_maintenance(status);
      `);
    },
};

export const MIGRATION_076_COMPANY_ORGANIZATION_SETTINGS: Migration = {
    id: '076_company_organization_settings',
    description: 'Add organization-level configuration (fiscal year, time zone, locale, date format) to companies',
    up: (db: Database) => {
      for (const col of [
        'ALTER TABLE companies ADD COLUMN fiscal_year_start_month INTEGER DEFAULT 1;',
        'ALTER TABLE companies ADD COLUMN time_zone TEXT;',
        'ALTER TABLE companies ADD COLUMN locale TEXT DEFAULT \'ar\';',
        'ALTER TABLE companies ADD COLUMN date_format TEXT DEFAULT \'YYYY-MM-DD\';',
      ]) {
        try { db.exec(col); } catch { /* exists */ }
      }
      db.exec(`UPDATE companies SET fiscal_year_start_month = COALESCE(fiscal_year_start_month, 1), locale = COALESCE(locale, 'ar'), date_format = COALESCE(date_format, 'YYYY-MM-DD') WHERE fiscal_year_start_month IS NULL OR locale IS NULL OR date_format IS NULL;`);
    },
};

export const MIGRATION_077_COMPANY_PAYROLL_SETTINGS: Migration = {
    id: '077_company_payroll_settings',
    description: 'Add jurisdiction-configurable payroll settings to companies',
    up: (db: Database) => {
      for (const col of [
        'ALTER TABLE companies ADD COLUMN payroll_tax_rate REAL DEFAULT 0;',
        'ALTER TABLE companies ADD COLUMN overtime_multiplier REAL DEFAULT 1.5;',
        'ALTER TABLE companies ADD COLUMN working_days_per_month INTEGER DEFAULT 26;',
      ]) {
        try { db.exec(col); } catch { /* exists */ }
      }
      db.exec(`UPDATE companies SET payroll_tax_rate = COALESCE(payroll_tax_rate, 0), overtime_multiplier = COALESCE(overtime_multiplier, 1.5), working_days_per_month = COALESCE(working_days_per_month, 26) WHERE payroll_tax_rate IS NULL OR overtime_multiplier IS NULL OR working_days_per_month IS NULL;`);
    },
};

export const MIGRATION_078_QUALITY_DISPOSITION: Migration = {
    id: '078_quality_disposition',
    description: 'Add disposition tracking to quality checks (scrap/rework/return/accept)',
    up: (db: Database) => {
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition TEXT DEFAULT 'NONE' CHECK(disposition IN ('NONE','ACCEPT','SCRAP','REWORK','RETURN'));`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition_qty REAL DEFAULT 0;`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE manufacturing_quality_checks ADD COLUMN disposition_at TEXT;`); } catch { /* exists */ }
      db.exec(`UPDATE manufacturing_quality_checks SET disposition = COALESCE(disposition, 'NONE'), disposition_qty = COALESCE(disposition_qty, 0) WHERE disposition IS NULL;`);
    },
};

export const MIGRATION_079_SERVICE_COST_ACCOUNTS: Migration = {
    id: '079_service_cost_accounts',
    description: 'Add service cost and accrued service cost accounts so service lines post a balanced cost entry instead of inflating goods COGS.',
    up: (db: Database) => {
      db.run(
        `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
         VALUES ('acc_5102', '5102', 'تكلفة الخدمات المباشرة', 'EXPENSE', NULL, 0, 1)`
      );
      db.run(
        `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active)
         VALUES ('acc_2105', '2105', 'مستحقات تكلفة الخدمات', 'LIABILITY', NULL, 0, 1)`
      );
    },
};

export const MIGRATION_080_UOM_QUANTITY_COLUMNS: Migration = {
    id: '080_uom_quantity_columns',
    description: 'Add generic unit-of-measure columns (uom, quantity) beside quantity_m2 and keep them populated with triggers so stock and document lines no longer assume square meters.',
    up: (db: Database) => {
      // `inventory_transactions` is an immutable ledger with its own update
      // guard, so its unit columns are not maintained by triggers here.
      const tables = [
        'sales_invoice_items',
        'purchase_invoice_items',
        'sales_return_items',
        'purchase_return_items',
        'warehouse_stock',
      ];
      for (const table of tables) {
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN uom TEXT;`);
        } catch {
          // Column already exists on upgraded databases.
        }
        try {
          db.exec(`ALTER TABLE ${table} ADD COLUMN quantity REAL;`);
        } catch {
          // Column already exists on upgraded databases.
        }
        // Backfill from the product's configured base unit; legacy rows with an
        // unknown product stay on square meters because that is what they meant.
        db.exec(`
          UPDATE ${table}
          SET uom = COALESCE(
                (SELECT p.base_unit FROM products p WHERE p.id = ${table}.product_id),
                'M2'
              ),
              quantity = quantity_m2
          WHERE quantity IS NULL OR uom IS NULL;
        `);
        // New writes keep both representations in sync without touching every
        // service: quantity is always the amount in the product's base unit.
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_uom_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.quantity IS NULL OR NEW.uom IS NULL
          BEGIN
            UPDATE ${table}
            SET uom = COALESCE(NEW.uom, (SELECT p.base_unit FROM products p WHERE p.id = NEW.product_id), 'M2'),
                quantity = COALESCE(NEW.quantity, NEW.quantity_m2)
            WHERE id = NEW.id;
          END;
        `);
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_uom_after_update
          AFTER UPDATE OF quantity_m2, product_id ON ${table}
          BEGIN
            UPDATE ${table}
            SET uom = COALESCE((SELECT p.base_unit FROM products p WHERE p.id = NEW.product_id), 'M2'),
                quantity = NEW.quantity_m2
            WHERE id = NEW.id;
          END;
        `);
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_uom ON ${table}(uom);`);
        } catch {
          // Index creation is best-effort on older schemas.
        }
      }
    },
};

export const MIGRATION_081_COMPANY_SCOPE_BACKFILL: Migration = {
    id: '081_company_scope_backfill',
    description: 'Backfill company_id on every scoped table and default it on insert, so company isolation can be strict instead of tolerating NULL rows.',
    up: (db: Database) => {
      const branchDerived = ['warehouses', 'employees'];
      db.exec(`UPDATE branches SET company_id = 'cmp_main' WHERE company_id IS NULL;`);
      for (const table of branchDerived) {
        db.exec(`
          UPDATE ${table}
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = ${table}.branch_id),
            'cmp_main'
          )
          WHERE company_id IS NULL;
        `);
      }
      for (const table of ['customers', 'suppliers', 'products']) {
        db.exec(`UPDATE ${table} SET company_id = 'cmp_main' WHERE company_id IS NULL;`);
      }
      for (const table of ['sales_invoices', 'purchase_invoices']) {
        db.exec(`
          UPDATE ${table}
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = ${table}.branch_id),
            (SELECT b.company_id FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = ${table}.warehouse_id),
            'cmp_main'
          )
          WHERE company_id IS NULL;
        `);
      }

      // Runtime defaults: any insert that omits company_id inherits the branch
      // owner (or the main company) instead of creating an invisible row.
      for (const table of branchDerived) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table}
            SET company_id = COALESCE(
              (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
              'cmp_main'
            )
            WHERE id = NEW.id;
          END;
        `);
      }
      for (const table of ['customers', 'suppliers', 'products']) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table} SET company_id = 'cmp_main' WHERE id = NEW.id;
          END;
        `);
      }
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_branches_company_after_insert
        AFTER INSERT ON branches
        WHEN NEW.company_id IS NULL
        BEGIN
          UPDATE branches SET company_id = 'cmp_main' WHERE id = NEW.id;
        END;
      `);
      for (const table of ['sales_invoices', 'purchase_invoices']) {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_${table}_company_after_insert
          AFTER INSERT ON ${table}
          WHEN NEW.company_id IS NULL
          BEGIN
            UPDATE ${table}
            SET company_id = COALESCE(
              (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
              (SELECT b.company_id FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.id = NEW.warehouse_id),
              'cmp_main'
            )
            WHERE id = NEW.id;
          END;
        `);
      }
    },
};

export const MIGRATION_082_JOURNAL_COMPANY_SCOPE: Migration = {
    id: '082_journal_company_scope',
    description: 'Attach journal entries to the legal entity that owns their branch so accounting reports can be company-scoped.',
    up: (db: Database) => {
      addColumn(db, 'journal_entries', 'company_id', 'TEXT');
      db.exec(`
        UPDATE journal_entries
        SET company_id = COALESCE(
          (SELECT b.company_id FROM branches b WHERE b.id = journal_entries.branch_id),
          'cmp_main'
        )
        WHERE company_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_journal_entries_company ON journal_entries(company_id);
        CREATE TRIGGER IF NOT EXISTS trg_journal_entries_company_after_insert
        AFTER INSERT ON journal_entries
        WHEN NEW.company_id IS NULL
        BEGIN
          UPDATE journal_entries
          SET company_id = COALESCE(
            (SELECT b.company_id FROM branches b WHERE b.id = NEW.branch_id),
            'cmp_main'
          )
          WHERE id = NEW.id;
        END;
      `);
    },
};

export const MIGRATION_083_SALES_INVOICE_PAYMENTS: Migration = {
    id: '083_sales_invoice_payments',
    description: 'Split-payment support: per-method payment rows for sales invoices.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales_invoice_payments (
          id TEXT PRIMARY KEY,
          invoice_id TEXT NOT NULL,
          method TEXT NOT NULL,
          amount REAL NOT NULL,
          reference TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sip_invoice ON sales_invoice_payments(invoice_id);
      `);
    },
};

export const MIGRATION_084_HELD_ORDERS: Migration = {
    id: '084_held_orders',
    description: 'Persist POS held (parked) orders in the database for crash recovery.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS held_orders (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_by TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_held_orders_created ON held_orders(created_at);
      `);
    },
};

export const MIGRATION_086_PROMOTIONS: Migration = {
    id: '086_promotions',
    description: 'Promotions: percent/amount/BOGO/bundle/coupon rules with date range and scope.',
    up: (db: Database) => {
      // The base schema already creates the `promotions` table (schema part-11),
      // so this migration must only ADD the promotion columns that post-date the
      // base schema instead of re-creating the table. `CREATE TABLE IF NOT EXISTS`
      // silently skips on an existing table and the follow-up index then failed
      // with "no such column: coupon_code".
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotion_usage (
          id TEXT PRIMARY KEY,
          promotion_id TEXT NOT NULL,
          invoice_id TEXT,
          coupon_code TEXT,
          discount_amount REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_promotion_usage_promotion ON promotion_usage(promotion_id);
      `);
      addColumn(db, 'promotions', 'coupon_code', 'TEXT');
      addColumn(db, 'promotions', 'type', 'TEXT');
      addColumn(db, 'promotions', 'value', 'REAL');
      addColumn(db, 'promotions', 'buy_qty', 'REAL');
      addColumn(db, 'promotions', 'get_qty', 'REAL');
      addColumn(db, 'promotions', 'min_qty', 'REAL');
      addColumn(db, 'promotions', 'min_amount', 'REAL');
      addColumn(db, 'promotions', 'product_ids', 'TEXT');
      addColumn(db, 'promotions', 'category_ids', 'TEXT');
      addColumn(db, 'promotions', 'start_date', 'TEXT');
      addColumn(db, 'promotions', 'end_date', 'TEXT');
      addColumn(db, 'promotions', 'priority', 'INTEGER NOT NULL DEFAULT 0');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_promo_coupon ON promotions(coupon_code);`);
    },
};
