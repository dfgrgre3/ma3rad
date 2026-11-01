import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { BranchAccessService } from './BranchAccessService';
import { getProductUnitLabel } from '../utils/productUnits';

export interface WarehouseValuation {
  id: string;
  name: string;
  itemsCount: number;
  quantitiesByUnit: { unitLabel: string; quantity: number }[];
  costValue: number;
  retailValue: number;
}

export interface InventoryKpi {
  totalValue: number;
  totalSkus: number;
  lowStockCount: number;
  zeroStockCount: number;
  topValueItems: { name: string; value: number; qty: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[];
  categoryBreakdown: { category: string; items: number; value: number }[];
}

export class InventoryValuationService {
  private db = DatabaseManager.getInstance();
  private branches = new BranchAccessService();

  getByWarehouse(): WarehouseValuation[] {
    const scope = this.branches.warehouseBranchScope('w', undefined, AuthService.requireAuth());
    const warehouses = this.db.query<any>(`
      SELECT w.id, w.name, COUNT(DISTINCT ws.product_id) AS itemsCount,
        COALESCE(SUM(ws.quantity_m2 * p.cost_price),0) AS costValue,
        COALESCE(SUM(ws.quantity_m2 * p.selling_price_m2),0) AS retailValue
      FROM warehouses w
      LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id
      LEFT JOIN products p ON p.id = ws.product_id AND p.is_active = 1
      WHERE w.is_active = 1 AND ${scope.clause}
      GROUP BY w.id, w.name ORDER BY w.name
    `, scope.params);
    const quantities = this.db.query<any>(`
      SELECT ws.warehouse_id AS warehouseId, p.product_type AS productType,
        p.base_unit AS baseUnit, p.custom_unit AS customUnit, SUM(ws.quantity_m2) AS quantity
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      WHERE p.is_active = 1 AND ${scope.clause}
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

  getKpi(): InventoryKpi {
    const scope = this.branches.warehouseBranchScope('w', undefined, AuthService.requireAuth());
    const summary = this.db.query<any>(`
      SELECT COUNT(DISTINCT ws.product_id) AS skus,
        COALESCE(SUM(ws.quantity_m2 * p.cost_price),0) AS value,
        SUM(CASE WHEN ws.quantity_m2 <= p.min_stock_level AND p.min_stock_level > 0 THEN 1 ELSE 0 END) AS low_stock,
        SUM(CASE WHEN ws.quantity_m2 <= 0 THEN 1 ELSE 0 END) AS zero_stock
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      WHERE p.is_active = 1 AND ${scope.clause}
    `, scope.params)[0] || {};
    const topValueItems = this.db.query<any>(`
      SELECT p.name, COALESCE(SUM(ws.quantity_m2),0) AS qty,
        COALESCE(SUM(ws.quantity_m2 * p.cost_price),0) AS value,
        p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id
      WHERE ws.quantity_m2 > 0 AND ${scope.clause}
      GROUP BY p.id ORDER BY value DESC LIMIT 10
    `, scope.params).map((r) => ({ ...r, value: Number(r.value), qty: Number(r.qty) }));
    const categoryBreakdown = this.db.query<any>(`
      SELECT COALESCE(c.name, 'غير مصنف') AS category, COUNT(DISTINCT p.id) AS items,
        COALESCE(SUM(ws.quantity_m2 * p.cost_price),0) AS value
      FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      JOIN products p ON p.id = ws.product_id LEFT JOIN categories c ON c.id = p.category_id
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
