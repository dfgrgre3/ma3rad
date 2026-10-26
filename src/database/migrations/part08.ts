import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

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
      const payments = queryLedgerRows<{ id: string; customer_id: string; invoice_id: string | null; amount: number; date: string }>(
        db, `SELECT id,customer_id,invoice_id,amount,date FROM customer_payments ORDER BY date,created_at,id`);
      for (const payment of payments) {
        if (payment.invoice_id) {
          if (!queryLedgerRows(db, 'SELECT id FROM sales_invoices WHERE id=?', [payment.invoice_id]).length) continue;
          db.run(`INSERT OR IGNORE INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
            [`cpa_${uuidv4().substring(0, 8)}`, payment.id, payment.invoice_id, payment.amount]);
          continue;
        }
        let unapplied = Math.round((Number(payment.amount) || 0) * 100) / 100;
        const invoices = queryLedgerRows<{ id: string; total_amount: number; paid_amount: number; remaining_amount: number }>(db, `
          SELECT id,total_amount,paid_amount,remaining_amount FROM sales_invoices
          WHERE customer_id=? AND invoice_status!='VOID' AND date<=? ORDER BY date,created_at,id
        `, [payment.customer_id, payment.date]);
        for (const invoice of invoices) {
          if (unapplied <= 0.009) break;
          const allocated = Number(queryLedgerRows<{ amount: number }>(db,
            `SELECT COALESCE(SUM(amount),0) AS amount FROM customer_payment_allocations WHERE sales_invoice_id=?`, [invoice.id])[0]?.amount || 0);
          const returns = Number(queryLedgerRows<{ amount: number }>(db,
            `SELECT COALESCE(SUM(remaining_to_balance),0) AS amount FROM sales_returns WHERE original_invoice_id=? AND date<=?`, [invoice.id, payment.date])[0]?.amount || 0);
          const open = Math.max(0, Number(invoice.total_amount) - allocated - returns);
          const value = Math.round(Math.min(unapplied, open) * 100) / 100;
          if (value <= 0) continue;
          db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
            [`cpa_${uuidv4().substring(0, 8)}`, payment.id, invoice.id, value]);
          const paid = Math.round((Number(invoice.paid_amount) + value) * 100) / 100;
          const remaining = Math.max(0, Math.round((Number(invoice.remaining_amount) - value) * 100) / 100);
          db.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [paid, remaining, remaining <= 0 ? 'PAID' : 'PARTIAL', invoice.id]);
          invoice.paid_amount = paid;
          invoice.remaining_amount = remaining;
          unapplied = Math.round((unapplied - value) * 100) / 100;
        }
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
