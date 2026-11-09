import type { UnitType } from '../../types';
import { getProductUnitLabel } from './productUnits';

/**
 * Unit-of-measure conversion layer.
 *
 * Historically every stock quantity in the database was stored as `quantity_m2`,
 * which silently assumed ceramics. Products already carry a generic `base_unit`
 * (and `custom_unit`), so the storage column is now treated as "quantity in the
 * product's base unit" and this module provides the conversions the rest of the
 * app needs to speak in any unit.
 *
 * Rules:
 * - The base unit is authoritative for stock. Conversions only go through it.
 * - BOX conversions use the product's `meters_per_box` / `pieces_per_box`.
 * - A conversion that cannot be derived throws instead of silently returning
 *   the input, so costing and stock can never drift because of a bad unit.
 */

export interface UomProduct {
  productType?: string | null;
  baseUnit?: string | null;
  customUnit?: string | null;
  sellUnit?: string | null;
  metersPerBox?: number | null;
  piecesPerBox?: number | null;
}

export const UNIT_LABELS: Record<Exclude<UnitType, 'CUSTOM'>, string> = {
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

export const AREA_UNITS = new Set(['M2']);

export const LENGTH_UNITS = new Set(['METER', 'LINEAR_METER']);

/** Canonical comparison key for a unit, including custom units. */
export function normalizeUom(uom: string | null | undefined, product?: UomProduct): string {
  const raw = (uom || '').trim();
  if (!raw) return normalizeUom(product?.baseUnit || (product?.customUnit ? 'CUSTOM' : 'M2'), product);
  const upper = raw.toUpperCase();
  if (upper === 'CUSTOM' || upper === 'CUSTOM_UNIT') {
    return `CUSTOM:${(product?.customUnit || raw).trim().toLowerCase()}`;
  }
  if (product?.customUnit && raw.toLowerCase() === product.customUnit.trim().toLowerCase()) {
    return `CUSTOM:${product.customUnit.trim().toLowerCase()}`;
  }
  if (LENGTH_UNITS.has(upper)) return 'LENGTH';
  return upper;
}

export function getUomLabel(uom: string | null | undefined, product?: UomProduct): string {
  const raw = (uom || product?.baseUnit || '').trim();
  const upper = raw.toUpperCase();
  if (upper === 'CUSTOM' || (!upper && product?.customUnit)) {
    return product?.customUnit?.trim() || 'وحدة';
  }
  if (upper === 'M2') return product ? getProductUnitLabel(product as any) : 'م²';
  return (UNIT_LABELS as Record<string, string>)[upper] || raw || 'وحدة';
}
