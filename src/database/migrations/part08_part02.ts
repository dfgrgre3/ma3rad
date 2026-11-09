import { queryLedgerRows } from '../repositories/ledger';
import { addColumn, type Migration } from './support';
import { allocateCustomerPayment } from './part08_part01';
import type { CustomerPayment } from './part08_part01';

export const MIGRATION_PART_08: Migration[] = [
{
    id: '033_customer_payment_allocations',
    description: 'Allocate customer receipts to invoices for historical receivable reports',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_payment_allocations (
          id TEXT PRIMARY KEY,
          payment_id TEXT NOT NULL,
          sales_invoice_id TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(payment_id,sales_invoice_id),
          FOREIGN KEY(payment_id) REFERENCES customer_payments(id) ON DELETE CASCADE,
          FOREIGN KEY(sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_customer_payment_allocations_invoice ON customer_payment_allocations(sales_invoice_id);
      `);
      const payments = queryLedgerRows<CustomerPayment>(
        db, `SELECT id,customer_id,invoice_id,amount,date FROM customer_payments ORDER BY date,created_at,id`);
      for (const payment of payments) {
        allocateCustomerPayment(db, payment);
      }
    },
  },

{
    id: '034_fixed_asset_payable_account',
    description: 'Add a dedicated liability account for asset acquisitions made on credit',
    up: (db) => {
      db.run(`INSERT OR IGNORE INTO chart_of_accounts (id,code,name,type,parent_code,balance,is_active) VALUES ('acc_2201','2201','Fixed asset payable','LIABILITY',NULL,0,1)`);
    },
  },

{
    id: '035_installment_down_payment_link',
    description: 'Keep the down payment receipt linked to its installment plan',
    up: (db) => addColumn(db, 'installment_plans', 'down_payment_payment_id', 'TEXT'),
  }
];
