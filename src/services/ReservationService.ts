import { DatabaseManager } from '../database/db';
import { InventoryCostingService } from './InventoryCostingService';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { getProductUnitLabel } from '../utils/productUnits';

export * from './reservationTypes';
import type { StockReservation, ReservationReference } from './reservationTypes';

export class ReservationService {
  private db = DatabaseManager.getInstance();

  public getReservations(filters: { status?: string; search?: string } = {}): StockReservation[] {
    PermissionService.require(AuthService.requireAuth(), 'inventory.view');
    let sql = `
      SELECT r.id, r.product_id AS productId, p.name AS productName, p.sku AS productSku,
             p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit,
             r.warehouse_id AS warehouseId, w.name AS warehouseName, r.quantity_m2 AS quantityM2,
             r.reference_type AS referenceType, r.reference_id AS referenceId, r.status,
             r.expires_at AS expiresAt, r.notes, r.created_at AS createdAt, r.released_at AS releasedAt
      FROM stock_reservations r
      JOIN products p ON p.id = r.product_id
      JOIN warehouses w ON w.id = r.warehouse_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.status && filters.status !== 'ALL') { sql += ` AND r.status = ?`; params.push(filters.status); }
    if (filters.search?.trim()) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR r.reference_id LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY CASE r.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, r.created_at DESC`;
    return this.db.query<StockReservation>(sql, params);
  }

  public getAvailability(productId: string, warehouseId: string): { onHand: number; reserved: number; available: number; productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string } {
    const row = this.db.query<any>(
      `SELECT ws.quantity_m2 AS onHand, ws.reserved_m2 AS reserved, p.product_type AS productType,
              p.base_unit AS baseUnit, p.custom_unit AS customUnit
       FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
       WHERE ws.product_id = ? AND ws.warehouse_id = ?`,
      [productId, warehouseId]
    )[0];
    const onHand = round2(row?.onHand || 0);
    const reserved = round2(row?.reserved || 0);
    return { onHand, reserved, available: round2(onHand - reserved) };
  }

  public createReservation(input: {
    productId: string; warehouseId: string; quantityM2: number;
    referenceType?: ReservationReference; referenceId?: string;
    expiresAt?: string; notes?: string;
  }): StockReservation {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const quantity = round2(input.quantityM2);
    if (!(quantity > 0)) throw new Error('كمية الحجز يجب أن تكون أكبر من صفر.');

    const id = `res_${uuidv4().substring(0, 8)}`;
    this.db.executeTransaction((db) => {
      const stock = db.query<any>(
        `SELECT ws.id, ws.quantity_m2 AS quantity, ws.reserved_m2 AS reserved,
                p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
         FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
         WHERE ws.product_id = ? AND ws.warehouse_id = ?`,
        [input.productId, input.warehouseId]
      )[0];
      if (!stock) throw new Error('الصنف غير موجود في هذا المخزن.');
      const available = round2(Number(stock.quantity) - Number(stock.reserved));
      if (quantity > available) {
        const unit = getProductUnitLabel(stock);
        throw new Error(`الكمية المتاحة ${available} ${unit} فقط، والمطلوب حجزه ${quantity} ${unit}.`);
      }

      db.run(
        `INSERT INTO stock_reservations (id, product_id, warehouse_id, quantity_m2, reference_type,
           reference_id, status, expires_at, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
        [
          id, input.productId, input.warehouseId, quantity, input.referenceType || 'MANUAL',
          input.referenceId || null, input.expiresAt || null, input.notes || null,
          actor.id, new Date().toISOString(),
        ]
      );
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = reserved_m2 + ?, last_updated = CURRENT_TIMESTAMP
         WHERE product_id = ? AND warehouse_id = ?`,
        [quantity, input.productId, input.warehouseId]
      );
    });

    return this.getReservations().find((row) => row.id === id)!;
  }

  public releaseReservation(id: string, reason: 'RELEASED' | 'EXPIRED' = 'RELEASED'): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const row = this.db.query<any>(
      `SELECT id, product_id AS productId, warehouse_id AS warehouseId, quantity_m2 AS quantity, status
       FROM stock_reservations WHERE id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('الحجز غير موجود.');
    if (row.status !== 'ACTIVE') throw new Error('الحجز غير نشط بالفعل.');

    this.db.executeTransaction((db) => {
      db.run(
        `UPDATE stock_reservations SET status = ?, released_at = ? WHERE id = ?`,
        [reason, new Date().toISOString(), id]
      );
      db.run(
        `UPDATE warehouse_stock SET reserved_m2 = MAX(0, reserved_m2 - ?), last_updated = CURRENT_TIMESTAMP
         WHERE product_id = ? AND warehouse_id = ?`,
        [Number(row.quantity), row.productId, row.warehouseId]
      );
    });
  }

  /** Converts an active reservation into an actual stock deduction. */
  public consumeReservation(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const row = this.db.query<any>(
      `SELECT id, product_id AS productId, warehouse_id AS warehouseId, quantity_m2 AS quantity,
              reference_type AS referenceType, reference_id AS referenceId, status
       FROM stock_reservations WHERE id = ?`,
      [id]
    )[0];
    if (!row) throw new Error('الحجز غير موجود.');
    if (row.status !== 'ACTIVE') throw new Error('لا يمكن تنفيذ حجز غير نشط.');

    this.db.executeTransaction((db) => {
      const stock = db.query<any>(
        `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
        [row.productId, row.warehouseId]
      )[0];
      if (!stock || Number(stock.quantity) < Number(row.quantity)) {
        throw new Error('المخزون الفعلي غير كافٍ لتنفيذ الحجز.');
      }
      const product = db.query<any>(`SELECT cost_price AS costPrice FROM products WHERE id = ?`, [row.productId])[0];
      const fifoPlan = InventoryCostingService.costingMethod(db) === 'FIFO'
        ? InventoryCostingService.planFifo(db, row.productId, row.warehouseId, Number(row.quantity))
        : null;
      const unitCost = fifoPlan?.unitCost ?? (Number(product?.costPrice) || 0);
      const transactionId = `itx_${uuidv4().substring(0, 8)}`;
      db.run(
        `UPDATE warehouse_stock SET quantity_m2 = quantity_m2 - ?, reserved_m2 = MAX(0, reserved_m2 - ?),
           last_updated = CURRENT_TIMESTAMP WHERE product_id = ? AND warehouse_id = ?`,
        [Number(row.quantity), Number(row.quantity), row.productId, row.warehouseId]
      );
      db.run(
        `INSERT INTO inventory_transactions (id, transaction_number, product_id, warehouse_id, type,
           quantity_m2, unit_cost, total_cost, reference_type, reference_id, notes, performed_by)
         VALUES (?, ?, ?, ?, 'ADJUSTMENT_SUB', ?, ?, ?, 'RESERVATION', ?, ?, ?)`,
        [
          transactionId, db.nextNumber('ITX'), row.productId, row.warehouseId,
          Number(row.quantity), unitCost, round2(Number(row.quantity) * unitCost),
          row.id, `تنفيذ حجز ${row.referenceType} ${row.referenceId || ''}`.trim(), actor.id,
        ]
      );
      if (fifoPlan) InventoryCostingService.consumeFifo(db, transactionId, fifoPlan);
      db.run(
        `UPDATE stock_reservations SET status = 'CONSUMED', released_at = ? WHERE id = ?`,
        [new Date().toISOString(), id]
      );
    });
  }

  public expireOverdue(): number {
    const today = new Date().toISOString();
    const rows = this.db.query<any>(
      `SELECT id FROM stock_reservations WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?`,
      [today]
    );
    for (const row of rows) {
      try { this.releaseReservation(row.id, 'EXPIRED'); } catch { /* continue */ }
    }
    return rows.length;
  }
}
