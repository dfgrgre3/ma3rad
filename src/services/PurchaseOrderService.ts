import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { PurchaseService } from './PurchaseService';
import type { PaymentType, PurchaseInvoice } from '../types';

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderRow {
  id: string;
  orderNumber: string;
  date: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  requestId?: string | null;
  expectedDate?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  status: PurchaseOrderStatus;
  notes?: string | null;
  createdByName?: string;
  createdAt: string;
  itemsCount?: number;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName: string;
  quantityM2: number;
  boxesCount: number;
  receivedM2: number;
  unitCost: number;
  totalCost: number;
}

export interface CreatePurchaseOrderDTO {
  supplierId: string;
  warehouseId: string;
  expectedDate?: string;
  requestId?: string;
  discountAmount?: number;
  taxAmount?: number;
  shippingCost?: number;
  notes?: string;
  items: { productId: string; quantityM2: number; boxesCount?: number; unitCost: number }[];
}

export class PurchaseOrderService {
  private db = DatabaseManager.getInstance();

  public getAllOrders(search = '', status: 'ALL' | PurchaseOrderStatus = 'ALL'): PurchaseOrderRow[] {
    let sql = `
      SELECT po.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName,
        (SELECT COUNT(*) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS itemsCount
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE 1 = 1
    `;
    const params: any[] = [];
    if (status !== 'ALL') { sql += ` AND po.status = ?`; params.push(status); }
    if (search.trim()) {
      sql += ` AND (po.order_number LIKE ? OR s.name LIKE ? OR po.notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY po.created_at DESC`;
    return this.db.query<PurchaseOrderRow>(sql, params);
  }

  public getOrderById(id: string): (PurchaseOrderRow & { items: PurchaseOrderItem[] }) | null {
    const row = this.db.query<PurchaseOrderRow>(`
      SELECT po.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = ?
    `, [id])[0];
    if (!row) return null;
    const items = this.db.query<PurchaseOrderItem>(`
      SELECT id, purchase_order_id AS purchaseOrderId, product_id AS productId,
             product_name AS productName, quantity_m2 AS quantityM2, boxes_count AS boxesCount,
             received_m2 AS receivedM2, unit_cost AS unitCost, total_cost AS totalCost
      FROM purchase_order_items WHERE purchase_order_id = ?
    `, [id]);
    return { ...row, items };
  }

  public createOrder(dto: CreatePurchaseOrderDTO): PurchaseOrderRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    if (!dto.supplierId) throw new Error('يجب اختيار المورد.');
    if (!dto.warehouseId) throw new Error('يجب اختيار المخزن.');
    const lines = (dto.items || []).filter((i) => i.productId && Number(i.quantityM2) > 0);
    if (lines.length === 0) throw new Error('يجب إضافة صنف واحد على الأقل.');

    const orderId = `po_${uuidv4().substring(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);

    return this.db.executeTransaction((db) => {
      const orderNumber = db.nextNumber('PO');
      let subtotal = 0;
      const prepared = lines.map((line) => {
        const product = db.query<any>(
          `SELECT name, grade, meters_per_box AS metersPerBox FROM products WHERE id = ?`,
          [line.productId]
        )[0];
        if (!product) throw new Error('أحد الأصناف غير موجود.');
        const totalCost = round2(Number(line.quantityM2) * Number(line.unitCost));
        subtotal = round2(subtotal + totalCost);
        return {
          id: `poitem_${uuidv4().substring(0, 8)}`,
          productId: line.productId,
          productName: product.name,
          quantityM2: Number(line.quantityM2),
          boxesCount: line.boxesCount || round2(Number(line.quantityM2) / (Number(product.metersPerBox) || 1.44)),
          unitCost: Number(line.unitCost),
          totalCost,
        };
      });

      const discount = round2(dto.discountAmount || 0);
      const tax = round2(dto.taxAmount || 0);
      const shipping = round2(dto.shippingCost || 0);
      const total = round2(subtotal - discount + tax + shipping);

      db.run(`
        INSERT INTO purchase_orders (
          id, order_number, date, supplier_id, warehouse_id, request_id, expected_date,
          subtotal, discount_amount, tax_amount, shipping_cost, total_amount, status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
      `, [
        orderId, orderNumber, today, dto.supplierId, dto.warehouseId, dto.requestId || null,
        dto.expectedDate || null, subtotal, discount, tax, shipping, total, dto.notes || null, actor.id,
      ]);

      for (const item of prepared) {
        db.run(`
          INSERT INTO purchase_order_items (
            id, purchase_order_id, product_id, product_name, quantity_m2,
            boxes_count, received_m2, unit_cost, total_cost
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `, [
          item.id, orderId, item.productId, item.productName, item.quantityM2,
          item.boxesCount, item.unitCost, item.totalCost,
        ]);
      }

      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إنشاء أمر شراء', 'PURCHASES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, orderId, JSON.stringify({ orderNumber, total })]);

      return this.getOrderById(orderId)!;
    });
  }

  public updateStatus(id: string, status: PurchaseOrderStatus): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.update');
    const order = this.db.query<any>(`SELECT status FROM purchase_orders WHERE id = ?`, [id])[0];
    if (!order) throw new Error('أمر الشراء غير موجود.');
    if (order.status === 'RECEIVED') throw new Error('أمر الشراء مستلم بالفعل.');
    if (order.status === 'CANCELLED') throw new Error('أمر الشراء ملغي.');
    if (status === 'RECEIVED') throw new Error('استخدم زر الاستلام لترحيل الفاتورة تلقائيًا.');

    this.db.executeTransaction((db) => {
      db.run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [status, id]);
      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'تحديث حالة أمر شراء', 'PURCHASES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ status })]);
    });
  }

  public receiveOrder(id: string): PurchaseInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    const order = this.getOrderById(id);
    if (!order) throw new Error('أمر الشراء غير موجود.');
    if (order.status === 'RECEIVED') throw new Error('تم استلام هذا الأمر مسبقًا.');
    if (order.status === 'CANCELLED') throw new Error('لا يمكن استلام أمر ملغي.');

    const invoice = new PurchaseService().createPurchase({
      supplierId: order.supplierId,
      supplierInvoiceNumber: order.orderNumber,
      warehouseId: order.warehouseId,
      items: order.items.map((item) => ({
        productId: item.productId,
        quantityM2: round2(item.quantityM2 - item.receivedM2),
        boxesCount: item.boxesCount,
        unitCost: item.unitCost,
      })).filter((item) => item.quantityM2 > 0),
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      shippingCost: order.shippingCost,
      paidAmount: 0,
      paymentType: 'CREDIT' as PaymentType,
      notes: `استلام أمر شراء ${order.orderNumber}${order.notes ? ` — ${order.notes}` : ''}`,
    });

    this.db.executeTransaction((db) => {
      db.run(`UPDATE purchase_order_items SET received_m2 = quantity_m2 WHERE purchase_order_id = ?`, [id]);
      db.run(`UPDATE purchase_orders SET status = 'RECEIVED' WHERE id = ?`, [id]);
      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'استلام أمر شراء وترحيل فاتورة', 'PURCHASES', ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id,
        JSON.stringify({ orderNumber: order.orderNumber, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }),
      ]);
    });

    return invoice;
  }

  public cancelOrder(id: string): void {
    this.updateStatus(id, 'CANCELLED');
  }
}
