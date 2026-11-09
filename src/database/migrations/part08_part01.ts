import type { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { queryLedgerRows } from '../repositories/ledger';

export type CustomerPayment = {
  id: string;
  customer_id: string;
  invoice_id: string | null;
  amount: number;
  date: string;
};

export type CustomerInvoice = {
  id: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
};

export function allocateLinkedPayment(db: Database, payment: CustomerPayment) {
  if (!queryLedgerRows(db, 'SELECT id FROM sales_invoices WHERE id=?', [payment.invoice_id]).length) return;
  db.run(`INSERT OR IGNORE INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
    [`cpa_${uuidv4().substring(0, 8)}`, payment.id, payment.invoice_id, payment.amount]);
}

export function allocateUnlinkedPayment(db: Database, payment: CustomerPayment) {
  let unapplied = Math.round((Number(payment.amount) || 0) * 100) / 100;
  const invoices = queryLedgerRows<CustomerInvoice>(db, `
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

export function allocateCustomerPayment(db: Database, payment: CustomerPayment) {
  if (payment.invoice_id) {
    allocateLinkedPayment(db, payment);
    return;
  }
  allocateUnlinkedPayment(db, payment);
}
