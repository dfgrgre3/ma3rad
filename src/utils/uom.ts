import type { UnitType } from '../types';
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

const AREA_UNITS = new Set(['M2']);
const LENGTH_UNITS = new Set(['METER', 'LINEAR_METER']);

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

/**
 * Factor that converts `1 <from>` into `<to>` for this product, or `null` when
 * the two units are not convertible without more information.
 */
export function conversionFactor(
  from: string | null | undefined,
  to: string | null | undefined,
  product: UomProduct
): number | null {
  const source = normalizeUom(from, product);
  const target = normalizeUom(to, product);
  if (source === target) return 1;

  const boxToBase = (): number | null => {
    const base = normalizeUom(product.baseUnit, product);
    if (base === 'M2') {
      const meters = Number(product.metersPerBox) || 0;
      return meters > 0 ? meters : null;
    }
    if (base === 'PIECE') {
      const pieces = Number(product.piecesPerBox) || 0;
      return pieces > 0 ? pieces : null;
    }
    return null;
  };

  if (source === 'BOX') {
    const factor = boxToBase();
    if (factor === null) return null;
    return target === normalizeUom(product.baseUnit, product) ? factor : null;
  }
  if (target === 'BOX') {
    const factor = boxToBase();
    if (factor === null) return null;
    return source === normalizeUom(product.baseUnit, product) ? 1 / factor : null;
  }
  // Area <-> piece conversions use the area of a single piece.
  const areaPerPiece = (): number | null => {
    const meters = Number(product.metersPerBox) || 0;
    const pieces = Number(product.piecesPerBox) || 0;
    return meters > 0 && pieces > 0 ? meters / pieces : null;
  };
  if (source === 'M2' && target === 'PIECE') {
    const factor = areaPerPiece();
    return factor === null ? null : 1 / factor;
  }
  if (source === 'PIECE' && target === 'M2') {
    return areaPerPiece();
  }
  if ((source === 'KG' && target === 'TON')) return 1 / 1000;
  if ((source === 'TON' && target === 'KG')) return 1000;
  return null;
}

/** Convert `quantity` between units, throwing a clear Arabic message when impossible. */
export function convertQuantity(
  quantity: number,
  from: string | null | undefined,
  to: string | null | undefined,
  product: UomProduct
): number {
  const amount = Number(quantity) || 0;
  const factor = conversionFactor(from, to, product);
  if (factor === null) {
    throw new Error(
      `لا يمكن تحويل الكمية من «${getUomLabel(from, product)}» إلى «${getUomLabel(to, product)}» لهذا الصنف.`
    );
  }
  // Avoid binary floating-point noise (e.g. 2.88 / 1.44 = 1.9999999999999998)
  // without losing precision for small quantities.
  return Math.round(amount * factor * 1e6) / 1e6;
}

/** Convert a quantity expressed in any unit into the product's base unit. */
export function toBaseQuantity(
  quantity: number,
  uom: string | null | undefined,
  product: UomProduct
): { quantity: number; uom: string } {
  const base = product.baseUnit || 'M2';
  return {
    quantity: convertQuantity(quantity, uom || base, base, product),
    uom: base,
  };
}

/** Convert a base-unit quantity into the requested display/selling unit. */
export function fromBaseQuantity(
  baseQuantity: number,
  uom: string | null | undefined,
  product: UomProduct
): number {
  return convertQuantity(baseQuantity, product.baseUnit || 'M2', uom || product.baseUnit || 'M2', product);
}

/** True when both units describe the same physical dimension for this product. */
export function isSameUom(
  a: string | null | undefined,
  b: string | null | undefined,
  product: UomProduct
): boolean {
  return normalizeUom(a, product) === normalizeUom(b, product);
}

/** Area-in-square-meters for products whose base unit is area; 0 otherwise. */
export function baseQuantityAsM2(quantity: number, product: UomProduct): number {
  const base = normalizeUom(product.baseUnit, product);
  if (base === 'M2') return Number(quantity) || 0;
  if (base === 'BOX') return (Number(quantity) || 0) * baseQuantityAsM2Box(product);
  if (base === 'PIECE') {
    const pieces = Number(product.piecesPerBox) || 0;
    const meters = Number(product.metersPerBox) || 0;
    if (pieces > 0 && meters > 0) return ((Number(quantity) || 0) * meters) / pieces;
  }
  return 0;
}

function baseQuantityAsM2Box(product: UomProduct): number {
  return Number(product.metersPerBox) || 0;
}

/**
 * Units this product can be sold in, most natural first.
 *
 * The base unit always leads (stock is kept in it), then the configured
 * `sell_unit`, then every unit that `conversionFactor` can derive from it.
 * Impossible units are never offered, so the UI cannot produce a line the
 * costing layer would have to reject.
 */
export function getSellableUnits(product: UomProduct): string[] {
  const base = (product.baseUnit || 'M2').trim().toUpperCase();
  const candidates: string[] = [base];
  const configured = (product.sellUnit || '').trim();
  if (configured) candidates.push(configured);

  const pieces = Number(product.piecesPerBox) || 0;
  switch (base) {
    case 'M2':
      candidates.push('BOX');
      if (pieces > 0) candidates.push('PIECE');
      break;
    case 'PIECE':
      candidates.push('BOX');
      break;
    case 'BOX':
      if (pieces > 0) candidates.push('PIECE');
      break;
    case 'KG':
      candidates.push('TON');
      break;
    case 'TON':
      candidates.push('KG');
      break;
    case 'METER':
      candidates.push('LINEAR_METER');
      break;
    case 'LINEAR_METER':
      candidates.push('METER');
      break;
    case 'CUSTOM':
      if (product.customUnit) candidates.push('CUSTOM');
      break;
    default:
      break;
  }

  const seen = new Set<string>();
  return candidates.filter((unit) => {
    const key = normalizeUom(unit, product);
    if (seen.has(key)) return false;
    if (unit.toUpperCase() !== base && conversionFactor(base, unit, product) === null) return false;
    seen.add(key);
    return true;
  });
}

/** Price per `unit` given a price expressed per base unit. */
export function pricePerUnit(
  basePrice: number,
  unit: string | null | undefined,
  product: UomProduct
): number {
  const base = product.baseUnit || 'M2';
  const factor = conversionFactor(base, unit || base, product);
  if (factor === null || factor === 0) return Number(basePrice) || 0;
  return (Number(basePrice) || 0) / factor;
}

/** Price per base unit given a price expressed per `unit`. */
export function basePriceFromUnitPrice(
  unitPrice: number,
  unit: string | null | undefined,
  product: UomProduct
): number {
  const base = product.baseUnit || 'M2';
  const factor = conversionFactor(base, unit || base, product);
  if (factor === null) return Number(unitPrice) || 0;
  return (Number(unitPrice) || 0) * factor;
}

/** True when the unit only makes sense in whole amounts (boxes, pieces, sets). */
export function isWholeUnit(unit: string | null | undefined, product?: UomProduct): boolean {
  const key = normalizeUom(unit, product);
  return key === 'BOX' || key === 'PIECE' || key === 'SET' || key === 'SERVICE' || key.startsWith('CUSTOM:');
}

export { AREA_UNITS, LENGTH_UNITS };
