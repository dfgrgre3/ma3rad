import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../database/db';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

interface CostLayer {
  id: string;
  quantityRemaining: number;
  unitCost: number;
}

interface CostAllocation {
  id: string;
  layerId: string;
  quantity: number;
  quantityRestored: number;
  unitCost: number;
}

export interface FifoCostPlan {
  quantity: number;
  totalCost: number;
  unitCost: number;
  allocations: Array<{ layerId: string; quantity: number; unitCost: number }>;
}

/** Maintains inventory value by warehouse using dated FIFO cost layers. */
export class InventoryCostingService {
  static costingMethod(db: DatabaseManager): 'FIFO' | 'AVERAGE_COST' {
    const row = db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='costingMethod'`)[0];
    return row?.value === 'FIFO' ? 'FIFO' : 'AVERAGE_COST';
  }

  static addLayer(db: DatabaseManager, input: {
    productId: string; warehouseId: string; sourceTransactionId?: string | null;
    sourceType: string; sourceId?: string | null; date: string; quantity: number; unitCost: number;
    estimated?: boolean;
  }): string {
    const quantity = round2(input.quantity);
    const unitCost = round2(input.unitCost);
    if (quantity <= 0) throw new Error('A FIFO cost layer must have a positive quantity.');
    if (unitCost < 0) throw new Error('A FIFO cost layer cannot have a negative unit cost.');
    const id = `icl_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    db.run(`INSERT INTO inventory_cost_layers
      (id,product_id,warehouse_id,source_transaction_id,source_type,source_id,received_at,
       quantity_received,quantity_remaining,unit_cost,is_estimated)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, input.productId, input.warehouseId,
      input.sourceTransactionId || null, input.sourceType, input.sourceId || null,
      input.date, quantity, quantity, unitCost, input.estimated ? 1 : 0]);
    return id;
  }

  static planFifo(db: DatabaseManager, productId: string, warehouseId: string, requestedQuantity: number,
    reservedByLayer: Map<string, number> = new Map()): FifoCostPlan {
    const quantity = round2(requestedQuantity);
    if (quantity <= 0) throw new Error('FIFO issue quantity must be positive.');
    const stock = db.query<{ quantity: number; costPrice: number }>(`SELECT ws.quantity_m2 AS quantity,p.cost_price AS costPrice
      FROM warehouse_stock ws JOIN products p ON p.id=ws.product_id
      WHERE ws.product_id=? AND ws.warehouse_id=?`, [productId,warehouseId])[0];
    if (!stock) throw new Error(`No stock record exists for FIFO product ${productId} in warehouse ${warehouseId}.`);
    const layerTotal = Number(db.query<{ quantity: number }>(`SELECT COALESCE(SUM(quantity_remaining),0) AS quantity
      FROM inventory_cost_layers WHERE product_id=? AND warehouse_id=?`, [productId,warehouseId])[0]?.quantity || 0);
    const unlayered = round2(Number(stock.quantity) - layerTotal);
    if (unlayered > 0.009) {
      this.addLayer(db, { productId,warehouseId,sourceType:'OPENING_ESTIMATE',
        date:'0001-01-01',quantity:unlayered,unitCost:Math.max(0,Number(stock.costPrice)||0),estimated:true });
    } else if (unlayered < -0.009) {
      throw new Error(`FIFO layers exceed physical stock by ${Math.abs(unlayered)} m² for product ${productId}. Reconcile inventory before posting.`);
    }
    const layers = db.query<CostLayer>(`SELECT id,quantity_remaining AS quantityRemaining,unit_cost AS unitCost
      FROM inventory_cost_layers WHERE product_id=? AND warehouse_id=? AND quantity_remaining>0.009
      ORDER BY received_at,created_at,rowid`, [productId, warehouseId]);
    let needed = quantity;
    const allocations: FifoCostPlan['allocations'] = [];
    for (const layer of layers) {
      if (needed <= 0.009) break;
      const available = Math.max(0, round2(Number(layer.quantityRemaining) - Number(reservedByLayer.get(layer.id) || 0)));
      const allocated = round2(Math.min(needed, available));
      if (allocated <= 0) continue;
      allocations.push({ layerId: layer.id, quantity: allocated, unitCost: Number(layer.unitCost) });
      needed = round2(needed - allocated);
    }
    if (needed > 0.009) {
      throw new Error(`FIFO cost layers are short by ${needed} m² for product ${productId} in warehouse ${warehouseId}. Reconcile layer quantities before posting.`);
    }
    const totalCost = round2(allocations.reduce((sum, row) => sum + row.quantity * row.unitCost, 0));
    return { quantity, totalCost, unitCost: round2(totalCost / quantity), allocations };
  }

  static consumeFifo(db: DatabaseManager, transactionId: string, plan: FifoCostPlan): void {
    for (const [allocationOrder, row] of plan.allocations.entries()) {
      const result = db.query<{ id: string }>(`SELECT id FROM inventory_cost_layers
        WHERE id=? AND quantity_remaining+0.009>=?`, [row.layerId, row.quantity])[0];
      if (!result) throw new Error('A FIFO layer changed while the transaction was being posted. Retry the transaction.');
      db.run(`UPDATE inventory_cost_layers SET quantity_remaining=MAX(0,quantity_remaining-?) WHERE id=?`, [row.quantity, row.layerId]);
      db.run(`INSERT INTO inventory_cost_allocations
        (id,outbound_transaction_id,layer_id,allocation_order,quantity,unit_cost) VALUES (?,?,?,?,?,?)`,
        [`icla_${uuidv4().replace(/-/g, '').slice(0, 12)}`, transactionId, row.layerId, allocationOrder, row.quantity, row.unitCost]);
    }
  }

  static restoreIssue(db: DatabaseManager, outboundTransactionId: string, quantityToRestore?: number): number {
    const allocs = db.query<CostAllocation>(`SELECT id,layer_id AS layerId,quantity,quantity_restored AS quantityRestored,unit_cost AS unitCost
      FROM inventory_cost_allocations WHERE outbound_transaction_id=? ORDER BY allocation_order,created_at,id`, [outboundTransactionId]);
    let remaining = quantityToRestore === undefined
      ? round2(allocs.reduce((sum, row) => sum + Number(row.quantity) - Number(row.quantityRestored), 0))
      : round2(quantityToRestore);
    const requested = remaining;
    for (const alloc of allocs) {
      if (remaining <= 0.009) break;
      const restorable = round2(Number(alloc.quantity) - Number(alloc.quantityRestored));
      const value = round2(Math.min(remaining, restorable));
      if (value <= 0) continue;
      db.run(`UPDATE inventory_cost_layers SET quantity_remaining=quantity_remaining+? WHERE id=?`, [value, alloc.layerId]);
      db.run(`UPDATE inventory_cost_allocations SET quantity_restored=quantity_restored+? WHERE id=?`, [value, alloc.id]);
      remaining = round2(remaining - value);
    }
    if (remaining > 0.009) throw new Error(`Cannot restore ${requested} m²: the original FIFO issue has insufficient unreturned quantity.`);
    return round2(requested - remaining);
  }

  static previewRestoreCost(db: DatabaseManager, outboundTransactionId: string, quantityToRestore: number): number {
    const rows = db.query<CostAllocation>(`SELECT id,layer_id AS layerId,quantity,quantity_restored AS quantityRestored,unit_cost AS unitCost
      FROM inventory_cost_allocations WHERE outbound_transaction_id=? ORDER BY allocation_order,created_at,id`, [outboundTransactionId]);
    let needed = round2(quantityToRestore);
    let cost = 0;
    for (const row of rows) {
      if (needed <= 0.009) break;
      const available = Math.max(0, Number(row.quantity) - Number(row.quantityRestored));
      const restored = round2(Math.min(needed, available));
      cost += restored * Number(row.unitCost);
      needed = round2(needed - restored);
    }
    if (needed > 0.009) throw new Error(`The original FIFO issue cannot restore ${quantityToRestore} m².`);
    return round2(cost);
  }

  static restoreInvoiceIssue(db: DatabaseManager, invoiceId: string, productId: string, quantity: number): number {
    const issues = db.query<{ id: string }>(`SELECT id FROM inventory_transactions
      WHERE reference_type='INVOICE' AND reference_id=? AND product_id=? AND type='SALE' ORDER BY created_at,rowid`,
      [invoiceId, productId]);
    let needed = round2(quantity);
    let cost = 0;
    for (const issue of issues) {
      if (needed <= 0.009) break;
      const available = db.query<{ quantity: number }>(`SELECT COALESCE(SUM(quantity-quantity_restored),0) AS quantity
        FROM inventory_cost_allocations WHERE outbound_transaction_id=?`, [issue.id])[0]?.quantity || 0;
      const restoreQuantity = round2(Math.min(needed, Number(available)));
      if (restoreQuantity <= 0) continue;
      cost = round2(cost + this.previewRestoreCost(db, issue.id, restoreQuantity));
      this.restoreIssue(db, issue.id, restoreQuantity);
      needed = round2(needed - restoreQuantity);
    }
    if (needed > 0.009) throw new Error(`FIFO sale allocations are short by ${needed} m² for this return.`);
    return cost;
  }

  static getSourceLayerPlan(db: DatabaseManager, productId: string, warehouseId: string, sourceType: string, sourceId: string, quantity: number): FifoCostPlan {
    const requested = round2(quantity);
    const layers = db.query<CostLayer>(`SELECT id,quantity_remaining AS quantityRemaining,unit_cost AS unitCost
      FROM inventory_cost_layers WHERE product_id=? AND warehouse_id=? AND source_type=? AND source_id=? AND quantity_remaining>0.009
      ORDER BY received_at,created_at,rowid`, [productId, warehouseId, sourceType, sourceId]);
    let needed = requested;
    const allocations: FifoCostPlan['allocations'] = [];
    for (const layer of layers) {
      if (needed <= 0.009) break;
      const allocated = round2(Math.min(needed, Number(layer.quantityRemaining)));
      if (allocated <= 0) continue;
      allocations.push({ layerId: layer.id, quantity: allocated, unitCost: Number(layer.unitCost) });
      needed = round2(needed - allocated);
    }
    if (needed > 0.009) throw new Error(`The purchase lot has only ${round2(requested - needed)} m² available to return.`);
    const totalCost = round2(allocations.reduce((sum, row) => sum + row.quantity * row.unitCost, 0));
    return { quantity: requested, totalCost, unitCost: round2(totalCost / requested), allocations };
  }

  static consumeSpecific(db: DatabaseManager, transactionId: string, plan: FifoCostPlan): void {
    this.consumeFifo(db, transactionId, plan);
  }

  static transferLayers(db: DatabaseManager, fromWarehouseId: string, toWarehouseId: string,
    productId: string, quantity: number, transferId: string, reservedByLayer: Map<string, number> = new Map()): FifoCostPlan {
    const plan = this.planFifo(db, productId, fromWarehouseId, quantity, reservedByLayer);
    for (const row of plan.allocations) {
      db.run('UPDATE inventory_cost_layers SET quantity_remaining=MAX(0,quantity_remaining-?) WHERE id=?', [row.quantity,row.layerId]);
      this.addLayer(db, { productId, warehouseId: toWarehouseId, sourceType: 'TRANSFER', sourceId: transferId,
        date: localDateString(), quantity: row.quantity, unitCost: row.unitCost });
    }
    return plan;
  }

  static removeUnusedSource(db: DatabaseManager, sourceType: string, sourceId: string): void {
    const layers = db.query<any>(`SELECT id,quantity_received AS quantityReceived,quantity_remaining AS quantityRemaining
      FROM inventory_cost_layers WHERE source_type=? AND source_id=?`, [sourceType, sourceId]);
    if (layers.some((layer) => Math.abs(Number(layer.quantityReceived) - Number(layer.quantityRemaining)) > 0.009)) {
      throw new Error('This inventory lot has already been issued. It cannot be removed; post a return or inventory correction instead.');
    }
    for (const layer of layers) db.run('DELETE FROM inventory_cost_layers WHERE id=?', [layer.id]);
  }
}
