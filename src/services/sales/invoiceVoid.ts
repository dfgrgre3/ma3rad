import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../AuthService';
import { PermissionService } from '../PermissionService';
import { SettingsService } from '../SettingsService';
import { InventoryCostingService } from '../InventoryCostingService';
import { BatchService } from '../BatchService';
import { localDateString } from '../../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../../database/ledger';
import { round2 } from '../financials';
import type { SalesInvoice } from '../../types';
import type { DatabaseManager } from '../../database/db';
import { isServiceProduct } from '../../utils/productUnits';
import type { InvoiceWithItems, SalesContext } from './context';
import { ModuleRegistryService } from '../ModuleRegistryService';
import { BusinessRecordSyncService } from '../../sync/BusinessRecordSyncService';

function restoreInvoiceItem(
  sqliteDb: DatabaseManager,
  inv: InvoiceWithItems,
  invoiceId: string,
  reason: string,
  performedBy: string,
  item: InvoiceWithItems['items'][number]
): void {
  if (SettingsService.getSettings().costingMethod === 'FIFO') {
    const issue = sqliteDb.query<any>(`SELECT id FROM inventory_transactions
      WHERE reference_type='INVOICE' AND reference_id=? AND product_id=? AND type='SALE'
      ORDER BY created_at,id LIMIT 1`, [invoiceId, item.productId])[0];
    if (!issue) throw new Error('The original FIFO sale issue is missing; reconcile the invoice before voiding it.');
    InventoryCostingService.restoreIssue(sqliteDb, issue.id);
  }
  sqliteDb.run(`
    UPDATE warehouse_stock
    SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
    WHERE product_id = ? AND warehouse_id = ?
  `, [item.quantityM2, item.productId, inv.warehouseId]);

  if (item.productType !== 'GENERAL') {
    new BatchService().restoreForInvoiceVoid({
      invoiceId,
      productId: item.productId,
      warehouseId: inv.warehouseId,
      quantityM2: item.quantityM2,
      costPrice: item.unitCost,
      performedBy,
      reason,
    });
  }

  sqliteDb.run(`
    INSERT INTO inventory_transactions (
      id, transaction_number, type, product_id, warehouse_id,
      quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
      reference_id, notes, performed_by
    ) VALUES (?, ?, 'VOID', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
  `, [
    `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-VOID'),
    item.productId, inv.warehouseId, item.quantityM2, item.boxesCount,
    item.unitCost, round2(item.quantityM2 * item.unitCost), invoiceId,
    `إلغاء فاتورة ${inv.invoiceNumber}`, performedBy
  ]);
}

/** Void a completed sales invoice with full reversal (brief §67/§220). */
export function voidSalesInvoice(ctx: SalesContext, invoiceId: string, reason: string): SalesInvoice {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.void');
  const inv = ctx.getInvoiceById(invoiceId);
  if (!inv) throw new Error('الفاتورة غير موجودة.');
  const returnsCount = ctx.db.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM sales_returns WHERE original_invoice_id = ?',
    [invoiceId]
  )[0]?.count ?? 0;
  if (returnsCount > 0) {
    throw new Error('لا يمكن إلغاء فاتورة لها مرتجعات مسجلة. سجّل مرتجعاً للكميات المتبقية بدلاً من ذلك.');
  }
  if (inv.invoiceStatus === 'VOID') throw new Error('الفاتورة ملغاة بالفعل.');
  if (!reason || !reason.trim()) throw new Error('يرجى إدخال سبب إلغاء الفاتورة.');

  return ctx.db.executeTransaction((sqliteDb) => {
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const linkedPayments = sqliteDb.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM customer_payments WHERE invoice_id = ?',
      [invoiceId]
    )[0]?.count ?? 0;
    const linkedPlan = sqliteDb.query<any>(`SELECT COUNT(*) AS count FROM installment_plans WHERE invoice_id=? AND status!='CANCELLED'`, [invoiceId])[0]?.count || 0;
    if (linkedPlan) throw new Error('Cancel the linked installment plan before voiding this invoice.');
    if (linkedPayments > 0) {
      throw new Error('لا يمكن إلغاء فاتورة عليها سندات قبض. اعكس سندات القبض أولاً أو سجّل مرتجعاً.');
    }

    for (const item of inv.items) {
      if (!trackInventory) break;
      if (isServiceProduct({ productType: item.productType, baseUnit: item.baseUnit })) continue;
      restoreInvoiceItem(sqliteDb, inv, invoiceId, reason, actor.id, item);
    }

    // Reverse the credit extended to the customer and the cash received.
    sqliteDb.run(`
      UPDATE customers SET
        current_balance = current_balance - ?,
        total_purchases = total_purchases - ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [inv.remainingAmount, inv.totalAmount, inv.customerId]);

    if (inv.paidAmount > 0) {
      // Reverse the cash portion of the payment (including split payments).
      const cashPortion = sqliteDb.query<{ amount: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS amount FROM sales_invoice_payments WHERE invoice_id = ? AND method = 'CASH'`,
        [invoiceId]
      )[0]?.amount ?? 0;
      const reverseAmount = cashPortion > 0 ? cashPortion : (inv.paymentType === 'CASH' ? inv.paidAmount : 0);
      if (reverseAmount > 0) {
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE is_default = 1`, [reverseAmount]);
      }
    }

    const invoiceCost = trackInventory
      ? round2(inv.items
        .filter((item) => !isServiceProduct({ productType: item.productType, baseUnit: item.baseUnit }))
        .reduce((sum, item) => sum + Number(item.totalCost || 0), 0))
      : 0;
    postLedgerEntry(sqliteDb.getDatabase(), {
      date: localDateString(),
      description: `Void sale ${inv.invoiceNumber}`,
      referenceType: 'SALES_VOID',
      referenceId: invoiceId,
      createdBy: actor.id,
      lines: [
        { accountCode: '4101', debit: round2(inv.subtotal - inv.discountAmount), credit: 0 },
        ...(inv.shippingCost > 0 ? [{ accountCode: '4102', debit: inv.shippingCost, credit: 0 }] : []),
        ...(inv.taxAmount > 0 ? [{ accountCode: '2102', debit: inv.taxAmount, credit: 0 }] : []),
        ...(inv.paidAmount > 0 ? [{
          accountCode: paymentAccountCode(inv.paymentType),
          debit: 0,
          credit: inv.paidAmount,
        }] : []),
        ...(inv.remainingAmount > 0 ? [{ accountCode: '1103', debit: 0, credit: inv.remainingAmount }] : []),
        ...(invoiceCost > 0 ? [
          { accountCode: '1104', debit: invoiceCost, credit: 0 },
          { accountCode: '5101', debit: 0, credit: invoiceCost },
        ] : []),
      ],
    });

    sqliteDb.run(`UPDATE sales_invoices SET invoice_status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [invoiceId]);
    new BusinessRecordSyncService(sqliteDb).capture(sqliteDb, 'sales_invoice', invoiceId, 'UPDATE');

    sqliteDb.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
      VALUES (?, ?, ?, 'إلغاء فاتورة مبيعات', 'SALES', ?, ?, ?)
    `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({ invoiceNumber: inv.invoiceNumber }), JSON.stringify({ reason })]);

    return ctx.getInvoiceById(invoiceId)!;
  });
}
