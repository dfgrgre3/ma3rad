import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { InventoryCostingService } from './InventoryCostingService';
import { InventoryServicePart12 } from './InventoryServicePart12';

export class InventoryServicePart13 extends InventoryServicePart12 {
  private calculateInventoryReconciliation(
    warehouseId: string | undefined,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): any {
    if (warehouseId) this.branchAccess.requireWarehouseAccess(warehouseId, actor);

    const costingMethod = InventoryCostingService.costingMethod(this.db);

    const warehouseScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    const physicalParams: any[] = [...warehouseScope.params, ...companyScope.params];
    let warehouseFilter = '';
    if (warehouseId) {
      warehouseFilter = ' AND w.id = ?';
      physicalParams.push(warehouseId);
    }

    const physical = this.db.query<any>(`
      SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) AS costPriceValue,
             COALESCE(SUM(ws.quantity_m2), 0) AS totalQty
      FROM warehouse_stock ws
      JOIN products p ON ws.product_id = p.id
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ${warehouseScope.clause} AND ${companyScope.clause}${warehouseFilter}
    `, physicalParams)[0];
    const physicalQty = Number(Number(physical?.totalQty || 0).toFixed(2));
    const costPriceValue = Number(Number(physical?.costPriceValue || 0).toFixed(2));

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
    const layerValue = Number(Number(fifo?.totalFifoCost || 0).toFixed(2));
    const layerQty = Number(Number(fifo?.totalFifoQty || 0).toFixed(2));

    // Value of physical stock according to the configured costing method.
    const physicalValue = costingMethod === 'FIFO' ? layerValue : costPriceValue;

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
    const glBalance = Number(Number(ledger?.balance || 0).toFixed(2));

    const quantityVariance = Number((physicalQty - layerQty).toFixed(2));
    const quantityBalanced = Math.abs(quantityVariance) < 0.01;
    const valueVariance = Number((physicalValue - layerValue).toFixed(2));
    const valueBalanced = Math.abs(valueVariance) < 0.05;

    // GL is maintained at branch/company level, so a warehouse-scoped request
    // cannot be matched directly; the difference must be explained, not hidden.
    const ledgerComparable = !warehouseId;
    const glVariance = Number((layerValue - glBalance).toFixed(2));
    const glBalanced = ledgerComparable && Math.abs(glVariance) < 0.05;

    const unmatchableReasons: string[] = [];
    if (warehouseId) {
      unmatchableReasons.push('حساب الأستاذ العام (1104) يُدار على مستوى الفرع/الشركة، لذا لا يمكن مطابقته مباشرة على مستوى مستودع مستقل؛ المطابقة ممكنة فقط على مستوى الفرع/الشركة.');
    }
    if (!quantityBalanced) {
      unmatchableReasons.push(`فروق كمية: المخزون الفعلي ${physicalQty} مقابل طبقات التكلفة ${layerQty} (فرق ${quantityVariance}).`);
    }
    if (!valueBalanced) {
      unmatchableReasons.push(`فروق قيمة: قيمة المخزون ${physicalValue} مقابل طبقات التكلفة ${layerValue} (فرق ${valueVariance}).`);
    }
    if (ledgerComparable && !glBalanced) {
      unmatchableReasons.push(`فروق أستاذ عام: طبقات التكلفة ${layerValue} مقابل رصيد GL ${glBalance} (فرق ${glVariance}).`);
    }

    const isBalanced = quantityBalanced && valueBalanced && glBalanced;

    return {
      reconciliationDate: localDateString(),
      warehouseId: warehouseId || null,
      costingMethod,
      // 1. Quantity reconciliation
      quantityReconciliation: {
        physicalQty,
        layerQty,
        varianceQty: quantityVariance,
        balanced: quantityBalanced,
      },
      // 2. Value reconciliation (by configured costing method)
      valueReconciliation: {
        method: costingMethod,
        physicalValue,
        layerValue,
        variance: valueVariance,
        balanced: valueBalanced,
      },
      // 3. GL reconciliation (by available accounting scope)
      glReconciliation: {
        glBalance,
        comparable: ledgerComparable,
        variance: ledgerComparable ? glVariance : null,
        balanced: glBalanced,
      },
      // 4. Explanations for differences that cannot be matched at warehouse level
      unmatchableReasons,
      // Backward-compatible flat fields
      totalPhysicalQty: physicalQty,
      totalPhysicalCost: physicalValue,
      totalFifoLayerQty: layerQty,
      totalFifoLayerCost: layerValue,
      totalGlInventoryCost: glBalance,
      variancePhysicalVsFifo: valueVariance,
      variancePhysicalVsFifoQty: quantityVariance,
      quantityBalanced,
      varianceFifoVsGl: glVariance,
      ledgerScope: 'BRANCH_COMPANY',
      ledgerComparable,
      status: isBalanced ? 'BALANCED' : 'DISCREPANCY_DETECTED',
      performedBy: actor.id,
      performedByName: actor.fullName,
    };
  }

  public reconcileInventoryWithGL(warehouseId?: string): any {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    return this.calculateInventoryReconciliation(warehouseId, actor);
  }

  public saveReconciliationLog(input: {
    warehouseId?: string;
    notes?: string;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    const reconciliation = this.calculateInventoryReconciliation(input.warehouseId, actor);
    const branchId = this.branchAccess.getCurrentBranchId(actor);

    this.db.run(`
      INSERT INTO inventory_reconciliation_logs (
        id, reconciliation_date, branch_id, warehouse_id, total_physical_cost,
        total_fifo_layer_cost, total_gl_inventory_cost, variance_physical_vs_fifo,
        variance_fifo_vs_gl, variance_physical_vs_fifo_qty, ledger_comparable,
        status, notes, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      `rec_${uuidv4().substring(0, 8)}`, reconciliation.reconciliationDate, branchId, input.warehouseId || null,
      reconciliation.totalPhysicalCost, reconciliation.totalFifoLayerCost, reconciliation.totalGlInventoryCost,
      reconciliation.variancePhysicalVsFifo, reconciliation.varianceFifoVsGl,
      reconciliation.variancePhysicalVsFifoQty, reconciliation.ledgerComparable ? 1 : 0,
      reconciliation.status, input.notes || null, actor.id,
    ]);
  }

  public getReconciliationLogs(): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    const scope = this.branchAccess.sqlScope('irl.branch_id', undefined, actor);
    return this.db.query<any>(`
      SELECT
        irl.id, irl.reconciliation_date as reconciliationDate,
        irl.branch_id as branchId, irl.warehouse_id as warehouseId, w.name as warehouseName,
        irl.total_physical_cost as totalPhysicalCost,
        irl.total_fifo_layer_cost as totalFifoLayerCost,
        irl.total_gl_inventory_cost as totalGlInventoryCost,
        irl.variance_physical_vs_fifo as variancePhysicalVsFifo,
        irl.variance_physical_vs_fifo_qty as variancePhysicalVsFifoQty,
        irl.variance_fifo_vs_gl as varianceFifoVsGl,
        irl.ledger_comparable as ledgerComparable,
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
