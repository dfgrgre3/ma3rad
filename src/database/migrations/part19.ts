import { addColumn, type Migration } from './support';

export const MIGRATION_PART_19: Migration[] = [
  {
    id: '128_fixed_asset_approval_attachments',
    description: 'Add two-step fixed-asset depreciation review and local document attachments.',
    up: (db) => {
      addColumn(db, 'fixed_asset_disposals', 'settlement_type', "TEXT NOT NULL DEFAULT 'CASH_REGISTER'");
      addColumn(db, 'fixed_asset_disposals', 'settlement_id', "TEXT NOT NULL DEFAULT 'cr_main'");
      db.exec(`
        CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_requests (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          period TEXT NOT NULL CHECK(length(period) = 7),
          posting_date TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          usage_quantity REAL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED')),
          requested_by TEXT NOT NULL,
          approved_by TEXT,
          journal_entry_id TEXT,
          depreciation_period_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          approved_at TEXT,
          UNIQUE(asset_id, period),
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (requested_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id),
          FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
          FOREIGN KEY (depreciation_period_id) REFERENCES fixed_asset_depreciation_periods(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_requests_status
          ON fixed_asset_depreciation_requests(status, period, created_at);
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_depreciation_request_transition
        BEFORE UPDATE ON fixed_asset_depreciation_requests
        WHEN NOT (
          OLD.status = 'PENDING' AND NEW.status = 'APPROVED'
          AND OLD.id = NEW.id AND OLD.asset_id = NEW.asset_id AND OLD.period = NEW.period
          AND OLD.posting_date = NEW.posting_date AND OLD.amount = NEW.amount
          AND OLD.usage_quantity IS NEW.usage_quantity AND OLD.requested_by = NEW.requested_by
          AND OLD.created_at = NEW.created_at AND NEW.approved_by IS NOT NULL
          AND NEW.approved_by <> OLD.requested_by
          AND NEW.journal_entry_id IS NOT NULL AND NEW.depreciation_period_id IS NOT NULL
          AND NEW.approved_at IS NOT NULL
        )
        BEGIN SELECT RAISE(ABORT, 'Fixed asset depreciation requests are immutable except approval.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_depreciation_request_no_delete
        BEFORE DELETE ON fixed_asset_depreciation_requests
        BEGIN SELECT RAISE(ABORT, 'Fixed asset depreciation requests are immutable.'); END;

        CREATE TABLE IF NOT EXISTS fixed_asset_attachments (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          document_type TEXT NOT NULL CHECK(document_type IN ('INVOICE', 'WARRANTY', 'PURCHASE_CONTRACT', 'OWNERSHIP', 'OTHER')),
          file_name TEXT NOT NULL,
          mime_type TEXT,
          file_size INTEGER NOT NULL CHECK(file_size > 0),
          checksum TEXT,
          storage_name TEXT NOT NULL,
          uploaded_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(asset_id, storage_name),
          FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fixed_asset_attachments_asset
          ON fixed_asset_attachments(asset_id, created_at);
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_attachment_no_update
        BEFORE UPDATE ON fixed_asset_attachments
        BEGIN SELECT RAISE(ABORT, 'Fixed asset attachments are immutable.'); END;
        CREATE TRIGGER IF NOT EXISTS trg_fixed_asset_attachment_no_delete
        BEFORE DELETE ON fixed_asset_attachments
        BEGIN SELECT RAISE(ABORT, 'Fixed asset attachments are immutable.'); END;
      `);
    },
  },
  {
    id: '129_customer_warranty_claims',
    description: 'Track customer warranty, repair, replacement and complaint claims with an audit trail.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_warranty_claims (
          id TEXT PRIMARY KEY,
          claim_number TEXT UNIQUE NOT NULL,
          invoice_id TEXT NOT NULL,
          invoice_item_id TEXT,
          customer_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          branch_id TEXT,
          warehouse_id TEXT,
          claim_type TEXT NOT NULL DEFAULT 'WARRANTY'
            CHECK(claim_type IN ('WARRANTY', 'REPAIR', 'REPLACEMENT', 'COMPLAINT')),
          status TEXT NOT NULL DEFAULT 'OPEN'
            CHECK(status IN ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'CANCELLED')),
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          warranty_months INTEGER NOT NULL DEFAULT 12 CHECK(warranty_months >= 0),
          warranty_expires_at TEXT,
          issue_description TEXT NOT NULL,
          resolution_type TEXT
            CHECK(resolution_type IS NULL OR resolution_type IN ('REPAIR', 'REPLACEMENT', 'REFUND', 'REJECTED', 'OTHER')),
          resolution_notes TEXT,
          decided_by TEXT,
          decided_at TEXT,
          closed_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE RESTRICT,
          FOREIGN KEY (invoice_item_id) REFERENCES sales_invoice_items(id) ON DELETE SET NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          FOREIGN KEY (branch_id) REFERENCES branches(id),
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
          FOREIGN KEY (decided_by) REFERENCES users(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_warranty_claims_status
          ON customer_warranty_claims(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_customer
          ON customer_warranty_claims(customer_id);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_invoice
          ON customer_warranty_claims(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_branch
          ON customer_warranty_claims(branch_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_product
          ON customer_warranty_claims(product_id);

        CREATE TABLE IF NOT EXISTS customer_warranty_claim_events (
          id TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL,
          action TEXT NOT NULL DEFAULT 'CREATE',
          from_status TEXT,
          to_status TEXT NOT NULL,
          notes TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (claim_id) REFERENCES customer_warranty_claims(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_warranty_claim_events_claim
          ON customer_warranty_claim_events(claim_id, created_at);
      `);
    },
  },
];
