import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../AuthService';
import { PermissionService } from '../PermissionService';
import { SettingsService } from '../SettingsService';
import { InventoryCostingService } from '../InventoryCostingService';
import { BatchService } from '../BatchService';
import { localDateString } from '../../utils/date';
import { paymentAccountCode, postLedgerEntry } from '../../database/ledger';
import { computeSaleLine, computeSaleTotals, round2 } from '../financials';
import type { SalesInvoice } from '../../types';
import type { SalesContext } from './context';
import type { CreateSaleDTO } from './types';

export function createSalesInvoice(ctx: SalesContext, dto: CreateSaleDTO): SalesInvoice {
  if (!dto.items || dto.items.length === 0) {
    throw new Error('لا يمكن إنشاء فاتورة مبيعات بدون أصناف.');
  }
  const actor = AuthService.requireAuth();
  PermissionService.require(actor, 'sales.create');
  const branchId = ctx.branchAccess.requireWarehouseAccess(dto.warehouseId, actor);
  const branchRegisterId = ctx.branchAccess.getDefaultRegisterId(branchId, actor);
  let cashRegisterId = branchRegisterId;
  if (dto.shiftId) {
    const shift = ctx.branchAccess.requireShiftAccess(dto.shiftId, actor);
    if (shift.status !== 'OPEN') throw new Error('الوردية المحددة مغلقة.');
    if (shift.branchId !== branchId) throw new Error('يجب أن تتبع الوردية فرع فاتورة البيع.');
    cashRegisterId = shift.registerId;
  }

  return ctx.db.executeTransaction((sqliteDb) => {
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
        id, invoice_number, date, due_date, customer_id, warehouse_id, branch_id, shift_id, order_id, project_id,
        subtotal, discount_percentage, discount_amount, tax_percentage, tax_amount,
        shipping_cost, total_amount, paid_amount, remaining_amount, payment_type,
        payment_status, invoice_status, total_cost, gross_profit, returned_amount, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, 0, ?, ?)
    `, [
      invoiceId, invoiceNumber, today, dueDate, dto.customerId, dto.warehouseId, branchId, dto.shiftId || null,
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
      if (item.productType !== 'GENERAL') {
        const batchResult = new BatchService().deductFromBatches(item.productId, dto.warehouseId, item.quantityM2);
        for (const allocation of batchResult.allocations) {
          sqliteDb.run(`
            INSERT INTO sales_invoice_batch_allocations (id, invoice_item_id, batch_id, quantity_m2)
            VALUES (?, ?, ?, ?)
          `, [`sba_${uuidv4().substring(0, 8)}`, item.id, allocation.batchId, allocation.quantityM2]);
        }
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
        sqliteDb.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE id = ?`, [totals.paidAmount, cashRegisterId]);
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

    return ctx.getInvoiceById(invoiceId)!;
  });
}
