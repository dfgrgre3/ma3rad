import { DatabaseManager } from '../database/db';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../utils/productUnits';
import { InventoryServicePart11 } from './InventoryServicePart11';

export class InventoryServicePart12 extends InventoryServicePart11 {
public getReorderPlanning(warehouseId?: string, search?: string): any[] {
    let sql = `
      SELECT 
        p.id as productId, p.name as productName, p.sku as productSku,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        c.name as categoryName,
        w.id as warehouseId, w.name as warehouseName,
        COALESCE(ws.quantity_m2, 0) as currentStockM2,
        COALESCE(ws.reserved_m2, 0) as reservedStockM2,
        COALESCE(p.cost_price, 0) as unitCost,
        COALESCE(p.min_stock_level, 10) as minStockLevel,
        COALESCE(p.max_stock_level, 100) as maxStockLevel,
        COALESCE(p.reorder_point, 20) as reorderPoint,
        COALESCE(p.safety_stock, 10) as safetyStock,
        COALESCE(p.lead_time_days, 7) as leadTimeDays,
        COALESCE((
          SELECT SUM(poi.quantity_m2 - poi.received_m2)
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.purchase_order_id = po.id
          WHERE poi.product_id = p.id AND po.warehouse_id = w.id AND po.status IN ('SENT', 'CONFIRMED', 'PARTIAL')
        ), 0) as onOrderStockM2,
        COALESCE((
          SELECT SUM(sii.quantity_m2)
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON sii.invoice_id = si.id
          WHERE sii.product_id = p.id AND si.warehouse_id = w.id
            AND si.date >= date('now', '-60 days')
        ), 0) as salesPast60Days
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND w.is_active = 1
    `;
    const params: any[] = [];
    if (warehouseId) {
      sql += ` AND w.id = ?`;
      params.push(warehouseId);
    }
    if (search && search.trim()) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY p.name ASC`;

    const rows = this.db.query<any>(sql, params);

    return rows.map(r => {
      const current = Number(r.currentStockM2 || 0);
      const reserved = Number(r.reservedStockM2 || 0);
      const available = Math.max(0, current - reserved);
      const onOrder = Number(r.onOrderStockM2 || 0);
      const reorderPoint = Number(r.reorderPoint || 20);
      const safetyStock = Number(r.safetyStock || 10);
      const maxStock = Number(r.maxStockLevel || 100);
      const leadTime = Number(r.leadTimeDays || 7);
      const unitCost = Number(r.unitCost || 0);

      // Average daily sales velocity (based on 60 days)
      const sales60 = Number(r.salesPast60Days || 0);
      const dailyRate = Number((sales60 / 60).toFixed(2));

      // Depletion estimate in days
      const depletionDays = dailyRate > 0 ? Math.round(available / dailyRate) : (available > 0 ? 999 : 0);

      // Suggested purchase calculation
      const targetStock = Math.max(maxStock, (dailyRate * leadTime) + safetyStock);
      const netAvailable = available + onOrder;
      const suggestedOrderM2 = Math.max(0, Number((targetStock - netAvailable).toFixed(2)));
      const suggestedOrderValue = Number((suggestedOrderM2 * unitCost).toFixed(2));

      let stockStatus: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_NEEDED' | 'OPTIMAL' | 'OVERSTOCKED' = 'OPTIMAL';
      if (available <= 0) {
        stockStatus = 'OUT_OF_STOCK';
      } else if (available <= safetyStock) {
        stockStatus = 'CRITICAL';
      } else if (available <= reorderPoint) {
        stockStatus = 'REORDER_NEEDED';
      } else if (available > maxStock) {
        stockStatus = 'OVERSTOCKED';
      }

      return {
        ...r,
        currentStockM2: current,
        reservedStockM2: reserved,
        availableStockM2: available,
        onOrderStockM2: onOrder,
        dailySalesRate: dailyRate,
        stockDepletionDays: depletionDays,
        suggestedOrderM2,
        suggestedOrderValue,
        stockStatus,
      };
    });
  }

public updateProductPlanningParameters(productId: string, input: {
    reorderPoint?: number;
    safetyStock?: number;
    leadTimeDays?: number;
    minStockLevel?: number;
    maxStockLevel?: number;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'inventory.adjust');

    this.db.run(`
      UPDATE products
      SET reorder_point = COALESCE(?, reorder_point),
          safety_stock = COALESCE(?, safety_stock),
          lead_time_days = COALESCE(?, lead_time_days),
          min_stock_level = COALESCE(?, min_stock_level),
          max_stock_level = COALESCE(?, max_stock_level),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      input.reorderPoint ?? null,
      input.safetyStock ?? null,
      input.leadTimeDays ?? null,
      input.minStockLevel ?? null,
      input.maxStockLevel ?? null,
      productId
    ]);
  }
}
