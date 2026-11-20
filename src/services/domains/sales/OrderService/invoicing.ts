import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import type { SalesService } from '../SalesService';
import { round2 } from '../../finance/financials';
import type { PaymentType, SalesInvoice } from '../../../../types';
import { postLedgerEntry } from '../../../../database/repositories/ledger';
import { localDateString } from '../../../../utils/shared/date';
import { getOrder } from './queries';
import { audit, logStatus, releaseReservations } from './internals';
import { OperationalFieldService } from '../../products/OperationalFieldService';
import type { ConvertOrderOptions } from './types';
import { isWorkflowActionAllowed } from '../../../../config/activityDocumentSpec';
import { getEffectiveBusinessType } from '../../config/BusinessTypeService';

export function convertToInvoice(
  db: DatabaseManager,
  access: BranchAccessService,
  sales: SalesService,
  id: string,
  options: ConvertOrderOptions = {},
): SalesInvoice {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.create');
  const order = getOrder(db, access, id);
  if (!order) throw new Error('الطلب غير موجود.');
  if (order.invoiceId) throw new Error('تم إصدار فاتورة لهذا الطلب بالفعل.');
  if (order.status === 'ON_HOLD') throw new Error('الطلب معلّق مؤقتًا؛ استأنفه قبل إصدار الفاتورة.');
  if (['COMPLETED', 'CANCELLED'].includes(order.status) || order.billingStatus === 'INVOICED') {
    throw new Error('لا يمكن إصدار فاتورة لطلب مكتمل أو ملغي.');
  }
  if (!isWorkflowActionAllowed('/doc/sales_order', 'convert-to-invoice', order.status, getEffectiveBusinessType())) {
    throw new Error('سير عمل هذا النشاط يتطلب أن يكون الطلب «جاهزًا» قبل إصدار الفاتورة.');
  }
  if (!order.items || order.items.length === 0) throw new Error('الطلب لا يحتوي على بنود.');

  const warehouseId = options.warehouseId || order.warehouseId;
  if (warehouseId !== order.warehouseId) {
    throw new Error('يجب إصدار فاتورة الطلب من المستودع الذي حُجزت منه البضاعة.');
  }
  access.requireWarehouseAccess(warehouseId);
  const total = round2(order.totalAmount);
  const paymentType: PaymentType = options.paymentType || 'CREDIT';
  const existingDeposits = round2(Number(order.paidAmount || 0));
  const additionalPaid = paymentType === 'CASH' && options.paidAmount === undefined
    ? round2(total - existingDeposits)
    : round2(Math.max(0, Number(options.paidAmount || 0)));
  const paidAmount = round2(existingDeposits + additionalPaid);
  if (paidAmount > total + 0.009) throw new Error('إجمالي العربون والدفعة الجديدة يتجاوز إجمالي الطلب.');
  const newPaymentAmount = round2(paidAmount - existingDeposits);
  const invoicePaymentType = newPaymentAmount > 0 ? paymentType : 'CREDIT';

  return db.executeTransaction(() => {
    // The sale itself consumes stock; release the reservation first so the
    // availability check sees the units the order was holding.
    releaseReservations(db, order.warehouseId, order.items || []);

    const invoice = sales.createSale({
      customerId: order.customerId,
      warehouseId,
      orderId: order.id,
      shiftId: options.shiftId,
      items: order.items!.map((item) => ({
        productId: item.productId,
        orderItemId: item.id,
        soldBy: item.baseUnit || 'M2',
        quantityM2: item.quantityM2,
        boxesCount: item.boxesCount,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        pricingSource: 'ORDER',
      })),
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      shippingCost: order.shippingCost,
      paidAmount: newPaymentAmount,
      paymentType: invoicePaymentType,
      notes: options.notes || `فاتورة مبيعات للطلب ${order.orderNumber}`,
    });
    new OperationalFieldService().copyRecordFieldValues('orders', order.id, 'sales_invoices', invoice.id);

    const depositRows = db.query<{ id: string; amount: number; paymentMethod: string }>(
      `SELECT od.id, (od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
         WHERE r.order_deposit_id = od.id), 0)) / 100.0 AS amount, od.payment_method AS paymentMethod
       FROM order_deposits od WHERE od.order_id = ? AND od.invoice_id IS NULL`, [id]
    );
    const depositTotal = round2(depositRows.reduce((sum, deposit) => sum + Math.max(0, Number(deposit.amount)), 0));
    if (Math.abs(depositTotal - existingDeposits) > 0.01) throw new Error('إجمالي العربون المسجل لا يطابق سندات القبض؛ راجع الطلب قبل الفوترة.');
    db.run(
      `UPDATE orders SET status = 'COMPLETED', billing_status = 'INVOICED', financial_status = ?, invoice_id = ?, paid_amount = ROUND(?*100),
       remaining_amount = ROUND(?*100),
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [paidAmount >= total - 0.009 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID', invoice.id, paidAmount, round2(total - paidAmount), id]
    );
    db.run(
      `UPDATE order_items SET invoiced_m2 = quantity_m2 WHERE order_id = ?`,
      [id]
    );
    if (depositTotal > 0) {
      db.run('UPDATE sales_invoices SET paid_amount = paid_amount + ROUND(? * 100), remaining_amount = MAX(0, remaining_amount - ROUND(? * 100)), payment_status = CASE WHEN remaining_amount - ROUND(? * 100) <= 1 THEN \'PAID\' WHEN paid_amount + ROUND(? * 100) > 0 THEN \'PARTIAL\' ELSE \'UNPAID\' END WHERE id = ?', [depositTotal, depositTotal, depositTotal, depositTotal, invoice.id]);
      db.run('UPDATE customers SET current_balance = current_balance - ROUND(?*100) WHERE id = ?', [depositTotal, order.customerId]);
      postLedgerEntry(db.getDatabase(), {
        date: localDateString(), description: `Settle order deposits for invoice ${invoice.invoiceNumber}`,
        referenceType: 'ORDER_DEPOSIT_SETTLEMENT', referenceId: invoice.id, createdBy: actor.id,
        lines: [{ accountCode: '2106', debit: depositTotal, credit: 0 }, { accountCode: '1103', debit: 0, credit: depositTotal }],
      });
      db.run('UPDATE order_deposits SET invoice_id = ? WHERE order_id = ? AND invoice_id IS NULL', [invoice.id, id]);
      db.run(`UPDATE customer_payments SET invoice_id = ? WHERE id IN (SELECT receipt_id FROM order_deposits WHERE invoice_id = ?)`, [invoice.id, invoice.id]);
    }
    logStatus(db, id, order.status, 'COMPLETED', `إصدار فاتورة ${invoice.invoiceNumber}`, actor.id, actor.fullName);
    audit(db, actor.id, actor.fullName, 'تحويل طلب إلى فاتورة مبيعات', id, {
      orderNumber: order.orderNumber,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
    });
    return sales.getInvoiceById(invoice.id)!;
  }, { immediatePersist: true });
}
