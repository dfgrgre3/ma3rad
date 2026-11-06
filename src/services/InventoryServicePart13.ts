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
  private calculateInventoryReconciliation(
    warehouseId: string | undefined,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): any {
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId, actor);

    const warehouseScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const physicalParams: any[] = [...warehouseScope.params, ...companyScope.params];
    let warehouseFilter = '';
    if (warehouseId) {
      warehouseFilter = ' AND w.id = ?';
      physicalParams.push(warehouseId);
    }

    const physical = this.db.query<any>(`
      SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) AS totalCost,
             COALESCE(SUM(ws.quantity_m2), 0) AS totalQty
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND ${warehouseScope.clause} AND ${companyScope.clause}${warehouseFilter}
    `, physicalParams)[0];
    const totalPhysicalCost = Number(Number(physical?.totalCost || 0).toFixed(2));
    const totalPhysicalQty = Number(Number(physical?.totalQty || 0).toFixed(2));

    const fifoParams: any[] = [...warehouseScope.params, ...companyScope.params];
    if (warehouseId) fifoParams.push(warehouseId);
    const fifo = this.db.query<any>(`
      SELECT COALESCE(SUM(icl.quantity_remaining * icl.unit_cost), 0) AS totalFifoCost,
             COALESCE(SUM(icl.quantity_remaining), 0) AS totalFifoQty
      FROM inventory_cost_layers icl
      JOIN warehouses w ON w.id = icl.warehouse_id
      WHERE icl.quantity_remaining > 0
        AND ${warehouseScope.clause} AND ${companyScope.clause}${warehouseFilter}
    `, fifoParams)[0];
    const totalFifoLayerCost = Number(Number(fifo?.totalFifoCost || 0).toFixed(2));
    const totalFifoLayerQty = Number(Number(fifo?.totalFifoQty || 0).toFixed(2));

    const ledgerBranchScope = this.branchAccess.sqlScope('je.branch_id', undefined, actor);
    const ledgerCompanyScope = this.branchAccess.companyScope('je.company_id', actor);
    const ledger = this.db.query<{ balance: number }>(`
      SELECT COALESCE(SUM(jel.debit - jel.credit), 0) AS balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.entry_id
      JOIN chart_of_accounts coa ON coa.id = jel.account_id
      WHERE je.is_posted = 1 AND coa.code = '1104'
        AND ${ledgerBranchScope.clause} AND ${ledgerCompanyScope.clause}
    `, [...ledgerBranchScope.params, ...ledgerCompanyScope.params])[0];
    const totalGlInventoryCost = Number(Number(ledger?.balance || 0).toFixed(2));

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

  public reconcileInventoryWithGL(warehouseId?: string): any {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.view');
    return this.calculateInventoryReconciliation(warehouseId, actor);
  }

  public saveReconciliationLog(input: {
    warehouseId?: string;
    notes?: string;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');
    const reconciliation = this.calculateInventoryReconciliation(input.warehouseId, actor);
    const branchId = this.branchAccess.getCurrentBranchId(actor);

    this.db.run(`
      INSERT INTO inventory_reconciliation_logs (
        id, reconciliation_date, branch_id, warehouse_id, total_physical_cost,
        total_fifo_layer_cost, total_gl_inventory_cost, variance_physical_vs_fifo,
        variance_fifo_vs_gl, status, notes, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      `rec_${uuidv4().substring(0, 8)}`, reconciliation.reconciliationDate, branchId, input.warehouseId || null,
      reconciliation.totalPhysicalCost, reconciliation.totalFifoLayerCost, reconciliation.totalGlInventoryCost,
      reconciliation.variancePhysicalVsFifo, reconciliation.varianceFifoVsGl, reconciliation.status,
      input.notes || null, actor.id
    ]);
  }

  public getReconciliationLogs(): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.view');
    const scope = this.branchAccess.sqlScope('irl.branch_id', undefined, actor);
    return this.db.query<any>(`
      SELECT
        irl.id, irl.reconciliation_date as reconciliationDate,
        irl.branch_id as branchId, irl.warehouse_id as warehouseId, w.name as warehouseName,
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
      WHERE ${scope.clause}
      ORDER BY irl.created_at DESC
      LIMIT 100
    `, scope.params);
  }
}
