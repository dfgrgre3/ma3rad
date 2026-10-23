import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { SalesService } from './SalesService';
import { OrderService, type Order } from './OrderService';
import { round2 } from './financials';
import type { PaymentType, SalesInvoice } from '../types';

export type QuotationStatus = 'PENDING' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export interface QuotationItemInput {
  productId: string;
  quantityM2: number;
  unitPrice: number;
  discountAmount?: number;
  soldBy?: 'M2' | 'BOX' | 'PIECE';
  boxesCount?: number;
  piecesCount?: number;
}

export interface QuotationInput {
  customerId: string;
  warehouseId?: string;
  validDays?: number;
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
  salesRepId?: string;
  projectId?: string;
  items: QuotationItemInput[];
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  productId: string;
  productName: string;
  grade: string;
  size?: string | null;
  sku?: string | null;
  quantityM2: number;
  boxesCount: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  metersPerBox?: number;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  warehouseId?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: QuotationStatus;
  convertedInvoiceId?: string | null;
  convertedInvoiceNumber?: string | null;
  notes?: string | null;
  salesRepId?: string | null;
  projectId?: string | null;
  followUpDate?: string | null;
  followUpNotes?: string | null;
  convertedOrderId?: string | null;
  convertedOrderNumber?: string | null;
  contactCount?: number;
  lastContactAt?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string | null;
  items?: QuotationItem[];
  itemsCount?: number;
  totalM2?: number;
}

export interface QuotationFilters {
  search?: string;
  status?: 'ALL' | QuotationStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface QuotationStats {
  total: number;
  totalValue: number;
  pending: number;
  pendingValue: number;
  converted: number;
  convertedValue: number;
  expired: number;
  cancelled: number;
  followUpDue: number;
  expiringSoon: number;
}

export interface ConvertQuotationOptions {
  warehouseId?: string;
  paidAmount?: number;
  paymentType?: PaymentType;
  notes?: string;
}

export class QuotationService {
  private db = DatabaseManager.getInstance();
  private sales = new SalesService();

  /** Flip overdue pending quotations to EXPIRED. Cheap idempotent UPDATE. */
  public expireOverdue(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.db.run(
      `UPDATE quotations
       SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PENDING' AND valid_until < ?`,
      [today]
    );
  }

  public getQuotations(filters: QuotationFilters = {}): Quotation[] {
    this.expireOverdue();
    const { where, params } = this.buildWhere(filters);
    return this.db.query<Quotation>(
      `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone,
              si.invoice_number AS converted_invoice_number,
              o.order_number AS converted_order_number,
              (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) AS items_count,
              (SELECT COALESCE(SUM(qi.quantity_m2), 0) FROM quotation_items qi WHERE qi.quotation_id = q.id) AS total_m2
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN sales_invoices si ON si.id = q.converted_invoice_id
       LEFT JOIN orders o ON o.id = q.converted_order_id
       ${where}
       ORDER BY q.date DESC, q.created_at DESC`,
      params
    );
  }

  public getQuotation(id: string): Quotation | null {
    const rows = this.db.query<Quotation>(
      `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone,
              si.invoice_number AS converted_invoice_number,
              o.order_number AS converted_order_number
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN sales_invoices si ON si.id = q.converted_invoice_id
       LEFT JOIN orders o ON o.id = q.converted_order_id
       WHERE q.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], items: this.getItems(id) };
  }

  public getItems(quotationId: string): QuotationItem[] {
    return this.db.query<QuotationItem>(
      `SELECT qi.*, p.meters_per_box
       FROM quotation_items qi
       LEFT JOIN products p ON p.id = qi.product_id
       WHERE qi.quotation_id = ?
       ORDER BY qi.rowid ASC`,
      [quotationId]
    );
  }

  public getStats(filters: QuotationFilters = {}): QuotationStats {
    this.expireOverdue();
    const { where, params } = this.buildWhere(filters);
    const row = this.db.query<any>(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(q.total_amount), 0) AS total_value,
         COALESCE(SUM(CASE WHEN q.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN q.status = 'PENDING' THEN q.total_amount ELSE 0 END), 0) AS pending_value,
         COALESCE(SUM(CASE WHEN q.status = 'CONVERTED' THEN 1 ELSE 0 END), 0) AS converted,
         COALESCE(SUM(CASE WHEN q.status = 'CONVERTED' THEN q.total_amount ELSE 0 END), 0) AS converted_value,
         COALESCE(SUM(CASE WHEN q.status = 'EXPIRED' THEN 1 ELSE 0 END), 0) AS expired,
         COALESCE(SUM(CASE WHEN q.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled,
         COALESCE(SUM(CASE WHEN q.status = 'PENDING' AND q.follow_up_date IS NOT NULL
                           AND q.follow_up_date <= date('now') THEN 1 ELSE 0 END), 0) AS followUpDue,
         COALESCE(SUM(CASE WHEN q.status = 'PENDING' AND q.valid_until <= date('now', '+7 day')
                           AND q.valid_until >= date('now') THEN 1 ELSE 0 END), 0) AS expiringSoon
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       ${where}`,
      params
    )[0] || {};
    return {
      total: Number(row.total || 0),
      totalValue: Number(row.totalValue || 0),
      pending: Number(row.pending || 0),
      pendingValue: Number(row.pendingValue || 0),
      converted: Number(row.converted || 0),
      convertedValue: Number(row.convertedValue || 0),
      expired: Number(row.expired || 0),
      cancelled: Number(row.cancelled || 0),
      followUpDue: Number(row.followUpDue || 0),
      expiringSoon: Number(row.expiringSoon || 0),
    };
  }

  public createQuotation(input: QuotationInput): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');

    const prepared = this.prepareItems(input.items, actor);
    const subtotal = round2(prepared.reduce((s, i) => s + i.totalPrice, 0));
    const headerDiscount = round2(Math.max(0, input.discountAmount || 0));
    const taxAmount = round2(Math.max(0, input.taxAmount || 0));
    const totalAmount = round2(Math.max(0, subtotal - headerDiscount + taxAmount));
    const validDays = Math.max(1, Math.min(365, Number(input.validDays) || 15));
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);
    const id = `qtn_${uuidv4().substring(0, 8)}`;

    return this.db.executeTransaction((db) => {
      if (headerDiscount > 0 || prepared.some((i) => i.discountAmount > 0)) {
        PermissionService.require(actor, 'sales.discount');
      }
      const quotationNumber = db.nextNumber('QTN');
      const customer = db.query<any>(`SELECT name, phone FROM customers WHERE id = ?`, [input.customerId])[0];
      if (!customer) throw new Error('العميل المحدد غير موجود.');

      db.run(
        `INSERT INTO quotations (
           id, quotation_number, date, valid_until, customer_id, customer_name, customer_phone,
           warehouse_id, subtotal, discount_amount, tax_amount, total_amount, status, notes,
           sales_rep_id, project_id, created_by, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id, quotationNumber, today, validUntil, input.customerId, customer.name, customer.phone || null,
          input.warehouseId || null, subtotal, headerDiscount, taxAmount, totalAmount,
          input.notes || null, input.salesRepId || null, input.projectId || null, actor.id,
        ]
      );

      for (const item of prepared) {
        db.run(
          `INSERT INTO quotation_items (
             id, quotation_id, product_id, product_name, grade, size, sku,
             quantity_m2, boxes_count, unit_price, discount_amount, total_price
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `qti_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
            item.size, item.sku, item.quantityM2, item.boxesCount, item.unitPrice,
            item.discountAmount, item.totalPrice,
          ]
        );
      }

      this.audit(actor.id, actor.fullName, 'إنشاء عرض سعر', id, {
        quotationNumber, totalAmount, items: prepared.length,
      });
      return this.getQuotation(id)!;
    });
  }

  public updateQuotation(id: string, input: QuotationInput): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    if (!['PENDING', 'EXPIRED'].includes(existing.status)) {
      throw new Error('لا يمكن تعديل عرض سعر تم تحويله أو إلغاؤه.');
    }

    const prepared = this.prepareItems(input.items, actor);
    const subtotal = round2(prepared.reduce((s, i) => s + i.totalPrice, 0));
    const headerDiscount = round2(Math.max(0, input.discountAmount || 0));
    const taxAmount = round2(Math.max(0, input.taxAmount || 0));
    const totalAmount = round2(Math.max(0, subtotal - headerDiscount + taxAmount));
    const validDays = Math.max(1, Math.min(365, Number(input.validDays) || 15));
    const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);

    return this.db.executeTransaction((db) => {
      if (headerDiscount > 0 || prepared.some((i) => i.discountAmount > 0)) {
        PermissionService.require(actor, 'sales.discount');
      }
      const customer = db.query<any>(`SELECT name, phone FROM customers WHERE id = ?`, [input.customerId])[0];
      if (!customer) throw new Error('العميل المحدد غير موجود.');

      db.run(
        `UPDATE quotations SET
           customer_id = ?, customer_name = ?, customer_phone = ?, warehouse_id = ?,
           valid_until = ?, subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?,
           status = 'PENDING', notes = ?, sales_rep_id = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          input.customerId, customer.name, customer.phone || null, input.warehouseId || null,
          validUntil, subtotal, headerDiscount, taxAmount, totalAmount,
          input.notes || null, input.salesRepId || null, input.projectId || null, id,
        ]
      );

      db.run(`DELETE FROM quotation_items WHERE quotation_id = ?`, [id]);
      for (const item of prepared) {
        db.run(
          `INSERT INTO quotation_items (
             id, quotation_id, product_id, product_name, grade, size, sku,
             quantity_m2, boxes_count, unit_price, discount_amount, total_price
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `qti_${uuidv4().substring(0, 8)}`, id, item.productId, item.productName, item.grade,
            item.size, item.sku, item.quantityM2, item.boxesCount, item.unitPrice,
            item.discountAmount, item.totalPrice,
          ]
        );
      }

      this.audit(actor.id, actor.fullName, 'تعديل عرض سعر', id, {
        quotationNumber: existing.quotationNumber, totalAmount, items: prepared.length,
      });
      return this.getQuotation(id)!;
    });
  }

  public setStatus(id: string, status: 'CANCELLED' | 'PENDING'): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    if (existing.status === 'CONVERTED') {
      throw new Error('عرض السعر محوّل إلى فاتورة ولا يمكن تغيير حالته.');
    }
    if (status === 'CANCELLED' && existing.status === 'CANCELLED') {
      throw new Error('عرض السعر ملغي بالفعل.');
    }
    this.db.run(
      `UPDATE quotations SET status = ?, valid_until = CASE WHEN ? = 'PENDING' THEN ? ELSE valid_until END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        status,
        status,
        new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        id,
      ]
    );
    this.audit(actor.id, actor.fullName, status === 'CANCELLED' ? 'إلغاء عرض سعر' : 'إعادة فتح عرض سعر', id, {
      quotationNumber: existing.quotationNumber, from: existing.status, to: status,
    });
    return this.getQuotation(id)!;
  }

  public deleteQuotation(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    if (existing.status === 'CONVERTED') {
      throw new Error('لا يمكن حذف عرض سعر تم تحويله إلى فاتورة.');
    }
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM quotation_items WHERE quotation_id = ?`, [id]);
      db.run(`DELETE FROM quotations WHERE id = ?`, [id]);
      this.audit(actor.id, actor.fullName, 'حذف عرض سعر', id, {
        quotationNumber: existing.quotationNumber, totalAmount: existing.totalAmount,
      });
    });
  }

  public duplicateQuotation(id: string): Quotation {
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    return this.createQuotation({
      customerId: existing.customerId,
      warehouseId: existing.warehouseId || undefined,
      validDays: 15,
      discountAmount: existing.discountAmount,
      taxAmount: existing.taxAmount,
      notes: existing.notes || undefined,
      items: (existing.items || []).map((i) => ({
        productId: i.productId,
        quantityM2: i.quantityM2,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
      })),
    });
  }

  /** Turn a quotation into a reservable sales order (without moving stock yet). */
  public convertToOrder(
    id: string,
    options: { warehouseId?: string; expectedDeliveryDate?: string; notes?: string } = {}
  ): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    if (quotation.status === 'CANCELLED') throw new Error('لا يمكن تحويل عرض سعر ملغي.');
    if (quotation.status === 'CONVERTED') throw new Error('تم تحويل هذا العرض إلى فاتورة بالفعل.');
    if (quotation.convertedOrderId) throw new Error('تم إنشاء طلب مبيعات من هذا العرض بالفعل.');
    if (!quotation.items || quotation.items.length === 0) throw new Error('لا توجد بنود في عرض السعر.');

    const warehouseId = options.warehouseId || quotation.warehouseId || this.defaultWarehouseId();
    if (!warehouseId) throw new Error('لا يوجد مخزن صالح لإنشاء الطلب.');

    const order = new OrderService().createOrder({
      customerId: quotation.customerId,
      warehouseId,
      quotationId: quotation.id,
      expectedDeliveryDate: options.expectedDeliveryDate,
      notes: options.notes || `طلب مبيعات من عرض السعر ${quotation.quotationNumber}`,
      discountAmount: quotation.discountAmount,
      taxAmount: quotation.taxAmount,
      items: quotation.items.map((item) => ({
        productId: item.productId,
        quantityM2: item.quantityM2,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
      })),
    });

    this.db.run(
      `UPDATE quotations SET converted_order_id = ?, warehouse_id = ?,
        follow_up_date = NULL, follow_up_notes = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [order.id, warehouseId, id]
    );
    this.audit(actor.id, actor.fullName, 'تحويل عرض سعر إلى طلب مبيعات', id, {
      quotationNumber: quotation.quotationNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });
    return order;
  }

  public scheduleFollowUp(id: string, date: string | null, notes?: string | null): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    if (quotation.status === 'CONVERTED') throw new Error('لا يمكن جدولة متابعة لعرض محوّل.');
    this.db.run(
      `UPDATE quotations SET follow_up_date = ?, follow_up_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [date || null, notes || null, id]
    );
    this.audit(actor.id, actor.fullName, date ? 'جدولة متابعة عرض سعر' : 'إلغاء متابعة عرض سعر', id, {
      quotationNumber: quotation.quotationNumber, followUpDate: date, notes,
    });
    return this.getQuotation(id)!;
  }

  /** Mark that the customer was contacted about a pending quotation. */
  public recordContact(id: string, note?: string | null): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    this.db.run(
      `UPDATE quotations SET contact_count = COALESCE(contact_count, 0) + 1,
        last_contact_at = CURRENT_TIMESTAMP,
        follow_up_notes = COALESCE(?, follow_up_notes),
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [note || null, id]
    );
    this.audit(actor.id, actor.fullName, 'تسجيل متابعة عميل على عرض سعر', id, {
      quotationNumber: quotation.quotationNumber, note,
    });
    return this.getQuotation(id)!;
  }

  public convertToInvoice(id: string, options: ConvertQuotationOptions = {}): SalesInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    if (quotation.status === 'CONVERTED') {
      throw new Error('تم تحويل هذا العرض إلى فاتورة بالفعل.');
    }
    if (quotation.status === 'CANCELLED') {
      throw new Error('لا يمكن تحويل عرض سعر ملغي.');
    }
    if (quotation.status === 'EXPIRED') {
      throw new Error('عرض السعر منتهي الصلاحية. أعد فتحه أو حدّث تاريخ الصلاحية أولاً.');
    }
    if (!quotation.items || quotation.items.length === 0) {
      throw new Error('لا توجد بنود في عرض السعر.');
    }

    const warehouseId = options.warehouseId || quotation.warehouseId || this.defaultWarehouseId();
    if (!warehouseId) throw new Error('لا يوجد مخزن صالح لإصدار الفاتورة.');

    const total = round2(quotation.totalAmount);
    const paymentType: PaymentType = options.paymentType || 'CREDIT';
    const paidAmount = paymentType === 'CASH' && options.paidAmount === undefined
      ? total
      : round2(Math.min(total, Math.max(0, options.paidAmount || 0)));

    return this.db.executeTransaction(() => {
      const invoice = this.sales.createSale({
        customerId: quotation.customerId,
        warehouseId,
        items: quotation.items!.map((item) => ({
          productId: item.productId,
          soldBy: 'M2',
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: Math.round(item.boxesCount * 4),
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
        discountAmount: quotation.discountAmount,
        taxAmount: quotation.taxAmount,
        paidAmount,
        paymentType,
        notes: options.notes || `تحويل من عرض سعر ${quotation.quotationNumber}`,
      });

      this.db.run(
        `UPDATE quotations SET status = 'CONVERTED', converted_invoice_id = ?, warehouse_id = ?,
         follow_up_date = NULL, follow_up_notes = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [invoice.id, warehouseId, id]
      );
      this.audit(actor.id, actor.fullName, 'تحويل عرض سعر إلى فاتورة', id, {
        quotationNumber: quotation.quotationNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      });
      return invoice;
    });
  }

  public getDefaultWarehouseId(): string | undefined {
    return this.defaultWarehouseId();
  }

  private defaultWarehouseId(): string | undefined {
    return this.db.query<{ id: string }>(
      `SELECT id FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1`
    )[0]?.id;
  }

  private prepareItems(items: QuotationItemInput[], actor: ReturnType<typeof AuthService.requireAuth>) {
    if (!items || items.length === 0) {
      throw new Error('أضف بنداً واحداً على الأقل إلى عرض السعر.');
    }
    return items.map((item) => {
      const product = this.db.query<any>(
        `SELECT id, name, sku, grade, size, meters_per_box, pieces_per_box, min_selling_price_m2, is_active
         FROM products WHERE id = ?`,
        [item.productId]
      )[0];
      if (!product) throw new Error(`الصنف ذو المعرف ${item.productId} غير موجود.`);
      if (!product.isActive) throw new Error(`الصنف "${product.name}" غير نشط.`);

      const quantityM2 = round2(Math.max(0, item.quantityM2 || 0));
      if (quantityM2 <= 0) throw new Error(`كمية الصنف "${product.name}" يجب أن تكون أكبر من صفر.`);

      const unitPrice = round2(Math.max(0, item.unitPrice || 0));
      if (unitPrice <= 0) throw new Error(`سعر الصنف "${product.name}" يجب أن يكون أكبر من صفر.`);
      if (unitPrice < Number(product.minSellingPriceM2 || 0)) {
        PermissionService.require(actor, 'sales.approve');
      }

      const discountAmount = round2(Math.max(0, item.discountAmount || 0));
      const gross = round2(quantityM2 * unitPrice);
      if (discountAmount > gross) throw new Error(`خصم الصنف "${product.name}" أكبر من قيمته.`);
      const totalPrice = round2(gross - discountAmount);
      const metersPerBox = Number(product.metersPerBox) || 1.44;
      const boxesCount = item.boxesCount !== undefined
        ? round2(Math.max(0, item.boxesCount))
        : round2(quantityM2 / metersPerBox);

      return {
        productId: product.id as string,
        productName: product.name as string,
        grade: (product.grade as string) || 'GRADE_1',
        size: product.size as string,
        sku: product.sku as string,
        quantityM2,
        boxesCount,
        unitPrice,
        discountAmount,
        totalPrice,
      };
    });
  }

  private buildWhere(filters: QuotationFilters): { where: string; params: any[] } {
    let where = 'WHERE 1 = 1';
    const params: any[] = [];
    if (filters.status && filters.status !== 'ALL') {
      where += ` AND q.status = ?`;
      params.push(filters.status);
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      where += ` AND (q.quotation_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR si.invoice_number LIKE ?)`;
      params.push(term, term, term, term);
    }
    if (filters.dateFrom) {
      where += ` AND q.date >= ?`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += ` AND q.date <= ?`;
      params.push(filters.dateTo);
    }
    return { where, params };
  }

  private audit(userId: string, userName: string, action: string, recordId: string, values: any): void {
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'SALES', ?, ?)`,
      [`aud_${uuidv4().substring(0, 8)}`, userId, userName, action, recordId, JSON.stringify(values)]
    );
  }
}
