import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart01 } from './InventoryServicePart01';

interface StockAdjustmentContext {
  productId: string;
  warehouseId: string;
  actualQuantityM2: number;
  currentM2: number;
  diffM2: number;
  reason: string;
  performedBy: string;
  currentStock: WarehouseStock | null;
  actorId: string;
}

interface StockAdjustmentCost {
  fifoEnabled: boolean;
  costPlan: ReturnType<typeof InventoryCostingService.planFifo> | null;
  unitCost: number;
  transactionBoxes: number;
  totalCost: number;
}

interface AdjustmentProduct {
  costPrice: number;
  metersPerBox: number;
  productType: string;
  baseUnit: string;
}

export class InventoryServicePart02 extends InventoryServicePart01 {
public adjustStock(
    productId: string,
    warehouseId: string,
    actualQuantityM2: number,
    reason: string,
    performedBy = 'usr_admin'
  ): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const performedBy2 = actor.id;
    const currentStock = this.getProductStock(productId, warehouseId);
    const currentM2 = currentStock ? currentStock.quantityM2 : 0;
    if (!Number.isFinite(actualQuantityM2) || actualQuantityM2 < 0 || actualQuantityM2 < Number(currentStock?.reservedM2 || 0)) {
      throw new Error('Adjusted stock cannot be negative or below the reserved quantity.');
    }
    const diffM2 = Number((actualQuantityM2 - currentM2).toFixed(3));

    if (diffM2 === 0) return;

    this.db.executeTransaction((sqliteDb) => {
      this.persistStockAdjustment(sqliteDb, {
        productId,
        warehouseId,
        actualQuantityM2,
        currentM2,
        diffM2,
        reason,
        performedBy: performedBy2,
        currentStock,
        actorId: actor.id,
      });
    });
  }

  private persistStockAdjustment(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext
  ): void {
    const cost = this.calculateAdjustmentCost(sqliteDb, context);
    if (cost.totalCost <= 0) {
      throw new Error('Set a positive product cost before posting an inventory adjustment.');
    }

    this.updateAdjustmentStock(sqliteDb, context);
    const { transactionId, transactionNumber } = this.recordAdjustmentTransaction(sqliteDb, context, cost);
    this.postAdjustmentLedgerEntry(sqliteDb, context, cost, transactionId, transactionNumber);
    this.recordAdjustmentAudit(sqliteDb, context);
    this.updateAdjustmentCostLayers(sqliteDb, context, cost, transactionId);
  }

  private calculateAdjustmentCost(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext
  ): StockAdjustmentCost {
    const { productId, warehouseId, diffM2 } = context;
    const product = sqliteDb.query<AdjustmentProduct>(
      'SELECT cost_price AS costPrice, meters_per_box AS metersPerBox, product_type AS productType, base_unit AS baseUnit FROM products WHERE id = ?',
      [productId]
    )[0];
    const fifoEnabled = InventoryCostingService.costingMethod(sqliteDb) === 'FIFO';
    const costPlan = fifoEnabled && diffM2 < 0
      ? InventoryCostingService.planFifo(sqliteDb, productId, warehouseId, Math.abs(diffM2))
      : null;
    const unitCost = costPlan ? costPlan.unitCost : (product ? product.costPrice : 0);
    const metersPerBox = product ? product.metersPerBox : 1.44;
    const transactionBoxes = product?.productType === 'GENERAL'
      ? product.baseUnit === 'BOX' ? diffM2 : 0
      : Number((diffM2 / metersPerBox).toFixed(2));
    const totalCost = Math.round(Math.abs(diffM2 * Number(unitCost || 0)) * 100) / 100;

    return { fifoEnabled, costPlan, unitCost, transactionBoxes, totalCost };
  }

  private updateAdjustmentStock(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext
  ): void {
    const { currentStock, actualQuantityM2, productId, warehouseId } = context;
    if (currentStock) {
      sqliteDb.run(`
        UPDATE warehouse_stock
        SET quantity_m2 = ?, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = ? AND warehouse_id = ?
      `, [actualQuantityM2, productId, warehouseId]);
      return;
    }

    const stockId = `stk_${uuidv4().substring(0, 8)}`;
    sqliteDb.run(`
      INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
      VALUES (?, ?, ?, ?, 0)
    `, [stockId, warehouseId, productId, actualQuantityM2]);
  }

  private recordAdjustmentTransaction(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext,
    cost: StockAdjustmentCost
  ): { transactionId: string; transactionNumber: string } {
    const { productId, warehouseId, actualQuantityM2, currentM2, diffM2, reason, performedBy } = context;
    const txType: InventoryTransactionType = diffM2 > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_SUB';
    const transactionId = `tx_${uuidv4().substring(0, 8)}`;
    const transactionNumber = sqliteDb.nextNumber('TX-ADJ');

    sqliteDb.run(`
      INSERT INTO inventory_transactions (
        id, transaction_number, type, product_id, warehouse_id,
        quantity_m2, boxes_count, unit_cost, total_cost, reference_type,
        notes, performed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?)
    `, [
      transactionId, transactionNumber, txType, productId, warehouseId,
      diffM2,
      cost.transactionBoxes,
      cost.unitCost,
      Math.abs(diffM2 * cost.unitCost),
      `تسوية جردية: ${reason} (من ${currentM2} ${this.getUnitLabel(productId)} إلى ${actualQuantityM2} ${this.getUnitLabel(productId)})`,
      performedBy,
    ]);

    return { transactionId, transactionNumber };
  }

  private postAdjustmentLedgerEntry(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext,
    cost: StockAdjustmentCost,
    transactionId: string,
    transactionNumber: string
  ): void {
    if (cost.totalCost <= 0) return;

    const { diffM2, reason, actorId } = context;
    postLedgerEntry(sqliteDb.getDatabase(), {
      date: localDateString(),
      description: `Inventory adjustment ${transactionNumber}: ${reason}`,
      referenceType: 'INVENTORY_ADJUSTMENT',
      referenceId: transactionId,
      createdBy: actorId,
      lines: diffM2 > 0
        ? [{ accountCode: '1104', debit: cost.totalCost, credit: 0 }, { accountCode: '5201', debit: 0, credit: cost.totalCost }]
        : [{ accountCode: '5201', debit: cost.totalCost, credit: 0 }, { accountCode: '1104', debit: 0, credit: cost.totalCost }],
    });
  }

  private recordAdjustmentAudit(sqliteDb: DatabaseManager, context: StockAdjustmentContext): void {
    const { productId, currentM2, actualQuantityM2, diffM2, reason, performedBy } = context;
    sqliteDb.run(`
      INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, old_values, new_values)
      VALUES (?, ?, ?, 'تسوية رصيد مخزني', 'INVENTORY', ?, ?, ?)
    `, [
      `aud_${uuidv4().substring(0, 8)}`, performedBy, productId,
      JSON.stringify({ currentM2 }),
      JSON.stringify({ actualQuantityM2, diffM2, reason }),
    ]);
  }

  private updateAdjustmentCostLayers(
    sqliteDb: DatabaseManager,
    context: StockAdjustmentContext,
    cost: StockAdjustmentCost,
    transactionId: string
  ): void {
    if (cost.costPlan) {
      InventoryCostingService.consumeFifo(sqliteDb, transactionId, cost.costPlan);
    } else if (cost.fifoEnabled && context.diffM2 > 0) {
      InventoryCostingService.addLayer(sqliteDb, {
        productId: context.productId,
        warehouseId: context.warehouseId,
        sourceTransactionId: transactionId,
        sourceType: 'INVENTORY_ADJUSTMENT',
        sourceId: transactionId,
        date: localDateString(),
        quantity: context.diffM2,
        unitCost: cost.unitCost,
      });
    }
  }
}
