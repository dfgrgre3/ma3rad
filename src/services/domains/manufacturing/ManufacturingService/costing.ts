import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type {
  ProductionCostReport,
  ProductionOrder,
  ProductionOrderCost,
  WorkCenterLoad,
} from './types';

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
