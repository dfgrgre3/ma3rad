import { normalizeUom } from './uom_part01';
import type { UomProduct } from './uom_part01';

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
    if (base === 'BOX') return 1;
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
