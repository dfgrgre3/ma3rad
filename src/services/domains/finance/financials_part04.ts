import { fromMinorUnits, round2, toMinorUnits } from './financials_part01';
import type { ReturnImpactInput } from './financials_part03';

export interface ReturnImpactResult {
  paidRatio: number; // fraction of the original invoice the customer actually paid
  cashRefund: number; // cash actually handed back (never exceeds what they paid)
  balanceDelta: number; // amount SUBTRACTED from customer current_balance (credit memo minus cash settlement)
}

/**
 * Correct sales-return accounting (brief §68/§220/§223).
 *
 * A sale increases customer.current_balance by the UNPAID remainder only.
 * A return is a credit memo of `returnTotal` that reduces the customer's debt;
 * if cash is refunded, only the proportion the customer actually PAID is disbursed,
 * and that cash disbursement settles the matching portion of the credit memo.
 *
 * Scenarios (starting balance B):
 *  - Fully paid (paid==total): balance stays B, cash out = returnTotal.
 *  - Credit sale (paid==0):     balance becomes B - returnTotal, cash out = 0.
 *  - Partial (paid==0.5*total):balance becomes B - 0.5*returnTotal, cash out = 0.5*returnTotal.
 */
export function computeReturnImpact(input: ReturnImpactInput): ReturnImpactResult {
  const invoiceTotal = round2(input.invoiceTotal || 0);
  const invoicePaid = round2(input.invoicePaid || 0);
  const returnTotal = round2(Math.max(0, input.returnTotal || 0));
  const paidRatio = invoiceTotal > 0 ? Math.min(1, invoicePaid / invoiceTotal) : 0;
  const returnMinor = toMinorUnits(returnTotal);
  const cashRefund = input.refundCash ? fromMinorUnits(toMinorUnits(returnTotal * paidRatio)) : 0;
  const balanceDelta = fromMinorUnits(returnMinor - toMinorUnits(cashRefund));
  return { paidRatio, cashRefund, balanceDelta };
}
