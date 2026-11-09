import type { Database } from 'sql.js';
import { paymentAccountCode, postLedgerEntry, queryLedgerRows } from '../repositories/ledger';
import type { SalesReturnLedgerRow } from './support_part01';
import { postPurchaseReturnLedgerEntry } from './support_part03';

export function postSalesReturnLedgerEntry(
  db: Database,
  returned: SalesReturnLedgerRow,
  actorId: string
): void {
  const returnedCost = queryLedgerRows<{ total_cost: number }>(
    db,
    'SELECT COALESCE(SUM(quantity_m2 * unit_cost), 0) AS total_cost FROM sales_return_items WHERE return_id = ?',
    [returned.id]
  )[0]?.total_cost || 0;
  const taxableBase = Math.max(0, Number(returned.invoice_subtotal) - Number(returned.invoice_discount));
  const taxReduction = taxableBase > 0
    ? Math.round(Number(returned.total_amount) * Number(returned.invoice_tax || 0) / taxableBase * 100) / 100
    : 0;
  const returnCredits = Number(returned.refunded_amount) + Number(returned.remaining_to_balance);
  const creditsIncludeTax = returnCredits >= Number(returned.total_amount) + taxReduction - 0.01;
  postLedgerEntry(db, {
    date: returned.date,
    description: `Sales return ${returned.return_number}`,
    referenceType: 'SALES_RETURN',
    referenceId: returned.id,
    createdBy: returned.created_by || actorId,
    lines: [
      { accountCode: '4101', debit: creditsIncludeTax ? Number(returned.total_amount) : Number(returned.total_amount) - taxReduction, credit: 0 },
      ...(taxReduction > 0 ? [{ accountCode: '2102', debit: taxReduction, credit: 0 }] : []),
      ...(Number(returned.remaining_to_balance) > 0 ? [{
        accountCode: '1103',
        debit: 0,
        credit: Number(returned.remaining_to_balance),
      }] : []),
      ...(Number(returned.refunded_amount) > 0 ? [{
        accountCode: paymentAccountCode(returned.refund_method || 'CASH'),
        debit: 0,
        credit: Number(returned.refunded_amount),
      }] : []),
      ...(Number(returnedCost) > 0 ? [
        { accountCode: '1104', debit: Number(returnedCost), credit: 0 },
        { accountCode: '5101', debit: 0, credit: Number(returnedCost) },
      ] : []),
    ],
  });
}

export type PurchaseReturnLedgerRow = {
  id: string; date: string; return_number: string; total_amount: number; refunded_amount: number;
  remaining_to_balance: number; created_by: string;
};

export function backfillPurchaseReturnLedgerEntries(db: Database, actorId: string): void {
  const purchaseReturns = queryLedgerRows<PurchaseReturnLedgerRow>(
    db,
    'SELECT id, date, return_number, total_amount, refunded_amount, remaining_to_balance, created_by FROM purchase_returns ORDER BY date, created_at, id'
  );
  for (const returned of purchaseReturns) {
    postPurchaseReturnLedgerEntry(db, returned, actorId);
  }
}
