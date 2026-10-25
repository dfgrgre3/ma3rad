import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { round2 } from './financials';
import { PurchaseService } from './PurchaseService';
import { CustomerSupplyService } from './CustomerSupplyService';
import type { PaymentType, PurchaseInvoice } from '../types';

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderRow {
  id: string;
  orderNumber: string;
  date: string;
  supplierId: string;
  supplierName?: string;
  supplierPhone?: string | null;
  supplierAddress?: string | null;
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
  productCode?: string;
  barcode?: string | null;
  grade?: string;
  size?: string;
  brandName?: string | null;
  categoryName?: string | null;
  unit?: string;
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
      SELECT po.*, s.name AS supplierName, s.phone AS supplierPhone, s.address AS supplierAddress, w.name AS warehouseName, u.full_name AS createdByName,
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
      SELECT po.*, s.name AS supplierName, s.phone AS supplierPhone, s.address AS supplierAddress, w.name AS warehouseName, u.full_name AS createdByName
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = ?
    `, [id])[0];
    if (!row) return null;
    const items = this.db.query<PurchaseOrderItem>(`
      SELECT i.id, i.purchase_order_id AS purchaseOrderId, i.product_id AS productId,
             i.product_name AS productName, i.quantity_m2 AS quantityM2, i.boxes_count AS boxesCount,
             i.received_m2 AS receivedM2, i.unit_cost AS unitCost, i.total_cost AS totalCost,
             p.sku AS productCode, p.barcode, p.grade, p.size, b.name AS brandName, c.name AS categoryName,
             COALESCE(NULLIF(p.custom_unit,''),p.base_unit) AS unit
      FROM purchase_order_items i LEFT JOIN products p ON p.id=i.product_id
      LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE i.purchase_order_id = ?
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
    const today = localDateString();

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
    const order = this.getOrderById(id);
    if (!order) throw new Error('أمر الشراء غير موجود.');
    return this.receiveQuantities(id, Object.fromEntries(order.items.map((item) => [item.id, round2(item.quantityM2 - item.receivedM2)])));
  }

  /** Post only quantities physically received; stock, invoice and receipt history commit atomically. */
  public receiveQuantities(id: string, requested: Record<string, number>, notes = ''): PurchaseInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');
    const order = this.getOrderById(id);
    if (!order) throw new Error('أمر الشراء غير موجود.');
    if (order.status === 'RECEIVED' || order.status === 'CANCELLED') throw new Error('لا يمكن استلام هذا الأمر.');
    const lines = order.items.map((item) => ({ item, quantity: round2(Number(requested[item.id]) || 0) })).filter((line) => line.quantity > 0);
    if (!lines.length) throw new Error('أدخل كمية مستلمة واحدة على الأقل.');
    for (const { item, quantity } of lines) {
      if (quantity > round2(item.quantityM2 - item.receivedM2) + 0.001) throw new Error(`الكمية أكبر من المتبقي للصنف ${item.productName}.`);
    }
    const remainingValue = order.items.reduce((sum, item) => sum + Math.max(0, item.quantityM2 - item.receivedM2) * item.unitCost, 0);
    const receiptValue = lines.reduce((sum, line) => sum + line.quantity * line.item.unitCost, 0);
    const ratio = remainingValue > 0 ? receiptValue / remainingValue : 1;
    const invoice = this.db.executeTransaction((db) => {
      const created = new PurchaseService().createPurchase({
        supplierId: order.supplierId, supplierInvoiceNumber: order.orderNumber, warehouseId: order.warehouseId,
        items: lines.map(({ item, quantity }) => ({ productId: item.productId, quantityM2: quantity,
          boxesCount: item.quantityM2 > 0 ? round2(item.boxesCount * quantity / item.quantityM2) : 0, unitCost: item.unitCost })),
        discountAmount: round2(order.discountAmount * ratio), taxAmount: round2(order.taxAmount * ratio),
        shippingCost: round2(order.shippingCost * ratio), paidAmount: 0, paymentType: 'CREDIT' as PaymentType,
        notes: `استلام أمر شراء ${order.orderNumber}${notes ? ` — ${notes}` : ''}`,
      });
      const receiptId = `por_${uuidv4().substring(0, 8)}`;
      db.run(`INSERT INTO purchase_order_receipts (id, purchase_order_id, purchase_invoice_id, notes, created_by) VALUES (?, ?, ?, ?, ?)`, [receiptId, id, created.id, notes || null, actor.id]);
      for (const { item, quantity } of lines) {
        db.run(`UPDATE purchase_order_items SET received_m2 = received_m2 + ? WHERE id = ?`, [quantity, item.id]);
        db.run(`INSERT INTO purchase_order_receipt_items (id, receipt_id, order_item_id, quantity_m2) VALUES (?, ?, ?, ?)`, [`pori_${uuidv4().substring(0, 8)}`, receiptId, item.id, quantity]);
      }
      const left = db.query<{ remaining: number }>(`SELECT COALESCE(SUM(quantity_m2 - received_m2), 0) AS remaining FROM purchase_order_items WHERE purchase_order_id = ?`, [id])[0]?.remaining || 0;
      db.run(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [left <= 0.001 ? 'RECEIVED' : 'PARTIAL', id]);
      db.run(`INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values) VALUES (?, ?, ?, 'استلام أمر شراء', 'PURCHASES', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify({ orderNumber: order.orderNumber, invoiceId: created.id, lines })]);
      for (const { item, quantity } of lines) {
        new CustomerSupplyService().allocateReceivedQuantity(order.warehouseId, item.productId, quantity, db);
      }
      return created;
    });

    return invoice;
  }

  public getReceiptHistory(orderId: string): Array<{ id: string; invoiceNumber: string; receivedAt: string; notes: string | null; productName: string; quantity: number }> {
    return this.db.query(`SELECT r.id, pi.invoice_number AS invoiceNumber, r.received_at AS receivedAt, r.notes,
      poi.product_name AS productName, ri.quantity_m2 AS quantity FROM purchase_order_receipts r
      JOIN purchase_invoices pi ON pi.id = r.purchase_invoice_id JOIN purchase_order_receipt_items ri ON ri.receipt_id = r.id
      JOIN purchase_order_items poi ON poi.id = ri.order_item_id WHERE r.purchase_order_id = ? ORDER BY r.created_at DESC`, [orderId]);
  }

  public updateFollowUp(id: string, expectedDate: string | null, notes: string): void {
    const actor = AuthService.requireAuth(); PermissionService.require(actor, 'purchases.update');
    const order = this.getOrderById(id);
    if (!order || ['RECEIVED','CANCELLED'].includes(order.status)) throw new Error('لا يمكن تحديث متابعة هذا الطلب.');
    this.db.executeTransaction((db) => {
      db.run(`UPDATE purchase_orders SET expected_date=?,notes=? WHERE id=?`, [expectedDate || null, notes || null, id]);
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,old_values,new_values) VALUES (?,?,?,?,?,?,?,?)`,
        [`aud_${uuidv4().slice(0,8)}`,actor.id,actor.fullName,'تحديث متابعة توريد','PURCHASES',id,JSON.stringify({expectedDate:order.expectedDate,notes:order.notes}),JSON.stringify({expectedDate,notes})]);
    });
  }
  public cancelOrder(id: string): void {
    this.updateStatus(id, 'CANCELLED');
  }
}
