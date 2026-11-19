import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type {
  MaterialShortage,
  ProductionCostReport,
  ProductionOrder,
  ProductionOrderCost,
  PurchaseSuggestion,
  WorkCenterLoad,
} from './types';
import { PurchaseRequestService, type RequestPriority } from '../../purchases/PurchaseRequestService';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Production costing & capacity planning queries.
 *
 * Cost model:
 *  - materialCost: consumed_qty × products.cost_price (actual materials issued).
 *  - laborCost:    operations.actual_minutes × work_centers.cost_per_hour / 60.
 * Planned-but-unissued materials and unstarted operations contribute 0, so the
 * report reflects incurred cost; WIP valuation covers the planned side.
 */
export class CostingModule {
  private readonly ctx: ManufacturingContext;
  private readonly orders: ProductionOrdersModule;
  constructor(ctx: ManufacturingContext, orders: ProductionOrdersModule) { this.ctx = ctx; this.orders = orders; }

  public getProductionOrderCost(orderId: string): ProductionOrderCost {
    const actor = this.ctx.require('manufacturing.view');
    const order = this.orders.getProductionOrder(orderId);
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
    return this.computeOrderCost(order);
  }

  public getProductionCostReport(): ProductionCostReport {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.ctx.db.query<ProductionOrder>(
      `SELECT o.*, p.name AS product_name, b.name AS bom_name, br.name AS branch_name,
              w.name AS warehouseName, o.warehouse_id AS warehouseId,
              so.order_number AS salesOrderNumber, c.name AS customerName
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       JOIN bills_of_materials b ON b.id = o.bom_id
       LEFT JOIN branches br ON br.id = o.branch_id
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN orders so ON so.id = o.sales_order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.status != 'CANCELLED' AND ${scope.clause}
       ORDER BY o.created_at DESC`,
      scope.params
    );
    const orders = rows.map((order) => this.computeOrderCost(order));
    return {
      orders,
      totalMaterialCost: round2(orders.reduce((sum, row) => sum + row.materialCost, 0)),
      totalLaborCost: round2(orders.reduce((sum, row) => sum + row.laborCost, 0)),
      totalCost: round2(orders.reduce((sum, row) => sum + row.totalCost, 0)),
      totalQuantity: orders.reduce((sum, row) => sum + row.quantity, 0),
    };
  }

  /**
   * Component shortages for active production orders: remaining material need
   * (planned − consumed) versus on-hand stock in each order's warehouse.
   * Note: stock is shared across orders, so simultaneous orders may compete
   * for the same balance — treat deficits as alerts, not reservations.
   */
  public getMaterialShortages(): MaterialShortage[] {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.ctx.db.query<any>(
      `SELECT o.id AS orderId, o.order_number AS orderNumber, o.status AS orderStatus,
              o.warehouse_id AS warehouseId,
              m.product_id AS componentProductId, p.name AS componentName,
              (m.planned_qty - m.consumed_qty) AS requiredQty,
              COALESCE(ws.quantity_m2, 0) AS availableQty
       FROM production_order_materials m
       JOIN production_orders o ON o.id = m.order_id
       JOIN products p ON p.id = m.product_id
       LEFT JOIN warehouse_stock ws
         ON ws.warehouse_id = o.warehouse_id AND ws.product_id = m.product_id
       WHERE o.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS')
         AND (m.planned_qty - m.consumed_qty) > 0
         AND ${scope.clause}`,
      scope.params
    );
    return rows
      .map((row) => {
        const requiredQty = Number(row.requiredQty) || 0;
        const availableQty = Number(row.availableQty) || 0;
        return {
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          orderStatus: row.orderStatus,
          componentProductId: row.componentProductId,
          componentName: row.componentName,
          warehouseId: row.warehouseId,
          requiredQty,
          availableQty,
          deficitQty: Math.round((requiredQty - availableQty) * 1000) / 1000,
        };
      })
      .filter((row) => row.deficitQty > 0);
  }

  /**
   * Aggregated purchase suggestions: component deficits grouped by product and
   * warehouse across all active production orders. Stock is counted once per
   * product+warehouse (not per order), so simultaneous orders don't inflate it.
   */
  public getPurchaseSuggestions(): PurchaseSuggestion[] {
    const shortages = this.getMaterialShortages();
    const groups = new Map<string, {
      componentProductId: string; componentName: string; warehouseId: string;
      totalRequiredQty: number; availableQty: number; orderIds: Set<string>; orderNumbers: Set<string>;
    }>();
    for (const row of shortages) {
      const key = `${row.componentProductId}|${row.warehouseId}`;
      const group = groups.get(key) || {
        componentProductId: row.componentProductId,
        componentName: row.componentName,
        warehouseId: row.warehouseId,
        totalRequiredQty: 0,
        availableQty: row.availableQty,
        orderIds: new Set<string>(),
        orderNumbers: new Set<string>(),
      };
      group.totalRequiredQty += row.requiredQty;
      group.availableQty = Math.max(group.availableQty, row.availableQty);
      group.orderIds.add(row.orderId);
      group.orderNumbers.add(row.orderNumber);
      groups.set(key, group);
    }
    const productIds = [...groups.values()].map((group) => group.componentProductId);
    const placeholders = productIds.map(() => '?').join(',');
    const costs = new Map(
      productIds.length === 0 ? [] : this.ctx.db.query<{ id: string; costPrice: number }>(
        `SELECT id, cost_price AS costPrice FROM products WHERE id IN (${placeholders})`,
        productIds
      ).map((row) => [row.id, Number(row.costPrice || 0) / 100])
    );
    return [...groups.values()]
      .map((group) => {
        const unitCost = costs.get(group.componentProductId) || 0;
        const suggestedQty = Math.round((group.totalRequiredQty - group.availableQty) * 1000) / 1000;
        return {
          componentProductId: group.componentProductId,
          componentName: group.componentName,
          warehouseId: group.warehouseId,
          totalRequiredQty: Math.round(group.totalRequiredQty * 1000) / 1000,
          availableQty: group.availableQty,
          suggestedQty,
          unitCost,
          estimatedValue: Math.round(suggestedQty * unitCost * 100) / 100,
          affectedOrders: group.orderIds.size,
          orderNumbers: [...group.orderNumbers],
        };
      })
      .filter((row) => row.suggestedQty > 0)
      .sort((a, b) => b.estimatedValue - a.estimatedValue);
  }

  /**
   * Create purchase requests (one per warehouse) covering the aggregated
   * production shortages. Requires `ui.purchases.requests.create`.
   */
  public createPurchaseRequestsFromShortages(input?: {
    warehouseId?: string;
    priority?: RequestPriority;
    neededBy?: string;
  }): Array<{ warehouseId: string; requestId: string; requestNumber: string; itemsCount: number }> {
    this.ctx.guardWrites();
    this.ctx.require('manufacturing.manage');
    const suggestions = this.getPurchaseSuggestions()
      .filter((row) => !input?.warehouseId || row.warehouseId === input.warehouseId);
    if (suggestions.length === 0) throw new Error('لا توجد نواقص مواد لإنشاء طلب شراء.');

    const byWarehouse = new Map<string, PurchaseSuggestion[]>();
    for (const suggestion of suggestions) {
      const list = byWarehouse.get(suggestion.warehouseId) || [];
      list.push(suggestion);
      byWarehouse.set(suggestion.warehouseId, list);
    }

    const purchaseRequests = new PurchaseRequestService();
    const created: Array<{ warehouseId: string; requestId: string; requestNumber: string; itemsCount: number }> = [];
    for (const [warehouseId, items] of byWarehouse) {
      const request = purchaseRequests.createRequest({
        warehouseId,
        neededBy: input?.neededBy,
        priority: input?.priority || 'HIGH',
        notes: `اقتراح شراء من نواقص أوامر الإنتاج: ${items.flatMap((item) => item.orderNumbers).slice(0, 10).join('، ')}`,
        items: items.map((item) => ({
          productId: item.componentProductId,
          quantityM2: item.suggestedQty,
          estimatedUnitCost: item.unitCost,
          notes: `عجز إنتاج: مطلوب ${item.totalRequiredQty} / متاح ${item.availableQty} — أوامر: ${item.orderNumbers.join('، ')}`,
        })),
      });
      created.push({ warehouseId, requestId: request.id, requestNumber: request.requestNumber, itemsCount: items.length });
    }
    this.ctx.audit('إنشاء طلبات شراء من نواقص الإنتاج', 'purchase_requests', { count: created.length });
    return created;
  }

  /** Per-work-center load for active production orders (capacity planning). */
  public getCapacityPlan(): WorkCenterLoad[] {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor);
    const centers = this.ctx.db.query<any>(
      `SELECT wc.id, wc.code, wc.name, wc.branch_id AS branchId, wc.capacity_per_day AS capacityPerDay,
              wc.cost_per_hour AS costPerHour
       FROM work_centers wc
       WHERE wc.is_active = 1 AND ${scope.clause}
       ORDER BY wc.code`,
      scope.params
    );
    return centers.map((center) => {
      const load = this.ctx.db.query<any>(
        `SELECT COUNT(DISTINCT o.id) AS activeOrders,
                COALESCE(SUM(op.planned_minutes), 0) AS plannedMinutes,
                COALESCE(SUM(CASE WHEN op.status IN ('IN_PROGRESS', 'COMPLETED') THEN op.actual_minutes ELSE 0 END), 0) AS actualMinutes
         FROM production_order_operations op
         JOIN production_orders o ON o.id = op.order_id
         WHERE op.work_center_id = ? AND o.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS')`,
        [center.id]
      )[0];
      const plannedMinutes = Number(load?.plannedMinutes || 0);
      const capacityPerDay = Number(center.capacityPerDay || 0);
      // capacityPerDay is expressed in hours/day → minutes = hours × 60.
      const loadPercent = capacityPerDay > 0 ? round2((plannedMinutes / (capacityPerDay * 60)) * 100) : null;
      return {
        workCenterId: center.id,
        code: center.code,
        name: center.name,
        branchId: center.branchId,
        capacityPerDay,
        activeOrders: Number(load?.activeOrders || 0),
        plannedMinutes,
        actualMinutes: Number(load?.actualMinutes || 0),
        loadPercent,
      };
    });
  }

  /**
   * Advanced manufacturing analytics:
   *  - workCenterEfficiency: planned vs actual minutes per work center.
   *  - orderVariance: planned vs actual labor minutes per completed order.
   *  - monthlyOutput: completed quantity/cost grouped by completion month.
   */
  public getManufacturingAnalytics(): {
    workCenterEfficiency: Array<{
      workCenterId: string; code: string; name: string;
      plannedMinutes: number; actualMinutes: number;
      completedOperations: number; efficiencyPercent: number | null;
    }>;
    orderVariance: Array<{
      orderId: string; orderNumber: string; productName: string;
      plannedMinutes: number; actualMinutes: number; variancePercent: number | null;
    }>;
    monthlyOutput: Array<{ month: string; orders: number; quantity: number; totalCost: number }>;
  } {
    const actor = this.ctx.require('manufacturing.view');
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);

    const centers = this.ctx.db.query<any>(
      `SELECT wc.id, wc.code, wc.name FROM work_centers wc
       WHERE wc.is_active = 1 AND ${this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor).clause}
       ORDER BY wc.code`,
      this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor).params
    );
    const workCenterEfficiency = centers.map((center) => {
      const row = this.ctx.db.query<any>(
        `SELECT COALESCE(SUM(op.planned_minutes),0) AS plannedMinutes,
                COALESCE(SUM(CASE WHEN op.status = 'COMPLETED' THEN op.actual_minutes ELSE 0 END),0) AS actualMinutes,
                COALESCE(SUM(CASE WHEN op.status = 'COMPLETED' THEN 1 ELSE 0 END),0) AS completedOperations
         FROM production_order_operations op
         JOIN production_orders o ON o.id = op.order_id
         WHERE op.work_center_id = ? AND o.status != 'CANCELLED'`,
        [center.id]
      )[0];
      const planned = Number(row?.plannedMinutes || 0);
      const actual = Number(row?.actualMinutes || 0);
      return {
        workCenterId: center.id,
        code: center.code,
        name: center.name,
        plannedMinutes: planned,
        actualMinutes: actual,
        completedOperations: Number(row?.completedOperations || 0),
        // >100% means finished faster than planned.
        efficiencyPercent: actual > 0 ? round2((planned / actual) * 100) : null,
      };
    });

    const varianceRows = this.ctx.db.query<any>(
      `SELECT o.id AS orderId, o.order_number AS orderNumber, p.name AS productName,
              COALESCE(SUM(op.planned_minutes),0) AS plannedMinutes,
              COALESCE(SUM(CASE WHEN op.status = 'COMPLETED' THEN op.actual_minutes ELSE 0 END),0) AS actualMinutes
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       LEFT JOIN production_order_operations op ON op.order_id = o.id
       WHERE o.status = 'COMPLETED' AND ${scope.clause}
       GROUP BY o.id
       ORDER BY o.completed_at DESC`,
      scope.params
    );
    const orderVariance = varianceRows.map((row) => {
      const planned = Number(row.plannedMinutes || 0);
      const actual = Number(row.actualMinutes || 0);
      return {
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        productName: row.productName,
        plannedMinutes: planned,
        actualMinutes: actual,
        variancePercent: actual > 0 ? round2(((planned - actual) / actual) * 100) : null,
      };
    });

    const completedOrders = this.ctx.db.query<ProductionOrder>(
      `SELECT o.*, p.name AS product_name, b.name AS bom_name
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       JOIN bills_of_materials b ON b.id = o.bom_id
       WHERE o.status = 'COMPLETED' AND o.completed_at IS NOT NULL AND ${scope.clause}
       ORDER BY o.completed_at DESC`,
      scope.params
    );
    const monthlyMap = new Map<string, { month: string; orders: number; quantity: number; totalCost: number }>();
    for (const order of completedOrders) {
      const month = String(order.completedAt || '').slice(0, 7);
      if (!month) continue;
      const entry = monthlyMap.get(month) || { month, orders: 0, quantity: 0, totalCost: 0 };
      entry.orders += 1;
      entry.quantity += Number(order.quantity) || 0;
      entry.totalCost += this.computeOrderCost(order).totalCost;
      monthlyMap.set(month, entry);
    }
    const monthlyOutput = [...monthlyMap.values()]
      .map((entry) => ({ ...entry, quantity: round2(entry.quantity), totalCost: round2(entry.totalCost) }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return { workCenterEfficiency, orderVariance, monthlyOutput };
  }

  private computeOrderCost(order: ProductionOrder): ProductionOrderCost {
    const materialRows = this.ctx.db.query<any>(
      `SELECT m.consumed_qty AS consumedQty, pr.cost_price AS costPrice
       FROM production_order_materials m
       JOIN products pr ON pr.id = m.product_id
       WHERE m.order_id = ?`,
      [order.id]
    );
    const materialCost = round2(materialRows.reduce(
      (sum, row) => sum + (Number(row.consumedQty) || 0) * (Number(row.costPrice) || 0) / 100,
      0
    ));
    const laborRows = this.ctx.db.query<any>(
      `SELECT op.actual_minutes AS actualMinutes, wc.cost_per_hour AS costPerHour
       FROM production_order_operations op
       JOIN work_centers wc ON wc.id = op.work_center_id
       WHERE op.order_id = ?`,
      [order.id]
    );
    const laborCost = round2(laborRows.reduce(
      (sum, row) => sum + (Number(row.actualMinutes) || 0) * (Number(row.costPerHour) || 0) / 100 / 60,
      0
    ));
    const totalCost = round2(materialCost + laborCost);
    const quantity = Number(order.quantity) || 0;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: order.productId,
      productName: order.productName || '',
      quantity,
      status: order.status,
      materialCost,
      laborCost,
      totalCost,
      costPerUnit: quantity > 0 ? round2(totalCost / quantity) : 0,
    };
  }
}
