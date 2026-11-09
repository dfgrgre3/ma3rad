import { getUomLabel, isWholeUnit } from '../../utils/products/uom';
import type { CartItem } from '../../types/pos';

export const getCartQuantityStep = (item: CartItem) =>
  isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;

export const getCartPriceUnitLabel = (item: CartItem) => getUomLabel(item.soldBy, item.product);
