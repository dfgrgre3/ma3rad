import { round2 } from '../finance/financials';

/**
 * One policy for manual discounts wherever a sale can be created (POS, quick
 * sale, invoice service, quotation/order conversion).
 *
 * The percentage is always measured against the **gross** line subtotal
 * (before line discounts) and against manual discounts only (promotions and
 * loyalty redemption have their own approval rules). Using the net subtotal in
 * one path and the gross subtotal in another let the POS accept a discount the
 * invoice service then rejected, or vice versa.
 */
export interface ManualDiscountPolicyInput {
  /** Sum of line gross amounts, before any line discount. */
  grossSubtotal: number;
  /** Line discounts plus the manual invoice-level discount. */
  totalDiscount: number;
  /** Configured approval threshold, in percent. */
  thresholdPercent: number;
}

export interface ManualDiscountPolicyResult {
  grossSubtotal: number;
  totalDiscount: number;
  percent: number;
  thresholdPercent: number;
  requiresApproval: boolean;
}

export function evaluateManualDiscountPolicy(
  input: ManualDiscountPolicyInput
): ManualDiscountPolicyResult {
  const grossSubtotal = round2(Math.max(0, Number(input.grossSubtotal) || 0));
  const totalDiscount = round2(Math.max(0, Number(input.totalDiscount) || 0));
  const configured = Number(input.thresholdPercent);
  const thresholdPercent = Number.isFinite(configured) ? Math.max(0, configured) : 0;
  const percent = grossSubtotal > 0 ? (totalDiscount / grossSubtotal) * 100 : 0;
  return {
    grossSubtotal,
    totalDiscount,
    percent,
    thresholdPercent,
    requiresApproval: totalDiscount > 0 && percent > thresholdPercent,
  };
}
