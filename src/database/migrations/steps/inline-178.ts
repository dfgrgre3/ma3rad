import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn } from '../support';

export const MIGRATION_178_INVENTORY_FIFO_GRN_PROVENANCE: Migration = {
    id: '178_inventory_fifo_grn_provenance',
    description: 'Preserve goods receipt, purchase invoice, batch, and supplier provenance on FIFO layers',
    up: (db: Database) => {
      addColumn(db, 'inventory_cost_layers', 'goods_receipt_id', 'TEXT');
      addColumn(db, 'inventory_cost_layers', 'purchase_invoice_id', 'TEXT');
      addColumn(db, 'inventory_cost_layers', 'batch_id', 'TEXT');
      addColumn(db, 'inventory_cost_layers', 'supplier_id', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_purchase_product
          ON inventory_cost_layers(purchase_invoice_id, product_id, warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_grn_product
          ON inventory_cost_layers(goods_receipt_id, product_id, warehouse_id);
      `);

      const legacyReceipts = db.exec(`
        SELECT tx.id, tx.product_id, tx.warehouse_id, tx.reference_id AS grn_id,
          tx.created_at, tx.quantity_m2, tx.unit_cost, grn.supplier_id,
          (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.grn_id = grn.id) AS invoice_count,
          (SELECT pi.id FROM purchase_invoices pi WHERE pi.grn_id = grn.id ORDER BY pi.id LIMIT 1) AS purchase_id,
          (SELECT pb.id
             FROM goods_receipt_note_items gi
             JOIN product_batches pb ON pb.product_id = gi.product_id
               AND pb.warehouse_id = grn.warehouse_id AND pb.batch_number = gi.batch_number
            WHERE gi.grn_id = grn.id AND gi.product_id = tx.product_id
              AND ABS(gi.accepted_quantity_m2 - tx.quantity_m2) <= 0.009
              AND ABS(gi.unit_cost - tx.unit_cost) <= 0.009
            ORDER BY gi.rowid LIMIT 1) AS batch_id
        FROM inventory_transactions tx
        JOIN goods_receipt_notes grn ON grn.id = tx.reference_id
        JOIN warehouse_stock ws ON ws.product_id = tx.product_id AND ws.warehouse_id = tx.warehouse_id
        WHERE tx.type = 'PURCHASE' AND tx.reference_type = 'GRN' AND tx.quantity_m2 > 0
          AND NOT EXISTS (
            SELECT 1 FROM inventory_cost_layers l
            WHERE l.product_id = tx.product_id AND l.warehouse_id = tx.warehouse_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM inventory_transactions out_tx
            WHERE out_tx.product_id = tx.product_id AND out_tx.warehouse_id = tx.warehouse_id
              AND out_tx.quantity_m2 < -0.009 AND out_tx.created_at >= tx.created_at
          )
          AND ws.quantity_m2 + 0.009 >= (
            SELECT COALESCE(SUM(receipt.quantity_m2), 0)
            FROM inventory_transactions receipt
            WHERE receipt.product_id = tx.product_id AND receipt.warehouse_id = tx.warehouse_id
              AND receipt.type = 'PURCHASE' AND receipt.reference_type = 'GRN'
          )
        ORDER BY tx.created_at, tx.rowid
      `)[0]?.values ?? [];

      for (const [transactionIdValue, productIdValue, warehouseIdValue, grnIdValue,
        createdAtValue, quantityValue, unitCostValue, supplierIdValue, invoiceCountValue,
        purchaseIdValue, batchIdValue] of legacyReceipts) {
        const transactionId = String(transactionIdValue);
        const productId = String(productIdValue);
        const warehouseId = String(warehouseIdValue);
        const grnId = String(grnIdValue);
        const hasSingleInvoice = Number(invoiceCountValue) === 1;
        const purchaseId = hasSingleInvoice && purchaseIdValue ? String(purchaseIdValue) : null;
        const sourceType = purchaseId ? 'PURCHASE' : 'GRN';
        const sourceId = purchaseId || grnId;
        db.run(`
          INSERT INTO inventory_cost_layers (
            id, product_id, warehouse_id, source_transaction_id, source_type, source_id,
            received_at, quantity_received, quantity_remaining, unit_cost, is_estimated,
            goods_receipt_id, purchase_invoice_id, batch_id, supplier_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        `, [
          `icl_grn_${transactionId}`, productId, warehouseId, transactionId, sourceType, sourceId,
          String(createdAtValue || '').slice(0, 10) || '0001-01-01', Number(quantityValue), Number(quantityValue),
          Math.max(0, Number(unitCostValue) || 0), grnId, purchaseId,
          batchIdValue == null ? null : String(batchIdValue), String(supplierIdValue),
        ]);
      }
    },
};

export const MIGRATION_179_INVENTORY_RECONCILIATION_SCOPE_CHECKS: Migration = {
    id: '179_inventory_reconciliation_scope_checks',
    description: 'Persist quantity variances and the actual ledger comparison scope for inventory reconciliations',
    up: (db: Database) => {
      addColumn(db, 'inventory_reconciliation_logs', 'variance_physical_vs_fifo_qty', 'REAL');
      addColumn(db, 'inventory_reconciliation_logs', 'ledger_comparable', 'INTEGER NOT NULL DEFAULT 0');
    },
};

export const MIGRATION_180_WAREHOUSE_LOCATION_MOVEMENT_AUDIT: Migration = {
    id: '180_warehouse_location_movement_audit',
    description: 'Record every product quantity assignment and release at warehouse locations',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS warehouse_location_movements (
          id TEXT PRIMARY KEY,
          warehouse_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          from_location_id TEXT,
          to_location_id TEXT,
          movement_type TEXT NOT NULL CHECK(movement_type IN ('ASSIGN', 'RELEASE', 'TRANSFER')),
          quantity_m2 REAL NOT NULL CHECK(quantity_m2 > 0),
          location_quantity_before REAL NOT NULL,
          location_quantity_after REAL NOT NULL,
          performed_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_warehouse_location_movements_product
          ON warehouse_location_movements(warehouse_id, product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_warehouse_location_movements_location
          ON warehouse_location_movements(from_location_id, to_location_id, created_at);
        CREATE TRIGGER IF NOT EXISTS trg_prevent_update_warehouse_location_movements
          BEFORE UPDATE ON warehouse_location_movements
        BEGIN
          SELECT RAISE(ABORT, 'Warehouse location movement history is immutable. Update is prohibited.');
        END;
        CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_warehouse_location_movements
          BEFORE DELETE ON warehouse_location_movements
        BEGIN
          SELECT RAISE(ABORT, 'Warehouse location movement history is immutable. Delete is prohibited.');
        END;
      `);
    },
};

export const MIGRATION_181_SPECIAL_STOCK_DISCOUNTED_SALE_LIFECYCLE: Migration = {
    id: '181_special_stock_discounted_sale_lifecycle',
    description: 'Track saleable discounted special-stock quantities, prices, and invoice-line sources',
    up: (db: Database) => {
      db.exec(`
        ALTER TABLE inventory_special_stocks ADD COLUMN remaining_quantity_m2 REAL NOT NULL DEFAULT 0;
        ALTER TABLE inventory_special_stocks ADD COLUMN discounted_unit_price REAL;
        ALTER TABLE sales_invoice_items ADD COLUMN special_stock_id TEXT;
        UPDATE inventory_special_stocks
        SET remaining_quantity_m2 = quantity_m2
        WHERE status = 'DOWNGRADED_SALE' AND remaining_quantity_m2 = 0;
        CREATE INDEX IF NOT EXISTS idx_special_stocks_discounted_sale
          ON inventory_special_stocks(warehouse_id, status, remaining_quantity_m2);
      `);
    },
};

export const MIGRATION_182_EXPLICIT_WAREHOUSE_TYPES: Migration = {
    id: '182_explicit_warehouse_types',
    description: 'Store warehouse purpose as a constrained type rather than inferring it from its name',
    up: (db: Database) => {
      addColumn(
        db,
        'warehouses',
        'warehouse_type',
        `TEXT NOT NULL DEFAULT 'MAIN_WAREHOUSE'
          CHECK (warehouse_type IN ('MAIN_WAREHOUSE', 'SHOWROOM', 'BRANCH_WAREHOUSE', 'TRANSIT_WAREHOUSE', 'RETURNS_WAREHOUSE', 'QUARANTINE_WAREHOUSE'))`
      );
      db.exec(`
        UPDATE warehouses
        SET warehouse_type = 'SHOWROOM'
        WHERE warehouse_type = 'MAIN_WAREHOUSE'
          AND id = 'wh_main'
      `);
    },
};

export const MIGRATION_183_INVENTORY_ADJUSTMENT_APPROVAL_AND_POSTING: Migration = {
    id: '183_inventory_adjustment_approval_and_posting',
    description: 'Track adjustment approval and posting as separate inventory workflow stages',
    up: (db: Database) => {
      addColumn(
        db,
        'stock_adjustments',
        'approval_status',
        `TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED'))`
      );
      addColumn(db, 'stock_adjustments', 'posted_by', 'TEXT REFERENCES users(id)');
      addColumn(db, 'stock_adjustments', 'posted_at', 'TEXT');
      db.exec(`
        UPDATE stock_adjustments
        SET approval_status = 'APPROVED',
            posted_by = COALESCE(posted_by, created_by),
            posted_at = COALESCE(posted_at, created_at)
        WHERE status = 'POSTED'
      `);
    },
};

export const MIGRATION_184_INVENTORY_COST_LAYER_LANDED_COST: Migration = {
    id: '184_inventory_cost_layer_landed_cost',
    description: 'Preserve the receipt unit cost and record landed-cost adjustments on FIFO layers',
    up: (db: Database) => {
      addColumn(db, 'inventory_cost_layers', 'original_unit_cost', 'REAL');
      addColumn(db, 'inventory_cost_layers', 'landed_cost_share', 'REAL NOT NULL DEFAULT 0');
      addColumn(db, 'inventory_cost_layers', 'cost_updated_at', 'TEXT');
    },
};

export const MIGRATION_185_INVENTORY_TRANSFER_BATCH_AND_TRANSIT_TRACKING: Migration = {
    id: '185_inventory_transfer_batch_and_transit_tracking',
    description: 'Track batches and cost layers across the transit warehouse and make transfer dispatch/receive idempotent',
    up: (db: Database) => {
      addColumn(db, 'stock_transfers', 'transit_warehouse_id', 'TEXT');
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_transfer_operations (
          id TEXT PRIMARY KEY,
          transfer_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK(operation IN ('DISPATCH', 'RECEIVE', 'REJECT')),
          idempotency_key TEXT NOT NULL,
          result_reference TEXT,
          payload_json TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(transfer_id, operation, idempotency_key),
          FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_transfer_operations_transfer
          ON stock_transfer_operations(transfer_id, operation);

        CREATE TABLE IF NOT EXISTS stock_transfer_receipts (
          id TEXT PRIMARY KEY,
          transfer_id TEXT NOT NULL,
          receipt_number TEXT UNIQUE NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          payload_json TEXT,
          received_by TEXT NOT NULL,
          received_at TEXT DEFAULT CURRENT_TIMESTAMP,
          total_received_m2 REAL NOT NULL DEFAULT 0,
          total_lost_m2 REAL NOT NULL DEFAULT 0,
          notes TEXT,
          FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_transfer_receipts_transfer
          ON stock_transfer_receipts(transfer_id, received_at);

        CREATE TABLE IF NOT EXISTS stock_transfer_batch_allocations (
          id TEXT PRIMARY KEY,
          transfer_item_id TEXT NOT NULL,
          source_batch_id TEXT,
          transit_batch_id TEXT,
          destination_batch_id TEXT,
          batch_number TEXT NOT NULL,
          tone_shade TEXT,
          caliber TEXT,
          quantity_m2 REAL NOT NULL,
          received_m2 REAL NOT NULL DEFAULT 0,
          lost_m2 REAL NOT NULL DEFAULT 0,
          reverted_m2 REAL NOT NULL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transfer_item_id) REFERENCES stock_transfer_items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_transfer_batch_allocations_item
          ON stock_transfer_batch_allocations(transfer_item_id);
      `);
    },
};

export const MIGRATION_186_INVENTORY_RETURNS_LOCATION_AND_BIN_CONTROLS: Migration = {
    id: '186_inventory_returns_location_and_bin_controls',
    description: 'Track the source and disposition of returned goods, audit location transfers, and support bin-level counts',
    up: (db: Database) => {
      addColumn(db, 'sales_return_items', 'source_type', 'TEXT');
      addColumn(db, 'sales_return_items', 'special_stock_id', 'TEXT');
      addColumn(db, 'sales_return_items', 'disposition', 'TEXT');
      addColumn(db, 'warehouse_location_movements', 'reason', 'TEXT');
      addColumn(db, 'stock_counts', 'location_id', 'TEXT');
      addColumn(db, 'stock_count_items', 'location_id', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_return_items_special_stock
          ON sales_return_items(special_stock_id);
        CREATE INDEX IF NOT EXISTS idx_stock_count_items_location
          ON stock_count_items(count_id, location_id);
      `);
    },
};

export const MIGRATION_187_INVENTORY_REORDER_PLANNING_AND_STOCK_TRACKED_POLICY: Migration = {
    id: '187_inventory_reorder_planning_and_stock_tracked_policy',
    description: 'Per-warehouse reorder planning overrides and stock-tracked product policy support',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_warehouse_planning (
          product_id TEXT NOT NULL,
          warehouse_id TEXT NOT NULL,
          min_stock_level REAL,
          max_stock_level REAL,
          safety_stock REAL,
          reorder_point REAL,
          lead_time_days INTEGER,
          review_period_days INTEGER,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (product_id, warehouse_id),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_product_warehouse_planning_warehouse
          ON product_warehouse_planning(warehouse_id, product_id);
      `);
    },
};

export const MIGRATION_188_QUOTATION_BRANCH_COMPANY_SCOPE: Migration = {
    id: '188_quotation_branch_company_scope',
    description: 'Add branch and company ownership to sales quotations and backfill it from their warehouse.',
    up: (db: Database) => {
      addColumn(db, 'quotations', 'branch_id', 'TEXT');
      addColumn(db, 'quotations', 'company_id', 'TEXT');
      db.exec(`
        UPDATE quotations
        SET branch_id = COALESCE(
          (SELECT w.branch_id FROM warehouses w WHERE w.id = quotations.warehouse_id),
          (SELECT id FROM branches WHERE is_main = 1 ORDER BY created_at LIMIT 1)
        )
        WHERE branch_id IS NULL;
        UPDATE quotations
        SET company_id = COALESCE(
          (SELECT b.company_id FROM branches b WHERE b.id = quotations.branch_id),
          (SELECT c.company_id FROM customers c WHERE c.id = quotations.customer_id),
          'cmp_main'
        )
        WHERE company_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_quotations_branch_date ON quotations(branch_id, date DESC);
        CREATE INDEX IF NOT EXISTS idx_quotations_company ON quotations(company_id);
      `);
    },
};

export const MIGRATION_189_SALES_RETURN_REQUEST_FINGERPRINT: Migration = {
    id: '189_sales_return_request_fingerprint',
    description: 'Persist the normalized request fingerprint for idempotent sales return retries.',
    up: (db: Database) => {
      addColumn(db, 'sales_returns', 'request_fingerprint', 'TEXT');
    },
};
