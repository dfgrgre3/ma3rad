import { DatabaseManager } from '../database/db';
import type { PurchaseInvoice, PurchaseInvoiceItem, PaymentType, PaymentStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { BranchAccessService } from './BranchAccessService';
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
    orderedUnitCost?: number;
    grnAcceptedQty?: number;
  }[];
  discountAmount?: number;
  taxAmount?: number;
  shippingCost?: number;
  paidAmount: number;
  paymentType: PaymentType;
  notes?: string;
  performedBy?: string;
  // Enhancements for 5.3:
  grnId?: string;
  purchaseOrderId?: string;
  landedFreight?: number;
  landedLoading?: number;
  landedCustomsTaxes?: number;
  landedInsurance?: number;
  landedOther?: number;
  landedAllocationMethod?: 'VALUE' | 'QUANTITY' | 'WEIGHT';
  isNoNumberSupplier?: boolean;
}

export class PurchaseService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private costingMethod(): string {
    return SettingsService.getSettings().costingMethod;
  }

  public getAllPurchases(search?: string): PurchaseInvoice[] {
    AuthService.requireAuth();
    const scope = this.branchAccess.sqlScope('pi.branch_id', 'w.branch_id');
    let sql = `
      SELECT pi.*, s.name as supplierName, w.name as warehouseName, u.full_name as createdByName
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN users u ON pi.created_by = u.id
      WHERE ${scope.clause}
    `;
    const params: any[] = [...scope.params];

    if (search && search.trim()) {
      sql += ` AND (pi.invoice_number LIKE ? OR s.name LIKE ? OR pi.supplier_invoice_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY pi.created_at DESC`;
    return this.db.query<PurchaseInvoice>(sql, params);
  }

  public getPurchaseById(id: string): (PurchaseInvoice & { items: PurchaseInvoiceItem[] }) | null {
    AuthService.requireAuth();
    const scope = this.branchAccess.sqlScope('pi.branch_id', 'w.branch_id');
    const rows = this.db.query<PurchaseInvoice>(`
      SELECT pi.*, s.name as supplierName, s.phone as supplierPhone, w.name as warehouseName, u.full_name as createdByName
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      JOIN warehouses w ON pi.warehouse_id = w.id
      LEFT JOIN users u ON pi.created_by = u.id
      WHERE pi.id = ? AND ${scope.clause}
    `, [id, ...scope.params]);

    if (rows.length === 0) return null;
    const inv = rows[0];

    const items = this.db.query<PurchaseInvoiceItem>(`
      SELECT pii.*, pii.quantity_m2 AS quantityM2, pii.unit_cost AS unitCost,
             pii.landed_cost_share AS landedCostShare, pii.total_cost AS totalCost,
             pii.effective_unit_cost AS effectiveUnitCost, p.name AS productName,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM purchase_invoice_items pii
      LEFT JOIN products p ON p.id = pii.product_id
      WHERE pii.purchase_id = ?
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
    const branchId = this.branchAccess.requireWarehouseAccess(dto.warehouseId, actor);
    const branchRegisterId = this.branchAccess.getDefaultRegisterId(branchId, actor);

    // Duplicate supplier invoice check (unless explicit override for suppliers without numbers)
    if (!dto.isNoNumberSupplier && dto.supplierInvoiceNumber && dto.supplierInvoiceNumber.trim()) {
      const existing = this.db.query<any>(
        `SELECT invoice_number, date FROM purchase_invoices WHERE supplier_id = ? AND supplier_invoice_number = ? AND is_no_number_supplier = 0`,
        [dto.supplierId, dto.supplierInvoiceNumber.trim()]
      )[0];
      if (existing) {
        throw new Error(`رقم فاتورة المورد (${dto.supplierInvoiceNumber}) مكرر ومسجل بالفعل بالفاتورة ${existing.invoice_number} بتاريخ ${existing.date}.`);
      }
    }

    const purchaseId = `pur_${uuidv4().substring(0, 8)}`;
    const today = localDateString();
    const performedBy = actor.id;
    const supplierTerms = this.db.query<{ paymentTermsDays: number }>(
      'SELECT payment_terms_days AS paymentTermsDays FROM suppliers WHERE id = ?',
      [dto.supplierId]
    )[0];
    if (!supplierTerms) throw new Error('المورد المحدد غير موجود.');
    const paymentTermsDays = Number(supplierTerms.paymentTermsDays);
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) {
      throw new Error('مدة السداد المسجلة للمورد غير صالحة.');
    }
    const dueDate = new Date(`${today}T00:00:00`);
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    const dueDateString = localDateString(dueDate);

    const invoice = this.db.executeTransaction((sqliteDb) => {
      const invoiceNumber = sqliteDb.nextNumber('PUR');
      let subtotal = 0;
      const preparedItems: any[] = [];

      for (let idx = 0; idx < dto.items.length; idx++) {
        const item = dto.items[idx];
        const prod = sqliteDb.query(`SELECT name, grade, product_type, base_unit, meters_per_box, pieces_per_box, cost_price FROM products WHERE id = ?`, [item.productId])[0] as any;
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
          boxesCount: prod.product_type === 'GENERAL'
            ? prod.base_unit === 'BOX' ? item.quantityM2 : 0
            : item.boxesCount,
          productType: prod.product_type,
          unitCost: item.unitCost,
          totalCost: lineTotalCost,
          metersPerBox: prod.metersPerBox || 1.44,
          piecesPerBox: prod.piecesPerBox || 4,
          orderedUnitCost: item.orderedUnitCost || item.unitCost,
          grnAcceptedQty: item.grnAcceptedQty || item.quantityM2,
          landedCostShare: 0,
          effectiveUnitCost: item.unitCost,
        });
      }

      const discountAmount = round2(dto.discountAmount || 0);
      const taxAmount = round2(dto.taxAmount || 0);

      // Landed Costs Distribution
      const landedFreight = Number(dto.landedFreight ?? dto.shippingCost ?? 0);
      const landedLoading = Number(dto.landedLoading || 0);
      const landedCustoms = Number(dto.landedCustomsTaxes || 0);
      const landedInsurance = Number(dto.landedInsurance || 0);
      const landedOther = Number(dto.landedOther || 0);
      const totalLanded = round2(landedFreight + landedLoading + landedCustoms + landedInsurance + landedOther);
      const allocMethod = dto.landedAllocationMethod || 'VALUE';

      let denominator = 0;
      for (const it of preparedItems) {
        denominator += allocMethod === 'QUANTITY' ? it.quantityM2 : it.totalCost;
      }
      if (denominator <= 0) denominator = 1;

      let allocatedShareSum = 0;
      preparedItems.forEach((it, idx) => {
        const val = allocMethod === 'QUANTITY' ? it.quantityM2 : it.totalCost;
        const share = idx === preparedItems.length - 1
          ? round2(totalLanded - allocatedShareSum)
          : round2(totalLanded * (val / denominator));
        allocatedShareSum = round2(allocatedShareSum + share);
        it.landedCostShare = share;
        it.effectiveUnitCost = it.quantityM2 > 0 ? round2((it.totalCost + share) / it.quantityM2) : it.unitCost;
      });

      // 3-Way Matching Variance
      let priceVarianceAmount = 0;
      let qtyVarianceAmount = 0;
      for (const it of preparedItems) {
        const priceDiff = round2(it.unitCost - it.orderedUnitCost);
        const qtyDiff = round2(it.quantityM2 - it.grnAcceptedQty);
        priceVarianceAmount = round2(priceVarianceAmount + priceDiff * it.quantityM2);
        qtyVarianceAmount = round2(qtyVarianceAmount + qtyDiff * it.unitCost);
      }
      let matchingStatus = 'MATCHED';
      if (Math.abs(priceVarianceAmount) > 0.01 && Math.abs(qtyVarianceAmount) > 0.01) matchingStatus = 'BOTH_VARIANCE';
      else if (Math.abs(priceVarianceAmount) > 0.01) matchingStatus = 'PRICE_VARIANCE';
      else if (Math.abs(qtyVarianceAmount) > 0.01) matchingStatus = 'QTY_VARIANCE';

      const shippingCost = round2(landedFreight);
      const totalAmount = round2(subtotal - discountAmount + taxAmount + totalLanded);
      const remainingAmount = round2(Math.max(0, totalAmount - dto.paidAmount));
      const paymentStatus: PaymentStatus = remainingAmount <= 0 ? 'PAID' : (dto.paidAmount > 0 ? 'PARTIAL' : 'UNPAID');

      // 1. Insert Purchase Invoice
      sqliteDb.run(`
        INSERT INTO purchase_invoices (
          id, invoice_number, supplier_invoice_number, date, due_date, supplier_id, warehouse_id, branch_id,
          subtotal, discount_amount, tax_amount, shipping_cost, total_amount,
          paid_amount, remaining_amount, payment_type, payment_status, notes, created_by,
          grn_id, purchase_order_id, landed_freight, landed_loading, landed_customs_taxes,
          landed_insurance, landed_other, landed_allocation_method, is_no_number_supplier,
          matching_status, price_variance_amount, qty_variance_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        purchaseId, invoiceNumber, dto.supplierInvoiceNumber || null, today, dueDateString, dto.supplierId, dto.warehouseId, branchId,
        subtotal, discountAmount, taxAmount, shippingCost, totalAmount,
        dto.paidAmount, remainingAmount, dto.paymentType, paymentStatus, dto.notes || null, performedBy,
        dto.grnId || null, dto.purchaseOrderId || null, landedFreight, landedLoading, landedCustoms,
        landedInsurance, landedOther, allocMethod, dto.isNoNumberSupplier ? 1 : 0,
        matchingStatus, priceVarianceAmount, qtyVarianceAmount,
      ]);

      const method = this.costingMethod();
      const alreadyReceivedInGrn = Boolean(dto.grnId);

      // 2. Insert Items, Increase Stock (if not already received via GRN) & Update Cost Price
      for (const item of preparedItems) {
        sqliteDb.run(`
          INSERT INTO purchase_invoice_items (
            id, purchase_id, product_id, product_name, grade, quantity_m2, boxes_count,
            unit_cost, total_cost, meters_per_box, pieces_per_box,
            landed_cost_share, effective_unit_cost, ordered_unit_cost, grn_accepted_qty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id, item.purchaseId, item.productId, item.productName, item.grade,
          item.quantityM2, item.boxesCount, item.unitCost, item.totalCost,
          item.metersPerBox, item.piecesPerBox,
          item.landedCostShare, item.effectiveUnitCost, item.orderedUnitCost, item.grnAcceptedQty,
        ]);

        // Stock Increase only if not already received and stocked through Goods Receipt Note (GRN)
        const stockRow = sqliteDb.query(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`, [item.productId, dto.warehouseId])[0] as any;
        if (!alreadyReceivedInGrn) {
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
        }

        // Costing strategy uses effective landed unit cost
        const prevQty = stockRow ? Number(stockRow.quantityM2) : 0;
        const prevCost = Number(sqliteDb.query(`SELECT cost_price FROM products WHERE id = ?`, [item.productId])[0]?.costPrice || 0);
        const grnQuantityAlreadyInStock = alreadyReceivedInGrn
          ? Math.min(prevQty, item.grnAcceptedQty)
          : 0;
        const newCost = method === 'FIFO'
          ? round2(item.effectiveUnitCost)
          : computeWeightedAverageCost(
            prevQty - grnQuantityAlreadyInStock,
            prevCost,
            alreadyReceivedInGrn ? item.grnAcceptedQty : item.quantityM2,
            item.effectiveUnitCost
          );
        sqliteDb.run(`UPDATE products SET cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newCost, item.productId]);

        if (!alreadyReceivedInGrn) {
          const inventoryTransactionId = `tx_${uuidv4().substring(0, 8)}`;
          sqliteDb.run(`
            INSERT INTO inventory_transactions (
              id, transaction_number, type, product_id, warehouse_id,
              quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
              reference_id, notes, performed_by
            ) VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, 'PURCHASE', ?, ?, ?)
          `, [
            inventoryTransactionId, sqliteDb.nextNumber('TX-PUR'),
            item.productId, dto.warehouseId, item.quantityM2, item.boxesCount, item.effectiveUnitCost,
            round2(item.quantityM2 * item.effectiveUnitCost), purchaseId, `شراء توريد سيراميك بموجب فاتورة ${invoiceNumber}`, performedBy,
          ]);
          InventoryCostingService.addLayer(sqliteDb, {
            productId: item.productId, warehouseId: dto.warehouseId,
            sourceTransactionId: inventoryTransactionId, sourceType: 'PURCHASE', sourceId: purchaseId,
            date: today, quantity: item.quantityM2, unitCost: item.effectiveUnitCost,
          });
        }
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
          UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?
        `, [dto.paidAmount, branchRegisterId]);
      }

      if (dto.paidAmount > 0 && dto.paymentType !== 'CREDIT') {
        const paymentId = `spay_${uuidv4().substring(0, 8)}`;
        const receiptNumber = `PAY-${Date.now().toString().slice(-8)}`;
        sqliteDb.run(`
          INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date, register_id, branch_id, notes, performed_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          paymentId,
          receiptNumber,
          dto.supplierId,
          dto.paidAmount,
          dto.paymentType,
          today,
          branchRegisterId,
          branchId,
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
    const invoiceBranchId = invoice.branchId || this.branchAccess.requireWarehouseAccess(invoice.warehouseId, actor);
    const branchId = this.branchAccess.requireRegisterAccess(registerId, actor, invoiceBranchId);

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
        `INSERT INTO supplier_payments (id, receipt_number, supplier_id, amount, payment_type, date, register_id, branch_id, notes, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, receiptNumber, invoice.supplierId, value, paymentType, today, registerId, branchId, notes || `سداد دفعة على فاتورة توريد ${invoice.invoiceNumber}`, actor.id]
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
    const invoiceBranchId = invoice.branchId || this.branchAccess.requireWarehouseAccess(invoice.warehouseId, actor);
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
            const product = db.query<any>(`SELECT product_type, base_unit, custom_unit FROM products WHERE id = ?`, [item.productId])[0];
            const unit = product?.product_type === 'GENERAL'
              ? product.custom_unit || ({ M2: 'م²', LINEAR_METER: 'متر طولي', BOX: 'كرتونة', PIECE: 'قطعة', KG: 'كجم', TON: 'طن', SET: 'طقم' } as Record<string, string>)[product.base_unit] || 'وحدة'
              : 'م²';
            throw new Error(`لا يمكن حذف فاتورة التوريد. الرصيد الحالي للصنف (${currentQuantity} ${unit}) أقل من كمية الفاتورة (${item.quantityM2} ${unit}). تم استخدام جزء من الكمية في مبيعات. استخدم مرتجع بدلاً من الحذف.`);
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
         WHERE supplier_id = ? AND branch_id = ? AND notes LIKE ?`,
        [invoice.supplierId, invoiceBranchId, `%${invoice.invoiceNumber}%`]
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
        const registerId = this.branchAccess.getDefaultRegisterId(invoiceBranchId, actor);
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?`, [invoice.paidAmount, registerId]);
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
