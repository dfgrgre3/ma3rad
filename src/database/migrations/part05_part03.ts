import type { Database } from 'sql.js';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../repositories/ledger';
import type { PaymentLedgerRow, PurchaseLedgerRow } from './part05_part01';
import { getPurchaseLedgerLines } from './part05_part02';

export function backfillPurchaseLedgerEntries(db: Database, actorId: string): void {
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

export function backfillCustomerPayments(db: Database, actorId: string): void {
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

export function backfillSupplierPayments(db: Database, actorId: string): void {
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
