import { addColumn, type Migration } from '../migrationSupport';

export const MIGRATION_PART_18: Migration[] = [
  {
    id: '126_fixed_asset_lifecycle',
    description: 'Add fixed-asset depreciation methods, immutable lifecycle history, disposal, maintenance, and physical counts.',
    up: (db) => {
      addColumn(db, 'fixed_assets', 'depreciation_method', "TEXT NOT NULL DEFAULT 'STRAIGHT_LINE'");
      addColumn(db, 'fixed_assets', 'declining_rate', 'REAL');
      addColumn(db, 'fixed_assets', 'expected_units', 'REAL');
      addColumn(db, 'fixed_assets', 'branch_id', 'TEXT REFERENCES branches(id) ON DELETE RESTRICT');
      addColumn(db, 'fixed_assets', 'department_id', 'TEXT REFERENCES departments(id) ON DELETE SET NULL');
      addColumn(db, 'fixed_assets', 'responsible_user_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
      db.exec(`
        UPDATE fixed_assets
        SET branch_id = (SELECT id FROM branches WHERE is_main = 1 ORDER BY id LIMIT 1)
        WHERE branch_id IS NULL;

        INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, balance, is_active)
        VALUES
          ('acc_4205', '4205', 'مكاسب استبعاد الأصول الثابتة', 'REVENUE', 0, 1),
          ('acc_5208', '5208', 'خسائر استبعاد الأصول الثابتة', 'EXPENSE', 0, 1);

        CREATE TABLE IF NOT EXISTS fixed_asset_transfers (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          transfer_date TEXT NOT NULL,
          from_branch_id TEXT,
          to_branch_id TEXT,
          from_department_id TEXT,
          to_department_id TEXT,
          from_location TEXT,
          to_location TEXT,
          from_responsible_user_id TEXT,
          to_responsible_user_id TEXT,
          notes TEXT,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (from_department_id) REFERENCES departments(id) ON DELETE SET NULL,
          FOREIGN KEY (to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
          FOREIGN KEY (from_responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (to_responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_transfers_asset_date
          ON fixed_asset_transfers(asset_id, transfer_date, created_at);

        CREATE TABLE IF NOT EXISTS fixed_asset_maintenance (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          maintenance_date TEXT NOT NULL,
          maintenance_type TEXT NOT NULL,
          description TEXT NOT NULL,
          cost REAL NOT NULL CHECK(cost >= 0),
          cost_treatment TEXT NOT NULL CHECK(cost_treatment IN ('OPERATIONAL', 'CAPITALIZED')),
          vendor TEXT,
          next_maintenance_date TEXT,
          journal_entry_id TEXT,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_maintenance_asset_date
          ON fixed_asset_maintenance(asset_id, maintenance_date, created_at);

        CREATE TABLE IF NOT EXISTS fixed_asset_disposals (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL UNIQUE,
          disposal_date TEXT NOT NULL,
          reason TEXT NOT NULL,
          sale_proceeds REAL NOT NULL CHECK(sale_proceeds >= 0),
          expenses REAL NOT NULL DEFAULT 0 CHECK(expenses >= 0),
          buyer TEXT,
          accumulated_depreciation REAL NOT NULL CHECK(accumulated_depreciation >= 0),
          book_value REAL NOT NULL CHECK(book_value >= 0),
          gain_loss REAL NOT NULL,
          journal_entry_id TEXT NOT NULL,
          approved_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (approved_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_disposals_date
          ON fixed_asset_disposals(disposal_date);

        CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_periods (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          period TEXT NOT NULL CHECK(length(period) = 7),
          posting_date TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          usage_quantity REAL,
          status TEXT NOT NULL CHECK(status = 'POSTED'),
          journal_entry_id TEXT NOT NULL,
          posted_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(asset_id, period),
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (posted_by) REFERENCES users(id)
        );
        INSERT OR IGNORE INTO fixed_asset_depreciation_periods
          (id, asset_id, period, posting_date, amount, usage_quantity, status, journal_entry_id, posted_by)
        SELECT 'fad_legacy_' || replace(e.reference_id, ':', '_'),
               substr(e.reference_id, 1, instr(e.reference_id, ':') - 1),
               substr(e.reference_id, -7), e.date, e.total_debit, NULL, 'POSTED', e.id, e.created_by
        FROM journal_entries e
        JOIN fixed_assets a ON a.id = substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
        WHERE e.reference_type = 'ASSET_DEPRECIATION'
          AND instr(e.reference_id, ':') > 0
          AND length(substr(e.reference_id, -7)) = 7
          AND substr(e.reference_id, -7) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND e.total_debit > 0;
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_schedule
          ON fixed_asset_depreciation_periods(asset_id, period);

        CREATE TABLE IF NOT EXISTS fixed_asset_count_campaigns (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          location TEXT,
          count_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'FINALIZED')),
          created_by TEXT NOT NULL,
          finalized_by TEXT,
          finalized_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (finalized_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS fixed_asset_count_snapshots (
          campaign_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          asset_code TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          registered_status TEXT NOT NULL,
          registered_location TEXT,
          PRIMARY KEY (campaign_id, asset_id),
          FOREIGN KEY (campaign_id) REFERENCES fixed_asset_count_campaigns(id) ON DELETE RESTRICT,
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT
        );
        CREATE TABLE IF NOT EXISTS fixed_asset_count_observations (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          asset_id TEXT,
          scanned_code TEXT NOT NULL,
          count_status TEXT NOT NULL CHECK(count_status IN ('FOUND', 'MISSING', 'UNREGISTERED')),
          condition TEXT,
          notes TEXT,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (campaign_id) REFERENCES fixed_asset_count_campaigns(id) ON DELETE RESTRICT,
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_count_observations_campaign
          ON fixed_asset_count_observations(campaign_id, created_at);
        CREATE TABLE IF NOT EXISTS fixed_asset_count_audit (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (campaign_id) REFERENCES fixed_asset_count_campaigns(id) ON DELETE RESTRICT,
          FOREIGN KEY (actor_id) REFERENCES users(id)
        );

        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_transfer_no_update
        BEFORE UPDATE ON fixed_asset_transfers BEGIN SELECT RAISE(ABORT, 'Fixed asset transfer history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_transfer_no_delete
        BEFORE DELETE ON fixed_asset_transfers BEGIN SELECT RAISE(ABORT, 'Fixed asset transfer history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_maintenance_no_update
        BEFORE UPDATE ON fixed_asset_maintenance BEGIN SELECT RAISE(ABORT, 'Fixed asset maintenance history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_maintenance_no_delete
        BEFORE DELETE ON fixed_asset_maintenance BEGIN SELECT RAISE(ABORT, 'Fixed asset maintenance history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_disposal_no_update
        BEFORE UPDATE ON fixed_asset_disposals BEGIN SELECT RAISE(ABORT, 'Fixed asset disposal history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_disposal_no_delete
        BEFORE DELETE ON fixed_asset_disposals BEGIN SELECT RAISE(ABORT, 'Fixed asset disposal history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_depreciation_no_update
        BEFORE UPDATE ON fixed_asset_depreciation_periods BEGIN SELECT RAISE(ABORT, 'Posted depreciation history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_depreciation_no_delete
        BEFORE DELETE ON fixed_asset_depreciation_periods BEGIN SELECT RAISE(ABORT, 'Posted depreciation history is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_observation_no_update
        BEFORE UPDATE ON fixed_asset_count_observations BEGIN SELECT RAISE(ABORT, 'Physical count observations are immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_observation_no_delete
        BEFORE DELETE ON fixed_asset_count_observations BEGIN SELECT RAISE(ABORT, 'Physical count observations are immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_snapshot_no_update
        BEFORE UPDATE ON fixed_asset_count_snapshots BEGIN SELECT RAISE(ABORT, 'Physical count snapshots are immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_snapshot_no_delete
        BEFORE DELETE ON fixed_asset_count_snapshots BEGIN SELECT RAISE(ABORT, 'Physical count snapshots are immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_audit_no_update
        BEFORE UPDATE ON fixed_asset_count_audit BEGIN SELECT RAISE(ABORT, 'Physical count audit is immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_count_audit_no_delete
        BEFORE DELETE ON fixed_asset_count_audit BEGIN SELECT RAISE(ABORT, 'Physical count audit is immutable.'); END;
      `);
    },
  },
  {
    id: '127_financial_calendar_source_indexes',
    description: 'Index source invoice due dates for branch-scoped financial calendar synchronization.',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_invoices_calendar_due
          ON sales_invoices(branch_id, due_date, remaining_amount, invoice_status);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_calendar_due
          ON purchase_invoices(branch_id, due_date, remaining_amount);
      `);
    },
  },
];
