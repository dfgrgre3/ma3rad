import { fromMinorUnits, toMinorUnits } from './financials_part01';

export function returnTaxSql(
  returnAmount: string,
  invoiceSubtotal: string,
  invoiceDiscount: string,
  invoiceTax: string
): string {
  const taxableBase = `MAX(0, COALESCE(${invoiceSubtotal}, 0) - COALESCE(${invoiceDiscount}, 0))`;
  return `CASE WHEN ${taxableBase} > 0
    THEN ROUND(COALESCE(${returnAmount}, 0) * COALESCE(${invoiceTax}, 0) / ${taxableBase}, 2)
    ELSE 0 END`;
}

export function inclusiveReturnTaxSql(
  returnAmount: string,
  invoiceSubtotal: string,
  invoiceDiscount: string,
  invoiceTax: string
): string {
  const taxableBase = `MAX(0, COALESCE(${invoiceSubtotal}, 0) - COALESCE(${invoiceDiscount}, 0))`;
  const tax = `MAX(0, COALESCE(${invoiceTax}, 0))`;
  return `CASE WHEN (${taxableBase} + ${tax}) > 0
    THEN ROUND(MAX(0, COALESCE(${returnAmount}, 0)) * ${tax} / (${taxableBase} + ${tax}), 2)
    ELSE 0 END`;
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
