import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { auditLogger } from '../security/auditLogger';
import { localDateString } from '../../../utils/shared/date';
import type { ProductSerial } from '../../../types';

export interface SerialLookupResult {
  serial: ProductSerial;
  productId: string;
  productName: string;
}

const SERIAL_SELECT = `
  SELECT ps.id, ps.product_id AS productId, p.name AS productName,
         ps.serial_number AS serialNumber, ps.status,
         ps.warehouse_id AS warehouseId, w.name AS warehouseName,
         ps.branch_id AS branchId, ps.purchase_invoice_id AS purchaseInvoiceId,
         ps.sale_invoice_id AS saleInvoiceId, si.invoice_number AS saleInvoiceNumber,
         ps.sale_invoice_item_id AS saleInvoiceItemId,
         ps.return_invoice_id AS returnInvoiceId,
         ps.received_at AS receivedAt, ps.sold_at AS soldAt, ps.returned_at AS returnedAt,
         ps.notes, ps.created_by AS createdBy, ps.created_at AS createdAt, ps.updated_at AS updatedAt
  FROM product_serials ps
  JOIN products p ON p.id = ps.product_id
  LEFT JOIN warehouses w ON w.id = ps.warehouse_id
  LEFT JOIN sales_invoices si ON si.id = ps.sale_invoice_id
`;

/**
 * ProductSerialService — تتبع الأرقام التسلسلية / IMEI لكل وحدة منتج.
 *
 * دورة الحياة: IN_STOCK (مسجّل بالمخزن) → SOLD (بيع على فاتورة) →
 * IN_STOCK مجدداً عند المرتجع (مع الاحتفاظ بآخر فاتورة بيع ومرتجع).
 * DAMAGED للحجر/التالف، RETURNED لسجل تاريخي إن لزم.
 */
export class ProductSerialService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.serials.view');
    return actor;
  }

  private requireManage() {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.serials.manage');
    return actor;
  }

  /**
   * قراءة الأرقام في نقطة البيع: الكاشير لا يملك بالضرورة صلاحية إدارة
   * المخزون، لذا تُقبل صلاحيات البيع/الكتالوج أيضاً.
   */
  private requirePosRead() {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    const allowed = ['inventory.serials.view', 'sales.pos.view', 'ui.products.catalog.view']
      .some((perm) => PermissionService.can(actor, perm));
    if (!allowed) PermissionService.require(actor, 'inventory.serials.view');
    return actor;
  }

  public isTracked(productId: string): boolean {
    const row = this.db.query<{ trackSerials: number }>(
      `SELECT track_serials AS trackSerials FROM products WHERE id = ?`, [productId]
    )[0];
    return Number(row?.trackSerials) === 1;
  }

  public setTracking(productId: string, enabled: boolean): void {
    const actor = this.requireManage();
    this.db.run(
      `UPDATE products SET track_serials = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [enabled ? 1 : 0, productId]
    );
    void actor;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  public listSerials(filters?: {
    productId?: string;
    warehouseId?: string;
    status?: ProductSerial['status'] | 'ALL';
    search?: string;
    limit?: number;
  }): ProductSerial[] {
    this.requireView();
    const scope = this.branchAccess.companyScope('p.company_id');
    const whScope = this.branchAccess.warehouseBranchScope('w');
    const where: string[] = [scope.clause, whScope.clause];
    const params: unknown[] = [...scope.params, ...whScope.params];
    if (filters?.productId) { where.push('ps.product_id = ?'); params.push(filters.productId); }
    if (filters?.warehouseId) { where.push('ps.warehouse_id = ?'); params.push(filters.warehouseId); }
    if (filters?.status && filters.status !== 'ALL') { where.push('ps.status = ?'); params.push(filters.status); }
    if (filters?.search?.trim()) {
      where.push('(ps.serial_number LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    let sql = `${SERIAL_SELECT} WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY ps.created_at DESC, ps.id DESC`;
    if (filters?.limit) { sql += ` LIMIT ?`; params.push(filters.limit); }
    return this.db.query<ProductSerial>(sql, params);
  }

  public getStats(): { total: number; inStock: number; sold: number; damaged: number; returned: number } {
    this.requireView();
    const rows = this.db.query<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM product_serials GROUP BY status`
    );
    const stats = { total: 0, inStock: 0, sold: 0, damaged: 0, returned: 0 };
    for (const row of rows) {
      const n = Number(row.n) || 0;
      stats.total += n;
      if (row.status === 'IN_STOCK') stats.inStock = n;
      else if (row.status === 'SOLD') stats.sold = n;
      else if (row.status === 'DAMAGED') stats.damaged = n;
      else if (row.status === 'RETURNED') stats.returned = n;
    }
    return stats;
  }

  public getAvailableSerials(productId: string, warehouseId: string): ProductSerial[] {
    this.requirePosRead();
    return this.db.query<ProductSerial>(
      `${SERIAL_SELECT}
       WHERE ps.product_id = ? AND ps.status = 'IN_STOCK' AND ps.warehouse_id = ?
       ORDER BY ps.received_at ASC, ps.serial_number ASC`,
      [productId, warehouseId]
    );
  }

  /** بحث شامل عن رقم تسلسلي/IMEI — يُستخدم في مسح الباركود بنقطة البيع. */
  public findBySerialNumber(term: string): SerialLookupResult | null {
    this.requirePosRead();
    const scope = this.branchAccess.companyScope('p.company_id');
    const row = this.db.query<any>(
      `${SERIAL_SELECT}
       WHERE ps.serial_number = ? AND ${scope.clause}
       LIMIT 1`,
      [term.trim(), ...scope.params]
    )[0];
    if (!row) return null;
    return {
      serial: row as ProductSerial,
      productId: row.productId,
      productName: row.productName,
    };
  }

  // ── Registration / status ───────────────────────────────────────────────

  /**
   * تسجيل أرقام تسلسلية لوحدة منتج. الأرقام يجب أن تكون فريدة داخل المنتج —
   * أي تكرار (مسجّل أو ضمن الإدخال نفسه) يُرفض برسالة توضح الرقم.
   */
  public registerSerials(input: {
    productId: string;
    warehouseId: string;
    serialNumbers: string[];
    purchaseInvoiceId?: string;
    /** رقم فاتورة الشراء (invoice_number) — يُحوَّل داخلياً إلى المعرف. */
    purchaseInvoiceNumber?: string;
    notes?: string;
  }): ProductSerial[] {
    const actor = this.requireManage();
    let purchaseInvoiceId = input.purchaseInvoiceId || null;
    if (!purchaseInvoiceId && input.purchaseInvoiceNumber?.trim()) {
      const invoice = this.db.query<{ id: string }>(
        `SELECT id FROM purchase_invoices WHERE invoice_number = ? LIMIT 1`,
        [input.purchaseInvoiceNumber.trim()]
      )[0];
      if (!invoice) throw new Error(`فاتورة الشراء رقم «${input.purchaseInvoiceNumber.trim()}» غير موجودة.`);
      purchaseInvoiceId = invoice.id;
    }
    const numbers = [...new Set(input.serialNumbers.map((n) => n.trim()).filter(Boolean))];
    if (!numbers.length) throw new Error('لا توجد أرقام تسلسلية للتسجيل.');
    if (numbers.length !== input.serialNumbers.filter((n) => n.trim()).length) {
      throw new Error('توجد أرقام تسلسلية مكررة داخل الإدخال.');
    }
    const product = this.db.query<{ id: string; trackSerials: number }>(
      `SELECT id, track_serials AS trackSerials FROM products WHERE id = ? AND is_active = 1`,
      [input.productId]
    )[0];
    if (!product) throw new Error('المنتج غير موجود أو غير نشط.');
    const warehouse = this.db.query<{ id: string; branchId: string | null }>(
      `SELECT id, branch_id AS branchId FROM warehouses WHERE id = ?`,
      [input.warehouseId]
    )[0];
    if (!warehouse) throw new Error('المخزن غير موجود.');

    const created: ProductSerial[] = [];
    this.db.executeFinancialTransaction((db) => {
      for (const serialNumber of numbers) {
        const existing = db.query<{ id: string; status: string }>(
          `SELECT id, status FROM product_serials WHERE product_id = ? AND serial_number = ?`,
          [input.productId, serialNumber]
        )[0];
        if (existing) {
          throw new Error(`الرقم التسلسلي «${serialNumber}» مسجّل مسبقاً بحالة ${existing.status}.`);
        }
        const id = `psn_${uuidv4().substring(0, 8)}`;
        db.run(
          `INSERT INTO product_serials (
            id, product_id, serial_number, status, warehouse_id, branch_id,
            purchase_invoice_id, received_at, notes, created_by
          ) VALUES (?, ?, ?, 'IN_STOCK', ?, ?, ?, ?, ?, ?)`,
          [
            id, input.productId, serialNumber, input.warehouseId,
            warehouse.branchId ?? null, purchaseInvoiceId,
            localDateString(), input.notes || null, actor.id,
          ]
        );
        created.push({
          id,
          productId: input.productId,
          serialNumber,
          status: 'IN_STOCK',
          warehouseId: input.warehouseId,
          branchId: warehouse.branchId ?? null,
          purchaseInvoiceId: purchaseInvoiceId,
          receivedAt: localDateString(),
          notes: input.notes || null,
          createdBy: actor.id,
          createdAt: '',
          updatedAt: '',
        });
      }
    });
    auditLogger.log(
      actor.id, 'inventory', 'inventory_serial_register', 'product_serial', input.productId,
      `تسجيل ${created.length} رقم تسلسلي للمنتج ${input.productId} في المخزن ${input.warehouseId}`,
      { serialNumbers: numbers, warehouseId: input.warehouseId, purchaseInvoiceId },
    );
    return created;
  }

  /** تغيير حالة رقم تسلسلي يدوياً (تالف/إعادة للإتاحة). */
  public setStatus(serialId: string, status: 'IN_STOCK' | 'DAMAGED' | 'RETURNED', notes?: string): void {
    const actor = this.requireManage();
    const row = this.db.query<{ status: string; serialNumber: string }>(
      `SELECT status, serial_number AS serialNumber FROM product_serials WHERE id = ?`, [serialId]
    )[0];
    if (!row) throw new Error('الرقم التسلسلي غير موجود.');
    if ((row.status as string) === 'SOLD') {
      throw new Error('لا يمكن تغيير حالة رقم مبيع — استخدم مسار المرتجع.');
    }
    this.db.run(
      `UPDATE product_serials SET status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, notes || null, serialId]
    );
    auditLogger.log(
      actor.id, 'inventory', 'inventory_serial_status', 'product_serial', serialId,
      `تغيير حالة الرقم التسلسلي ${row.serialNumber} من ${row.status} إلى ${status}`,
      { serialNumber: row.serialNumber, from: row.status, to: status, notes: notes || null },
    );
  }

  // ── Transaction helpers (used inside invoice/return transactions) ───────

  /**
   * يعلّم الأرقام التسلسلية كمباعة داخل معاملة فاتورة البيع.
   * يجب استدعاؤها بعد INSERT INTO sales_invoice_items حتى يتوفر item.id.
   * أي رقم غير متاح (غير موجود/مباع/مخزن مختلف) يُلغي المعاملة كلها.
   */
  public static markSoldInTransaction(
    db: DatabaseManager,
    input: {
      productId: string;
      serialNumbers: string[];
      warehouseId: string;
      invoiceId: string;
      invoiceItemId: string;
      actorId: string;
    }
  ): void {
    const unique = [...new Set(input.serialNumbers.map((n) => n.trim()).filter(Boolean))];
    if (!unique.length) return;
    const now = new Date().toISOString();
    for (const serialNumber of unique) {
      const serial = db.query<{ id: string; status: string; warehouseId: string | null }>(
        `SELECT id, status, warehouse_id AS warehouseId FROM product_serials
         WHERE product_id = ? AND serial_number = ?`,
        [input.productId, serialNumber]
      )[0];
      if (!serial || serial.status !== 'IN_STOCK'
        || (serial.warehouseId && serial.warehouseId !== input.warehouseId)) {
        throw new Error(`الرقم التسلسلي «${serialNumber}» غير متاح للبيع (مباع أو غير مسجّل في هذا المخزن).`);
      }
      db.run(
        `UPDATE product_serials
         SET status = 'SOLD', sale_invoice_id = ?, sale_invoice_item_id = ?,
             sold_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'IN_STOCK'`,
        [input.invoiceId, input.invoiceItemId, now, serial.id]
      );
    }
    auditLogger.log(
      input.actorId || 'system', 'sales', 'inventory_serial_sell', 'sales_invoice', input.invoiceId,
      `بيع ${unique.length} رقم تسلسلي على الفاتورة ${input.invoiceId}`,
      { serialNumbers: unique, invoiceItemId: input.invoiceItemId, warehouseId: input.warehouseId },
    );
  }

  /**
   * تسجيل أرقام تسلسلية داخل معاملة قائمة (فاتورة شراء). يعيد الأرقام
   * المنشأة؛ أي تكرار يُلغي المعاملة كلها عبر رمي الخطأ.
   */
  public static registerSerialsInTransaction(
    db: DatabaseManager,
    input: {
      productId: string;
      warehouseId: string;
      serialNumbers: string[];
      purchaseInvoiceId?: string | null;
      notes?: string | null;
      actorId: string;
    }
  ): ProductSerial[] {
    const numbers = [...new Set(input.serialNumbers.map((n) => String(n).trim()).filter(Boolean))];
    if (!numbers.length) return [];
    const warehouse = db.query<{ branchId: string | null }>(
      `SELECT branch_id AS branchId FROM warehouses WHERE id = ?`,
      [input.warehouseId]
    )[0];
    const created: ProductSerial[] = [];
    const today = localDateString();
    for (const serialNumber of numbers) {
      const existing = db.query<{ id: string; status: string }>(
        `SELECT id, status FROM product_serials WHERE product_id = ? AND serial_number = ?`,
        [input.productId, serialNumber]
      )[0];
      if (existing) {
        throw new Error(`الرقم التسلسلي «${serialNumber}» مسجّل مسبقاً بحالة ${existing.status}.`);
      }
      const id = `psn_${uuidv4().substring(0, 8)}`;
      db.run(
        `INSERT INTO product_serials (
          id, product_id, serial_number, status, warehouse_id, branch_id,
          purchase_invoice_id, received_at, notes, created_by
        ) VALUES (?, ?, ?, 'IN_STOCK', ?, ?, ?, ?, ?, ?)`,
        [
          id, input.productId, serialNumber, input.warehouseId,
          warehouse?.branchId ?? null, input.purchaseInvoiceId ?? null,
          today, input.notes || null, input.actorId,
        ]
      );
      created.push({
        id,
        productId: input.productId,
        serialNumber,
        status: 'IN_STOCK',
        warehouseId: input.warehouseId,
        branchId: warehouse?.branchId ?? null,
        purchaseInvoiceId: input.purchaseInvoiceId ?? null,
        receivedAt: today,
        notes: input.notes || null,
        createdBy: input.actorId,
        createdAt: '',
        updatedAt: '',
      });
    }
    return created;
  }

  /**
   * يعيد الأرقام التسلسلية المرتبطة ببند فاتورة إلى IN_STOCK عند المرتجع.
   * يحرر عدد `count` أرقام مباعة على بند الفاتورة نفسه ولم تُرجع بعد.
   * عند تمرير `serialNumbers` تُحرَّر تلك الأرقام تحديداً (يجب أن تطابق
   * عدد `count` وألا تكون مُعادة سابقاً) بدل اختيار الأقدم تلقائياً.
   */
  public static releaseForReturnInTransaction(
    db: DatabaseManager,
    input: {
      invoiceItemId: string;
      count: number;
      returnInvoiceId: string;
      /** IN_STOCK for restocked goods, DAMAGED for quarantined/damaged returns. */
      targetStatus?: 'IN_STOCK' | 'DAMAGED';
      serialNumbers?: string[];
      actorId?: string;
    }
  ): number {
    if (input.count <= 0) return 0;
    const target = input.targetStatus || 'IN_STOCK';
    const now = new Date().toISOString();
    const specific = input.serialNumbers?.map((n) => String(n).trim()).filter(Boolean);
    let rows: { id: string }[];
    if (specific?.length) {
      const placeholders = specific.map(() => '?').join(',');
      rows = db.query<{ id: string }>(
        `SELECT id FROM product_serials
         WHERE sale_invoice_item_id = ? AND status = 'SOLD' AND returned_at IS NULL
           AND serial_number IN (${placeholders})
         ORDER BY sold_at ASC, id ASC`,
        [input.invoiceItemId, ...specific]
      );
      if (rows.length !== specific.length) {
        throw new Error('بعض الأرقام التسلسلية المحددة لم تُبع بعد على بند الفاتورة هذا أو أُعيدت سابقاً.');
      }
    } else {
      rows = db.query<{ id: string }>(
        `SELECT id FROM product_serials
         WHERE sale_invoice_item_id = ? AND status = 'SOLD' AND returned_at IS NULL
         ORDER BY sold_at ASC, id ASC
         LIMIT ?`,
        [input.invoiceItemId, input.count]
      );
    }
    for (const row of rows) {
      db.run(
        `UPDATE product_serials
         SET status = ?, return_invoice_id = ?, returned_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [target, input.returnInvoiceId, now, row.id]
      );
    }
    if (rows.length) {
      auditLogger.log(
        input.actorId || 'system', 'sales', 'inventory_serial_return_release', 'sales_return', input.returnInvoiceId,
        `إرجاع ${rows.length} رقم تسلسلي إلى ${target} بموجب المرتجع ${input.returnInvoiceId}`,
        { invoiceItemId: input.invoiceItemId, count: rows.length, targetStatus: target, serialNumbers: specific || null },
      );
    }
    return rows.length;
  }

  /**
   * الأرقام المباعة على بند فاتورة ولم تُرجع بعد — لمنتقي المرتجع.
   * يُسمح بها لمن يملك صلاحية إنشاء المرتجعات حتى بدون صلاحية مخزون.
   */
  public getSoldSerialsForInvoiceItem(invoiceItemId: string): ProductSerial[] {
    ModuleRegistryService.assertModuleEnabled('inventory');
    const actor = AuthService.requireAuth();
    const allowed = ['inventory.serials.view', 'ui.returns.returns.create', 'ui.returns.returns.view', 'sales.pos.view']
      .some((perm) => PermissionService.can(actor, perm));
    if (!allowed) PermissionService.require(actor, 'inventory.serials.view');
    return this.db.query<ProductSerial>(
      `${SERIAL_SELECT}
       WHERE ps.sale_invoice_item_id = ? AND ps.status = 'SOLD' AND ps.returned_at IS NULL
       ORDER BY ps.sold_at ASC, ps.serial_number ASC`,
      [invoiceItemId]
    );
  }
}
