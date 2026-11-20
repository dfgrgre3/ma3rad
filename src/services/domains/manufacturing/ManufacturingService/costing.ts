import type { ManufacturingContext } from './context';
import type { ProductionOrdersModule } from './productionOrders';
import type {
  MaterialShortage,
  OeeWorkCenterRow,
  OperatorLaborDailyRow,
  OperatorLaborRow,
  ProductionCostReport,
  ProductionOrder,
  ProductionOrderCost,
  ProductionScheduleOptions,
  ProductionScheduleRow,
  PurchaseSuggestion,
  WorkCenterLoad,
} from './types';
import { PurchaseRequestService, type RequestPriority } from '../../purchases/PurchaseRequestService';
import { localDateString } from '../../../../utils/shared/date';

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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const order = this.orders.getProductionOrder(orderId);
    this.ctx.branchAccess.requireBranchAccess(order.branchId, actor);
    return this.computeOrderCost(order);
  }

  public getProductionCostReport(): ProductionCostReport {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
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
    // Completed maintenance spend is facility-level (not allocatable to a
    // single order), reported alongside order costs for the full picture.
    const maintenanceScope = this.ctx.branchAccess.sqlScope('m.branch_id', undefined, actor);
    const maintenanceRows = this.ctx.db.query<{ workCenterId: string | null; workCenterName: string | null; cost: number }>(
      `SELECT m.work_center_id AS workCenterId, wc.name AS workCenterName,
              COALESCE(SUM(m.cost), 0) / 100.0 AS cost
       FROM manufacturing_maintenance m
       LEFT JOIN work_centers wc ON wc.id = m.work_center_id
       WHERE m.status = 'COMPLETED' AND ${maintenanceScope.clause}
       GROUP BY m.work_center_id
       ORDER BY cost DESC`,
      maintenanceScope.params
    );
    const maintenanceByWorkCenter = maintenanceRows.map((row) => ({
      workCenterId: row.workCenterId ?? null,
      workCenterName: row.workCenterName || 'صيانة عامة',
      cost: round2(Number(row.cost) || 0),
    }));
    return {
      orders,
      totalMaterialCost: round2(orders.reduce((sum, row) => sum + row.materialCost, 0)),
      totalLaborCost: round2(orders.reduce((sum, row) => sum + row.laborCost, 0)),
      totalCost: round2(orders.reduce((sum, row) => sum + row.totalCost, 0)),
      totalQuantity: orders.reduce((sum, row) => sum + row.quantity, 0),
      maintenanceCost: round2(maintenanceByWorkCenter.reduce((sum, row) => sum + row.cost, 0)),
      maintenanceByWorkCenter,
    };
  }

  /**
   * Component shortages for active production orders: remaining material need
   * (planned − consumed) versus stock the order can still draw — unreserved
   * on-hand plus its own reserved share (reserved_qty). Stock reserved by
   * other orders is excluded, so simultaneous orders no longer compete.
   */
  public getMaterialShortages(): MaterialShortage[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.ctx.db.query<any>(
      `SELECT o.id AS orderId, o.order_number AS orderNumber, o.status AS orderStatus,
              o.warehouse_id AS warehouseId,
              m.product_id AS componentProductId, p.name AS componentName,
              (m.planned_qty - m.consumed_qty) AS requiredQty,
              COALESCE(ws.quantity_m2, 0) AS onHandQty,
              COALESCE(ws.reserved_m2, 0) AS reservedQty,
              COALESCE(m.reserved_qty, 0) AS ownReservedQty
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
        const onHand = Number(row.onHandQty) || 0;
        const reservedTotal = Number(row.reservedQty) || 0;
        const ownReserved = Number(row.ownReservedQty) || 0;
        const availableQty = Math.max(0, onHand - reservedTotal) + ownReserved;
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
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
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
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
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
      const downtime = this.ctx.db.query<{ minutes: number }>(
        `SELECT COALESCE(SUM(minutes), 0) AS minutes FROM manufacturing_downtime WHERE work_center_id = ?`,
        [center.id]
      )[0];
      return {
        workCenterId: center.id,
        code: center.code,
        name: center.name,
        branchId: center.branchId,
        capacityPerDay,
        activeOrders: Number(load?.activeOrders || 0),
        plannedMinutes,
        actualMinutes: Number(load?.actualMinutes || 0),
        downtimeMinutes: Number(downtime?.minutes || 0),
        loadPercent,
      };
    });
  }

  /**
   * Production schedule: a sequence-aware finite-ish schedule. Operations are
   * ordered globally by due date → priority → order creation → operation
   * sequence. Each operation starts at the later of (a) the work center's
   * accumulated load and (b) the finish of the previous operation of the same
   * order — so routing sequence is respected across centers. Offsets are in
   * work-minutes from now; dates assume continuous daily capacity.
   */
  public getProductionSchedule(options?: ProductionScheduleOptions): ProductionScheduleRow[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const exclude = new Set(options?.excludeOrderIds || []);
    const scale = Number.isFinite(options?.minutesScale) && (options?.minutesScale ?? 0) > 0
      ? Number(options!.minutesScale)
      : 1;
    const ops = this.ctx.db.query<any>(
      `SELECT op.id AS operationId, o.id AS orderId, o.order_number AS orderNumber,
              o.branch_id AS branchId,
              p.name AS productName, o.quantity, o.status AS orderStatus, o.priority,
              o.due_date AS dueDate, so.order_number AS salesOrderNumber,
              op.work_center_id AS workCenterId, wc.code AS workCenterCode, wc.name AS workCenterName,
              wc.capacity_per_day AS capacityPerDay,
              op.sequence, op.planned_minutes AS plannedMinutes, op.actual_minutes AS actualMinutes,
              op.status AS operationStatus, o.created_at AS orderCreatedAt
       FROM production_order_operations op
       JOIN production_orders o ON o.id = op.order_id
       JOIN products p ON p.id = o.product_id
       JOIN work_centers wc ON wc.id = op.work_center_id
       LEFT JOIN orders so ON so.id = o.sales_order_id
       WHERE o.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS')
         AND op.status NOT IN ('COMPLETED', 'SKIPPED')
         AND ${scope.clause}`,
      scope.params
    );
    const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

    // Shift calendar per branch: effective work minutes per weekday derived
    // from active operations shift definitions (attendance_shifts) minus
    // breaks, with attendance_holidays removing whole days. Branches without
    // shift definitions fall back to capacity_per_day × 60 every day.
    interface DayCalendar { weekdayMinutes: number[]; holidays: Set<string>; }
    const calendars = new Map<string, DayCalendar | null>();
    const calendarFor = (branchId: string | null): DayCalendar | null => {
      const key = branchId || '';
      if (calendars.has(key)) return calendars.get(key)!;
      let result: DayCalendar | null = null;
      const shifts = this.ctx.db.query<any>(
        `SELECT start_time AS startTime, end_time AS endTime, break_minutes AS breakMinutes,
                workdays_json AS workdaysJson
         FROM attendance_shifts
         WHERE is_active = 1 AND is_operations = 1 AND branch_id IS ?`,
        [branchId || null]
      );
      if (shifts.length > 0) {
        const weekdayMinutes = [0, 0, 0, 0, 0, 0, 0];
        for (const shift of shifts) {
          const toMin = (t: unknown) => {
            const [h, m] = String(t || '0:0').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          let end = toMin(shift.endTime);
          const start = toMin(shift.startTime);
          if (end <= start) end += 1440; // overnight shift
          const minutes = Math.max(0, end - start - (Number(shift.breakMinutes) || 0));
          let workdays: number[] = [];
          try { workdays = JSON.parse(shift.workdaysJson || '[]') as number[]; } catch { workdays = []; }
          for (const day of workdays) if (day >= 0 && day <= 6) weekdayMinutes[day] += minutes;
        }
        const holidays = new Set(
          this.ctx.db.query<{ date: string }>(
            `SELECT date FROM attendance_holidays WHERE branch_id IS ?`,
            [branchId || null]
          ).map((row) => row.date)
        );
        result = { weekdayMinutes, holidays };
      }
      calendars.set(key, result);
      return result;
    };

    const todayStr = localDateString();
    const nextDay = (date: string) => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    // Walk the calendar consuming each day's capacity until the work-minute
    // offset is reached — respects shift windows, workdays and holidays.
    const offsetToDate = (offsetMinutes: number, branchId: string | null, fallbackDaily: number): string => {
      const calendar = calendarFor(branchId);
      let remaining = Math.max(0, offsetMinutes);
      let date = todayStr;
      for (let guard = 0; guard < 3700; guard += 1) {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const capacity = calendar
          ? (calendar.holidays.has(date) ? 0 : calendar.weekdayMinutes[weekday])
          : fallbackDaily;
        if (capacity > 0) {
          if (remaining < capacity) return date;
          remaining -= capacity;
        }
        date = nextDay(date);
      }
      return date;
    };

    // What-if: drop excluded orders and scale planned minutes before the
    // capacity simulation. Nothing is persisted — this is a dry run.
    const simulated = ops
      .filter((op) => !exclude.has(op.orderId))
      .map((op) => ({ ...op, plannedMinutes: Number(op.plannedMinutes || 0) * scale }));

    // Global priority order across all work centers.
    const sorted = [...simulated].sort((a, b) => {
      const aDue = a.dueDate || '9999-12-31';
      const bDue = b.dueDate || '9999-12-31';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      const aPriority = priorityRank[a.priority] ?? 2;
      const bPriority = priorityRank[b.priority] ?? 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.orderCreatedAt !== b.orderCreatedAt) return a.orderCreatedAt < b.orderCreatedAt ? -1 : 1;
      return a.sequence - b.sequence;
    });

    const centerLoad = new Map<string, number>();
    const orderPrevEnd = new Map<string, number>();
    const centerQueueCount = new Map<string, number>();
    const rows: ProductionScheduleRow[] = [];

    for (const op of sorted) {
      const planned = Number(op.plannedMinutes || 0);
      const centerAvail = centerLoad.get(op.workCenterId) || 0;
      const prevEnd = orderPrevEnd.get(op.orderId) || 0;
      const start = Math.max(centerAvail, prevEnd);
      const finish = start + planned;
      centerLoad.set(op.workCenterId, finish);
      orderPrevEnd.set(op.orderId, finish);
      const queueIndex = (centerQueueCount.get(op.workCenterId) || 0) + 1;
      centerQueueCount.set(op.workCenterId, queueIndex);
      const dailyMinutes = Math.max(1, Number(op.capacityPerDay || 0) * 60) || 480;
      rows.push({
        operationId: op.operationId,
        orderId: op.orderId,
        orderNumber: op.orderNumber,
        productName: op.productName,
        quantity: Number(op.quantity || 0),
        orderStatus: op.orderStatus,
        priority: op.priority,
        dueDate: op.dueDate,
        salesOrderNumber: op.salesOrderNumber,
        workCenterId: op.workCenterId,
        workCenterCode: op.workCenterCode,
        workCenterName: op.workCenterName,
        sequence: op.sequence,
        plannedMinutes: planned,
        actualMinutes: Number(op.actualMinutes || 0),
        operationStatus: op.operationStatus,
        queuePosition: queueIndex,
        cumulativeMinutesBefore: start,
        startOffsetMinutes: Math.round(start * 100) / 100,
        finishOffsetMinutes: Math.round(finish * 100) / 100,
        estimatedStartDate: offsetToDate(start, op.branchId ?? null, dailyMinutes),
        estimatedFinishDate: offsetToDate(Math.max(0, finish - 0.001), op.branchId ?? null, dailyMinutes),
      });
    }
    return rows.sort((a, b) =>
      (a.workCenterName || a.workCenterCode || '').localeCompare(b.workCenterName || b.workCenterCode || '')
      || a.queuePosition - b.queuePosition
    );
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
      plannedMinutes: number; actualMinutes: number; downtimeMinutes: number;
      completedOperations: number; efficiencyPercent: number | null;
    }>;
    orderVariance: Array<{
      orderId: string; orderNumber: string; productName: string;
      plannedMinutes: number; actualMinutes: number; variancePercent: number | null;
    }>;
    monthlyOutput: Array<{ month: string; orders: number; quantity: number; totalCost: number }>;
    quality: {
      inspections: number; inspectedQty: number; acceptedQty: number;
      rejectedQty: number; yieldPercent: number | null;
    };
  } {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
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
      const downtime = this.ctx.db.query<{ minutes: number }>(
        `SELECT COALESCE(SUM(minutes), 0) AS minutes FROM manufacturing_downtime WHERE work_center_id = ?`,
        [center.id]
      )[0];
      return {
        workCenterId: center.id,
        code: center.code,
        name: center.name,
        plannedMinutes: planned,
        actualMinutes: actual,
        downtimeMinutes: Number(downtime?.minutes || 0),
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

    const qualityRow = this.ctx.db.query<any>(
      `SELECT COUNT(*) AS inspections,
              COALESCE(SUM(quantity_inspected), 0) AS inspectedQty,
              COALESCE(SUM(quantity_accepted), 0) AS acceptedQty,
              COALESCE(SUM(quantity_rejected), 0) AS rejectedQty
       FROM manufacturing_quality_checks q
       JOIN production_orders o ON o.id = q.production_order_id
       WHERE ${this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor).clause}`,
      this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor).params
    )[0];
    const inspectedQty = Number(qualityRow?.inspectedQty || 0);
    const quality = {
      inspections: Number(qualityRow?.inspections || 0),
      inspectedQty,
      acceptedQty: Number(qualityRow?.acceptedQty || 0),
      rejectedQty: Number(qualityRow?.rejectedQty || 0),
      yieldPercent: inspectedQty > 0 ? round2((Number(qualityRow?.acceptedQty || 0) / inspectedQty) * 100) : null,
    };

    return { workCenterEfficiency, orderVariance, monthlyOutput, quality };
  }

  /**
   * OEE per work center over all recorded production:
   *  availability  = (planned − downtime) / planned
   *  performance   = planned / actual (capped at 100 for the OEE product)
   *  quality       = accepted / inspected on orders run at the center
   *  oee           = availability × performance × quality
   */
  public getOeeAnalytics(): { centers: OeeWorkCenterRow[]; periodNote: string } {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const wcScope = this.ctx.branchAccess.sqlScope('wc.branch_id', undefined, actor);
    const centers = this.ctx.db.query<any>(
      `SELECT wc.id, wc.code, wc.name, wc.branch_id AS branchId FROM work_centers wc
       WHERE wc.is_active = 1 AND ${wcScope.clause} ORDER BY wc.code`,
      wcScope.params
    );
    const rows: OeeWorkCenterRow[] = centers.map((center) => {
      const load = this.ctx.db.query<any>(
        `SELECT COALESCE(SUM(op.planned_minutes),0) AS plannedMinutes,
                COALESCE(SUM(CASE WHEN op.status = 'COMPLETED' THEN op.actual_minutes ELSE 0 END),0) AS actualMinutes
         FROM production_order_operations op
         JOIN production_orders o ON o.id = op.order_id
         WHERE op.work_center_id = ? AND o.status != 'CANCELLED'`,
        [center.id]
      )[0];
      const downRow = this.ctx.db.query<{ minutes: number }>(
        `SELECT COALESCE(SUM(minutes),0) AS minutes FROM manufacturing_downtime WHERE work_center_id = ?`,
        [center.id]
      )[0];
      const reasonRows = this.ctx.db.query<{ reason: string | null; minutes: number; events: number }>(
        `SELECT COALESCE(NULLIF(TRIM(reason), ''), 'غير مصنّف') AS reason,
                COALESCE(SUM(minutes),0) AS minutes, COUNT(*) AS events
         FROM manufacturing_downtime WHERE work_center_id = ?
         GROUP BY reason ORDER BY minutes DESC LIMIT 5`,
        [center.id]
      );
      const quality = this.ctx.db.query<any>(
        `SELECT COALESCE(SUM(q.quantity_inspected),0) AS inspected,
                COALESCE(SUM(q.quantity_accepted),0) AS accepted
         FROM manufacturing_quality_checks q
         JOIN production_orders o ON o.id = q.production_order_id
         WHERE o.status != 'CANCELLED'
           AND EXISTS (SELECT 1 FROM production_order_operations op
                       WHERE op.order_id = o.id AND op.work_center_id = ?)`,
        [center.id]
      )[0];
      const planned = Number(load?.plannedMinutes || 0);
      const actual = Number(load?.actualMinutes || 0);
      const down = Number(downRow?.minutes || 0);
      const inspected = Number(quality?.inspected || 0);
      const accepted = Number(quality?.accepted || 0);
      const availability = planned > 0 ? round2(Math.max(0, (planned - down) / planned) * 100) : null;
      const performanceRaw = actual > 0 ? round2((planned / actual) * 100) : null;
      const performance = performanceRaw === null ? null : Math.min(performanceRaw, 100);
      const qualityPct = inspected > 0 ? round2((accepted / inspected) * 100) : null;
      const oee = availability !== null && performance !== null && qualityPct !== null
        ? round2((availability / 100) * (performance / 100) * (qualityPct / 100) * 100)
        : null;
      return {
        workCenterId: center.id,
        code: center.code,
        name: center.name,
        branchId: center.branchId,
        plannedMinutes: planned,
        actualMinutes: actual,
        downtimeMinutes: down,
        availabilityPercent: availability,
        performancePercent: performance,
        qualityPercent: qualityPct,
        oeePercent: oee,
        downtimeReasons: reasonRows.map((row) => ({
          reason: row.reason || 'غير مصنّف',
          minutes: round2(Number(row.minutes) || 0),
          events: Number(row.events) || 0,
        })),
      };
    });
    return { centers: rows, periodNote: 'عبر كامل سجلات الإنتاج غير الملغاة' };
  }

  /**
   * HR attendance reconciliation: for each operator assigned to completed
   * operations, compare logged production minutes against the worked_minutes
   * recorded in HR attendance on the days the operations completed.
   */
  public getOperatorLaborSummary(): OperatorLaborRow[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const ops = this.ctx.db.query<any>(
      `SELECT op.operator_id AS operatorId, emp.full_name AS operatorName,
              op.planned_minutes AS plannedMinutes, op.actual_minutes AS actualMinutes,
              substr(op.completed_at, 1, 10) AS workDate
       FROM production_order_operations op
       JOIN production_orders o ON o.id = op.order_id
       JOIN employees emp ON emp.id = op.operator_id
       WHERE op.operator_id IS NOT NULL AND op.status = 'COMPLETED'
         AND op.actual_minutes > 0 AND ${scope.clause}`,
      scope.params
    );
    const byOperator = new Map<string, {
      name: string; ops: number; planned: number; actual: number; dates: Set<string>;
    }>();
    for (const op of ops) {
      const entry = byOperator.get(op.operatorId) || {
        name: op.operatorName || op.operatorId, ops: 0, planned: 0, actual: 0, dates: new Set<string>(),
      };
      entry.ops += 1;
      entry.planned += Number(op.plannedMinutes) || 0;
      entry.actual += Number(op.actualMinutes) || 0;
      if (op.workDate) entry.dates.add(op.workDate);
      byOperator.set(op.operatorId, entry);
    }
    // Job-ticket labor log (per-operation minutes keyed by work date).
    const laborRows = this.ctx.db.query<{ employeeId: string; minutes: number }>(
      `SELECT employee_id AS employeeId, COALESCE(SUM(minutes),0) AS minutes
       FROM production_operation_labor
       WHERE employee_id IS NOT NULL
       GROUP BY employee_id`
    );
    const loggedByOperator = new Map(laborRows.map((row) => [row.employeeId, Number(row.minutes || 0)]));

    const attendanceCache = new Map<string, number>();
    const rows: OperatorLaborRow[] = [];
    for (const [operatorId, entry] of byOperator) {
      let attendanceMinutes = 0;
      if (entry.dates.size > 0) {
        const key = `${operatorId}|${[...entry.dates].sort().join(',')}`;
        if (!attendanceCache.has(key)) {
          const placeholders = [...entry.dates].map(() => '?').join(',');
          const row = this.ctx.db.query<{ minutes: number }>(
            `SELECT COALESCE(SUM(worked_minutes),0) AS minutes FROM attendance
             WHERE employee_id = ? AND date IN (${placeholders})`,
            [operatorId, ...entry.dates]
          )[0];
          attendanceCache.set(key, Number(row?.minutes || 0));
        }
        attendanceMinutes = attendanceCache.get(key)!;
      }
      rows.push({
        operatorId,
        operatorName: entry.name,
        operationsCount: entry.ops,
        plannedMinutes: round2(entry.planned),
        actualMinutes: round2(entry.actual),
        attendanceMinutes,
        loggedMinutes: round2(loggedByOperator.get(operatorId) || 0),
        varianceMinutes: round2(entry.actual - attendanceMinutes),
      });
    }
    return rows.sort((a, b) => b.actualMinutes - a.actualMinutes);
  }

  /**
   * Per-day labor reconciliation: production_operation_labor minutes joined
   * to HR attendance (worked_minutes + check-in/out punches) on the same
   * employee + work_date. Days with production but no attendance punch show
   * attendanceMinutes = 0 so discrepancies are visible.
   */
  public getOperatorLaborDaily(): OperatorLaborDailyRow[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.wip.view']);
    const scope = this.ctx.branchAccess.sqlScope('o.branch_id', undefined, actor);
    const rows = this.ctx.db.query<any>(
      `SELECT l.employee_id AS operatorId, emp.full_name AS operatorName,
              l.work_date AS workDate,
              COALESCE(SUM(l.minutes),0) AS operationMinutes,
              COALESCE(a.worked_minutes,0) AS attendanceMinutes,
              a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt
       FROM production_operation_labor l
       JOIN production_order_operations op ON op.id = l.operation_id
       JOIN production_orders o ON o.id = op.order_id
       JOIN employees emp ON emp.id = l.employee_id
       LEFT JOIN attendance a ON a.employee_id = l.employee_id AND a.date = l.work_date
       WHERE l.employee_id IS NOT NULL AND ${scope.clause}
       GROUP BY l.employee_id, l.work_date
       ORDER BY l.work_date DESC, emp.full_name`,
      scope.params
    );
    return rows.map((row) => ({
      operatorId: row.operatorId,
      operatorName: row.operatorName || row.operatorId,
      workDate: row.workDate,
      operationMinutes: round2(Number(row.operationMinutes) || 0),
      attendanceMinutes: round2(Number(row.attendanceMinutes) || 0),
      checkInAt: row.checkInAt ?? null,
      checkOutAt: row.checkOutAt ?? null,
    }));
  }

  private computeOrderCost(order: ProductionOrder): ProductionOrderCost {
    // Material cost comes from the frozen unit_cost/total_cost stamped on each
    // production issue transaction at issue time (FIFO layer cost or the
    // product cost price of that moment) — later price changes never rewrite
    // history. Legacy orders without stamped costs fall back to consumed ×
    // current cost_price.
    const issued = this.ctx.db.query<{ cost: number }>(
      `SELECT COALESCE(SUM(total_cost), 0) / 100.0 AS cost
       FROM inventory_transactions
       WHERE reference_type = 'PRODUCTION_ORDER' AND reference_id = ? AND type = 'ADJUSTMENT_SUB'`,
      [order.id]
    )[0];
    let materialCost = round2(Number(issued?.cost || 0));
    if (materialCost <= 0) {
      const materialRows = this.ctx.db.query<any>(
        `SELECT m.consumed_qty AS consumedQty, pr.cost_price AS costPrice
         FROM production_order_materials m
         JOIN products pr ON pr.id = m.product_id
         WHERE m.order_id = ?`,
        [order.id]
      );
      materialCost = round2(materialRows.reduce(
        (sum, row) => sum + (Number(row.consumedQty) || 0) * (Number(row.costPrice) || 0) / 100,
        0
      ));
    }
    const laborRows = this.ctx.db.query<any>(
      `SELECT op.actual_minutes AS actualMinutes, op.planned_minutes AS plannedMinutes,
              wc.cost_per_hour AS costPerHour,
              wc.overhead_per_hour AS overheadPerHour
       FROM production_order_operations op
       JOIN work_centers wc ON wc.id = op.work_center_id
       WHERE op.order_id = ?`,
      [order.id]
    );
    // cost_per_hour = direct machine/labor rate; overhead_per_hour = the
    // indirect industrial overhead allocated to the work center.
    const directLaborCost = round2(laborRows.reduce(
      (sum, row) => sum + (Number(row.actualMinutes) || 0)
        * (Number(row.costPerHour) || 0) / 100 / 60,
      0
    ));
    const overheadCost = round2(laborRows.reduce(
      (sum, row) => sum + (Number(row.actualMinutes) || 0)
        * (Number(row.overheadPerHour) || 0) / 100 / 60,
      0
    ));
    const laborCost = round2(directLaborCost + overheadCost);
    const totalCost = round2(materialCost + laborCost);

    // Standard cost = what the order was planned to cost: planned material
    // quantities at current cost price + planned minutes at work-center
    // rates. Compared against actuals it yields the cost variance.
    const plannedMaterialRows = this.ctx.db.query<any>(
      `SELECT m.planned_qty AS plannedQty, pr.cost_price AS costPrice
       FROM production_order_materials m
       JOIN products pr ON pr.id = m.product_id
       WHERE m.order_id = ?`,
      [order.id]
    );
    const standardMaterialCost = round2(plannedMaterialRows.reduce(
      (sum, row) => sum + (Number(row.plannedQty) || 0) * (Number(row.costPrice) || 0) / 100,
      0
    ));
    const standardLaborCost = round2(laborRows.reduce(
      (sum, row) => sum + (Number(row.plannedMinutes) || 0)
        * ((Number(row.costPerHour) || 0) + (Number(row.overheadPerHour) || 0)) / 100 / 60,
      0
    ));
    const standardCost = round2(standardMaterialCost + standardLaborCost);
    const costVariance = round2(totalCost - standardCost);
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
      directLaborCost,
      overheadCost,
      totalCost,
      costPerUnit: quantity > 0 ? round2(totalCost / quantity) : 0,
      standardCost,
      costVariance,
      variancePercent: standardCost > 0 ? round2((costVariance / standardCost) * 100) : null,
    };
  }
}
