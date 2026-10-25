// Pure, dependency-free financial & ceramic domain calculations.
// Centralized here so the exact same logic is executed by services AND tested by node --test.
// Money values cross service boundaries in major currency units. Convert to integer
// minor units for each calculation; persistence migration remains a separate concern.

export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
}

export function fromMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount) / 100;
}

export function round2(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount));
}

export interface SaleLineInput {
  quantity: number; // in the sale's base unit (M2 here)
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
}

export interface SaleLineResult {
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  lineCost: number;
  lineProfit: number;
}

export function computeSaleLine(input: SaleLineInput): SaleLineResult {
  const qty = Math.max(0, input.quantity || 0);
  const subtotal = fromMinorUnits(toMinorUnits(qty * (input.unitPrice || 0)));
  const discount = fromMinorUnits(toMinorUnits(Math.max(0, input.discountAmount || 0)));
  const total = fromMinorUnits(Math.max(0, toMinorUnits(subtotal) - toMinorUnits(discount)));
  const cost = fromMinorUnits(toMinorUnits(qty * (input.unitCost || 0)));
  const profit = fromMinorUnits(toMinorUnits(total) - toMinorUnits(cost));
  return {
    lineSubtotal: subtotal,
    lineDiscount: discount,
    lineTotal: total,
    lineCost: cost,
    lineProfit: profit,
  };
}

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface SaleTotalsInput {
  lines: Pick<SaleLineResult, 'lineTotal' | 'lineCost'>[];
  discountAmount?: number;
  taxAmount?: number;
  shippingCost?: number;
  paidAmount: number;
}

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
