import { conversionFactor, convertQuantity, getUomLabel, type UomProduct } from '../../utils/uom';
import { round2 } from '../financials';

/**
 * Shared unit resolution for sales documents (invoices, quotations, orders).
 *
 * Every line of a sales document stores its quantity in the product's base
 * unit (`quantity_m2` / `orders.quantity_m2` / `quotation_items.quantity_m2`)
 * and its price per base unit, because stock, costing and returns all consume
 * base units. The unit the user actually typed (`uom`) is an input concern: it
 * is converted here, and the resulting line total is computed in the entered
 * unit so a price of 100 per box over 2 boxes totals exactly 200 instead of
 * drifting through the per-m² conversion.
 */

type SaleUnitInput = {
  /** Explicit selling unit (e.g. BOX or TON). When present, `quantity` is in it. */
  uom?: string | null;
  /** Quantity expressed in `uom`. When present, `unitPrice` is per `uom`. */
  quantity?: number | null;
  /** Legacy base-unit quantity. Ignored for math when `uom` + `quantity` are given. */
  quantityM2?: number | null;
  unitPrice: number;
  /** Historical hint for documents that predate `uom`. */
  soldBy?: string | null;
};

export interface ResolvedSaleUnits {
  /** Quantity in the product's base unit: the quantity every stock/cost path consumes. */
  baseQuantity: number;
  /** Price per base unit, the unit price stored on the line (returns rely on it). */
  baseUnitPrice: number;
  /** Unit the user actually entered. */
  sellUnit: string;
  /** Quantity in `sellUnit`. */
  sellQuantity: number;
  /** Price per `sellUnit`. */
  sellUnitPrice: number;
  /** Base units contained in one `sellUnit`. */
  factor: number;
  /** Line total in the entered unit, before discounts. */
  gross: number;
}

/**
 * Resolve a line into base-unit quantity plus sell-unit quantity/price.
 *
 * Lines that send `uom` + `quantity` are converted through the centralized UoM
 * layer; older callers that only send `quantityM2`/`unitPrice` keep the
 * historical "already in base unit" meaning.
 */
export function resolveSaleUnits(
  item: SaleUnitInput,
  product: UomProduct & { name?: string }
): ResolvedSaleUnits {
  const baseUnit = product.baseUnit || 'M2';
  const hasExplicitUnit = Boolean(item.uom) && item.quantity !== undefined && item.quantity !== null;

  if (!hasExplicitUnit) {
    const quantity = round2(Math.max(0, Number(item.quantityM2) || 0));
    return {
      baseQuantity: quantity,
      baseUnitPrice: item.unitPrice,
      sellUnit: item.soldBy || baseUnit,
      sellQuantity: quantity,
      sellUnitPrice: item.unitPrice,
      factor: 1,
      gross: round2(quantity * (Number(item.unitPrice) || 0)),
    };
  }

  const sellUnit = String(item.uom);
  const factor = conversionFactor(sellUnit, baseUnit, product);
  if (factor === null) {
    throw new Error(
      `لا يمكن بيع الصنف «${product.name ?? ''}» بوحدة «${getUomLabel(sellUnit, product)}»؛ الوحدة الأساسية هي «${getUomLabel(baseUnit, product)}».`
    );
  }
  const sellQuantity = Math.max(0, Number(item.quantity) || 0);
  const baseQuantity = round2(convertQuantity(sellQuantity, sellUnit, baseUnit, product));
  // Keep enough precision that a full refund equals the charged amount.
  const baseUnitPrice = Math.round(((Number(item.unitPrice) || 0) / factor) * 1e6) / 1e6;
  return {
    baseQuantity,
    baseUnitPrice,
    sellUnit,
    sellQuantity,
    sellUnitPrice: Number(item.unitPrice) || 0,
    factor,
    gross: round2(sellQuantity * (Number(item.unitPrice) || 0)),
  };
}
