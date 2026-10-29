import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../AuthService';
import { PermissionService } from '../PermissionService';
import { SettingsService } from '../SettingsService';
import { InventoryCostingService } from '../InventoryCostingService';
import { BatchService } from '../BatchService';
import { localDateString } from '../../utils/date';
import { getProductUnitLabel, isServiceProduct } from '../../utils/productUnits';
import { convertQuantity } from '../../utils/uom';
import { paymentAccountCode, postLedgerEntry } from '../../database/ledger';
import { computeReturnImpact, round2 } from '../financials';
import type { SalesReturn } from '../../types';
import type { DatabaseManager } from '../../database/db';
import type { InvoiceWithItems, SalesContext } from './context';
import type { ReturnRequestItem } from './types';
import { ModuleRegistryService } from '../ModuleRegistryService';

type ReturnOptions = {
  registerId?: string;
  shiftId?: string;
  refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
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

export function createSaleReturn(
  ctx: SalesContext,
  invoiceId: string,
  returnItems: ReturnRequestItem[],
  refundCash = true,
  performedBy = 'usr_admin',
  options: ReturnOptions = {}
): SalesReturn {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.refund');
  const inv = ctx.getInvoiceById(invoiceId);
  if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
  if (inv.invoiceStatus === 'VOID') throw new Error('لا يمكن مرتجعة فاتورة ملغاة.');

  const normalizedItems = normalizeReturnUnits(ctx, returnItems);
  const requestedByProduct = validateReturnRequest(inv, normalizedItems);
  const returnId = `ret_${uuidv4().substring(0, 8)}`;
  const today = localDateString();
  const trackInventory = ModuleRegistryService.isInventoryTracked();

  return ctx.db.executeTransaction((sqliteDb) => createReturnInTransaction(sqliteDb, {
    invoiceId,
    returnId,
    today,
    inv,
    items: normalizedItems,
    refundCash,
    options,
    actor,
    trackInventory,
  }, requestedByProduct));
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
  const returnNumber = sqliteDb.nextNumber('RET');
  const totalReturnAmount = round2(authoritativeItems.reduce(
    (sum, item) => sum + round2(item.quantityM2 * item.unitPrice),
    0
  ));
  const refundMethod = options.refundMethod || 'CASH';
  const impact = computeReturnImpact({
    invoiceTotal: inv.totalAmount,
    invoicePaid: inv.paidAmount,
    returnTotal: totalReturnAmount,
    refundCash: refundMethod === 'BALANCE' ? false : refundCash,
  });

  insertSalesReturn(sqliteDb, params, authoritativeItems, returnNumber, totalReturnAmount, refundMethod, impact);
  const fifoEnabled = params.trackInventory && SettingsService.getSettings().costingMethod === 'FIFO';
  const returnCosts = processReturnItems(sqliteDb, params, authoritativeItems, fifoEnabled);
  updateCustomerAfterReturn(sqliteDb, inv.customerId, impact.balanceDelta, totalReturnAmount);
  updateCashRegisterAfterReturn(sqliteDb, options, refundMethod, impact.cashRefund);

  // No stock was relieved when the sale was created, so a return must not
  // restore inventory value to the ledger.
  const returnedCost = params.trackInventory ? returnCosts.inventoryCost : 0;
  const returnedServiceCost = params.trackInventory ? returnCosts.serviceCost : 0;
  postReturnLedger(sqliteDb, params, returnId, returnNumber, totalReturnAmount, impact, returnedCost, returnedServiceCost);
  updateShiftRefunds(sqliteDb, options.shiftId, impact.cashRefund);
  updateInvoiceReturnedAmount(sqliteDb, invoiceId, totalReturnAmount);
  insertReturnAuditLog(sqliteDb, params, returnId, returnNumber, totalReturnAmount, impact.cashRefund);

  return {
    id: returnId,
    returnNumber,
    originalInvoiceId: inv.id,
    originalInvoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    warehouseId: inv.warehouseId,
    date: today,
    totalAmount: totalReturnAmount,
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
): ReturnRequestItem[] {
  return returnItems.map((item) => {
    const soldLines = inv.items.filter((line) => line.productId === item.productId);
    const soldQuantity = soldLines.reduce((sum, line) => sum + Number(line.quantityM2 || 0), 0);
    const weightedPrice = (key: 'unitPrice' | 'unitCost') => soldQuantity > 0
      ? soldLines.reduce((sum, line) => sum + Number(line[key] || 0) * Number(line.quantityM2 || 0), 0) / soldQuantity
      : 0;
    return {
      ...item,
      unitPrice: round2(weightedPrice('unitPrice')),
      unitCost: round2(weightedPrice('unitCost')),
    };
  });
}

function insertSalesReturn(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  items: ReturnRequestItem[],
  returnNumber: string,
  totalReturnAmount: number,
  refundMethod: NonNullable<ReturnOptions['refundMethod']>,
  impact: ReturnType<typeof computeReturnImpact>
): void {
  const { inv, returnId, today, options, actor } = params;
  sqliteDb.run(`
    INSERT INTO sales_returns (
      id, return_number, original_invoice_id, original_invoice_number, customer_id,
      warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason,
      register_id, shift_id, refund_method, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    returnId, returnNumber, inv.id, inv.invoiceNumber, inv.customerId,
    inv.warehouseId, today, totalReturnAmount, impact.cashRefund, impact.balanceDelta,
    items[0]?.reason || 'مرتجع سيراميك',
    options.registerId || (impact.cashRefund > 0 && refundMethod === 'CASH' ? 'cr_main' : null),
    options.shiftId || null, refundMethod, actor.id,
  ]);
}

function processReturnItems(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  items: ReturnRequestItem[],
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
  item: ReturnRequestItem,
  fifoEnabled: boolean
): { inventoryCost: number; serviceCost: number } {
  const { invoiceId, returnId, inv, actor } = params;
  const lineTotal = round2(item.quantityM2 * item.unitPrice);
  const product = sqliteDb.query<ReturnProduct>(
    `SELECT name, grade, meters_per_box, pieces_per_box, size, product_type, base_unit FROM products WHERE id = ?`,
    [item.productId]
  )[0];
  if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);

  const boxesCount = getReturnedBoxesCount(product, item.quantityM2);
  const serviceLine = isServiceProduct({ productType: product.productType, baseUnit: product.baseUnit });
  const itemFifoEnabled = fifoEnabled && !serviceLine;
  const actualCost = itemFifoEnabled
    ? InventoryCostingService.restoreInvoiceIssue(sqliteDb, invoiceId, item.productId, item.quantityM2)
    : 0;
  const unitCost = itemFifoEnabled
    ? round2(actualCost / item.quantityM2)
    : item.unitCost > 0 ? item.unitCost : 0;
  const returnItemId = `ritem_${uuidv4().substring(0, 8)}`;
  insertSalesReturnItem(sqliteDb, item, product, returnId, returnItemId, boxesCount, unitCost, lineTotal);
  if (params.trackInventory && !serviceLine) {
    restoreReturnStock(sqliteDb, inv.warehouseId, item, product);
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
  // Service lines posted a direct cost against accrued service costs at sale
  // time (5102/2105); a return must reverse the proportional amount.
  const serviceCost = serviceLine ? round2(item.quantityM2 * (item.unitCost || 0)) : 0;
  return {
    inventoryCost: itemFifoEnabled ? actualCost : (serviceLine ? 0 : round2(item.quantityM2 * unitCost)),
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
  lineTotal: number
): void {
  sqliteDb.run(`
    INSERT INTO sales_return_items (
      id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    returnItemId, returnId, item.productId, product.name, product.grade,
    item.quantityM2, boxesCount, item.unitPrice, unitCost, lineTotal,
  ]);
}

function restoreReturnStock(
  sqliteDb: DatabaseManager,
  warehouseId: string,
  item: ReturnRequestItem,
  product: ReturnProduct
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
}

function insertReturnInventoryTransaction(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  item: ReturnRequestItem,
  returnId: string,
  boxesCount: number,
  unitCost: number
): void {
  const { inv, actor } = params;
  sqliteDb.run(`
    INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id,
      quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
      reference_id, notes, performed_by
    ) VALUES (?, ?, 'SALES_RETURN', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
  `, [
    `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-RET'),
    item.productId, inv.warehouseId, item.quantityM2, boxesCount, unitCost,
    round2(item.quantityM2 * unitCost), returnId,
    `مرتجع مبيعات للفاتورة ${inv.invoiceNumber}`, actor.id,
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
    sqliteDb.run(
      `UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`,
      [cashRefund, options.registerId || 'cr_main']
    );
  }
}

function postReturnLedger(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  returnId: string,
  returnNumber: string,
  totalReturnAmount: number,
  impact: ReturnType<typeof computeReturnImpact>,
  returnedCost: number,
  returnedServiceCost = 0
): void {
  const { today, actor, inv } = params;
  const taxReduction = inv.totalAmount > 0
    ? round2(totalReturnAmount * Number(inv.taxAmount || 0) / inv.totalAmount)
    : 0;
  const refundAccount = impact.cashRefund > 0 ? paymentAccountCode(params.options.refundMethod || 'CASH') : undefined;
  const lines = [
    { accountCode: '4101', debit: round2(totalReturnAmount - taxReduction), credit: 0 },
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
  postLedgerEntry(sqliteDb.getDatabase(), {
    date: today,
    description: `Sales return ${returnNumber}`,
    referenceType: 'SALES_RETURN',
    referenceId: returnId,
    createdBy: actor.id,
    lines,
  });
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
  totalReturnAmount: number
): void {
  sqliteDb.run(
    `UPDATE sales_invoices SET returned_amount = COALESCE(returned_amount, 0) + ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [totalReturnAmount, invoiceId]
  );
}

function insertReturnAuditLog(
  sqliteDb: DatabaseManager,
  params: ReturnTransactionParams,
  returnId: string,
  returnNumber: string,
  totalReturnAmount: number,
  cashRefund: number
): void {
  const { actor, inv } = params;
  sqliteDb.run(`
    INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
    VALUES (?, ?, ?, 'مرتجع مبيعات', 'SALES', ?, ?)
  `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, returnId, JSON.stringify({
    returnNumber, totalReturnAmount, cashRefund, invoiceNumber: inv.invoiceNumber,
  })]);
}
