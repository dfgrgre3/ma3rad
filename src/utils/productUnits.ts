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
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
};

export const getProductUnitLabel = (product: ProductUnitInfo): string => {
  if (product.productType !== 'GENERAL') {
    return product.baseUnit === 'LINEAR_METER' ? 'متر طولي' : 'م²';
  }
  if (product.baseUnit === 'CUSTOM') return product.customUnit?.trim() || 'وحدة';
  if (!product.baseUnit) return product.customUnit?.trim() || 'وحدة';
  return Object.entries(UNIT_LABELS).find(([unit]) => unit === product.baseUnit)?.[1] || 'وحدة';
};

export const formatProductQuantity = (quantity: number, product: ProductUnitInfo): string =>
  `${Number(quantity || 0).toLocaleString('ar-EG')} ${getProductUnitLabel(product)}`;

export const getStockQuantityLabel = (product: ProductUnitInfo): string =>
  product.productType === 'GENERAL' ? getProductUnitLabel(product) : 'م²';
