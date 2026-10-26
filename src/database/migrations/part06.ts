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

export const MIGRATION_PART_06: Migration[] = [
{
    id: '025_backfill_return_ledger_entries',
    description: 'Backfill balanced journal entries for historical sales and purchase returns',
    up: backfillReturnLedgerEntries,
  },

{
    id: '026_fixed_asset_cost_account',
    description: 'Add the fixed asset cost account used by the general ledger',
    up: (db) => {
      db.run(
        'INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active) VALUES (?, ?, ?, ?, NULL, 0, 1)',
        ['acc_1601', '1601', 'Fixed assets', 'ASSET']
      );
    },
  },

{
    id: '027_correct_historical_invoice_receipts',
    description: 'Correct historical invoice postings that included receipts posted separately',
    up: (db) => {
      const invoices = queryLedgerRows<{
        id: string; date: string; invoice_number: string; created_by: string;
        paid_amount: number; payment_type: string;
      }>(db, `
        SELECT si.id, si.date, si.invoice_number, si.created_by, si.paid_amount, si.payment_type
        FROM sales_invoices si
        JOIN journal_entries je ON je.reference_type = 'SALES_INVOICE' AND je.reference_id = si.id
        WHERE si.invoice_status != 'VOID'
          AND EXISTS (SELECT 1 FROM customer_payments cp WHERE cp.invoice_id = si.id)
        ORDER BY si.date, si.created_at, si.id
      `);
      const actorId = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at, id LIMIT 1')[0]?.id;
      if (!actorId && invoices.some((invoice) => !invoice.created_by)) {
        throw new Error('Cannot correct historical invoice postings without a valid user.');
      }
      for (const invoice of invoices) {
        const linkedReceipts = queryLedgerRows<{ amount: number }>(db,
          'SELECT COALESCE(SUM(amount), 0) AS amount FROM customer_payments WHERE invoice_id = ?', [invoice.id])[0]?.amount ?? 0;
        const correction = Math.round(Math.min(Number(invoice.paid_amount) || 0, Number(linkedReceipts) || 0) * 100) / 100;
        if (correction <= 0) continue;
        postLedgerEntry(db, {
          date: invoice.date,
          description: `Correct duplicated receipts on sale ${invoice.invoice_number}`,
          referenceType: 'SALES_INVOICE_RECEIPT_CORRECTION',
          referenceId: invoice.id,
          createdBy: invoice.created_by || actorId!,
          lines: [
            { accountCode: '1103', debit: correction, credit: 0 },
            { accountCode: paymentAccountCode(invoice.payment_type), debit: 0, credit: correction },
          ],
        });
      }
    },
  },

{
    id: '028_supplier_payment_allocations',
    description: 'Allocate supplier payments to purchase invoices for historical payable reporting',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
          id TEXT PRIMARY KEY,
          payment_id TEXT NOT NULL,
          purchase_invoice_id TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(payment_id, purchase_invoice_id),
          FOREIGN KEY(payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE,
          FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_invoice
          ON supplier_payment_allocations(purchase_invoice_id);
      `);
      const payments = queryLedgerRows<{ id: string; supplier_id: string; amount: number; date: string; notes: string | null }>(
        db, `SELECT id,supplier_id,amount,date,notes FROM supplier_payments ORDER BY date,created_at,id`);
      for (const payment of payments) {
        if (queryLedgerRows(db, `SELECT id FROM supplier_payment_allocations WHERE payment_id=?`, [payment.id]).length) continue;
        const invoices = queryLedgerRows<{ id: string; invoice_number: string; total_amount: number; paid_amount: number; remaining_amount: number }>(db, `
          SELECT id,invoice_number,total_amount,paid_amount,remaining_amount FROM purchase_invoices
          WHERE supplier_id=? AND date<=? ORDER BY date,created_at,id
        `, [payment.supplier_id, payment.date]);
        const noteInvoice = payment.notes
          ? invoices.find((invoice) => payment.notes!.includes(invoice.invoice_number))
          : undefined;
        const ordered = noteInvoice ? [noteInvoice, ...invoices.filter((invoice) => invoice.id !== noteInvoice.id)] : invoices;
        let unapplied = Math.round((Number(payment.amount) || 0) * 100) / 100;
        for (const invoice of ordered) {
          if (unapplied <= 0.009) break;
          const allocated = Number(queryLedgerRows<{ amount: number }>(db,
            `SELECT COALESCE(SUM(amount),0) AS amount FROM supplier_payment_allocations WHERE purchase_invoice_id=?`, [invoice.id])[0]?.amount || 0);
          const returns = Number(queryLedgerRows<{ amount: number }>(db,
            `SELECT COALESCE(SUM(remaining_to_balance),0) AS amount FROM purchase_returns WHERE original_purchase_id=? AND date<=?`, [invoice.id, payment.date])[0]?.amount || 0);
          const open = Math.max(0, Number(invoice.total_amount) - allocated - returns);
          const value = Math.round(Math.min(unapplied, open) * 100) / 100;
          if (value <= 0) continue;
          db.run(`INSERT INTO supplier_payment_allocations (id,payment_id,purchase_invoice_id,amount) VALUES (?,?,?,?)`,
            [`spa_${uuidv4().substring(0, 8)}`, payment.id, invoice.id, value]);
          if (!noteInvoice) {
            const paid = Math.round((Number(invoice.paid_amount) + value) * 100) / 100;
            const remaining = Math.max(0, Math.round((Number(invoice.remaining_amount) - value) * 100) / 100);
            db.run(`UPDATE purchase_invoices SET paid_amount=?,remaining_amount=?,payment_status=? WHERE id=?`,
              [paid, remaining, remaining <= 0 ? 'PAID' : 'PARTIAL', invoice.id]);
            invoice.paid_amount = paid;
            invoice.remaining_amount = remaining;
          }
          unapplied = Math.round((unapplied - value) * 100) / 100;
        }
      }
    },
  },

{
    id: '029_fixed_asset_acquisition_ledger',
    description: 'Backfill fixed asset acquisition cost into the general ledger',
    up: (db) => {
      const assets = queryLedgerRows<{ id: string; code: string; name: string; purchase_date: string; purchase_cost: number }>(
        db, 'SELECT id,code,name,purchase_date,purchase_cost FROM fixed_assets ORDER BY purchase_date,id');
      if (assets.length === 0) return;
      const actorId = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0]?.id;
      if (!actorId) throw new Error('Cannot backfill fixed assets without a valid user.');
      for (const asset of assets) {
        if (queryLedgerRows<{ id: string }>(db, `SELECT id FROM journal_entries WHERE reference_type='ASSET_ACQUISITION' AND reference_id=?`, [asset.id]).length) continue;
        const cost = Math.round((Number(asset.purchase_cost) || 0) * 100) / 100;
        if (cost <= 0) continue;
        postLedgerEntry(db, {
          date: asset.purchase_date,
          description: `Historical fixed asset acquisition ${asset.code}: ${asset.name}`,
          referenceType: 'ASSET_ACQUISITION', referenceId: asset.id, createdBy: actorId,
          lines: [
            { accountCode: '1601', debit: cost, credit: 0 },
            { accountCode: '3102', debit: 0, credit: cost },
          ],
        });
      }
    },
  }
];
