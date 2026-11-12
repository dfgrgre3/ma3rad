import { DatabaseManager } from '../../../database/repositories/databaseManager';
import type { Warehouse, WarehouseStock, InventoryTransaction, InventoryTransactionType, UnitType } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { InventoryCostingService } from './InventoryCostingService';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { InventoryServicePart11 } from './InventoryServicePart11';
import { StockTrackedProductPolicy } from './StockTrackedProductPolicy';

export class InventoryServicePart12 extends InventoryServicePart11 {
public getReorderPlanning(warehouseId?: string, search?: string, includeInsufficientData = true): any[] {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    if (warehouseId) this.branchAccess.requireWarehouseAuthorization(warehouseId, actor);
    const branchScope = this.branchAccess.warehouseBranchScope('w', undefined, actor);
    const companyScope = this.branchAccess.companyScope('w.company_id', actor);
    let sql = `
      SELECT 
        p.id as productId, p.name as productName, p.sku as productSku,
        p.product_type as productType, p.base_unit as baseUnit, p.custom_unit as customUnit,
        c.name as categoryName,
        w.id as warehouseId, w.name as warehouseName,
        COALESCE(ws.quantity_m2, 0) as currentStockM2,
        COALESCE(ws.reserved_m2, 0) as reservedStockM2,
        COALESCE(p.cost_price, 0) as unitCost,
        COALESCE(pwp.min_stock_level, p.min_stock_level, 0) as minStockLevel,
        COALESCE(pwp.max_stock_level, p.max_stock_level, 0) as maxStockLevel,
        COALESCE(pwp.reorder_point, p.reorder_point, 0) as reorderPoint,
        COALESCE(pwp.safety_stock, p.safety_stock, 0) as safetyStock,
        COALESCE(pwp.lead_time_days, p.lead_time_days, 7) as leadTimeDays,
        COALESCE(pwp.review_period_days, 30) as reviewPeriodDays,
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
            AND si.date >= date('now', '-60 days') AND si.date <= date('now')
            AND COALESCE(si.invoice_status, 'COMPLETED') != 'VOID'
        ), 0) as salesPast60DaysGross,
        COALESCE((
          SELECT SUM(sri.quantity_m2)
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN sales_invoices original ON original.id = sr.original_invoice_id
          WHERE sri.product_id = p.id AND sr.warehouse_id = w.id
            AND original.warehouse_id = w.id
            AND sr.date >= date('now', '-60 days') AND sr.date <= date('now')
            AND COALESCE(original.invoice_status, 'COMPLETED') != 'VOID'
        ), 0) as returnsPast60Days
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouse_stock ws ON p.id = ws.product_id AND w.id = ws.warehouse_id
      LEFT JOIN product_warehouse_planning pwp
        ON pwp.product_id = p.id AND pwp.warehouse_id = w.id
      WHERE p.is_active = 1 AND w.is_active = 1
        AND p.product_type NOT IN ('SERVICE')
        AND (p.base_unit IS NULL OR p.base_unit != 'SERVICE')
        AND ${branchScope.clause} AND ${companyScope.clause}
    `;
    const params: any[] = [...branchScope.params, ...companyScope.params];
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
      const minStock = Number(r.minStockLevel || 0);
      const safetyStock = Number(r.safetyStock || 0);
      const maxStock = Number(r.maxStockLevel || 0);
      const reorderPoint = Number(r.reorderPoint || 0);
      const leadTime = Number(r.leadTimeDays || 7);
      const reviewPeriod = Number(r.reviewPeriodDays || 30);
      const unitCost = Number(r.unitCost || 0);

      const grossSales60 = Number(r.salesPast60DaysGross || 0);
      const returns60 = Number(r.returnsPast60Days || 0);
      const netSales60 = Math.max(0, grossSales60 - returns60);
      const dailyRate = Number((netSales60 / 60).toFixed(2));

      const depletionDays = dailyRate > 0 ? Math.round(available / dailyRate) : (available > 0 ? 999 : 0);

      // Explicit planning: never assume a 100-unit ceiling. When no max is
      // configured we size purely from demand + safety stock.
      const hasDemandData = netSales60 > 0;
      const demandDuringLeadTime = Number((dailyRate * leadTime).toFixed(2));
      const demandDuringReview = Number((dailyRate * reviewPeriod).toFixed(2));
      let targetStock = Math.max(minStock, demandDuringLeadTime + safetyStock);
      if (maxStock > 0) targetStock = Math.min(targetStock, maxStock);
      if (maxStock > 0) targetStock = Math.max(targetStock, Math.min(maxStock, demandDuringReview + safetyStock));

      const netAvailable = available + onOrder;
      const suggestedOrderM2 = Math.max(0, Number((targetStock - netAvailable).toFixed(2)));
      const suggestedOrderValue = Number((suggestedOrderM2 * unitCost).toFixed(2));

      // Reasoning for the buyer.
      const reasons: string[] = [];
      if (!hasDemandData) reasons.push('لا توجد مبيعات صافية في آخر 60 يوماً؛ الاقتراح يعتمد على الحد الأدنى/الأمان فقط.');
      if (maxStock <= 0) reasons.push('لم يُعرَّف حد أقصى للصنف؛ تم استخدام الطلب + مخزون الأمان.');
      if (suggestedOrderM2 <= 0) reasons.push('الرصيد (مع الطلبات المفتوحة) يغطي الهدف، لا حاجة لطلب.');
      if (available <= 0) reasons.push('نفاد المخزون.');
      else if (available <= safetyStock) reasons.push('الرصيد أقل من مخزون الأمان.');
      else if (reorderPoint > 0 && available <= reorderPoint) reasons.push('الرصيد وصل نقطة إعادة الطلب.');
      const suggestionReason = reasons.length ? reasons.join(' ') : 'اقتراح مبنٍ على متوسط المبيعات الصافية ووقت التوريد.';

      let stockStatus: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_NEEDED' | 'OPTIMAL' | 'OVERSTOCKED' | 'INSUFFICIENT_DATA' = 'OPTIMAL';
      if (!hasDemandData && maxStock <= 0 && minStock <= 0 && reorderPoint <= 0) {
        stockStatus = 'INSUFFICIENT_DATA';
      } else if (available <= 0) {
        stockStatus = 'OUT_OF_STOCK';
      } else if (available <= safetyStock) {
        stockStatus = 'CRITICAL';
      } else if (reorderPoint > 0 && available <= reorderPoint) {
        stockStatus = 'REORDER_NEEDED';
      } else if (maxStock > 0 && available > maxStock) {
        stockStatus = 'OVERSTOCKED';
      }

      const predictionStatus = hasDemandData ? 'OK' : 'INSUFFICIENT_DATA';

      const row = {
        ...r,
        currentStockM2: current,
        reservedStockM2: reserved,
        availableStockM2: available,
        onOrderStockM2: onOrder,
        dailySalesRate: dailyRate,
        stockDepletionDays: depletionDays,
        netSalesPast60Days: netSales60,
        salesPast60Days: netSales60,
        suggestedOrderM2,
        suggestedOrderValue,
        stockStatus,
        predictionStatus,
        suggestionReason,
        hasEnoughData: hasDemandData,
      };

      if (!includeInsufficientData && predictionStatus === 'INSUFFICIENT_DATA' && suggestedOrderM2 <= 0) {
        return null;
      }
      return row;
    }).filter(Boolean);
  }

public updateProductPlanningParameters(productId: string, input: {
    warehouseId?: string;
    reorderPoint?: number;
    safetyStock?: number;
    leadTimeDays?: number;
    minStockLevel?: number;
    maxStockLevel?: number;
    reviewPeriodDays?: number;
  }): void {
    this.assertInventoryModuleEnabled();
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.adjust');
    StockTrackedProductPolicy.assertStockTracked(this.db, productId, 'إعدادات إعادة الطلب');

    if (input.warehouseId) {
      this.db.run(`
        INSERT INTO product_warehouse_planning (
          product_id, warehouse_id, min_stock_level, max_stock_level, safety_stock,
          reorder_point, lead_time_days, review_period_days, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(product_id, warehouse_id) DO UPDATE SET
          min_stock_level = COALESCE(excluded.min_stock_level, product_warehouse_planning.min_stock_level),
          max_stock_level = COALESCE(excluded.max_stock_level, product_warehouse_planning.max_stock_level),
          safety_stock = COALESCE(excluded.safety_stock, product_warehouse_planning.safety_stock),
          reorder_point = COALESCE(excluded.reorder_point, product_warehouse_planning.reorder_point),
          lead_time_days = COALESCE(excluded.lead_time_days, product_warehouse_planning.lead_time_days),
          review_period_days = COALESCE(excluded.review_period_days, product_warehouse_planning.review_period_days),
          updated_at = CURRENT_TIMESTAMP
      `, [
        productId, input.warehouseId,
        input.minStockLevel ?? null, input.maxStockLevel ?? null, input.safetyStock ?? null,
        input.reorderPoint ?? null, input.leadTimeDays ?? null, input.reviewPeriodDays ?? null,
      ]);
    } else {
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
}
