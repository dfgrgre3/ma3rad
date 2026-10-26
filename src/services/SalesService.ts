import { DatabaseManager } from '../database/db';
import type { SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, PaymentType, CustomerPayment } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { paymentAccountCode, postLedgerEntry, reverseLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { SettingsService } from './SettingsService';
import { BatchService } from './BatchService';
import { getProductUnitLabel } from '../utils/productUnits';
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
  orderId?: string;
  projectId?: string;
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

export interface InvoiceFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID';
  invoiceStatus?: 'ALL' | 'COMPLETED' | 'VOID' | 'HOLD' | 'DRAFT';
  customerId?: string;
  warehouseId?: string;
}

export interface InvoiceStats {
  count: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  returnedAmount: number;
  totalCost: number;
  grossProfit: number;
}

export interface ReturnableItem {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  soldM2: number;
  returnedM2: number;
  returnableM2: number;
  unitPrice: number;
  unitCost: number;
  boxesCount: number;
  metersPerBox: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface ReturnStats {
  count: number;
  totalAmount: number;
  cashRefunded: number;
  creditedToBalance: number;
  todayCount: number;
  todayAmount: number;
}

export class SalesService {
  private db = DatabaseManager.getInstance();

  // ─── Invoices ───────────────────────────────────────────────────────────────

  public getAllInvoices(search?: string, dateFrom?: string, dateTo?: string): SalesInvoice[] {
    return this.getInvoicesFiltered({ search, dateFrom, dateTo }, false);
  }

  public getInvoicesFiltered(
    filters: InvoiceFilters = {},
    includeVoid = true
  ): (SalesInvoice & { returnedAmount?: number; itemsCount?: number })[] {
    const { where, params } = this.buildInvoiceWhere(filters, includeVoid);
    return this.db.query<SalesInvoice & { returnedAmount?: number; itemsCount?: number }>(
      `SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
              w.name as warehouseName, u.full_name as createdByName,
              (SELECT COUNT(*) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id) AS itemsCount
       FROM sales_invoices si
       JOIN customers c ON si.customer_id = c.id
       JOIN warehouses w ON si.warehouse_id = w.id
       LEFT JOIN users u ON si.created_by = u.id
       ${where}
       ORDER BY si.created_at DESC`,
      params
    );
  }

  public getStats(filters: InvoiceFilters = {}, includeVoid = true): InvoiceStats {
    const { where, params } = this.buildInvoiceWhere(filters, includeVoid);
    const row = this.db.query<any>(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(si.total_amount), 0) AS totalAmount,
         COALESCE(SUM(si.paid_amount), 0) AS paidAmount,
         COALESCE(SUM(si.remaining_amount), 0) AS remainingAmount,
         COALESCE(SUM(si.returned_amount), 0) AS returnedAmount,
         COALESCE(SUM(si.total_cost), 0) AS totalCost,
         COALESCE(SUM(si.gross_profit), 0) AS grossProfit
       FROM sales_invoices si
       JOIN customers c ON si.customer_id = c.id
       JOIN warehouses w ON si.warehouse_id = w.id
       ${where}`,
      params
    )[0] || {};
    return {
      count: Number(row.count || 0),
      totalAmount: Number(row.totalAmount || 0),
      paidAmount: Number(row.paidAmount || 0),
      remainingAmount: Number(row.remainingAmount || 0),
      returnedAmount: Number(row.returnedAmount || 0),
      totalCost: Number(row.totalCost || 0),
      grossProfit: Number(row.grossProfit || 0),
    };
  }

  public getInvoiceById(id: string): (SalesInvoice & { items: SalesInvoiceItem[] }) | null {
    const invoices = this.db.query<SalesInvoice>(`
      SELECT si.*, c.name as customerName, c.phone as customerPhone, c.address as customerAddress,
             c.current_balance as customerBalance, c.credit_limit as customerCreditLimit,
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
      SELECT sii.*, p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM sales_invoice_items sii
      LEFT JOIN products p ON p.id = sii.product_id
      WHERE sii.invoice_id = ?
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
      const plannedByProduct = new Map<string, number>();
      const plannedFifoByLayer = new Map<string, number>();
      const costingMethod = SettingsService.getSettings().costingMethod;

      for (const item of dto.items) {
        const quantityM2 = round2(Math.max(0, item.quantityM2 || 0));
        if (quantityM2 <= 0) throw new Error('كمية أحد الأصناف في الفاتورة غير صحيحة.');
        const prod = sqliteDb.query(`SELECT * FROM products WHERE id = ? AND is_active = 1`, [item.productId])[0] as any;
        if (!prod) throw new Error(`المنتج ذو المعرف ${item.productId} غير موجود أو غير نشط.`);
        const isGeneralProduct = prod.product_type === 'GENERAL';
        const unitLabel = isGeneralProduct
          ? (prod.custom_unit || ({
              M2: 'م²', LINEAR_METER: 'متر طولي', BOX: 'كرتونة', PIECE: 'قطعة',
              KG: 'كجم', TON: 'طن', SET: 'طقم',
            } as Record<string, string>)[prod.base_unit] || 'وحدة')
          : 'م²';

        if (item.unitPrice !== Number(prod.sellingPriceM2) && !PermissionService.can(actor, 'sales.approve')) {
          throw new Error(`لا تملك صلاحية تعديل سعر الصنف «${prod.name}».`);
        }

        // Margin / price protection (brief §132): selling below the minimum allowed price needs approval.
        if (item.unitPrice < (prod.minSellingPriceM2 || 0)) {
          PermissionService.require(actor, 'sales.approve');
        }

        const stockRow = sqliteDb.query(
          `SELECT quantity_m2, reserved_m2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
          [item.productId, dto.warehouseId]
        )[0] as any;
        const availableM2 = (stockRow ? Number(stockRow.quantityM2) : 0) - Number(stockRow?.reservedM2 || 0);
        const alreadyPlanned = plannedByProduct.get(item.productId) || 0;
        if (availableM2 - alreadyPlanned < quantityM2) {
          throw new Error(
            `الرصيد المتاح من الصنف (${prod.name}) غير كافٍ. المتاح: ${round2(availableM2 - alreadyPlanned)} ${unitLabel}، المطلوب: ${quantityM2} ${unitLabel}`
          );
        }
        plannedByProduct.set(item.productId, alreadyPlanned + quantityM2);

        const fifoPlan = costingMethod === 'FIFO'
          ? InventoryCostingService.planFifo(sqliteDb, item.productId, dto.warehouseId, quantityM2, plannedFifoByLayer)
          : null;
        for (const allocation of fifoPlan?.allocations || []) {
          plannedFifoByLayer.set(allocation.layerId, round2((plannedFifoByLayer.get(allocation.layerId) || 0) + allocation.quantity));
        }
        const line = computeSaleLine({
          quantity: quantityM2,
          unitPrice: item.unitPrice,
          unitCost: fifoPlan ? fifoPlan.totalCost / quantityM2 : (item.unitCost ?? prod.costPrice ?? 0),
          discountAmount: item.discountAmount || 0,
        });
        totalLineDiscount += line.lineDiscount;

        const metersPerBox = Number(prod.metersPerBox) || 1.44;
        const piecesPerBox = Number(prod.piecesPerBox) || 4;
        const boxesCount = isGeneralProduct
          ? prod.base_unit === 'BOX' ? quantityM2 : 0
          : item.boxesCount !== undefined && item.boxesCount !== null
            ? round2(Math.max(0, item.boxesCount))
            : round2(quantityM2 / metersPerBox);

        preparedItems.push({
          id: `item_${uuidv4().substring(0, 8)}`,
          invoiceId: '',
          productId: prod.id,
          productName: prod.name,
          productSku: prod.sku,
          productGrade: prod.grade,
          size: prod.size,
          soldBy: item.soldBy,
          quantityM2,
          boxesCount,
          piecesCount: isGeneralProduct
            ? prod.base_unit === 'PIECE' ? quantityM2 : 0
            : item.piecesCount || Math.round(boxesCount * piecesPerBox),
          unitPrice: item.unitPrice,
          originalUnitPrice: prod.sellingPriceM2,
          unitCost: line.lineCost / (quantityM2 || 1),
          discountAmount: line.lineDiscount,
          totalPrice: line.lineTotal,
          totalCost: line.lineCost,
          profit: line.lineProfit,
          fifoPlan,
          metersPerBox,
          piecesPerBox,
          productType: prod.product_type,
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

      if (totals.remainingAmount > 0 && !PermissionService.can(actor, 'sales.credit')) {
        throw new Error('لا تملك صلاحية البيع الآجل أو تسجيل مبلغ متبقٍ على العميل.');
      }

      // Credit-limit guard: extensions beyond the customer's limit need approval.
      if (totals.remainingAmount > 0) {
        const customer = sqliteDb.query<any>(
          `SELECT name, credit_limit, current_balance FROM customers WHERE id = ?`,
          [dto.customerId]
        )[0];
        if (!customer) throw new Error('العميل المحدد غير موجود.');
        const limit = Number(customer.creditLimit || 0);
        const projected = round2(Number(customer.currentBalance || 0) + totals.remainingAmount);
        if (limit > 0 && projected > limit && !PermissionService.can(actor, 'sales.approve')) {
          throw new Error(
            `تجاوز حد الائتمان للعميل "${customer.name}". الرصيد الحالي ${customer.currentBalance} + الآجل ${totals.remainingAmount} يتجاوز الحد ${limit}.`
          );
        }
      }

      const invoiceId = `inv_${uuidv4().substring(0, 8)}`;
      const invoiceNumber = sqliteDb.nextNumber('INV');
      const today = localDateString();
      const termsDays = Number(sqliteDb.query<{ paymentTermsDays: number }>('SELECT payment_terms_days AS paymentTermsDays FROM customers WHERE id=?',[dto.customerId])[0]?.paymentTermsDays || 0);
      let dueDate: string | null = null;
      if (totals.remainingAmount > 0 && termsDays > 0) { const due = new Date(`${today}T00:00:00`); due.setDate(due.getDate()+termsDays); dueDate=localDateString(due); }

      sqliteDb.run(`
        INSERT INTO sales_invoices (
          id, invoice_number, date, due_date, customer_id, warehouse_id, shift_id, order_id, project_id,
          subtotal, discount_percentage, discount_amount, tax_percentage, tax_amount,
          shipping_cost, total_amount, paid_amount, remaining_amount, payment_type,
          payment_status, invoice_status, total_cost, gross_profit, returned_amount, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, 0, ?, ?)
      `, [
        invoiceId, invoiceNumber, today, dueDate, dto.customerId, dto.warehouseId, dto.shiftId || null,
        dto.orderId || null, dto.projectId || null,
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

        const stockUpdate = sqliteDb.query<{ id: string }>(
          `SELECT id FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
          [item.productId, dto.warehouseId]
        )[0];
        if (!stockUpdate) {
          throw new Error(`لا يوجد رصيد مخزني مسجل للصنف "${item.productName}" في المخزن المحدد.`);
        }
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
        if (costingMethod === 'FIFO') InventoryCostingService.consumeFifo(sqliteDb, txId, item.fifoPlan);

        // ── Batch FIFO deduction (runs only if batches are tracked for this product) ──
        try {
          if (item.productType !== 'GENERAL') new BatchService().deductFromBatches(item.productId, dto.warehouseId, item.quantityM2);
        } catch {
          // Batch tracking is optional — if table is missing or empty, silently skip.
        }
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

      const ledgerLines = [
        ...(totals.paidAmount > 0 ? [{
          accountCode: paymentAccountCode(dto.paymentType),
          debit: totals.paidAmount,
          credit: 0,
        }] : []),
        ...(totals.remainingAmount > 0 ? [{
          accountCode: '1103',
          debit: totals.remainingAmount,
          credit: 0,
        }] : []),
        {
          accountCode: '4101',
          debit: 0,
          credit: round2(totals.subtotal - totals.discountAmount),
        },
        ...(totals.shippingCost > 0 ? [{
          accountCode: '4102',
          debit: 0,
          credit: totals.shippingCost,
        }] : []),
        ...(totals.taxAmount > 0 ? [{
          accountCode: '2102',
          debit: 0,
          credit: totals.taxAmount,
        }] : []),
        ...(totals.totalCost > 0 ? [
          { accountCode: '5101', debit: totals.totalCost, credit: 0 },
          { accountCode: '1104', debit: 0, credit: totals.totalCost },
        ] : []),
      ];
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description: `Sale ${invoiceNumber}`,
        referenceType: 'SALES_INVOICE',
        referenceId: invoiceId,
        createdBy: actor.id,
        lines: ledgerLines,
      });

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'إصدار فاتورة مبيعات', 'SALES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({ invoiceNumber, totalAmount: totals.totalAmount, paidAmount: totals.paidAmount })]);

      return this.getInvoiceById(invoiceId)!;
    });
  }

  /** Collect a payment against an unpaid/partially-paid invoice (brief §68/§220). */
  public recordInvoicePayment(
    invoiceId: string,
    amount: number,
    paymentType: PaymentType = 'CASH',
    registerId?: string,
    shiftId?: string,
    notes = ''
  ): CustomerPayment {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');
    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    if (invoice.invoiceStatus === 'VOID') throw new Error('لا يمكن التحصيل على فاتورة ملغاة.');
    if (invoice.remainingAmount <= 0) throw new Error('الفاتورة مسددة بالكامل بالفعل.');

    const value = round2(Math.min(Math.max(0, amount || 0), invoice.remainingAmount));
    if (value <= 0) throw new Error('يجب أن يكون مبلغ التحصيل أكبر من الصفر.');

    const today = localDateString();
    const paymentId = `cpay_${uuidv4().substring(0, 8)}`;

    return this.db.executeTransaction((db) => {
      const receiptNumber = db.nextNumber('REC');
      const newPaid = round2(invoice.paidAmount + value);
      const newRemaining = round2(Math.max(0, invoice.remainingAmount - value));
      const status = newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
      const register = registerId || 'cr_main';

      db.run(
        `INSERT INTO customer_payments (
           id, receipt_number, customer_id, invoice_id, amount, payment_type, date,
           register_id, shift_id, notes, performed_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId, receiptNumber, invoice.customerId, invoiceId, value, paymentType, today,
          register, shiftId || null,
          notes || `تحصيل دفعة على الفاتورة ${invoice.invoiceNumber}`,
          actor.id,
        ]
      );
      db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
        [`cpa_${uuidv4().substring(0, 8)}`, paymentId, invoiceId, value]);

      db.run(
        `UPDATE customers SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, invoice.customerId]
      );

      db.run(
        `UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newPaid, newRemaining, status, invoiceId]
      );

      if (paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?`, [value, register]);
      }
      postLedgerEntry(db.getDatabase(), {
        date: today,
        description: `Customer receipt ${receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: paymentId,
        createdBy: actor.id,
        lines: [
          { accountCode: paymentAccountCode(paymentType), debit: value, credit: 0 },
          { accountCode: '1103', debit: 0, credit: value },
        ],
      });
      if (shiftId) {
        db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments + ? WHERE id = ?`, [value, shiftId]);
      }

      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, 'تحصيل دفعة على فاتورة', 'SALES', ?, ?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({
          receiptNumber, invoiceNumber: invoice.invoiceNumber, amount: value, paymentType,
        })]
      );

      return {
        id: paymentId,
        receiptNumber,
        customerId: invoice.customerId,
        amount: value,
        paymentType,
        date: today,
        registerId: register,
        shiftId,
        notes,
        performedBy: actor.id,
        createdAt: new Date().toISOString(),
      };
    });
  }

  /** Record one receipt allocated across several open invoices in one transaction. */
  public recordCustomerPaymentAllocations(
    customerId: string,
    allocations: Array<{ invoiceId: string; amount: number }>,
    paymentType: PaymentType = 'CASH',
    registerId = 'cr_main',
    date = localDateString(),
    reference = '',
    notes = '',
    shiftId?: string,
    idempotencyKey?: string,
  ): { groupId: string; total: number; receipts: string[] } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('تاريخ الدفعة غير صحيح.');
    const entries = allocations.filter((a) => Number(a.amount) > 0);
    if (!entries.length || new Set(entries.map((a) => a.invoiceId)).size !== entries.length) throw new Error('حدد فواتير ومبالغ صحيحة دون تكرار.');
    const groupId = idempotencyKey || `cpgrp_${uuidv4().slice(0, 10)}`;
    return this.db.executeTransaction((db) => {
      const prior = db.query<{ receiptNumber: string; amount: number }>(`SELECT receipt_number AS receiptNumber,amount FROM customer_payments WHERE payment_group_id=? ORDER BY created_at`,[groupId]);
      if (prior.length) return { groupId, total: round2(prior.reduce((sum,row)=>sum+Number(row.amount),0)), receipts: prior.map(row=>row.receiptNumber) };
      const customer = db.query<{ id: string }>('SELECT id FROM customers WHERE id=?', [customerId])[0];
      if (!customer) throw new Error('العميل غير موجود.');
      const receipts: string[] = [];
      let total = 0;
      for (const allocation of entries) {
        const invoice = db.query<any>(`SELECT id,invoice_number AS invoiceNumber,customer_id AS customerId,paid_amount AS paidAmount,remaining_amount AS remainingAmount,invoice_status AS invoiceStatus FROM sales_invoices WHERE id=?`, [allocation.invoiceId])[0];
        const amount = round2(Number(allocation.amount));
        if (!invoice || invoice.customerId !== customerId || invoice.invoiceStatus === 'VOID') throw new Error('إحدى الفواتير المحددة غير صالحة لهذا العميل.');
        if (amount <= 0 || amount > Number(invoice.remainingAmount) + 0.009) throw new Error(`المبلغ يتجاوز المتبقي في الفاتورة ${invoice.invoiceNumber}.`);
        const receiptNumber = db.nextNumber('REC');
        const newPaid = round2(Number(invoice.paidAmount) + amount);
        const remaining = round2(Math.max(0, Number(invoice.remainingAmount) - amount));
        const paymentNotes = [reference ? `مرجع: ${reference}` : '', notes, `دفعة مجمعة ${groupId}`].filter(Boolean).join(' | ');
        const paymentId = `cpay_${uuidv4().slice(0, 8)}`;
        db.run(`INSERT INTO customer_payments (id,receipt_number,customer_id,invoice_id,amount,payment_group_id,payment_type,date,register_id,shift_id,notes,performed_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [paymentId, receiptNumber, customerId, allocation.invoiceId, amount, groupId, paymentType, date, registerId, shiftId || null, paymentNotes, actor.id]);
        db.run(`INSERT INTO customer_payment_allocations (id,payment_id,sales_invoice_id,amount) VALUES (?,?,?,?)`,
          [`cpa_${uuidv4().substring(0, 8)}`, paymentId, allocation.invoiceId, amount]);
        db.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [newPaid, remaining, remaining <= 0 ? 'PAID' : 'PARTIAL', allocation.invoiceId]);
        receipts.push(receiptNumber); total = round2(total + amount);
      }
      db.run(`UPDATE customers SET current_balance=current_balance-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [total, customerId]);
      if (paymentType === 'CASH') db.run(`UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?`, [total, registerId]);
      postLedgerEntry(db.getDatabase(), {
        date,
        description: `Customer receipt group ${groupId}`,
        referenceType: 'CUSTOMER_PAYMENT_GROUP',
        referenceId: groupId,
        createdBy: actor.id,
        lines: [
          { accountCode: paymentAccountCode(paymentType), debit: total, credit: 0 },
          { accountCode: '1103', debit: 0, credit: total },
        ],
      });
      if (shiftId) db.run(`UPDATE cash_shifts SET total_customer_payments=total_customer_payments+? WHERE id=?`, [total, shiftId]);
      db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
        [`aud_${uuidv4().slice(0, 8)}`, actor.id, actor.fullName, 'تحصيل دفعة موزعة على فواتير', 'SALES', groupId, JSON.stringify({ customerId, allocations: entries, total, date, reference, receipts })]);
      return { groupId, total, receipts };
    });
  }

  public getInvoicePayments(invoiceId: string): CustomerPayment[] {
    return this.db.query<CustomerPayment>(
      `SELECT * FROM customer_payments WHERE invoice_id = ? ORDER BY created_at ASC`,
      [invoiceId]
    );
  }

  public deleteInvoicePayment(paymentId: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'customers.payment');
    const payment = this.db.query<any>(
      `SELECT id, receipt_number, invoice_id, customer_id, amount, payment_type, register_id, shift_id, payment_group_id
       FROM customer_payments WHERE id = ?`,
      [paymentId]
    )[0];
    if (!payment) throw new Error('سند القبض غير موجود.');
    if (payment.paymentGroupId) {
      const group = this.db.query<any>(`SELECT * FROM customer_payments WHERE payment_group_id=?`, [payment.paymentGroupId]);
      for (const row of group) {
        const protectedPayment = this.db.query<any>('SELECT COUNT(*) AS count FROM installments WHERE payment_id=?', [row.id])[0]?.count || 0;
        const linkedPlan = this.db.query<any>(`SELECT COUNT(*) AS count FROM installment_plans WHERE invoice_id=? AND status!='CANCELLED'`, [row.invoiceId])[0]?.count || 0;
        if (protectedPayment || linkedPlan) throw new Error('This receipt belongs to an installment plan. Reverse the plan payment from the installments screen.');
      }
      this.db.executeTransaction((db) => {
        const groupEntry = db.getDatabase().exec(`SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT_GROUP' AND reference_id=?`, [payment.paymentGroupId])[0]?.values[0]?.[0];
        if (groupEntry) reverseLedgerEntry(db.getDatabase(), String(groupEntry), {
          date: localDateString(), description: `Reverse customer receipt group ${payment.paymentGroupId}`,
          referenceType: 'CUSTOMER_PAYMENT_GROUP_VOID', referenceId: `${payment.paymentGroupId}:${uuidv4()}`, createdBy: actor.id,
        });
        for (const row of group) {
          const paymentEntry = db.getDatabase().exec(`SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`, [row.id])[0]?.values[0]?.[0];
          if (paymentEntry) reverseLedgerEntry(db.getDatabase(), String(paymentEntry), {
            date: localDateString(), description: `Reverse customer receipt ${row.receiptNumber}`,
            referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${row.id}:${uuidv4()}`, createdBy: actor.id,
          });
          const invoice = db.query<any>(`SELECT id,customer_id,paid_amount,total_amount,remaining_amount,invoice_status FROM sales_invoices WHERE id=?`, [row.invoiceId])[0];
          if (!invoice || invoice.invoiceStatus === 'VOID') throw new Error('تعذر عكس الدفعة المرتبطة بفاتورة غير متاحة.');
          const value = round2(row.amount); const paid = round2(Math.max(0, invoice.paidAmount - value)); const remaining = round2(Math.min(invoice.totalAmount, invoice.remainingAmount + value));
          db.run(`UPDATE sales_invoices SET paid_amount=?,remaining_amount=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [paid, remaining, remaining <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID', invoice.id]);
          db.run(`UPDATE customers SET current_balance=current_balance+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [value, invoice.customerId]);
          if (row.paymentType === 'CASH') db.run(`UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?`, [value, row.registerId || 'cr_main']);
          if (row.shiftId) db.run(`UPDATE cash_shifts SET total_customer_payments=total_customer_payments-? WHERE id=?`, [value, row.shiftId]);
        }
        db.run(`DELETE FROM customer_payments WHERE payment_group_id=?`, [payment.paymentGroupId]);
        db.run(`INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,old_values) VALUES (?,?,?,?,?,?,?)`,
          [`aud_${uuidv4().slice(0, 8)}`, actor.id, actor.fullName, 'عكس دفعة موزعة على فواتير', 'SALES', payment.paymentGroupId, JSON.stringify(group.map(row => ({ receiptNumber: row.receiptNumber, invoiceId: row.invoiceId, amount: row.amount })))]);
      });
      return;
    }
    if (!payment.invoiceId) throw new Error('هذا السند غير مرتبط بفاتورة بيع. احذفه من كشف حساب العميل.');
    const protectedPayment = this.db.query<any>('SELECT COUNT(*) AS count FROM installments WHERE payment_id=?', [paymentId])[0]?.count || 0;
    const linkedPlan = this.db.query<any>(`SELECT COUNT(*) AS count FROM installment_plans WHERE invoice_id=? AND status!='CANCELLED'`, [payment.invoiceId])[0]?.count || 0;
    if (protectedPayment || linkedPlan) throw new Error('This receipt belongs to an installment plan. Reverse the plan payment from the installments screen.');
    const invoice = this.getInvoiceById(payment.invoiceId);
    if (!invoice) throw new Error('فاتورة البيع غير موجودة.');
    if (invoice.invoiceStatus === 'VOID') throw new Error('لا يمكن حذف دفعة من فاتورة ملغاة.');

    const amount = round2(payment.amount);
    const newPaid = round2(Math.max(0, invoice.paidAmount - amount));
    const newRemaining = round2(Math.min(invoice.totalAmount, invoice.remainingAmount + amount));
    const status = newRemaining <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

    this.db.executeTransaction((db) => {
      const paymentEntry = db.getDatabase().exec(`SELECT id FROM journal_entries WHERE reference_type='CUSTOMER_PAYMENT' AND reference_id=?`, [paymentId])[0]?.values[0]?.[0];
      if (paymentEntry) reverseLedgerEntry(db.getDatabase(), String(paymentEntry), {
        date: localDateString(), description: `Reverse customer receipt ${payment.receiptNumber}`,
        referenceType: 'CUSTOMER_PAYMENT_VOID', referenceId: `${paymentId}:${uuidv4()}`, createdBy: actor.id,
      });
      db.run(
        `UPDATE sales_invoices SET paid_amount = ?, remaining_amount = ?, payment_status = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newPaid, newRemaining, status, invoice.id]
      );
      db.run(
        `UPDATE customers SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [amount, invoice.customerId]
      );
      if (payment.paymentType === 'CASH') {
        db.run(`UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`, [amount, payment.registerId || 'cr_main']);
      }
      if (payment.shiftId) {
        db.run(`UPDATE cash_shifts SET total_customer_payments = total_customer_payments - ? WHERE id = ?`, [amount, payment.shiftId]);
      }
      db.run('DELETE FROM customer_payments WHERE id = ?', [paymentId]);
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
         VALUES (?, ?, ?, 'حذف سند تحصيل', 'SALES', ?, ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoice.id,
          JSON.stringify({ receiptNumber: payment.receiptNumber, amount }),
          JSON.stringify({ invoiceNumber: invoice.invoiceNumber }),
        ]
      );
    });
  }

  // ─── Returns ────────────────────────────────────────────────────────────────

  public returnSale(
    invoiceId: string,
    returnItems: { productId: string; quantityM2: number; boxesCount: number; unitPrice: number; unitCost: number; reason: string }[],
    refundCash = true,
    performedBy = 'usr_admin',
    options: {
      registerId?: string;
      shiftId?: string;
      refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
    } = {}
  ): SalesReturn {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.refund');
    const inv = this.getInvoiceById(invoiceId);
    if (!inv) throw new Error('الفاتورة الأصلية غير موجودة.');
    if (inv.invoiceStatus === 'VOID') throw new Error('لا يمكن مرتجعة فاتورة ملغاة.');
    if (!returnItems || returnItems.length === 0) throw new Error('حدد بنداً واحداً على الأقل للإرجاع.');

    // Validate returned quantity per product never exceeds what was originally sold (brief §68).
    for (const rit of returnItems) {
      if (rit.quantityM2 <= 0) throw new Error('كمية الإرجاع يجب أن تكون أكبر من صفر.');
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
        const line = inv.items.find((item) => item.productId === rit.productId);
        const unitLabel = line ? getProductUnitLabel(line) : 'وحدة';
        throw new Error(`لا يمكن إرجاع كمية أكبر من المباعة للصنف (المباع: ${sold} ${unitLabel}، المُرجع سابقاً: ${alreadyReturned} ${unitLabel}).`);
      }
    }

    const returnId = `ret_${uuidv4().substring(0, 8)}`;
    const today = localDateString();

    return this.db.executeTransaction((sqliteDb) => {
      const returnNumber = sqliteDb.nextNumber('RET');
      const totalReturnAmount = round2(returnItems.reduce(
        (sum, item) => sum + round2(item.quantityM2 * item.unitPrice),
        0
      ));
      const refundMethod = options.refundMethod || 'CASH';
      const effectiveRefundCash = refundMethod === 'BALANCE' ? false : refundCash;
      const impact = computeReturnImpact({
        invoiceTotal: inv.totalAmount,
        invoicePaid: inv.paidAmount,
        returnTotal: totalReturnAmount,
        refundCash: effectiveRefundCash,
      });

      sqliteDb.run(`
        INSERT INTO sales_returns (
          id, return_number, original_invoice_id, original_invoice_number, customer_id,
          warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason,
          register_id, shift_id, refund_method, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        returnId, returnNumber, inv.id, inv.invoiceNumber, inv.customerId,
        inv.warehouseId, today, totalReturnAmount, impact.cashRefund, impact.balanceDelta,
        returnItems[0]?.reason || 'مرتجع سيراميك',
        options.registerId || (impact.cashRefund > 0 && refundMethod === 'CASH' ? 'cr_main' : null),
        options.shiftId || null, refundMethod, actor.id,
      ]);

      let fifoReturnedCost = 0;
      const fifoEnabled = SettingsService.getSettings().costingMethod === 'FIFO';
      for (const item of returnItems) {
        const lineTotal = round2(item.quantityM2 * item.unitPrice);

        const product = sqliteDb.query<any>(
          `SELECT name, grade, meters_per_box, pieces_per_box, size, product_type, base_unit FROM products WHERE id = ?`,
          [item.productId]
        )[0];
        if (!product) throw new Error(`الصنف ${item.productId} غير موجود.`);
        const metersPerBox = Number(product.meters_per_box) || 1.44;
        const boxesCount = product.product_type === 'GENERAL'
          ? product.base_unit === 'BOX' ? round2(item.quantityM2) : 0
          : item.boxesCount > 0 ? round2(item.boxesCount) : round2(item.quantityM2 / metersPerBox);
        let unitCost = item.unitCost > 0 ? item.unitCost : 0;
        if (fifoEnabled) {
          const actualCost = InventoryCostingService.restoreInvoiceIssue(sqliteDb, invoiceId, item.productId, item.quantityM2);
          unitCost = round2(actualCost / item.quantityM2);
          fifoReturnedCost = round2(fifoReturnedCost + actualCost);
        }

        sqliteDb.run(`
          INSERT INTO sales_return_items (
            id, return_id, product_id, product_name, grade, quantity_m2, boxes_count, unit_price, unit_cost, total_refund
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `ritem_${uuidv4().substring(0, 8)}`, returnId, item.productId, product.name, product.grade,
          item.quantityM2, boxesCount, item.unitPrice, unitCost, lineTotal,
        ]);

        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, inv.warehouseId]);

        const returnTransactionId = `tx_${uuidv4().substring(0, 8)}`;
        sqliteDb.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id,
            quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
            reference_id, notes, performed_by
          ) VALUES (?, ?, 'SALES_RETURN', ?, ?, ?, ?, ?, ?, 'INVOICE', ?, ?, ?)
        `, [
          returnTransactionId, sqliteDb.nextNumber('TX-RET'),
          item.productId, inv.warehouseId, item.quantityM2, boxesCount, unitCost,
          round2(item.quantityM2 * unitCost), returnId,
          `مرتجع مبيعات للفاتورة ${inv.invoiceNumber}`, actor.id
        ]);
      }

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
        if (refundMethod === 'CASH') {
          sqliteDb.run(
            `UPDATE cash_registers SET current_balance = current_balance - ? WHERE id = ?`,
            [impact.cashRefund, options.registerId || 'cr_main']
          );
        }
      }
      const returnedCost = fifoEnabled ? fifoReturnedCost : round2(returnItems.reduce(
        (sum, item) => sum + Number(item.quantityM2) * Number(item.unitCost || 0),
        0
      ));
      const taxReduction = inv.totalAmount > 0
        ? round2(totalReturnAmount * Number(inv.taxAmount || 0) / inv.totalAmount)
        : 0;
      const refundAccount = impact.cashRefund > 0 ? paymentAccountCode(refundMethod) : undefined;
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: today,
        description: `Sales return ${returnNumber}`,
        referenceType: 'SALES_RETURN',
        referenceId: returnId,
        createdBy: actor.id,
        lines: [
          { accountCode: '4101', debit: round2(totalReturnAmount - taxReduction), credit: 0 },
          ...(taxReduction > 0 ? [{ accountCode: '2102', debit: taxReduction, credit: 0 }] : []),
          ...(impact.balanceDelta > 0 ? [{ accountCode: '1103', debit: 0, credit: impact.balanceDelta }] : []),
          ...(refundAccount ? [{ accountCode: refundAccount, debit: 0, credit: impact.cashRefund }] : []),
          ...(returnedCost > 0 ? [
            { accountCode: '1104', debit: returnedCost, credit: 0 },
            { accountCode: '5101', debit: 0, credit: returnedCost },
          ] : []),
        ],
      });
      if (options.shiftId) {
        sqliteDb.run(
          `UPDATE cash_shifts SET total_refunds = total_refunds + ? WHERE id = ?`,
          [impact.cashRefund, options.shiftId]
        );
      }

      sqliteDb.run(
        `UPDATE sales_invoices SET returned_amount = COALESCE(returned_amount, 0) + ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [totalReturnAmount, invoiceId]
      );

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'مرتجع مبيعات', 'SALES', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, returnId, JSON.stringify({
        returnNumber, totalReturnAmount, cashRefund: impact.cashRefund, invoiceNumber: inv.invoiceNumber,
      })]);

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
        refundMethod,
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
    if (!inv) throw new Error('الفاتورة غير موجودة.');
    const returnsCount = this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM sales_returns WHERE original_invoice_id = ?',
      [invoiceId]
    )[0]?.count ?? 0;
    if (returnsCount > 0) {
      throw new Error('لا يمكن إلغاء فاتورة لها مرتجعات مسجلة. سجّل مرتجعاً للكميات المتبقية بدلاً من ذلك.');
    }
    if (inv.invoiceStatus === 'VOID') throw new Error('الفاتورة ملغاة بالفعل.');
    if (!reason || !reason.trim()) throw new Error('يرجى إدخال سبب إلغاء الفاتورة.');

    return this.db.executeTransaction((sqliteDb) => {
      const linkedPayments = sqliteDb.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM customer_payments WHERE invoice_id = ?',
        [invoiceId]
      )[0]?.count ?? 0;
      const linkedPlan = sqliteDb.query<any>(`SELECT COUNT(*) AS count FROM installment_plans WHERE invoice_id=? AND status!='CANCELLED'`, [invoiceId])[0]?.count || 0;
      if (linkedPlan) throw new Error('Cancel the linked installment plan before voiding this invoice.');
      if (linkedPayments > 0) {
        throw new Error('لا يمكن إلغاء فاتورة عليها سندات قبض. اعكس سندات القبض أولاً أو سجّل مرتجعاً.');
      }

      for (const item of inv.items) {
        if (SettingsService.getSettings().costingMethod === 'FIFO') {
          const issue = sqliteDb.query<any>(`SELECT id FROM inventory_transactions
            WHERE reference_type='INVOICE' AND reference_id=? AND product_id=? AND type='SALE'
            ORDER BY created_at,id LIMIT 1`, [invoiceId, item.productId])[0];
          if (!issue) throw new Error('The original FIFO sale issue is missing; reconcile the invoice before voiding it.');
          InventoryCostingService.restoreIssue(sqliteDb, issue.id);
        }
        sqliteDb.run(`
          UPDATE warehouse_stock
          SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, inv.warehouseId]);

        // ── Restore batch quantities (LIFO — add back to most recent batch) ────
        try {
          new BatchService().restoreToBatches(item.productId, inv.warehouseId, item.quantityM2);
        } catch {
          // Batch tracking is optional — skip silently.
        }

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

      const invoiceCost = round2(inv.items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));
      postLedgerEntry(sqliteDb.getDatabase(), {
        date: localDateString(),
        description: `Void sale ${inv.invoiceNumber}`,
        referenceType: 'SALES_VOID',
        referenceId: invoiceId,
        createdBy: actor.id,
        lines: [
          { accountCode: '4101', debit: round2(inv.subtotal - inv.discountAmount), credit: 0 },
          ...(inv.shippingCost > 0 ? [{ accountCode: '4102', debit: inv.shippingCost, credit: 0 }] : []),
          ...(inv.taxAmount > 0 ? [{ accountCode: '2102', debit: inv.taxAmount, credit: 0 }] : []),
          ...(inv.paidAmount > 0 ? [{
            accountCode: paymentAccountCode(inv.paymentType),
            debit: 0,
            credit: inv.paidAmount,
          }] : []),
          ...(inv.remainingAmount > 0 ? [{ accountCode: '1103', debit: 0, credit: inv.remainingAmount }] : []),
          ...(invoiceCost > 0 ? [
            { accountCode: '1104', debit: invoiceCost, credit: 0 },
            { accountCode: '5101', debit: 0, credit: invoiceCost },
          ] : []),
        ],
      });

      sqliteDb.run(`UPDATE sales_invoices SET invoice_status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [invoiceId]);

      sqliteDb.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
        VALUES (?, ?, ?, 'إلغاء فاتورة مبيعات', 'SALES', ?, ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, invoiceId, JSON.stringify({ invoiceNumber: inv.invoiceNumber }), JSON.stringify({ reason })]);

      return this.getInvoiceById(invoiceId)!;
    });
  }

  public getReturns(search = '', dateFrom?: string, dateTo?: string): (SalesReturn & { customerName: string; invoiceNumber: string })[] {
    let sql = `
      SELECT sr.*, c.name as customerName, sr.original_invoice_number as invoiceNumber
      FROM sales_returns sr
      JOIN customers c ON c.id = sr.customer_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (sr.return_number LIKE ? OR c.name LIKE ? OR sr.original_invoice_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    if (dateFrom) {
      sql += ` AND sr.date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND sr.date <= ?`;
      params.push(dateTo);
    }
    sql += ` ORDER BY sr.date DESC, sr.created_at DESC`;
    return this.db.query(sql, params);
  }

  public getReturnById(id: string): (SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string }) | null {
    const rows = this.db.query<SalesReturn & { customerName: string; invoiceNumber: string }>(
      `SELECT sr.*, c.name as customerName, sr.original_invoice_number as invoiceNumber
       FROM sales_returns sr
       JOIN customers c ON c.id = sr.customer_id
       WHERE sr.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return { ...rows[0], items: this.getReturnItems(id) };
  }

  public getReturnsStats(): ReturnStats {
    const today = localDateString();
    const row = this.db.query<any>(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(total_amount), 0) AS totalAmount,
              COALESCE(SUM(refunded_amount), 0) AS cashRefunded,
              COALESCE(SUM(remaining_to_balance), 0) AS creditedToBalance,
              COALESCE(SUM(CASE WHEN date = ? THEN 1 ELSE 0 END), 0) AS todayCount,
              COALESCE(SUM(CASE WHEN date = ? THEN total_amount ELSE 0 END), 0) AS todayAmount
       FROM sales_returns`,
      [today, today]
    )[0] || {};
    return {
      count: Number(row.count || 0),
      totalAmount: Number(row.totalAmount || 0),
      cashRefunded: Number(row.cashRefunded || 0),
      creditedToBalance: Number(row.creditedToBalance || 0),
      todayCount: Number(row.todayCount || 0),
      todayAmount: Number(row.todayAmount || 0),
    };
  }

  public getTopReturnReasons(limit = 5): { reason: string; count: number; amount: number }[] {
    return this.db.query<any>(
      `SELECT reason, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount
       FROM sales_returns
       GROUP BY reason
       ORDER BY count DESC, amount DESC
       LIMIT ?`,
      [Math.max(1, Math.min(20, limit))]
    ).map((row) => ({
      reason: row.reason || 'غير محدد',
      count: Number(row.count || 0),
      amount: Number(row.amount || 0),
    }));
  }

  public getReturnItems(returnId: string): SalesReturnItem[] {
    return this.db.query<SalesReturnItem>(
      `SELECT sri.*, COALESCE(p.product_type, 'CERAMIC') AS productType,
              p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM sales_return_items sri
       LEFT JOIN products p ON p.id = sri.product_id
       WHERE sri.return_id = ?`,
      [returnId]
    );
  }

  /** Remaining returnable quantity per product for an invoice, after prior returns. */
  public getReturnableItems(invoiceId: string): ReturnableItem[] {
    const rows = this.db.query<any>(
      `SELECT sii.product_id, sii.product_name, sii.product_grade, sii.size, sii.quantity_m2,
              sii.unit_price, sii.unit_cost, sii.boxes_count, sii.meters_per_box,
              p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM sales_invoice_items sii
       LEFT JOIN products p ON p.id = sii.product_id
       WHERE sii.invoice_id = ?`,
      [invoiceId]
    );
    const returned = new Map<string, number>();
    for (const r of this.db.query<any>(
      `SELECT sri.product_id, COALESCE(SUM(sri.quantity_m2), 0) AS qty
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       WHERE sr.original_invoice_id = ?
       GROUP BY sri.product_id`,
      [invoiceId]
    )) {
      returned.set(r.productId, Number(r.qty || 0));
    }
    const map = new Map<string, ReturnableItem>();
    for (const r of rows) {
      const existing = map.get(r.productId);
      if (existing) {
        existing.soldM2 = round2(existing.soldM2 + Number(r.quantity_m2 || 0));
        existing.boxesCount = round2(existing.boxesCount + Number(r.boxes_count || 0));
      } else {
        map.set(r.productId, {
          productId: r.productId,
          productName: r.productName,
          grade: r.productGrade,
          size: r.size,
          soldM2: round2(Number(r.quantity_m2 || 0)),
          returnedM2: 0,
          returnableM2: 0,
          unitPrice: Number(r.unitPrice || 0),
          unitCost: Number(r.unitCost || 0),
          boxesCount: Number(r.boxesCount || 0),
          metersPerBox: Number(r.metersPerBox) || 1.44,
          productType: r.productType,
          baseUnit: r.baseUnit,
          customUnit: r.customUnit,
        });
      }
    }
    return Array.from(map.values()).map((item) => {
      const returnedM2 = round2(returned.get(item.productId) || 0);
      return {
        ...item,
        returnedM2,
        returnableM2: round2(Math.max(0, item.soldM2 - returnedM2)),
      };
    });
  }

  private buildInvoiceWhere(filters: InvoiceFilters, includeVoid: boolean): { where: string; params: any[] } {
    let where = 'WHERE 1 = 1';
    const params: any[] = [];

    if (filters.invoiceStatus && filters.invoiceStatus !== 'ALL') {
      where += ` AND si.invoice_status = ?`;
      params.push(filters.invoiceStatus);
    } else if (!includeVoid) {
      where += ` AND si.invoice_status != 'VOID'`;
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
      where += ` AND si.payment_status = ?`;
      params.push(filters.paymentStatus);
    }
    if (filters.customerId) {
      where += ` AND si.customer_id = ?`;
      params.push(filters.customerId);
    }
    if (filters.warehouseId) {
      where += ` AND si.warehouse_id = ?`;
      params.push(filters.warehouseId);
    }
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      where += ` AND (si.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
      params.push(term, term, term);
    }
    if (filters.dateFrom) {
      where += ` AND si.date >= ?`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += ` AND si.date <= ?`;
      params.push(filters.dateTo);
    }
    return { where, params };
  }
}
