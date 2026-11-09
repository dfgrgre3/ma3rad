import type { Database } from 'sql.js';
import { queryLedgerRows, type LedgerPostingLine } from '../repositories/ledger';

export type SalesLedgerRow = {
  id: string; date: string; invoice_number: string; subtotal: number; discount_amount: number;
  tax_amount: number; shipping_cost: number; paid_amount: number; remaining_amount: number;
  payment_type: string; total_cost: number; created_by: string; invoice_status: string;
};

export type PurchaseLedgerRow = {
  id: string; date: string; invoice_number: string; total_amount: number; tax_amount: number; created_by: string;
};

export type PaymentLedgerRow = {
  id: string; date: string; receipt_number: string; amount: number; payment_type: string; performed_by: string;
};

export type ExpenseLedgerRow = {
  id: string; date: string; description: string; amount: number; payment_type: string; performed_by: string;
};

export function ensureLedgerAccounts(db: Database): void {
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

export function getLedgerActorId(db: Database): string | undefined {
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

export function appendDebitIfPositive(lines: LedgerPostingLine[], accountCode: string, value: number): void {
  const amount = Number(value);
  if (amount > 0) lines.push({ accountCode, debit: amount, credit: 0 });
}

export function appendCreditIfPositive(lines: LedgerPostingLine[], accountCode: string, value: number): void {
  const amount = Number(value);
  if (amount > 0) lines.push({ accountCode, debit: 0, credit: amount });
}
