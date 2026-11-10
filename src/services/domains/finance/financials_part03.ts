import { fromMinorUnits, round2, toMinorUnits } from './financials_part01';
import type { PaymentStatus, SaleTotalsInput } from './financials_part02';

export interface SaleTotalsResult {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  totalCost: number;
  grossProfit: number;
}

export function computeSaleTotals(input: SaleTotalsInput): SaleTotalsResult {
  const subtotalMinor = input.lines.reduce((sum, line) => sum + toMinorUnits(line.lineTotal), 0);
  const subtotal = fromMinorUnits(subtotalMinor);
  const discountMinor = toMinorUnits(Math.max(0, input.discountAmount || 0));
  const discountAmount = fromMinorUnits(discountMinor);
  const taxMinor = toMinorUnits(Math.max(0, input.taxAmount || 0));
  const taxAmount = fromMinorUnits(taxMinor);
  const shippingMinor = toMinorUnits(Math.max(0, input.shippingCost || 0));
  const shippingCost = fromMinorUnits(shippingMinor);
  const totalMinor = subtotalMinor - discountMinor + taxMinor + shippingMinor;
  const totalAmount = fromMinorUnits(totalMinor);
  const paidMinor = toMinorUnits(Math.max(0, input.paidAmount || 0));
  const paidAmount = fromMinorUnits(paidMinor);
  const remainingAmount = fromMinorUnits(Math.max(0, totalMinor - paidMinor));
  const paymentStatus: PaymentStatus =
    remainingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
  const totalCostMinor = input.lines.reduce((sum, line) => sum + toMinorUnits(line.lineCost), 0);
  const totalCost = fromMinorUnits(totalCostMinor);
  const grossProfit = fromMinorUnits(subtotalMinor - discountMinor - totalCostMinor);
  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingCost,
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus,
    totalCost,
    grossProfit,
  };
}

/**
 * Weighted-average cost (brief §33). New unit cost =
 * (prevQty*prevCost + addQty*addCost) / (prevQty + addQty).
 * FIFO is represented by the same call but is not yet lot-tracked (see roadmap).
 */
export function computeWeightedAverageCost(
  prevQty: number,
  prevCost: number,
  addQty: number,
  addCost: number
): number {
  const totalQty = (prevQty || 0) + (addQty || 0);
  if (totalQty <= 0) return round2(addCost);
  const newCost = (prevQty * prevCost + addQty * addCost) / totalQty;
  return round2(newCost);
}

export interface ReturnImpactInput {
  invoiceTotal: number;
  invoicePaid: number;
  returnTotal: number;
  refundCash: boolean;
}
