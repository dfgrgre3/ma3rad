import { useCallback, useRef, useState } from 'react';
import type { Customer, Product } from '../../../../types';
import { CeramicMath } from '../../../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../../../utils/products/productUnits';
import {
  basePriceFromUnitPrice,
  convertQuantity,
  fromBaseQuantity,
  getSellableUnits,
  toBaseQuantity,
} from '../../../../utils/products/uom';
import { getCartQuantityStep } from '../../../../pages/sales/pos/components/cartUtils';
import { round2, type CartItem, type PosUnit, type Toast } from '../../../../types/pos';
import type { PricingService } from '../../../../services/domains/sales/PricingService';

interface UsePosCartOptions {
  can: (permission: string) => boolean;
  notify: (message: string, type?: Toast['type']) => void;
  pricingService: PricingService;
  selectedCustomer: Customer | null;
  stockOf: (productId: string) => number;
  allowDuplicateItems?: boolean;
}

const effectiveBaseUnitPrice = (
  pricingService: PricingService,
  product: Product,
  customerId: string | null | undefined,
  quantityM2: number,
  soldBy: PosUnit,
): number => {
  const price = pricingService.getEffectivePrice(product.id, customerId, quantityM2);
  if (String(soldBy).toUpperCase() === 'BOX' && Number(price.priceBox) > 0) {
    const baseQuantity = toBaseQuantity(1, 'BOX', product).quantity;
    if (baseQuantity > 0) return round2(Number(price.priceBox) / baseQuantity);
  }
  return price.priceM2;
};

export const usePosCart = ({
  can,
  notify,
  pricingService,
  selectedCustomer,
  stockOf,
  allowDuplicateItems = false,
}: UsePosCartOptions) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [recentlyRemoved, setRecentlyRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const recentlyRemovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeCartItem = useCallback((product: Product, quantityM2: number): CartItem => {
    const metersPerBox = product.metersPerBox || 1.44;
    const piecesPerBox = product.piecesPerBox || 4;
    const isGeneral = product.productType === 'GENERAL';
    const boxes = isGeneral
      ? product.baseUnit === 'BOX' ? quantityM2 : 0
      : CeramicMath.calculateBoxes(quantityM2, metersPerBox, true);
    const sellable = getSellableUnits(product);
    const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
    const soldBy = sellable.includes(preferred) ? preferred : sellable[0];
    let unitPrice = product.sellingPriceM2;
    try {
      unitPrice = effectiveBaseUnitPrice(pricingService, product, selectedCustomer?.id, quantityM2, soldBy);
    } catch {
      unitPrice = product.sellingPriceM2;
    }
    return {
      product,
      soldBy,
      soldQuantity: round2(fromBaseQuantity(quantityM2, soldBy, product)),
      quantityM2: round2(quantityM2),
      boxesCount: boxes,
      piecesCount: isGeneral
        ? product.baseUnit === 'PIECE' ? quantityM2 : 0
        : CeramicMath.calculatePiecesFromBoxes(boxes, piecesPerBox),
      unitPrice,
      discountAmount: 0,
      availableStockM2: stockOf(product.id),
      notes: '',
    };
  }, [pricingService, selectedCustomer, stockOf]);

  const applyCustomerPricing = useCallback((customer: Customer | null) => {
    setCart((prev) => prev.map((item) => {
      if (item.specialStockId) return item;
      try {
        return { ...item, unitPrice: effectiveBaseUnitPrice(pricingService, item.product, customer?.id, item.quantityM2, item.soldBy) };
      } catch {
        return item;
      }
    }));
  }, [pricingService]);

  const addToCart = useCallback((product: Product, requestedM2?: number) => {
    setCart((prev) => {
      const existingIndex = allowDuplicateItems ? -1 : prev.findIndex((item) => !item.specialStockId && item.product.id === product.id);
      const sellable = getSellableUnits(product);
      const preferred = product.sellUnit && sellable.includes(product.sellUnit)
        ? product.sellUnit
        : (product.baseUnit || 'M2');
      const oneSellUnitInBase = toBaseQuantity(1, preferred, product).quantity;
      const stepM2 = requestedM2
        ?? (product.productType === 'GENERAL'
          ? (preferred !== (product.baseUnit || 'M2') ? oneSellUnitInBase : 1)
          : (product.metersPerBox || 1.44));
      if (existingIndex > -1) {
        const updated = [...prev];
        const current = { ...updated[existingIndex] };
        const newM2 = round2(current.quantityM2 + stepM2);
        current.quantityM2 = newM2;
        current.soldQuantity = round2(fromBaseQuantity(newM2, current.soldBy, current.product));
        if (current.product.productType === 'GENERAL') {
          current.boxesCount = current.product.baseUnit === 'BOX' ? newM2 : 0;
          current.piecesCount = current.product.baseUnit === 'PIECE' ? newM2 : 0;
        } else {
          current.boxesCount = CeramicMath.calculateBoxes(newM2, current.product.metersPerBox || 1.44, true);
          current.piecesCount = CeramicMath.calculatePiecesFromBoxes(current.boxesCount, current.product.piecesPerBox || 4);
        }
        try {
          current.unitPrice = effectiveBaseUnitPrice(pricingService, current.product, selectedCustomer?.id, newM2, current.soldBy);
        } catch {
          // Keep the current price if a pricing rule cannot be resolved.
        }
        updated[existingIndex] = current;
        return updated;
      }
      return [...prev, makeCartItem(product, stepM2)];
    });
  }, [selectedCustomer, pricingService, makeCartItem, allowDuplicateItems]);

  const addDiscountedToCart = useCallback((product: Product, source: {
    id: string;
    specialNumber: string;
    availableQuantityM2: number;
    discountedUnitPrice: number;
  }) => {
    const sellable = getSellableUnits(product);
    const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
    const defaultStep = product.productType === 'GENERAL'
      ? (preferred !== (product.baseUnit || 'M2') ? toBaseQuantity(1, preferred, product).quantity : 1)
      : (product.metersPerBox || 1.44);
    const quantity = Math.min(defaultStep, Number(source.availableQuantityM2));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify('لا توجد كمية متاحة في سجل البيع المخفض المحدد.', 'error');
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.specialStockId === source.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const current = { ...updated[existingIndex] };
        current.quantityM2 = round2(current.quantityM2 + quantity);
        current.soldQuantity = round2(fromBaseQuantity(current.quantityM2, current.soldBy, current.product));
        current.boxesCount = current.product.productType === 'GENERAL'
          ? current.product.baseUnit === 'BOX' ? current.quantityM2 : 0
          : CeramicMath.calculateBoxes(current.quantityM2, current.product.metersPerBox || 1.44, true);
        current.piecesCount = current.product.productType === 'GENERAL'
          ? current.product.baseUnit === 'PIECE' ? current.quantityM2 : 0
          : CeramicMath.calculatePiecesFromBoxes(current.boxesCount, current.product.piecesPerBox || 4);
        updated[existingIndex] = current;
        return updated;
      }
      const item = makeCartItem(product, quantity);
      return [...prev, {
        ...item,
        unitPrice: Number(source.discountedUnitPrice),
        availableStockM2: Number(source.availableQuantityM2),
        specialStockId: source.id,
        specialNumber: source.specialNumber,
      }];
    });
    notify(`تمت إضافة ${product.name} من سجل البيع المخفض ${source.specialNumber}`, 'success');
  }, [makeCartItem, notify]);

  const addCalculatedToCart = (product: Product, quantityM2: number) => {
    addToCart(product, quantityM2);
    notify(`تمت إضافة ${product.name} (${formatProductQuantity(quantityM2, product)}) إلى السلة`, 'success');
  };

  const removeFromCart = (index: number) => {
    const item = cart[index];
    if (!item) return;
    setRecentlyRemoved({ item, index });
    if (recentlyRemovedTimer.current) clearTimeout(recentlyRemovedTimer.current);
    recentlyRemovedTimer.current = setTimeout(() => setRecentlyRemoved(null), 6000);
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const undoRemoveFromCart = useCallback(() => {
    if (!recentlyRemoved) return;
    const removed = recentlyRemoved;
    setCart((prev) => {
      const next = [...prev];
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      return next;
    });
    setRecentlyRemoved(null);
    if (recentlyRemovedTimer.current) clearTimeout(recentlyRemovedTimer.current);
    recentlyRemovedTimer.current = null;
  }, [recentlyRemoved]);

  const updateCartQuantity = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (value === 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      let baseQuantity: number;
      try {
        baseQuantity = round2(convertQuantity(value, item.soldBy, item.product.baseUnit || 'M2', item.product));
      } catch {
        return prev;
      }
      item.soldQuantity = round2(value);
      item.quantityM2 = baseQuantity;
      try {
        item.unitPrice = effectiveBaseUnitPrice(pricingService, item.product, selectedCustomer?.id, baseQuantity, item.soldBy);
      } catch {
        // Keep the current line price when a quantity tier cannot be resolved.
      }
      const metersPerBox = item.product.metersPerBox || 1.44;
      const piecesPerBox = item.product.piecesPerBox || 4;
      const soldInBoxes = String(item.soldBy).toUpperCase() === 'BOX';
      const soldInPieces = String(item.soldBy).toUpperCase() === 'PIECE';

      if (item.product.productType === 'GENERAL' || item.product.baseUnit === 'SERVICE') {
        item.boxesCount = soldInBoxes ? value : item.product.baseUnit === 'BOX' ? baseQuantity : 0;
        item.piecesCount = soldInPieces ? value : item.product.baseUnit === 'PIECE' ? baseQuantity : 0;
      } else {
        item.boxesCount = soldInBoxes
          ? round2(value)
          : CeramicMath.calculateBoxes(baseQuantity, metersPerBox, true);
        item.piecesCount = soldInPieces
          ? Math.round(value)
          : CeramicMath.calculatePiecesFromBoxes(item.boxesCount, piecesPerBox);
      }
      updated[index] = item;
      return updated;
    });
  };

  const stepCartQuantity = (index: number, direction: 1 | -1) => {
    const item = cart[index];
    if (!item) return;
    const step = getCartQuantityStep(item);
    const next = round2(item.soldQuantity + direction * step);
    if (next <= 0) {
      removeFromCart(index);
      return;
    }
    updateCartQuantity(index, next);
  };

  const updateCartUnit = (index: number, unit: PosUnit) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (item.soldBy === unit) return prev;
      try {
        item.soldBy = unit;
        item.soldQuantity = round2(fromBaseQuantity(item.quantityM2, unit, item.product));
        item.unitPrice = effectiveBaseUnitPrice(pricingService, item.product, selectedCustomer?.id, item.quantityM2, unit);
      } catch {
        return prev;
      }
      updated[index] = item;
      return updated;
    });
  };

  const updateCartPrice = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    if (cart[index]?.specialStockId) {
      notify('سعر سجل البيع المخفض معتمد ولا يمكن تغييره من نقطة البيع.', 'error');
      return;
    }
    if (!can('sales.approve')) {
      notify('لا تملك صلاحية تعديل سعر الصنف', 'error');
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.unitPrice = round2(basePriceFromUnitPrice(value, item.soldBy, item.product));
      updated[index] = item;
      return updated;
    });
  };

  const updateCartLineDiscount = (index: number, value: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.discountAmount = Math.min(item.quantityM2 * item.unitPrice, Math.max(0, round2(Number.isFinite(value) ? value : 0)));
      updated[index] = item;
      return updated;
    });
  };

  return {
    cart,
    setCart,
    applyCustomerPricing,
    addToCart,
    addDiscountedToCart,
    addCalculatedToCart,
    updateCartQuantity,
    stepCartQuantity,
    updateCartUnit,
    updateCartPrice,
    updateCartLineDiscount,
    removeFromCart,
    recentlyRemoved: recentlyRemoved?.item || null,
    undoRemoveFromCart,
  };
};
