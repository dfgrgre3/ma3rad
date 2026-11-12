import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../../database/repositories/databaseManager';

const EPSILON = 0.0005;

function round3(value: number): number {
  return Number(value.toFixed(3));
}

interface LocationStockRow {
  id: string;
  locationId: string;
  quantity: number;
}

interface StockMovementInput {
  warehouseId: string;
  productId: string;
  quantity: number;
  actorId: string;
  reason?: string;
}

/**
 * Keeps bin-level stock (`product_location_stock`) aligned with every warehouse
 * stock movement.
 *
 * The sum of a product's bin allocations never exceeds the warehouse balance:
 * - Inbound quantities are spread over the locations that already hold the
 *   product (or stay unassigned when no bin has been allocated yet, which is
 *   the only honest representation: nobody has told the system where to put it).
 * - Outbound quantities reduce the allocated bins proportionally to their
 *   current share so a sale of 30 units from a 50-unit shelf does not leave the
 *   shelf claiming the full 50.
 *
 * Every change is written to the immutable `warehouse_location_movements`
 * audit trail inside the caller's transaction.
 */
export class InventoryLocationStockService {
  static receive(db: DatabaseManager, input: StockMovementInput): void {
    this.applyDelta(db, input, 'ASSIGN');
  }

  static release(db: DatabaseManager, input: StockMovementInput): void {
    this.applyDelta(db, input, 'RELEASE');
  }

  /**
   * Moves a quantity between two bins of the same warehouse without changing
   * the warehouse total. Every movement is audited with the user, reason,
   * date, quantity and the resulting bin balances.
   */
  static transferBetweenBins(db: DatabaseManager, input: {
    warehouseId: string;
    productId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    actorId: string;
    reason?: string;
  }): void {
    const quantity = round3(Number(input.quantity));
    if (!Number.isFinite(quantity) || quantity <= EPSILON) return;
    const sourceRow = db.query<{ id: string; quantity: number }>(`
      SELECT pls.id, pls.quantity_m2 AS quantity
      FROM product_location_stock pls
      WHERE pls.location_id = ? AND pls.product_id = ?
    `, [input.fromLocationId, input.productId])[0];
    const sourceBefore = Number(sourceRow?.quantity || 0);
    if (sourceBefore + EPSILON < quantity) {
      throw new Error('الكمية المتوفرة في الرف المصدر غير كافية لإجراء النقل.');
    }
    const destinationRow = db.query<{ id: string; quantity: number }>(`
      SELECT pls.id, pls.quantity_m2 AS quantity
      FROM product_location_stock pls
      WHERE pls.location_id = ? AND pls.product_id = ?
    `, [input.toLocationId, input.productId])[0];
    const destinationBefore = Number(destinationRow?.quantity || 0);
    const sourceAfter = round3(sourceBefore - quantity);
    const destinationAfter = round3(destinationBefore + quantity);

    if (sourceRow) {
      if (sourceAfter <= EPSILON) {
        db.run('DELETE FROM product_location_stock WHERE id = ?', [sourceRow.id]);
      } else {
        db.run(`UPDATE product_location_stock SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [sourceAfter, sourceRow.id]);
      }
    }
    if (destinationRow) {
      db.run(`UPDATE product_location_stock SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [destinationAfter, destinationRow.id]);
    } else {
      db.run(`INSERT INTO product_location_stock (id, location_id, product_id, quantity_m2, last_moved_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [`pls_${uuidv4().substring(0, 8)}`, input.toLocationId, input.productId, destinationAfter]);
    }
    this.logMovement(db, {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity,
      actorId: input.actorId,
      reason: input.reason || 'نقل بين رفّين (Bin-to-Bin)',
    }, input.toLocationId, 'TRANSFER', quantity, destinationBefore, destinationAfter,
      input.fromLocationId, input.toLocationId);
  }

  /**
   * Adjusts a single bin by `delta` (positive = inbound, negative = outbound)
   * and records the movement. Used by bin-level counts.
   */
  static adjustBin(db: DatabaseManager, input: {
    warehouseId: string;
    productId: string;
    locationId: string;
    quantity: number;
    actorId: string;
    reason?: string;
  }): void {
    const quantity = round3(Number(input.quantity));
    if (!Number.isFinite(quantity) || Math.abs(quantity) <= EPSILON) return;
    const existing = db.query<{ id: string; quantity: number }>(`
      SELECT pls.id, pls.quantity_m2 AS quantity
      FROM product_location_stock pls
      WHERE pls.location_id = ? AND pls.product_id = ?
    `, [input.locationId, input.productId])[0];
    const before = Number(existing?.quantity || 0);
    const after = round3(before + quantity);
    if (after < -EPSILON) throw new Error('كمية الخانة لا يمكن أن تكون سالبة.');
    if (after <= EPSILON) {
      if (existing) db.run('DELETE FROM product_location_stock WHERE id = ?', [existing.id]);
    } else if (existing) {
      db.run(`UPDATE product_location_stock SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [after, existing.id]);
    } else if (quantity > 0) {
      db.run(`INSERT INTO product_location_stock (id, location_id, product_id, quantity_m2, last_moved_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [`pls_${uuidv4().substring(0, 8)}`, input.locationId, input.productId, after]);
    }
    const movementType = quantity > 0 ? 'ASSIGN' : 'RELEASE';
    this.logMovement(db, {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: Math.abs(quantity),
      actorId: input.actorId,
      reason: input.reason || 'تسوية جرد الخانة',
    }, input.locationId, movementType, Math.abs(quantity), before, Math.max(0, after));
  }

  static applyDelta(
    db: DatabaseManager,
    input: StockMovementInput,
    direction?: 'ASSIGN' | 'RELEASE',
  ): void {
    const quantity = round3(Number(input.quantity));
    if (!Number.isFinite(quantity) || Math.abs(quantity) <= EPSILON) return;
    const signed = direction
      ? (direction === 'ASSIGN' ? Math.abs(quantity) : -Math.abs(quantity))
      : quantity;
    if (signed > 0) {
      this.assign(db, input, signed);
    } else {
      this.releaseFromBins(db, input, Math.abs(signed));
    }
  }

  private static bins(db: DatabaseManager, warehouseId: string, productId: string): LocationStockRow[] {
    return db.query<LocationStockRow>(`
      SELECT pls.id, pls.location_id AS locationId, pls.quantity_m2 AS quantity
      FROM product_location_stock pls
      JOIN warehouse_locations wl ON wl.id = pls.location_id
      WHERE wl.warehouse_id = ? AND pls.product_id = ? AND pls.quantity_m2 > 0
      ORDER BY pls.last_moved_at ASC, pls.id ASC
    `, [warehouseId, productId]);
  }

  private static assign(db: DatabaseManager, input: StockMovementInput, quantity: number): void {
    const bins = this.bins(db, input.warehouseId, input.productId);
    if (!bins.length) return; // No bin has been allocated for this product yet.
    const total = bins.reduce((sum, row) => sum + Number(row.quantity), 0);
    let remaining = quantity;
    bins.forEach((row, index) => {
      const share = index === bins.length - 1
        ? remaining
        : round3(quantity * (Number(row.quantity) / total));
      if (share <= EPSILON) return;
      const before = Number(row.quantity);
      const after = round3(before + share);
      db.run(`
        UPDATE product_location_stock
        SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [after, row.id]);
      this.logMovement(db, input, row.locationId, 'ASSIGN', share, before, after);
      remaining = round3(remaining - share);
    });
  }

  private static releaseFromBins(db: DatabaseManager, input: StockMovementInput, quantity: number): void {
    const bins = this.bins(db, input.warehouseId, input.productId);
    if (!bins.length) return;
    const total = bins.reduce((sum, row) => sum + Number(row.quantity), 0);
    const releaseTotal = Math.min(quantity, total);
    let remaining = releaseTotal;
    bins.forEach((row, index) => {
      const share = index === bins.length - 1
        ? remaining
        : round3(releaseTotal * (Number(row.quantity) / total));
      if (share <= EPSILON) return;
      const before = Number(row.quantity);
      const applied = Math.min(share, before);
      const after = round3(before - applied);
      if (after <= EPSILON) {
        db.run(`DELETE FROM product_location_stock WHERE id = ?`, [row.id]);
        this.logMovement(db, input, row.locationId, 'RELEASE', applied, before, 0);
      } else {
        db.run(`
          UPDATE product_location_stock
          SET quantity_m2 = ?, last_moved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [after, row.id]);
        this.logMovement(db, input, row.locationId, 'RELEASE', applied, before, after);
      }
      remaining = round3(remaining - applied);
    });
  }

  private static logMovement(
    db: DatabaseManager,
    input: StockMovementInput,
    locationId: string,
    movementType: 'ASSIGN' | 'RELEASE' | 'TRANSFER',
    quantity: number,
    before: number,
    after: number,
    fromLocationId?: string | null,
    toLocationId?: string | null,
  ): void {
    if (quantity <= EPSILON) return;
    db.run(`
      INSERT INTO warehouse_location_movements (
        id, warehouse_id, product_id, from_location_id, to_location_id,
        movement_type, quantity_m2, location_quantity_before, location_quantity_after, performed_by, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `wlm_${uuidv4().substring(0, 8)}`,
      input.warehouseId,
      input.productId,
      movementType === 'TRANSFER' ? (fromLocationId || locationId) : (movementType === 'RELEASE' ? locationId : (fromLocationId || null)),
      movementType === 'TRANSFER' ? (toLocationId || locationId) : (movementType === 'ASSIGN' ? locationId : (toLocationId || null)),
      movementType,
      round3(quantity),
      before,
      after,
      input.actorId,
      input.reason || null,
    ]);
  }
}
