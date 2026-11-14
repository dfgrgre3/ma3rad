import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { SettingsService } from '../config/SettingsService';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { InventoryLocationStockService } from '../inventory/InventoryLocationStockService';
import { BatchService } from '../inventory/BatchService';
import { localDateString } from '../../../utils/shared/date';
import { getProductUnitLabel, isServiceProduct } from '../../../utils/products/productUnits';
import { convertQuantity } from '../../../utils/products/uom';
import { paymentAccountCode } from '../../../database/repositories/ledger';
import { getActiveBankAccount, updateBankBalance } from './paymentAccounts';
import { calculateDiscountedReturnAmount, calculateReturnTax, computeReturnImpact, round2 } from '../finance/financials';
import type { SalesReturn } from '../../../types';
import type { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { InvoiceWithItems, SalesContext } from './context';
import type { ReturnRequestItem, ReturnDisposition } from '../../../types/sales/serviceTypes';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { PartnerService } from '../customers/PartnerService';
import { CashShiftPolicyService } from '../finance/CashShiftPolicyService';
import { defaultEffectEngine } from '../effects/EffectEngine';
import type { Effect } from '../../../types/effects';
import '../effects/handlers/salesInvoiceHandlers';

type ReturnOptions = {
  registerId?: string;
  shiftId?: string;
  refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
  bankAccountId?: string;
  idempotencyKey?: string;
  requestFingerprint?: string;
};

interface ReturnTransactionParams {
  invoiceId: string;
  returnId: string;
  today: string;
  inv: InvoiceWithItems;
  items: ReturnRequestItem[];
  refundCash: boolean;
  options: ReturnOptions;
  actor: ReturnType<typeof AuthService.requireAuth>;
  trackInventory: boolean;
}

interface ReturnProduct {
  name: string;
  grade: string;
  size: string;
  metersPerBox: number;
  piecesPerBox: number;
  productType: string;
  baseUnit: string;
}

type AuthoritativeReturnItem = ReturnRequestItem & {
  returnAmount: number;
  /** Special-stock record the sold line came from, after source resolution. */
  resolvedSpecialStockId: string | null;
  /** Where the returned quantity must be placed. */
  resolvedDisposition: ReturnDisposition;
};

export function createSaleReturn(
  ctx: SalesContext,
  invoiceId: string,
  returnItems: ReturnRequestItem[],
  refundCash = true,
  _performedBy = 'usr_admin',
  options: ReturnOptions = {}
): SalesReturn {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'ui.returns.returns.create');
    if (refundCash) PermissionService.require(actor, 'ui.returns.returns.approve');
  const inv = ctx.getInvoiceById(invoiceId);
  if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
  if (inv.invoiceStatus === 'VOID') throw new Error('لا يمكن مرتجعة فاتورة ملغاة.');

  const refundMethod = options.refundMethod || 'CASH';
  const invoiceBranchId = ctx.branchAccess.requireWarehouseAccess(inv.warehouseId, actor);
  const normalizedItems = normalizeReturnUnits(ctx, returnItems);
  const fingerprintItems = normalizedItems.map((item) => ({
    productId: item.productId,
    invoiceItemId: item.invoiceItemId || null,
    quantityM2: round2(Number(item.quantityM2)),
    quantity: item.quantity == null ? null : round2(Number(item.quantity)),
    uom: item.uom || null,
    boxesCount: round2(Number(item.boxesCount || 0)),
    unitPrice: round2(Number(item.unitPrice || 0)),
    unitCost: round2(Number(item.unitCost || 0)),
    reason: item.reason || '',
    specialStockId: item.specialStockId || null,
    disposition: item.disposition || null,
  })).sort((left, right) => {
    const leftKey = JSON.stringify(left);
    const rightKey = JSON.stringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const requestFingerprint = JSON.stringify({
    invoiceId,
    refundCash: Boolean(refundCash),
    refundMethod,
    registerId: options.registerId || null,
    shiftId: options.shiftId || null,
    bankAccountId: options.bankAccountId || null,
    items: fingerprintItems,
  });

  const idempotencyKey = options.idempotencyKey;
  if (idempotencyKey) {
    const prior = ctx.db.query<any>(
      `SELECT id, return_number, original_invoice_id, original_invoice_number, customer_id, warehouse_id,
              date, total_amount, return_tax_amount, refunded_amount, remaining_to_balance, reason, refund_method,
              request_fingerprint, created_by, created_at
       FROM sales_returns WHERE idempotency_key = ?`,
      [idempotencyKey]
    )[0];
    if (prior) {
      if (prior.original_invoice_id !== invoiceId) {
        throw new Error('The sales return idempotency key was already used for a different invoice.');
      }
      if (!prior.request_fingerprint || prior.request_fingerprint !== requestFingerprint) {
        throw new Error('The sales return idempotency key was already used with different return details.');
      }
      return {
        id: prior.id,
        returnNumber: prior.return_number,
        originalInvoiceId: prior.original_invoice_id,
        originalInvoiceNumber: prior.original_invoice_number,
        customerId: prior.customer_id,
        warehouseId: prior.warehouse_id,
        date: prior.date,
        totalAmount: Number(prior.total_amount),
        returnTaxAmount: prior.return_tax_amount == null ? null : Number(prior.return_tax_amount),
        refundedAmount: Number(prior.refunded_amount),
        remainingToBalance: Number(prior.remaining_to_balance),
        reason: prior.reason,
        refundMethod: prior.refund_method,
        createdBy: prior.created_by,
        createdAt: prior.created_at,
      };
    }
  }

  options = { ...options, requestFingerprint };
  const requestedByProduct = validateReturnRequest(inv, normalizedItems);
  const returnId = `ret_${uuidv4().substring(0, 8)}`;
  const today = localDateString();
  const trackInventory = ModuleRegistryService.isInventoryTracked();

  return ctx.db.executeTransaction((sqliteDb) => {
    const currentState = sqliteDb.getDatabase().exec(
      `SELECT invoice_status FROM sales_invoices WHERE id = ?`, [invoiceId]
    )[0]?.values[0];
    if (!currentState || String(currentState[0]) === 'VOID') {
      throw new Error('لا يمكن إرجاع فاتورة ملغاة أو غير متاحة.');
    }
    const resolvedOptions = validateReturnShift(options, invoiceBranchId, refundMethod, refundCash, inv.paidAmount);
    return createReturnInTransaction(sqliteDb, {
      invoiceId,
      returnId,
      today,
      inv,
      items: normalizedItems,
      refundCash,
      options: { ...options, ...resolvedOptions },
      actor,
      trackInventory,
    }, requestedByProduct);
  });
}

function validateReturnShift(
  options: ReturnOptions,
  invoiceBranchId: string,
  refundMethod: NonNullable<ReturnOptions['refundMethod']>,
  refundCash: boolean,
  invoicePaidAmount: number
): ReturnOptions {
  const shift = new CashShiftPolicyService().resolve(invoiceBranchId, {
    shiftId: options.shiftId,
    registerId: options.registerId,
    required: refundMethod === 'CASH' && refundCash && Number(invoicePaidAmount || 0) > 0,
  });
  return { ...options, shiftId: shift.shiftId, registerId: shift.registerId || options.registerId };
}

/**
 * Converts return lines entered in a selling unit (e.g. "2 boxes") into base
 * units, mirroring sales. Lines without `uom` keep their historical meaning.
 */
function normalizeReturnUnits(ctx: SalesContext, returnItems: ReturnRequestItem[]): ReturnRequestItem[] {
  return (returnItems || []).map((item) => {
    const explicit = Boolean(item.uom) && item.quantity !== undefined && item.quantity !== null;
    if (!explicit) return item;
    const product = ctx.db.query<{
      name: string;
      baseUnit: string;
      customUnit: string;
      metersPerBox: number;
      piecesPerBox: number;
    }>(
      `SELECT name, base_unit AS baseUnit, custom_unit AS customUnit,
              meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox
       FROM products WHERE id = ?`,
      [item.productId]
    )[0];
    if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
    const baseUnit = product.baseUnit || 'M2';
    const baseQuantity = round2(convertQuantity(Number(item.quantity), String(item.uom), baseUnit, product));
    return { ...item, quantityM2: baseQuantity };
  });
}

function validateReturnRequest(
  inv: InvoiceWithItems,
  returnItems: ReturnRequestItem[]
): Map<string, number> {
  if (!returnItems || returnItems.length === 0) {
    throw new Error('حدد بنداً واحداً على الأقل للإرجاع.');
  }

  const requestedByProduct = new Map<string, number>();
  for (const item of returnItems) {
    const quantity = Number(item.quantityM2);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('كمية الإرجاع يجب أن تكون أكبر من صفر.');
    }
    if (!inv.items.some((invoiceItem) => invoiceItem.productId === item.productId)) {
      throw new Error('الصنف غير موجود في الفاتورة الأصلية.');
    }
    requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + quantity);
  }
  return requestedByProduct;
}

function createReturnInTransaction(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  requestedByProduct: Map<string, number>
): SalesReturn {
  const { invoiceId, returnId, today, inv, items, refundCash, options, actor } = params;
  validateReturnQuantities(sqliteDb, invoiceId, inv, requestedByProduct);
  const authoritativeItems = getAuthoritativeReturnItems(inv, items);
  validateReturnSourceQuantities(sqliteDb, invoiceId, authoritativeItems);
  const returnNumber = sqliteDb.nextNumber('RET');
  const totalReturnAmount = round2(authoritativeItems.reduce((sum, item) => sum + item.returnAmount, 0));
  const taxableInvoiceBase = Math.max(0, Number(inv.subtotal || 0) - Number(inv.discountAmount || 0));
  const returnTax = calculateReturnTax(totalReturnAmount, Number(inv.taxAmount || 0), taxableInvoiceBase);
  const totalReturnIncludingTax = round2(totalReturnAmount + returnTax);
  const refundMethod = options.refundMethod || 'CASH';
  const impact = computeReturnImpact({
    invoiceTotal: inv.totalAmount,
    invoicePaid: inv.paidAmount,
    returnTotal: totalReturnIncludingTax,
    refundCash: refundMethod === 'BALANCE' ? false : refundCash,
  });

  insertSalesReturn(sqliteDb, params, authoritativeItems, returnNumber, totalReturnAmount, returnTax, refundMethod, impact);
  const fifoEnabled = params.trackInventory && SettingsService.getSettings().costingMethod === 'FIFO';
  const returnCosts = processReturnItems(sqliteDb, params, authoritativeItems, fifoEnabled);
  updateCustomerAfterReturn(sqliteDb, inv.customerId, impact.balanceDelta, totalReturnIncludingTax);
  updateCashRegisterAfterReturn(sqliteDb, options, refundMethod, impact.cashRefund);
  if (impact.cashRefund > 0 && refundMethod === 'BANK_TRANSFER') {
    const bank = getActiveBankAccount(sqliteDb, options.bankAccountId);
    updateBankBalance(sqliteDb, bank.id, -impact.cashRefund);
  }

  // No stock was relieved when the sale was created, so a return must not
  // restore inventory value to the ledger.
  const returnedCost = params.trackInventory ? returnCosts.inventoryCost : 0;
  const returnedServiceCost = params.trackInventory ? returnCosts.serviceCost : 0;
  const ledgerLines = buildReturnLedgerLines(sqliteDb, params, totalReturnAmount, returnTax, impact, returnedCost, returnedServiceCost);
  updateShiftRefunds(sqliteDb, options.shiftId, refundMethod === 'CASH' ? impact.cashRefund : 0);
  updateInvoiceReturnedAmount(sqliteDb, invoiceId, totalReturnIncludingTax, impact.balanceDelta);

  const effects: Effect[] = [
    {
      type: 'ledger.post',
      payload: {
        aggregateType: 'sales_return',
        aggregateId: returnId,
        data: {
          date: today,
          description: `Sales return ${returnNumber}`,
          referenceType: 'SALES_RETURN',
          referenceId: returnId,
          createdBy: actor.id,
          lines: ledgerLines,
        },
      },
    },
    {
      type: 'audit.log',
      payload: {
        aggregateType: 'sales_return',
        aggregateId: returnId,
        data: { recordId: returnId, action: 'مرتجع مبيعات', module: 'SALES', newValues: { returnNumber, totalReturnAmount, refundMethod } },
      },
    },
    {
      type: 'sync.capture',
      payload: { aggregateType: 'sales_invoice', aggregateId: invoiceId, data: { operation: 'UPDATE' } },
    },
    {
      type: 'sync.capture',
      payload: { aggregateType: 'sales_return', aggregateId: returnId, data: { operation: 'CREATE' } },
    },
  ];
  defaultEffectEngine.run({ db: sqliteDb, actorId: actor.id, actorName: actor.fullName }, effects);
  const returnedTotals = sqliteDb.query<{ revenue: number; cost: number }>(`
    SELECT COALESCE(SUM(sri.total_refund), 0) AS revenue,
           COALESCE(SUM(sri.quantity_m2 * sri.unit_cost), 0) AS cost
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
    WHERE sr.original_invoice_id = ?
  `, [invoiceId])[0];
  const returnedProfit = Number(returnedTotals?.revenue || 0)
    - (params.trackInventory ? Number(returnedTotals?.cost || 0) : 0);
  const saleBranchId = sqliteDb.query<{ branchId: string }>(
    'SELECT branch_id AS branchId FROM sales_invoices WHERE id = ?',
    [invoiceId]
  )[0]?.branchId;
  if (!saleBranchId) throw new Error('تعذر تحديد فرع فاتورة البيع لتسوية أرباح الشركاء.');
  new PartnerService().adjustSaleProfitAllocation(sqliteDb, {
    invoiceId,
    invoiceNumber: inv.invoiceNumber,
    branchId: saleBranchId,
    transactionDate: today,
    invoiceProfit: Number(inv.grossProfit || 0),
    targetProfit: Math.max(0, round2(Number(inv.grossProfit || 0) - returnedProfit)),
    actorId: actor.id,
  });

  return {
    id: returnId,
    returnNumber,
    originalInvoiceId: inv.id,
    originalInvoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    warehouseId: inv.warehouseId,
    date: today,
    totalAmount: totalReturnAmount,
    returnTaxAmount: returnTax,
    refundedAmount: impact.cashRefund,
    remainingToBalance: impact.balanceDelta,
    reason: authoritativeItems[0]?.reason || 'مرتجع',
    refundMethod,
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
  };
}

function validateReturnQuantities(
  sqliteDb: DatabaseManager,
  invoiceId: string,
  inv: InvoiceWithItems,
  requestedByProduct: Map<string, number>
): void {
  for (const [productId, requested] of requestedByProduct) {
    const soldLines = inv.items.filter((item) => item.productId === productId);
    const sold = soldLines.reduce((sum, item) => sum + Number(item.quantityM2 || 0), 0);
    const alreadyReturned = Number(sqliteDb.query<{ q: number }>(
      `SELECT COALESCE(SUM(sri.quantity_m2),0) AS q FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       WHERE sr.original_invoice_id = ? AND sri.product_id = ?`, [invoiceId, productId]
    )[0]?.q || 0);
    if (requested + alreadyReturned > sold + 1e-6) {
      const unitLabel = getProductUnitLabel(soldLines[0]);
      throw new Error(`لا يمكن إرجاع كمية أكبر من المباعة للصنف (المباع: ${sold} ${unitLabel}، المُرجع سابقاً: ${alreadyReturned} ${unitLabel}).`);
    }
  }
}

function getAuthoritativeReturnItems(
  inv: InvoiceWithItems,
  returnItems: ReturnRequestItem[]
): AuthoritativeReturnItem[] {
  return returnItems.map((item) => {
    if (!item.invoiceItemId) {
      throw new Error('يجب تحديد سطر الفاتورة الأصلي لكل بند مرتجع.');
    }
    const requestedSource = item.specialStockId ? String(item.specialStockId) : null;
    const allSoldLines = inv.items.filter((line) => line.productId === item.productId);
    if (!allSoldLines.length) {
      throw new Error('الصنف غير موجود في الفاتورة الأصلية.');
    }
    const invoiceItemLine = item.invoiceItemId
      ? inv.items.find((line) => line.id === item.invoiceItemId && line.productId === item.productId)
      : undefined;
    if (item.invoiceItemId && !invoiceItemLine) {
      throw new Error('سطر الفاتورة الأصلي غير موجود أو لا يطابق الصنف المحدد.');
    }
    if (invoiceItemLine && item.sourceType === 'REGULAR' && invoiceItemLine.specialStockId) {
      throw new Error('سطر الفاتورة المحدد تابع لمخزون مخفض وليس للمخزون العادي.');
    }
    if (invoiceItemLine && item.sourceType === 'SPECIAL'
      && (invoiceItemLine.specialStockId || null) !== requestedSource) {
      throw new Error('معرف المخزون الخاص لا يطابق سطر الفاتورة المحدد.');
    }
    if (item.sourceType === 'SPECIAL' && !requestedSource) {
      throw new Error('يجب تحديد سجل المخزون الخاص للمصدر المخفض.');
    }
    if (item.sourceType === 'REGULAR' && requestedSource) {
      throw new Error('لا يتطابق معرف المخزون الخاص مع مصدر السطر العادي.');
    }
    const soldLines = invoiceItemLine
      ? [invoiceItemLine]
      : item.sourceType === 'REGULAR'
      ? allSoldLines.filter((line) => !line.specialStockId)
      : requestedSource
        ? allSoldLines.filter((line) => (line.specialStockId || null) === requestedSource)
        : allSoldLines;
    if (!soldLines.length) {
      throw new Error('سجل المخزون المخفض المحدد لا يطابق بنداً في الفاتورة الأصلية.');
    }
    const sources = new Set<string | null>(soldLines.map((line) => line.specialStockId || null));
    if (!item.sourceType && !requestedSource && sources.size > 1) {
      throw new Error('الصنف مسجّل في الفاتورة من أكثر من مصدر (مخزون عادي وسجل بيع مخفض). حدد المصدر المُرجع.');
    }
    const resolvedSpecialStockId = item.sourceType === 'REGULAR' ? null : requestedSource || (sources.size === 1 ? [...sources][0] : null);
    const resolvedDisposition: ReturnDisposition = item.disposition
      || (resolvedSpecialStockId ? 'SPECIAL_STOCK' : 'RESTOCK');
    if (resolvedDisposition === 'SPECIAL_STOCK' && !resolvedSpecialStockId) {
      throw new Error('لا يمكن إعادة صنف إلى المخزون الخاص دون تحديد سجل المصدر.');
    }
    const soldQuantity = soldLines.reduce((sum, line) => sum + Number(line.quantityM2 || 0), 0);
    const weightedPrice = (key: 'unitPrice' | 'unitCost') => soldQuantity > 0
      ? soldLines.reduce((sum, line) => sum + Number(line[key] || 0) * Number(line.quantityM2 || 0), 0) / soldQuantity
      : 0;
    return {
      ...item,
      unitPrice: round2(weightedPrice('unitPrice')),
      unitCost: round2(weightedPrice('unitCost')),
      resolvedSpecialStockId,
      resolvedDisposition,
      returnAmount: calculateDiscountedReturnAmount(
        item.quantityM2,
        soldLines.map((line) => ({
          quantity: Number(line.quantityM2 || 0),
          totalPrice: Number(line.totalPrice || 0),
          unitPrice: Number(line.unitPrice || 0),
          discountAmount: Number(line.discountAmount || 0),
        })),
        Number(inv.subtotal || 0),
        Number(inv.discountAmount || 0)
      ),
    };
  });
}

/**
 * Returning a discounted-sale line must never consume the allowance of the
 * regular stock line (or of another discounted batch). The source is part of
 * the returned quantity's identity.
 */
function validateReturnSourceQuantities(
  sqliteDb: DatabaseManager,
  invoiceId: string,
  items: AuthoritativeReturnItem[]
): void {
  const requestedBySource = new Map<string, number>();
  const requestedByInvoiceLine = new Map<string, number>();
  for (const item of items) {
    if (item.invoiceItemId) requestedByInvoiceLine.set(item.invoiceItemId,
      (requestedByInvoiceLine.get(item.invoiceItemId) || 0) + Number(item.quantityM2 || 0));
    const key = `${item.productId}|${item.resolvedSpecialStockId || ''}`;
    requestedBySource.set(key, (requestedBySource.get(key) || 0) + Number(item.quantityM2 || 0));
  }
  for (const [invoiceItemId, requested] of requestedByInvoiceLine) {
    const sold = Number(sqliteDb.query<{ q: number }>(
      'SELECT quantity_m2 AS q FROM sales_invoice_items WHERE id = ? AND invoice_id = ?',
      [invoiceItemId, invoiceId]
    )[0]?.q || 0);
    const alreadyReturned = Number(sqliteDb.query<{ q: number }>(
      'SELECT COALESCE(SUM(quantity_m2), 0) AS q FROM sales_return_items WHERE invoice_item_id = ?',
      [invoiceItemId]
    )[0]?.q || 0);
    if (sold <= 0 || requested + alreadyReturned > sold + 1e-6) {
      throw new Error('كمية الإرجاع تتجاوز الكمية القابلة للإرجاع من سطر الفاتورة المحدد.');
    }
  }
  for (const [key, requested] of requestedBySource) {
    const [productId, specialStockId] = key.split('|');
    const sold = Number(sqliteDb.query<{ q: number }>(`
      SELECT COALESCE(SUM(quantity_m2), 0) AS q FROM sales_invoice_items
      WHERE invoice_id = ? AND product_id = ? AND special_stock_id IS ?
    `, [invoiceId, productId, specialStockId || null])[0]?.q || 0);
    const alreadyReturned = Number(sqliteDb.query<{ q: number }>(`
      SELECT COALESCE(SUM(sri.quantity_m2), 0) AS q
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.return_id
      WHERE sr.original_invoice_id = ? AND sri.product_id = ? AND sri.special_stock_id IS ?
    `, [invoiceId, productId, specialStockId || null])[0]?.q || 0);
    if (requested + alreadyReturned > sold + 1e-6) {
      throw new Error('كمية الإرجاع من سجل المخزون المخفض تتجاوز الكمية المباعة منه في الفاتورة.');
    }
  }
}

function insertSalesReturn(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  items: ReturnRequestItem[],
  returnNumber: string,
  totalReturnAmount: number,
  returnTaxAmount: number,
  refundMethod: NonNullable<ReturnOptions['refundMethod']>,
  impact: ReturnType<typeof computeReturnImpact>
): void {
  const { inv, returnId, today, options, actor } = params;
  sqliteDb.run(`
    INSERT INTO sales_returns (
      id, return_number, original_invoice_id, original_invoice_number, customer_id,
      warehouse_id, date, total_amount, return_tax_amount, refunded_amount, remaining_to_balance, reason,
      register_id, shift_id, refund_method, created_by, idempotency_key, request_fingerprint, refund_bank_account_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    returnId, returnNumber, inv.id, inv.invoiceNumber, inv.customerId,
    inv.warehouseId, today, totalReturnAmount, returnTaxAmount, impact.cashRefund, impact.balanceDelta,
    items[0]?.reason || 'مرتجع سيراميك',
    impact.cashRefund > 0 && refundMethod === 'CASH' ? options.registerId : null,
    options.shiftId || null, refundMethod, actor.id, options.idempotencyKey || null,
    options.requestFingerprint || null,
    refundMethod === 'BANK_TRANSFER' ? options.bankAccountId || null : null,
  ]);
}

function processReturnItems(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  items: AuthoritativeReturnItem[],
  fifoEnabled: boolean
): { inventoryCost: number; serviceCost: number } {
  let inventoryCost = 0;
  let serviceCost = 0;
  for (const item of items) {
    const costs = processReturnItem(sqliteDb, params, item, fifoEnabled);
    inventoryCost = round2(inventoryCost + costs.inventoryCost);
    serviceCost = round2(serviceCost + costs.serviceCost);
  }
  return { inventoryCost, serviceCost };
}

function processReturnItem(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  item: AuthoritativeReturnItem,
  fifoEnabled: boolean
): { inventoryCost: number; serviceCost: number } {
  const { invoiceId, returnId, inv, actor } = params;
  const lineTotal = item.returnAmount;
  const product = sqliteDb.query<ReturnProduct>(
    `SELECT name, grade, meters_per_box, pieces_per_box, size, product_type, base_unit FROM products WHERE id = ?`,
    [item.productId]
  )[0];
  if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);

  const boxesCount = getReturnedBoxesCount(product, item.quantityM2);
  const serviceLine = isServiceProduct({ productType: product.productType, baseUnit: product.baseUnit });
  const specialStockId = item.resolvedSpecialStockId;
  const disposition = item.resolvedDisposition;
  // Special-stock sales never consumed FIFO layers or regular stock, so their
  // cost comes from the invoice line and must not be restored through FIFO.
  // Quarantined/damaged returns are also kept out of the saleable pool.
  const shouldRestoreFifo = fifoEnabled && !serviceLine
    && !specialStockId && disposition === 'RESTOCK';
  const actualCost = shouldRestoreFifo
    ? InventoryCostingService.restoreInvoiceIssue(sqliteDb, invoiceId, item.productId, item.quantityM2, item.invoiceItemId)
    : 0;
  const unitCost = shouldRestoreFifo
    ? round2(actualCost / item.quantityM2)
    : item.unitCost > 0 ? item.unitCost : 0;
  const returnItemId = `ritem_${uuidv4().substring(0, 8)}`;
  insertSalesReturnItem(
    sqliteDb, item, product, returnId, returnItemId, boxesCount, unitCost, lineTotal,
    specialStockId, disposition,
  );
  if (params.trackInventory && !serviceLine) {
    if (disposition === 'SPECIAL_STOCK') {
      restoreToSpecialStock(sqliteDb, params, item, product, returnItemId, specialStockId!, unitCost, boxesCount);
    } else if (disposition === 'QUARANTINE' || disposition === 'DAMAGED') {
      holdReturnedAsSpecialStock(sqliteDb, params, item, product, returnItemId, disposition, unitCost, boxesCount);
    } else {
      restoreReturnStock(sqliteDb, inv.warehouseId, item, product, actor.id);
      insertReturnInventoryTransaction(sqliteDb, params, item, returnId, boxesCount, unitCost);

      if (product.productType !== 'GENERAL') {
        new BatchService().restoreForSaleReturn({
          returnItemId,
          invoiceId,
          productId: item.productId,
          warehouseId: inv.warehouseId,
          quantityM2: item.quantityM2,
          costPrice: unitCost,
          performedBy: actor.id,
          reason: item.reason,
        });
      }
    }
  }
  // Service lines posted a direct cost against accrued service costs at sale
  // time (5102/2105); a return must reverse the proportional amount.
  const serviceCost = serviceLine ? round2(item.quantityM2 * (item.unitCost || 0)) : 0;
  return {
    inventoryCost: shouldRestoreFifo ? actualCost : (serviceLine ? 0 : round2(item.quantityM2 * unitCost)),
    serviceCost,
  };
}

function getReturnedBoxesCount(product: ReturnProduct, quantityM2: number): number {
  const metersPerBox = Number(product.metersPerBox) || 1.44;
  if (product.productType !== 'GENERAL') return round2(quantityM2 / metersPerBox);
  return product.baseUnit === 'BOX' ? round2(quantityM2) : 0;
}

function insertSalesReturnItem(
  sqliteDb: DatabaseManager,
  item: ReturnRequestItem,
  product: ReturnProduct,
  returnId: string,
  returnItemId: string,
  boxesCount: number,
  unitCost: number,
  lineTotal: number,
  specialStockId: string | null,
  disposition: ReturnDisposition,
): void {
  sqliteDb.run(`
    INSERT INTO sales_return_items (
      id, return_id, invoice_item_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund,
      source_type, special_stock_id, disposition
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    returnItemId, returnId, item.invoiceItemId || null, item.productId, product.name, product.grade,
    item.quantityM2, boxesCount, item.unitPrice, unitCost, lineTotal,
    specialStockId ? 'SPECIAL_STOCK_SALE' : 'INVOICE', specialStockId, disposition,
  ]);
}

/**
 * Returns the quantity to the special-stock record it was sold from. Its cost
 * was already carved out of the regular warehouse, so this restores the
 * remaining quantity without touching regular stock or FIFO layers.
 */
function restoreToSpecialStock(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  item: AuthoritativeReturnItem,
  product: ReturnProduct,
  returnItemId: string,
  specialStockId: string,
  unitCost: number,
  boxesCount: number,
): void {
  const source = sqliteDb.query<{ id: string; quantityM2: number }>(`
    SELECT id, quantity_m2 AS quantityM2 FROM inventory_special_stocks WHERE id = ?
  `, [specialStockId])[0];
  if (!source) throw new Error('سجل المخزون الخاص المرتبط بالصنف غير موجود.');
  sqliteDb.run(`
    UPDATE inventory_special_stocks
    SET remaining_quantity_m2 = MIN(quantity_m2, remaining_quantity_m2 + ?)
    WHERE id = ?
  `, [item.quantityM2, specialStockId]);
  insertReturnInventoryTransaction(sqliteDb, params, item, returnItemId, boxesCount, unitCost, {
    referenceType: 'SPECIAL_STOCK_RETURN',
    referenceId: specialStockId,
    notes: `مرتجع بيع مخفض إلى السجل ${specialStockId}`,
  });
}

/**
 * Holds a returned item outside the saleable pool until its state is decided:
 * a new special-stock record (quarantine or damaged) is created instead of
 * silently returning it to regular stock.
 */
function holdReturnedAsSpecialStock(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  item: AuthoritativeReturnItem,
  product: ReturnProduct,
  returnItemId: string,
  disposition: 'QUARANTINE' | 'DAMAGED',
  unitCost: number,
  boxesCount: number,
): void {
  const { inv, actor } = params;
  const specialId = `spc_${uuidv4().substring(0, 8)}`;
  const category = disposition === 'DAMAGED' ? 'DAMAGED' : 'QUARANTINE_INSPECTION';
  sqliteDb.run(`
    INSERT INTO inventory_special_stocks (
      id, special_number, warehouse_id, product_id, category,
      quantity_m2, boxes_count, unit_cost, total_cost, status,
      source_type, source_id, inspection_notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', 'SALES_RETURN', ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    specialId, sqliteDb.nextNumber('SPC'), inv.warehouseId, item.productId, category,
    item.quantityM2, boxesCount, unitCost, round2(item.quantityM2 * unitCost),
    returnItemId, `مرتجع مبيعات محتفظ به (${disposition}): ${item.reason || ''}`.trim(), actor.id,
  ]);
  insertReturnInventoryTransaction(sqliteDb, params, item, returnItemId, boxesCount, unitCost, {
    referenceType: 'SPECIAL_STOCK_RETURN_HOLD',
    referenceId: specialId,
    notes: `مرتجع مبيعات محتفظ به خارج المخزون المتاح (${category})`,
  });
}

function restoreReturnStock(
  sqliteDb: DatabaseManager,
  warehouseId: string,
  item: ReturnRequestItem,
  product: ReturnProduct,
  actorId: string,
): void {
  const stockRow = sqliteDb.query<{ productId: string }>(
    `SELECT product_id AS productId FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
    [item.productId, warehouseId]
  )[0];
  if (!stockRow) throw new Error(`لا يوجد سجل مخزون للصنف ${product.name} في مخزن الفاتورة.`);
  sqliteDb.run(`
    UPDATE warehouse_stock
    SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
    WHERE product_id = ? AND warehouse_id = ?
  `, [item.quantityM2, item.productId, warehouseId]);

  InventoryLocationStockService.receive(sqliteDb, {
    warehouseId,
    productId: item.productId,
    quantity: item.quantityM2,
    actorId,
    reason: `مرتجع مبيعات للصنف ${product.name}`,
  });
}

function insertReturnInventoryTransaction(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  item: ReturnRequestItem,
  returnId: string,
  boxesCount: number,
  unitCost: number,
  reference: { referenceType: string; referenceId: string; notes?: string } = {
    referenceType: 'INVOICE',
    referenceId: returnId,
  },
): void {
  const { inv, actor } = params;
  sqliteDb.run(`
    INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id,
      quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
      reference_id, notes, performed_by
    ) VALUES (?, ?, 'SALES_RETURN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-RET'),
    item.productId, inv.warehouseId, item.quantityM2, boxesCount, unitCost,
    round2(item.quantityM2 * unitCost), reference.referenceType, reference.referenceId,
    reference.notes || `مرتجع مبيعات للفاتورة ${inv.invoiceNumber}`, actor.id,
  ]);
}

function updateCustomerAfterReturn(
  sqliteDb: DatabaseManager,
  customerId: string,
  balanceDelta: number,
  totalReturnAmount: number
): void {
  sqliteDb.run(`
    UPDATE customers SET
      current_balance = current_balance - ?,
      total_purchases = total_purchases - ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [balanceDelta, totalReturnAmount, customerId]);
}

function updateCashRegisterAfterReturn(
  sqliteDb: DatabaseManager,
  options: ReturnOptions,
  refundMethod: NonNullable<ReturnOptions['refundMethod']>,
  cashRefund: number
): void {
  if (cashRefund > 0 && refundMethod === 'CASH') {
    if (!options.registerId) throw new Error('يجب تحديد خزينة الفرع للمرتجع النقدي.');
    sqliteDb.run(
      `UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`,
      [cashRefund, options.registerId]
    );
  }
}

function buildReturnLedgerLines(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  totalReturnAmount: number,
  taxReduction: number,
  impact: ReturnType<typeof computeReturnImpact>,
  returnedCost: number,
  returnedServiceCost = 0
): any[] {
  const refundAccount = impact.cashRefund > 0
    ? params.options.refundMethod === 'BANK_TRANSFER'
      ? getActiveBankAccount(sqliteDb, params.options.bankAccountId).glAccountCode
      : paymentAccountCode(params.options.refundMethod || 'CASH')
    : undefined;
  const lines = [
    { accountCode: '4101', debit: totalReturnAmount, credit: 0 },
  ];
  if (taxReduction > 0) lines.push({ accountCode: '2102', debit: taxReduction, credit: 0 });
  if (impact.balanceDelta > 0) lines.push({ accountCode: '1103', debit: 0, credit: impact.balanceDelta });
  if (refundAccount) lines.push({ accountCode: refundAccount, debit: 0, credit: impact.cashRefund });
  if (returnedCost > 0) {
    lines.push({ accountCode: '1104', debit: returnedCost, credit: 0 });
    lines.push({ accountCode: '5101', debit: 0, credit: returnedCost });
  }
  if (returnedServiceCost > 0) {
    lines.push({ accountCode: '2105', debit: returnedServiceCost, credit: 0 });
    lines.push({ accountCode: '5102', debit: 0, credit: returnedServiceCost });
  }
  return lines;
}

function updateShiftRefunds(
  sqliteDb: DatabaseManager,
  shiftId: string | undefined,
  cashRefund: number
): void {
  if (!shiftId) return;
  sqliteDb.run(
    `UPDATE cash_shifts SET total_refunds = total_refunds + ? WHERE id = ?`,
    [cashRefund, shiftId]
  );
}

function updateInvoiceReturnedAmount(
  sqliteDb: DatabaseManager,
  invoiceId: string,
  totalReturnAmount: number,
  balanceDelta: number
): void {
  sqliteDb.run(
    `UPDATE sales_invoices SET
     returned_amount = COALESCE(returned_amount, 0) + ?,
     remaining_amount = MAX(0, COALESCE(remaining_amount, 0) - ?),
     payment_status = CASE
       WHEN MAX(0, COALESCE(remaining_amount, 0) - ?) <= 0.009 THEN 'PAID'
       WHEN COALESCE(paid_amount, 0) > 0 THEN 'PARTIAL'
       ELSE 'UNPAID'
     END,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [totalReturnAmount, balanceDelta, balanceDelta, invoiceId]
  );
}
