import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { round2 } from './financials';
import { InventoryCostingService } from './InventoryCostingService';

export interface ReturnablePurchaseItem {
  productId: string;
  productName: string;
  grade: string;
  unitCost: number;
  purchasedM2: number;
  returnedM2: number;
  returnableM2: number;
  metersPerBox: number;
}

export interface PurchaseReturnRow {
  id: string;
  returnNumber: string;
  originalPurchaseId: string;
  originalInvoiceNumber: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  date: string;
  totalAmount: number;
  refundedAmount: number;
  remainingToBalance: number;
  reason: string;
  createdByName?: string;
  createdAt: string;
  itemsCount?: number;
}

export interface CreatePurchaseReturnDTO {
  purchaseId: string;
  reason: string;
  refundMethod: 'CASH' | 'BALANCE';
  items: { productId: string; quantityM2: number; boxesCount?: number }[];
}

export class PurchaseReturnService {
  private db = DatabaseManager.getInstance();

  public getAllReturns(search = ''): PurchaseReturnRow[] {
    let sql = `
      SELECT pr.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName,
        (SELECT COUNT(*) FROM purchase_return_items i WHERE i.return_id = pr.id) AS itemsCount
      FROM purchase_returns pr
      JOIN suppliers s ON s.id = pr.supplier_id
      JOIN warehouses w ON w.id = pr.warehouse_id
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE 1 = 1
    `;
    const params: any[] = [];
    if (search.trim()) {
      sql += ` AND (pr.return_number LIKE ? OR pr.original_invoice_number LIKE ? OR s.name LIKE ? OR pr.reason LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += ` ORDER BY pr.created_at DESC`;
    return this.db.query<PurchaseReturnRow>(sql, params);
  }

  public getReturnById(id: string): (PurchaseReturnRow & { items: any[] }) | null {
    const row = this.db.query<PurchaseReturnRow>(`
      SELECT pr.*, s.name AS supplierName, w.name AS warehouseName, u.full_name AS createdByName
      FROM purchase_returns pr
      JOIN suppliers s ON s.id = pr.supplier_id
      JOIN warehouses w ON w.id = pr.warehouse_id
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE pr.id = ?
    `, [id])[0];
    if (!row) return null;
    const items = this.db.query(`
      SELECT id, product_id AS productId, product_name AS productName, grade,
             quantity_m2 AS quantityM2, boxes_count AS boxesCount,
             unit_cost AS unitCost, total_refund AS totalRefund
      FROM purchase_return_items WHERE return_id = ?
    `, [id]);
    return { ...row, items };
  }

  public getReturnableItems(purchaseId: string): ReturnablePurchaseItem[] {
    return this.db.query<any>(`
      SELECT pii.product_id AS productId, pii.product_name AS productName, pii.grade,
        pii.unit_cost AS unitCost, pii.quantity_m2 AS purchasedM2,
        COALESCE(SUM(pri.quantity_m2), 0) AS returnedM2,
        COALESCE(p.meters_per_box, 1.44) AS metersPerBox
      FROM purchase_invoice_items pii
      LEFT JOIN products p ON p.id = pii.product_id
      LEFT JOIN purchase_returns pr ON pr.original_purchase_id = pii.purchase_id
      LEFT JOIN purchase_return_items pri ON pri.return_id = pr.id AND pri.product_id = pii.product_id
      WHERE pii.purchase_id = ?
      GROUP BY pii.id
    `, [purchaseId]).map((row) => {
      const purchasedM2 = Number(row.purchasedM2) || 0;
      const returnedM2 = Number(row.returnedM2) || 0;
      const metersPerBox = Number(row.metersPerBox) || 1.44;
      return {
        ...row,
        purchasedM2,
        returnedM2,
        metersPerBox,
        returnableM2: round2(Math.max(0, purchasedM2 - returnedM2)),
      };
    });
  }

  public createReturn(dto: CreatePurchaseReturnDTO): PurchaseReturnRow {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'purchases.return');
    if (!dto.items || dto.items.length === 0) throw new Error('يجب تحديد أصناف للمرتجع.');
    if (!dto.reason.trim()) throw new Error('يجب إدخال سبب المرتجع.');

    const purchase = this.db.query<any>(`
      SELECT id, invoice_number AS invoiceNumber, supplier_id AS supplierId, warehouse_id AS warehouseId
      FROM purchase_invoices WHERE id = ?
    `, [dto.purchaseId])[0];
    if (!purchase) throw new Error('فاتورة الشراء غير موجودة.');

    const returnable = this.getReturnableItems(dto.purchaseId);
    const prepared: any[] = [];
    let total = 0;

    for (const line of dto.items) {
      const source = returnable.find((r) => r.productId === line.productId);
      if (!source) throw new Error('صنف غير موجود في فاتورة الشراء.');
      const qty = Number(line.quantityM2) || 0;
      if (qty <= 0) continue;
      if (qty > source.returnableM2 + 0.009) {
        throw new Error(`الكمية المرتجعة من "${source.productName}" تتجاوز المتاح (${source.returnableM2} م²).`);
      }
      const stock = this.db.query<any>(
        `SELECT quantity_m2 AS quantityM2 FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
        [line.productId, purchase.warehouseId]
      )[0];
      if (!stock || Number(stock.quantityM2) + 0.009 < qty) {
        throw new Error(`رصيد المخزن غير كافٍ لارتجاع "${source.productName}".`);
      }
      const amount = round2(qty * Number(source.unitCost));
      total = round2(total + amount);
      prepared.push({
        productId: source.productId,
        productName: source.productName,
        grade: source.grade,
        quantityM2: qty,
        boxesCount: line.boxesCount || round2(qty / (source.metersPerBox || 1.44)),
        unitCost: Number(source.unitCost),
        totalRefund: amount,
      });
    }

    if (prepared.length === 0 || total <= 0) throw new Error('لم يتم تحديد كميات صحيحة للمرتجع.');

    const returnId = `pret_${uuidv4().substring(0, 8)}`;
    const today = localDateString();
    const isCash = dto.refundMethod === 'CASH';

    return this.db.executeTransaction((db) => {
      const returnNumber = db.nextNumber('PRET');
      db.run(`
        INSERT INTO purchase_returns (
          id, return_number, original_purchase_id, original_invoice_number, supplier_id,
          warehouse_id, date, total_amount, refunded_amount, remaining_to_balance, reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        returnId, returnNumber, purchase.id, purchase.invoiceNumber, purchase.supplierId,
        purchase.warehouseId, today, total, isCash ? total : 0, isCash ? 0 : total, dto.reason.trim(), actor.id,
      ]);

      for (const item of prepared) {
        db.run(`
          INSERT INTO purchase_return_items (
            id, return_id, product_id, product_name, grade, quantity_m2,
            boxes_count, unit_cost, total_refund
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `pritem_${uuidv4().substring(0, 8)}`, returnId, item.productId, item.productName,
          item.grade, item.quantityM2, item.boxesCount, item.unitCost, item.totalRefund,
        ]);

        db.run(`
          UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, last_updated = CURRENT_TIMESTAMP
          WHERE product_id = ? AND warehouse_id = ?
        `, [item.quantityM2, item.productId, purchase.warehouseId]);

        const returnTransactionId = `tx_${uuidv4().substring(0, 8)}`;
        const fifoPlan = InventoryCostingService.costingMethod(db) === 'FIFO'
          ? InventoryCostingService.getSourceLayerPlan(db, item.productId, purchase.warehouseId, 'PURCHASE', purchase.id, item.quantityM2)
          : null;
        db.run(`
          INSERT INTO inventory_transactions (
            id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
            unit_cost, total_cost, reference_type, reference_id, notes, performed_by
          ) VALUES (?, ?, 'PURCHASE_RETURN', ?, ?, ?, ?, ?, ?, 'PURCHASE_RETURN', ?, ?, ?)
        `, [
          returnTransactionId, db.nextNumber('TX-PRET'), item.productId,
          purchase.warehouseId, -item.quantityM2, -item.boxesCount, item.unitCost, item.totalRefund,
          returnId, `مرتجع مشتريات بموجب ${returnNumber}`, actor.id,
        ]);
        if (fifoPlan) InventoryCostingService.consumeFifo(db, returnTransactionId, fifoPlan);
      }

      if (isCash) {
        db.run(`UPDATE cash_registers SET current_balance = current_balance + ? WHERE is_default = 1`, [total]);
      } else {
        db.run(`
          UPDATE suppliers SET current_balance = current_balance - ?, total_purchases = total_purchases - ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [total, total, purchase.supplierId]);
      }

      postLedgerEntry(db.getDatabase(), {
        date: today,
        description: `Purchase return ${returnNumber}`,
        referenceType: 'PURCHASE_RETURN',
        referenceId: returnId,
        createdBy: actor.id,
        lines: [
          { accountCode: isCash ? '1101' : '2101', debit: total, credit: 0 },
          { accountCode: '1104', debit: 0, credit: total },
        ],
      });

      db.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'تسجيل مرتجع مشتريات', 'PURCHASES', ?, ?)
      `, [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, returnId,
        JSON.stringify({ returnNumber, total, refundMethod: dto.refundMethod }),
      ]);

      return this.getReturnById(returnId)!;
    });
  }

  public getStats(): { count: number; total: number; cashRefunded: number } {
    const row = this.db.query<any>(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total,
             COALESCE(SUM(refunded_amount), 0) AS cashRefunded
      FROM purchase_returns
    `)[0];
    return {
      count: Number(row?.count) || 0,
      total: Number(row?.total) || 0,
      cashRefunded: Number(row?.cashRefunded) || 0,
    };
  }
}
