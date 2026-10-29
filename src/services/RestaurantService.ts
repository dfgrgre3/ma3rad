import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { ManufacturingService, type ProductionOrder } from './ManufacturingService';
import { ModuleRegistryService } from './ModuleRegistryService';
import { PermissionService } from './PermissionService';
import { SalesService } from './SalesService';
import { round2 } from './financials';
import { isServiceProduct } from '../utils/productUnits';
import type { PaymentType, SalesInvoice } from '../types';

export type RestaurantServiceMode = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type RestaurantKitchenStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';

export interface RestaurantTable {
  id: string;
  branchId: string;
  tableNumber: number;
  capacity: number;
  isActive: number;
  occupied: number;
}

export interface RestaurantMenuItem {
  id: string;
  branchId: string;
  productId: string;
  productName: string;
  baseUnit: string;
  unitPrice: number;
  isAvailable: number;
}

export interface RestaurantOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  baseUnit: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  kitchenStatus: RestaurantKitchenStatus;
  productionOrderId: string | null;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  tableId: string | null;
  tableNumber: number | null;
  serviceMode: RestaurantServiceMode;
  customerId: string;
  customerName: string;
  warehouseId: string;
  warehouseName: string;
  status: 'OPEN' | 'BILLED' | 'CANCELLED';
  notes: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  items: RestaurantOrderItem[];
}

export interface CreateRestaurantOrderInput {
  serviceMode: RestaurantServiceMode;
  tableId?: string;
  customerId: string;
  warehouseId: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number; notes?: string }>;
}

const KITCHEN_TRANSITIONS: Record<RestaurantKitchenStatus, RestaurantKitchenStatus[]> = {
  NEW: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['SERVED'],
  SERVED: [],
};

export class RestaurantService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private manufacturing = new ManufacturingService();
  private sales = new SalesService();

  private requirePermission(permission: string) {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, permission);
    return actor;
  }

  public getTables(): RestaurantTable[] {
    const actor = this.requirePermission('orders.view');
    const scope = this.branchAccess.sqlScope('t.branch_id', undefined, actor);
    return this.db.query<RestaurantTable>(
      `SELECT t.id, t.branch_id AS branchId, t.table_number AS tableNumber,
              t.capacity, t.is_active AS isActive,
              CASE WHEN EXISTS (
                SELECT 1 FROM restaurant_orders o
                WHERE o.table_id = t.id AND o.status = 'OPEN'
              ) THEN 1 ELSE 0 END AS occupied
       FROM restaurant_tables t
       WHERE ${scope.clause}
       ORDER BY t.branch_id, t.table_number`,
      scope.params
    );
  }

  public createTable(tableNumber: number, capacity = 2): RestaurantTable {
    const actor = this.requirePermission('orders.create');
    PermissionService.require(actor, 'orders.view');
    if (!Number.isInteger(tableNumber) || tableNumber < 1) throw new Error('رقم الطاولة يجب أن يكون رقماً موجباً.');
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('سعة الطاولة يجب أن تكون رقماً موجباً.');
    const branchId = this.branchAccess.getDefaultAccessibleBranchId(actor);
    const id = `rt_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO restaurant_tables (id, branch_id, table_number, capacity)
       VALUES (?, ?, ?, ?)`,
      [id, branchId, tableNumber, capacity]
    );
    this.audit(actor.id, actor.fullName, 'إضافة طاولة مطعم', id, { tableNumber, capacity });
    return this.getTables().find((table) => table.id === id)!;
  }

  public getMenuItems(): RestaurantMenuItem[] {
    const actor = this.requirePermission('orders.view');
    PermissionService.require(actor, 'products.view');
    const scope = this.branchAccess.sqlScope('m.branch_id', undefined, actor);
    const company = this.branchAccess.companyScope('p.company_id', actor);
    return this.db.query<RestaurantMenuItem>(
      `SELECT m.id, m.branch_id AS branchId, m.product_id AS productId,
              p.name AS productName, p.base_unit AS baseUnit,
              p.selling_price_m2 AS unitPrice, m.is_available AS isAvailable
       FROM restaurant_menu_items m
       JOIN products p ON p.id = m.product_id
       WHERE ${scope.clause} AND ${company.clause}
       ORDER BY p.name`,
      [...scope.params, ...company.params]
    );
  }

  public addMenuItem(productId: string, warehouseId: string): RestaurantMenuItem {
    const actor = this.requirePermission('orders.create');
    PermissionService.require(actor, 'orders.view');
    PermissionService.require(actor, 'products.view');
    PermissionService.require(actor, 'inventory.view');
    const branchId = this.branchAccess.requireWarehouseAccess(warehouseId, actor);
    const company = this.branchAccess.companyScope('p.company_id', actor);
    const product = this.db.query<{ id: string; companyId: string | null }>(
      `SELECT p.id, p.company_id AS companyId FROM products p
       WHERE p.id = ? AND p.is_active = 1 AND ${company.clause}`,
      [productId, ...company.params]
    )[0];
    if (!product) throw new Error('صنف القائمة غير موجود أو غير نشط.');
    const id = `rmi_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    this.db.run(
      `INSERT INTO restaurant_menu_items (id, branch_id, product_id, created_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(branch_id, product_id) DO UPDATE SET
         is_available = 1, updated_at = CURRENT_TIMESTAMP`,
      [id, branchId, product.id, actor.id]
    );
    const menuItem = this.db.query<RestaurantMenuItem>(
      `SELECT m.id, m.branch_id AS branchId, m.product_id AS productId,
              p.name AS productName, p.base_unit AS baseUnit,
              p.selling_price_m2 AS unitPrice, m.is_available AS isAvailable
       FROM restaurant_menu_items m JOIN products p ON p.id = m.product_id
       WHERE m.branch_id = ? AND m.product_id = ?`,
      [branchId, product.id]
    )[0];
    this.audit(actor.id, actor.fullName, 'إضافة صنف لقائمة المطعم', menuItem.id, { productId, branchId });
    return menuItem;
  }

  public setMenuItemAvailability(menuItemId: string, isAvailable: boolean): RestaurantMenuItem {
    const actor = this.requirePermission('orders.update');
    PermissionService.require(actor, 'orders.view');
    const menuItem = this.db.query<{ id: string; branchId: string }>(
      `SELECT id, branch_id AS branchId FROM restaurant_menu_items WHERE id = ?`,
      [menuItemId]
    )[0];
    if (!menuItem) throw new Error('صنف القائمة غير موجود.');
    this.branchAccess.requireBranchAccess(menuItem.branchId, actor);
    this.db.run(
      `UPDATE restaurant_menu_items SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isAvailable ? 1 : 0, menuItemId]
    );
    return this.getMenuItems().find((item) => item.id === menuItemId)!;
  }

  public setTableActive(tableId: string, isActive: boolean): RestaurantTable {
    const actor = this.requirePermission('orders.update');
    PermissionService.require(actor, 'orders.view');
    const table = this.db.query<{ id: string; branchId: string }>(
      `SELECT id, branch_id AS branchId FROM restaurant_tables WHERE id = ?`,
      [tableId]
    )[0];
    if (!table) throw new Error('الطاولة غير موجودة.');
    this.branchAccess.requireBranchAccess(table.branchId, actor);
    if (!isActive) {
      const activeOrder = this.db.query<{ id: string }>(
        `SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'OPEN' LIMIT 1`,
        [tableId]
      )[0];
      if (activeOrder) throw new Error('لا يمكن إيقاف طاولة عليها طلب مفتوح.');
    }
    this.db.run(
      `UPDATE restaurant_tables SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isActive ? 1 : 0, tableId]
    );
    return this.getTables().find((item) => item.id === tableId)!;
  }

  public getOpenOrders(): RestaurantOrder[] {
    const actor = this.requirePermission('orders.view');
    const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const orders = this.db.query<RestaurantOrder>(
      `SELECT o.id, o.order_number AS orderNumber, o.branch_id AS branchId,
              o.table_id AS tableId, t.table_number AS tableNumber,
              o.service_mode AS serviceMode, o.customer_id AS customerId,
              c.name AS customerName, o.warehouse_id AS warehouseId,
              w.name AS warehouseName, o.status, o.notes, o.created_at AS createdAt,
              i.id AS invoiceId, i.invoice_number AS invoiceNumber
       FROM restaurant_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN restaurant_tables t ON t.id = o.table_id
       LEFT JOIN sales_invoices i ON i.restaurant_order_id = o.id
       WHERE o.status = 'OPEN' AND ${scope.clause}
       ORDER BY o.created_at, o.order_number
       LIMIT 500`,
      scope.params
    );
    return orders.map((order) => ({ ...order, items: this.getOrderItems(order.id) }));
  }

  public createOrder(input: CreateRestaurantOrderInput): RestaurantOrder {
    const actor = this.requirePermission('orders.create');
    PermissionService.require(actor, 'orders.view');
    PermissionService.require(actor, 'customers.view');
    PermissionService.require(actor, 'products.view');
    PermissionService.require(actor, 'inventory.view');
    if (!['DINE_IN', 'TAKEAWAY', 'DELIVERY'].includes(input.serviceMode)) {
      throw new Error('نوع خدمة المطعم غير صالح.');
    }
    if (input.serviceMode === 'DINE_IN' && !input.tableId) throw new Error('اختر طاولة للطلب داخل المطعم.');
    if (input.serviceMode !== 'DINE_IN' && input.tableId) throw new Error('الطاولة تستخدم لطلبات الصالة فقط.');
    if (!input.customerId) throw new Error('اختر العميل.');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('أضف صنفاً واحداً على الأقل.');
    const branchId = this.branchAccess.requireWarehouseAccess(input.warehouseId, actor);
    const customer = this.db.query<{ id: string }>(
      `SELECT c.id
       FROM customers c
       WHERE c.id = ?
         AND (c.company_id IS NULL OR c.company_id = (
           SELECT b.company_id FROM branches b WHERE b.id = ?
         ))`,
      [input.customerId, branchId]
    )[0];
    if (!customer) throw new Error('العميل غير موجود.');

    const table = input.tableId
      ? this.db.query<{ id: string; branchId: string; isActive: number }>(
        `SELECT id, branch_id AS branchId, is_active AS isActive
         FROM restaurant_tables WHERE id = ?`,
        [input.tableId]
      )[0]
      : undefined;
    if (input.tableId && (!table || !table.isActive || table.branchId !== branchId)) {
      throw new Error('الطاولة غير نشطة أو لا تتبع فرع المخزن المحدد.');
    }
    if (input.tableId) {
      const occupied = this.db.query<{ id: string }>(
        `SELECT id FROM restaurant_orders WHERE table_id = ? AND status = 'OPEN' LIMIT 1`,
        [input.tableId]
      )[0];
      if (occupied) throw new Error('الطاولة مرتبطة بطلب مفتوح بالفعل.');
    }

    const scope = this.branchAccess.companyScope('p.company_id', actor);
    const items = input.items.map((item) => {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('كمية أحد الأصناف غير صالحة.');
      const product = this.db.query<{ id: string; name: string; baseUnit: string; price: number; companyId: string | null }>(
        `SELECT p.id, p.name, p.base_unit AS baseUnit,
                p.selling_price_m2 AS price, p.company_id AS companyId
         FROM products p
         JOIN restaurant_menu_items m ON m.product_id = p.id AND m.branch_id = ?
         WHERE p.id = ? AND p.is_active = 1 AND m.is_available = 1 AND ${scope.clause}`,
        [branchId, item.productId, ...scope.params]
      )[0];
      if (!product) throw new Error('أحد الأصناف غير متاح في قائمة المطعم لهذا الفرع.');
      if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
        throw new Error(`سعر الصنف «${product.name}» غير صالح.`);
      }
      return {
        productId: product.id,
        quantity,
        unitPrice: Number(product.price),
        notes: item.notes?.trim() || null,
      };
    });

    const id = `ro_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((db) => {
      const orderNumber = db.nextNumber('RST');
      db.run(
        `INSERT INTO restaurant_orders
          (id, order_number, branch_id, table_id, service_mode, customer_id, warehouse_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, orderNumber, branchId, input.tableId || null, input.serviceMode, input.customerId,
          input.warehouseId, input.notes?.trim() || null, actor.id, now, now]
      );
      for (const item of items) {
        db.run(
          `INSERT INTO restaurant_order_items
            (id, order_id, product_id, quantity, unit_price, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`roi_${uuidv4().replace(/-/g, '').slice(0, 12)}`, id, item.productId,
            item.quantity, item.unitPrice, item.notes, now, now]
        );
      }
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'إنشاء طلب مطعم', 'SALES', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
          JSON.stringify({ serviceMode: input.serviceMode, tableId: input.tableId || null, items: items.length })]
      );
    });
    return this.getOrder(id)!;
  }

  public updateKitchenStatus(itemId: string, nextStatus: RestaurantKitchenStatus): RestaurantOrder {
    const actor = this.requirePermission('orders.update');
    PermissionService.require(actor, 'orders.view');
    const item = this.getItemForUpdate(itemId, actor);
    if (!KITCHEN_TRANSITIONS[item.kitchenStatus]?.includes(nextStatus)) {
      throw new Error(`لا يمكن نقل الصنف من حالة ${item.kitchenStatus} إلى ${nextStatus}.`);
    }

    if (nextStatus === 'PREPARING') this.startRecipeProduction(item, actor);
    if (nextStatus === 'READY' && item.productionOrderId) this.completeRecipeProduction(item.productionOrderId);

    this.db.run(
      `UPDATE restaurant_order_items SET kitchen_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nextStatus, itemId]
    );
    this.audit(actor.id, actor.fullName, 'تحديث حالة صنف مطعم', itemId, { from: item.kitchenStatus, to: nextStatus });
    return this.getOrder(item.orderId)!;
  }

  public cancelOrder(orderId: string): void {
    const actor = this.requirePermission('orders.update');
    const order = this.getOrder(orderId);
    if (!order) throw new Error('طلب المطعم غير موجود.');
    if (order.status !== 'OPEN') throw new Error('لا يمكن إلغاء طلب مغلق.');
    if (order.items.some((item) => item.kitchenStatus !== 'NEW')) {
      throw new Error('لا يمكن إلغاء طلب بدأ تحضيره؛ سجّل الصنف كتالف أو راجع الإدارة.');
    }
    this.db.run(
      `UPDATE restaurant_orders SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [orderId]
    );
    this.audit(actor.id, actor.fullName, 'إلغاء طلب مطعم', orderId, { orderNumber: order.orderNumber });
  }

  public billOrder(orderId: string, paymentType: PaymentType = 'CASH'): SalesInvoice {
    const actor = this.requirePermission('sales.create');
    PermissionService.require(actor, 'orders.update');
    PermissionService.require(actor, 'sales.view');
    if (!['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(paymentType)) {
      throw new Error('وسيلة التحصيل غير صالحة.');
    }
    const order = this.getOrder(orderId);
    if (!order) throw new Error('طلب المطعم غير موجود.');
    if (order.status !== 'OPEN' && order.status !== 'BILLED') throw new Error('الطلب غير قابل للفوترة.');
    if (order.items.length === 0 || order.items.some((item) => item.kitchenStatus !== 'SERVED')) {
      throw new Error('يجب تقديم جميع أصناف الطلب قبل إصدار الفاتورة.');
    }

    const existing = this.db.query<{ id: string }>(
      `SELECT id FROM sales_invoices WHERE restaurant_order_id = ?`,
      [orderId]
    )[0];
    if (existing) {
      this.db.run(`UPDATE restaurant_orders SET status = 'BILLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
      return this.sales.getInvoiceById(existing.id)!;
    }

    const total = round2(order.items.reduce((sum, item) => sum + round2(item.quantity * item.unitPrice), 0));
    let invoice: SalesInvoice;
    try {
      invoice = this.sales.createSale({
        customerId: order.customerId,
        warehouseId: order.warehouseId,
        restaurantOrderId: order.id,
        items: order.items.map((item) => ({
          productId: item.productId,
          soldBy: item.baseUnit || 'PIECE',
          uom: item.baseUnit || 'PIECE',
          quantity: item.quantity,
          quantityM2: item.quantity,
          boxesCount: 0,
          piecesCount: 0,
          unitPrice: item.unitPrice,
        })),
        paidAmount: total,
        paymentType,
        notes: `طلب مطعم ${order.orderNumber}`,
        performedBy: actor.id,
      });
    } catch (error) {
      const committed = this.db.query<{ id: string }>(
        `SELECT id FROM sales_invoices WHERE restaurant_order_id = ?`,
        [orderId]
      )[0];
      if (!committed) throw error;
      invoice = this.sales.getInvoiceById(committed.id)!;
    }

    this.db.run(
      `UPDATE restaurant_orders SET status = 'BILLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [orderId]
    );
    return invoice;
  }

  private getOrder(orderId: string): RestaurantOrder | null {
    const actor = this.requirePermission('orders.view');
    const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const order = this.db.query<RestaurantOrder>(
      `SELECT o.id, o.order_number AS orderNumber, o.branch_id AS branchId,
              o.table_id AS tableId, t.table_number AS tableNumber,
              o.service_mode AS serviceMode, o.customer_id AS customerId,
              c.name AS customerName, o.warehouse_id AS warehouseId,
              w.name AS warehouseName, o.status, o.notes, o.created_at AS createdAt,
              i.id AS invoiceId, i.invoice_number AS invoiceNumber
       FROM restaurant_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN restaurant_tables t ON t.id = o.table_id
       LEFT JOIN sales_invoices i ON i.restaurant_order_id = o.id
       WHERE o.id = ? AND ${scope.clause}`,
      [orderId, ...scope.params]
    )[0];
    return order ? { ...order, items: this.getOrderItems(orderId) } : null;
  }

  private getOrderItems(orderId: string): RestaurantOrderItem[] {
    return this.db.query<RestaurantOrderItem>(
      `SELECT i.id, i.order_id AS orderId, i.product_id AS productId,
              p.name AS productName, p.base_unit AS baseUnit,
              i.quantity, i.unit_price AS unitPrice, i.notes,
              i.kitchen_status AS kitchenStatus, i.production_order_id AS productionOrderId
       FROM restaurant_order_items i
       JOIN products p ON p.id = i.product_id
       WHERE i.order_id = ?
       ORDER BY i.created_at, i.id`,
      [orderId]
    );
  }

  private getItemForUpdate(itemId: string, actor: ReturnType<typeof AuthService.requireAuth>) {
    const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const item = this.db.query<RestaurantOrderItem & { orderStatus: string; warehouseId: string; branchId: string }>(
      `SELECT i.id, i.order_id AS orderId, i.product_id AS productId,
              p.name AS productName, p.base_unit AS baseUnit,
              i.quantity, i.unit_price AS unitPrice, i.notes,
              i.kitchen_status AS kitchenStatus, i.production_order_id AS productionOrderId,
              o.status AS orderStatus, o.warehouse_id AS warehouseId, o.branch_id AS branchId
       FROM restaurant_order_items i
       JOIN restaurant_orders o ON o.id = i.order_id
       JOIN products p ON p.id = i.product_id
       WHERE i.id = ? AND ${scope.clause}`,
      [itemId, ...scope.params]
    )[0];
    if (!item) throw new Error('صنف الطلب غير موجود أو خارج نطاق الفرع.');
    if (item.orderStatus !== 'OPEN') throw new Error('طلب المطعم مغلق.');
    return item;
  }

  private startRecipeProduction(
    item: RestaurantOrderItem & { warehouseId: string; branchId: string },
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    const bom = this.db.query<{ id: string }>(
      `SELECT id FROM bills_of_materials
       WHERE product_id = ? AND status = 'ACTIVE'
       ORDER BY created_at DESC LIMIT 1`,
      [item.productId]
    )[0];
    if (!bom) return;
    const product = this.db.query<{ productType: string; baseUnit: string }>(
      `SELECT product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?`,
      [item.productId]
    )[0];
    if (!product || isServiceProduct(product)) {
      throw new Error('أصناف الوصفات يجب أن تتبع مخزون المنتجات، ولا يمكن تصنيع صنف خدمة.');
    }

    ModuleRegistryService.assertModuleEnabled('manufacturing');
    let productionOrderId = item.productionOrderId;
    if (!productionOrderId) {
      const production = this.manufacturing.createProductionOrder({
        productId: item.productId,
        bomId: bom.id,
        quantity: item.quantity,
        warehouseId: item.warehouseId,
        branchId: item.branchId,
      });
      productionOrderId = production.id;
      this.db.run(
        `UPDATE restaurant_order_items SET production_order_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND production_order_id IS NULL`,
        [productionOrderId, item.id]
      );
      const linked = this.db.query<{ productionOrderId: string }>(
        `SELECT production_order_id AS productionOrderId FROM restaurant_order_items WHERE id = ?`,
        [item.id]
      )[0]?.productionOrderId;
      if (linked !== productionOrderId) {
        this.manufacturing.cancelOrder(productionOrderId);
        productionOrderId = linked;
      }
    }
    if (!productionOrderId) throw new Error('تعذر ربط أمر التحضير بتذكرة المطبخ.');
    let production = this.manufacturing.getProductionOrder(productionOrderId);
    if (production.status === 'PLANNED') production = this.manufacturing.releaseOrder(productionOrderId);
    if (production.status === 'RELEASED') this.manufacturing.startOrder(productionOrderId);
  }

  private completeRecipeProduction(productionOrderId: string): ProductionOrder {
    ModuleRegistryService.assertModuleEnabled('manufacturing');
    const production = this.manufacturing.getProductionOrder(productionOrderId);
    if (production.status === 'COMPLETED') return production;
    if (production.status !== 'IN_PROGRESS') throw new Error('أمر تحضير الوصفة ليس قيد التنفيذ.');
    return this.manufacturing.completeOrder(productionOrderId);
  }

  private audit(userId: string, userName: string, action: string, recordId: string, values: object): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, userId, userName, action, recordId, JSON.stringify(values)]
    );
  }
}
