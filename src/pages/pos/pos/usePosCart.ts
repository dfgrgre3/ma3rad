import { useState, useCallback, useMemo } from 'react';
import type { Product, Customer } from '../../../types';
import { PricingService } from '../../../services/PricingService';
import {
  convertQuantity, fromBaseQuantity, getSellableUnits,
  isWholeUnit, basePriceFromUnitPrice, toBaseQuantity,
} from '../../../utils/uom';
import { CeramicMath } from '../../../utils/ceramicMath';
import { round2, type CartItem, type PosUnit, type HeldOrder } from '../../../components/pos/types';

export function usePosCart(
  stockOf: (id: string) => number,
  selectedCustomer: Customer | null,
  selectedWarehouseId: string,
  settings: { enableNegativeStock?: boolean; defaultTaxPercentage?: number } | null,
  notify: (msg: string, type: string) => void,
  can: (perm: string) => boolean,
) {
  const pricingService = useMemo(() => new PricingService(), []);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState('');

  const makeCartItem = useCallback((product: Product, quantityM2: number): CartItem => {
    const isGeneral = product.productType === 'GENERAL';
    const mpb = product.metersPerBox || 1.44;
    const ppb = product.piecesPerBox || 4;
    const boxes = isGeneral ? (product.baseUnit === 'BOX' ? quantityM2 : 0) : CeramicMath.calculateBoxes(quantityM2, mpb, true);
    let unitPrice = product.sellingPriceM2;
    try { unitPrice = pricingService.getEffectivePrice(product.id, selectedCustomer?.id, quantityM2).priceM2; } catch { }
    const sellable = getSellableUnits(product);
    const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
    const soldBy = sellable.includes(preferred) ? preferred : sellable[0];
    return {
      product, soldBy,
      soldQuantity: round2(fromBaseQuantity(quantityM2, soldBy, product)),
      quantityM2: round2(quantityM2), boxesCount: boxes,
      piecesCount: isGeneral ? (product.baseUnit === 'PIECE' ? quantityM2 : 0) : CeramicMath.calculatePiecesFromBoxes(boxes, ppb),
      unitPrice, discountAmount: 0, availableStockM2: stockOf(product.id),
    };
  }, [pricingService, selectedCustomer, stockOf]);

  const addToCart = useCallback((product: Product, requestedM2?: number) => {
    setCart((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      const sellable = getSellableUnits(product);
      const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
      const stepM2 = requestedM2 ?? (product.productType === 'GENERAL'
        ? toBaseQuantity(1, preferred, product).quantity : (product.metersPerBox || 1.44));
      if (idx > -1) {
        const updated = [...prev];
        const cur = { ...updated[idx] };
        const newM2 = round2(cur.quantityM2 + stepM2);
        cur.quantityM2 = newM2;
        cur.soldQuantity = round2(fromBaseQuantity(newM2, cur.soldBy, cur.product));
        cur.boxesCount = cur.product.productType === 'GENERAL'
          ? (cur.product.baseUnit === 'BOX' ? newM2 : 0)
          : CeramicMath.calculateBoxes(newM2, cur.product.metersPerBox || 1.44, true);
        cur.piecesCount = CeramicMath.calculatePiecesFromBoxes(cur.boxesCount, cur.product.piecesPerBox || 4);
        try { cur.unitPrice = pricingService.getEffectivePrice(cur.product.id, selectedCustomer?.id, newM2).priceM2; } catch { }
        updated[idx] = cur; return updated;
      }
      return [...prev, makeCartItem(product, stepM2)];
    });
  }, [makeCartItem, pricingService, selectedCustomer]);

  const removeFromCart = useCallback((index: number) => setCart((prev) => prev.filter((_, i) => i !== index)), []);
  const clearCart = useCallback(() => {
    if (cart.length === 0) return;
    if (!window.confirm('هل تريد إفراغ سلة البيع بالكامل؟')) return;
    setCart([]); setDiscountAmount(0); setShippingCost(0); setNotes(''); setPaidAmount(0);
  }, [cart.length]);

  const updateCartQuantity = useCallback((index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (value === 0) { removeFromCart(index); return; }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      let baseQty: number;
      try { baseQty = round2(convertQuantity(value, item.soldBy, item.product.baseUnit || 'M2', item.product)); } catch { return prev; }
      item.soldQuantity = round2(value); item.quantityM2 = baseQty;
      const inBox = String(item.soldBy).toUpperCase() === 'BOX';
      const inPiece = String(item.soldBy).toUpperCase() === 'PIECE';
      if (item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE') {
        item.boxesCount = inBox ? value : item.product.baseUnit === 'BOX' ? baseQty : 0;
        item.piecesCount = inPiece ? value : item.product.baseUnit === 'PIECE' ? baseQty : 0;
      } else {
        item.boxesCount = inBox ? round2(value) : CeramicMath.calculateBoxes(baseQty, item.product.metersPerBox || 1.44, true);
        item.piecesCount = inPiece ? Math.round(value) : CeramicMath.calculatePiecesFromBoxes(item.boxesCount, item.product.piecesPerBox || 4);
      }
      updated[index] = item; return updated;
    });
  }, [removeFromCart]);

  const stepCartQuantity = useCallback((index: number, direction: 1 | -1) => {
    const item = cart[index];
    if (!item) return;
    const step = isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;
    const next = round2(item.soldQuantity + direction * step);
    if (next <= 0) { removeFromCart(index); return; }
    updateCartQuantity(index, next);
  }, [cart, removeFromCart, updateCartQuantity]);

  const updateCartUnit = useCallback((index: number, unit: PosUnit) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (item.soldBy === unit) return prev;
      try { item.soldBy = unit; item.soldQuantity = round2(fromBaseQuantity(item.quantityM2, unit, item.product)); } catch { return prev; }
      updated[index] = item; return updated;
    });
  }, []);

  const updateCartPrice = useCallback((index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (!can('sales.approve')) { notify('لا تملك صلاحية تعديل سعر الصنف', 'error'); return; }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.unitPrice = round2(basePriceFromUnitPrice(value, item.soldBy, item.product));
      updated[index] = item; return updated;
    });
  }, [can, notify]);

  const updateCartLineDiscount = useCallback((index: number, value: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.discountAmount = Math.min(item.quantityM2 * item.unitPrice, Math.max(0, round2(Number.isFinite(value) ? value : 0)));
      updated[index] = item; return updated;
    });
  }, []);

  const applyCustomerPricing = useCallback((customer: Customer | null) => {
    setCart((prev) => prev.map((item) => {
      try { return { ...item, unitPrice: pricingService.getEffectivePrice(item.product.id, customer?.id, item.quantityM2).priceM2 }; }
      catch { return item; }
    }));
  }, [pricingService]);

  const resumeHeldOrder = useCallback((order: HeldOrder, defaultTax: number) => {
    setCart((order.items || []).map((item) => ({
      ...item,
      soldBy: item.soldBy || item.product.baseUnit || 'M2',
      soldQuantity: Number.isFinite(item.soldQuantity)
        ? item.soldQuantity
        : round2(fromBaseQuantity(item.quantityM2, item.soldBy || item.product.baseUnit || 'M2', item.product)),
    })));
    setDiscountAmount(order.discountAmount || 0);
    setTaxPercentage(order.taxPercentage ?? defaultTax);
    setShippingCost(order.shippingCost || 0);
    setNotes(order.notes || '');
    setPaidAmount(order.paidAmount || 0);
  }, []);

  const lineSubtotal = round2(cart.reduce((s, i) => s + i.quantityM2 * i.unitPrice, 0));
  const lineDiscountTotal = round2(cart.reduce((s, i) => s + i.discountAmount, 0));
  const subtotal = round2(lineSubtotal - lineDiscountTotal);
  const taxableBase = round2(Math.max(0, subtotal - discountAmount));
  const taxAmount = round2(taxableBase * (taxPercentage || 0) / 100);
  const totalAmount = round2(Math.max(0, taxableBase + taxAmount + (shippingCost || 0)));
  const remainingAmount = round2(Math.max(0, totalAmount - (paidAmount || 0)));
  const changeDue = round2(Math.max(0, (paidAmount || 0) - totalAmount));

  return {
    cart, setCart, discountAmount, setDiscountAmount, shippingCost, setShippingCost,
    taxPercentage, setTaxPercentage, paidAmount, setPaidAmount, notes, setNotes,
    addToCart, removeFromCart, clearCart, updateCartQuantity, stepCartQuantity,
    updateCartUnit, updateCartPrice, updateCartLineDiscount, applyCustomerPricing,
    resumeHeldOrder, makeCartItem,
    lineSubtotal, lineDiscountTotal, taxAmount, totalAmount, remainingAmount, changeDue,
  };
}
