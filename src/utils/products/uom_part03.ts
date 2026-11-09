import { getUomLabel, normalizeUom } from './uom_part01';
import type { UomProduct } from './uom_part01';
import { conversionFactor } from './uom_part02';

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

export function baseQuantityAsM2Box(product: UomProduct): number {
  return Number(product.metersPerBox) || 0;
}
