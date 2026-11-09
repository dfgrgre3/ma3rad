import { normalizeUom } from './uom_part01';
import type { UomProduct } from './uom_part01';
import { conversionFactor } from './uom_part02';

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
