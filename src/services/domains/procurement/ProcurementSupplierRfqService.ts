import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';
import type { ReorderSuggestion, SupplierRfqRow, SupplierRfqItem, SupplierQuotationRow, SupplierQuotationItem } from '../../../types/procurement';
import { ProcurementServicePart01 } from './ProcurementServicePart01';

export abstract class ProcurementSupplierRfqService extends ProcurementServicePart01 {
  public getReorderSuggestions(warehouseId?: string): ReorderSuggestion[] {
    let sql = `
      SELECT
        p.id AS productId,
        p.name AS productName,
        p.sku,
        p.barcode,
        p.min_stock_level AS minStockLevel,
        p.max_stock_level AS maxStockLevel,
        p.cost_price AS unitCost,
        COALESCE(NULLIF(p.custom_unit, ''), p.base_unit, 'م²') AS unit,
        c.name AS categoryName,
        b.name AS brandName,
        COALESCE(SUM(ws.quantity_m2), 0) AS currentStock
      FROM products p
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1
    `;
    const params: any[] = [];
    if (warehouseId) {
      sql += ` AND ws.warehouse_id = ?`;
      params.push(warehouseId);
    }
    sql += ` GROUP BY p.id HAVING currentStock <= p.min_stock_level ORDER BY (p.min_stock_level - currentStock) DESC`;

    const rows = this.db.query<any>(sql, params);
    return rows.map((r) => {
      const current = Number(r.currentStock) || 0;
      const minLevel = Number(r.minStockLevel) || 10;
      const maxLevel = r.maxStockLevel ? Number(r.maxStockLevel) : null;
      const suggestedQty = maxLevel && maxLevel > current
        ? round2(maxLevel - current)
        : round2(Math.max(minLevel * 2 - current, minLevel));
      const unitCost = Number(r.unitCost) || 0;
      return {
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        barcode: r.barcode,
        categoryName: r.categoryName,
        brandName: r.brandName,
        currentStock: round2(current),
        minStockLevel: minLevel,
        maxStockLevel: maxLevel,
        suggestedQuantity: suggestedQty,
        unitCost,
        estimatedCost: round2(suggestedQty * unitCost),
        unit: r.unit,
      };
    });
  }

  public createRfq(dto: {
    dueDate?: string;
    notes?: string;
    items: { productId: string; quantityM2: number; notes?: string }[];
  }): SupplierRfqRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.create');
    if (!dto.items || dto.items.length === 0) throw new Error('يجب اختيار صنف واحد على الأقل.');

    const rfqId = `rfq_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

    return this.db.executeTransaction((db) => {
      const rfqNumber = db.nextNumber('RFQ');
      db.run(`
        INSERT INTO supplier_rfqs (id, rfq_number, date, due_date, status, notes, created_by)
        VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
      `, [rfqId, rfqNumber, today, dto.dueDate || null, dto.notes || null, actor.id]);

      for (const item of dto.items) {
        const prod = db.query<any>(`SELECT name FROM products WHERE id = ?`, [item.productId])[0];
        if (!prod) throw new Error(`المنتج ${item.productId} غير موجود.`);
        db.run(`
          INSERT INTO supplier_rfq_items (id, rfq_id, product_id, product_name, quantity_m2, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [`rfqi_${uuidv4().substring(0, 8)}`, rfqId, item.productId, prod.name, Number(item.quantityM2), item.notes || null]);
      }

      return this.getRfqById(rfqId)!;
    });
  }

  public getAllRfqs(search = '', status = 'ALL'): SupplierRfqRow[] {
    let sql = `
      SELECT r.*, u.full_name AS createdByName,
        (SELECT COUNT(*) FROM supplier_rfq_items i WHERE i.rfq_id = r.id) AS itemsCount,
        (SELECT COUNT(*) FROM supplier_quotations q WHERE q.rfq_id = r.id) AS quotationsCount
      FROM supplier_rfqs r
      LEFT JOIN users u ON u.id = r.created_by
      WHERE 1 = 1
    `;
    const params: any[] = [];
    if (status !== 'ALL') {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (search.trim()) {
      sql += ` AND (r.rfq_number LIKE ? OR r.notes LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    sql += ` ORDER BY r.created_at DESC`;
    return this.db.query<SupplierRfqRow>(sql, params);
  }

  public getRfqById(id: string): (SupplierRfqRow & { items: SupplierRfqItem[]; quotations: SupplierQuotationRow[] }) | null {
    const row = this.db.query<SupplierRfqRow>(`
      SELECT r.*, u.full_name AS createdByName
      FROM supplier_rfqs r
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = ?
    `, [id])[0];
    if (!row) return null;

    const items = this.db.query<SupplierRfqItem>(`
      SELECT i.*, p.sku AS productSku, c.name AS categoryName,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM supplier_rfq_items i
      LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE i.rfq_id = ?
    `, [id]);

    const quotations = this.db.query<SupplierQuotationRow>(`
      SELECT q.*, s.name AS supplierName, s.phone AS supplierPhone
      FROM supplier_quotations q
      JOIN suppliers s ON s.id = q.supplier_id
      WHERE q.rfq_id = ?
      ORDER BY q.total_amount ASC
    `, [id]);

    for (const q of quotations) {
      q.items = this.db.query<SupplierQuotationItem>(`
        SELECT qi.*, p.name AS productName, p.product_type AS productType,
               p.base_unit AS baseUnit, p.custom_unit AS customUnit
        FROM supplier_quotation_items qi
        LEFT JOIN products p ON p.id = qi.product_id
        WHERE qi.quotation_id = ?
      `, [q.id]);
    }

    return { ...row, items, quotations };
  }

  public compareQuotationsForRfq(rfqId: string) {
    const rfq = this.getRfqById(rfqId);
    if (!rfq) throw new Error('طلب عروض الأسعار غير موجود.');
    const quotations = rfq.quotations || [];
    const bestPriceByProduct: Record<string, { unitCost: number; supplierId: string; supplierName: string }> = {};

    for (const q of quotations) {
      for (const it of q.items || []) {
        if (!bestPriceByProduct[it.productId] || it.unitCost < bestPriceByProduct[it.productId].unitCost) {
          bestPriceByProduct[it.productId] = {
            unitCost: it.unitCost,
            supplierId: q.supplierId,
            supplierName: q.supplierName || '',
          };
        }
      }
    }

    return {
      rfq,
      quotations,
      bestPriceByProduct,
      lowestTotalQuotation: quotations[0] || null,
    };
  }

  public addSupplierQuotation(dto: {
    rfqId: string;
    supplierId: string;
    quotationNumber: string;
    date?: string;
    validUntil?: string;
    deliveryDays?: number;
    paymentTerms?: string;
    qualityRating?: string;
    notes?: string;
    items: { rfqItemId?: string; productId: string; quantityM2: number; unitCost: number; notes?: string }[];
  }): SupplierQuotationRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.create');
    const rfq = this.getRfqById(dto.rfqId);
    if (!rfq) throw new Error('طلب عروض الأسعار غير موجود.');
    if (rfq.status === 'AWARDED' || rfq.status === 'CANCELLED') throw new Error('لا يمكن إضافة عروض لهذا الطلب بعد الإغلاق.');

    const quoteId = `sq_${uuidv4().substring(0, 8)}`;
    const today = dto.date || localDateString();

    return this.db.executeTransaction((db) => {
      let totalAmount = 0;
      for (const item of dto.items) {
        totalAmount = round2(totalAmount + Number(item.quantityM2) * Number(item.unitCost));
      }

      db.run(`
        INSERT INTO supplier_quotations (
          id, rfq_id, supplier_id, quotation_number, date, valid_until,
          total_amount, delivery_days, payment_terms, quality_rating, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
      `, [
        quoteId, dto.rfqId, dto.supplierId, dto.quotationNumber, today, dto.validUntil || null,
        totalAmount, dto.deliveryDays || 7, dto.paymentTerms || 'CASH', dto.qualityRating || 'GRADE_1', dto.notes || null,
      ]);

      for (const item of dto.items) {
        const itemTotal = round2(Number(item.quantityM2) * Number(item.unitCost));
        db.run(`
          INSERT INTO supplier_quotation_items (id, quotation_id, rfq_item_id, product_id, quantity_m2, unit_cost, total_cost, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [`sqi_${uuidv4().substring(0, 8)}`, quoteId, item.rfqItemId || null, item.productId, Number(item.quantityM2), Number(item.unitCost), itemTotal, item.notes || null]);
      }

      db.run(`UPDATE supplier_rfqs SET status = 'EVALUATING' WHERE id = ? AND status = 'OPEN'`, [dto.rfqId]);

      const res = db.query<SupplierQuotationRow>(`
        SELECT q.*, s.name AS supplierName
        FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?
      `, [quoteId])[0];
      return res;
    });
  }

  public awardQuotation(quotationId: string, createPurchaseOrder = true, warehouseId = 'wh_main'): { orderId?: string } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.purchases.invoices.approve');

    const quote = this.db.query<any>(`
      SELECT q.*, s.name AS supplierName FROM supplier_quotations q JOIN suppliers s ON s.id = q.supplier_id WHERE q.id = ?
    `, [quotationId])[0];
    if (!quote) throw new Error('عرض السعر غير موجود.');

    const items = this.db.query<SupplierQuotationItem>(`
      SELECT qi.*, p.name AS productName, p.product_type AS productType,
             p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM supplier_quotation_items qi LEFT JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = ?
    `, [quotationId]);

    return this.db.executeTransaction((db) => {
      db.run(`UPDATE supplier_quotations SET status = 'ACCEPTED' WHERE id = ?`, [quotationId]);
      db.run(`UPDATE supplier_quotations SET status = 'REJECTED' WHERE rfq_id = ? AND id != ?`, [quote.rfqId, quotationId]);
      db.run(`UPDATE supplier_rfqs SET status = 'AWARDED' WHERE id = ?`, [quote.rfqId]);

      let orderId: string | undefined;
      if (createPurchaseOrder) {
        orderId = `po_${uuidv4().substring(0, 8)}`;
        const orderNumber = db.nextNumber('PO');
        const today = localDateString();

        db.run(`
          INSERT INTO purchase_orders (
            id, order_number, date, supplier_id, warehouse_id, request_id,
            subtotal, discount_amount, tax_amount, shipping_cost, total_amount, status, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, ?, 'SENT', ?, ?)
        `, [
          orderId, orderNumber, today, quote.supplierId, warehouseId,
          quote.totalAmount, quote.totalAmount,
          `أمر شراء صادر عن ترسية عرض سعر ${quote.quotationNumber} (RFQ: ${quote.rfqId})`, actor.id,
        ]);

        for (const item of items) {
          const prod = db.query<any>(`SELECT meters_per_box FROM products WHERE id = ?`, [item.productId])[0];
          const boxes = round2(item.quantityM2 / (Number(prod?.metersPerBox) || 1.44));
          db.run(`
            INSERT INTO purchase_order_items (
              id, purchase_order_id, product_id, product_name, quantity_m2, boxes_count, received_m2, unit_cost, total_cost
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          `, [`poi_${uuidv4().substring(0, 8)}`, orderId, item.productId, item.productName || 'صنف سيراميك', item.quantityM2, boxes, item.unitCost, item.totalCost]);
        }
      }

      return { orderId };
    });
  }
}
