import { useMemo } from 'react';
import type { CashShift } from '../../types';
import { getUomLabel } from '../../utils/products/uom';
import { round2, type CartItem } from '../../types/pos';

interface UsePosTotalsOptions {
  cart: CartItem[];
  discountAmount: number;
  promotionDiscount: number;
  loyaltyDiscount: number;
  taxPercentage: number;
  shippingCost: number;
  extraFees?: number;
  paidAmount: number;
  activeShift: CashShift | null;
}

export const usePosTotals = ({
  cart,
  discountAmount,
  promotionDiscount,
  loyaltyDiscount,
  taxPercentage,
  shippingCost,
  extraFees = 0,
  paidAmount,
  activeShift,
}: UsePosTotalsOptions) => {
  const lineSubtotal = round2(cart.reduce((sum, item) => sum + item.quantityM2 * item.unitPrice, 0));
  const lineDiscountTotal = round2(cart.reduce((sum, item) => sum + item.discountAmount, 0));
  const subtotal = round2(lineSubtotal - lineDiscountTotal);
  const taxableBase = round2(Math.max(0, subtotal - discountAmount - promotionDiscount - loyaltyDiscount));
  const taxAmount = round2(taxableBase * (taxPercentage || 0) / 100);
  const totalAmount = round2(Math.max(0, taxableBase + taxAmount + (shippingCost || 0) + (extraFees || 0)));
  const remainingAmount = round2(Math.max(0, totalAmount - (paidAmount || 0)));
  const changeDue = round2(Math.max(0, (paidAmount || 0) - totalAmount));
  const expectedClosingCash = round2(
    (activeShift?.openingBalance || 0) +
    (activeShift?.totalSalesCash || 0) +
    (activeShift?.totalCustomerPayments || 0) -
    (activeShift?.totalSupplierPayments || 0) -
    (activeShift?.totalExpenses || 0) -
    (activeShift?.totalRefunds || 0)
  );
  const cartQuantitySummary = useMemo(() => {
    const ceramicCart = cart.filter((item) => item.product.productType !== 'GENERAL');
    const totalItems = round2(ceramicCart.reduce((sum, item) => sum + item.quantityM2, 0));
    const totalBoxes = round2(ceramicCart.reduce((sum, item) => sum + item.boxesCount, 0));
    const generalQuantitiesByUnit = new Map<string, number>();
    cart.filter((item) => item.product.productType === 'GENERAL').forEach((item) => {
      const unit = getUomLabel(item.soldBy, item.product);
      generalQuantitiesByUnit.set(unit, (generalQuantitiesByUnit.get(unit) || 0) + item.soldQuantity);
    });
    return [
      totalItems > 0 ? `${totalItems} م² / ${totalBoxes} كرتونة` : '',
      ...[...generalQuantitiesByUnit].map(([unit, quantity]) => `${round2(quantity)} ${unit}`),
    ].filter(Boolean).join(' · ');
  }, [cart]);

  return {
    lineSubtotal, lineDiscountTotal, subtotal, taxableBase, taxAmount, totalAmount,
    remainingAmount, changeDue, expectedClosingCash, cartQuantitySummary,
  };
};
