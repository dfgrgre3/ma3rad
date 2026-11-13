import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { SalesService } from './SalesService';
import { OrderService, type Order } from './OrderService';
import { round2 } from '../finance/financials';
import type { PaymentType, SalesInvoice } from '../../../types';
import { addLocalDays, localDateString } from '../../../utils/shared/date';
import { getUomLabel, normalizeUom } from '../../../utils/products/uom';
import { resolveSaleUnits } from './unitResolution';

export type QuotationStatus = 'PENDING' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export interface QuotationItemInput {
  productId: string;
  /** Quantity in the product's base unit; used when `uom`/`quantity` are absent. */
  quantityM2: number;
  unitPrice: number;
  discountAmount?: number;
  soldBy?: 'M2' | 'BOX' | 'PIECE';
  boxesCount?: number;
  piecesCount?: number;
  /** Selling unit the user typed the line in (services are always base-unit only). */
  uom?: string;
  /** Quantity expressed in `uom`; `unitPrice` is then per `uom`. */
  quantity?: number;
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
  items?: QuotationItemInput[];
  serviceItems?: QuotationServiceItemInput[];
}

export interface QuotationServiceItemInput {
  productId?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
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
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface QuotationServiceItem {
  id: string;
  quotationId: string;
  productId?: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  customerId: string;
  branchId?: string | null;
  companyId?: string | null;
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
  serviceItems?: QuotationServiceItem[];
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
  private branchAccess = new BranchAccessService();

  /** Explicit, permission-checked expiry operation for scheduled/admin workflows. */
  public expireOverdue(): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.update');
    const scope = this.quotationScope(actor, '');
    const today = localDateString();
    this.db.run(
      `UPDATE quotations
       SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PENDING' AND valid_until < ? AND ${scope.clause}`,
      [today, ...scope.params]
    );
  }

  public getQuotations(filters: QuotationFilters = {}): Quotation[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    const scope = this.quotationScope(actor);
    const { where, params } = this.buildWhere(filters, scope.clause);
    return this.db.query<Quotation>(
      `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone,
              si.invoice_number AS converted_invoice_number,
              o.order_number AS converted_order_number,
              ((SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) +
               (SELECT COUNT(*) FROM quotation_service_items qsi WHERE qsi.quotation_id = q.id)) AS items_count,
              (SELECT COALESCE(SUM(qi.quantity_m2), 0) FROM quotation_items qi WHERE qi.quotation_id = q.id) AS total_m2
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN sales_invoices si ON si.id = q.converted_invoice_id
       LEFT JOIN orders o ON o.id = q.converted_order_id
       ${where}
       ORDER BY q.date DESC, q.created_at DESC`,
      [...scope.params, ...params]
    );
  }

  public getQuotation(id: string): Quotation | null {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    return this.fetchQuotation(id, actor);
  }

  private fetchQuotation(id: string, actor: ReturnType<typeof AuthService.requireAuth>): Quotation | null {
    const scope = this.quotationScope(actor);
    const rows = this.db.query<Quotation>(
      `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone,
              si.invoice_number AS converted_invoice_number,
              o.order_number AS converted_order_number
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN sales_invoices si ON si.id = q.converted_invoice_id
       LEFT JOIN orders o ON o.id = q.converted_order_id
       WHERE q.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    );
    if (rows.length === 0) return null;
    return {
      ...rows[0],
      items: this.fetchItems(id, actor),
      serviceItems: this.fetchServiceItems(id, actor),
    };
  }

  public getServiceItems(quotationId: string): QuotationServiceItem[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    return this.fetchServiceItems(quotationId, actor);
  }

  private fetchServiceItems(quotationId: string, actor: ReturnType<typeof AuthService.requireAuth>): QuotationServiceItem[] {
    const scope = this.quotationScope(actor);
    return this.db.query<QuotationServiceItem>(
      `SELECT id, quotation_id AS quotationId, product_id AS productId, description, unit, quantity,
              unit_price AS unitPrice, discount_amount AS discountAmount, total_price AS totalPrice
       FROM quotation_service_items qsi WHERE quotation_id = ? AND EXISTS (
         SELECT 1 FROM quotations q WHERE q.id = qsi.quotation_id AND ${scope.clause}
       ) ORDER BY rowid ASC`,
      [quotationId, ...scope.params]
    );
  }

  public getItems(quotationId: string): QuotationItem[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    return this.fetchItems(quotationId, actor);
  }

  private fetchItems(quotationId: string, actor: ReturnType<typeof AuthService.requireAuth>): QuotationItem[] {
    const scope = this.quotationScope(actor);
    return this.db.query<QuotationItem>(
      `SELECT qi.*, p.meters_per_box,
              p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM quotation_items qi
       LEFT JOIN products p ON p.id = qi.product_id
       WHERE qi.quotation_id = ? AND EXISTS (
         SELECT 1 FROM quotations q WHERE q.id = qi.quotation_id AND ${scope.clause}
       )
       ORDER BY qi.rowid ASC`,
      [quotationId, ...scope.params]
    );
  }

  public getStats(filters: QuotationFilters = {}): QuotationStats {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    const scope = this.quotationScope(actor);
    const { where, params } = this.buildWhere(filters, scope.clause);
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
       LEFT JOIN sales_invoices si ON si.id = q.converted_invoice_id
       ${where}`,
      [...scope.params, ...params]
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
    PermissionService.require(actor, 'quotations.create');

    const prepared = this.prepareItems(input.items || [], actor);
    const preparedServices = this.prepareServiceItems(input.serviceItems || []);
    if (prepared.length + preparedServices.length === 0) {
      throw new Error('أضف بنداً واحداً على الأقل إلى عرض السعر.');
    }
    const subtotal = round2([...prepared, ...preparedServices].reduce((sum, item) => sum + item.totalPrice, 0));
    const headerDiscount = round2(Math.max(0, input.discountAmount || 0));
    if (headerDiscount > subtotal + 0.009) throw new Error('Quotation discount cannot exceed the subtotal.');
    const taxAmount = round2(Math.max(0, input.taxAmount || 0));
    const totalAmount = round2(Math.max(0, subtotal - headerDiscount + taxAmount));
    const validDays = Math.max(1, Math.min(365, Number(input.validDays) || 15));
    const today = localDateString();
    const validUntil = localDateString(addLocalDays(new Date(), validDays));
    const id = `qtn_${uuidv4().substring(0, 8)}`;
    const branchId = input.warehouseId
      ? this.branchAccess.requireWarehouseAccess(input.warehouseId, actor)
      : this.branchAccess.getCurrentBranchId(actor);
    const companyId = this.db.query<{ companyId: string }>(
      `SELECT company_id AS companyId FROM branches WHERE id = ?`, [branchId]
    )[0]?.companyId || null;

    return this.db.executeTransaction((db) => {
      if (headerDiscount > 0 || prepared.some((i) => i.discountAmount > 0)
        || preparedServices.some((i) => i.discountAmount > 0)) {
        PermissionService.require(actor, 'sales.discount');
      }
      const quotationNumber = db.nextNumber('QTN');
      const customer = db.query<any>(`SELECT name, phone FROM customers WHERE id = ?`, [input.customerId])[0];
      if (!customer) throw new Error('العميل المحدد غير موجود.');

      db.run(
        `INSERT INTO quotations (
           id, quotation_number, date, valid_until, customer_id, customer_name, customer_phone,
           branch_id, company_id, warehouse_id, subtotal, discount_amount, tax_amount, total_amount, status, notes,
           sales_rep_id, project_id, created_by, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id, quotationNumber, today, validUntil, input.customerId, customer.name, customer.phone || null,
          branchId, companyId, input.warehouseId || null, subtotal, headerDiscount, taxAmount, totalAmount,
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
      this.insertServiceItems(db, id, preparedServices);

      this.audit(actor.id, actor.fullName, 'إنشاء عرض سعر', id, {
        quotationNumber, totalAmount, items: prepared.length + preparedServices.length,
      });
      return this.fetchQuotation(id, actor)!;
    });
  }

  public updateQuotation(id: string, input: QuotationInput): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.update');
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    if (!['PENDING', 'EXPIRED'].includes(existing.status)) {
      throw new Error('لا يمكن تعديل عرض سعر تم تحويله أو إلغاؤه.');
    }

    const prepared = this.prepareItems(input.items || [], actor);
    const preparedServices = this.prepareServiceItems(input.serviceItems || []);
    if (prepared.length + preparedServices.length === 0) {
      throw new Error('أضف بنداً واحداً على الأقل إلى عرض السعر.');
    }
    const subtotal = round2([...prepared, ...preparedServices].reduce((sum, item) => sum + item.totalPrice, 0));
    const headerDiscount = round2(Math.max(0, input.discountAmount || 0));
    if (headerDiscount > subtotal + 0.009) throw new Error('Quotation discount cannot exceed the subtotal.');
    const taxAmount = round2(Math.max(0, input.taxAmount || 0));
    const totalAmount = round2(Math.max(0, subtotal - headerDiscount + taxAmount));
    const validDays = Math.max(1, Math.min(365, Number(input.validDays) || 15));
    const validUntil = localDateString(addLocalDays(new Date(), validDays));
    const branchId = input.warehouseId
      ? this.branchAccess.requireWarehouseAccess(input.warehouseId, actor)
      : existing.branchId || this.branchAccess.getCurrentBranchId(actor);
    const companyId = this.db.query<{ companyId: string }>(
      `SELECT company_id AS companyId FROM branches WHERE id = ?`, [branchId]
    )[0]?.companyId || null;

    return this.db.executeTransaction((db) => {
      if (headerDiscount > 0 || prepared.some((i) => i.discountAmount > 0)
        || preparedServices.some((i) => i.discountAmount > 0)) {
        PermissionService.require(actor, 'sales.discount');
      }
      const customer = db.query<any>(`SELECT name, phone FROM customers WHERE id = ?`, [input.customerId])[0];
      if (!customer) throw new Error('العميل المحدد غير موجود.');

      db.run(
        `UPDATE quotations SET
           customer_id = ?, customer_name = ?, customer_phone = ?, branch_id = ?, company_id = ?, warehouse_id = ?,
           valid_until = ?, subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?,
           status = 'PENDING', notes = ?, sales_rep_id = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND ${this.quotationScope(actor, '').clause}`,
        [
          input.customerId, customer.name, customer.phone || null, branchId, companyId, input.warehouseId || null,
          validUntil, subtotal, headerDiscount, taxAmount, totalAmount,
          input.notes || null, input.salesRepId || null, input.projectId || null, id, ...this.quotationScope(actor, '').params,
        ]
      );

      db.run(`DELETE FROM quotation_items WHERE quotation_id = ?`, [id]);
      db.run(`DELETE FROM quotation_service_items WHERE quotation_id = ?`, [id]);
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
      this.insertServiceItems(db, id, preparedServices);

      this.audit(actor.id, actor.fullName, 'تعديل عرض سعر', id, {
        quotationNumber: existing.quotationNumber, totalAmount, items: prepared.length + preparedServices.length,
      });
      return this.fetchQuotation(id, actor)!;
    });
  }

  public setStatus(id: string, status: 'CANCELLED' | 'PENDING'): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.update');
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
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${this.quotationScope(actor, '').clause}`,
      [
        status,
        status,
        localDateString(addLocalDays(new Date(), 15)),
        id,
        ...this.quotationScope(actor, '').params,
      ]
    );
    this.audit(actor.id, actor.fullName, status === 'CANCELLED' ? 'إلغاء عرض سعر' : 'إعادة فتح عرض سعر', id, {
      quotationNumber: existing.quotationNumber, from: existing.status, to: status,
    });
    return this.fetchQuotation(id, actor)!;
  }

  public deleteQuotation(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.delete');
    const existing = this.getQuotation(id);
    if (!existing) throw new Error('عرض السعر غير موجود.');
    if (existing.status === 'CONVERTED') {
      throw new Error('لا يمكن حذف عرض سعر تم تحويله إلى فاتورة.');
    }
    this.db.executeTransaction((db) => {
      db.run(`DELETE FROM quotation_items WHERE quotation_id = ? AND EXISTS (
        SELECT 1 FROM quotations q WHERE q.id = quotation_items.quotation_id
          AND ${this.quotationScope(actor).clause}
      )`, [id, ...this.quotationScope(actor).params]);
      db.run(`DELETE FROM quotations WHERE id = ? AND ${this.quotationScope(actor, '').clause}`,
        [id, ...this.quotationScope(actor, '').params]);
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
      serviceItems: (existing.serviceItems || []).map((item) => ({
        productId: item.productId || undefined,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
      })),
    });
  }

  /** Turn a quotation into a reservable sales order (without moving stock yet). */
  public convertToOrder(
    id: string,
    options: { warehouseId?: string; expectedDeliveryDate?: string; notes?: string } = {}
  ): Order {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'orders.create');
    const quotation = this.getQuotation(id);
    if (quotation && (quotation.status === 'EXPIRED' || quotation.validUntil < localDateString())) {
      throw new Error('Quotation has expired. Reopen it or extend its validity before conversion.');
    }
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    if (quotation.status === 'CANCELLED') throw new Error('لا يمكن تحويل عرض سعر ملغي.');
    if (quotation.status === 'CONVERTED') throw new Error('تم تحويل هذا العرض إلى فاتورة بالفعل.');
    if (quotation.convertedOrderId) throw new Error('تم إنشاء طلب مبيعات من هذا العرض بالفعل.');
    if ((quotation.serviceItems || []).length > 0) {
      throw new Error('لا يمكن تحويل عرض يحتوي على بنود خدمات أو عمالة إلى طلب مخزني.');
    }
    if (!quotation.items || quotation.items.length === 0) throw new Error('لا توجد بنود في عرض السعر.');

    const warehouseId = options.warehouseId || quotation.warehouseId || this.defaultWarehouseId(actor);
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId, actor);
    if (!warehouseId) throw new Error('لا يوجد مخزن صالح لإنشاء الطلب.');

    return this.db.executeTransaction(() => {
    const fresh = this.fetchQuotation(id, actor);
    if (!fresh || fresh.status !== 'PENDING' || fresh.convertedOrderId || fresh.convertedInvoiceId
      || fresh.validUntil < localDateString()) throw new Error('Quotation was already converted or is no longer valid.');
    const order = new OrderService().createOrder({
      customerId: fresh.customerId,
      warehouseId,
      quotationId: fresh.id,
      expectedDeliveryDate: options.expectedDeliveryDate,
      notes: options.notes || `طلب مبيعات من عرض السعر ${quotation.quotationNumber}`,
      discountAmount: fresh.discountAmount,
      taxAmount: fresh.taxAmount,
      items: fresh.items!.map((item) => ({
        productId: item.productId,
        quantityM2: item.quantityM2,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
      })),
    });

    this.db.run(
      `UPDATE quotations SET status = 'CONVERTED', converted_order_id = ?, warehouse_id = ?,
        follow_up_date = NULL, follow_up_notes = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'
          AND converted_order_id IS NULL AND converted_invoice_id IS NULL
          AND valid_until >= ? AND ${this.quotationScope(actor, '').clause}`,
      [order.id, warehouseId, id, localDateString(), ...this.quotationScope(actor, '').params]
    );
    if (!this.db.query<{ id: string }>(
      `SELECT id FROM quotations WHERE id = ? AND converted_order_id = ? AND status = 'CONVERTED'`,
      [id, order.id]
    ).length) throw new Error('Quotation conversion could not be committed.');
    this.audit(actor.id, actor.fullName, 'تحويل عرض سعر إلى طلب مبيعات', id, {
      quotationNumber: quotation.quotationNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });
    return order;
    });
  }

  public scheduleFollowUp(id: string, date: string | null, notes?: string | null): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.update');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    if (quotation.status === 'CONVERTED') throw new Error('لا يمكن جدولة متابعة لعرض محوّل.');
    this.db.run(
      `UPDATE quotations SET follow_up_date = ?, follow_up_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND ${this.quotationScope(actor, '').clause}`,
      [date || null, notes || null, id, ...this.quotationScope(actor, '').params]
    );
    this.audit(actor.id, actor.fullName, date ? 'جدولة متابعة عرض سعر' : 'إلغاء متابعة عرض سعر', id, {
      quotationNumber: quotation.quotationNumber, followUpDate: date, notes,
    });
    return this.fetchQuotation(id, actor)!;
  }

  /** Mark that the customer was contacted about a pending quotation. */
  public recordContact(id: string, note?: string | null): Quotation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.update');
    const quotation = this.getQuotation(id);
    if (!quotation) throw new Error('عرض السعر غير موجود.');
    this.db.run(
      `UPDATE quotations SET contact_count = COALESCE(contact_count, 0) + 1,
        last_contact_at = CURRENT_TIMESTAMP,
        follow_up_notes = COALESCE(?, follow_up_notes),
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ${this.quotationScope(actor, '').clause}`,
      [note || null, id, ...this.quotationScope(actor, '').params]
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
    if (quotation && (quotation.convertedOrderId || quotation.convertedInvoiceId)) {
      throw new Error('Quotation already has a linked sales transaction.');
    }
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
    if ((quotation.serviceItems || []).length > 0) {
      throw new Error('لا يمكن تحويل عرض يحتوي على بنود خدمات أو عمالة إلى فاتورة مخزنية.');
    }
    if (!quotation.items || quotation.items.length === 0) {
      throw new Error('لا توجد بنود في عرض السعر.');
    }

    const warehouseId = options.warehouseId || quotation.warehouseId || this.defaultWarehouseId(actor);
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId, actor);
    if (!warehouseId) throw new Error('لا يوجد مخزن صالح لإصدار الفاتورة.');

    const total = round2(quotation.totalAmount);
    const paymentType: PaymentType = options.paymentType || 'CREDIT';
    const paidAmount = paymentType === 'CASH' && options.paidAmount === undefined
      ? total
      : round2(Math.min(total, Math.max(0, options.paidAmount || 0)));

    return this.db.executeTransaction(() => {
      const fresh = this.fetchQuotation(id, actor);
      if (!fresh || fresh.status !== 'PENDING' || fresh.convertedOrderId || fresh.convertedInvoiceId
        || fresh.validUntil < localDateString()) throw new Error('Quotation was already converted or is no longer valid.');
      const invoice = this.sales.createSale({
        customerId: fresh.customerId,
        warehouseId,
        items: fresh.items!.map((item) => ({
          productId: item.productId,
          soldBy: this.baseUnitOf(item.productId),
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: Math.round(item.boxesCount * 4),
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
        discountAmount: fresh.discountAmount,
        taxAmount: fresh.taxAmount,
        paidAmount,
        paymentType,
        notes: options.notes || `تحويل من عرض سعر ${quotation.quotationNumber}`,
      });

      this.db.run(
        `UPDATE quotations SET status = 'CONVERTED', converted_invoice_id = ?, warehouse_id = ?,
         follow_up_date = NULL, follow_up_notes = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'
          AND converted_order_id IS NULL AND converted_invoice_id IS NULL
          AND valid_until >= ? AND ${this.quotationScope(actor, '').clause}`,
        [invoice.id, warehouseId, id, localDateString(), ...this.quotationScope(actor, '').params]
      );
      if (!this.db.query<{ id: string }>(
        `SELECT id FROM quotations WHERE id = ? AND converted_invoice_id = ? AND status = 'CONVERTED'`,
        [id, invoice.id]
      ).length) throw new Error('Quotation conversion could not be committed.');
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
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'quotations.view');
    return this.defaultWarehouseId(actor);
  }

  private defaultWarehouseId(actor = AuthService.requireAuth()): string | undefined {
    const scope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    return this.db.query<{ id: string }>(
      `SELECT w.id FROM warehouses w WHERE w.is_active = 1 AND ${scope.clause}
       ORDER BY w.is_default DESC, w.created_at ASC LIMIT 1`, scope.params
    )[0]?.id;
  }

  /** Quotation lines are stored in base units, so invoices must inherit that unit. */
  private baseUnitOf(productId: string): string {
    const row = this.db.query<{ baseUnit?: string }>(
      `SELECT base_unit AS baseUnit FROM products WHERE id = ?`,
      [productId]
    )[0];
    return row?.baseUnit || 'M2';
  }

  private prepareItems(items: QuotationItemInput[], actor: ReturnType<typeof AuthService.requireAuth>) {
    return items.map((item) => {
      const product = this.db.query<any>(
        `SELECT id, name, sku, grade, size, meters_per_box AS metersPerBox, pieces_per_box AS piecesPerBox,
                min_selling_price_m2, is_active,
                product_type AS productType, base_unit AS baseUnit, custom_unit AS customUnit
         FROM products WHERE id = ?`,
        [item.productId]
      )[0];
      if (!product) throw new Error(`الصنف ذو المعرف ${item.productId} غير موجود.`);
      if (!product.isActive) throw new Error(`الصنف "${product.name}" غير نشط.`);

      const units = resolveSaleUnits(item, product);
      const unitLabel = getUomLabel(units.sellUnit, product);
      if (units.baseQuantity <= 0) {
        throw new Error(`كمية الصنف "${product.name}" (${unitLabel}) يجب أن تكون أكبر من صفر.`);
      }

      const saleUnitPrice = round2(Math.max(0, units.sellUnitPrice));
      if (saleUnitPrice <= 0) {
        throw new Error(`سعر الصنف "${product.name}" لكل ${unitLabel} يجب أن يكون أكبر من صفر.`);
      }
      if (round2(units.baseUnitPrice) < Number(product.minSellingPriceM2 || 0)) {
        PermissionService.require(actor, 'sales.approve');
      }

      const discountAmount = round2(Math.max(0, item.discountAmount || 0));
      const gross = round2(units.sellQuantity * saleUnitPrice);
      if (discountAmount > gross) throw new Error(`خصم الصنف "${product.name}" أكبر من قيمته.`);
      const totalPrice = round2(gross - discountAmount);
      const metersPerBox = Number(product.metersPerBox ?? product.meters_per_box) || 1.44;
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
        size: product.size as string,
        sku: product.sku as string,
        quantityM2: units.baseQuantity,
        boxesCount,
        unitPrice: units.baseUnitPrice,
        discountAmount,
        totalPrice,
      };
    });
  }

  private prepareServiceItems(items: QuotationServiceItemInput[]): QuotationServiceItem[] {
    return items.map((item) => {
      const description = String(item.description || '').trim();
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discountAmount = round2(Math.max(0, Number(item.discountAmount) || 0));
      if (!description) throw new Error('وصف بند الخدمة مطلوب.');
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`كمية بند الخدمة "${description}" يجب أن تكون أكبر من صفر.`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`سعر بند الخدمة "${description}" غير صالح.`);
      }
      const gross = round2(quantity * unitPrice);
      if (discountAmount > gross) throw new Error(`خصم بند الخدمة "${description}" أكبر من قيمته.`);
      return {
        id: '',
        quotationId: '',
        productId: item.productId || null,
        description,
        unit: String(item.unit || 'بند').trim() || 'بند',
        quantity,
        unitPrice,
        discountAmount,
        totalPrice: round2(gross - discountAmount),
      };
    });
  }

  private insertServiceItems(
    db: DatabaseManager,
    quotationId: string,
    items: QuotationServiceItem[],
  ): void {
    for (const item of items) {
      db.run(
        `INSERT INTO quotation_service_items
          (id, quotation_id, product_id, description, unit, quantity, unit_price, discount_amount, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `qsi_${uuidv4().substring(0, 8)}`, quotationId, item.productId || null, item.description, item.unit,
          item.quantity, item.unitPrice, item.discountAmount, item.totalPrice,
        ]
      );
    }
  }

  private quotationScope(actor: ReturnType<typeof AuthService.requireAuth>, alias = 'q') {
    const prefix = alias ? `${alias}.` : '';
    return this.branchAccess.sqlScope(
      `${prefix}branch_id`,
      `COALESCE(
        (SELECT w.branch_id FROM warehouses w WHERE w.id = ${prefix}warehouse_id),
        (SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = ${prefix}warehouse_id
         ORDER BY bw.is_primary DESC, bw.branch_id ASC LIMIT 1)
      )`,
      actor
    );
  }

  private buildWhere(filters: QuotationFilters, branchClause: string): { where: string; params: any[] } {
    let where = `WHERE ${branchClause}`;
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
