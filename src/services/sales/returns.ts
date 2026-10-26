import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../AuthService';
import { PermissionService } from '../PermissionService';
import { SettingsService } from '../SettingsService';
import { InventoryCostingService } from '../InventoryCostingService';
import { BatchService } from '../BatchService';
import { localDateString } from '../../utils/date';
import { getProductUnitLabel } from '../../utils/productUnits';
import { paymentAccountCode, postLedgerEntry } from '../../database/ledger';
import { computeReturnImpact, round2 } from '../financials';
import type { SalesReturn } from '../../types';
import type { SalesContext } from './context';
import type { ReturnRequestItem } from './types';

export function createSaleReturn(
  ctx: SalesContext,
  invoiceId: string,
  returnItems: ReturnRequestItem[],
  refundCash = true,
  performedBy = 'usr_admin',
  options: {
    registerId?: string;
    shiftId?: string;
    refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
  } = {}
): SalesReturn {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.refund');
  const inv = ctx.getInvoiceById(invoiceId);
  if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
  if (inv.invoiceStatus === 'VOID') throw new Error('لا يمكن مرتجعة فاتورة ملغاة.');
  if (!returnItems || returnItems.length === 0) throw new Error('حدد بنداً واحداً على الأقل للإرجاع.');

  // Prices and costs come from the invoice; never trust values supplied by the UI.
  // Multiple invoice rows for one product are supported using quantity weighted prices.
  const requestedByProduct = new Map<string, number>();
  for (const rit of returnItems) {
    const quantity = Number(rit.quantityM2);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('كمية الإرجاع يجب أن تكون أكبر من صفر.');
    requestedByProduct.set(rit.productId, (requestedByProduct.get(rit.productId) || 0) + quantity);
    if (!inv.items.some((item) => item.productId === rit.productId)) throw new Error('الصنف غير موجود في الفاتورة الأصلية.');
  }

  const returnId = `ret_${uuidv4().substring(0, 8)}`;
  const today = localDateString();

  return ctx.db.executeTransaction((sqliteDb) => {
    // Recheck inside the transaction so repeated or simultaneous submissions cannot
    // return more than the invoice quantity.
    for (const [productId, requested] of requestedByProduct) {
      const sold = inv.items.filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + Number(item.quantityM2 || 0), 0);
      const alreadyReturned = Number(sqliteDb.query<{ q: number }>(
        `SELECT COALESCE(SUM(sri.quantity_m2),0) AS q FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         WHERE sr.original_invoice_id = ? AND sri.product_id = ?`, [invoiceId, productId]
      )[0]?.q || 0);
      if (requested + alreadyReturned > sold + 1e-6) {
        const line = inv.items.find((item) => item.productId === productId);
        const unitLabel = line ? getProductUnitLabel(line) : 'وحدة';
        throw new Error(`لا يمكن إرجاع كمية أكبر من المباعة للصنف (المباع: ${sold} ${unitLabel}، المُرجع سابقاً: ${alreadyReturned} ${unitLabel}).`);
      }
    }
    const authoritativeItems = returnItems.map((item) => {
      const soldLines = inv.items.filter((line) => line.productId === item.productId);
      const soldQuantity = soldLines.reduce((sum, line) => sum + Number(line.quantityM2 || 0), 0);
      const weighted = (key: 'unitPrice' | 'unitCost') => soldQuantity > 0
        ? soldLines.reduce((sum, line) => sum + Number(line[key] || 0) * Number(line.quantityM2 || 0), 0) / soldQuantity
        : 0;
      return { ...item, unitPrice: round2(weighted('unitPrice')), unitCost: round2(weighted('unitCost')) };
    });
    const returnNumber = sqliteDb.nextNumber('RET');
    const totalReturnAmount = round2(authoritativeItems.reduce(
      (sum, item) => sum + round2(item.quantityM2 * item.unitPrice),
      0
    ));
    const refundMethod = options.refundMethod || 'CASH';
    const effectiveRefundCash = refundMethod === 'BALANCE' ? false : refundCash;
    const impact = computeReturnImpact({
      invoiceTotal: inv.totalAmount,
      invoicePaid: inv.paidAmount,
      returnTotal: totalReturnAmount,
      refundCash: effectiveRefundCash,
    });

    sqliteDb.run(`
      INSERT INTO sales_returns (
        id, return_number, original_invoice_id, original_invoice_number, customer_id,
        warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason,
        register_id, shift_id, refund_method, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      returnId, returnNumber, inv.id, inv.invoiceNumber, inv.customerId,
      inv.warehouseId, today, totalReturnAmount, impact.cashRefund, impact.balanceDelta,
      authoritativeItems[0]?.reason || 'مرتجع سيراميك',
      options.registerId || (impact.cashRefund > 0 && refundMethod === 'CASH' ? 'cr_main' : null),
      options.shiftId || null, refundMethod, actor.id,
    ]);

    let fifoReturnedCost = 0;
    const fifoEnabled = SettingsService.getSettings().costingMethod === 'FIFO';
    for (const item of authoritativeItems) {
      const lineTotal = round2(item.quantityM2 * item.unitPrice);

      const product = sqliteDb.query<any>(
        `SELECT name, grade, meters_per_box, pieces_per_box, size, product_type, base_unit FROM products WHERE id = ?`,
        [item.productId]
      )[0];
      if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
      const metersPerBox = Number(product.meters_per_box) || 1.44;
      const boxesCount = product.product_type === 'GENERAL'
        ? product.base_unit === 'BOX' ? round2(item.quantityM2) : 0
        : round2(item.quantityM2 / metersPerBox);
      let unitCost = item.unitCost > 0 ? item.unitCost : 0;
      if (fifoEnabled) {
        const actualCost = InventoryCostingService.restoreInvoiceIssue(sqliteDb, invoiceId, item.productId, item.quantityM2);
        unitCost = round2(actualCost / item.quantityM2);
        fifoReturnedCost = round2(fifoReturnedCost + actualCost);
      }

      const returnItemId = `ritem_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO sales_return_items (
          id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        returnItemId, returnId, item.productId, product.name, product.grade,
        item.quantityM2, boxesCount, item.unitPrice, unitCost, lineTotal,
      ]);

      const stockRow = sqliteDb.query<{ productId: string }>(
        `SELECT product_id AS productId FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
        [item.productId, inv.warehouseId]
      )[0];
      if (!stockRow) throw new Error(`لا يوجد سجل مخزون للصنف ${product.name} في مخزن الفاتورة.`);
      sqliteDb.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse_id = ?
      `, [item.quantityM2, item.productId, inv.warehouseId]);

      const returnTransactionId = `tx_${uuidv4().substring(0, 8)}`;
      sqliteDb.run(`
        INSERT INTO inventory_transactions (
          id, transaction_number, type, product_id, warehouse_id,
          quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
          reference_id, notes, performed_by
        ) VALUES (?, ?, 'SALES_RETURN', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
      `, [
        returnTransactionId, sqliteDb.nextNumber('TX-RET'),
        item.productId, inv.warehouseId, item.quantityM2, boxesCount, unitCost,
        round2(item.quantityM2 * unitCost), returnId,
        `مرتجع مبيعات للفاتورة ${inv.invoiceNumber}`, actor.id
      ]);

      if (product.product_type !== 'GENERAL') {
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

    // Reduce customer debt by the credit memo minus the cash portion that settles it,
    // and reduce total purchases by the returned value.
    sqliteDb.run(`
      UPDATE customers SET
        current_balance = current_balance - ?,
        total_purchases = total_purchases - ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [impact.balanceDelta, totalReturnAmount, inv.customerId]);

    if (impact.cashRefund > 0) {
      if (refundMethod === 'CASH') {
        sqliteDb.run(
          `UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`,
          [impact.cashRefund, options.registerId || 'cr_main']
        );
      }
    }
    const returnedCost = fifoEnabled ? fifoReturnedCost : round2(authoritativeItems.reduce(
      (sum, item) => sum + Number(item.quantityM2) * Number(item.unitCost || 0),
      0
    ));
    const taxReduction = inv.totalAmount > 0
      ? round2(totalReturnAmount * Number(inv.taxAmount || 0) / inv.totalAmount)
      : 0;
    const refundAccount = impact.cashRefund > 0 ? paymentAccountCode(refundMethod) : undefined;
    postLedgerEntry(sqliteDb.getDatabase(), {
      date: today,
      description: `Sales return ${returnNumber}`,
      referenceType: 'SALES_RETURN',
      referenceId: returnId,
      createdBy: actor.id,
      lines: [
        { accountCode: '4101', debit: round2(totalReturnAmount - taxReduction), credit: 0 },
        ...(taxReduction > 0 ? [{ accountCode: '2102', debit: taxReduction, credit: 0 }] : []),
        ...(impact.balanceDelta > 0 ? [{ accountCode: '1103', debit: 0, credit: impact.balanceDelta }] : []),
        ...(refundAccount ? [{ accountCode: refundAccount, debit: 0, credit: impact.cashRefund }] : []),
        ...(returnedCost > 0 ? [
          { accountCode: '1104', debit: returnedCost, credit: 0 },
          { accountCode: '5101', debit: 0, credit: returnedCost },
        ] : []),
      ],
    });
    if (options.shiftId) {
      sqliteDb.run(
        `UPDATE cash_shifts SET total_refunds = total_refunds + ? WHERE id = ?`,
        [impact.cashRefund, options.shiftId]
      );
    }

    sqliteDb.run(
      `UPDATE sales_invoices SET returned_amount = COALESCE(returned_amount, 0) + ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [totalReturnAmount, invoiceId]
    );

    sqliteDb.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
      VALUES (?, ?, ?, 'مرتجع مبيعات', 'SALES', ?, ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, returnId, JSON.stringify({
      returnNumber, totalReturnAmount, cashRefund: impact.cashRefund, invoiceNumber: inv.invoiceNumber,
    })]);

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
      createdAt: new Date().toISOString()
    };
  });
}
