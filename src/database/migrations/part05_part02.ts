import type { Database } from 'sql.js';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows, type LedgerPostingLine } from '../repositories/ledger';
import { appendCreditIfPositive, appendDebitIfPositive } from './part05_part01';
import type { PurchaseLedgerRow, SalesLedgerRow } from './part05_part01';

export function getSaleLedgerLines(sale: SalesLedgerRow): LedgerPostingLine[] {
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

export function backfillSalesLedgerEntries(db: Database, actorId: string): void {
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

export function getPurchaseLedgerLines(
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
