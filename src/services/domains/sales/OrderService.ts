import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { SalesService } from './SalesService';
import { round2 } from '../finance/financials';
import type { PaymentType, SalesInvoice } from '../../../types';
import { CashierService } from '../finance/CashierService';
import { paymentAccountCode, postLedgerEntry } from '../../../database/repositories/ledger';
import { localDateString } from '../../../utils/shared/date';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { normalizeUom } from '../../../utils/products/uom';
import { resolveSaleUnits } from './unitResolution';
import { BranchAccessService } from '../auth/BranchAccessService';
import { AppConfigService } from '../config/AppConfigService';
import { SettingsService } from '../config/SettingsService';

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
  deliveryStatus?: 'PENDING' | 'PARTIAL' | 'DELIVERED';
  billingStatus?: 'NOT_INVOICED' | 'INVOICED';
  financialStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  bankAccountId?: string | null;
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
  branchId?: string | null;
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

export interface OrderDeposit {
  id: string;
  orderId: string;
  depositNumber: string;
  amount: number;
  paymentMethod: PaymentType;
  date: string;
  invoiceId: string | null;
  refundId: string | null;
  refundNumber: string | null;
  refundable: number;
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
  /** Quantity in the product's base unit; used when `uom`/`quantity` are absent. */
  quantityM2: number;
  unitPrice: number;
  discountAmount?: number;
  /** Selling unit the user typed the line in (services are always base-unit only). */
  uom?: string;
  /** Quantity expressed in `uom`; `unitPrice` is then per `uom`. */
  quantity?: number;
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
  private branchAccess = new BranchAccessService();

  public getOrders(search = '', status: 'ALL' | OrderStatus = 'ALL', dateFrom?: string, dateTo?: string): Order[] {
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
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
    const scope = this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)');
    sql += ` AND ${scope.clause}`;
    const params: any[] = [...scope.params];

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
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
    const rows = this.db.query<Order>(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, w.name AS warehouse_name,
              si.invoice_number AS invoice_number
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN sales_invoices si ON si.id = o.invoice_id
       WHERE o.id = ? AND ${this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').clause}`,
      [id, ...this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').params]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], items: this.getOrderItems(id) };
  }

  public getOrderDeposits(orderId: string): OrderDeposit[] {
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
    if (!this.getOrder(orderId)) return [];
    return this.db.query<OrderDeposit>(
      `SELECT od.id, od.order_id AS orderId, od.deposit_number AS depositNumber,
              od.amount, od.payment_method AS paymentMethod, od.date, od.invoice_id AS invoiceId,
              odr.id AS refundId, odr.refund_number AS refundNumber,
              CASE WHEN od.invoice_id IS NULL AND odr.id IS NULL THEN od.amount ELSE 0 END AS refundable
       FROM order_deposits od
       LEFT JOIN order_deposit_refunds odr ON odr.order_deposit_id = od.id
       WHERE od.order_id = ? ORDER BY od.date, od.created_at, od.id`,
      [orderId]
    );
  }

  public getOrderItems(orderId: string): OrderItem[] {
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
    return this.db.query<OrderItem>(
      `SELECT oi.*, p.sku, p.size, p.meters_per_box,
              p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? AND EXISTS (
         SELECT 1 FROM orders o
         WHERE o.id = oi.order_id AND ${this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').clause}
       )
       ORDER BY oi.rowid ASC`,
      [orderId, ...this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').params]
    );
  }

  public getStats(): OrderStats {
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
    const row = this.db.query<any>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(total_amount), 0) AS totalValue,
              COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
              COALESCE(SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END), 0) AS pendingValue,
              COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','PROCESSING','PARTIAL') THEN 1 ELSE 0 END), 0) AS processing,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) AS completedValue,
              COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled
       FROM orders o
       WHERE ${this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').clause}`,
      this.branchAccess.sqlScope('o.branch_id', '(SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = o.warehouse_id)').params
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
    PermissionService.require(actor, 'orders.create');
    if (!input.customerId) throw new Error('يجب اختيار العميل.');
    const items = this.normalizeItems(input.items, actor);
    if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

    const warehouse = this.resolveWarehouse(input.warehouseId);
    const branchId = this.branchAccess.requireWarehouseAccess(warehouse);
    const totals = this.computeTotals(items, input);
    this.validateOrderDiscounts(items, input, actor);
    const id = `ord_${uuidv4().substring(0, 8)}`;

    return this.db.executeTransaction((db) => {
      this.assertStockAndReserve(db, warehouse, items);
      const orderNumber = db.nextNumber('ORD');

      db.run(
        `INSERT INTO orders (id, order_number, date, customer_id, warehouse_id, branch_id, quotation_id,
          expected_delivery_date, subtotal, discount_amount, tax_amount, shipping_cost,
          total_amount, paid_amount, remaining_amount, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)`,
        [
          id, orderNumber, localDateString(), input.customerId, warehouse, branchId,
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
    PermissionService.require(actor, 'orders.update');
    const existing = this.getOrder(id);
    if (!existing) throw new Error('الطلب غير موجود.');
    if (existing.status !== 'PENDING') {
      throw new Error('لا يمكن تعديل طلب بعد تأكيده. يمكنك إلغاؤه وإنشاء طلب جديد.');
    }
    const existingDeposits = Number(this.db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
         WHERE r.order_deposit_id = od.id), 0)), 0) AS amount FROM order_deposits od WHERE od.order_id = ?`, [id]
    )[0]?.amount || 0);
    if (existingDeposits > 0) {
      throw new Error('لا يمكن تعديل طلب عليه عربون قبل تسوية العربون أو رده.');
    }
    if (!input.customerId) throw new Error('يجب اختيار العميل.');
    const items = this.normalizeItems(input.items, actor);
    if (items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');

    const warehouse = this.resolveWarehouse(input.warehouseId || existing.warehouseId);
    const branchId = this.branchAccess.requireWarehouseAccess(warehouse);
    const totals = this.computeTotals(items, input);
    this.validateOrderDiscounts(items, input, actor);

    return this.db.executeTransaction((db) => {
      this.releaseReservations(db, existing.warehouseId, existing.items || []);
      this.assertStockAndReserve(db, warehouse, items);

      db.run(
        `UPDATE orders SET customer_id = ?, warehouse_id = ?, branch_id = ?, quotation_id = ?,
          expected_delivery_date = ?, subtotal = ?, discount_amount = ?, tax_amount = ?,
          shipping_cost = ?, total_amount = ?, remaining_amount = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [
          input.customerId, warehouse, branchId, input.quotationId || null, input.expectedDeliveryDate || null,
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
    PermissionService.require(actor, 'orders.approve');
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
        const depositTotal = Number(db.query<{ amount: number }>(
          `SELECT COALESCE(SUM(od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
             WHERE r.order_deposit_id = od.id), 0)), 0) AS amount FROM order_deposits od WHERE od.order_id = ?`, [id]
        )[0]?.amount || 0);
        if (depositTotal > 0) {
          throw new Error('لا يمكن إلغاء طلب عليه عربون قبل تسوية العربون أو رده.');
        }
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
    PermissionService.require(actor, 'orders.approve');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
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
          delivery_status = ?,
          delivered_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE delivered_at END,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [nextStatus, note || null, fullyDelivered ? 'DELIVERED' : 'PARTIAL', markDeliveredAt && fullyDelivered ? 1 : 0, id]
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
    PermissionService.require(AuthService.requireAuth(), 'sales.view');
    if (!this.getOrder(orderId)) return [];
    return this.db.query<OrderStatusEntry>(
      `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC`,
      [orderId]
    );
  }

  public recordDeposit(id: string, amount: number, paymentType: PaymentType = 'CASH', notes?: string, bankAccountId?: string, idempotencyKey?: string): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'orders.update');
    if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(paymentType)) throw new Error('طريقة الدفع غير مدعومة لعربون الطلب.');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (['COMPLETED', 'CANCELLED'].includes(order.status) || order.billingStatus === 'INVOICED') {
      throw new Error('لا يمكن تسجيل عربون لطلب مكتمل أو ملغي.');
    }
    const deposit = round2(Number(amount));
    if (!Number.isFinite(deposit)) throw new Error('مبلغ العربون غير صحيح.');
    if (deposit <= 0) throw new Error('مبلغ العربون يجب أن يكون أكبر من صفر.');
    const cashier = new CashierService();
    const shift = cashier.getActiveShift(actor.id, order.branchId || undefined);
    if (shift && shift.status !== 'OPEN') throw new Error('وردية التحصيل مغلقة.');
    const registerId = shift?.registerId || this.branchAccess.getDefaultRegisterId(order.branchId || this.branchAccess.getCurrentBranchId(), actor);
    const date = localDateString();
    let cashAccount = paymentAccountCode(paymentType);
    if (paymentType === 'BANK_TRANSFER') {
      if (!bankAccountId) throw new Error('حدد الحساب البنكي الذي استقبل التحويل.');
      const bank = this.db.query<{ glAccountCode: string; branchId: string | null }>(`SELECT coa.code AS glAccountCode, ba.branch_id AS branchId FROM bank_accounts ba JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id WHERE ba.id = ? AND ba.is_active = 1`, [bankAccountId])[0];
      if (!order.branchId || !bank || bank.branchId !== order.branchId) throw new Error('الحساب البنكي غير نشط أو لا يتبع لفرع الطلب.');
      cashAccount = bank.glAccountCode;
    }

    return this.db.executeTransaction((db) => {
      if (idempotencyKey) {
        const prior = db.query<{ orderId: string; amount: number; paymentMethod: string; bankAccountId: string | null }>(
          `SELECT od.order_id AS orderId, od.amount, od.payment_method AS paymentMethod,
                  od.bank_account_id AS bankAccountId
           FROM order_deposits od JOIN customer_payments cp ON cp.id = od.receipt_id
           WHERE cp.idempotency_key = ?`, [idempotencyKey]
        )[0];
        if (prior) {
          if (prior.orderId !== id || round2(Number(prior.amount)) !== deposit || prior.paymentMethod !== paymentType ||
              (prior.bankAccountId || null) !== (bankAccountId || null)) {
            throw new Error('The deposit idempotency key was already used for a different request.');
          }
          return this.getOrder(id)!;
        }
      }
      const current = db.query<{ paidAmount: number; remainingAmount: number; totalAmount: number; status: OrderStatus; billingStatus: string; customerId: string; branchId: string | null }>(
        `SELECT paid_amount AS paidAmount, remaining_amount AS remainingAmount, total_amount AS totalAmount,
                status, billing_status AS billingStatus, customer_id AS customerId, branch_id AS branchId
         FROM orders WHERE id = ?`, [id]
      )[0];
      if (!current || ['COMPLETED', 'CANCELLED'].includes(current.status) || current.billingStatus === 'INVOICED') {
        throw new Error('Cannot record a deposit for a completed, cancelled, or invoiced order.');
      }
      const newPaid = round2(Number(current.paidAmount || 0) + deposit);
      const newRemaining = round2(Number(current.remainingAmount || 0) - deposit);
      if (deposit > Number(current.remainingAmount || 0) + 0.009 || newRemaining < -0.009) {
        throw new Error('Deposit exceeds the order balance.');
      }
      db.run(
        `UPDATE orders SET paid_amount = ?, remaining_amount = ?, financial_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status NOT IN ('COMPLETED', 'CANCELLED') AND billing_status != 'INVOICED'
           AND remaining_amount >= ?`,
        [newPaid, Math.max(0, newRemaining), newPaid >= Number(current.totalAmount) - 0.009 ? 'PAID' : 'PARTIAL', id, deposit]
      );
      if (Number((db.getDatabase() as any).getRowsModified?.() ?? 0) !== 1) {
        throw new Error('Order balance changed while recording the deposit; retry.');
      }
      const receiptId = `cpay_${uuidv4().substring(0, 8)}`;
      const receiptNumber = db.nextNumber('REC');
      db.run(`INSERT INTO customer_payments (id, receipt_number, customer_id, invoice_id, amount, payment_type, date, register_id, shift_id, notes, performed_by, branch_id, idempotency_key)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [receiptId, receiptNumber, current.customerId, deposit, paymentType, date, registerId, shift?.id || null, notes || `عربون للطلب ${order.orderNumber}`, actor.id, current.branchId || null, idempotencyKey || null]);
      postLedgerEntry(db.getDatabase(), {
        date, description: `Order deposit ${order.orderNumber} (${receiptNumber})`, referenceType: 'ORDER_DEPOSIT', referenceId: receiptId, createdBy: actor.id,
        branchId: current.branchId,
        lines: [{ accountCode: cashAccount, debit: deposit, credit: 0 }, { accountCode: '2106', debit: 0, credit: deposit }],
      });
      if (paymentType === 'CASH') db.run('UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?', [deposit, registerId]);
      if (paymentType === 'BANK_TRANSFER' && bankAccountId) db.run('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?', [deposit, bankAccountId]);
      if (shift) {
        if (paymentType === 'CASH') db.run('UPDATE cash_shifts SET total_customer_payments = total_customer_payments + ? WHERE id = ?', [deposit, shift.id]);
      }
      db.run(`INSERT INTO order_deposits (id, deposit_number, order_id, customer_id, amount, payment_method, register_id, shift_id, receipt_id, bank_account_id, date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [receiptId, receiptNumber, id, current.customerId, deposit, paymentType, registerId, shift?.id || null, receiptId, bankAccountId || null, date, actor.id]);
      this.logStatus(
        db, id, order.status, order.status,
        `سند قبض ${receiptNumber} بقيمة ${deposit} ج (${paymentType}) ${notes || ''}`.trim(),
        actor.id, actor.fullName
      );
      this.audit(actor.id, actor.fullName, 'تسجيل عربون طلب', id, {
        orderNumber: order.orderNumber, receiptId, receiptNumber, deposit, totalPaid: newPaid, remaining: Math.max(0, newRemaining)
      });
      return this.getOrder(id)!;
    });
  }

  public refundDeposit(depositId: string, reason: string): string {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.orders_deposits.manage');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('يجب تسجيل سبب رد العربون.');

    return this.db.executeTransaction((db) => {
      const deposit = db.query<{
        id: string; orderId: string; orderNumber: string; customerId: string; amount: number;
        paymentMethod: PaymentType; registerId: string | null; shiftId: string | null;
        bankAccountId: string | null; invoiceId: string | null; branchId: string | null;
        paidAmount: number; totalAmount: number;
      }>(
        `SELECT od.id, od.order_id AS orderId, o.order_number AS orderNumber,
                od.customer_id AS customerId, od.amount, od.payment_method AS paymentMethod,
                od.register_id AS registerId, od.shift_id AS shiftId, od.bank_account_id AS bankAccountId,
                od.invoice_id AS invoiceId, o.branch_id AS branchId,
                o.paid_amount AS paidAmount, o.total_amount AS totalAmount
         FROM order_deposits od JOIN orders o ON o.id = od.order_id WHERE od.id = ?`,
        [depositId]
      )[0];
      if (!deposit) throw new Error('عربون الطلب غير موجود.');
      if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(deposit.paymentMethod)) {
        throw new Error('طريقة الدفع المسجلة لهذا العربون لا تدعم الرد من هذا المسار.');
      }
      const scopedOrder = this.getOrder(deposit.orderId);
      if (!scopedOrder) throw new Error('لا تملك صلاحية الوصول إلى هذا الطلب.');
      if (deposit.paymentMethod === 'CASH' && deposit.registerId) {
        this.branchAccess.requireRegisterAccess(deposit.registerId, actor, deposit.branchId || undefined);
      }
      if (deposit.invoiceId) throw new Error('تمت تسوية هذا العربون على فاتورة؛ يجب معالجة رد الفاتورة من مسار المرتجعات.');
      const refundedBefore = Number(db.query<{ amount: number }>(
        'SELECT COALESCE(SUM(amount), 0) AS amount FROM order_deposit_refunds WHERE order_deposit_id = ?', [depositId]
      )[0]?.amount || 0);
      const amount = round2(Number(deposit.amount) - refundedBefore);
      const paidAmount = round2(Number(deposit.paidAmount));
      if (amount <= 0.009 || paidAmount + 0.009 < amount) throw new Error('رصيد العربون المتاح للرد غير كافٍ.');
      const refundRegisterId = deposit.paymentMethod === 'CASH' ? deposit.registerId : null;
      const refundShift = refundRegisterId ? db.query<{ id: string }>(
        `SELECT id FROM cash_shifts WHERE register_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`,
        [refundRegisterId]
      )[0] : null;
      let cashAccount = paymentAccountCode(deposit.paymentMethod);
      if (deposit.paymentMethod === 'BANK_TRANSFER') {
        if (!deposit.bankAccountId) throw new Error('الحساب البنكي المرتبط بالعربون غير محدد.');
        const bank = db.query<{ glAccountCode: string; branchId: string | null }>(
          `SELECT coa.code AS glAccountCode, ba.branch_id AS branchId FROM bank_accounts ba
           JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id WHERE ba.id = ? AND ba.is_active = 1`,
          [deposit.bankAccountId]
        )[0];
        if (!deposit.branchId || !bank || bank.branchId !== deposit.branchId) throw new Error('الحساب البنكي غير نشط أو لا يتبع لفرع الطلب.');
        cashAccount = bank.glAccountCode;
      }

      const date = localDateString();
      const refundId = `odrf_${uuidv4().substring(0, 12)}`;
      const refundNumber = db.nextNumber('ODR');
      db.run(
        `INSERT INTO order_deposit_refunds
          (id, refund_number, order_deposit_id, order_id, customer_id, amount, payment_method,
           register_id, shift_id, bank_account_id, date, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [refundId, refundNumber, deposit.id, deposit.orderId, deposit.customerId, amount,
          deposit.paymentMethod, refundRegisterId, refundShift?.id || null, deposit.bankAccountId, date, cleanReason, actor.id]
      );
      const newPaid = round2(paidAmount - amount);
      const normalizedPaid = Math.max(0, newPaid);
      const newRemaining = round2(Number(deposit.totalAmount) - normalizedPaid);
      db.run(
        `UPDATE orders SET paid_amount = ?, remaining_amount = ?,
           financial_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [normalizedPaid, Math.max(0, newRemaining), normalizedPaid <= 0.009 ? 'UNPAID' : 'PARTIAL', deposit.orderId]
      );
      postLedgerEntry(db.getDatabase(), {
        date, description: `Refund order deposit ${deposit.orderNumber} (${refundNumber})`,
        referenceType: 'ORDER_DEPOSIT_REFUND', referenceId: refundId, createdBy: actor.id, branchId: deposit.branchId,
        lines: [{ accountCode: '2106', debit: amount, credit: 0 }, { accountCode: cashAccount, debit: 0, credit: amount }],
      });
      if (deposit.paymentMethod === 'CASH') {
        if (!deposit.registerId) throw new Error('الصندوق المرتبط بالعربون غير محدد.');
        db.run('UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?', [amount, deposit.registerId]);
        if (refundShift) db.run('UPDATE cash_shifts SET total_refunds = total_refunds + ? WHERE id = ?', [amount, refundShift.id]);
      } else if (deposit.paymentMethod === 'BANK_TRANSFER' && deposit.bankAccountId) {
        db.run('UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?', [amount, deposit.bankAccountId]);
      }
      this.logStatus(db, deposit.orderId, scopedOrder.status, scopedOrder.status,
        `رد عربون ${deposit.orderNumber} بمبلغ ${amount}؛ السبب: ${cleanReason}`, actor.id, actor.fullName);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'رد عربون طلب', deposit.orderId,
          JSON.stringify({ depositId, refundId, refundNumber, amount, paymentMethod: deposit.paymentMethod, reason: cleanReason })]
      );
      return refundId;
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
    if (['COMPLETED', 'CANCELLED'].includes(order.status) || order.billingStatus === 'INVOICED') {
      throw new Error('لا يمكن إصدار فاتورة لطلب مكتمل أو ملغي.');
    }
    if (!order.items || order.items.length === 0) throw new Error('الطلب لا يحتوي على بنود.');

    const warehouseId = options.warehouseId || order.warehouseId;
    this.branchAccess.requireWarehouseAccess(warehouseId);
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
          soldBy: item.baseUnit || 'M2',
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: Math.round(item.boxesCount * 4),
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          pricingSource: 'POS',
        })),
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        shippingCost: order.shippingCost,
        paidAmount: newPaymentAmount,
        paymentType: invoicePaymentType,
        notes: options.notes || `فاتورة مبيعات للطلب ${order.orderNumber}`,
      });

      const depositRows = this.db.query<{ id: string; amount: number; paymentMethod: string }>(
        `SELECT od.id, od.amount - COALESCE((SELECT SUM(r.amount) FROM order_deposit_refunds r
           WHERE r.order_deposit_id = od.id), 0) AS amount, od.payment_method AS paymentMethod
         FROM order_deposits od WHERE od.order_id = ? AND od.invoice_id IS NULL`, [id]
      );
      const depositTotal = round2(depositRows.reduce((sum, deposit) => sum + Math.max(0, Number(deposit.amount)), 0));
      if (Math.abs(depositTotal - existingDeposits) > 0.01) throw new Error('إجمالي العربون المسجل لا يطابق سندات القبض؛ راجع الطلب قبل الفوترة.');
      this.db.run(
        `UPDATE orders SET status = 'COMPLETED', billing_status = 'INVOICED', financial_status = ?, invoice_id = ?, paid_amount = ?,
         remaining_amount = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [paidAmount >= total - 0.009 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID', invoice.id, paidAmount, round2(total - paidAmount), id]
      );
      this.db.run(
        `UPDATE order_items SET invoiced_m2 = quantity_m2 WHERE order_id = ?`,
        [id]
      );
      if (depositTotal > 0) {
        this.db.run('UPDATE sales_invoices SET paid_amount = paid_amount + ?, remaining_amount = MAX(0, remaining_amount - ?), payment_status = CASE WHEN remaining_amount - ? <= 0.009 THEN \'PAID\' WHEN paid_amount + ? > 0 THEN \'PARTIAL\' ELSE \'UNPAID\' END WHERE id = ?', [depositTotal, depositTotal, depositTotal, depositTotal, invoice.id]);
        this.db.run('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?', [depositTotal, order.customerId]);
        postLedgerEntry(this.db.getDatabase(), {
          date: localDateString(), description: `Settle order deposits for invoice ${invoice.invoiceNumber}`,
          referenceType: 'ORDER_DEPOSIT_SETTLEMENT', referenceId: invoice.id, createdBy: actor.id,
          lines: [{ accountCode: '2106', debit: depositTotal, credit: 0 }, { accountCode: '1103', debit: 0, credit: depositTotal }],
        });
        this.db.run('UPDATE order_deposits SET invoice_id = ? WHERE order_id = ? AND invoice_id IS NULL', [invoice.id, id]);
        this.db.run(`UPDATE customer_payments SET invoice_id = ? WHERE id IN (SELECT receipt_id FROM order_deposits WHERE invoice_id = ?)`, [invoice.id, invoice.id]);
      }
      this.logStatus(this.db, id, order.status, 'COMPLETED', `إصدار فاتورة ${invoice.invoiceNumber}`, actor.id, actor.fullName);
      this.audit(actor.id, actor.fullName, 'تحويل طلب إلى فاتورة مبيعات', id, {
        orderNumber: order.orderNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      });
      return this.sales.getInvoiceById(invoice.id)!;
    });
  }

  public deleteCancelledOrder(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'orders.delete');
    const order = this.getOrder(id);
    if (!order) throw new Error('الطلب غير موجود.');
    if (order.status !== 'CANCELLED') throw new Error('يمكن حذف الطلبات الملغاة فقط.');
    const financialLinks = this.db.query<{ count: number }>(
      `SELECT (SELECT COUNT(*) FROM order_deposits WHERE order_id = ?) +
              (SELECT COUNT(*) FROM customer_payments WHERE id IN
                (SELECT receipt_id FROM order_deposits WHERE order_id = ?)) AS count`, [id, id]
    )[0]?.count || 0;
    if (Number(financialLinks) > 0) {
      throw new Error('لا يمكن حذف طلب له سندات عربون؛ سوِّ العربون أو رده أولاً.');
    }
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
      db.run(`DELETE FROM orders WHERE id = ?`, [id]);
      this.audit(actor.id, actor.fullName, 'حذف طلب ملغي', id, { orderNumber: order.orderNumber });
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private resolveWarehouse(warehouseId?: string): string {
    if (warehouseId) {
      this.branchAccess.requireWarehouseAccess(warehouseId);
      return warehouseId;
    }
    const branchId = this.branchAccess.getCurrentBranchId();
    const fallback = this.db.query<{ id: string }>(
      `SELECT id FROM warehouses
       WHERE is_active = 1 AND (branch_id = ? OR id IN (
         SELECT warehouse_id FROM branch_warehouses WHERE branch_id = ?
       ))
       ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [branchId, branchId]
    )[0];
    if (!fallback) throw new Error('لا يوجد مخزن نشط.');
    this.branchAccess.requireWarehouseAccess(fallback.id);
    return fallback.id;
  }

  private normalizeItems(items: OrderItemInput[], actor: any) {
    const filtered = (items || []).filter((i) =>
      i.productId && (Number(i.quantity) > 0 || Number(i.quantityM2) > 0)
    );
    return filtered.map((item) => {
      const product = this.db.query<any>(
        `SELECT id, name, grade, meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox, is_active,
                product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit,
                min_selling_price_m2 AS minSellingPriceM2
         FROM products WHERE id = ?`,
        [item.productId]
      )[0];
      if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
      if (!product.isActive) throw new Error(`الصنف "${product.name}" غير نشط.`);

      // Orders store base-unit quantities like every other stock path; the
      // entered unit only affects how the line was typed and priced.
      const units = resolveSaleUnits(item, product);
      if (round2(units.baseUnitPrice) < Number(product.minSellingPriceM2 || 0)) {
        PermissionService.require(actor, 'sales.approve');
      }
      const unitPrice = Math.max(0, units.baseUnitPrice);
      const requestedDiscount = Number(item.discountAmount || 0);
      if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > units.gross + 0.009) {
        throw new Error(`Invalid discount for product "${product.name}".`);
      }
      const discountAmount = round2(requestedDiscount);
      if (discountAmount > 0) PermissionService.require(actor, 'sales.discount');
      const metersPerBox = Number(product.metersPerBox) || 1.44;
      const soldInBoxes = normalizeUom(units.sellUnit, product) === 'BOX';
      const boxesCount = soldInBoxes
        ? round2(units.sellQuantity)
        : product.productType === 'GENERAL' && product.baseUnit === 'BOX'
          ? round2(units.baseQuantity)
          : round2(units.baseQuantity / metersPerBox);
      return {
        productId: product.id as string,
        productName: product.name as string,
        grade: (product.grade as string) || 'GRADE_1',
        quantityM2: units.baseQuantity,
        unitPrice,
        discountAmount,
        boxesCount,
        productType: product.productType,
        baseUnit: product.baseUnit,
        customUnit: product.customUnit,
        totalPrice: round2(units.gross - discountAmount),
      };
    });
  }

  private computeTotals(items: ReturnType<OrderService['normalizeItems']>, input: OrderInput) {
    const subtotal = round2(items.reduce((s, i) => s + i.totalPrice, 0));
    const requestedDiscount = Number(input.discountAmount || 0);
    if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > subtotal + 0.009) {
      throw new Error('Order discount is invalid or exceeds the item subtotal.');
    }
    const discountAmount = round2(requestedDiscount);
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

  private validateOrderDiscounts(items: ReturnType<OrderService['normalizeItems']>, input: OrderInput, actor: any): void {
    const lineDiscounts = round2(items.reduce((sum, item) => sum + item.discountAmount, 0));
    const headerDiscount = round2(Math.max(0, Number(input.discountAmount) || 0));
    const totalDiscount = round2(lineDiscounts + headerDiscount);
    if (totalDiscount <= 0) return;
    PermissionService.require(actor, 'sales.discount');
    const grossSubtotal = round2(items.reduce((sum, item) => sum + item.totalPrice + item.discountAmount, 0));
    const configuredThreshold = SettingsService.getSettings().discountApprovalThresholdPercent ?? 10;
    const threshold = AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', configuredThreshold);
    const discountPercent = grossSubtotal > 0 ? totalDiscount / grossSubtotal * 100 : 0;
    if (discountPercent > threshold) PermissionService.require(actor, 'sales.approve');
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
