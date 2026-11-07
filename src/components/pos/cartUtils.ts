import { getUomLabel, isWholeUnit } from '../../utils/uom';
import type { CartItem } from './types';

export const getCartQuantityStep = (item: CartItem) =>
  isWholeUnit(item.soldBy, item.product) ? 1 : 0.01;

export const getCartPriceUnitLabel = (item: CartItem) => getUomLabel(item.soldBy, item.product);
