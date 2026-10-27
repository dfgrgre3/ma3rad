import type { Database } from 'sql.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  paymentAccountCode, postLedgerEntry, queryLedgerRows,
  type LedgerPostingLine,
} from '../ledger';
import { localDateString } from '../../utils/date';
import {
  DEFAULT_SETTINGS, DEFAULT_BRANCH_ID, EXTENDED_SETTINGS_KEYS,
  tableExists, columnExists, addColumn, backfillReturnLedgerEntries,
  type Migration,
} from '../migrationSupport';

type SalesLedgerRow = {
  id: string; date: string; invoice_number: string; subtotal: number; discount_amount: number;
  tax_amount: number; shipping_cost: number; paid_amount: number; remaining_amount: number;
  payment_type: string; total_cost: number; created_by: string; invoice_status: string;
};

type PurchaseLedgerRow = {
  id: string; date: string; invoice_number: string; total_amount: number; tax_amount: number; created_by: string;
};

type PaymentLedgerRow = {
  id: string; date: string; receipt_number: string; amount: number; payment_type: string; performed_by: string;
};

type ExpenseLedgerRow = {
  id: string; date: string; description: string; amount: number; payment_type: string; performed_by: string;
};

function ensureLedgerAccounts(db: Database): void {
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
}

function getLedgerActorId(db: Database): string | undefined {
  const actorId = queryLedgerRows<{ id: string }>(
    db,
    'SELECT id FROM users ORDER BY created_at, id LIMIT 1'
  )[0]?.id;
  if (actorId) return actorId;

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
  if (Number(transactionCount) > 0) {
    throw new Error('Cannot backfill the general ledger without a valid user.');
  }
  return undefined;
}

function appendDebitIfPositive(lines: LedgerPostingLine[], accountCode: string, value: number): void {
  const amount = Number(value);
  if (amount > 0) lines.push({ accountCode, debit: amount, credit: 0 });
}

function appendCreditIfPositive(lines: LedgerPostingLine[], accountCode: string, value: number): void {
  const amount = Number(value);
  if (amount > 0) lines.push({ accountCode, debit: 0, credit: amount });
}

function getSaleLedgerLines(sale: SalesLedgerRow): LedgerPostingLine[] {
  const lines: LedgerPostingLine[] = [];
  if (Number(sale.paid_amount) > 0) {
    appendDebitIfPositive(lines, paymentAccountCode(sale.payment_type), sale.paid_amount);
  }
  appendDebitIfPositive(lines, '1103', sale.remaining_amount);
  lines.push({
    accountCode: '4101',
    debit: 0,
    credit: Number(sale.subtotal) - Number(sale.discount_amount || 0),
  });
  appendCreditIfPositive(lines, '4102', sale.shipping_cost);
  appendCreditIfPositive(lines, '2102', sale.tax_amount);
  appendDebitIfPositive(lines, '5101', sale.total_cost);
  appendCreditIfPositive(lines, '1104', sale.total_cost);
  return lines;
}

function backfillSalesLedgerEntries(db: Database, actorId: string): void {
  const sales = queryLedgerRows<SalesLedgerRow>(
    db,
    `SELECT id, date, invoice_number, subtotal, discount_amount, tax_amount, shipping_cost,
            paid_amount, remaining_amount, payment_type, total_cost, created_by, invoice_status
     FROM sales_invoices WHERE invoice_status != 'VOID' ORDER BY date, created_at, id`
  );
  for (const sale of sales) {
    postLedgerEntry(db, {
      date: sale.date,
      description: `Sale ${sale.invoice_number}`,
      referenceType: 'SALES_INVOICE',
      referenceId: sale.id,
      createdBy: sale.created_by || actorId,
      lines: getSaleLedgerLines(sale),
    });
  }
}

function getPurchaseLedgerLines(
  purchase: PurchaseLedgerRow,
  itemCost: number
): LedgerPostingLine[] {
  const adjustment = Number(purchase.total_amount) - Number(itemCost) - Number(purchase.tax_amount || 0);
  const lines: LedgerPostingLine[] = [];
  appendDebitIfPositive(lines, '1104', itemCost);
  appendDebitIfPositive(lines, '1201', purchase.tax_amount);
  if (adjustment > 0.009) {
    lines.push({ accountCode: '5201', debit: adjustment, credit: 0 });
  } else if (adjustment < -0.009) {
    lines.push({ accountCode: '5201', debit: 0, credit: -adjustment });
  }
  lines.push({ accountCode: '2101', debit: 0, credit: Number(purchase.total_amount) });
  return lines;
}

function backfillPurchaseLedgerEntries(db: Database, actorId: string): void {
  const purchases = queryLedgerRows<PurchaseLedgerRow>(
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
    postLedgerEntry(db, {
      date: purchase.date,
      description: `Purchase ${purchase.invoice_number}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: purchase.id,
      createdBy: purchase.created_by || actorId,
      lines: getPurchaseLedgerLines(purchase, itemCost),
    });
  }
}

function backfillCustomerPayments(db: Database, actorId: string): void {
  const payments = queryLedgerRows<PaymentLedgerRow>(
    db,
    'SELECT id, date, receipt_number, amount, payment_type, performed_by FROM customer_payments ORDER BY date, created_at, id'
  );
  for (const payment of payments) {
    const amount = Number(payment.amount);
    postLedgerEntry(db, {
      date: payment.date,
      description: `Customer receipt ${payment.receipt_number}`,
      referenceType: 'CUSTOMER_PAYMENT',
      referenceId: payment.id,
      createdBy: payment.performed_by || actorId,
      lines: [
        { accountCode: paymentAccountCode(payment.payment_type), debit: amount, credit: 0 },
        { accountCode: '1103', debit: 0, credit: amount },
      ],
    });
  }
}

function backfillSupplierPayments(db: Database, actorId: string): void {
  const payments = queryLedgerRows<PaymentLedgerRow>(
    db,
    'SELECT id, date, receipt_number, amount, payment_type, performed_by FROM supplier_payments ORDER BY date, created_at, id'
  );
  for (const payment of payments) {
    const amount = Number(payment.amount);
    postLedgerEntry(db, {
      date: payment.date,
      description: `Supplier payment ${payment.receipt_number}`,
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: payment.id,
      createdBy: payment.performed_by || actorId,
      lines: [
        { accountCode: '2101', debit: amount, credit: 0 },
        { accountCode: paymentAccountCode(payment.payment_type), debit: 0, credit: amount },
      ],
    });
  }
}

function backfillExpenses(db: Database, actorId: string): void {
  const expenses = queryLedgerRows<ExpenseLedgerRow>(
    db,
    'SELECT id, date, description, amount, payment_type, performed_by FROM expenses ORDER BY date, created_at, id'
  );
  for (const expense of expenses) {
    const amount = Number(expense.amount);
    postLedgerEntry(db, {
      date: expense.date,
      description: expense.description,
      referenceType: 'EXPENSE',
      referenceId: expense.id,
      createdBy: expense.performed_by || actorId,
      lines: [
        { accountCode: '5201', debit: amount, credit: 0 },
        { accountCode: paymentAccountCode(expense.payment_type), debit: 0, credit: amount },
      ],
    });
  }
}

export const MIGRATION_PART_05: Migration[] = [
{
    id: '024_unified_accounting_ledger',
    description: 'Add ledger clearing accounts and backfill balanced entries from existing transactions',
    up: (db) => {
      ensureLedgerAccounts(db);
      const actorId = getLedgerActorId(db);
      if (!actorId) return;

      backfillSalesLedgerEntries(db, actorId);
      backfillPurchaseLedgerEntries(db, actorId);
      backfillCustomerPayments(db, actorId);
      backfillSupplierPayments(db, actorId);
      backfillExpenses(db, actorId);
      backfillReturnLedgerEntries(db);
    },
  }
];
