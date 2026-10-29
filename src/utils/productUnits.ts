import type { UnitType } from '../types';

const UNIT_LABELS: Record<Exclude<UnitType, 'CUSTOM'>, string> = {
  M2: 'م²',
  LINEAR_METER: 'متر طولي',
  METER: 'متر',
  BOX: 'كرتونة',
  PIECE: 'قطعة',
  PACK: 'عبوة',
  KG: 'كجم',
  TON: 'طن',
  LITER: 'لتر',
  SET: 'طقم',
  SERVICE: 'خدمة',
};

// Invoice rows saved before unit metadata was added may not include baseUnit.
type ProductUnitInfo = {
  productType?: string;
  baseUnit?: string;
  customUnit?: string;
};

export const getProductUnitLabel = (product: ProductUnitInfo): string => {
  // Ceramic products keep the historical area/linear-meter wording even when
  // their stored base unit differs. Every other product type (GENERAL, SERVICE)
  // is described by its configured unit.
  if (!product.productType || product.productType === 'CERAMIC') {
    return product.baseUnit === 'LINEAR_METER' ? 'متر طولي' : 'م²';
  }
  if (product.baseUnit === 'CUSTOM') return product.customUnit?.trim() || 'وحدة';
  if (!product.baseUnit) return product.customUnit?.trim() || 'وحدة';
  return Object.entries(UNIT_LABELS).find(([unit]) => unit === product.baseUnit)?.[1] || 'وحدة';
};

export const formatProductQuantity = (quantity: number, product: ProductUnitInfo): string =>
  `${Number(quantity || 0).toLocaleString('ar-EG')} ${getProductUnitLabel(product)}`;

export const getStockQuantityLabel = (product: ProductUnitInfo): string =>
  !product.productType || product.productType === 'CERAMIC' ? 'م²' : getProductUnitLabel(product);

/**
 * A service line is sold without a stock movement even when the business tracks
 * inventory for its other products (mixed businesses such as restaurants,
 * workshops or contractors).
 */
export const isServiceProduct = (product: ProductUnitInfo): boolean =>
  product.productType === 'SERVICE' || product.baseUnit === 'SERVICE';
