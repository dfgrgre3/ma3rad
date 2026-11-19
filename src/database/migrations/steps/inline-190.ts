import type { Database } from 'sql.js';
import type { Migration } from '../support';
import { addColumn } from '../support';

export const MIGRATION_190_SALES_RETURN_INVOICE_ITEM_IDENTITY: Migration = {
    id: '190_sales_return_invoice_item_identity',
    description: 'Link every sales return item to its original invoice line for accurate quantity and value reconciliation.',
    up: (db: Database) => {
      addColumn(db, 'sales_return_items', 'invoice_item_id', 'TEXT REFERENCES sales_invoice_items(id) ON DELETE SET NULL');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_return_items_invoice_item ON sales_return_items(invoice_item_id);`);
    },
};

export const MIGRATION_191_PROMOTION_USAGE_REVERSAL_AUDIT: Migration = {
    id: '191_promotion_usage_reversal_audit',
    description: 'Keep promotion usage history while recording invoice void reversals.',
    up: (db: Database) => {
      addColumn(db, 'promotion_usage', 'reversed_at', 'TEXT');
      addColumn(db, 'promotion_usage', 'reversed_by', 'TEXT');
      addColumn(db, 'promotion_usage', 'reversal_reason', 'TEXT');
      db.exec(`CREATE INDEX IF NOT EXISTS idx_promotion_usage_invoice_reversed ON promotion_usage(invoice_id, reversed_at);`);
    },
};

export const MIGRATION_192_ORDER_DEPOSIT_REFUNDS: Migration = {
    id: '192_order_deposit_refunds',
    description: 'Track full order deposit refunds with an auditable, unique reversal record.',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_deposit_refunds (
          id TEXT PRIMARY KEY,
          refund_number TEXT NOT NULL UNIQUE,
          order_deposit_id TEXT NOT NULL REFERENCES order_deposits(id),
          order_id TEXT NOT NULL REFERENCES orders(id),
          customer_id TEXT NOT NULL REFERENCES customers(id),
          amount REAL NOT NULL CHECK(amount > 0),
          payment_method TEXT NOT NULL,
          register_id TEXT REFERENCES cash_registers(id),
          shift_id TEXT REFERENCES cash_shifts(id),
          bank_account_id TEXT REFERENCES bank_accounts(id),
          date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_order_deposit_refunds_order ON order_deposit_refunds(order_id, date);
      `);
    },
};

export const MIGRATION_193_ALLOW_PARTIAL_ORDER_DEPOSIT_REFUNDS: Migration = {
    id: '193_allow_partial_order_deposit_refunds',
    description: 'Allow multiple partial refund records for one order deposit.',
    up: (db: Database) => {
      const indexes = db.exec(`PRAGMA index_list('order_deposit_refunds')`)[0]?.values || [];
      const hasUniqueDepositIndex = indexes.some((row) => {
        if (Number(row[2]) !== 1) return false;
        const name = String(row[1]).replace(/"/g, '""');
        const columns = db.exec(`PRAGMA index_info("${name}")`)[0]?.values || [];
        return columns.length === 1 && String(columns[0][2]) === 'order_deposit_id';
      });
      if (!hasUniqueDepositIndex) return;
      db.exec(`
        CREATE TABLE order_deposit_refunds_partial (
          id TEXT PRIMARY KEY,
          refund_number TEXT NOT NULL UNIQUE,
          order_deposit_id TEXT NOT NULL REFERENCES order_deposits(id),
          order_id TEXT NOT NULL REFERENCES orders(id),
          customer_id TEXT NOT NULL REFERENCES customers(id),
          amount REAL NOT NULL CHECK(amount > 0),
          payment_method TEXT NOT NULL,
          register_id TEXT REFERENCES cash_registers(id),
          shift_id TEXT REFERENCES cash_shifts(id),
          bank_account_id TEXT REFERENCES bank_accounts(id),
          date TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO order_deposit_refunds_partial
          SELECT id, refund_number, order_deposit_id, order_id, customer_id, amount, payment_method,
                 register_id, shift_id, bank_account_id, date, reason, created_by, created_at
          FROM order_deposit_refunds;
        DROP TABLE order_deposit_refunds;
        ALTER TABLE order_deposit_refunds_partial RENAME TO order_deposit_refunds;
        CREATE INDEX IF NOT EXISTS idx_order_deposit_refunds_order ON order_deposit_refunds(order_id, date);
      `);
    },
};

export const MIGRATION_194_SALES_INVOICE_EXTRA_FEE_BREAKDOWN: Migration = {
    id: '194_sales_invoice_extra_fee_breakdown',
    description: 'Store additional sales invoice fees separately and post them to their own revenue account.',
    up: (db: Database) => {
      addColumn(db, 'sales_invoices', 'extra_fees', 'REAL NOT NULL DEFAULT 0');
      db.run(
        `INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, balance, is_active)
         VALUES ('acc_4103', '4103', 'إيرادات المصاريف الإضافية', 'REVENUE', 0, 1)`
      );
    },
};

export const MIGRATION_195_DYNAMIC_APPROVAL_POLICIES: Migration = {
    id: '195_dynamic_approval_policies',
    description: 'Add configurable operation approval policies',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS approval_policies (
          operation_code TEXT PRIMARY KEY,
          mode TEXT NOT NULL DEFAULT 'APPROVAL' CHECK(mode IN ('DIRECT', 'APPROVAL', 'DISABLED')),
          executor_roles TEXT NOT NULL DEFAULT '[]',
          approver_roles TEXT NOT NULL DEFAULT '[]',
          min_approvals INTEGER NOT NULL DEFAULT 1 CHECK(min_approvals >= 1),
          allow_self_approval INTEGER NOT NULL DEFAULT 0 CHECK(allow_self_approval IN (0, 1)),
          max_value REAL,
          expires_after_hours INTEGER,
          approval_mode TEXT NOT NULL DEFAULT 'SINGLE' CHECK(approval_mode IN ('SINGLE', 'MULTI')),
          scope_type TEXT NOT NULL DEFAULT 'BRANCH' CHECK(scope_type IN ('BRANCH', 'WAREHOUSE', 'GLOBAL')),
          updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
};

export const MIGRATION_197_INVENTORY_BATCH_SORTING_GRADE: Migration = {
    id: '197_inventory_batch_sorting_grade',
    description: 'Track sorting grade per ceramic batch and preserve it through transfers',
    up: (db: Database) => {
      addColumn(db, 'product_batches', 'grade', "TEXT NOT NULL DEFAULT ''");
      addColumn(db, 'stock_transfer_batch_allocations', 'grade', 'TEXT');
      db.run(`
        UPDATE product_batches
        SET grade = COALESCE(
          NULLIF(grade, ''),
          (SELECT p.grade FROM products p WHERE p.id = product_batches.product_id),
          ''
        )
        WHERE grade IS NULL OR grade = ''
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_batches_tone_caliber_grade
          ON product_batches(product_id, warehouse_id, tone_shade, caliber, grade);
      `);
    },
};

export const MIGRATION_196_APPROVAL_WORKFLOW_DECISIONS: Migration = {
    id: '196_approval_workflow_decisions',
    description: 'Add approval decision history and policy workflow scope',
    up: (db: Database) => {
      const columns = db.exec("PRAGMA table_info('approval_policies')")[0]?.values.map((row) => String(row[1])) || [];
      if (!columns.includes('approval_mode')) {
        addColumn(db, 'approval_policies', 'approval_mode', "TEXT NOT NULL DEFAULT 'SINGLE'");
      }
      if (!columns.includes('scope_type')) {
        addColumn(db, 'approval_policies', 'scope_type', "TEXT NOT NULL DEFAULT 'BRANCH'");
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS approval_decisions (
          id TEXT PRIMARY KEY,
          approval_request_id TEXT NOT NULL,
          decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'REJECTED')),
          decided_by TEXT NOT NULL,
          notes TEXT,
          decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (decided_by) REFERENCES users(id),
          UNIQUE (approval_request_id, decided_by)
        );
        CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON approval_decisions(approval_request_id, decided_at);
      `);
    },
};
