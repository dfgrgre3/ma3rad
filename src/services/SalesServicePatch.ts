import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, PaymentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import {
  computeSaleLine,
  computeSaleTotals,
  computeReturnImpact,
  round2,
} from './financials';

export interface CreateSaleDTO {
  customerId: string;
  warehouseId: string;
  shiftId?: string;
  items: {
    productId: string;
    soldBy: 'M2' | 'BOX' | 'PIECE';
    quantityM2: number;
    boxesCount: number;
    piecesCount: number;
    unitPrice: number;
    unitCost?: number;
    discountAmount?: number;
  }[];
  discountPercentage?: number;
  discountAmount?: number;
  taxPercentage?: number;
  taxAmount?: number;
  shippingCost?: number;
  paidAmount: number;
  paymentType: PaymentType;
  notes?: string;
  performedBy?: string;
}

export class SalesService {
  private db = DatabaseManager.getInstance();

  public getAllInvoices(search?: string, dateFrom?: string, dateTo?: string): SalesInvoice[] {
    let sql = `
      SELECT si.*, c.name as customerName, c.phone as customerPhone, w.name as warehouseName, u.full_name as createdByName
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      JOIN warehouses w ON si.warehouse_id = w.id
      LEFT JOIN users u ON si.created_by = u.id
      WHERE si.invoice_status != 'VOID'
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      sql += ` AND (si.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    if (dateFrom) {
      sql += ` AND si.date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND si.date <= ?`;
      params.push(dateTo);
    }
    sql += ` ORDER BY si.created_at DESC`;
    return this.db.query<SalesInvoice>(sql, params);
  }

  public getInvoiceById(id: string): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
    const invoices = this.db.query<SalesInvoice>(`
      SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
             w.name as warehouseName, u.full_name as createdByName
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      JOIN warehouses w ON si.warehouse_id = w.id
      LEFT JOIN users u ON si.created_by = u.id
      WHERE si.id = ?
    `, [id]);

    if (invoices.length === 0) return null;
    const inv = invoices[0];
    const items = this.db.query<SalesInvoiceItem>(`
      SELECT * FROM sales_invoice_items WHERE invoice_id = ?
    `, [id]);
    return { ...inv, items };
  }

  public createSale(dto: CreateSaleDTO): SalesInvoice {
    if (!dto.items || dto.items.length === 0) {
      throw new Error('لا يمكن إنشاء فاتورة مبيعات بدون أصناف.');
    }
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.create');

    return this.db.executeTransaction((sqliteDb) => {
      let totalLineDiscount = 0;
      const preparedItems: any[] = [];

      for (const item of dto.items) {
        const prod = sqliteDb.query(`SELECT * FROM products WHERE id = ? AND is_active = 1`, [item.productId])[0] as any;
        if (!prod) throw new Error(`المنتج ذو المعرف ${item.productId} غير موجود أو غير نشط.`);

        // Margin / price protection (brief §132): selling below the minimum allowed price needs approval.
        if (item.unitPrice < (prod.minSellingPriceM2 || 0)) {
          PermissionService.require(actor, 'sales.approve');
        }

        const stockRow = sqliteDb.query(
          `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
          [item.productId, dto.warehouseId]
        )[0] as any;
        const availableM2 = (stockRow ? stockRow.quantityM2 : 0) - (stockRow?.reservedM2 || 0);
        if (availableM2 < item.quantityM2) {
          throw new Error(
            `الرصيد المتاح من الصنف (${prod.name} - فرز ${prod.grade}) غير كافٍ. المتاح: ${availableM2} م²، المطلوب: ${item.quantityM2} م²`
          );
        }

        const line = computeSaleLine({
          quantity: item.quantityM2,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost ?? prod.costPrice ?? 0,
          discountAmount: item.discountAmount || 0,
        });
        totalLineDiscount += line.lineDiscount;

        preparedItems.push({
          id: `item_${uuidv4().substring(0, 8)}`,
          invoiceId: '',
          productId: prod.id,
          productName: prod.name,
          productSku: prod.sku,
          productGrade: prod.grade,
          size: prod.size,
          soldBy: item.soldBy,
          quantityM2: item.quantityM2,
          boxesCount: item.boxesCount,
          piecesCount: item.piecesCount,
          unitPrice: item.unitPrice,
          originalUnitPrice: prod.sellingPriceM2,
          unitCost: line.lineCost / (item.quantityM2 || 1),
          discountAmount: line.lineDiscount,
          totalPrice: line.lineTotal,
          totalCost: line.lineCost,
          profit: line.lineProfit,
          metersPerBox: prod.metersPerBox || 1.44,
          piecesPerBox: prod.piecesPerBox || 4,
        });
      }

      // Any discount requires explicit permission (brief §68/§131).
      const headerDiscount = dto.discountAmount || 0;
      if (totalLineDiscount + headerDiscount > 0) {
        PermissionService.require(actor, 'sales.discount');
      }

      const totals = computeSaleTotals({
        lines: preparedItems.map((p) => ({
          lineTotal: p.totalPrice,
          lineCost: p.totalCost,
        })),
        discountAmount: headerDiscount,
        taxAmount: dto.taxAmount || 0,
        shippingCost: dto.shippingCost || 0,
        paidAmount: dto.paidAmount,
      });

      const invoiceId = `inv_${uuidv4().substring(0, 8)}`;
      const invoiceNumber = sqliteDb.nextNumber('INV');
      const today = new Date().toISOString().slice(0, 10);

      sqliteDb.run(`
        INSERT INTO sales_invoices (
          id, invoice_number, date, customer_id, warehouse_id, shift_id,
          subtotal, discount_percentage, discount_amount, tax_percentage, tax_amount,
          shipping_cost, total_amount, paid_amount, remaining_amount, payment_type,
          payment_status, invoice_status, total_cost, gross_profit, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
      `, [
        invoiceId, invoiceNumber, today, dto.customerId, dto.warehouseId, dto.shiftId || null,
        totals.subtotal, dto.discountPercentage || 0, totals.discountAmount, dto.taxPercentage || 0, totals.taxAmount,
        totals.shippingCost, totals.totalAmount, totals.paidAmount, totals.remainingAmount, dto.paymentType,
        totals.paymentStatus, totals.totalCost, totals.grossProfit, dto.notes || null, actor.id
      ]);

      for (const item of preparedItems) {
        item.invoiceId = invoiceId;
        sqliteDb.run(`
          INSERT INTO sales_invoice_items (
            id, invoice_id, product_id, product_name, product_sku, product_grade, size,
            sold_by, quantity_m2, boxes_count, pieces_count, unit_price, original_unit_price,
            unit_cost, discount_amount, total_price, total_cost, profit, meters_per_box, pieces_per_box
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id, item.invoiceId, item.productId, item.productName, item.productSku, item.productGrade,
          item.size, item.soldBy, item.quantityM2, item.boxesCount, item.piecesCount,
          item.unitPrice, item.originalUnitPrice, round2(item.unitCost), item.discountAmount,
          item.totalPrice, item.totalCost, item.profit, item.metersPerBox, item.piecesPerBox
        ]);

        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, dto.warehouseId]);

        const txId = `tx_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
        `, [
          txId, sqliteDb.nextNumber('TX-SALE'), item.productId, dto.warehouseId,
          -item.quantityM2, -item.boxesCount, round2(item.unitCost), item.totalCost,
          invoiceId, `بيع بموجب فاتورة ${invoiceNumber}`, actor.id
        ]);
      }

      sqliteDb.run(`
        UPDATE customers SET
          total_purchases = total_purchases + ?,
          current_balance = current_balance + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [totals.totalAmount, totals.remainingAmount, dto.customerId]);

      if (totals.paidAmount > 0) {
        if (dto.paymentType === 'CASH') {
          sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE is_default = 1`, [totals.paidAmount]);
        }
        if (dto.shiftId) {
          const col = dto.paymentType === 'CASH' ? 'total_sales_cash'
            : dto.paymentType === 'CARD' ? 'total_sales_card' : 'total_sales_transfer';
          sqliteDb.run(`UPDATE cash_shifts SET ${col} = ${col} + ? WHERE id = ?`, [totals.paidAmount, dto.shiftId]);
        }
      }

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إصدار فاتورة مبيعات', 'SALES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({ invoiceNumber, totalAmount: totals.totalAmount, paidAmount: totals.paidAmount })]);

      return this.getInvoiceById(invoiceId)!;
    });
  }

  public returnSale(
    invoiceId: string,
    returnItems: { productId: string; quantityM2: number; boxesCount: number; unitPrice: number; unitCost: number; reason: string }[],
    refundCash = true,
    performedBy = 'usr_admin'
  ): SalesReturn {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.refund');
    const inv = this.getInvoiceById(invoiceId);
    if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
    if (inv.invoiceStatus === 'VOID') throw new Error('لا يمكن مرتجعة فاتورة ملغاة.');

    // Validate returned quantity per product never exceeds what was originally sold (brief §68).
    for (const rit of returnItems) {
      const sold = inv.items
        .filter((i) => i.productId === rit.productId)
        .reduce((s, i) => s + i.quantityM2, 0);
      const alreadyReturned = this.db.query<{ q: number }>(
        `SELECT COALESCE(SUM(quantity_m2),0) as q FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         WHERE sr.original_invoice_id = ? AND sri.product_id = ?`,
        [invoiceId, rit.productId]
      )[0]?.q || 0;
      if (rit.quantityM2 + alreadyReturned > sold + 1e-6) {
        throw new Error(`لا يمكن إرجاع كمية أكبر من المباعة للصنف (المباع: ${sold} م²، المُرجع سابقاً: ${alreadyReturned} م²).`);
      }
    }

    const returnId = `ret_${uuidv4().substring(0, 8)}`;
    const today = new Date().toISOString().slice(0, 10);

    return this.db.executeTransaction((sqliteDb) => {
      const returnNumber = sqliteDb.nextNumber('RET');
      let totalReturnAmount = 0;

      for (const item of returnItems) {
        const lineTotal = round2(item.quantityM2 * item.unitPrice);
        totalReturnAmount = round2(totalReturnAmount + lineTotal);

        sqliteDb.run(`
          INSERT INTO sales_return_items (
            id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund
          ) VALUES (?, ?, ?, (SELECT name FROM products WHERE id = ?), (SELECT grade FROM products WHERE id = ?), ?, ?, ?, ?, ?)
        `, [
          `ritem_${uuidv4().substring(0, 8)}`, returnId, item.productId, item.productId, item.productId,
          item.quantityM2, item.boxesCount, item.unitPrice, item.unitCost, lineTotal
        ]);

        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, inv.warehouseId]);

        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'SALES_RETURN', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
        `, [
          `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-RET'),
          item.productId, inv.warehouseId, item.quantityM2, item.boxesCount, item.unitCost,
          round2(item.quantityM2 * item.unitCost), returnId, `مرتجع مبيعات للفاتورة ${inv.invoiceNumber}`, actor.id
        ]);
      }

      // Correct AR / cash accounting (brief §68/§220/§223).
      const impact = computeReturnImpact({
        invoiceTotal: inv.totalAmount,
        invoicePaid: inv.paidAmount,
        returnTotal: totalReturnAmount,
        refundCash,
      });

      sqliteDb.run(`
        INSERT INTO sales_returns (
          id, return_number, original_invoice_id, original_invoice_number, customer_id,
          warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        returnId, returnNumber, inv.id, inv.invoiceNumber, inv.customerId,
        inv.warehouseId, today, totalReturnAmount, impact.cashRefund, impact.balanceDelta,
        returnItems[0]?.reason || 'مرتجع سيراميك', actor.id
      ]);

      // Reduce customer debt by the credit memo minus the cash portion that settles it,
      // and reduce total purchases by the returned value.
      sqliteDb.run(`
        UPDATE customers SET
          current_balance = current_balance - ?,
          total_purchases = total_purchases - ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [impact.balanceDelta, totalReturnAmount, inv.customerId]);

      if (impact.cashRefund > 0) {
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE is_default = 1`, [impact.cashRefund]);
      }

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'مرتجع مبيعات', 'SALES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, returnId, JSON.stringify({ returnNumber, totalReturnAmount, cashRefund: impact.cashRefund })]);

      return {
        id: returnId,
        returnNumber,
        originalInvoiceId: inv.id,
        originalInvoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        warehouseId: inv.warehouseId,
        date: today,
        totalAmount: totalReturnAmount,
        refundedAmount: impact.cashRefund,
        remainingToBalance: impact.balanceDelta,
        reason: returnItems[0]?.reason || 'مرتجع',
        createdBy: actor.id,
        createdAt: new Date().toISOString()
      };
    });
  }

  /** Void a completed sales invoice with full reversal (brief §67/§220). */
  public voidInvoice(invoiceId: string, reason: string): SalesInvoice {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.void');
    const inv = this.getInvoiceById(invoiceId);
    const returnsCount = this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales_returns WHERE original_invoice_id = ?',
      [invoiceId]
    )[0]?.count ?? 0;
    if (returnsCount > 0) {
      throw new Error('لا يمكن إلغاء فاتورة لها مرتجعات مسجلة. سجّل مرتجعاً للكميات المتبقية بدلاً من ذلك.');
    }
    if (!inv) throw new Error('الفاتورة غير موجودة.');
    if (inv.invoiceStatus === 'VOID') throw new Error('الفاتورة ملغاة بالفعل.');

    return this.db.executeTransaction((sqliteDb) => {
      for (const item of inv.items) {
        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, inv.warehouseId]);

        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'VOID', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
        `, [
          `tx_${uuidv4().substring(0, 8)}`, sqliteDb.nextNumber('TX-VOID'),
          item.productId, inv.warehouseId, item.quantityM2, item.boxesCount,
          item.unitCost, round2(item.quantityM2 * item.unitCost), invoiceId,
          `إلغاء فاتورة ${inv.invoiceNumber}`, actor.id
        ]);
      }

      // Reverse the credit extended to the customer and the cash received.
      sqliteDb.run(`
        UPDATE customers SET
          current_balance = current_balance - ?,
          total_purchases = total_purchases - ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [inv.remainingAmount, inv.totalAmount, inv.customerId]);

      if (inv.paidAmount > 0 && inv.paymentType === 'CASH') {
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE is_default = 1`, [inv.paidAmount]);
      }

      sqliteDb.run(`UPDATE sales_invoices SET invoice_status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [invoiceId]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'إلغاء فاتورة مبيعات', 'SALES', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({ invoiceNumber: inv.invoiceNumber }), JSON.stringify({ reason })]);

      return this.getInvoiceById(invoiceId)!;
    });
  }
}
