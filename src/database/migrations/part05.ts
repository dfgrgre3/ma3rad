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

export const MIGRATION_PART_05: Migration[] = [
{
    id: '024_unified_accounting_ledger',
    description: 'Add ledger clearing accounts and backfill balanced entries from existing transactions',
    up: (db) => {
      const accounts: Array<[string, string, string, string]> = [
        ['acc_1201', '1201', 'Input VAT', 'ASSET'],
        ['acc_1106', '1106', 'Mixed payment clearing', 'ASSET'],
        ['acc_1601', '1601', 'Fixed assets', 'ASSET'],
      ];
      for (const [id, code, name, type] of accounts) {
        db.run(
          'INSERT OR IGNORE INTO chart_of_accounts (id, code, name, type, parent_code, balance, is_active) VALUES (?, ?, ?, ?, NULL, 0, 1)',
          [id, code, name, type]
        );
      }

      const actorId = queryLedgerRows<{ id: string }>(db, 'SELECT id FROM users ORDER BY created_at, id LIMIT 1')[0]?.id;
      if (!actorId) {
        const transactionCount = queryLedgerRows<{ count: number }>(db, `
          SELECT
            (SELECT COUNT(*) FROM sales_invoices WHERE invoice_status != 'VOID') +
            (SELECT COUNT(*) FROM purchase_invoices) +
            (SELECT COUNT(*) FROM customer_payments) +
            (SELECT COUNT(*) FROM supplier_payments) +
            (SELECT COUNT(*) FROM expenses) +
            (SELECT COUNT(*) FROM sales_returns) +
            (SELECT COUNT(*) FROM purchase_returns) AS count
        `)[0]?.count ?? 0;
        if (Number(transactionCount) > 0) throw new Error('Cannot backfill the general ledger without a valid user.');
        return;
      }

      const sales = queryLedgerRows<{
        id: string; date: string; invoice_number: string; subtotal: number; discount_amount: number;
        tax_amount: number; shipping_cost: number; paid_amount: number; remaining_amount: number;
        payment_type: string; total_cost: number; created_by: string; invoice_status: string;
      }>(
        db,
        `SELECT id, date, invoice_number, subtotal, discount_amount, tax_amount, shipping_cost,
                paid_amount, remaining_amount, payment_type, total_cost, created_by, invoice_status
         FROM sales_invoices WHERE invoice_status != 'VOID' ORDER BY date, created_at, id`
      );
      for (const sale of sales) {
        const lines = [
          ...(Number(sale.paid_amount) > 0 ? [{
            accountCode: paymentAccountCode(sale.payment_type),
            debit: Number(sale.paid_amount),
            credit: 0,
          }] : []),
          ...(Number(sale.remaining_amount) > 0 ? [{
            accountCode: '1103',
            debit: Number(sale.remaining_amount),
            credit: 0,
          }] : []),
          {
            accountCode: '4101',
            debit: 0,
            credit: Number(sale.subtotal) - Number(sale.discount_amount || 0),
          },
          ...(Number(sale.shipping_cost) > 0 ? [{
            accountCode: '4102',
            debit: 0,
            credit: Number(sale.shipping_cost),
          }] : []),
          ...(Number(sale.tax_amount) > 0 ? [{
            accountCode: '2102',
            debit: 0,
            credit: Number(sale.tax_amount),
          }] : []),
          ...(Number(sale.total_cost) > 0 ? [
            { accountCode: '5101', debit: Number(sale.total_cost), credit: 0 },
            { accountCode: '1104', debit: 0, credit: Number(sale.total_cost) },
          ] : []),
        ];
        postLedgerEntry(db, {
          date: sale.date,
          description: `Sale ${sale.invoice_number}`,
          referenceType: 'SALES_INVOICE',
          referenceId: sale.id,
          createdBy: sale.created_by || actorId,
          lines,
        });
      }

      const purchases = queryLedgerRows<{
        id: string; date: string; invoice_number: string; total_amount: number; tax_amount: number; created_by: string;
      }>(
        db,
        `SELECT id, date, invoice_number, total_amount, tax_amount, created_by
         FROM purchase_invoices ORDER BY date, created_at, id`
      );
      for (const purchase of purchases) {
        const itemCost = queryLedgerRows<{ total_cost: number }>(
          db,
          'SELECT COALESCE(SUM(total_cost), 0) AS total_cost FROM purchase_invoice_items WHERE purchase_id = ?',
          [purchase.id]
        )[0]?.total_cost || 0;
        const adjustment = Number(purchase.total_amount) - Number(itemCost) - Number(purchase.tax_amount || 0);
        const lines = [
          ...(Number(itemCost) > 0 ? [{ accountCode: '1104', debit: Number(itemCost), credit: 0 }] : []),
          ...(Number(purchase.tax_amount) > 0 ? [{ accountCode: '1201', debit: Number(purchase.tax_amount), credit: 0 }] : []),
          ...(adjustment > 0.009
            ? [{ accountCode: '5201', debit: adjustment, credit: 0 }]
            : adjustment < -0.009
              ? [{ accountCode: '5201', debit: 0, credit: -adjustment }]
              : []),
          { accountCode: '2101', debit: 0, credit: Number(purchase.total_amount) },
        ];
        postLedgerEntry(db, {
          date: purchase.date,
          description: `Purchase ${purchase.invoice_number}`,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: purchase.id,
          createdBy: purchase.created_by || actorId,
          lines,
        });
      }

      const customerPayments = queryLedgerRows<{
        id: string; date: string; receipt_number: string; amount: number; payment_type: string; performed_by: string;
      }>(db, 'SELECT id, date, receipt_number, amount, payment_type, performed_by FROM customer_payments ORDER BY date, created_at, id');
      for (const payment of customerPayments) {
        postLedgerEntry(db, {
          date: payment.date,
          description: `Customer receipt ${payment.receipt_number}`,
          referenceType: 'CUSTOMER_PAYMENT',
          referenceId: payment.id,
          createdBy: payment.performed_by || actorId,
          lines: [
            { accountCode: paymentAccountCode(payment.payment_type), debit: Number(payment.amount), credit: 0 },
            { accountCode: '1103', debit: 0, credit: Number(payment.amount) },
          ],
        });
      }

      const supplierPayments = queryLedgerRows<{
        id: string; date: string; receipt_number: string; amount: number; payment_type: string; performed_by: string;
      }>(db, 'SELECT id, date, receipt_number, amount, payment_type, performed_by FROM supplier_payments ORDER BY date, created_at, id');
      for (const payment of supplierPayments) {
        postLedgerEntry(db, {
          date: payment.date,
          description: `Supplier payment ${payment.receipt_number}`,
          referenceType: 'SUPPLIER_PAYMENT',
          referenceId: payment.id,
          createdBy: payment.performed_by || actorId,
          lines: [
            { accountCode: '2101', debit: Number(payment.amount), credit: 0 },
            { accountCode: paymentAccountCode(payment.payment_type), debit: 0, credit: Number(payment.amount) },
          ],
        });
      }

      const expenses = queryLedgerRows<{
        id: string; date: string; description: string; amount: number; payment_type: string; performed_by: string;
      }>(db, 'SELECT id, date, description, amount, payment_type, performed_by FROM expenses ORDER BY date, created_at, id');
      for (const expense of expenses) {
        postLedgerEntry(db, {
          date: expense.date,
          description: expense.description,
          referenceType: 'EXPENSE',
          referenceId: expense.id,
          createdBy: expense.performed_by || actorId,
          lines: [
            { accountCode: '5201', debit: Number(expense.amount), credit: 0 },
            { accountCode: paymentAccountCode(expense.payment_type), debit: 0, credit: Number(expense.amount) },
          ],
        });
      }

      backfillReturnLedgerEntries(db);
    },
  }
];
