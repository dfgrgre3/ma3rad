import { DatabaseManager } from '../database/db';
import type { PurchaseInvoice, PurchaseInvoiceItem, PaymentType, PaymentStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { computeWeightedAverageCost, round2 } from './financials';
import { CustomerSupplyService } from './CustomerSupplyService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { SettingsService } from './SettingsService';

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
    return SettingsService.getSettings().costingMethod;
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
    const today = localDateString();
    const performedBy = actor.id;

    const invoice = this.db.executeTransaction((sqliteDb) => {
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
      const paymentStatus: PaymentStatus = remainingAmount <= 0 ? 'PAID' : (dto.paidAmount > 0 ? 'PARTIAL' : 'UNPAID');

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
        // NOTE: Current implementation uses organization-wide average cost (products.cost_price).
        // For multi-warehouse scenarios, consider implementing warehouse-specific cost tracking
        // by adding cost_price to warehouse_stock table or a separate warehouse_product_costs table.
        const prevQty = stockRow ? stockRow.quantityM2 : 0;
        const prevCost = (stockRow ? this.db.query(`SELECT cost_price FROM products WHERE id = ?`, [item.productId])[0] : null)?.costPrice || 0;
        const newCost = method === 'FIFO'
          ? round2(item.unitCost)
          : computeWeightedAverageCost(prevQty, prevCost, item.quantityM2, item.unitCost);
        sqliteDb.run(`UPDATE products SET cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newCost, item.productId]);

        // Inventory Transaction
        const inventoryTransactionId = `tx_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, 'PURCHASE', ?, ?, ?)
        `, [
          inventoryTransactionId, sqliteDb.nextNumber('TX-PUR'),
          item.productId, dto.warehouseId, item.quantityM2, item.boxesCount, item.unitCost,
          item.totalCost, purchaseId, `شراء توريد سيراميك بموجب فاتورة ${invoiceNumber}`, performedBy
        ]);
        InventoryCostingService.addLayer(sqliteDb, {
          productId: item.productId, warehouseId: dto.warehouseId,
          sourceTransactionId: inventoryTransactionId, sourceType: 'PURCHASE', sourceId: purchaseId,
          date: today, quantity: item.quantityM2, unitCost: item.unitCost,
        });
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

      if (dto.paidAmount > 0 && dto.paymentType !== 'CREDIT') {
        const paymentId = `spay_${uuidv4().substring(0, 8)}`;
        const receiptNumber = `PAY-${Date.now().toString().slice(-8)}`;
        sqliteDb.run(`
          INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date, register_id, notes, performed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          paymentId,
          receiptNumber,
          dto.supplierId,
          dto.paidAmount,
          dto.paymentType,
          today,
          'cr_main',
          `دفعة مع فاتورة توريد ${invoiceNumber}`,
          performedBy,
        ]);
        sqliteDb.run(`INSERT INTO supplier_payment_allocations (id,payment_id,purchase_invoice_id,amount) VALUES (?,?,?,?)`,
          [`spa_${uuidv4().substring(0, 8)}`, paymentId, purchaseId, dto.paidAmount]);
        postLedgerEntry(sqliteDb.getDatabase(), {
          date: today,
          description: `Supplier payment ${receiptNumber}`,
          referenceType: 'SUPPLIER_PAYMENT',
          referenceId: paymentId,
          createdBy: performedBy,
          lines: [
            { accountCode: '2101', debit: dto.paidAmount, credit: 0 },
            { accountCode: paymentAccountCode(dto.paymentType), debit: 0, credit: dto.paidAmount },
          ],
        });
      }

      const inventoryCost = round2(preparedItems.reduce((sum, item) => sum + Number(item.totalCost), 0));
      const purchaseAdjustment = round2(totalAmount - inventoryCost - taxAmount);
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description: `Purchase ${invoiceNumber}`,
        referenceType: 'PURCHASE_INVOICE',
        referenceId: purchaseId,
        createdBy: performedBy,
        lines: [
          ...(inventoryCost > 0 ? [{ accountCode: '1104', debit: inventoryCost, credit: 0 }] : []),
          ...(taxAmount > 0 ? [{ accountCode: '1201', debit: taxAmount, credit: 0 }] : []),
          ...(purchaseAdjustment > 0.009
            ? [{ accountCode: '5201', debit: purchaseAdjustment, credit: 0 }]
            : purchaseAdjustment < -0.009
              ? [{ accountCode: '5201', debit: 0, credit: -purchaseAdjustment }]
              : []),
          { accountCode: '2101', debit: 0, credit: totalAmount },
        ],
      });

      // 5. Audit Log
      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إدخال فاتورة مشتريات وتوريد', 'PURCHASES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, performedBy, actor.fullName, purchaseId, JSON.stringify({ invoiceNumber, totalAmount })]);

      for (const item of dto.items) {
        new CustomerSupplyService().allocateReceivedQuantity(dto.warehouseId, item.productId, item.quantityM2, sqliteDb);
      }

      return {
        id: purchaseId,
        invoiceNumber,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        date: today,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        subtotal,
        discountAmount,
        taxAmount,
        shippingCost,
        totalAmount,
        paidAmount: dto.paidAmount,
        remainingAmount,
        paymentType: dto.paymentType,
        paymentStatus,
        notes: dto.notes,
        createdBy: performedBy,
        createdAt: new Date().toISOString(),
        items: preparedItems,
      };
    });

    return invoice;
  }

  public recordPayment(
    purchaseId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId = 'cr_main',
    notes = ''
  ): { id: string; receiptNumber: string; amount: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'suppliers.payment');
    const invoice = this.getPurchaseById(purchaseId);
    if (!invoice) throw new Error('فاتورة الشراء غير موجودة.');
    if (invoice.remainingAmount <= 0) throw new Error('الفاتورة مسددة بالكامل بالفعل.');

    const value = round2(Math.min(Math.max(0, amount || 0), invoice.remainingAmount));
    if (value <= 0) throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');

    const today = localDateString();
    const paymentId = `spay_${uuidv4().substring(0, 8)}`;

    return this.db.executeTransaction((db) => {
      const receiptNumber = db.nextNumber('PAY');
      const newPaid = round2(invoice.paidAmount + value);
      const newRemaining = round2(Math.max(0, invoice.remainingAmount - value));
      const status = newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

      db.run(
        `INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date, register_id, notes, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, receiptNumber, invoice.supplierId, value, paymentType, today, registerId, notes || `سداد دفعة على فاتورة توريد ${invoice.invoiceNumber}`, actor.id]
      );
      db.run(`INSERT INTO supplier_payment_allocations (id,payment_id,purchase_invoice_id,amount) VALUES (?,?,?,?)`,
        [`spa_${uuidv4().substring(0, 8)}`, paymentId, purchaseId, value]);
      db.run(
        `UPDATE purchase_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?`,
        [newPaid, newRemaining, status, purchaseId]
      );
      db.run(
        `UPDATE suppliers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, invoice.supplierId]
      );
      if (paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [value, registerId]);
      }
      postLedgerEntry(db.getDatabase(), {
        date: today,
        description: `Supplier payment ${receiptNumber}`,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: '2101', debit: value, credit: 0 },
          { accountCode: paymentAccountCode(paymentType), debit: 0, credit: value },
        ],
      });
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'سداد دفعة لمورد', 'PURCHASES', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, purchaseId, JSON.stringify({
          receiptNumber, invoiceNumber: invoice.invoiceNumber, amount: value, paymentType,
        })]
      );

      return { id: paymentId, receiptNumber, amount: value };
    });
  }

  public deletePurchase(purchaseId: string, reason: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.delete');
    const invoice = this.getPurchaseById(purchaseId);
    if (!invoice) throw new Error('فاتورة الشراء غير موجودة.');
    if (!reason || !reason.trim()) throw new Error('سبب الحذف مطلوب.');

    const returnsCount = this.db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM purchase_returns WHERE original_invoice_id = ?',
      [purchaseId]
    )[0]?.count ?? 0;
    if (returnsCount > 0) throw new Error('لا يمكن حذف فاتورة لها مرتجعات مسجلة. احذف المرتجعات أولًا.');

    this.db.executeTransaction((db) => {
      const costingMethod = InventoryCostingService.costingMethod(db);

      // For FIFO: check if any quantity has been consumed
      if (costingMethod === 'FIFO') {
        if (!db.query<any>(`SELECT id FROM inventory_cost_layers WHERE source_type='PURCHASE' AND source_id=? LIMIT 1`, [purchaseId]).length) {
          throw new Error('This legacy purchase has no traceable FIFO lot. Do not delete it while FIFO is active; reconcile the stock through a documented inventory adjustment.');
        }
        InventoryCostingService.removeUnusedSource(db, 'PURCHASE', purchaseId);
      } else {
        // For AVERAGE_COST: verify current stock is sufficient before deletion
        for (const item of invoice.items) {
          const stockRow = db.query<{ quantityM2: number }>(
            `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
            [item.productId, invoice.warehouseId]
          )[0];
          const currentQuantity = stockRow ? Number(stockRow.quantityM2) : 0;
          if (currentQuantity < item.quantityM2) {
            throw new Error(`لا يمكن حذف فاتورة التوريد. الرصيد الحالي للصنف (${currentQuantity} م²) أقل من كمية الفاتورة (${item.quantityM2} م²). تم استخدام جزء من الكمية في مبيعات. استخدم مرتجع بدلاً من الحذف.`);
          }
        }
      }

      for (const item of invoice.items) {
        db.run(
          `UPDATE warehouse_stock
           SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
           WHERE product_id = ? AND warehouse_id = ?`,
          [item.quantityM2, item.productId, invoice.warehouseId]
        );
        db.run(
          `INSERT INTO inventory_transactions (
             id, transaction_number, type, product_id, warehouse_id,
             quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
             reference_id, notes, performed_by
           ) VALUES (?, ?, 'VOID', ?, ?, ?, ?, ?, ?, 'PURCHASE_DELETE', ?, ?, ?)`,
          [
            `tx_${uuidv4().substring(0, 8)}`, db.nextNumber('TX-VOID'),
            item.productId, invoice.warehouseId, -item.quantityM2, item.boxesCount,
            item.unitCost, round2(-item.quantityM2 * item.unitCost), purchaseId,
            `حذف فاتورة توريد ${invoice.invoiceNumber}: ${reason.trim()}`, actor.id,
          ]
        );
      }

      db.run(
        `UPDATE suppliers SET
           current_balance = current_balance - ?,
           total_purchases = total_purchases - ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [invoice.remainingAmount, invoice.totalAmount, invoice.supplierId]
      );

      const relatedPayments = db.query<any>(
        `SELECT id, amount, payment_type, register_id FROM supplier_payments
         WHERE supplier_id = ? AND notes LIKE ?`,
        [invoice.supplierId, `%${invoice.invoiceNumber}%`]
      );
      for (const payment of relatedPayments) {
        postLedgerEntry(db.getDatabase(), {
          date: localDateString(),
          description: `Reverse supplier payment ${payment.id}`,
          referenceType: 'SUPPLIER_PAYMENT_VOID',
          referenceId: payment.id,
          createdBy: actor.id,
          lines: [
            { accountCode: paymentAccountCode(payment.payment_type), debit: Number(payment.amount), credit: 0 },
            { accountCode: '2101', debit: 0, credit: Number(payment.amount) },
          ],
        });
        if (payment.payment_type === 'CASH' && payment.register_id) {
          db.run('UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?', [payment.amount, payment.register_id]);
        }
        db.run('DELETE FROM supplier_payments WHERE id = ?', [payment.id]);
      }
      if (relatedPayments.length === 0 && invoice.paidAmount > 0 && invoice.paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE is_default = 1`, [invoice.paidAmount]);
      }

      const inventoryCost = round2(invoice.items.reduce((sum, item) => sum + Number(item.totalCost), 0));
      const purchaseAdjustment = round2(invoice.totalAmount - inventoryCost - invoice.taxAmount);
      postLedgerEntry(db.getDatabase(), {
        date: localDateString(),
        description: `Void purchase ${invoice.invoiceNumber}`,
        referenceType: 'PURCHASE_VOID',
        referenceId: purchaseId,
        createdBy: actor.id,
        lines: [
          { accountCode: '2101', debit: invoice.totalAmount, credit: 0 },
          ...(inventoryCost > 0 ? [{ accountCode: '1104', debit: 0, credit: inventoryCost }] : []),
          ...(invoice.taxAmount > 0 ? [{ accountCode: '1201', debit: 0, credit: invoice.taxAmount }] : []),
          ...(purchaseAdjustment > 0.009
            ? [{ accountCode: '5201', debit: 0, credit: purchaseAdjustment }]
            : purchaseAdjustment < -0.009
              ? [{ accountCode: '5201', debit: -purchaseAdjustment, credit: 0 }]
              : []),
        ],
      });

      db.run('DELETE FROM purchase_invoice_items WHERE purchase_id = ?', [purchaseId]);
      db.run('DELETE FROM purchase_invoices WHERE id = ?', [purchaseId]);

      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'حذف فاتورة توريد', 'PURCHASES', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, purchaseId,
          JSON.stringify({ invoiceNumber: invoice.invoiceNumber, total: invoice.totalAmount, paid: invoice.paidAmount }),
          JSON.stringify({ reason: reason.trim() }),
        ]
      );
    });
  }
}
