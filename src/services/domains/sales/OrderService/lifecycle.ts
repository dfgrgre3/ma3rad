import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import type { BranchAccessService } from '../../auth/BranchAccessService';
import { round2 } from '../../finance/financials';
import { localDateString } from '../../../../utils/shared/date';
import { getOrder } from './queries';
import {
  assertStockAndReserve,
  audit,
  computeTotals,
  logStatus,
  normalizeItems,
  releaseReservations,
  resolveWarehouse,
  validateOrderDiscounts,
  validateSalesRep,
} from './internals';
import type {
  Order,
  OrderDeliveryLine,
  OrderInput,
  OrderStatus,
} from './types';

export function createOrder(db: DatabaseManager, access: BranchAccessService, input: OrderInput): Order {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.create');
  if (!input.customerId) throw new Error('يجب اختيار العميل.');
  const items = normalizeItems(db, input.items, actor);
  if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

  const warehouse = resolveWarehouse(db, access, input.warehouseId);
  const branchId = access.requireWarehouseAccess(warehouse);
  const totals = computeTotals(items, input);
  validateOrderDiscounts(items, input, actor);
  const salesRepId = validateSalesRep(db, input.salesRepId);
  const id = `ord_${uuidv4().substring(0, 8)}`;

  return db.executeTransaction((tx) => {
    assertStockAndReserve(tx, warehouse, items);
    const orderNumber = tx.nextNumber('ORD');

    tx.run(
      `INSERT INTO orders (id, order_number, date, customer_id, warehouse_id, branch_id, quotation_id, sales_rep_id,
        expected_delivery_date, subtotal, discount_amount, tax_amount, shipping_cost,
        total_amount, paid_amount, remaining_amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), ROUND(?*100), 0, ROUND(?*100), 'PENDING', ?, ?)`,
      [
        id, orderNumber, localDateString(), input.customerId, warehouse, branchId,
        input.quotationId || null, salesRepId, input.expectedDeliveryDate || null,
        totals.subtotal, totals.discountAmount, totals.taxAmount, totals.shippingCost,
        totals.totalAmount, totals.totalAmount, input.notes || null, actor.id,
      ]
    );

    for (const item of items) {
      tx.run(
        `INSERT INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2,
          boxes_count, delivered_m2, unit_price, discount_amount, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), ROUND(?*100))`,
        [
          `oi_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
          item.quantityM2, item.boxesCount, item.unitPrice, item.discountAmount, item.totalPrice,
        ]
      );
    }

    logStatus(tx, id, null, 'PENDING', 'إنشاء طلب حجز', actor.id, actor.fullName);
    audit(tx, actor.id, actor.fullName, 'إنشاء طلب حجز بضاعة', id, {
      orderNumber, totalAmount: totals.totalAmount, items: items.length,
    });
    return getOrder(db, access, id)!;
  });
}

export function updateOrder(db: DatabaseManager, access: BranchAccessService, id: string, input: OrderInput): Order {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.update');
  const existing = getOrder(db, access, id);
  if (!existing) throw new Error('الطلب غير موجود.');
  if (existing.status !== 'PENDING') {
    throw new Error('لا يمكن تعديل طلب بعد تأكيده. يمكنك إلغاؤه وإنشاء طلب جديد.');
  }
  if ((existing.items || []).some((item) => Number(item.deliveredM2 || 0) > 0)) {
    throw new Error('لا يمكن تعديل طلب سُجّل له تسليم. أصدر الفاتورة ثم سجّل أي مرتجع بمستند إرجاع.');
  }
  const existingDeposits = Number(db.query<{ amount: number }>(
    `SELECT COALESCE(SUM(od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
       WHERE r.order_deposit_id = od.id), 0)) / 100.0, 0) AS amount FROM order_deposits od WHERE od.order_id = ?`, [id]
  )[0]?.amount || 0);
  if (existingDeposits > 0) {
    throw new Error('لا يمكن تعديل طلب عليه عربون قبل تسوية العربون أو رده.');
  }
  if (!input.customerId) throw new Error('يجب اختيار العميل.');
  const items = normalizeItems(db, input.items, actor);
  if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

  const warehouse = resolveWarehouse(db, access, input.warehouseId || existing.warehouseId);
  const branchId = access.requireWarehouseAccess(warehouse);
  const totals = computeTotals(items, input);
  validateOrderDiscounts(items, input, actor);
  const salesRepId = input.salesRepId !== undefined
    ? validateSalesRep(db, input.salesRepId)
    : (existing.salesRepId ?? null);

  return db.executeTransaction((tx) => {
    releaseReservations(tx, existing.warehouseId, existing.items || []);
    assertStockAndReserve(tx, warehouse, items);

    tx.run(
      `UPDATE orders SET customer_id = ?, warehouse_id = ?, branch_id = ?, quotation_id = ?, sales_rep_id = ?,
        expected_delivery_date = ?, subtotal = ROUND(?*100), discount_amount = ROUND(?*100), tax_amount = ROUND(?*100),
        shipping_cost = ROUND(?*100), total_amount = ROUND(?*100), remaining_amount = ROUND(?*100), notes = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        input.customerId, warehouse, branchId, input.quotationId || null, salesRepId, input.expectedDeliveryDate || null,
        totals.subtotal, totals.discountAmount, totals.taxAmount, totals.shippingCost,
        totals.totalAmount, totals.totalAmount, input.notes || null, id,
      ]
    );

    tx.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
    for (const item of items) {
      tx.run(
        `INSERT INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2,
          boxes_count, delivered_m2, unit_price, discount_amount, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ROUND(?*100), ROUND(?*100), ROUND(?*100))`,
        [
          `oi_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
          item.quantityM2, item.boxesCount, item.unitPrice, item.discountAmount, item.totalPrice,
        ]
      );
    }

    audit(tx, actor.id, actor.fullName, 'تعديل طلب حجز بضاعة', id, {
      orderNumber: existing.orderNumber, totalAmount: totals.totalAmount,
    });
    return getOrder(db, access, id)!;
  });
}

export function updateStatus(db: DatabaseManager, access: BranchAccessService, id: string, status: OrderStatus): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.approve');
  const order = getOrder(db, access, id);
  if (!order) throw new Error('الطلب غير موجود.');

  const allowed: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'ON_HOLD', 'CANCELLED'],
    PROCESSING: ['PARTIAL', 'READY', 'ON_HOLD', 'CANCELLED'],
    PARTIAL: ['READY', 'CANCELLED'],
    READY: ['PROCESSING', 'PARTIAL', 'CANCELLED'],
    ON_HOLD: ['CONFIRMED', 'PROCESSING', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (!allowed[order.status].includes(status)) {
    throw new Error(`لا يمكن الانتقال من حالة "${order.status}" إلى "${status}".`);
  }
  if (status === 'CANCELLED' && (order.items || []).some((item) => Number(item.deliveredM2 || 0) > 0)) {
    throw new Error('لا يمكن إلغاء طلب سُجّل له تسليم. أصدر الفاتورة ثم سجّل أي مرتجع بمستند إرجاع.');
  }
  if (status === 'COMPLETED' && !order.invoiceId) {
    throw new Error('لا يمكن إتمام الطلب قبل إصدار فاتورة مبيعات له.');
  }

  db.executeTransaction((tx) => {
    if (status === 'CANCELLED') {
      const depositTotal = Number(tx.query<{ amount: number }>(
        `SELECT COALESCE(SUM(od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
           WHERE r.order_deposit_id = od.id), 0)) / 100.0, 0) AS amount FROM order_deposits od WHERE od.order_id = ?`, [id]
      )[0]?.amount || 0);
      if (depositTotal > 0) {
        throw new Error('لا يمكن إلغاء طلب عليه عربون قبل تسوية العربون أو رده.');
      }
      releaseReservations(tx, order.warehouseId, order.items || []);
    }
    tx.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    logStatus(tx, id, order.status, status, null, actor.id, actor.fullName);
    audit(tx, actor.id, actor.fullName, 'تحديث حالة طلب', id, {
      orderNumber: order.orderNumber, from: order.status, to: status,
    });
  });
}

/**
 * Records the quantities actually handed to the customer. Deliveries may be
 * split across multiple visits; each call accumulates the delivered metres.
 * The order becomes PARTIAL until every line is fully delivered.
 */
export function recordDelivery(
  db: DatabaseManager,
  access: BranchAccessService,
  id: string,
  lines: OrderDeliveryLine[],
  note?: string,
  markDeliveredAt = true
): Order {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.approve');
  const order = getOrder(db, access, id);
  if (!order) throw new Error('الطلب غير موجود.');
  if (order.status === 'ON_HOLD') {
    throw new Error('الطلب معلّق مؤقتًا؛ استأنفه قبل تسجيل تسليم.');
  }
  if (['COMPLETED', 'CANCELLED'].includes(order.status) || order.billingStatus === 'INVOICED') {
    throw new Error('لا يمكن تسجيل تسليم لطلب مكتمل أو ملغي.');
  }
  if (order.status === 'PENDING') {
    throw new Error('يجب تأكيد الطلب أولاً قبل تسجيل التسليم.');
  }
  if (!order.items || order.items.length === 0) throw new Error('الطلب لا يحتوي على بنود.');
  const byId = new Map(order.items.map((item) => [item.id, item]));
  const aggregatedLines = new Map<string, number>();
  for (const line of lines || []) {
    const quantity = Number(line.quantityM2);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Invalid delivery quantity.');
    if (quantity > 0) aggregatedLines.set(line.itemId, round2((aggregatedLines.get(line.itemId) || 0) + quantity));
  }
  const prepared = [...aggregatedLines.entries()]
    .map(([itemId, quantity]) => {
      const item = byId.get(itemId);
      if (!item) throw new Error('بند التسليم غير موجود في الطلب.');
      const remaining = round2(Number(item.quantityM2) - Number(item.deliveredM2 || 0));
      if (remaining <= 0) throw new Error(`تم تسليم الصنف "${item.productName}" بالكامل بالفعل.`);
      if (quantity > remaining + 0.009) throw new Error(`كمية التسليم تتجاوز المتبقي للصنف "${item.productName}" (${remaining}).`);
      return { item, quantity };
    });
  if (prepared.length === 0) throw new Error('أدخل كمية تسليم أكبر من صفر لبند واحد على الأقل.');

  return db.executeTransaction((tx) => {
    for (const { item, quantity } of prepared) {
      tx.run(
        `UPDATE order_items SET delivered_m2 = MIN(quantity_m2, COALESCE(delivered_m2, 0) + ?) WHERE id = ?`,
        [quantity, item.id]
      );
    }

    const totals = tx.query<any>(
      `SELECT COALESCE(SUM(quantity_m2), 0) AS total, COALESCE(SUM(delivered_m2), 0) AS delivered
       FROM order_items WHERE order_id = ?`,
      [id]
    )[0] || {};
    const fullyDelivered = round2(Number(totals.total || 0)) <= round2(Number(totals.delivered || 0)) + 1e-6;
    const nextStatus: OrderStatus = 'PARTIAL';

    tx.run(
      `UPDATE orders SET status = ?, delivery_notes = COALESCE(?, delivery_notes),
        delivery_status = ?,
        delivered_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE delivered_at END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nextStatus, note || null, fullyDelivered ? 'DELIVERED' : 'PARTIAL', markDeliveredAt && fullyDelivered ? 1 : 0, id]
    );

    logStatus(
      tx, id, order.status, nextStatus,
      note || `تسليم ${prepared.length} بند`,
      actor.id, actor.fullName
    );
    audit(tx, actor.id, actor.fullName, 'تسجيل تسليم طلب', id, {
      orderNumber: order.orderNumber,
      fullyDelivered,
      delivered: round2(Number(totals.delivered || 0)),
      total: round2(Number(totals.total || 0)),
    });
    return getOrder(db, access, id)!;
  });
}

export function cancelOrder(db: DatabaseManager, access: BranchAccessService, id: string): void {
  updateStatus(db, access, id, 'CANCELLED');
}

export function deleteCancelledOrder(db: DatabaseManager, access: BranchAccessService, id: string): void {
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'orders.delete');
  const order = getOrder(db, access, id);
  if (!order) throw new Error('الطلب غير موجود.');
  if (order.status !== 'CANCELLED') throw new Error('يمكن حذف الطلبات الملغاة فقط.');
  const financialLinks = db.query<{ count: number }>(
    `SELECT (SELECT COUNT(*) FROM order_deposits WHERE order_id = ?) +
            (SELECT COUNT(*) FROM customer_payments WHERE id IN
              (SELECT receipt_id FROM order_deposits WHERE order_id = ?)) AS count`, [id, id]
  )[0]?.count || 0;
  if (Number(financialLinks) > 0) {
    throw new Error('لا يمكن حذف طلب له سندات عربون؛ سوِّ العربون أو رده أولاً.');
  }
  db.executeTransaction((tx) => {
    tx.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
    tx.run(`DELETE FROM orders WHERE id = ?`, [id]);
    audit(tx, actor.id, actor.fullName, 'حذف طلب ملغي', id, { orderNumber: order.orderNumber });
  });
}
