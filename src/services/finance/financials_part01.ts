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

export function calculateReturnTax(
  returnTaxableAmount: number,
  invoiceTax: number,
  invoiceTaxableBase: number
): number {
  return invoiceTaxableBase > 0
    ? round2(returnTaxableAmount * invoiceTax / invoiceTaxableBase)
    : 0;
}

export function calculateInclusiveReturnTax(
  returnAmountIncludingTax: number,
  invoiceTax: number,
  invoiceTaxableBase: number
): number {
  const taxableBase = Math.max(0, invoiceTaxableBase);
  const tax = Math.max(0, invoiceTax);
  return taxableBase + tax > 0
    ? round2(Math.max(0, returnAmountIncludingTax) * tax / (taxableBase + tax))
    : 0;
}

export function calculateDiscountedReturnAmount(
  quantity: number,
  soldLines: { quantity: number; totalPrice?: number | null; unitPrice: number; discountAmount: number }[],
  invoiceSubtotal: number,
  invoiceDiscount: number
): number {
  const soldQuantity = soldLines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
  if (soldQuantity <= 0) return 0;
  const subtotal = Math.max(0, Number(invoiceSubtotal) || 0);
  const discount = Math.max(0, Number(invoiceDiscount) || 0);
  const netAmount = soldLines.reduce((sum, line) => {
    const lineQuantity = Math.max(0, Number(line.quantity) || 0);
    if (lineQuantity === 0) return sum;
    const lineAmount = line.totalPrice != null && Number.isFinite(Number(line.totalPrice))
      ? Number(line.totalPrice)
      : Math.max(0, (Number(line.unitPrice) || 0) * lineQuantity - (Number(line.discountAmount) || 0));
    const invoiceDiscountShare = subtotal > 0 ? discount * lineAmount / subtotal : 0;
    return sum + Math.max(0, lineAmount - invoiceDiscountShare);
  }, 0);
  return round2(Math.max(0, Number(quantity) || 0) * netAmount / soldQuantity);
}
