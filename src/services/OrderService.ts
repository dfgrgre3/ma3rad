import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { SalesService } from './SalesService';
import { round2 } from './financials';
import type { PaymentType, SalesInvoice } from '../types';
import { localDateString } from '../utils/date';
import { getProductUnitLabel } from '../utils/productUnits';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  warehouseId: string;
  warehouseName?: string;
  quotationId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  expectedDeliveryDate?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: OrderStatus;
  notes?: string | null;
  deliveryNotes?: string | null;
  deliveredAt?: string | null;
  itemsCount?: number;
  totalM2?: number;
  deliveredM2?: number;
  invoicedM2?: number;
  deliveryProgress?: number;
  createdAt: string;
  updatedAt?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  grade: string;
  size?: string | null;
  sku?: string | null;
  quantityM2: number;
  boxesCount: number;
  deliveredM2: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  invoicedM2?: number;
  notes?: string | null;
  metersPerBox?: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface OrderDeliveryLine {
  itemId: string;
  quantityM2: number;
}

export interface OrderStatusEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface OrderItemInput {
  productId: string;
  quantityM2: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface OrderInput {
  customerId: string;
  warehouseId?: string;
  quotationId?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  shippingCost?: number;
  discountAmount?: number;
  taxAmount?: number;
  items: OrderItemInput[];
}

export interface OrderFilters {
  search?: string;
  status?: 'ALL' | OrderStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderStats {
  total: number;
  totalValue: number;
  pending: number;
  pendingValue: number;
  processing: number;
  completed: number;
  completedValue: number;
  cancelled: number;
}

export interface ConvertOrderOptions {
  warehouseId?: string;
  paidAmount?: number;
  paymentType?: PaymentType;
  notes?: string;
  shiftId?: string;
}

export class OrderService {
  private db = DatabaseManager.getInstance();
  private sales = new SalesService();

  public getOrders(search = '', status: 'ALL' | OrderStatus = 'ALL', dateFrom?: string, dateTo?: string): Order[] {
    let sql = `
      SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, w.name AS warehouse_name,
             si.invoice_number AS invoice_number,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
              (SELECT COALESCE(SUM(oi.quantity_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS total_m2,
              (SELECT COALESCE(SUM(oi.delivered_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS delivered_m2,
              (SELECT COALESCE(SUM(oi.invoiced_m2), 0) FROM order_items oi WHERE oi.order_id = o.id) AS invoiced_m2
              ,(SELECT COALESCE(AVG(CASE WHEN oi.quantity_m2 > 0 THEN MIN(1.0, oi.delivered_m2 / oi.quantity_m2) ELSE 0 END), 0) FROM order_items oi WHERE oi.order_id = o.id) * 100 AS deliveryProgress
       FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN warehouses w ON w.id = o.warehouse_id
      LEFT JOIN sales_invoices si ON si.id = o.invoice_id
      WHERE 1 = 1`;
    const params: any[] = [];

    if (status !== 'ALL') {
      sql += ` AND o.status = ?`;
      params.push(status);
    }
    if (search.trim()) {
      sql += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR si.invoice_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (dateFrom) {
      sql += ` AND o.date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND o.date <= ?`;
      params.push(dateTo);
    }
    sql += ` ORDER BY o.date DESC, o.created_at DESC`;
    return this.db.query<Order>(sql, params);
  }

  public getOrder(id: string): Order | null {
    const rows = this.db.query<Order>(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, w.name AS warehouse_name,
              si.invoice_number AS invoice_number
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN sales_invoices si ON si.id = o.invoice_id
       WHERE o.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], items: this.getOrderItems(id) };
  }

  public getOrderItems(orderId: string): OrderItem[] {
    return this.db.query<OrderItem>(
      `SELECT oi.*, p.sku, p.size, p.meters_per_box,
              p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.rowid ASC`,
      [orderId]
    );
  }

  public getStats(): OrderStats {
    const row = this.db.query<any>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(total_amount), 0) AS totalValue,
              COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END), 0) AS pendingValue,
              COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','PROCESSING','PARTIAL') THEN 1 ELSE 0 END), 0) AS processing,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) AS completedValue,
              COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled
       FROM orders`
    )[0] || {};
    return {
      total: Number(row.total || 0),
      totalValue: Number(row.totalValue || 0),
      pending: Number(row.pending || 0),
      pendingValue: Number(row.pendingValue || 0),
      processing: Number(row.processing || 0),
      completed: Number(row.completed || 0),
      completedValue: Number(row.completedValue || 0),
      cancelled: Number(row.cancelled || 0),
    };
  }

  public createOrder(input: OrderInput): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    if (!input.customerId) throw new Error('يجب اختيار العميل.');
    const items = this.normalizeItems(input.items);
    if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

    const warehouse = this.resolveWarehouse(input.warehouseId);
    const totals = this.computeTotals(items, input);
    const id = `ord_${uuidv4().substring(0, 8)}`;

    return this.db.executeTransaction((db) => {
      this.assertStockAndReserve(db, warehouse, items);
      const orderNumber = db.nextNumber('ORD');

      db.run(
        `INSERT INTO orders (id, order_number, date, customer_id, warehouse_id, quotation_id,
          expected_delivery_date, subtotal, discount_amount, tax_amount, shipping_cost,
          total_amount, paid_amount, remaining_amount, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)`,
        [
          id, orderNumber, localDateString(), input.customerId, warehouse,
          input.quotationId || null, input.expectedDeliveryDate || null,
          totals.subtotal, totals.discountAmount, totals.taxAmount, totals.shippingCost,
          totals.totalAmount, totals.totalAmount, input.notes || null, actor.id,
        ]
      );

      for (const item of items) {
        db.run(
          `INSERT INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2,
            boxes_count, delivered_m2, unit_price, discount_amount, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            `oi_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
            item.quantityM2, item.boxesCount, item.unitPrice, item.discountAmount, item.totalPrice,
          ]
        );
      }

      this.logStatus(db, id, null, 'PENDING', 'إنشاء طلب حجز', actor.id, actor.fullName);
      this.audit(actor.id, actor.fullName, 'إنشاء طلب حجز بضاعة', id, {
        orderNumber, totalAmount: totals.totalAmount, items: items.length,
      });
      return this.getOrder(id)!;
    });
  }

  public updateOrder(id: string, input: OrderInput): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const existing = this.getOrder(id);
    if (!existing) throw new Error('الطلب غير موجود.');
    if (existing.status !== 'PENDING') {
      throw new Error('لا يمكن تعديل طلب بعد تأكيده. يمكنك إلغاؤه وإنشاء طلب جديد.');
    }
    if (!input.customerId) throw new Error('يجب اختيار العميل.');
    const items = this.normalizeItems(input.items);
    if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

    const warehouse = this.resolveWarehouse(input.warehouseId || existing.warehouseId);
    const totals = this.computeTotals(items, input);

    return this.db.executeTransaction((db) => {
      this.releaseReservations(db, existing.warehouseId, existing.items || []);
      this.assertStockAndReserve(db, warehouse, items);

      db.run(
        `UPDATE orders SET customer_id = ?, warehouse_id = ?, quotation_id = ?,
          expected_delivery_date = ?, subtotal = ?, discount_amount = ?, tax_amount = ?,
          shipping_cost = ?, total_amount = ?, remaining_amount = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [
          input.customerId, warehouse, input.quotationId || null, input.expectedDeliveryDate || null,
          totals.subtotal, totals.discountAmount, totals.taxAmount, totals.shippingCost,
          totals.totalAmount, totals.totalAmount, input.notes || null, id,
        ]
      );

      db.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
      for (const item of items) {
        db.run(
          `INSERT INTO order_items (id, order_id, product_id, product_name, grade, quantity_m2,
            boxes_count, delivered_m2, unit_price, discount_amount, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            `oi_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
            item.quantityM2, item.boxesCount, item.unitPrice, item.discountAmount, item.totalPrice,
          ]
        );
      }

      this.audit(actor.id, actor.fullName, 'تعديل طلب حجز بضاعة', id, {
        orderNumber: existing.orderNumber, totalAmount: totals.totalAmount,
      });
      return this.getOrder(id)!;
    });
  }

  public updateStatus(id: string, status: OrderStatus): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.approve');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');

    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['PARTIAL', 'CANCELLED'],
      PARTIAL: ['CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new Error(`لا يمكن الانتقال من حالة "${order.status}" إلى "${status}".`);
    }
    if (status === 'COMPLETED' && !order.invoiceId) {
      throw new Error('لا يمكن إتمام الطلب قبل إصدار فاتورة مبيعات له.');
    }

    this.db.executeTransaction((db) => {
      if (status === 'CANCELLED') {
        this.releaseReservations(db, order.warehouseId, order.items || []);
      }
      db.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
      this.logStatus(db, id, order.status, status, null, actor.id, actor.fullName);
      this.audit(actor.id, actor.fullName, 'تحديث حالة طلب', id, {
        orderNumber: order.orderNumber, from: order.status, to: status,
      });
    });
  }

  /**
   * Records the quantities actually handed to the customer. Deliveries may be
   * split across multiple visits; each call accumulates the delivered metres.
   * The order becomes PARTIAL until every line is fully delivered.
   */
  public recordDelivery(
    id: string,
    lines: OrderDeliveryLine[],
    note?: string,
    markDeliveredAt = true
  ): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.approve');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      throw new Error('لا يمكن تسجيل تسليم لطلب مكتمل أو ملغي.');
    }
    if (order.status === 'PENDING') {
      throw new Error('يجب تأكيد الطلب أولاً قبل تسجيل التسليم.');
    }
    if (!order.items || order.items.length === 0) throw new Error('الطلب لا يحتوي على بنود.');

    const byId = new Map(order.items.map((item) => [item.id, item]));
    const prepared = (lines || [])
      .filter((line) => Number(line.quantityM2) > 0)
      .map((line) => {
        const item = byId.get(line.itemId);
        if (!item) throw new Error('بند التسليم غير موجود في الطلب.');
        const remaining = round2(Number(item.quantityM2) - Number(item.deliveredM2 || 0));
        const quantity = round2(Math.min(Number(line.quantityM2), remaining));
        if (remaining <= 0) throw new Error(`تم تسليم الصنف "${item.productName}" بالكامل بالفعل.`);
        return { item, quantity };
      });
    if (prepared.length === 0) throw new Error('أدخل كمية تسليم أكبر من صفر لبند واحد على الأقل.');

    return this.db.executeTransaction((db) => {
      for (const { item, quantity } of prepared) {
        db.run(
          `UPDATE order_items SET delivered_m2 = MIN(quantity_m2, COALESCE(delivered_m2, 0) + ?) WHERE id = ?`,
          [quantity, item.id]
        );
      }

      const totals = db.query<any>(
        `SELECT COALESCE(SUM(quantity_m2), 0) AS total, COALESCE(SUM(delivered_m2), 0) AS delivered
         FROM order_items WHERE order_id = ?`,
        [id]
      )[0] || {};
      const fullyDelivered = round2(Number(totals.total || 0)) <= round2(Number(totals.delivered || 0)) + 1e-6;
      const nextStatus: OrderStatus = 'PARTIAL';

      db.run(
        `UPDATE orders SET status = ?, delivery_notes = COALESCE(?, delivery_notes),
          delivered_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE delivered_at END,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [nextStatus, note || null, markDeliveredAt && fullyDelivered ? 1 : 0, id]
      );

      this.logStatus(
        db, id, order.status, nextStatus,
        note || `تسليم ${prepared.length} بند`,
        actor.id, actor.fullName
      );
      this.audit(actor.id, actor.fullName, 'تسجيل تسليم طلب', id, {
        orderNumber: order.orderNumber,
        fullyDelivered,
        delivered: round2(Number(totals.delivered || 0)),
        total: round2(Number(totals.total || 0)),
      });
      return this.getOrder(id)!;
    });
  }

  public getStatusHistory(orderId: string): OrderStatusEntry[] {
    return this.db.query<OrderStatusEntry>(
      `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC`,
      [orderId]
    );
  }

  public recordDeposit(id: string, amount: number, paymentType: PaymentType = 'CASH', notes?: string): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      throw new Error('لا يمكن تسجيل عربون لطلب مكتمل أو ملغي.');
    }
    const deposit = round2(Math.max(0, amount));
    if (deposit <= 0) throw new Error('مبلغ العربون يجب أن يكون أكبر من صفر.');
    const newPaid = round2(Number(order.paidAmount || 0) + deposit);
    if (newPaid > order.totalAmount) {
      throw new Error(`مجموع المدفوع (${newPaid} ج) يتجاوز إجمالي الطلب (${order.totalAmount} ج).`);
    }
    const newRemaining = round2(order.totalAmount - newPaid);

    return this.db.executeTransaction((db) => {
      db.run(
        `UPDATE orders SET paid_amount = ?, remaining_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newPaid, newRemaining, id]
      );
      this.logStatus(
        db, id, order.status, order.status,
        `تسجيل عربون/دفعة بقيمة ${deposit} ج (${paymentType}) ${notes || ''}`.trim(),
        actor.id, actor.fullName
      );
      this.audit(actor.id, actor.fullName, 'تسجيل عربون طلب', id, {
        orderNumber: order.orderNumber, deposit, totalPaid: newPaid, remaining: newRemaining
      });
      return this.getOrder(id)!;
    });
  }

  public cancelOrder(id: string): void {
    this.updateStatus(id, 'CANCELLED');
  }

  public convertToInvoice(id: string, options: ConvertOrderOptions = {}): SalesInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (order.invoiceId) throw new Error('تم إصدار فاتورة لهذا الطلب بالفعل.');
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      throw new Error('لا يمكن إصدار فاتورة لطلب مكتمل أو ملغي.');
    }
    if (!order.items || order.items.length === 0) throw new Error('الطلب لا يحتوي على بنود.');

    const warehouseId = options.warehouseId || order.warehouseId;
    const total = round2(order.totalAmount);
    const paymentType: PaymentType = options.paymentType || 'CREDIT';
    const paidAmount = paymentType === 'CASH' && options.paidAmount === undefined
      ? total
      : round2(Math.min(total, Math.max(0, options.paidAmount || 0)));

    return this.db.executeTransaction(() => {
      // The sale itself consumes stock; release the reservation first so the
      // availability check sees the units the order was holding.
      this.releaseReservations(this.db, order.warehouseId, order.items || []);

      const invoice = this.sales.createSale({
        customerId: order.customerId,
        warehouseId,
        orderId: order.id,
        shiftId: options.shiftId,
        items: order.items!.map((item) => ({
          productId: item.productId,
          soldBy: 'M2',
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: Math.round(item.boxesCount * 4),
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        shippingCost: order.shippingCost,
        paidAmount,
        paymentType,
        notes: options.notes || `فاتورة مبيعات للطلب ${order.orderNumber}`,
      });

      this.db.run(
        `UPDATE orders SET status = 'COMPLETED', invoice_id = ?, paid_amount = ?,
         remaining_amount = ?, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [invoice.id, invoice.paidAmount, invoice.remainingAmount, id]
      );
      this.db.run(
        `UPDATE order_items SET invoiced_m2 = quantity_m2, delivered_m2 = quantity_m2 WHERE order_id = ?`,
        [id]
      );
      this.logStatus(this.db, id, order.status, 'COMPLETED', `إصدار فاتورة ${invoice.invoiceNumber}`, actor.id, actor.fullName);
      this.audit(actor.id, actor.fullName, 'تحويل طلب إلى فاتورة مبيعات', id, {
        orderNumber: order.orderNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      });
      return invoice;
    });
  }

  public deleteCancelledOrder(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.approve');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (order.status !== 'CANCELLED') throw new Error('يمكن حذف الطلبات الملغاة فقط.');
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
      db.run(`DELETE FROM orders WHERE id = ?`, [id]);
      this.audit(actor.id, actor.fullName, 'حذف طلب ملغي', id, { orderNumber: order.orderNumber });
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private resolveWarehouse(warehouseId?: string): string {
    if (warehouseId) {
      const exists = this.db.query<{ id: string }>(
        `SELECT id FROM warehouses WHERE id = ? AND is_active = 1`,
        [warehouseId]
      )[0];
      if (!exists) throw new Error('المخزن المحدد غير موجود أو غير نشط.');
      return warehouseId;
    }
    const fallback = this.db.query<{ id: string }>(
      `SELECT id FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1`
    )[0];
    if (!fallback) throw new Error('لا يوجد مخزن نشط.');
    return fallback.id;
  }

  private normalizeItems(items: OrderItemInput[]) {
    const filtered = (items || []).filter((i) => i.productId && Number(i.quantityM2) > 0);
    return filtered.map((item) => {
      const product = this.db.query<any>(
        `SELECT id, name, grade, meters_per_box, is_active,
                product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit
         FROM products WHERE id = ?`,
        [item.productId]
      )[0];
      if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
      if (!product.isActive) throw new Error(`الصنف "${product.name}" غير نشط.`);
      const quantityM2 = round2(Math.max(0, Number(item.quantityM2) || 0));
      const unitPrice = round2(Math.max(0, Number(item.unitPrice) || 0));
      const discountAmount = round2(Math.min(
        Math.max(0, Number(item.discountAmount) || 0),
        quantityM2 * unitPrice
      ));
      const metersPerBox = Number(product.metersPerBox ?? product.meters_per_box) || 1.44;
      const boxesCount = product.productType === 'GENERAL'
        ? product.baseUnit === 'BOX' ? quantityM2 : 0
        : round2(quantityM2 / metersPerBox);
      return {
        productId: product.id as string,
        productName: product.name as string,
        grade: (product.grade as string) || 'GRADE_1',
        quantityM2,
        unitPrice,
        discountAmount,
        boxesCount,
        productType: product.productType,
        baseUnit: product.baseUnit,
        customUnit: product.customUnit,
        totalPrice: round2(quantityM2 * unitPrice - discountAmount),
      };
    });
  }

  private computeTotals(items: ReturnType<OrderService['normalizeItems']>, input: OrderInput) {
    const subtotal = round2(items.reduce((s, i) => s + i.totalPrice, 0));
    const discountAmount = round2(Math.min(Math.max(0, Number(input.discountAmount) || 0), subtotal));
    const taxAmount = round2(Math.max(0, Number(input.taxAmount) || 0));
    const shippingCost = round2(Math.max(0, Number(input.shippingCost) || 0));
    return {
      subtotal,
      discountAmount,
      taxAmount,
      shippingCost,
      totalAmount: round2(Math.max(0, subtotal - discountAmount + taxAmount + shippingCost)),
    };
  }

  private assertStockAndReserve(
    db: DatabaseManager,
    warehouseId: string,
    items: ReturnType<OrderService['normalizeItems']>
  ): void {
    const requested = new Map<string, { name: string; qty: number }>();
    for (const item of items) {
      const entry = requested.get(item.productId) || { name: item.productName, qty: 0 };
      entry.qty = round2(entry.qty + item.quantityM2);
      requested.set(item.productId, entry);
    }

    for (const [productId, entry] of requested) {
      const stock = db.query<any>(
        `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
        [productId, warehouseId]
      )[0];
      const available = Number(stock?.quantityM2 || 0) - Number(stock?.reservedM2 || 0);
      if (!stock) {
        throw new Error(`لا يوجد رصيد مخزني للصنف "${entry.name}" في المخزن المحدد.`);
      }
      if (available < entry.qty) {
        const product = db.query<any>(
          `SELECT product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit FROM products WHERE id = ?`,
          [productId]
        )[0];
        const unitLabel = product ? getProductUnitLabel(product) : 'وحدة';
        throw new Error(`الرصيد المتاح من الصنف "${entry.name}" غير كافٍ للحجز. المتاح: ${round2(available)} ${unitLabel}، المطلوب: ${entry.qty} ${unitLabel}`);
      }
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = reserved_m2 + ?, last_updated = CURRENT_TIMESTAMP
         WHERE product_id = ? AND warehouse_id = ?`,
        [entry.qty, productId, warehouseId]
      );
    }
  }

  private releaseReservations(db: DatabaseManager, warehouseId: string, items: Array<{ productId: string; quantityM2: number }>): void {
    const grouped = new Map<string, number>();
    for (const item of items) {
      grouped.set(item.productId, round2((grouped.get(item.productId) || 0) + Number(item.quantityM2 || 0)));
    }
    for (const [productId, qty] of grouped) {
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = MAX(0, reserved_m2 - ?), last_updated = CURRENT_TIMESTAMP
         WHERE product_id = ? AND warehouse_id = ?`,
        [qty, productId, warehouseId]
      );
    }
  }

  private logStatus(
    db: DatabaseManager,
    orderId: string,
    from: OrderStatus | null,
    to: OrderStatus,
    note: string | null,
    userId: string,
    userName: string
  ): void {
    db.run(
      `INSERT INTO order_status_history
         (id, order_id, from_status, to_status, note, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`osh_${uuidv4().substring(0, 8)}`, orderId, from, to, note, userId, userName]
    );
  }

  private audit(userId: string, userName: string, action: string, recordId: string, values: any): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, userId, userName, action, recordId, JSON.stringify(values)]
    );
  }
}
