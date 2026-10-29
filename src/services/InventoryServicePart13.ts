import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart12 } from './InventoryServicePart12';

export class InventoryServicePart13 extends InventoryServicePart12 {
public reconcileInventoryWithGL(warehouseId?: string): any {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.view');

    // 1. Total physical stock cost: SUM(ws.quantity_m2 * p.cost_price)
    let physSql = `
      SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) as totalCost,
             COALESCE(SUM(ws.quantity_m2), 0) as totalQty
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1
    `;
    const physParams: any[] = [];
    if (warehouseId) {
      physSql += ` AND ws.warehouse_id = ?`;
      physParams.push(warehouseId);
    }
    const physRes = this.db.query<any>(physSql, physParams)[0];
    const totalPhysicalCost = Number(Number(physRes?.totalCost || 0).toFixed(2));
    const totalPhysicalQty = Number(Number(physRes?.totalQty || 0).toFixed(2));

    // 2. Total FIFO cost layers: SUM(quantity_remaining * unit_cost)
    let fifoSql = `
      SELECT COALESCE(SUM(quantity_remaining * unit_cost), 0) as totalFifoCost,
             COALESCE(SUM(quantity_remaining), 0) as totalFifoQty
      FROM inventory_cost_layers
      WHERE quantity_remaining > 0
    `;
    const fifoParams: any[] = [];
    if (warehouseId) {
      fifoSql += ` AND warehouse_id = ?`;
      fifoParams.push(warehouseId);
    }
    const fifoRes = this.db.query<any>(fifoSql, fifoParams)[0];
    const totalFifoLayerCost = Number(Number(fifoRes?.totalFifoCost || 0).toFixed(2));
    const totalFifoLayerQty = Number(Number(fifoRes?.totalFifoQty || 0).toFixed(2));

    // 3. Total General Ledger Inventory Account (1104) balance: from chart_of_accounts
    const glRes = this.db.query<any>(`
      SELECT COALESCE(balance, 0) as balance
      FROM chart_of_accounts
      WHERE code = '1104'
    `)[0];
    const totalGlInventoryCost = Number(Number(glRes?.balance || 0).toFixed(2));

    const variancePhysicalVsFifo = Number((totalPhysicalCost - totalFifoLayerCost).toFixed(2));
    const varianceFifoVsGl = Number((totalFifoLayerCost - totalGlInventoryCost).toFixed(2));

    const isBalanced = Math.abs(variancePhysicalVsFifo) < 0.05 && Math.abs(varianceFifoVsGl) < 0.05;

    return {
      reconciliationDate: localDateString(),
      warehouseId: warehouseId || null,
      totalPhysicalQty,
      totalPhysicalCost,
      totalFifoLayerQty,
      totalFifoLayerCost,
      totalGlInventoryCost,
      variancePhysicalVsFifo,
      varianceFifoVsGl,
      status: isBalanced ? 'BALANCED' : 'DISCREPANCY_DETECTED',
      performedBy: actor.id,
      performedByName: actor.fullName,
    };
  }

public saveReconciliationLog(input: {
    warehouseId?: string;
    totalPhysicalCost: number;
    totalFifoLayerCost: number;
    totalGlInventoryCost: number;
    variancePhysicalVsFifo: number;
    varianceFifoVsGl: number;
    status: string;
    notes?: string;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    this.db.run(`
      INSERT INTO inventory_reconciliation_logs (
        id, reconciliation_date, warehouse_id, total_physical_cost,
        total_fifo_layer_cost, total_gl_inventory_cost, variance_physical_vs_fifo,
        variance_fifo_vs_gl, status, notes, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      `rec_${uuidv4().substring(0, 8)}`, localDateString(), input.warehouseId || null,
      input.totalPhysicalCost, input.totalFifoLayerCost, input.totalGlInventoryCost,
      input.variancePhysicalVsFifo, input.varianceFifoVsGl, input.status,
      input.notes || null, actor.id
    ]);
  }

public getReconciliationLogs(): any[] {
    return this.db.query<any>(`
      SELECT 
        irl.id, irl.reconciliation_date as reconciliationDate,
        irl.warehouse_id as warehouseId, w.name as warehouseName,
        irl.total_physical_cost as totalPhysicalCost,
        irl.total_fifo_layer_cost as totalFifoLayerCost,
        irl.total_gl_inventory_cost as totalGlInventoryCost,
        irl.variance_physical_vs_fifo as variancePhysicalVsFifo,
        irl.variance_fifo_vs_gl as varianceFifoVsGl,
        irl.status, irl.notes,
        u.full_name as performedByName, irl.created_at as createdAt
      FROM inventory_reconciliation_logs irl
      LEFT JOIN warehouses w ON irl.warehouse_id = w.id
      LEFT JOIN users u ON irl.performed_by = u.id
      ORDER BY irl.created_at DESC
      LIMIT 100
    `);
  }
}
