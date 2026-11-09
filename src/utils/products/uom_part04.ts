import { normalizeUom } from './uom_part01';
import type { UomProduct } from './uom_part01';
import { conversionFactor } from './uom_part02';

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
