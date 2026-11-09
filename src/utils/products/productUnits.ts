import type { UnitType } from '../../types';

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

export const getProductUnitLabel = (product?: ProductUnitInfo | null): string => {
  // Ceramic products keep the historical area/linear-meter wording even when
  // their stored base unit differs. Every other product type (GENERAL, SERVICE)
  // is described by its configured unit.
  const info = product ?? {};
  if (!info.productType || info.productType === 'CERAMIC') {
    return info.baseUnit === 'LINEAR_METER' ? 'متر طولي' : 'م²';
  }
  if (info.baseUnit === 'CUSTOM') return info.customUnit?.trim() || 'وحدة';
  if (!info.baseUnit) return info.customUnit?.trim() || 'وحدة';
  return Object.entries(UNIT_LABELS).find(([unit]) => unit === info.baseUnit)?.[1] || 'وحدة';
};

export const formatProductQuantity = (quantity: number, product?: ProductUnitInfo | null): string =>
  `${Number(quantity || 0).toLocaleString('ar-EG')} ${getProductUnitLabel(product)}`;

export const getStockQuantityLabel = (product?: ProductUnitInfo | null): string =>
  !product?.productType || product.productType === 'CERAMIC' ? 'م²' : getProductUnitLabel(product);

/**
 * A service line is sold without a stock movement even when the business tracks
 * inventory for its other products (mixed businesses such as restaurants,
 * workshops or contractors).
 */
export const isServiceProduct = (product: ProductUnitInfo): boolean =>
  product.productType === 'SERVICE' || product.baseUnit === 'SERVICE';
