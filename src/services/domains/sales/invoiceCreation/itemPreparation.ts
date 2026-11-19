import { v4 as uuidv4 } from 'uuid';
import { InventoryCostingService } from '../../inventory/InventoryCostingService';
import { getProductUnitLabel, isServiceProduct } from '../../../../utils/products/productUnits';
import { resolveSaleUnits, type ResolvedSaleUnits } from '../unitResolution';
import { computeSaleLine, round2 } from '../../finance/financials';
import { unscaleMoneyRow } from '../../../../utils/money';
import type { CreateSaleDTO } from '../../../../types/sales/serviceTypes';
import { validateProductPricing } from './pricingValidation';
import type { PreparedSaleItem } from './types';

export const PRODUCT_PRICE_MONEY_FIELDS = ['cost_price','costPrice','selling_price_m2','sellingPriceM2','selling_price_box','sellingPriceBox','wholesale_price_m2','wholesalePriceM2','min_selling_price_m2','minSellingPriceM2'] as const;

function getUnitLabel(product: any): string {
  return getProductUnitLabel({
    productType: product.productType,
    baseUnit: product.baseUnit,
    customUnit: product.customUnit,
  });
}

function getAvailableStockM2(sqliteDb: any, productId: string, warehouseId: string): number {
  const stockRow = sqliteDb.query(
    `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
    [productId, warehouseId]
  )[0] as any;

  return (stockRow ? Number(stockRow.quantityM2) : 0) - Number(stockRow?.reservedM2 || 0);
}

function assertAvailableStock(product: any, unitLabel: string, availableM2: number, plannedSoFar: number, quantityM2: number): void {
  if (availableM2 - plannedSoFar < quantityM2) {
    throw new Error(
      `الرصيد المتاح من الصنف (${product.name}) غير كافٍ. المتاح: ${round2(availableM2 - plannedSoFar)} ${unitLabel}، المطلوب: ${quantityM2} ${unitLabel}`
    );
  }
}

function validateItemQuantity(quantityM2: number): void {
  if (!Number.isFinite(quantityM2) || quantityM2 <= 0) throw new Error('كمية أحد الأصناف في الفاتورة غير صحيحة.');
}

function getFifoPlan(sqliteDb: any, item: CreateSaleDTO['items'][number], dto: CreateSaleDTO, quantityM2: number, plannedFifoByLayer: Map<string, number>, costingMethod: string): ReturnType<typeof InventoryCostingService.planFifo> | null {
  if (costingMethod !== 'FIFO') return null;
  const fifoPlan = InventoryCostingService.planFifo(sqliteDb, item.productId, dto.warehouseId, quantityM2, plannedFifoByLayer);
  for (const allocation of fifoPlan?.allocations || []) {
    plannedFifoByLayer.set(allocation.layerId, round2((plannedFifoByLayer.get(allocation.layerId) || 0) + allocation.quantity));
  }
  return fifoPlan;
}

function getBoxesCount(
  product: any,
  item: CreateSaleDTO['items'][number],
  units: ResolvedSaleUnits,
  baseQuantity: number
): number {
  const isGeneralProduct = product.productType === 'GENERAL';
  const metersPerBox = Number(product.metersPerBox) || 1.44;
  const soldInBoxes = String(units.sellUnit || '').toUpperCase() === 'BOX';

  if (isGeneralProduct) {
    if (soldInBoxes) return round2(units.sellQuantity);
    if (product.baseUnit === 'BOX') return round2(baseQuantity);
    return item.boxesCount ? round2(Math.max(0, item.boxesCount)) : 0;
  }

  if (item.boxesCount !== undefined && item.boxesCount !== null) {
    return round2(Math.max(0, item.boxesCount));
  }
  if (soldInBoxes) return round2(units.sellQuantity);

  return round2(baseQuantity / metersPerBox);
}

function getPiecesCount(
  product: any,
  item: CreateSaleDTO['items'][number],
  units: ResolvedSaleUnits,
  baseQuantity: number,
  boxesCount: number
): number {
  const soldInPieces = String(units.sellUnit || '').toUpperCase() === 'PIECE';
  if (soldInPieces) return Math.round(units.sellQuantity);
  if (product.productType === 'GENERAL') {
    return product.baseUnit === 'PIECE' ? Math.round(baseQuantity) : 0;
  }
  if (item.piecesCount) return item.piecesCount;
  return Math.round(boxesCount * (Number(product.piecesPerBox) || 4));
}

function buildPreparedItem(
  sqliteDb: any,
  dto: CreateSaleDTO,
  item: CreateSaleDTO['items'][number],
  actor: any,
  plannedByProduct: Map<string, number>,
  plannedFifoByLayer: Map<string, number>,
  costingMethod: string,
  trackInventory: boolean,
  allowNegativeStock: boolean,
  plannedSpecialStock: Map<string, number>
): PreparedSaleItem {
  const product = unscaleMoneyRow(sqliteDb.query(`SELECT * FROM products WHERE id = ? AND is_active = 1`, [item.productId])[0] as any, PRODUCT_PRICE_MONEY_FIELDS) as any;
  if (!product) throw new Error(`المنتج ذو المعرف ${item.productId} غير موجود أو غير نشط.`);

  const units = resolveSaleUnits(item, product);
  const baseQuantity = units.baseQuantity;
  validateItemQuantity(baseQuantity);

  const serviceLine = isServiceProduct({ productType: product.productType, baseUnit: product.baseUnit });
  const tracksStock = trackInventory && !serviceLine;
  const unitLabel = getUnitLabel(product);
  let specialStock: any | undefined;
  if (item.specialStockId) {
    if (!tracksStock) throw new Error('لا يمكن بيع مصدر المخزون المخفض لصنف لا يتتبع المخزون.');
    specialStock = sqliteDb.query(`
      SELECT id, special_number AS specialNumber, product_id AS productId,
        warehouse_id AS warehouseId, status, remaining_quantity_m2 AS remainingQuantityM2,
        discounted_unit_price / 100.0 AS discountedUnitPrice, unit_cost / 100.0 AS unitCost
      FROM inventory_special_stocks WHERE id = ?
    `, [item.specialStockId])[0];
    if (!specialStock || specialStock.status !== 'DOWNGRADED_SALE'
      || specialStock.productId !== item.productId || specialStock.warehouseId !== dto.warehouseId
      || Number(specialStock.remainingQuantityM2) <= 0) {
      throw new Error('مصدر مخزون البيع المخفض غير متاح أو لا يطابق الصنف والمخزن المحددين.');
    }
    const alreadyPlanned = plannedSpecialStock.get(item.specialStockId) || 0;
    if (Number(specialStock.remainingQuantityM2) - alreadyPlanned < baseQuantity) {
      throw new Error(`الكمية المتاحة من سجل البيع المخفض ${specialStock.specialNumber} غير كافية.`);
    }
    if (round2(units.baseUnitPrice) !== round2(Number(specialStock.discountedUnitPrice))) {
      throw new Error('سعر البيع لا يطابق السعر المعتمد لمصدر المخزون المخفض.');
    }
    plannedSpecialStock.set(item.specialStockId, round2(alreadyPlanned + baseQuantity));
  } else {
    validateProductPricing(sqliteDb, dto, item, product, actor, units.baseUnitPrice, baseQuantity);
  }

  let stockSufficient = true;
  if (tracksStock && !specialStock) {
    const availableM2 = getAvailableStockM2(sqliteDb, item.productId, dto.warehouseId);
    const alreadyPlanned = plannedByProduct.get(item.productId) || 0;
    if (allowNegativeStock) {
      // المخزون السالب مسموح في الإعدادات — التحقق يتم في الواجهة فقط،
      // لكن طبقات FIFO لا يمكن أن تهبط تحت الصفر، لذا FIFO يُطبق فقط على ما يغطيه الرصيد.
      stockSufficient = availableM2 - alreadyPlanned >= baseQuantity;
    } else {
      assertAvailableStock(product, unitLabel, availableM2, alreadyPlanned, baseQuantity);
    }
    plannedByProduct.set(item.productId, alreadyPlanned + baseQuantity);
  }

  const fifoPlan = tracksStock && !specialStock && (!allowNegativeStock || stockSufficient)
    ? getFifoPlan(sqliteDb, item, dto, baseQuantity, plannedFifoByLayer, costingMethod)
    : null;
  // Financials are computed in the unit the cashier used, so a price of
  // 100/box over 2 boxes totals exactly 200 instead of drifting through the
  // per-m² conversion. Costs are converted to the same unit for the margin.
  const costPerSellUnit = fifoPlan
    ? fifoPlan.totalCost / (units.sellQuantity || 1)
    // Average cost is sourced from the product row loaded inside this transaction.
    // Never trust a caller supplied unitCost; special stock and FIFO use their
    // own database backed cost records above.
    : (specialStock ? Number(specialStock.unitCost) : Number(product.costPrice) || 0) * units.factor;
  const line = computeSaleLine({
    quantity: units.sellQuantity,
    unitPrice: units.sellUnitPrice,
    unitCost: costPerSellUnit,
    discountAmount: item.discountAmount || 0,
  });
  if (line.lineDiscount > line.lineSubtotal) throw new Error(`خصم الصنف "${product.name}" يتجاوز إجمالي سعره.`);

  const metersPerBox = Number(product.metersPerBox) || 1.44;
  const piecesPerBox = Number(product.piecesPerBox) || 4;
  const boxesCount = getBoxesCount(product, item, units, baseQuantity);
  const piecesCount = getPiecesCount(product, item, units, baseQuantity, boxesCount);
  return {
    id: `item_${uuidv4().substring(0, 8)}`,
    invoiceId: '',
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    productGrade: product.grade,
    size: product.size,
    soldBy: units.sellUnit,
    quantityM2: baseQuantity,
    baseUom: product.baseUnit || 'M2',
    boxesCount,
    piecesCount,
    unitPrice: units.baseUnitPrice,
    originalUnitPrice: product.sellingPriceM2,
    unitCost: line.lineCost / (baseQuantity || 1),
    discountAmount: line.lineDiscount,
    totalPrice: line.lineTotal,
    totalCost: line.lineCost,
    profit: line.lineProfit,
    fifoPlan,
    specialStockId: specialStock?.id || null,
    specialNumber: specialStock?.specialNumber || null,
    metersPerBox,
    piecesPerBox,
    productType: product.productType,
    tracksStock,
  };
}

export function prepareSaleItems(
  sqliteDb: any,
  dto: CreateSaleDTO,
  actor: any,
  costingMethod: string,
  trackInventory: boolean,
  allowNegativeStock: boolean
): { preparedItems: PreparedSaleItem[]; totalLineDiscount: number } {
  let totalLineDiscount = 0;
  const preparedItems: PreparedSaleItem[] = [];
  const plannedByProduct = new Map<string, number>();
  const plannedFifoByLayer = new Map<string, number>();
  const plannedSpecialStock = new Map<string, number>();

  for (const item of dto.items) {
    const preparedItem = buildPreparedItem(
      sqliteDb, dto, item, actor, plannedByProduct, plannedFifoByLayer, costingMethod,
      trackInventory, allowNegativeStock, plannedSpecialStock
    );
    totalLineDiscount += preparedItem.discountAmount;
    preparedItems.push(preparedItem);
  }

  return { preparedItems, totalLineDiscount };
}
