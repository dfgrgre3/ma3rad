import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { InventoryCostingService } from './InventoryCostingService';
import type { InventoryKpi, InventoryKpiPermission, WarehouseValuation } from './InventoryValuationService_part01';

const FIFO_LAYER_VALUES_JOIN = `
  LEFT JOIN (
    SELECT product_id, warehouse_id, SUM(quantity_remaining * unit_cost) AS value
    FROM inventory_cost_layers
    WHERE quantity_remaining > 0
    GROUP BY product_id, warehouse_id
  ) icl ON icl.product_id = ws.product_id AND icl.warehouse_id = ws.warehouse_id
`;

export class InventoryValuationService {
  private db = DatabaseManager.getInstance();
  private branches = new BranchAccessService();

  /**
   * FIFO values remaining cost layers; weighted average values the physical
   * balance at the current product cost. Using FIFO layers under AVERAGE_COST
   * would value stock that sales never consumed from those layers.
   */
  private valuePlan(): { fifo: boolean; join: string; value: string } {
    const fifo = InventoryCostingService.costingMethod(this.db) === 'FIFO';
    return {
      fifo,
      join: fifo ? FIFO_LAYER_VALUES_JOIN : '',
      value: fifo
        ? 'COALESCE(icl.value, 0)'
        : 'COALESCE(ws.quantity_m2, 0) * COALESCE(p.cost_price, 0)',
    };
  }

  getByWarehouse(): WarehouseValuation[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.valuation.view');
    const scope = this.branches.warehouseBranchScope('w', undefined, actor);
    const { join, value } = this.valuePlan();
    const warehouses = this.db.query<any>(`
      SELECT w.id, w.name, COUNT(DISTINCT p.id) AS itemsCount,
        COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN ${value} ELSE 0 END),0) AS costValue,
        COALESCE(SUM(ws.quantity_m2 * p.selling_price_m2),0) AS retailValue
      FROM warehouses w
      LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id
      LEFT JOIN products p ON p.id = ws.product_id
      ${join}
      WHERE w.is_active = 1 AND ${scope.clause}
      GROUP BY w.id, w.name ORDER BY w.name
    `, scope.params);
    const quantities = this.db.query<any>(`
      SELECT ws.warehouse_id AS warehouseId, p.product_type AS productType,
        p.base_unit AS baseUnit, p.custom_unit AS customUnit, SUM(ws.quantity_m2) AS quantity
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      WHERE ${scope.clause}
      GROUP BY ws.warehouse_id, p.product_type, p.base_unit, p.custom_unit
    `, scope.params);
    const byWarehouse = new Map<string, { unitLabel: string; quantity: number }[]>();
    for (const row of quantities) {
      const rows = byWarehouse.get(row.warehouseId) || [];
      rows.push({ unitLabel: getProductUnitLabel(row), quantity: Number(row.quantity) || 0 });
      byWarehouse.set(row.warehouseId, rows);
    }
    return warehouses.map((row) => ({
      id: row.id,
      name: row.name,
      itemsCount: Number(row.itemsCount) || 0,
      quantitiesByUnit: byWarehouse.get(row.id) || [],
      costValue: Number(row.costValue) || 0,
      retailValue: Number(row.retailValue) || 0,
    }));
  }

  getKpi(requiredPermission: InventoryKpiPermission = 'ui.inventory.valuation.view'): InventoryKpi {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, requiredPermission);
    const scope = this.branches.warehouseBranchScope('w', undefined, actor);
    const { join, value } = this.valuePlan();
    const summary = this.db.query<any>(`
      SELECT COUNT(DISTINCT p.id) AS skus,
        COALESCE(SUM(${value}),0) AS value,
        SUM(CASE WHEN (ws.quantity_m2 - COALESCE(ws.reserved_m2, 0)) <= p.min_stock_level
                  AND p.min_stock_level > 0 THEN 1 ELSE 0 END) AS low_stock,
        SUM(CASE WHEN (ws.quantity_m2 - COALESCE(ws.reserved_m2, 0)) <= 0 THEN 1 ELSE 0 END) AS zero_stock
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      ${join}
      WHERE ${scope.clause}
    `, scope.params)[0] || {};
    const topValueItems = this.db.query<any>(`
      SELECT p.name, COALESCE(SUM(ws.quantity_m2),0) AS qty,
        COALESCE(SUM(${value}),0) AS value,
        p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      ${join}
      WHERE ws.quantity_m2 > 0 AND ${scope.clause}
      GROUP BY p.id ORDER BY value DESC LIMIT 10
    `, scope.params).map((r) => ({ ...r, value: Number(r.value), qty: Number(r.qty) }));
    const categoryBreakdown = this.db.query<any>(`
      SELECT COALESCE(c.name, 'غير مصنف') AS category, COUNT(DISTINCT p.id) AS items,
        COALESCE(SUM(${value}),0) AS value
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id LEFT JOIN categories c ON c.id = p.category_id
      ${join}
      WHERE ${scope.clause} GROUP BY c.id ORDER BY value DESC LIMIT 8
    `, scope.params).map((r) => ({ ...r, items: Number(r.items), value: Number(r.value) }));
    return {
      totalValue: Number(summary.value) || 0,
      totalSkus: Number(summary.skus) || 0,
      lowStockCount: Number(summary.low_stock) || 0,
      zeroStockCount: Number(summary.zero_stock) || 0,
      topValueItems,
      categoryBreakdown,
    };
  }
}
