import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { SettingsService } from '../config/SettingsService';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { InventoryLocationStockService } from '../inventory/InventoryLocationStockService';
import { BatchService } from '../inventory/BatchService';
import { localDateString } from '../../../utils/shared/date';
import { getProductUnitLabel, isServiceProduct } from '../../../utils/products/productUnits';
import { paymentAccountCode } from '../../../database/repositories/ledger';
import { resolveSaleUnits, type ResolvedSaleUnits } from './unitResolution';
import { computeSaleLine, computeSaleTotals, round2 } from '../finance/financials';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { applyLoyaltyMovementInTransaction } from './LoyaltyService';
import { WarehouseTypePolicy } from '../operations/WarehouseTypePolicy';
import { CentralUsageLimitService } from '../licensing/CentralUsageLimitService';
import { PartnerService } from '../customers/PartnerService';
import { defaultEffectEngine } from '../effects/EffectEngine';
import type { Effect } from '../../../types/effects';
import '../effects/handlers/salesInvoiceHandlers';
import type { SalesInvoice, PaymentType } from '../../../types';
import type { SalesContext } from './context';
import type { CreateSaleDTO } from '../../../types/sales/serviceTypes';

type PreparedSaleItem = {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  productSku: string;
  productGrade: string;
  size: string;
  soldBy: CreateSaleDTO['items'][number]['soldBy'];
  quantityM2: number;
  baseUom: string;
  boxesCount: number;
  piecesCount: number;
  unitPrice: number;
  originalUnitPrice: number;
  unitCost: number;
  discountAmount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  fifoPlan: ReturnType<typeof InventoryCostingService.planFifo> | null;
  specialStockId: string | null;
  specialNumber: string | null;
  metersPerBox: number;
  piecesPerBox: number;
  productType: string;
  tracksStock: boolean;
};

function assertSaleHasItems(dto: CreateSaleDTO): void {
  if (!dto.items || dto.items.length === 0) {
    throw new Error('لا يمكن إنشاء فاتورة مبيعات بدون أصناف.');
  }
}

function resolveCashRegister(ctx: SalesContext, dto: CreateSaleDTO, actor: any): { branchId: string; cashRegisterId: string } {
  const branchId = ctx.branchAccess.requireWarehouseAccess(dto.warehouseId, actor);
  const branchRegisterId = ctx.branchAccess.getDefaultRegisterId(branchId, actor);
  let cashRegisterId = branchRegisterId;

  if (dto.shiftId) {
    const shift = ctx.branchAccess.requireShiftAccess(dto.shiftId, actor);
    if (shift.status !== 'OPEN') throw new Error('الوردية المحددة مغلقة.');
    if (shift.branchId !== branchId) throw new Error('يجب أن تتبع الوردية فرع فاتورة البيع.');
    cashRegisterId = shift.registerId;
  }

  return { branchId, cashRegisterId };
}

function validateItemQuantity(quantityM2: number): void {
  if (quantityM2 <= 0) throw new Error('كمية أحد الأصناف في الفاتورة غير صحيحة.');
}

function getUnitLabel(product: any): string {
  return getProductUnitLabel({
    productType: product.productType,
    baseUnit: product.baseUnit,
    customUnit: product.customUnit,
  });
}

function validateProductPricing(item: CreateSaleDTO['items'][number], product: any, actor: any, baseUnitPrice: number): void {
  if (round2(baseUnitPrice) !== Number(product.sellingPriceM2) && !PermissionService.can(actor, 'ui.sales.invoices.approve')) {
    throw new Error(`لا تملك صلاحية تعديل سعر الصنف «${product.name}».`);
  }
  if (round2(baseUnitPrice) < (product.minSellingPriceM2 || 0)) {
    PermissionService.require(actor, 'ui.sales.invoices.approve');
  }
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
  const product = sqliteDb.query(`SELECT * FROM products WHERE id = ? AND is_active = 1`, [item.productId])[0] as any;
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
        discounted_unit_price AS discountedUnitPrice, unit_cost AS unitCost
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
    validateProductPricing(item, product, actor, units.baseUnitPrice);
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
    : (specialStock ? Number(specialStock.unitCost) : item.unitCost ?? product.costPrice ?? 0) * units.factor;
  const line = computeSaleLine({
    quantity: units.sellQuantity,
    unitPrice: units.sellUnitPrice,
    unitCost: costPerSellUnit,
    discountAmount: item.discountAmount || 0,
  });

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

function prepareSaleItems(
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

function validateDiscountAndCredit(
  sqliteDb: any,
  dto: CreateSaleDTO,
  actor: any,
  totals: ReturnType<typeof computeSaleTotals>,
  totalLineDiscount: number
): void {
  const headerDiscount = dto.discountAmount || 0;
  if (headerDiscount > totals.subtotal) {
    throw new Error('إجمالي الخصم يتجاوز صافي قيمة الأصناف في الفاتورة.');
  }
  if (totalLineDiscount + headerDiscount > 0) {
    PermissionService.require(actor, 'ui.sales.invoices.discount');
  }

  if (totals.remainingAmount > 0 && !PermissionService.can(actor, 'ui.sales.invoices.credit')) {
    throw new Error('لا تملك صلاحية البيع الآجل أو تسجيل مبلغ متبقٍ على العميل.');
  }

  if (totals.remainingAmount <= 0) return;

  const customer = sqliteDb.query(
    `SELECT name, credit_limit, current_balance FROM customers WHERE id = ?`,
    [dto.customerId]
  )[0] as { name: string; creditLimit?: number; currentBalance?: number } | undefined;
  if (!customer) throw new Error('العميل المحدد غير موجود.');
  const limit = Number(customer.creditLimit || 0);
  const projected = round2(Number(customer.currentBalance || 0) + totals.remainingAmount);
  if (limit > 0 && projected > limit && !PermissionService.can(actor, 'ui.sales.invoices.approve')) {
    throw new Error(
      `تجاوز حد الائتمان للعميل "${customer.name}". الرصيد الحالي ${customer.currentBalance} + الآجل ${totals.remainingAmount} يتجاوز الحد ${limit}.`
    );
  }
}

function getDueDate(today: string, customerId: string, sqliteDb: any, remainingAmount: number): string | null {
  if (remainingAmount <= 0) return null;
  const termsDays = Number((sqliteDb.query(
    'SELECT payment_terms_days AS paymentTermsDays FROM customers WHERE id=?',
    [customerId]
  )[0] as { paymentTermsDays?: number } | undefined)?.paymentTermsDays || 0);
  if (termsDays <= 0) return null;

  const due = new Date(`${today}T00:00:00`);
  due.setDate(due.getDate() + termsDays);
  return localDateString(due);
}

function insertInvoiceItems(
  sqliteDb: any,
  dto: CreateSaleDTO,
  preparedItems: PreparedSaleItem[],
  invoiceId: string,
  invoiceNumber: string | number,
  actor: any,
  costingMethod: string,
  allowNegativeStock = false
): void {
  for (const item of preparedItems) {
    item.invoiceId = invoiceId;
    sqliteDb.run(`
      INSERT INTO sales_invoice_items (
        id, invoice_id, product_id, product_name, product_sku, product_grade, size,
        sold_by, quantity_m2, quantity, uom, boxes_count, pieces_count, unit_price, original_unit_price,
        unit_cost, discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box, special_stock_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      item.id, item.invoiceId, item.productId, item.productName, item.productSku, item.productGrade,
      item.size, item.soldBy, item.quantityM2, item.quantityM2, item.baseUom, item.boxesCount, item.piecesCount,
      item.unitPrice, item.originalUnitPrice, round2(item.unitCost), item.discountAmount,
      item.totalPrice, item.totalCost, item.profit, item.metersPerBox, item.piecesPerBox, item.specialStockId
    ]);

    if (!item.tracksStock) continue;
    if (item.specialStockId) {
      const source = sqliteDb.query(`
        SELECT remaining_quantity_m2 AS remainingQuantityM2, status
        FROM inventory_special_stocks WHERE id = ?
      `, [item.specialStockId])[0];
      if (!source || source.status !== 'DOWNGRADED_SALE' || Number(source.remainingQuantityM2) < item.quantityM2) {
        throw new Error(`نفدت الكمية المتاحة من سجل البيع المخفض ${item.specialNumber || item.specialStockId}.`);
      }
      sqliteDb.run(`
        UPDATE inventory_special_stocks
        SET remaining_quantity_m2 = remaining_quantity_m2 - ?
        WHERE id = ? AND status = 'DOWNGRADED_SALE' AND remaining_quantity_m2 >= ?
      `, [item.quantityM2, item.specialStockId, item.quantityM2]);

      const txId = `tx_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          reference_id, notes, performed_by
        ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?, 'SPECIAL_STOCK_SALE', ?, ?, ?)
      `, [
        txId, sqliteDb.nextNumber('TX-SALE'), item.productId, dto.warehouseId,
        -item.quantityM2, -item.boxesCount, round2(item.unitCost), item.totalCost,
        item.id, `بيع مخزون مخفض ${item.specialNumber || ''} بموجب فاتورة ${invoiceNumber}`.trim(), actor.id
      ]);
      continue;
    }

    const stockUpdate = sqliteDb.query(
      `SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
      [item.productId, dto.warehouseId]
    )[0] as { id: string } | undefined;
    if (!stockUpdate) {
      throw new Error(`لا يوجد رصيد مخزني مسجل للصنف "${item.productName}" في المخزن المحدد.`);
    }

    sqliteDb.run(`
      UPDATE warehouse_stock
      SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
      WHERE product_id = ? AND warehouse_id = ?
    `, [item.quantityM2, item.productId, dto.warehouseId]);

    InventoryLocationStockService.release(sqliteDb, {
      warehouseId: dto.warehouseId,
      productId: item.productId,
      quantity: item.quantityM2,
      actorId: actor.id,
      reason: `بيع بموجب فاتورة ${invoiceNumber}`,
    });

    const txId = `tx_${uuidv4().substring(0, 8)}`;
    sqliteDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
        reference_id, notes, performed_by
      ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
    `, [
      txId, sqliteDb.nextNumber('TX-SALE'), item.productId, dto.warehouseId,
      -item.quantityM2, -item.boxesCount, round2(item.unitCost), item.totalCost,
      invoiceId, `بيع بموجب فاتورة ${invoiceNumber}`, actor.id
    ]);
    if (costingMethod === 'FIFO' && item.fifoPlan) InventoryCostingService.consumeFifo(sqliteDb, txId, item.fifoPlan);

    if (item.productType !== 'GENERAL') {
      const batchResult = new BatchService().deductFromBatches(item.productId, dto.warehouseId, item.quantityM2, { allowShortfall: allowNegativeStock });
      for (const allocation of batchResult.allocations) {
        sqliteDb.run(`
          INSERT INTO sales_invoice_batch_allocations (id, invoice_item_id, batch_id, quantity_m2)
          VALUES (?, ?, ?, ?)
        `, [`sba_${uuidv4().substring(0, 8)}`, item.id, allocation.batchId, allocation.quantityM2]);
      }
    }
  }
}

function resolvePayments(dto: CreateSaleDTO): { method: PaymentType; amount: number; reference?: string }[] {
  if (dto.payments && dto.payments.length > 0) {
    // ── CREDIT legs are NOT tender payments: they are the invoice's receivable
    // (remaining_amount on the invoice + customer balance). Posting them here
    // would double-count and break the ledger mapping (no CREDIT account exists).
    return dto.payments.filter((p) => p.amount > 0 && (p.method as PaymentType) !== 'CREDIT');
  }
  if (dto.paidAmount > 0) {
    return [{ method: dto.paymentType, amount: dto.paidAmount }];
  }
  return [];
}

function updateCustomerAndCash(
  sqliteDb: any,
  dto: CreateSaleDTO,
  totals: ReturnType<typeof computeSaleTotals>,
  cashRegisterId: string
): void {
  sqliteDb.run(`
    UPDATE customers SET
      total_purchases = total_purchases + ?,
      current_balance = current_balance + ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [totals.totalAmount, totals.remainingAmount, dto.customerId]);

  const payments = resolvePayments(dto);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  if (totalPaid <= 0) return;

  // Cash portion goes to the cash register drawer.
  const cashPortion = payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
  if (cashPortion > 0) {
    sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?`, [cashPortion, cashRegisterId]);
  }

  if (!dto.shiftId) return;

  // Aggregate per method into the shift buckets.
  const cashTotal = payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0);
  const cardTotal = payments.filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amount, 0);
  const transferTotal = payments.filter((p) => p.method === 'BANK_TRANSFER' || p.method === 'CHEQUE').reduce((s, p) => s + p.amount, 0);
  if (cashTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_cash = total_sales_cash + ? WHERE id = ?`, [cashTotal, dto.shiftId]);
  if (cardTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_card = total_sales_card + ? WHERE id = ?`, [cardTotal, dto.shiftId]);
  if (transferTotal > 0) sqliteDb.run(`UPDATE cash_shifts SET total_sales_transfer = total_sales_transfer + ? WHERE id = ?`, [transferTotal, dto.shiftId]);
}

function buildLedgerEntries(
  dto: CreateSaleDTO,
  totals: ReturnType<typeof computeSaleTotals>,
  inventoryCost: number,
  serviceCost = 0
): any[] {
  const payments = resolvePayments(dto);
  const paymentLines = payments.map((p) => ({
    accountCode: paymentAccountCode(p.method),
    debit: round2(p.amount),
    credit: 0,
  }));
  return [
    ...paymentLines,
    ...(totals.remainingAmount > 0 ? [{
      accountCode: '1103',
      debit: totals.remainingAmount,
      credit: 0,
    }] : []),
    {
      accountCode: '4101',
      debit: 0,
      credit: round2(totals.subtotal - totals.discountAmount),
    },
    ...(totals.shippingCost > 0 ? [{
      accountCode: '4102',
      debit: 0,
      credit: totals.shippingCost,
    }] : []),
    ...(totals.taxAmount > 0 ? [{
      accountCode: '2102',
      debit: 0,
      credit: totals.taxAmount,
    }] : []),
    ...(inventoryCost > 0 ? [
      { accountCode: '5101', debit: inventoryCost, credit: 0 },
      { accountCode: '1104', debit: 0, credit: inventoryCost },
    ] : []),
    // Service lines carry a real direct cost but no inventory asset to relieve.
    // Post it against an accrued-service liability so the entry stays balanced.
    ...(serviceCost > 0 ? [
      { accountCode: '5102', debit: serviceCost, credit: 0 },
      { accountCode: '2105', debit: 0, credit: serviceCost },
    ] : []),
  ];
}

export function createSalesInvoice(ctx: SalesContext, dto: CreateSaleDTO): SalesInvoice {
  assertSaleHasItems(dto);
  // حارس عدم الاتساق: مجموع أطر الدفع بعد الاستبعاد يجب أن يساوي المدفوع المعلن —
  // يمنع دفتر يومية غير متوازن قبل الدخول في المعاملة برسالة واضحة.
  const tenderPayments = resolvePayments(dto);
  const tenderSum = round2(tenderPayments.reduce((sum, payment) => sum + payment.amount, 0));
  if (Math.abs(tenderSum - round2(dto.paidAmount || 0)) > 0.01) {
    throw new Error(`المبلغ المدفوع (${round2(dto.paidAmount || 0).toFixed(2)}) لا يساوي مجموع أطر الدفع (${tenderSum.toFixed(2)}).`);
  }
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.sales.invoices.create');
  CentralUsageLimitService.assertWithin('maxInvoices');
  WarehouseTypePolicy.assertSellable(ctx.db, dto.warehouseId, 'البيع');
  const { branchId, cashRegisterId } = resolveCashRegister(ctx, dto, actor);
  const companyId = ctx.db.query<{ companyId: string | null }>(
    `SELECT b.company_id AS companyId FROM branches b WHERE b.id = ?`,
    [branchId]
  )[0]?.companyId ?? null;

  return ctx.db.executeTransaction((sqliteDb) => {
    const sysSettings = SettingsService.getSettings();
    const costingMethod = sysSettings.costingMethod;
    const allowNegativeStock = sysSettings.enableNegativeStock === true;
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const { preparedItems, totalLineDiscount } = prepareSaleItems(sqliteDb, dto, actor, costingMethod, trackInventory, allowNegativeStock);
    const headerDiscount = dto.discountAmount || 0;
    const totals = computeSaleTotals({
      lines: preparedItems.map((p) => ({
        lineTotal: p.totalPrice,
        lineCost: p.totalCost,
      })),
      discountAmount: headerDiscount,
      taxAmount: dto.taxAmount || 0,
      shippingCost: dto.shippingCost || 0,
      paidAmount: dto.paidAmount,
    });

    validateDiscountAndCredit(sqliteDb, dto, actor, totals, totalLineDiscount);

    // Without inventory tracking there is no inventory asset to relieve, so the
    // invoice-level cost and margin stay at zero. Line costs are still stored so
    // the business can see the direct cost of what it sold.
    const financialTotals = trackInventory
      ? totals
      : { ...totals, totalCost: 0, grossProfit: round2(totals.subtotal - totals.discountAmount) };

    const invoiceId = `inv_${uuidv4().substring(0, 8)}`;
    const invoiceNumber = sqliteDb.nextNumber('INV');
    const today = localDateString();

    const payments = resolvePayments(dto);
    const distinctMethods = new Set(payments.map((p) => p.method));
    const storedPaymentType = distinctMethods.size > 1 ? 'MIXED' : (payments[0]?.method || dto.paymentType);
    const dueDate = getDueDate(today, dto.customerId, sqliteDb, totals.remainingAmount);

    sqliteDb.run(`
      INSERT INTO sales_invoices (
        id, invoice_number, date, due_date, customer_id, warehouse_id, branch_id, company_id, shift_id, order_id, restaurant_order_id, project_id,
        subtotal, discount_percentage, discount_amount, tax_percentage, tax_amount,
        shipping_cost, total_amount, paid_amount, remaining_amount, payment_type,
        payment_status, invoice_status, total_cost, gross_profit, returned_amount, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, 0, ?, ?)
    `, [
      invoiceId, invoiceNumber, today, dueDate, dto.customerId, dto.warehouseId, branchId, companyId, dto.shiftId || null,
      dto.orderId || null, dto.restaurantOrderId || null, dto.projectId || null,
      totals.subtotal, dto.discountPercentage || 0, totals.discountAmount, dto.taxPercentage || 0, totals.taxAmount,
      totals.shippingCost, totals.totalAmount, totals.paidAmount, totals.remainingAmount, storedPaymentType,
      totals.paymentStatus, financialTotals.totalCost, financialTotals.grossProfit, dto.notes || null, actor.id
    ]);

    insertInvoiceItems(sqliteDb, dto, preparedItems, invoiceId, invoiceNumber, actor, costingMethod, allowNegativeStock);
    updateCustomerAndCash(sqliteDb, dto, totals, cashRegisterId);

    if (dto.loyaltyRedemption) {
      const { points, discountAmount } = dto.loyaltyRedemption;
      if (!Number.isSafeInteger(points) || points <= 0 || points > 1_000_000_000 || round2(discountAmount) !== points) {
        throw new Error('بيانات استبدال نقاط الولاء غير صحيحة.');
      }
      PermissionService.require(actor, 'ui.loyalty.program.redeem');
      if (sqliteDb.query<{ id: string }>(
        `SELECT id FROM loyalty_transactions WHERE customer_id = ? AND type = 'REDEEM'
         AND reference_type = 'SALES_INVOICE' AND reference_id = ? LIMIT 1`, [dto.customerId, invoiceId]
      ).length) throw new Error('Loyalty points were already redeemed for this invoice.');
      const loyalty = sqliteDb.query<{ currentPoints: number; totalPointsRedeemed: number }>(
        'SELECT current_points AS currentPoints, total_points_redeemed AS totalPointsRedeemed FROM customer_loyalty WHERE customer_id = ?',
        [dto.customerId]
      )[0];
      if (!loyalty || Number(loyalty.currentPoints) < points) throw new Error('رصيد نقاط الولاء غير كافٍ.');
      const now = new Date().toISOString();
      sqliteDb.run(`UPDATE customer_loyalty SET current_points = current_points - ?, total_points_redeemed = total_points_redeemed + ?, last_activity_at = ? WHERE customer_id = ? AND current_points >= ?`, [points, points, now, dto.customerId, points]);
      const updatedLoyalty = sqliteDb.query<{ currentPoints: number }>('SELECT current_points AS currentPoints FROM customer_loyalty WHERE customer_id = ?', [dto.customerId])[0];
      if (!updatedLoyalty || Number(updatedLoyalty.currentPoints) !== Number(loyalty.currentPoints) - points) {
        throw new Error('تعذر خصم نقاط الولاء؛ أُلغيت الفاتورة.');
      }
      sqliteDb.run(`INSERT INTO loyalty_transactions (id, customer_id, type, points, reference_type, reference_id, description, created_by, created_at) VALUES (?, ?, 'REDEEM', ?, 'SALES_INVOICE', ?, ?, ?, ?)`, [`ltx_${uuidv4().substring(0, 8)}`, dto.customerId, -points, invoiceId, `استبدال نقاط مقابل فاتورة ${invoiceNumber}`, actor.id, now]);
    }

    if (PermissionService.can(actor, 'ui.loyalty.program.earn')) {
      const earnedPoints = Math.floor(Number(totals.totalAmount || 0) / 10);
      if (earnedPoints > 0) {
        applyLoyaltyMovementInTransaction(sqliteDb, {
          customerId: dto.customerId,
          points: earnedPoints,
          type: 'EARN',
          referenceType: 'SALES_INVOICE',
          referenceId: invoiceId,
          description: `Points earned from invoice ${invoiceNumber}`,
          actor,
        });
      }
    }

    if (dto.promotionUsage) {
      const { promotionId, couponCode, discountAmount } = dto.promotionUsage;
      const promotion = sqliteDb.query<any>(`SELECT usage_limit AS usageLimit, usage_count AS usageCount, starts_at AS startsAt, ends_at AS endsAt, is_active AS isActive FROM promotions WHERE id = ?`, [promotionId])[0];
      const today = localDateString();
      if (!promotion || !promotion.isActive || promotion.startsAt > today || promotion.endsAt < today
        || (Number(promotion.usageLimit) > 0 && Number(promotion.usageCount) >= Number(promotion.usageLimit))) {
        throw new Error('العرض لم يعد صالحاً أو تجاوز حد الاستخدام؛ أُلغيت الفاتورة.');
      }
      sqliteDb.run('INSERT INTO promotion_usage (id, promotion_id, invoice_id, coupon_code, discount_amount) VALUES (?, ?, ?, ?, ?)', [`pu_${uuidv4().substring(0, 8)}`, promotionId, invoiceId, couponCode || null, discountAmount]);
      sqliteDb.run('UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ? AND (usage_limit IS NULL OR usage_limit = 0 OR usage_count < usage_limit)', [promotionId]);
      const currentUsage = sqliteDb.query<{ usageCount: number }>('SELECT usage_count AS usageCount FROM promotions WHERE id = ?', [promotionId])[0]?.usageCount;
      if (Number(currentUsage) !== Number(promotion.usageCount) + 1) throw new Error('تجاوز العرض حد الاستخدام بالتزامن؛ أُلغيت الفاتورة.');
    }

    // Persist split-payment breakdown (one row per method).
    for (const p of payments) {
      sqliteDb.run(
        `INSERT INTO sales_invoice_payments (id, invoice_id, method, amount, reference) VALUES (?, ?, ?, ?, ?)`,
        [`sip_${uuidv4().substring(0, 8)}`, invoiceId, p.method, round2(p.amount), p.reference || null]
      );
    }

    const inventoryCost = trackInventory
      ? round2(preparedItems.filter((item) => item.tracksStock).reduce((sum, item) => sum + item.totalCost, 0))
      : 0;
    // Any cost not relieved from inventory belongs to stock-free lines (services).
    const serviceCost = trackInventory ? round2(financialTotals.totalCost - inventoryCost) : 0;
    const ledgerLines = buildLedgerEntries(dto, financialTotals, inventoryCost, Math.max(0, serviceCost));
    const effects: Effect[] = [
      {
        type: 'ledger.post',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: {
            date: today,
            description: `Sale ${invoiceNumber}`,
            referenceType: 'SALES_INVOICE',
            referenceId: invoiceId,
            createdBy: actor.id,
            lines: ledgerLines,
          },
        },
      },
      {
        type: 'audit.log',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: {
            action: 'إنشاء فاتورة مبيعات',
            module: 'SALES',
            recordId: invoiceId,
            newValues: {
              invoiceNumber,
              customerId: dto.customerId,
              warehouseId: dto.warehouseId,
              itemsCount: preparedItems.length,
              totalAmount: totals.totalAmount,
              discountAmount: totals.discountAmount,
              taxAmount: totals.taxAmount,
              shippingCost: totals.shippingCost,
              paidAmount: totals.paidAmount,
              remainingAmount: totals.remainingAmount,
              paymentType: dto.paymentType,
            },
          },
        },
      },
      {
        type: 'sync.capture',
        payload: { aggregateType: 'sales_invoice', aggregateId: invoiceId, data: {} },
      },
    ];
    defaultEffectEngine.run({ db: sqliteDb, actorId: actor.id, actorName: actor.fullName }, effects);
    new PartnerService().allocateSaleProfit(sqliteDb, {
      invoiceId,
      invoiceNumber,
      companyId,
      branchId,
      transactionDate: today,
      profit: financialTotals.grossProfit,
      actorId: actor.id,
    });

    return ctx.getInvoiceById(invoiceId)!;
  });
}
