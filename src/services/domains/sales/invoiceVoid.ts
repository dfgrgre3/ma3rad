import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { SettingsService } from '../config/SettingsService';
import { InventoryCostingService } from '../inventory/InventoryCostingService';
import { InventoryLocationStockService } from '../inventory/InventoryLocationStockService';
import { BatchService } from '../inventory/BatchService';
import { localDateString } from '../../../utils/shared/date';
import { paymentAccountCode } from '../../../database/repositories/ledger';
import { round2 } from '../finance/financials';
import type { SalesInvoice } from '../../../types';
import type { DatabaseManager } from '../../../database/repositories/databaseManager';
import { isServiceProduct } from '../../../utils/products/productUnits';
import type { InvoiceWithItems, SalesContext } from './context';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { PartnerService } from '../customers/PartnerService';
import { defaultEffectEngine } from '../effects/EffectEngine';
import type { Effect } from '../../../types/effects';
import '../effects/handlers/salesInvoiceHandlers';

function restoreInvoiceItem(
  sqliteDb: DatabaseManager,
  inv: InvoiceWithItems,
  invoiceId: string,
  reason: string,
  performedBy: string,
  item: InvoiceWithItems['items'][number]
): void {
  if (item.specialStockId) {
    const source = sqliteDb.query<any>(`
      SELECT id FROM inventory_special_stocks
      WHERE id = ? AND status = 'DOWNGRADED_SALE'
    `, [item.specialStockId])[0];
    if (!source) throw new Error('مصدر مخزون البيع المخفض الأصلي غير متاح؛ أوقف الإلغاء وسوِّ سجل المخزون يدوياً.');
    sqliteDb.run(`
      UPDATE inventory_special_stocks
      SET remaining_quantity_m2 = remaining_quantity_m2 + ?
      WHERE id = ? AND status = 'DOWNGRADED_SALE'
    `, [item.quantityM2, item.specialStockId]);
    sqliteDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
        reference_id, notes, performed_by
      ) VALUES (?, ?, 'VOID', ?, ?, ?, ?, ?, ?, 'SPECIAL_STOCK_SALE_VOID', ?, ?, ?)
    `, [
      `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-VOID'),
      item.productId, inv.warehouseId, item.quantityM2, item.boxesCount,
      item.unitCost, item.totalCost, item.id,
      `عكس بيع مخزون مخفض في الفاتورة ${inv.invoiceNumber}: ${reason}`, performedBy
    ]);
    return;
  }

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

  InventoryLocationStockService.receive(sqliteDb, {
    warehouseId: inv.warehouseId,
    productId: item.productId,
    quantity: item.quantityM2,
    actorId: performedBy,
    reason: `إلغاء فاتورة ${inv.invoiceNumber}`,
  });

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
  PermissionService.require(actor, 'ui.sales.invoices.void');
  const inv = ctx.getInvoiceById(invoiceId);
  if (!inv) throw new Error('الفاتورة غير موجودة.');
  if (inv.invoiceStatus === 'VOID') throw new Error('الفاتورة ملغاة بالفعل.');
  if (!reason || !reason.trim()) throw new Error('يرجى إدخال سبب إلغاء الفاتورة.');

  return ctx.db.executeTransaction((sqliteDb) => {
    const currentState = sqliteDb.getDatabase().exec(
      `SELECT invoice_status, paid_amount, remaining_amount FROM sales_invoices WHERE id = ?`, [invoiceId]
    )[0]?.values[0];
    if (!currentState || String(currentState[0]) === 'VOID') throw new Error('الفاتورة ملغاة بالفعل أو غير متاحة.');
    const returnsCount = sqliteDb.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales_returns WHERE original_invoice_id = ?', [invoiceId]
    )[0]?.count ?? 0;
    if (returnsCount > 0) {
      throw new Error('لا يمكن إلغاء فاتورة لها مرتجعات مسجلة. سجّل مرتجعاً للكميات المتبقية بدلاً من ذلك.');
    }
    if (Number(currentState[1]) !== Number(inv.paidAmount)
      || Number(currentState[2]) !== Number(inv.remainingAmount)) {
      throw new Error('تغير رصيد الفاتورة أثناء الإلغاء؛ أعد المحاولة.');
    }
    const trackInventory = ModuleRegistryService.isInventoryTracked();
    const linkedPayments = sqliteDb.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM customer_payments WHERE invoice_id = ?
       AND id NOT IN (SELECT receipt_id FROM order_deposits WHERE receipt_id IS NOT NULL)`,
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
      const invoicePayments = sqliteDb.query<{ method: string; amount: number }>(
        `SELECT method, COALESCE(SUM(amount), 0) AS amount FROM sales_invoice_payments WHERE invoice_id = ? GROUP BY method`,
        [invoiceId]
      );
      const cashPortion = invoicePayments.find((payment) => payment.method === 'CASH')?.amount ?? 0;
      if (cashPortion > 0) {
        const branchId = ctx.branchAccess.requireWarehouseAccess(inv.warehouseId, actor);
        const shiftRegister = inv.shiftId
          ? sqliteDb.query<{ registerId: string }>('SELECT register_id AS registerId FROM cash_shifts WHERE id = ?', [inv.shiftId])[0]?.registerId
          : null;
        const registerId = shiftRegister || ctx.branchAccess.getDefaultRegisterId(branchId, actor);
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [cashPortion, registerId]);
      } else if (inv.paymentType === 'CASH' && inv.paidAmount > 0) {
        const branchId = ctx.branchAccess.requireWarehouseAccess(inv.warehouseId, actor);
        const shiftRegister = inv.shiftId
          ? sqliteDb.query<{ registerId: string }>('SELECT register_id AS registerId FROM cash_shifts WHERE id = ?', [inv.shiftId])[0]?.registerId
          : null;
        const registerId = shiftRegister || ctx.branchAccess.getDefaultRegisterId(branchId, actor);
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [inv.paidAmount, registerId]);
      }

      if (inv.shiftId) {
        const methodTotals = invoicePayments.length ? invoicePayments : [{ method: inv.paymentType, amount: inv.paidAmount }];
        const cash = methodTotals.filter((payment) => payment.method === 'CASH').reduce((sum, payment) => sum + Number(payment.amount), 0);
        const card = methodTotals.filter((payment) => payment.method === 'CARD').reduce((sum, payment) => sum + Number(payment.amount), 0);
        const transfer = methodTotals.filter((payment) => payment.method === 'BANK_TRANSFER' || payment.method === 'CHEQUE').reduce((sum, payment) => sum + Number(payment.amount), 0);
        sqliteDb.run(`UPDATE cash_shifts SET total_sales_cash = MAX(0, total_sales_cash - ?), total_sales_card = MAX(0, total_sales_card - ?), total_sales_transfer = MAX(0, total_sales_transfer - ?) WHERE id = ?`, [round2(cash), round2(card), round2(transfer), inv.shiftId]);
      }
    }

    const settledDeposits = sqliteDb.query<{ amount: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amount FROM order_deposits WHERE invoice_id = ?`, [invoiceId]
    )[0]?.amount ?? 0;

    // عكس قيد البيع: نتبع بالضبط الحسابات التي خُصمت عند الإنشاء (أطر الدفع المسجلة)
    const splitPaymentsForLedger = sqliteDb.query<{ method: string; amount: number; bankAccountId: string | null }>(
      `SELECT method, COALESCE(SUM(amount), 0) AS amount, bank_account_id AS bankAccountId
       FROM sales_invoice_payments WHERE invoice_id = ? AND method != 'CREDIT' GROUP BY method, bank_account_id`,
      [invoiceId]
    );
    const reversedPaymentLines = splitPaymentsForLedger.length > 0
      ? splitPaymentsForLedger.map((row) => ({
          accountCode: row.method === 'BANK_TRANSFER' && row.bankAccountId
            ? sqliteDb.query<{ code: string }>(
                `SELECT coa.code AS code FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id WHERE ba.id = ?`,
                [row.bankAccountId]
              )[0]?.code || paymentAccountCode(row.method)
            : paymentAccountCode(row.method),
          debit: 0, credit: round2(row.amount),
        }))
      : (inv.paidAmount > 0 ? [{ accountCode: paymentAccountCode(inv.paymentType), debit: 0, credit: inv.paidAmount }] : []);
    for (const row of splitPaymentsForLedger) {
      if (row.method === 'BANK_TRANSFER' && row.bankAccountId) {
        sqliteDb.run('UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?', [row.amount, row.bankAccountId]);
      }
    }
    const inventoryCost = trackInventory
      ? round2(inv.items.filter((item) => !isServiceProduct({ productType: item.productType, baseUnit: item.baseUnit }))
        .reduce((sum, item) => sum + Number(item.totalCost || 0), 0)) : 0;
    const serviceCost = trackInventory
      ? round2(inv.items.filter((item) => isServiceProduct({ productType: item.productType, baseUnit: item.baseUnit }))
        .reduce((sum, item) => sum + Number(item.totalCost || 0), 0)) : 0;
    const effects: Effect[] = [
      {
        type: 'ledger.post',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: {
            date: localDateString(),
            description: `Void sale ${inv.invoiceNumber}`,
            referenceType: 'SALES_VOID',
            referenceId: invoiceId,
            createdBy: actor.id,
            lines: [
              { accountCode: '4101', debit: round2(inv.subtotal - inv.discountAmount), credit: 0 },
              ...(inv.shippingCost > 0 ? [{ accountCode: '4102', debit: inv.shippingCost, credit: 0 }] : []),
              ...(inv.taxAmount > 0 ? [{ accountCode: '2102', debit: inv.taxAmount, credit: 0 }] : []),
              ...reversedPaymentLines,
              ...(inv.remainingAmount > 0 ? [{ accountCode: '1103', debit: 0, credit: inv.remainingAmount }] : []),
              ...(settledDeposits > 0 ? [{ accountCode: '1103', debit: round2(settledDeposits), credit: 0 }, { accountCode: '2106', debit: 0, credit: round2(settledDeposits) }] : []),
              ...(settledDeposits > 0 ? [{ accountCode: '1103', debit: 0, credit: round2(settledDeposits) }] : []),
              ...(inventoryCost > 0 ? [{ accountCode: '1104', debit: inventoryCost, credit: 0 }, { accountCode: '5101', debit: 0, credit: inventoryCost }] : []),
              ...(serviceCost > 0 ? [{ accountCode: '2105', debit: serviceCost, credit: 0 }, { accountCode: '5102', debit: 0, credit: serviceCost }] : []),
            ],
          },
        },
      },
      {
        type: 'audit.log',
        payload: {
          aggregateType: 'sales_invoice',
          aggregateId: invoiceId,
          data: { recordId: invoiceId, action: 'إلغاء فاتورة مبيعات', module: 'SALES', oldValues: { invoiceNumber: inv.invoiceNumber }, newValues: { reason } },
        },
      },
      {
        type: 'sync.capture',
        payload: { aggregateType: 'sales_invoice', aggregateId: invoiceId, data: { operation: 'UPDATE' } },
      },
    ];
    defaultEffectEngine.run({ db: sqliteDb, actorId: actor.id, actorName: actor.fullName }, effects);
    new PartnerService().adjustSaleProfitAllocation(sqliteDb, {
      invoiceId,
      invoiceNumber: inv.invoiceNumber,
      branchId: ctx.branchAccess.requireWarehouseAccess(inv.warehouseId, actor),
      transactionDate: localDateString(),
      invoiceProfit: Number(inv.grossProfit || 0),
      targetProfit: 0,
      actorId: actor.id,
    });

    sqliteDb.run(`UPDATE sales_invoices SET invoice_status = 'VOID', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND invoice_status != 'VOID'
      AND NOT EXISTS (SELECT 1 FROM sales_returns WHERE original_invoice_id = ?)`, [invoiceId, invoiceId]);
    if ((sqliteDb.getDatabase() as any).getRowsModified() !== 1) {
      throw new Error('تغيرت حالة الفاتورة أو سُجل مرتجع أثناء الإلغاء؛ أعد المحاولة.');
    }
    if (inv.orderId) {
      const orderDeposits = sqliteDb.query<{ amount: number }>('SELECT COALESCE(SUM(amount), 0) AS amount FROM order_deposits WHERE order_id = ?', [inv.orderId])[0]?.amount ?? 0;
      sqliteDb.run('UPDATE order_deposits SET invoice_id = NULL WHERE invoice_id = ?', [invoiceId]);
      sqliteDb.run('UPDATE customer_payments SET invoice_id = NULL WHERE id IN (SELECT receipt_id FROM order_deposits WHERE order_id = ?)', [inv.orderId]);
      sqliteDb.run(`UPDATE orders SET status = CASE WHEN delivery_status = 'PENDING' THEN 'CONFIRMED' ELSE 'PARTIAL' END,
        billing_status = 'NOT_INVOICED', paid_amount = ?, remaining_amount = MAX(0, total_amount - ?),
        financial_status = CASE WHEN ? >= total_amount - 0.009 THEN 'PAID' WHEN ? > 0 THEN 'PARTIAL' ELSE 'UNPAID' END
        WHERE invoice_id = ?`, [orderDeposits, orderDeposits, orderDeposits, orderDeposits, invoiceId]);
    }

    return ctx.getInvoiceById(invoiceId)!;
  });
}
