import { DatabaseManager } from '../database/db';
import type { PurchaseInvoice, PurchaseInvoiceItem, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { computeWeightedAverageCost, round2 } from './financials';

export interface CreatePurchaseDTO {
  supplierId: string;
  supplierInvoiceNumber?: string;
  warehouseId: string;
  items: {
    productId: string;
    quantityM2: number;
    boxesCount: number;
    unitCost: number;
  }[];
  discountAmount?: number;
  taxAmount?: number;
  shippingCost?: number;
  paidAmount: number;
  paymentType: PaymentType;
  notes?: string;
  performedBy?: string;
}

export class PurchaseService {
  private db = DatabaseManager.getInstance();

  private costingMethod(): string {
    const row = this.db.query<{ value: string }>("SELECT value FROM system_settings WHERE key = 'costingMethod'")[0];
    return row?.value || 'AVERAGE_COST';
  }

  public getAllPurchases(search?: string): PurchaseInvoice[] {
    let sql = `
      SELECT pi.*, s.name as supplierName, w.name as warehouseName, u.full_name as createdByName
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN users u ON pi.created_by = u.id
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      sql += ` WHERE pi.invoice_number LIKE ? OR s.name LIKE ? OR pi.supplier_invoice_number LIKE ?`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY pi.created_at DESC`;
    return this.db.query<PurchaseInvoice>(sql, params);
  }

  public getPurchaseById(id: string): (PurchaseInvoice & { items: PurchaseInvoiceItem[] }) | null {
    const rows = this.db.query<PurchaseInvoice>(`
      SELECT pi.*, s.name as supplierName, s.phone as supplierPhone, w.name as warehouseName, u.full_name as createdByName
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN users u ON pi.created_by = u.id
      WHERE pi.id = ?
    `, [id]);

    if (rows.length === 0) return null;
    const inv = rows[0];

    const items = this.db.query<PurchaseInvoiceItem>(`
      SELECT * FROM purchase_invoice_items WHERE purchase_id = ?
    `, [id]);

    return {
      ...inv,
      items
    };
  }

  public createPurchase(dto: CreatePurchaseDTO): PurchaseInvoice {
    if (!dto.items || dto.items.length === 0) {
      throw new Error('لا يمكن إنشاء فاتورة توريد بدون أصناف.');
    }
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.create');

    const purchaseId = `pur_${uuidv4().substring(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);
    const performedBy = actor.id;

    return this.db.executeTransaction((sqliteDb) => {
      const invoiceNumber = sqliteDb.nextNumber('PUR');
      let subtotal = 0;
      const preparedItems: any[] = [];

      for (const item of dto.items) {
        const prod = sqliteDb.query(`SELECT name, grade, meters_per_box, pieces_per_box, cost_price FROM products WHERE id = ?`, [item.productId])[0] as any;
        if (!prod) throw new Error(`المنتج ${item.productId} غير موجود.`);

        const lineTotalCost = round2(item.quantityM2 * item.unitCost);
        subtotal = round2(subtotal + lineTotalCost);

        preparedItems.push({
          id: `pitem_${uuidv4().substring(0, 8)}`,
          purchaseId,
          productId: item.productId,
          productName: prod.name,
          grade: prod.grade,
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          unitCost: item.unitCost,
          totalCost: lineTotalCost,
        metersPerBox: prod.metersPerBox || 1.44,
        piecesPerBox: prod.piecesPerBox || 4
        });
      }

      const discountAmount = round2(dto.discountAmount || 0);
      const taxAmount = round2(dto.taxAmount || 0);
      const shippingCost = round2(dto.shippingCost || 0);
      const totalAmount = round2(subtotal - discountAmount + taxAmount + shippingCost);
      const remainingAmount = round2(Math.max(0, totalAmount - dto.paidAmount));
      const paymentStatus = remainingAmount <= 0 ? 'PAID' : (dto.paidAmount > 0 ? 'PARTIAL' : 'UNPAID');

      // 1. Insert Purchase Invoice
      sqliteDb.run(`
        INSERT INTO purchase_invoices (
          id, invoice_number, supplier_invoice_number, date, supplier_id, warehouse_id,
          subtotal, discount_amount, tax_amount, shipping_cost, total_amount,
          paid_amount, remaining_amount, payment_type, payment_status, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        purchaseId, invoiceNumber, dto.supplierInvoiceNumber || null, today, dto.supplierId, dto.warehouseId,
        subtotal, discountAmount, taxAmount, shippingCost, totalAmount,
        dto.paidAmount, remainingAmount, dto.paymentType, paymentStatus, dto.notes || null, performedBy
      ]);

      const method = this.costingMethod();

      // 2. Insert Items, Increase Stock & Update Cost Price
      for (const item of preparedItems) {
        sqliteDb.run(`
          INSERT INTO purchase_invoice_items (
            id, purchase_id, product_id, product_name, grade, quantity_m2, boxes_count,
            unit_cost, total_cost, meters_per_box, pieces_per_box
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id, item.purchaseId, item.productId, item.productName, item.grade,
          item.quantityM2, item.boxesCount, item.unitCost, item.totalCost,
          item.metersPerBox, item.piecesPerBox
        ]);

        // Stock Increase
        const stockRow = sqliteDb.query(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`, [item.productId, dto.warehouseId])[0] as any;
        if (stockRow) {
          sqliteDb.run(`
            UPDATE warehouse_stock
            SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
            WHERE product_id = ? AND warehouse_id = ?
          `, [item.quantityM2, item.productId, dto.warehouseId]);
        } else {
          sqliteDb.run(`
            INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
            VALUES (?, ?, ?, ?, 0)
          `, [`stk_${uuidv4().substring(0, 8)}`, dto.warehouseId, item.productId, item.quantityM2]);
        }

        // Costing strategy (brief §33): weighted average, or latest-cost for FIFO (lot-tracking not yet implemented).
      const prevQty = stockRow ? stockRow.quantityM2 : 0;
      const prevCost = (stockRow ? this.db.query(`SELECT cost_price FROM products WHERE id = ?`, [item.productId])[0] : null)?.costPrice || 0;
        const newCost = method === 'FIFO'
          ? round2(item.unitCost)
          : computeWeightedAverageCost(prevQty, prevCost, item.quantityM2, item.unitCost);
        sqliteDb.run(`UPDATE products SET cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newCost, item.productId]);

        // Inventory Transaction
        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, 'PURCHASE', ?, ?, ?)
        `, [
          `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-PUR'),
          item.productId, dto.warehouseId, item.quantityM2, item.boxesCount, item.unitCost,
          item.totalCost, purchaseId, `شراء توريد سيراميك بموجب فاتورة ${invoiceNumber}`, performedBy
        ]);
      }

      // 3. Update Supplier Balance & Total Purchases
      sqliteDb.run(`
        UPDATE suppliers SET
          total_purchases = total_purchases + ?,
          current_balance = current_balance + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [totalAmount, remainingAmount, dto.supplierId]);

      // 4. If Cash Paid, Deduct from Cash Register
      if (dto.paidAmount > 0 && dto.paymentType === 'CASH') {
        sqliteDb.run(`
          UPDATE cash_registers SET current_balance = current_balance - ? WHERE is_default = 1
        `, [dto.paidAmount]);
      }

      // 5. Audit Log
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إدخال فاتورة مشتريات وتوريد', 'PURCHASES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, actor.fullName, purchaseId, JSON.stringify({ invoiceNumber, totalAmount })]);

      return this.getPurchaseById(purchaseId)!;
    });
  }
}
