import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';

const EPSILON = 0.001;

function round3(value: number): number {
  return Number(value.toFixed(3));
}

interface BatchRow {
  id: string;
  batchNumber: string;
  toneShade: string;
  caliber: string | null;
  costPrice: number;
  remainingM2: number;
  productionDate: string | null;
  receivedDate: string | null;
  supplierId: string | null;
  createdAt: string | null;
}

interface BatchAllocationRow {
  id: string;
  batchNumber: string;
  toneShade: string | null;
  caliber: string | null;
  quantityM2: number;
  receivedM2: number;
  lostM2: number;
  revertedM2: number;
  unitCost: number;
  transitBatchId: string | null;
  sourceBatchId: string | null;
  createdAt: string | null;
}

/**
 * Transfer-specific inventory tracking.
 *
 * A transfer is not just "subtract from A, add to B": it must keep ceramic
 * batches (shade/caliber), preserve cost layers and park the goods in a real
 * transit warehouse until they are received. This service owns those pieces so
 * dispatch, receive and reject all mutate the same structures consistently.
 */
export class InventoryTransferTrackingService {
  static changedRows(db: DatabaseManager): number {
    return Number(db.query<{ changed: number }>('SELECT changes() AS changed')[0]?.changed || 0);
  }

  static assertSameCompany(db: DatabaseManager, fromWarehouseId: string, toWarehouseId: string): void {
    const rows = db.query<{ id: string; companyId: string | null }>(`
      SELECT w.id, COALESCE(w.company_id, b.company_id) AS companyId
      FROM warehouses w
      LEFT JOIN branches b ON b.id = w.branch_id
      WHERE w.id IN (?, ?)
    `, [fromWarehouseId, toWarehouseId]);
    if (rows.length !== 2) throw new Error('أحد المخازن المشاركة في التحويل غير موجود.');
    const companies = new Set(rows.map((row) => row.companyId).filter((value): value is string => !!value));
    if (companies.size > 1) {
      throw new Error('لا يمكن التحويل بين مخازن تابعة لشركتين مختلفتين. يلزم تحويل بين الشركات (Intercompany) بمعالجة محاسبية معتمدة.');
    }
  }

  /**
   * Resolves (or lazily creates) the transit warehouse that a source warehouse
   * ships into. Keeping one transit warehouse per branch keeps the in-transit
   * balance visible and scoped exactly like the source stock.
   */
  static resolveTransitWarehouse(db: DatabaseManager, sourceWarehouseId: string): string {
    const source = db.query<{
      id: string;
      name: string;
      branchId: string | null;
      companyId: string | null;
      warehouseType: string;
    }>(`
      SELECT w.id, w.name, w.branch_id AS branchId,
        COALESCE(w.company_id, b.company_id) AS companyId,
        w.warehouse_type AS warehouseType
      FROM warehouses w
      LEFT JOIN branches b ON b.id = w.branch_id
      WHERE w.id = ?
    `, [sourceWarehouseId])[0];
    if (!source) throw new Error('المخزن المصدر غير موجود.');
    if (source.warehouseType === 'TRANSIT_WAREHOUSE') {
      throw new Error('لا يمكن إرسال تحويل من مخزن البضاعة أثناء النقل. استلم الشحنة أولاً.');
    }

    const existing = db.query<{ id: string }>(`
      SELECT w.id
      FROM warehouses w
      LEFT JOIN branches b ON b.id = w.branch_id
      WHERE w.is_active = 1
        AND w.warehouse_type = 'TRANSIT_WAREHOUSE'
        AND COALESCE(w.branch_id, '') = COALESCE(?, '')
        AND COALESCE(COALESCE(w.company_id, b.company_id), '') = COALESCE(?, '')
      ORDER BY w.created_at, w.id
      LIMIT 1
    `, [source.branchId, source.companyId])[0];
    if (existing) return existing.id;

    const suffix = String(source.branchId || source.companyId || sourceWarehouseId)
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(-14) || 'DEFAULT';
    const id = `wh_transit_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    let code = `WH-TRANSIT-${suffix.toUpperCase()}`;
    if (db.query<{ id: string }>('SELECT id FROM warehouses WHERE code = ?', [code])[0]) {
      code = `${code}-${uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
    }
    let name = `مخزن البضاعة أثناء النقل - ${source.name}`;
    if (db.query<{ id: string }>('SELECT id FROM warehouses WHERE name = ?', [name])[0]) {
      name = `${name} (${uuidv4().replace(/-/g, '').slice(0, 4)})`;
    }
    db.run(`
      INSERT INTO warehouses (id, code, name, branch_id, company_id, warehouse_type, is_default, is_active)
      VALUES (?, ?, ?, ?, ?, 'TRANSIT_WAREHOUSE', 0, 1)
    `, [id, code, name, source.branchId, source.companyId]);
    return id;
  }

  static ensureWarehouseStock(
    db: DatabaseManager,
    warehouseId: string,
    productId: string,
    delta: number,
  ): void {
    const stock = db.query<{ id: string; quantity: number }>(
      'SELECT id, quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?',
      [warehouseId, productId],
    )[0];
    if (stock) {
      db.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = quantity_m2 + ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [delta, stock.id]);
      return;
    }
    if (delta < 0) throw new Error('لا يوجد رصيد كافٍ في مخزن البضاعة أثناء النقل لتسوية الشحنة.');
    db.run(`
      INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
      VALUES (?, ?, ?, ?, 0)
    `, [`stk_${uuidv4().substring(0, 8)}`, warehouseId, productId, delta]);
  }

  static findOperation(db: DatabaseManager, transferId: string, operation: string, idempotencyKey: string): {
    id: string;
    resultReference: string | null;
    payloadJson: string | null;
  } | undefined {
    return db.query<{ id: string; resultReference: string | null; payloadJson: string | null }>(`
      SELECT id, result_reference AS resultReference, payload_json AS payloadJson
      FROM stock_transfer_operations
      WHERE transfer_id = ? AND operation = ? AND idempotency_key = ?
    `, [transferId, operation, idempotencyKey])[0];
  }

  static recordOperation(db: DatabaseManager, input: {
    transferId: string;
    operation: 'DISPATCH' | 'RECEIVE' | 'REJECT';
    idempotencyKey: string;
    resultReference?: string | null;
    payloadJson?: string | null;
    actorId: string;
  }): void {
    db.run(`
      INSERT INTO stock_transfer_operations (
        id, transfer_id, operation, idempotency_key, result_reference, payload_json, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      `trfop_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      input.transferId,
      input.operation,
      input.idempotencyKey,
      input.resultReference || null,
      input.payloadJson || null,
      input.actorId,
    ]);
  }

  static findReceiptByKey(db: DatabaseManager, transferId: string, idempotencyKey: string): {
    id: string;
    payloadJson: string | null;
  } | undefined {
    return db.query<{ id: string; payloadJson: string | null }>(`
      SELECT id, payload_json AS payloadJson
      FROM stock_transfer_receipts
      WHERE transfer_id = ? AND idempotency_key = ?
    `, [transferId, idempotencyKey])[0];
  }

  static createReceipt(db: DatabaseManager, input: {
    transferId: string;
    idempotencyKey: string;
    payloadJson: string;
    receivedBy: string;
    notes?: string | null;
  }): string {
    const id = `trc_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    db.run(`
      INSERT INTO stock_transfer_receipts (
        id, transfer_id, receipt_number, idempotency_key, payload_json, received_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.transferId,
      db.nextNumber('TRC'),
      input.idempotencyKey,
      input.payloadJson,
      input.receivedBy,
      input.notes?.trim() || null,
    ]);
    return id;
  }

  static finalizeReceipt(
    db: DatabaseManager,
    receiptId: string,
    totals: { received: number; lost: number },
  ): void {
    db.run(`
      UPDATE stock_transfer_receipts
      SET total_received_m2 = ?, total_lost_m2 = ?
      WHERE id = ?
    `, [round3(totals.received), round3(totals.lost), receiptId]);
  }

  /**
   * Deducts the moved quantities from source batches (FIFO) and creates the
   * matching batches inside the transit warehouse, preserving shade, caliber
   * and the original receipt order.
   */
  static dispatchBatches(db: DatabaseManager, input: {
    transferId: string;
    transferItemId: string;
    productId: string;
    fromWarehouseId: string;
    transitWarehouseId: string;
    quantity: number;
    transferNumber: string;
    actorId: string;
  }): void {
    const batches = db.query<BatchRow>(`
      SELECT id, batch_number AS batchNumber, tone_shade AS toneShade, caliber,
        COALESCE(cost_price, 0) AS costPrice,
        COALESCE(quantity_remaining_m2, 0) AS remainingM2,
        production_date AS productionDate, received_date AS receivedDate,
        supplier_id AS supplierId, created_at AS createdAt
      FROM product_batches
      WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining_m2 > 0.001
      ORDER BY created_at, id
    `, [input.productId, input.fromWarehouseId]);
    if (batches.length === 0) return;

    let remaining = round3(input.quantity);
    for (const batch of batches) {
      if (remaining <= EPSILON) break;
      const take = round3(Math.min(remaining, Number(batch.remainingM2)));
      if (take <= EPSILON) continue;
      db.run(`
        UPDATE product_batches
        SET quantity_remaining_m2 = MAX(0, quantity_remaining_m2 - ?)
        WHERE id = ?
      `, [take, batch.id]);
      const transitBatchId = this.findOrCreateBatch(db, {
        productId: input.productId,
        warehouseId: input.transitWarehouseId,
        batchNumber: batch.batchNumber,
        toneShade: batch.toneShade,
        caliber: batch.caliber,
        costPrice: Number(batch.costPrice),
        quantity: take,
        productionDate: batch.productionDate,
        receivedDate: batch.receivedDate,
        supplierId: batch.supplierId,
        createdAt: batch.createdAt,
        actorId: input.actorId,
        notes: `تحويل قيد النقل (${input.transferNumber})`,
      });
      db.run(`
        INSERT INTO stock_transfer_batch_allocations (
          id, transfer_item_id, source_batch_id, transit_batch_id, batch_number,
          tone_shade, caliber, quantity_m2, unit_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `trfba_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
        input.transferItemId,
        batch.id,
        transitBatchId,
        batch.batchNumber,
        batch.toneShade,
        batch.caliber,
        take,
        Number(batch.costPrice),
      ]);
      remaining = round3(remaining - take);
    }

    if (remaining > EPSILON) {
      throw new Error(`دفعات هذا الصنف لا تغطي الكمية المحوّلة؛ المتبقي بدون دفعة: ${remaining}. راجع أرصدة الدفعات قبل التحويل.`);
    }
  }

  /**
   * Consumes the in-transit batches in FIFO order and recreates the same
   * batches in the destination warehouse for the received quantity. Losses
   * reduce the transit batch without creating a destination batch.
   */
  static receiveBatches(db: DatabaseManager, input: {
    transferItemId: string;
    productId: string;
    transitWarehouseId: string;
    toWarehouseId: string;
    received: number;
    lost: number;
    transferNumber: string;
    actorId: string;
  }): void {
    const allocations = db.query<BatchAllocationRow>(`
      SELECT id, batch_number AS batchNumber, tone_shade AS toneShade, caliber,
        quantity_m2 AS quantityM2, received_m2 AS receivedM2, lost_m2 AS lostM2,
        reverted_m2 AS revertedM2, unit_cost AS unitCost,
        transit_batch_id AS transitBatchId, source_batch_id AS sourceBatchId,
        created_at AS createdAt
      FROM stock_transfer_batch_allocations
      WHERE transfer_item_id = ?
      ORDER BY rowid
    `, [input.transferItemId]);
    if (allocations.length === 0) return;

    let receivedRemaining = round3(Math.max(0, input.received));
    let lostRemaining = round3(Math.max(0, input.lost));
    for (const allocation of allocations) {
      if (receivedRemaining <= EPSILON && lostRemaining <= EPSILON) break;
      let available = round3(
        Number(allocation.quantityM2) - Number(allocation.receivedM2)
        - Number(allocation.lostM2) - Number(allocation.revertedM2),
      );
      if (available <= EPSILON) continue;

      const receivedNow = round3(Math.min(receivedRemaining, available));
      if (receivedNow > EPSILON) {
        this.consumeTransitBatch(db, allocation.transitBatchId, receivedNow);
        const destinationBatchId = this.findOrCreateBatch(db, {
          productId: input.productId,
          warehouseId: input.toWarehouseId,
          batchNumber: allocation.batchNumber,
          toneShade: allocation.toneShade || '',
          caliber: allocation.caliber,
          costPrice: Number(allocation.unitCost),
          quantity: receivedNow,
          productionDate: null,
          receivedDate: null,
          supplierId: null,
          createdAt: allocation.createdAt,
          actorId: input.actorId,
          notes: `مستلم من تحويل (${input.transferNumber})`,
        });
        db.run(`
          UPDATE stock_transfer_batch_allocations
          SET received_m2 = received_m2 + ?, destination_batch_id = ?
          WHERE id = ?
        `, [receivedNow, destinationBatchId, allocation.id]);
        allocation.receivedM2 = round3(Number(allocation.receivedM2) + receivedNow);
        receivedRemaining = round3(receivedRemaining - receivedNow);
        available = round3(available - receivedNow);
      }

      const lostNow = round3(Math.min(lostRemaining, available));
      if (lostNow > EPSILON) {
        this.consumeTransitBatch(db, allocation.transitBatchId, lostNow);
        db.run(`
          UPDATE stock_transfer_batch_allocations
          SET lost_m2 = lost_m2 + ?
          WHERE id = ?
        `, [lostNow, allocation.id]);
        allocation.lostM2 = round3(Number(allocation.lostM2) + lostNow);
        lostRemaining = round3(lostRemaining - lostNow);
      }
    }

    if (receivedRemaining > EPSILON || lostRemaining > EPSILON) {
      throw new Error('تخصيصات دفعات التحويل لا تغطي الكمية المستلمة/المفقودة. راجع أرصدة الدفعات.');
    }
  }

  /** Returns all outstanding in-transit batches to the source warehouse. */
  static revertBatches(db: DatabaseManager, input: {
    transferItemId: string;
    productId: string;
    fromWarehouseId: string;
    transitWarehouseId: string;
    actorId: string;
  }): void {
    const allocations = db.query<BatchAllocationRow>(`
      SELECT id, batch_number AS batchNumber, tone_shade AS toneShade, caliber,
        quantity_m2 AS quantityM2, received_m2 AS receivedM2, lost_m2 AS lostM2,
        reverted_m2 AS revertedM2, unit_cost AS unitCost,
        transit_batch_id AS transitBatchId, source_batch_id AS sourceBatchId,
        created_at AS createdAt
      FROM stock_transfer_batch_allocations
      WHERE transfer_item_id = ?
      ORDER BY rowid
    `, [input.transferItemId]);
    if (allocations.length === 0) return;

    for (const allocation of allocations) {
      const outstanding = round3(
        Number(allocation.quantityM2) - Number(allocation.receivedM2)
        - Number(allocation.lostM2) - Number(allocation.revertedM2),
      );
      if (outstanding <= EPSILON) continue;
      this.consumeTransitBatch(db, allocation.transitBatchId, outstanding);
      if (allocation.sourceBatchId) {
        db.run(`
          UPDATE product_batches
          SET quantity_remaining_m2 = MIN(quantity_m2, quantity_remaining_m2 + ?)
          WHERE id = ?
        `, [outstanding, allocation.sourceBatchId]);
      } else {
        this.findOrCreateBatch(db, {
          productId: input.productId,
          warehouseId: input.fromWarehouseId,
          batchNumber: allocation.batchNumber,
          toneShade: allocation.toneShade || '',
          caliber: allocation.caliber,
          costPrice: Number(allocation.unitCost),
          quantity: outstanding,
          productionDate: null,
          receivedDate: null,
          supplierId: null,
          createdAt: allocation.createdAt,
          actorId: input.actorId,
          notes: 'مرتجع رفض تحويل',
        });
      }
      db.run(`
        UPDATE stock_transfer_batch_allocations
        SET reverted_m2 = reverted_m2 + ?
        WHERE id = ?
      `, [outstanding, allocation.id]);
    }
  }

  private static consumeTransitBatch(
    db: DatabaseManager,
    transitBatchId: string | null,
    quantity: number,
  ): void {
    if (!transitBatchId || quantity <= EPSILON) return;
    db.run(`
      UPDATE product_batches
      SET quantity_remaining_m2 = MAX(0, quantity_remaining_m2 - ?)
      WHERE id = ?
    `, [quantity, transitBatchId]);
  }

  private static findOrCreateBatch(db: DatabaseManager, input: {
    productId: string;
    warehouseId: string;
    batchNumber: string;
    toneShade: string;
    caliber: string | null;
    costPrice: number;
    quantity: number;
    productionDate: string | null;
    receivedDate: string | null;
    supplierId: string | null;
    createdAt: string | null;
    actorId: string;
    notes: string;
  }): string {
    const existing = db.query<{ id: string }>(`
      SELECT id FROM product_batches
      WHERE product_id = ? AND warehouse_id = ? AND batch_number = ?
        AND COALESCE(tone_shade, '') = COALESCE(?, '')
        AND COALESCE(caliber, '') = COALESCE(?, '')
      LIMIT 1
    `, [input.productId, input.warehouseId, input.batchNumber, input.toneShade, input.caliber])[0];
    if (existing) {
      db.run(`
        UPDATE product_batches
        SET quantity_m2 = quantity_m2 + ?, quantity_remaining_m2 = quantity_remaining_m2 + ?
        WHERE id = ?
      `, [input.quantity, input.quantity, existing.id]);
      return existing.id;
    }
    const id = `batch_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    db.run(`
      INSERT INTO product_batches (
        id, product_id, warehouse_id, batch_number, tone_shade, caliber,
        production_date, received_date, supplier_id, cost_price,
        quantity_m2, quantity_remaining_m2, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `, [
      id,
      input.productId,
      input.warehouseId,
      input.batchNumber,
      input.toneShade,
      input.caliber,
      input.productionDate,
      input.receivedDate,
      input.supplierId,
      round3(input.costPrice),
      input.quantity,
      input.quantity,
      input.notes,
      input.actorId,
      input.createdAt,
    ]);
    return id;
  }
}
