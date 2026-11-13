import { addColumn, type Migration } from './support';

export const MIGRATION_PART_67: Migration[] = [
  {
    id: '173_dashboard_query_indexes',
    description: 'Index date-based dashboard aggregates and sales return lookups.',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_returns_date
          ON sales_returns(date);
        CREATE INDEX IF NOT EXISTS idx_sales_return_items_return
          ON sales_return_items(return_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date
          ON purchase_invoices(date);
      `);
    },
  },
  {
    id: '174_electronic_invoice_provider_audit_and_uniqueness',
    description: 'Persist ETA request/response evidence and enforce one electronic invoice per sales invoice.',
    up: (db) => {
      const columns = new Set(db.exec("PRAGMA table_info('electronic_invoices')")[0]?.values.map((row) => String(row[1])) || []);
      for (const [name, type] of [
        ['submission_uuid', 'TEXT'],
        ['provider_response', 'TEXT'],
        ['request_fingerprint', 'TEXT'],
        ['request_payload', 'TEXT'],
      ]) {
        if (!columns.has(name)) db.exec(`ALTER TABLE electronic_invoices ADD COLUMN ${name} ${type}`);
      }
      const customerColumns = new Set(db.exec("PRAGMA table_info('customers')")[0]?.values.map((row) => String(row[1])) || []);
      if (!customerColumns.has('tax_number')) db.exec('ALTER TABLE customers ADD COLUMN tax_number TEXT');
      const duplicates = db.exec(`
        SELECT sales_invoice_id FROM electronic_invoices
        GROUP BY sales_invoice_id HAVING COUNT(*) > 1 LIMIT 1
      `)[0]?.values;
      if (duplicates?.length) {
        throw new Error('Electronic invoice migration stopped: duplicate sales_invoice_id records exist and require audited manual reconciliation before enforcing uniqueness.');
      }
      db.exec(`
        DROP INDEX IF EXISTS idx_electronic_invoices_sales;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_electronic_invoices_sales_unique
          ON electronic_invoices(sales_invoice_id);
      `);
    },
  },
  {
    id: '175_warranty_claim_executions',
    description: 'Link completed warranty decisions to their financial, sales, or service execution records.',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS warranty_claim_executions (
          id TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL UNIQUE,
          resolution_type TEXT NOT NULL CHECK(resolution_type IN ('REPAIR', 'REPLACEMENT', 'REFUND', 'OTHER')),
          status TEXT NOT NULL DEFAULT 'EXECUTED' CHECK(status IN ('EXECUTED')),
          reference_type TEXT NOT NULL,
          reference_id TEXT,
          return_id TEXT,
          replacement_invoice_id TEXT,
          amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
          details TEXT NOT NULL,
          executed_by TEXT NOT NULL,
          executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(claim_id) REFERENCES customer_warranty_claims(id) ON DELETE RESTRICT,
          FOREIGN KEY(return_id) REFERENCES sales_returns(id) ON DELETE RESTRICT,
          FOREIGN KEY(replacement_invoice_id) REFERENCES sales_invoices(id) ON DELETE RESTRICT,
          FOREIGN KEY(executed_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_warranty_claim_executions_date
          ON warranty_claim_executions(executed_at);
      `);
    },
  },
  {
    id: '190_sales_payment_bank_accounts',
    description: 'Link sales tenders, customer receipts, and refunds to their bank accounts.',
    up: (db) => {
      addColumn(db, 'sales_invoice_payments', 'bank_account_id', 'TEXT REFERENCES bank_accounts(id)');
      addColumn(db, 'customer_payments', 'bank_account_id', 'TEXT REFERENCES bank_accounts(id)');
      addColumn(db, 'sales_returns', 'refund_bank_account_id', 'TEXT REFERENCES bank_accounts(id)');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_invoice_payments_bank ON sales_invoice_payments(bank_account_id);
        CREATE INDEX IF NOT EXISTS idx_customer_payments_bank ON customer_payments(bank_account_id);
        CREATE INDEX IF NOT EXISTS idx_sales_returns_refund_bank ON sales_returns(refund_bank_account_id);
      `);
    },
  },
];
