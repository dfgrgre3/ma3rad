import { v4 as uuidv4 } from 'uuid';
import type { ManufacturingContext } from './context';
import type { BomsModule } from './boms';
import type { ProductionOrdersModule } from './productionOrders';
import type { CreateMpsEntryDTO, MpsEntry, PurchaseSuggestion } from './types';
import { PurchaseRequestService, type RequestPriority } from '../../purchases/PurchaseRequestService';
import { assertDate } from './shared';
import { localDateString } from '../../../../utils/shared/date';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Material need enriched with need dates and supplier lead time. */
export interface MrpMaterialNeed extends PurchaseSuggestion {
  /** Earliest sales-order need date pegged to this requirement. */
  neededBy: string | null;
  /** products.lead_time_days used for planning. */
  leadTimeDays: number;
  /** Date the purchase must be raised: neededBy − leadTimeDays. */
  orderByDate: string | null;
}

export interface MrpPlannedProduction {
  orderItemId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string | null;
  productId: string;
  productName: string;
  quantity: number;
  unit: string | null;
  neededBy: string | null;
  /** Latest date production must start to meet neededBy (critical path). */
  latestStartDate: string | null;
  bomId: string;
  bomName: string;
}

export interface MrpPlan {
  plannedProduction: MrpPlannedProduction[];
  materialNeeds: MrpMaterialNeed[];
}

/** Planned production driven by an MPS (independent) demand entry. */
export interface MrpMpsPlanned {
  entryId: string;
  productId: string;
  productName: string;
  quantity: number;
  needDate: string;
  latestStartDate: string | null;
  bomId: string | null;
  bomName: string | null;
  warehouseId: string | null;
}

/** One weekly bucket of the time-phased MRP. */
export interface MrpTimeBucket {
  /** Monday (YYYY-MM-DD) starting the bucket week. */
  weekStart: string;
  weekEnd: string;
  plannedProduction: MrpPlannedProduction[];
  mpsPlanned: MrpMpsPlanned[];
  materialNeeds: MrpMaterialNeed[];
}

export interface TimePhasedMrp {
  weeks: number;
  buckets: MrpTimeBucket[];
  mpsEntries: MpsEntry[];
}

/**
 * Lightweight MRP: uncovered sales-order demand (make-to-order candidates)
 * is exploded through active multi-level BOMs and netted against available-
 * to-promise stock (on-hand minus reserved). Output is a planned production
 * list plus aggregated material purchase needs with need dates.
 */
export class MrpModule {
  private readonly ctx: ManufacturingContext;
  private readonly boms: BomsModule;
  private readonly orders: ProductionOrdersModule;
  constructor(ctx: ManufacturingContext, boms: BomsModule, orders: ProductionOrdersModule) {
    this.ctx = ctx;
    this.boms = boms;
    this.orders = orders;
  }

  public getMrpPlan(): MrpPlan {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.bom.view']);
    const candidates = this.orders.getSalesOrderProductionCandidates();
    const scope = this.ctx.branchAccess.sqlScope('so.branch_id', undefined, actor);

    // Warehouse + need date per sales order.
    const orderMeta = new Map<string, { warehouseId: string | null; neededBy: string | null }>();
    const orderIds = [...new Set(candidates.map((c) => c.salesOrderId))];
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const rows = this.ctx.db.query<any>(
        `SELECT so.id, so.warehouse_id AS warehouseId, so.date AS neededBy FROM orders so
         WHERE so.id IN (${placeholders}) AND ${scope.clause}`,
        [...orderIds, ...scope.params]
      );
      for (const row of rows) {
        orderMeta.set(row.id, { warehouseId: row.warehouseId || null, neededBy: row.neededBy || null });
      }
    }

    // Critical-path production days per BOM: each routing operation consumes
    // minutesPerUnit × qty minutes on its work center; the longest single
    // center's days bounds the schedule (sequential ops on the same center).
    const routingDaysCache = new Map<string, number>();
    const routingDays = (bomId: string, quantity: number): number => {
      const key = `${bomId}|${quantity}`;
      if (routingDaysCache.has(key)) return routingDaysCache.get(key)!;
      const ops = this.boms.loadBomOperations(bomId);
      const perCenter = new Map<string, number>();
      for (const op of ops) {
        const wc = this.ctx.db.query<{ capacityPerDay: number }>(
          `SELECT capacity_per_day AS capacityPerDay FROM work_centers WHERE id = ?`,
          [op.workCenterId]
        )[0];
        const dailyMinutes = Math.max(1, (Number(wc?.capacityPerDay) || 0) * 60) || 480;
        const minutes = (Number(op.minutesPerUnit) || 0) * quantity;
        perCenter.set(op.workCenterId, (perCenter.get(op.workCenterId) || 0) + minutes / dailyMinutes);
      }
      const days = Math.max(0, ...perCenter.values());
      routingDaysCache.set(key, days);
      return days;
    };
    const minusDays = (date: string | null, days: number): string | null => {
      if (!date || days <= 0) return date;
      // UTC arithmetic: mixing local-time Dates with toISOString shifts the
      // result a day in positive-offset timezones.
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - Math.ceil(days));
      return d.toISOString().slice(0, 10);
    };

    const plannedProduction: MrpPlannedProduction[] = candidates.map((candidate) => {
      const meta = orderMeta.get(candidate.salesOrderId);
      const neededBy = meta?.neededBy ?? null;
      const quantity = Number(candidate.quantity) || 0;
      return {
        orderItemId: candidate.orderItemId,
        salesOrderId: candidate.salesOrderId,
        salesOrderNumber: candidate.salesOrderNumber,
        customerName: candidate.customerName ?? null,
        productId: candidate.productId,
        productName: candidate.productName,
        quantity,
        unit: candidate.unit ?? null,
        neededBy,
        latestStartDate: minusDays(neededBy, routingDays(candidate.bomId, quantity)),
        bomId: candidate.bomId,
        bomName: candidate.bomName,
      };
    });

    // Explode each candidate's BOM and net leaf requirements against ATP.
    const needs = new Map<string, {
      componentProductId: string; componentName: string; warehouseId: string;
      requiredQty: number; salesOrders: Set<string>; neededBys: string[];
    }>();
    const atpCache = new Map<string, number>();
    const atp = (productId: string, warehouseId: string): number => {
      const key = `${productId}|${warehouseId}`;
      if (!atpCache.has(key)) {
        const row = this.ctx.db.query<{ atp: number }>(
          `SELECT COALESCE(quantity_m2, 0) - COALESCE(reserved_m2, 0) AS atp
           FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [warehouseId, productId]
        )[0];
        atpCache.set(key, Math.max(0, Number(row?.atp || 0)));
      }
      return atpCache.get(key)!;
    };

    for (const candidate of candidates) {
      const meta = orderMeta.get(candidate.salesOrderId);
      const warehouseId = meta?.warehouseId;
      if (!warehouseId) continue;
      const quantity = Number(candidate.quantity) || 0;
      if (quantity <= 0) continue;
      const requirements = this.boms.getBomLeafRequirements(candidate.bomId, quantity);
      for (const req of requirements) {
        const key = `${req.componentProductId}|${warehouseId}`;
        const group = needs.get(key) || {
          componentProductId: req.componentProductId,
          componentName: req.componentName || req.componentProductId,
          warehouseId,
          requiredQty: 0,
          salesOrders: new Set<string>(),
          neededBys: [],
        };
        group.requiredQty += Number(req.quantity) || 0;
        group.salesOrders.add(candidate.salesOrderNumber);
        const neededBy = orderMeta.get(candidate.salesOrderId)?.neededBy;
        if (neededBy) group.neededBys.push(neededBy);
        needs.set(key, group);
      }
    }

    // Net requirements against ATP once per product+warehouse.
    const atpUsed = new Map<string, number>();
    const materialNeeds: MrpMaterialNeed[] = [];
    const productIds = [...new Set([...needs.values()].map((n) => n.componentProductId))];
    const productMeta = new Map(
      productIds.length === 0 ? [] : this.ctx.db.query<{ id: string; costPrice: number; leadTimeDays: number | null }>(
        `SELECT id, cost_price AS costPrice, lead_time_days AS leadTimeDays FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
        productIds
      ).map((row) => [row.id, { cost: Number(row.costPrice || 0) / 100, leadTimeDays: Number(row.leadTimeDays ?? 7) }])
    );
    for (const group of needs.values()) {
      const key = `${group.componentProductId}|${group.warehouseId}`;
      const available = atp(group.componentProductId, group.warehouseId) - (atpUsed.get(key) || 0);
      const covered = Math.min(group.requiredQty, Math.max(0, available));
      atpUsed.set(key, (atpUsed.get(key) || 0) + covered);
      const suggestedQty = round3(Math.max(0, group.requiredQty - covered));
      if (suggestedQty <= 0) continue;
      const meta = productMeta.get(group.componentProductId);
      const unitCost = meta?.cost || 0;
      const neededBy = group.neededBys.length > 0 ? group.neededBys.sort()[0] : null;
      const leadTimeDays = meta?.leadTimeDays ?? 7;
      materialNeeds.push({
        componentProductId: group.componentProductId,
        componentName: group.componentName,
        warehouseId: group.warehouseId,
        totalRequiredQty: round3(group.requiredQty),
        availableQty: round3(Math.max(0, available)),
        suggestedQty,
        unitCost,
        estimatedValue: Math.round(suggestedQty * unitCost * 100) / 100,
        affectedOrders: group.salesOrders.size,
        orderNumbers: [...group.salesOrders],
        neededBy,
        leadTimeDays,
        orderByDate: neededBy ? minusDays(neededBy, leadTimeDays) : null,
      });
    }
    materialNeeds.sort((a, b) => (a.orderByDate || '9999').localeCompare(b.orderByDate || '9999') || b.estimatedValue - a.estimatedValue);

    return { plannedProduction, materialNeeds };
  }

  /**
   * Convert MRP material needs into purchase requests — one per warehouse —
   * with neededBy set to the lead-time-aware order-by date.
   */
  public createPurchaseRequestsFromMrp(input?: {
    priority?: RequestPriority;
    warehouseId?: string;
  }): Array<{ warehouseId: string; requestId: string; requestNumber: string; itemsCount: number }> {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const needs = this.getMrpPlan().materialNeeds
      .filter((row) => !input?.warehouseId || row.warehouseId === input.warehouseId);
    if (needs.length === 0) throw new Error('لا توجد احتياجات شراء في خطة MRP.');

    const byWarehouse = new Map<string, MrpMaterialNeed[]>();
    for (const need of needs) {
      const list = byWarehouse.get(need.warehouseId) || [];
      list.push(need);
      byWarehouse.set(need.warehouseId, list);
    }
    const purchaseRequests = new PurchaseRequestService();
    const created: Array<{ warehouseId: string; requestId: string; requestNumber: string; itemsCount: number }> = [];
    for (const [warehouseId, items] of byWarehouse) {
      const earliest = items.map((item) => item.orderByDate).filter((d): d is string => !!d).sort()[0];
      const request = purchaseRequests.createRequest({
        warehouseId,
        neededBy: earliest,
        priority: input?.priority || 'HIGH',
        notes: `طلب شراء من خطة MRP: ${items.flatMap((item) => item.orderNumbers).slice(0, 10).join('، ')}`,
        items: items.map((item) => ({
          productId: item.componentProductId,
          quantityM2: item.suggestedQty,
          estimatedUnitCost: item.unitCost,
          notes: `عجز MRP: مطلوب ${item.totalRequiredQty} / متاح ${item.availableQty} — مهلة توريد ${item.leadTimeDays} يوم — أوامر: ${item.orderNumbers.join('، ')}`,
        })),
      });
      created.push({ warehouseId, requestId: request.id, requestNumber: request.requestNumber, itemsCount: items.length });
    }
    this.ctx.audit('إنشاء طلبات شراء من خطة MRP', 'purchase_requests', { count: created.length });
    return created;
  }

  /**
   * Convert every uncovered sales-order candidate into a PLANNED production
   * order. Items that already got an order between plan and action are
   * skipped safely by the underlying duplicate check.
   */
  public createProductionOrdersFromMrp(input?: {
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    notes?: string;
  }): ProductionOrderLike[] {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const candidates = this.orders.getSalesOrderProductionCandidates();
    const created: ProductionOrderLike[] = [];
    const skipped: string[] = [];
    for (const candidate of candidates) {
      try {
        const order = this.orders.createProductionOrderFromSalesItem(candidate.orderItemId, {
          priority: input?.priority,
          notes: input?.notes,
        });
        created.push({
          id: order.id,
          orderNumber: order.orderNumber,
          productName: order.productName,
          quantity: order.quantity,
          status: order.status,
          salesOrderNumber: candidate.salesOrderNumber,
        });
      } catch {
        skipped.push(candidate.orderItemId);
      }
    }
    this.ctx.audit('تحويل خطة MRP إلى أوامر إنتاج', 'production_orders', {
      created: created.length,
      skipped: skipped.length,
    });
    return created;
  }

  // ------------------------------------------------------------------
  // Master Production Schedule (MPS): independent demand entries that feed
  // the time-phased MRP alongside uncovered sales-order demand.
  // ------------------------------------------------------------------

  public getMpsEntries(status?: 'OPEN' | 'CANCELLED'): MpsEntry[] {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.bom.view']);
    const scope = this.ctx.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const conditions = [scope.clause];
    const params: Array<string> = [...scope.params];
    if (status) { conditions.push('e.status = ?'); params.push(status); }
    return this.ctx.db.query<MpsEntry>(
      `SELECT e.*, p.name AS productName, b.name AS bomName, w.name AS warehouseName
       FROM manufacturing_mps_entries e
       JOIN products p ON p.id = e.product_id
       LEFT JOIN bills_of_materials b ON b.id = e.bom_id
       LEFT JOIN warehouses w ON w.id = e.warehouse_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.need_date, e.created_at`,
      params
    );
  }

  public createMpsEntry(input: CreateMpsEntryDTO): MpsEntry {
    this.ctx.guardWrites();
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create', 'manufacturing.bom.manage']);
    if (!input.productId) throw new Error('يجب اختيار المنتج.');
    if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0) {
      throw new Error('كمية الطلب الرئيسي يجب أن تكون أكبر من صفر.');
    }
    assertDate(input.needDate, 'تاريخ الاحتياج');

    const product = this.ctx.db.query<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.productId])[0];
    if (!product) throw new Error('المنتج المحدد غير موجود.');

    const branchId = input.branchId || this.ctx.branchAccess.getDefaultAccessibleBranchId(actor);
    this.ctx.branchAccess.requireBranchAccess(branchId, actor);

    let warehouseId = input.warehouseId?.trim() || null;
    if (warehouseId) {
      const warehouseBranch = this.ctx.branchAccess.requireWarehouseAccess(warehouseId, actor);
      if (warehouseBranch !== branchId) throw new Error('المخزن لا يتبع الفرع المحدد.');
    } else {
      warehouseId = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM warehouses WHERE branch_id = ? ORDER BY is_default DESC, id ASC LIMIT 1`,
        [branchId]
      )[0]?.id || null;
    }

    // BOM: explicit choice must be ACTIVE and belong to the product; otherwise
    // fall back to the product's latest ACTIVE BOM (may be null → the entry
    // still appears as finished-goods demand but cannot explode materials).
    let bomId = input.bomId?.trim() || null;
    if (bomId) {
      const bom = this.ctx.db.query<{ id: string; productId: string; status: string }>(
        `SELECT id, product_id AS productId, status FROM bills_of_materials WHERE id = ?`, [bomId]
      )[0];
      if (!bom || bom.productId !== input.productId) throw new Error('قائمة المواد لا تتبع المنتج المحدد.');
      if (bom.status !== 'ACTIVE') throw new Error('يجب تفعيل قائمة المواد قبل استخدامها في التخطيط.');
    } else {
      bomId = this.ctx.db.query<{ id: string }>(
        `SELECT id FROM bills_of_materials
         WHERE product_id = ? AND status = 'ACTIVE'
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [input.productId]
      )[0]?.id || null;
    }

    const id = `mps_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();
    this.ctx.db.run(
      `INSERT INTO manufacturing_mps_entries
        (id, product_id, bom_id, quantity, warehouse_id, branch_id, need_date, source, status, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'OPEN', ?, ?, ?)`,
      [id, input.productId, bomId, Number(input.quantity), warehouseId, branchId, input.needDate,
       input.notes?.trim() || null, actor.id, now]
    );
    this.ctx.audit('إنشاء طلب إنتاج رئيسي (MPS)', id, { productId: input.productId, quantity: input.quantity, needDate: input.needDate });
    return this.getMpsEntries().find((entry) => entry.id === id)!;
  }

  public cancelMpsEntry(id: string): MpsEntry {
    this.ctx.guardWrites();
    this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create']);
    const entry = this.getMpsEntries().find((row) => row.id === id);
    if (!entry) throw new Error('طلب الإنتاج الرئيسي غير موجود.');
    const actor = this.ctx.requireAny(['manufacturing.manage', 'manufacturing.orders.create', 'manufacturing.orders.view']);
    if (entry.branchId) this.ctx.branchAccess.requireBranchAccess(entry.branchId, actor);
    if (entry.status === 'CANCELLED') throw new Error('طلب الإنتاج الرئيسي ملغى بالفعل.');
    this.ctx.db.run(
      `UPDATE manufacturing_mps_entries SET status = 'CANCELLED' WHERE id = ?`,
      [id]
    );
    this.ctx.audit('إلغاء طلب إنتاج رئيسي (MPS)', id, {});
    return this.getMpsEntries().find((row) => row.id === id)!;
  }

  /**
   * Time-phased MRP over `weeks` weekly buckets (Monday-start). Combines
   * uncovered sales-order demand with OPEN MPS entries, explodes each through
   * its ACTIVE BOM, buckets planned production by need week, and nets leaf
   * material requirements bucket-by-bucket against ATP — stock covers the
   * earliest buckets first and shortages surface as per-week purchase needs
   * with lead-time-aware order-by dates.
   */
  public getTimePhasedMrp(weeks = 8): TimePhasedMrp {
    const actor = this.ctx.requireAny(['manufacturing.view', 'manufacturing.orders.view', 'manufacturing.bom.view']);
    const horizon = Math.min(52, Math.max(1, Math.floor(weeks)));

    const mondayOf = (dateStr: string): Date => {
      const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      d.setUTCDate(d.getUTCDate() - dow);
      return d;
    };
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const addDays = (d: Date, days: number) => { const c = new Date(d); c.setUTCDate(c.getUTCDate() + days); return c; };
    const weekIndexOf = (dateStr: string | null): number => {
      const base = mondayOf(localDateString());
      if (!dateStr) return 0;
      const diffDays = Math.round((mondayOf(dateStr).getTime() - base.getTime()) / 86400000);
      return Math.min(horizon - 1, Math.max(0, Math.floor(diffDays / 7)));
    };

    const buckets: MrpTimeBucket[] = [];
    const baseMonday = mondayOf(localDateString());
    for (let i = 0; i < horizon; i += 1) {
      const start = addDays(baseMonday, i * 7);
      buckets.push({
        weekStart: iso(start),
        weekEnd: iso(addDays(start, 6)),
        plannedProduction: [],
        mpsPlanned: [],
        materialNeeds: [],
      });
    }

    // ---- Demand collection -------------------------------------------------
    interface Demand {
      kind: 'SALES' | 'MPS';
      productId: string; productName: string; bomId: string | null; bomName: string | null;
      quantity: number; warehouseId: string | null; neededBy: string | null;
      sales?: MrpPlannedProduction;
      mps?: MpsEntry;
    }
    const demands: Demand[] = [];

    const candidates = this.orders.getSalesOrderProductionCandidates();
    const orderIds = [...new Set(candidates.map((c) => c.salesOrderId))];
    const orderMeta = new Map<string, { warehouseId: string | null; neededBy: string | null }>();
    if (orderIds.length > 0) {
      const scope = this.ctx.branchAccess.sqlScope('so.branch_id', undefined, actor);
      const placeholders = orderIds.map(() => '?').join(',');
      for (const row of this.ctx.db.query<any>(
        `SELECT so.id, so.warehouse_id AS warehouseId, so.date AS neededBy FROM orders so
         WHERE so.id IN (${placeholders}) AND ${scope.clause}`,
        [...orderIds, ...scope.params]
      )) orderMeta.set(row.id, { warehouseId: row.warehouseId || null, neededBy: row.neededBy || null });
    }

    const routingDaysCache = new Map<string, number>();
    const routingDays = (bomId: string, quantity: number): number => {
      const key = `${bomId}|${quantity}`;
      if (routingDaysCache.has(key)) return routingDaysCache.get(key)!;
      const ops = this.boms.loadBomOperations(bomId);
      const perCenter = new Map<string, number>();
      for (const op of ops) {
        const wc = this.ctx.db.query<{ capacityPerDay: number }>(
          `SELECT capacity_per_day AS capacityPerDay FROM work_centers WHERE id = ?`, [op.workCenterId]
        )[0];
        const dailyMinutes = Math.max(1, (Number(wc?.capacityPerDay) || 0) * 60) || 480;
        perCenter.set(op.workCenterId, (perCenter.get(op.workCenterId) || 0)
          + ((Number(op.minutesPerUnit) || 0) * quantity) / dailyMinutes);
      }
      const days = Math.max(0, ...perCenter.values());
      routingDaysCache.set(key, days);
      return days;
    };
    const minusDays = (date: string | null, days: number): string | null => {
      if (!date || days <= 0) return date;
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - Math.ceil(days));
      return d.toISOString().slice(0, 10);
    };

    for (const candidate of candidates) {
      const meta = orderMeta.get(candidate.salesOrderId);
      const neededBy = meta?.neededBy ?? null;
      const quantity = Number(candidate.quantity) || 0;
      const planned: MrpPlannedProduction = {
        orderItemId: candidate.orderItemId,
        salesOrderId: candidate.salesOrderId,
        salesOrderNumber: candidate.salesOrderNumber,
        customerName: candidate.customerName ?? null,
        productId: candidate.productId,
        productName: candidate.productName,
        quantity,
        unit: candidate.unit ?? null,
        neededBy,
        latestStartDate: minusDays(neededBy, routingDays(candidate.bomId, quantity)),
        bomId: candidate.bomId,
        bomName: candidate.bomName,
      };
      demands.push({
        kind: 'SALES', productId: candidate.productId, productName: candidate.productName,
        bomId: candidate.bomId, bomName: candidate.bomName, quantity,
        warehouseId: meta?.warehouseId ?? null, neededBy, sales: planned,
      });
      buckets[weekIndexOf(neededBy)].plannedProduction.push(planned);
    }

    const mpsEntries = this.getMpsEntries('OPEN');
    for (const entry of mpsEntries) {
      const quantity = Number(entry.quantity) || 0;
      const bomId = entry.bomId;
      const latestStart = bomId ? minusDays(entry.needDate, routingDays(bomId, quantity)) : null;
      const planned: MrpMpsPlanned = {
        entryId: entry.id, productId: entry.productId, productName: entry.productName || entry.productId,
        quantity, needDate: entry.needDate, latestStartDate: latestStart,
        bomId, bomName: entry.bomName ?? null, warehouseId: entry.warehouseId,
      };
      demands.push({
        kind: 'MPS', productId: entry.productId, productName: planned.productName,
        bomId, bomName: entry.bomName ?? null, quantity,
        warehouseId: entry.warehouseId, neededBy: entry.needDate, mps: entry,
      });
      buckets[weekIndexOf(entry.needDate)].mpsPlanned.push(planned);
    }

    // ---- Gross material requirements per (component, warehouse, week) ------
    interface GrossRow {
      componentProductId: string; componentName: string; warehouseId: string;
      week: number; qty: number; refs: Set<string>;
    }
    const gross = new Map<string, GrossRow>();
    for (const demand of demands) {
      if (!demand.bomId || !demand.warehouseId || demand.quantity <= 0) continue;
      const week = weekIndexOf(demand.neededBy);
      const requirements = this.boms.getBomLeafRequirements(demand.bomId, demand.quantity);
      for (const req of requirements) {
        const key = `${req.componentProductId}|${demand.warehouseId}|${week}`;
        const row = gross.get(key) || {
          componentProductId: req.componentProductId,
          componentName: req.componentName || req.componentProductId,
          warehouseId: demand.warehouseId!, week, qty: 0, refs: new Set<string>(),
        };
        row.qty += Number(req.quantity) || 0;
        row.refs.add(demand.kind === 'SALES' ? demand.sales!.salesOrderNumber : `MPS:${demand.productName}`);
        gross.set(key, row);
      }
    }

    // ---- Period-by-period netting against ATP ------------------------------
    const productIds = [...new Set([...gross.values()].map((g) => g.componentProductId))];
    const productMeta = new Map(
      productIds.length === 0 ? [] : this.ctx.db.query<{ id: string; costPrice: number; leadTimeDays: number | null }>(
        `SELECT id, cost_price AS costPrice, lead_time_days AS leadTimeDays FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
        productIds
      ).map((row) => [row.id, { cost: Number(row.costPrice || 0) / 100, leadTimeDays: Number(row.leadTimeDays ?? 7) }])
    );
    const atpCache = new Map<string, number>();
    const atp = (productId: string, warehouseId: string): number => {
      const key = `${productId}|${warehouseId}`;
      if (!atpCache.has(key)) {
        const row = this.ctx.db.query<{ atp: number }>(
          `SELECT COALESCE(quantity_m2, 0) - COALESCE(reserved_m2, 0) AS atp
           FROM warehouse_stock WHERE warehouse_id = ? AND product_id = ?`,
          [warehouseId, productId]
        )[0];
        atpCache.set(key, Math.max(0, Number(row?.atp || 0)));
      }
      return atpCache.get(key)!;
    };

    // Group gross rows by component+warehouse, then walk weeks ascending.
    const byComponent = new Map<string, GrossRow[]>();
    for (const row of gross.values()) {
      const key = `${row.componentProductId}|${row.warehouseId}`;
      const list = byComponent.get(key) || [];
      list.push(row);
      byComponent.set(key, list);
    }
    const weekNeeds: Array<MrpMaterialNeed & { week: number }> = [];
    for (const rows of byComponent.values()) {
      rows.sort((a, b) => a.week - b.week);
      const { componentProductId, warehouseId } = rows[0];
      let available = atp(componentProductId, warehouseId);
      const meta = productMeta.get(componentProductId);
      const leadTimeDays = meta?.leadTimeDays ?? 7;
      const unitCost = meta?.cost || 0;
      for (const row of rows) {
        const covered = Math.min(row.qty, available);
        available = Math.max(0, available - row.qty);
        const suggestedQty = round3(Math.max(0, row.qty - covered));
        if (suggestedQty <= 0) continue;
        const neededBy = buckets[row.week].weekEnd;
        const orderByDate = minusDays(neededBy, leadTimeDays);
        weekNeeds.push({
          componentProductId, componentName: row.componentName, warehouseId,
          totalRequiredQty: round3(row.qty),
          availableQty: round3(covered),
          suggestedQty,
          unitCost,
          estimatedValue: Math.round(suggestedQty * unitCost * 100) / 100,
          affectedOrders: row.refs.size,
          orderNumbers: [...row.refs],
          neededBy,
          leadTimeDays,
          orderByDate,
          week: row.week,
        });
      }
    }
    for (const need of weekNeeds) {
      const { week, ...rest } = need;
      buckets[week].materialNeeds.push(rest);
      buckets[week].materialNeeds.sort((a, b) => (a.orderByDate || '9999').localeCompare(b.orderByDate || '9999') || b.estimatedValue - a.estimatedValue);
    }

    return { weeks: horizon, buckets, mpsEntries };
  }
}

interface ProductionOrderLike {
  id: string;
  orderNumber: string;
  productName?: string;
  quantity: number;
  status: string;
  salesOrderNumber?: string;
}
