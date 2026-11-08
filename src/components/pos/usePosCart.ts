import { useCallback, useState } from 'react';
import type { Customer, Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity } from '../../utils/productUnits';
import {
  basePriceFromUnitPrice,
  convertQuantity,
  fromBaseQuantity,
  getSellableUnits,
  toBaseQuantity,
} from '../../utils/uom';
import { getCartQuantityStep } from './cartUtils';
import { round2, type CartItem, type PosUnit, type Toast } from './types';
import type { PricingService } from '../../services/PricingService';

interface UsePosCartOptions {
  can: (permission: string) => boolean;
  notify: (message: string, type?: Toast['type']) => void;
  pricingService: PricingService;
  selectedCustomer: Customer | null;
  stockOf: (productId: string) => number;
  allowDuplicateItems?: boolean;
}

export const usePosCart = ({
  can,
  notify,
  pricingService,
  selectedCustomer,
  stockOf,
  allowDuplicateItems = false,
}: UsePosCartOptions) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  const makeCartItem = useCallback((product: Product, quantityM2: number): CartItem => {
    const metersPerBox = product.metersPerBox || 1.44;
    const piecesPerBox = product.piecesPerBox || 4;
    const isGeneral = product.productType === 'GENERAL';
    const boxes = isGeneral
      ? product.baseUnit === 'BOX' ? quantityM2 : 0
      : CeramicMath.calculateBoxes(quantityM2, metersPerBox, true);
    let unitPrice = product.sellingPriceM2;
    try {
      unitPrice = pricingService.getEffectivePrice(product.id, selectedCustomer?.id, quantityM2).priceM2;
    } catch {
      unitPrice = product.sellingPriceM2;
    }
    const sellable = getSellableUnits(product);
    const preferred = product.sellUnit && sellable.includes(product.sellUnit) ? product.sellUnit : (product.baseUnit || 'M2');
    const soldBy = sellable.includes(preferred) ? preferred : sellable[0];
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
      try {
        return { ...item, unitPrice: pricingService.getEffectivePrice(item.product.id, customer?.id, item.quantityM2).priceM2 };
      } catch {
        return item;
      }
    }));
  }, [pricingService]);

  const addToCart = useCallback((product: Product, requestedM2?: number) => {
    setCart((prev) => {
      const existingIndex = allowDuplicateItems ? -1 : prev.findIndex((item) => item.product.id === product.id);
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
          current.unitPrice = pricingService.getEffectivePrice(current.product.id, selectedCustomer?.id, newM2).priceM2;
        } catch {
          // Keep the current price if a pricing rule cannot be resolved.
        }
        updated[existingIndex] = current;
        return updated;
      }
      return [...prev, makeCartItem(product, stepM2)];
    });
  }, [selectedCustomer, pricingService, makeCartItem, allowDuplicateItems]);

  const addCalculatedToCart = (product: Product, quantityM2: number) => {
    addToCart(product, quantityM2);
    notify(`تمت إضافة ${product.name} (${formatProductQuantity(quantityM2, product)}) إلى السلة`, 'success');
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

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
      } catch {
        return prev;
      }
      updated[index] = item;
      return updated;
    });
  };

  const updateCartPrice = (index: number, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
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
    addCalculatedToCart,
    updateCartQuantity,
    stepCartQuantity,
    updateCartUnit,
    updateCartPrice,
    updateCartLineDiscount,
    removeFromCart,
  };
};
