/**
 * InventoryIntelligenceService — تحليلات مخزون السيراميك المتقدمة
 *
 * يركّز على الاحتياجات التي لا تغطيها خدمات المخزون الأساسية:
 *   • إتاحة الدفعات بدقة النغمة/العيار/الفرز مع مواقع الأرفف والمحجوزات.
 *   • اقتراح تحويلات بين المخازن/الفروع لموازنة الرصيد مقابل الطلب الفعلي.
 *   • تنبيهات هوامش الربح المنخفضة على مستوى الصنف.
 *   • تحليل المخزون الراكد (بدون مبيعات خلال فترة).
 *   • تحليل فروقات الجرد مع تصنيف الأسباب والخطورة.
 *
 * كل الدوال تحترم صلاحية العرض ونطاق الفرع/الشركة الحالي.
 */

import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { financialFieldVisibility } from '../auth/sensitiveFields';
import { BranchAccessService } from '../auth/BranchAccessService';
import { round2 } from '../finance/financials';

export interface BatchLocationInfo {
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  barcode: string;
  quantityM2: number;
}

export interface BatchAvailabilityGroup {
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  toneShade: string;
  caliber: string;
  grade: string;
  batchesCount: number;
  activeBatchesCount: number;
  totalM2: number;
  remainingM2: number;
  reservedM2: number;
  availableM2: number;
  oldestReceivedDate: string | null;
  locations: BatchLocationInfo[];
}

export interface TransferSuggestion {
  productId: string;
  productName: string;
  productSku: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  suggestedQuantityM2: number;
  sourceAvailableM2: number;
  sourceSurplusM2: number;
  targetAvailableM2: number;
  targetRequiredM2: number;
  targetDeficitM2: number;
  targetDailySalesM2: number;
  targetCoverageDays: number;
  leadTimeDays: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL';
  reason: string;
  batches: Array<{
    batchId: string;
    batchNumber: string;
    toneShade: string;
    caliber: string;
    grade: string;
    availableM2: number;
  }>;
}

export interface LowMarginAlert {
  productId: string;
  productName: string;
  productSku: string;
  quantitySoldM2: number;
  invoiceCount: number;
  revenue: number;
  cost: number;
  marginValue: number;
  marginPct: number;
  averageSellingPriceM2: number;
  averageCostM2: number;
  listSellingPriceM2: number;
  listCostPrice: number;
  listMarginPct: number;
  severity: 'NEGATIVE' | 'LOW' | 'BELOW_TARGET';
  reason: string;
}

export interface DeadStockRow {
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantityM2: number;
  reservedM2: number;
  availableM2: number;
  unitCost: number;
  stockValue: number;
  lastSoldDate: string | null;
  daysSinceLastSale: number | null;
  oldestBatchDate: string | null;
  batchAgeDays: number | null;
  batches: Array<{
    batchNumber: string;
    toneShade: string;
    caliber: string;
    grade: string;
    remainingM2: number;
    receivedDate: string | null;
  }>;
  reason: string;
}

export interface CountVarianceRow {
  countId: string;
  countNumber: string;
  countDate: string;
  countType: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productName: string;
  systemQuantityM2: number;
  countedQuantityM2: number;
  varianceM2: number;
  variancePct: number;
  unitCost: number;
  varianceValue: number;
  direction: 'SHORTAGE' | 'SURPLUS';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  reasonSource: 'COUNT_NOTE' | 'ITEM_NOTE' | 'INFERRED';
}

export interface CountVarianceAnalysis {
  totals: {
    sessions: number;
    lines: number;
    shortageValue: number;
    surplusValue: number;
    netValue: number;
    netVarianceM2: number;
    unexplainedLines: number;
  };
  byCountType: Array<{
    countType: string;
    sessions: number;
    lines: number;
    netVarianceM2: number;
    netValue: number;
    shortageValue: number;
    surplusValue: number;
  }>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    lines: number;
    netVarianceM2: number;
    netValue: number;
  }>;
  rows: CountVarianceRow[];
}

export class InventoryIntelligenceService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  // ─── Shared helpers ────────────────────────────────────────────────────────

  private requireView(): ReturnType<typeof AuthService.requireAuth> {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.inventory.hub.view');
    return actor;
  }

  private warehouseScope(alias = 'w') {
    const actor = this.requireView();
    return this.branchAccess.warehouseBranchScope(alias, undefined, actor);
  }

  private daysBetween(dateString: string | null): number | null {
    if (!dateString) return null;
    const then = new Date(`${dateString}T00:00:00`).getTime();
    if (!Number.isFinite(then)) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(0, Math.floor((today - then) / 86_400_000));
  }

  // ─── Batch availability ────────────────────────────────────────────────────

  /**
   * إتاحة الدفعات مجمّعة حسب الصنف/المخزن/النغمة/العيار/الفرز.
   * المحجوزات على مستوى الصنف/المخزن تُوزَّع على المجموعات بنظام FIFO
   * (الأقدم استلاماً أولاً) حتى تكون "الإتاحة" قابلة للبيع فعلاً.
   */
  public getBatchAvailability(filter: {
    productId?: string;
    warehouseId?: string;
    includeEmpty?: boolean;
  } = {}): BatchAvailabilityGroup[] {
    const actor = this.requireView();
    if (filter.warehouseId) this.branchAccess.requireWarehouseAuthorization(filter.warehouseId, actor);
    const scope = this.warehouseScope('w');

    let sql = `
      SELECT
        pb.product_id            AS productId,
        p.name                   AS productName,
        p.sku                    AS productSku,
        pb.warehouse_id          AS warehouseId,
        w.name                   AS warehouseName,
        COALESCE(pb.tone_shade, '')                    AS toneShade,
        COALESCE(pb.caliber, '0')                      AS caliber,
        COALESCE(NULLIF(pb.grade, ''), p.grade, '')    AS grade,
        COUNT(*)                                       AS batchesCount,
        SUM(CASE WHEN COALESCE(pb.quantity_remaining_m2, 0) > 0.001 THEN 1 ELSE 0 END) AS activeBatchesCount,
        COALESCE(SUM(pb.quantity_m2), 0)               AS totalM2,
        COALESCE(SUM(pb.quantity_remaining_m2), 0)     AS remainingM2,
        MIN(pb.received_date)                          AS oldestReceivedDate
      FROM product_batches pb
      JOIN products p ON p.id = pb.product_id
      JOIN warehouses w ON w.id = pb.warehouse_id
      WHERE p.is_active = 1 AND w.is_active = 1 AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];

    if (filter.productId) {
      sql += ` AND pb.product_id = ?`;
      params.push(filter.productId);
    }
    if (filter.warehouseId) {
      sql += ` AND pb.warehouse_id = ?`;
      params.push(filter.warehouseId);
    }

    sql += `
      GROUP BY pb.product_id, pb.warehouse_id, pb.tone_shade, pb.caliber,
               COALESCE(NULLIF(pb.grade, ''), p.grade, '')
    `;
    if (!filter.includeEmpty) {
      sql += ` HAVING COALESCE(SUM(pb.quantity_remaining_m2), 0) > 0.001`;
    }
    sql += ` ORDER BY p.name ASC, w.name ASC, pb.tone_shade ASC, pb.caliber ASC`;

    const groups = this.db.query<any>(sql, params);

    // حجوزات نشطة على مستوى الصنف/المخزن
    const reservationSql = `
      SELECT r.product_id AS productId, r.warehouse_id AS warehouseId,
             COALESCE(SUM(r.quantity_m2), 0) AS reservedM2
      FROM stock_reservations r
      JOIN warehouses w ON w.id = r.warehouse_id
      WHERE r.status = 'ACTIVE'
        AND (r.expires_at IS NULL OR r.expires_at >= date('now'))
        AND ${scope.clause}
      GROUP BY r.product_id, r.warehouse_id
    `;
    const reservations = new Map<string, number>();
    for (const row of this.db.query<any>(reservationSql, scope.params)) {
      reservations.set(`${row.productId}|${row.warehouseId}`, Number(row.reservedM2) || 0);
    }

    // مواقع الأرفف/الصناديق لكل صنف ومخزن
    const locationSql = `
      SELECT pls.product_id AS productId, wl.warehouse_id AS warehouseId,
             wl.zone, wl.aisle, wl.shelf, wl.bin, wl.barcode,
             COALESCE(SUM(pls.quantity_m2), 0) AS quantityM2
      FROM product_location_stock pls
      JOIN warehouse_locations wl ON wl.id = pls.location_id
      JOIN warehouses w ON w.id = wl.warehouse_id
      WHERE wl.is_active = 1 AND ${scope.clause}
      GROUP BY pls.product_id, wl.warehouse_id, wl.zone, wl.aisle, wl.shelf, wl.bin, wl.barcode
      ORDER BY wl.zone, wl.aisle, wl.shelf, wl.bin
    `;
    const locations = new Map<string, BatchLocationInfo[]>();
    for (const row of this.db.query<any>(locationSql, scope.params)) {
      const key = `${row.productId}|${row.warehouseId}`;
      if (!locations.has(key)) locations.set(key, []);
      locations.get(key)!.push({
        zone: String(row.zone ?? ''),
        aisle: String(row.aisle ?? ''),
        shelf: String(row.shelf ?? ''),
        bin: String(row.bin ?? ''),
        barcode: String(row.barcode ?? ''),
        quantityM2: round2(Number(row.quantityM2) || 0),
      });
    }

    // توزيع الحجز على المجموعات FIFO لكل صنف/مخزن
    const byProductWarehouse = new Map<string, any[]>();
    for (const group of groups) {
      const key = `${group.productId}|${group.warehouseId}`;
      if (!byProductWarehouse.has(key)) byProductWarehouse.set(key, []);
      byProductWarehouse.get(key)!.push(group);
    }

    const result: BatchAvailabilityGroup[] = [];
    for (const [key, list] of byProductWarehouse) {
      list.sort((left, right) => String(left.oldestReceivedDate ?? '').localeCompare(String(right.oldestReceivedDate ?? '')));
      let reserved = reservations.get(key) ?? 0;
      for (const group of list) {
        const remaining = round2(Number(group.remainingM2) || 0);
        const take = round2(Math.min(remaining, reserved));
        reserved = round2(Math.max(0, reserved - take));
        result.push({
          productId: group.productId,
          productName: group.productName,
          productSku: group.productSku,
          warehouseId: group.warehouseId,
          warehouseName: group.warehouseName,
          toneShade: group.toneShade || '',
          caliber: group.caliber || '0',
          grade: group.grade || '',
          batchesCount: Number(group.batchesCount) || 0,
          activeBatchesCount: Number(group.activeBatchesCount) || 0,
          totalM2: round2(Number(group.totalM2) || 0),
          remainingM2: remaining,
          reservedM2: take,
          availableM2: round2(Math.max(0, remaining - take)),
          oldestReceivedDate: group.oldestReceivedDate ?? null,
          locations: locations.get(key) ?? [],
        });
      }
    }

    return result.sort((left, right) =>
      left.productName.localeCompare(right.productName)
      || left.warehouseName.localeCompare(right.warehouseName)
      || left.toneShade.localeCompare(right.toneShade)
      || left.grade.localeCompare(right.grade)
    );
  }

  // ─── Transfer suggestions ──────────────────────────────────────────────────

  /**
   * يقترح تحويلات بين المخازن لنفس الصنف: من مخزن به فائض إلى مخزن
   * رصيده لا يغطي طلبه المتوقع. يعتمد على متوسط المبيعات الصافية (60 يوماً)،
   * مخزون الأمان، وقت التوريد، والحد الأدنى/نقطة إعادة الطلب.
   */
  public suggestTransfers(filter: {
    productId?: string;
    warehouseId?: string;
    minTransferM2?: number;
  } = {}): TransferSuggestion[] {
    const actor = this.requireView();
    if (filter.warehouseId) this.branchAccess.requireWarehouseAuthorization(filter.warehouseId, actor);
    const scope = this.warehouseScope('w');
    const minTransfer = filter.minTransferM2 ?? 1;

    let sql = `
      SELECT
        p.id                            AS productId,
        p.name                          AS productName,
        p.sku                           AS productSku,
        p.cost_price / 100.0        AS unitCost,
        w.id                            AS warehouseId,
        w.name                          AS warehouseName,
        w.company_id                    AS companyId,
        COALESCE(ws.quantity_m2, 0)     AS quantityM2,
        COALESCE(ws.reserved_m2, 0)     AS reservedM2,
        COALESCE(pwp.min_stock_level, p.min_stock_level, 0) AS minStockLevel,
        COALESCE(pwp.reorder_point, p.reorder_point, 0)     AS reorderPoint,
        COALESCE(pwp.safety_stock, p.safety_stock, 0)       AS safetyStock,
        COALESCE(pwp.lead_time_days, p.lead_time_days, 7)   AS leadTimeDays,
        COALESCE((
          SELECT SUM(sii.quantity_m2)
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.warehouse_id = w.id
            AND si.date >= date('now', '-60 days') AND si.date <= date('now')
            AND COALESCE(si.invoice_status, 'COMPLETED') != 'VOID'
        ), 0) AS grossSales60,
        COALESCE((
          SELECT SUM(sri.quantity_m2)
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN sales_invoices original ON original.id = sr.original_invoice_id
          WHERE sri.product_id = p.id AND sr.warehouse_id = w.id
            AND original.warehouse_id = w.id
            AND sr.date >= date('now', '-60 days') AND sr.date <= date('now')
            AND COALESCE(original.invoice_status, 'COMPLETED') != 'VOID'
        ), 0) AS returns60
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = w.id
      LEFT JOIN product_warehouse_planning pwp ON pwp.product_id = p.id AND pwp.warehouse_id = w.id
      WHERE p.is_active = 1 AND w.is_active = 1
        AND p.product_type NOT IN ('SERVICE')
        AND (p.base_unit IS NULL OR p.base_unit != 'SERVICE')
        AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];
    if (filter.productId) {
      sql += ` AND p.id = ?`;
      params.push(filter.productId);
    }
    if (filter.warehouseId) {
      sql += ` AND w.id = ?`;
      params.push(filter.warehouseId);
    }

    const rows = this.db.query<any>(sql, params);

    const byProduct = new Map<string, any[]>();
    for (const row of rows) {
      const key = `${row.productId}|${row.companyId ?? ''}`;
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key)!.push(row);
    }

    const suggestions: TransferSuggestion[] = [];

    for (const [, productRows] of byProduct) {
      if (productRows.length < 2) continue;
      const productId = productRows[0].productId;

      const enriched = productRows.map((row) => {
        const available = Math.max(0, (Number(row.quantityM2) || 0) - (Number(row.reservedM2) || 0));
        const dailySales = Math.max(0, ((Number(row.grossSales60) || 0) - (Number(row.returns60) || 0)) / 60);
        const leadTime = Number(row.leadTimeDays) || 7;
        const safetyStock = Number(row.safetyStock) || 0;
        const reorderPoint = Number(row.reorderPoint) || 0;
        const minStock = Number(row.minStockLevel) || 0;
        const targetLevel = Math.max(reorderPoint, minStock, safetyStock, round2(dailySales * leadTime + safetyStock));
        const coverageDays = dailySales > 0 ? Math.floor(available / dailySales) : (available > 0 ? 9999 : 0);
        return { ...row, available, dailySales, leadTime, safetyStock, reorderPoint, minStock, targetLevel, coverageDays };
      });

      const targets = enriched
        .filter((row) => row.dailySales > 0 && row.available < row.targetLevel)
        .sort((left, right) => left.coverageDays - right.coverageDays);
      if (!targets.length) continue;

      const sources = enriched
        .filter((row) => Math.max(0, row.available - Math.max(row.safetyStock, row.targetLevel)) > 0.001)
        .sort((left, right) => (right.available - right.targetLevel) - (left.available - left.targetLevel));
      if (!sources.length) continue;

      const usedSourceQty = new Map<string, number>();

      for (const target of targets) {
        let remainingDeficit = round2(Math.max(0, target.targetLevel - target.available));
        if (remainingDeficit < 0.001) continue;

        for (const source of sources) {
          if (source.warehouseId === target.warehouseId) continue;
          if (remainingDeficit < 0.001) break;

          const alreadyUsed = usedSourceQty.get(source.warehouseId) ?? 0;
          const sourceSurplus = round2(Math.max(0, source.available - Math.max(source.safetyStock, source.targetLevel)));
          const sourceFree = round2(Math.max(0, sourceSurplus - alreadyUsed));
          if (sourceFree < 0.001) continue;

          const quantity = round2(Math.min(sourceFree, remainingDeficit));
          if (quantity < minTransfer) continue;

          usedSourceQty.set(source.warehouseId, round2(alreadyUsed + quantity));
          remainingDeficit = round2(remainingDeficit - quantity);

          const urgency: TransferSuggestion['urgency'] =
            target.available <= 0 || target.coverageDays < target.leadTime
              ? 'CRITICAL'
              : target.coverageDays < target.leadTime * 2
                ? 'HIGH'
                : 'NORMAL';

          suggestions.push({
            productId,
            productName: target.productName,
            productSku: target.productSku,
            fromWarehouseId: source.warehouseId,
            fromWarehouseName: source.warehouseName,
            toWarehouseId: target.warehouseId,
            toWarehouseName: target.warehouseName,
            suggestedQuantityM2: quantity,
            sourceAvailableM2: round2(source.available),
            sourceSurplusM2: sourceSurplus,
            targetAvailableM2: round2(target.available),
            targetRequiredM2: round2(target.targetLevel),
            targetDeficitM2: round2(target.targetLevel - target.available),
            targetDailySalesM2: round2(target.dailySales),
            targetCoverageDays: target.coverageDays,
            leadTimeDays: target.leadTime,
            urgency,
            reason: this.transferReason(target, quantity),
            batches: this.sourceBatches(productId, source.warehouseId, quantity, scope),
          });
        }
      }
    }

    const urgencyRank: Record<TransferSuggestion['urgency'], number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
    return suggestions.sort((left, right) =>
      urgencyRank[left.urgency] - urgencyRank[right.urgency]
      || right.suggestedQuantityM2 - left.suggestedQuantityM2
      || left.productName.localeCompare(right.productName)
    );
  }

  private transferReason(target: any, quantity: number): string {
    if (target.available <= 0) {
      return `نفاد رصيد ${target.productName} في ${target.warehouseName}؛ تحويل ${quantity.toFixed(2)} م² يغطي طلباً يومياً ${target.dailySales.toFixed(2)} م².`;
    }
    return `رصيد ${target.warehouseName} يغطي ${target.coverageDays} يوماً فقط مقابل وقت توريد ${target.leadTime} يوماً؛ تحويل ${quantity.toFixed(2)} م² للوصول إلى الرصيد المستهدف ${target.targetLevel.toFixed(2)} م².`;
  }

  private sourceBatches(
    productId: string,
    warehouseId: string,
    quantity: number,
    scope: { clause: string; params: string[] }
  ): TransferSuggestion['batches'] {
    const rows = this.db.query<any>(`
      SELECT pb.id AS batchId, pb.batch_number AS batchNumber,
             COALESCE(pb.tone_shade, '') AS toneShade,
             COALESCE(pb.caliber, '0') AS caliber,
             COALESCE(pb.grade, '') AS grade,
             COALESCE(pb.quantity_remaining_m2, 0) AS remainingM2
      FROM product_batches pb
      JOIN warehouses w ON w.id = pb.warehouse_id
      WHERE pb.product_id = ? AND pb.warehouse_id = ?
        AND COALESCE(pb.quantity_remaining_m2, 0) > 0.001
        AND ${scope.clause}
      ORDER BY pb.received_date ASC, pb.created_at ASC, pb.id ASC
    `, [productId, warehouseId, ...scope.params]);

    let remaining = quantity;
    const batches: TransferSuggestion['batches'] = [];
    for (const row of rows) {
      if (remaining <= 0.001) break;
      const available = Number(row.remainingM2) || 0;
      const take = round2(Math.min(available, remaining));
      if (take <= 0.001) continue;
      batches.push({
        batchId: row.batchId,
        batchNumber: row.batchNumber,
        toneShade: row.toneShade || '',
        caliber: row.caliber || '0',
        grade: row.grade || '',
        availableM2: take,
      });
      remaining = round2(remaining - take);
    }
    return batches;
  }

  // ─── Low margin alerts ─────────────────────────────────────────────────────

  /**
   * أصناف تحقق هامشاً أقل من الحد المطلوب خلال فترة (افتراضي 90 يوماً).
   * يعتمد على التكلفة الفعلية المسجلة في بنود الفواتير (COGS)، لا سعر القائمة.
   */
  public getLowMarginAlerts(filter: {
    days?: number;
    thresholdPct?: number;
    productId?: string;
    limit?: number;
  } = {}): LowMarginAlert[] {
    const actor = this.requireView();
    // التقرير نفسه هامش ربح — بلا صلاحية رؤية الربح لا تُرجع نتائج.
    if (!financialFieldVisibility().profit) return [];
    const scope = this.warehouseScope('w');
    const days = Math.max(1, Math.floor(filter.days ?? 90));
    const threshold = Number.isFinite(filter.thresholdPct) ? Number(filter.thresholdPct) : 10;
    const limit = Math.max(1, Math.floor(filter.limit ?? 100));

    let sql = `
      SELECT
        p.id                     AS productId,
        p.name                   AS productName,
        p.sku                    AS productSku,
        COALESCE(p.selling_price_m2, 0) / 100.0 AS listSellingPriceM2,
        COALESCE(p.cost_price, 0) / 100.0       AS listCostPrice,
        COALESCE(SUM(sii.quantity_m2), 0)  AS quantitySoldM2,
        COUNT(DISTINCT si.id)              AS invoiceCount,
        COALESCE(SUM(sii.total_price), 0) / 100.0  AS revenue,
        COALESCE(SUM(sii.total_cost), 0) / 100.0   AS cost
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      JOIN warehouses w ON w.id = si.warehouse_id
      WHERE COALESCE(si.invoice_status, 'COMPLETED') != 'VOID'
        AND si.date >= date('now', ?) AND si.date <= date('now')
        AND ${scope.clause}
    `;
    const params: unknown[] = [`-${days} days`, ...scope.params];
    if (filter.productId) {
      sql += ` AND p.id = ?`;
      params.push(filter.productId);
    }
    sql += `
      GROUP BY p.id
      HAVING COALESCE(SUM(sii.total_price), 0) / 100.0 > 0
      ORDER BY ((COALESCE(SUM(sii.total_price), 0) - COALESCE(SUM(sii.total_cost), 0)) / 100.0 * 1.0
               / COALESCE(SUM(sii.total_price), 0)) ASC
    `;

    const rows = this.db.query<any>(sql, params);
    const result: LowMarginAlert[] = [];

    for (const row of rows) {
      const revenue = round2(Number(row.revenue) || 0);
      const cost = round2(Number(row.cost) || 0);
      const marginValue = round2(revenue - cost);
      const marginPct = revenue > 0 ? round2((marginValue / revenue) * 100) : 0;
      if (marginPct >= threshold) continue;

      const listSelling = round2(Number(row.listSellingPriceM2) || 0);
      const listCost = round2(Number(row.listCostPrice) || 0);
      const listMarginPct = listSelling > 0 ? round2(((listSelling - listCost) / listSelling) * 100) : 0;
      const quantity = round2(Number(row.quantitySoldM2) || 0);

      const severity: LowMarginAlert['severity'] =
        marginPct < 0 ? 'NEGATIVE' : marginPct < Math.max(1, threshold / 2) ? 'LOW' : 'BELOW_TARGET';

      result.push({
        productId: row.productId,
        productName: row.productName,
        productSku: row.productSku,
        quantitySoldM2: quantity,
        invoiceCount: Number(row.invoiceCount) || 0,
        revenue,
        cost,
        marginValue,
        marginPct,
        averageSellingPriceM2: quantity > 0 ? round2(revenue / quantity) : 0,
        averageCostM2: quantity > 0 ? round2(cost / quantity) : 0,
        listSellingPriceM2: listSelling,
        listCostPrice: listCost,
        listMarginPct,
        severity,
        reason: marginPct < 0
          ? `البيع بأقل من التكلفة: خسارة ${Math.abs(marginValue).toFixed(2)} ج.م خلال ${days} يوماً.`
          : `هامش الربح ${marginPct.toFixed(1)}% أقل من الحد المستهدف ${threshold.toFixed(1)}%.`,
      });

      if (result.length >= limit) break;
    }

    return result;
  }

  // ─── Dead stock ────────────────────────────────────────────────────────────

  /**
   * مخزون راكد: كمية متاحة أكبر من صفر ولم تُبع خلال عدد الأيام المحدد
   * (أو لم تُبع إطلاقاً). يعرض قيمة المخزون الراكد وتفاصيل الدفعات.
   */
  public getDeadStock(filter: {
    days?: number;
    minValue?: number;
    warehouseId?: string;
    productId?: string;
    limit?: number;
  } = {}): DeadStockRow[] {
    const actor = this.requireView();
    const canSeeCost = financialFieldVisibility().cost;
    if (filter.warehouseId) this.branchAccess.requireWarehouseAuthorization(filter.warehouseId, actor);
    const scope = this.warehouseScope('w');
    const days = Math.max(1, Math.floor(filter.days ?? 90));
    const minValue = Number(filter.minValue) || 0;
    const limit = Math.max(1, Math.floor(filter.limit ?? 500));

    let sql = `
      SELECT
        p.id                      AS productId,
        p.name                    AS productName,
        p.sku                     AS productSku,
        w.id                      AS warehouseId,
        w.name                    AS warehouseName,
        COALESCE(ws.quantity_m2, 0) AS quantityM2,
        COALESCE(ws.reserved_m2, 0) AS reservedM2,
        COALESCE(p.cost_price, 0) / 100.0   AS unitCost,
        (
          SELECT MAX(si.date)
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.warehouse_id = w.id
            AND COALESCE(si.invoice_status, 'COMPLETED') != 'VOID'
        ) AS lastSoldDate,
        (
          SELECT MIN(pb.received_date)
          FROM product_batches pb
          WHERE pb.product_id = p.id AND pb.warehouse_id = w.id
            AND COALESCE(pb.quantity_remaining_m2, 0) > 0.001
        ) AS oldestBatchDate
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND w.is_active = 1
        AND COALESCE(ws.quantity_m2, 0) > 0.001
        AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];
    if (filter.warehouseId) {
      sql += ` AND w.id = ?`;
      params.push(filter.warehouseId);
    }
    if (filter.productId) {
      sql += ` AND p.id = ?`;
      params.push(filter.productId);
    }
    sql += `
      AND (
        NOT EXISTS (
          SELECT 1
          FROM sales_invoice_items sii2
          JOIN sales_invoices si2 ON si2.id = sii2.invoice_id
          WHERE sii2.product_id = p.id AND si2.warehouse_id = w.id
            AND COALESCE(si2.invoice_status, 'COMPLETED') != 'VOID'
            AND si2.date >= date('now', ?)
        )
      )
      ORDER BY (COALESCE(ws.quantity_m2, 0) - COALESCE(ws.reserved_m2, 0)) * COALESCE(p.cost_price, 0) DESC
    `;
    params.push(`-${days} days`);

    const rows = this.db.query<any>(sql, params);
    const result: DeadStockRow[] = [];

    for (const row of rows) {
      const quantity = round2(Number(row.quantityM2) || 0);
      const reserved = round2(Number(row.reservedM2) || 0);
      const available = round2(Math.max(0, quantity - reserved));
      const realUnitCost = round2(Number(row.unitCost) || 0);
      const realStockValue = round2(available * realUnitCost);
      if (realStockValue < minValue) continue;
      const unitCost = canSeeCost ? realUnitCost : 0;
      const stockValue = canSeeCost ? realStockValue : 0;

      const daysSinceLastSale = this.daysBetween(row.lastSoldDate ?? null);
      const batchAgeDays = this.daysBetween(row.oldestBatchDate ?? null);

      result.push({
        productId: row.productId,
        productName: row.productName,
        productSku: row.productSku,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        quantityM2: quantity,
        reservedM2: reserved,
        availableM2: available,
        unitCost,
        stockValue,
        lastSoldDate: row.lastSoldDate ?? null,
        daysSinceLastSale,
        oldestBatchDate: row.oldestBatchDate ?? null,
        batchAgeDays,
        batches: this.deadStockBatches(row.productId, row.warehouseId),
        reason: canSeeCost
          ? (row.lastSoldDate
            ? `بدون مبيعات منذ ${daysSinceLastSale} يوماً؛ قيمة المخزون المتاح ${stockValue.toFixed(2)} ج.م.`
            : `لم يُبع هذا الصنف من هذا المخزن إطلاقاً؛ قيمة المخزون المتاح ${stockValue.toFixed(2)} ج.م.`)
          : (row.lastSoldDate
            ? `بدون مبيعات منذ ${daysSinceLastSale} يوماً.`
            : `لم يُبع هذا الصنف من هذا المخزن إطلاقاً.`),
      });

      if (result.length >= limit) break;
    }

    return result;
  }

  private deadStockBatches(productId: string, warehouseId: string): DeadStockRow['batches'] {
    return this.db.query<any>(`
      SELECT pb.batch_number AS batchNumber,
             COALESCE(pb.tone_shade, '') AS toneShade,
             COALESCE(pb.caliber, '0') AS caliber,
             COALESCE(pb.grade, '') AS grade,
             COALESCE(pb.quantity_remaining_m2, 0) AS remainingM2,
             pb.received_date AS receivedDate
      FROM product_batches pb
      WHERE pb.product_id = ? AND pb.warehouse_id = ?
        AND COALESCE(pb.quantity_remaining_m2, 0) > 0.001
      ORDER BY pb.received_date ASC, pb.created_at ASC, pb.id ASC
    `, [productId, warehouseId]).map((row) => ({
      batchNumber: row.batchNumber,
      toneShade: row.toneShade || '',
      caliber: row.caliber || '0',
      grade: row.grade || '',
      remainingM2: round2(Number(row.remainingM2) || 0),
      receivedDate: row.receivedDate ?? null,
    }));
  }

  // ─── Count variance analysis ───────────────────────────────────────────────

  /**
   * تحليل فروقات الجرد المرحّل مع تصنيف الاتجاه والخطورة والسبب.
   * الأسباب تُقرأ من ملاحظات الجلسة أو البند، وإذا غابت تُصنَّف كغير مفسرة
   * مع توجيه المراجعة حسب اتجاه الفرق.
   */
  public getCountVarianceAnalysis(filter: {
    from?: string;
    to?: string;
    warehouseId?: string;
    countType?: string;
    limit?: number;
  } = {}): CountVarianceAnalysis {
    const actor = this.requireView();
    if (filter.warehouseId) this.branchAccess.requireWarehouseAuthorization(filter.warehouseId, actor);
    const scope = this.warehouseScope('w');
    const limit = Math.max(1, Math.floor(filter.limit ?? 1000));

    let sql = `
      SELECT
        sc.id              AS countId,
        sc.count_number    AS countNumber,
        sc.date            AS countDate,
        sc.count_type      AS countType,
        sc.notes           AS countNotes,
        w.id               AS warehouseId,
        w.name             AS warehouseName,
        p.id               AS productId,
        p.name             AS productName,
        COALESCE(sci.system_quantity_m2, 0)  AS systemQuantityM2,
        COALESCE(sci.counted_quantity_m2, 0) AS countedQuantityM2,
        COALESCE(sci.variance_m2, 0)         AS varianceM2,
        COALESCE(sci.unit_cost, 0) / 100.0           AS unitCost,
        COALESCE(sci.variance_value, 0) / 100.0      AS varianceValue,
        sci.notes          AS itemNotes
      FROM stock_count_items sci
      JOIN stock_counts sc ON sc.id = sci.count_id
      JOIN products p ON p.id = sci.product_id
      JOIN warehouses w ON w.id = sc.warehouse_id
      WHERE sc.status = 'POSTED'
        AND ABS(COALESCE(sci.variance_m2, 0)) > 0.001
        AND ${scope.clause}
    `;
    const params: unknown[] = [...scope.params];

    if (filter.from) { sql += ` AND sc.date >= ?`; params.push(filter.from); }
    if (filter.to) { sql += ` AND sc.date <= ?`; params.push(filter.to); }
    if (filter.warehouseId) { sql += ` AND sc.warehouse_id = ?`; params.push(filter.warehouseId); }
    if (filter.countType) { sql += ` AND sc.count_type = ?`; params.push(filter.countType); }

    sql += ` ORDER BY ABS(COALESCE(sci.variance_value, 0)) DESC LIMIT ?`;
    params.push(limit);

    const canSeeCost = financialFieldVisibility().cost;
    const rawRows = this.db.query<any>(sql, params);
    const rows: CountVarianceRow[] = [];

    for (const raw of rawRows) {
      // قيمة الفرق نقدية — تُخفى كليًا (unitCost + varianceValue) لغير المصرَّح،
      // فتُشتق severity والتجميعات أصفارًا دون تسريب نسبي.
      if (!canSeeCost) {
        raw.unitCost = 0;
        raw.varianceValue = 0;
      }
      const systemQuantity = round2(Number(raw.systemQuantityM2) || 0);
      const countedQuantity = round2(Number(raw.countedQuantityM2) || 0);
      const variance = round2(Number(raw.varianceM2) || 0);
      const varianceValue = round2(Number(raw.varianceValue) || 0);
      const variancePct = systemQuantity > 0 ? round2((variance / systemQuantity) * 100) : (variance === 0 ? 0 : 100);
      const direction: CountVarianceRow['direction'] = variance < 0 ? 'SHORTAGE' : 'SURPLUS';
      const absValue = Math.abs(varianceValue);
      const severity: CountVarianceRow['severity'] = absValue >= 500 ? 'HIGH' : absValue >= 100 ? 'MEDIUM' : 'LOW';

      const countNotes = String(raw.countNotes ?? '').trim();
      const itemNotes = String(raw.itemNotes ?? '').trim();
      let reason: string;
      let reasonSource: CountVarianceRow['reasonSource'];
      if (itemNotes) {
        reason = itemNotes;
        reasonSource = 'ITEM_NOTE';
      } else if (countNotes) {
        reason = countNotes;
        reasonSource = 'COUNT_NOTE';
      } else {
        reason = direction === 'SHORTAGE'
          ? 'عجز غير مفسر — راجع التالف/الكسور أو خطأ تسجيل الصرف.'
          : 'زيادة غير مفسرة — راجع استلاماً غير مرحّل أو خطأ في العد/الوزن.';
        reasonSource = 'INFERRED';
      }

      rows.push({
        countId: raw.countId,
        countNumber: raw.countNumber,
        countDate: raw.countDate,
        countType: raw.countType,
        warehouseId: raw.warehouseId,
        warehouseName: raw.warehouseName,
        productId: raw.productId,
        productName: raw.productName,
        systemQuantityM2: systemQuantity,
        countedQuantityM2: countedQuantity,
        varianceM2: variance,
        variancePct,
        unitCost: round2(Number(raw.unitCost) || 0),
        varianceValue,
        direction,
        severity,
        reason,
        reasonSource,
      });
    }

    const sessionIds = new Set(rows.map((row) => row.countId));
    const shortageValue = round2(rows.filter((row) => row.direction === 'SHORTAGE').reduce((total, row) => total + Math.abs(row.varianceValue), 0));
    const surplusValue = round2(rows.filter((row) => row.direction === 'SURPLUS').reduce((total, row) => total + row.varianceValue, 0));

    const typeMap = new Map<string, CountVarianceAnalysis['byCountType'][number]>();
    const typeSessions = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!typeMap.has(row.countType)) {
        typeMap.set(row.countType, { countType: row.countType, sessions: 0, lines: 0, netVarianceM2: 0, netValue: 0, shortageValue: 0, surplusValue: 0 });
        typeSessions.set(row.countType, new Set());
      }
      const bucket = typeMap.get(row.countType)!;
      typeSessions.get(row.countType)!.add(row.countId);
      bucket.lines += 1;
      bucket.netVarianceM2 = round2(bucket.netVarianceM2 + row.varianceM2);
      bucket.netValue = round2(bucket.netValue + row.varianceValue);
      if (row.direction === 'SHORTAGE') bucket.shortageValue = round2(bucket.shortageValue + Math.abs(row.varianceValue));
      else bucket.surplusValue = round2(bucket.surplusValue + row.varianceValue);
    }
    for (const [countType, sessions] of typeSessions) {
      typeMap.get(countType)!.sessions = sessions.size;
    }

    const warehouseMap = new Map<string, CountVarianceAnalysis['byWarehouse'][number]>();
    for (const row of rows) {
      if (!warehouseMap.has(row.warehouseId)) {
        warehouseMap.set(row.warehouseId, { warehouseId: row.warehouseId, warehouseName: row.warehouseName, lines: 0, netVarianceM2: 0, netValue: 0 });
      }
      const bucket = warehouseMap.get(row.warehouseId)!;
      bucket.lines += 1;
      bucket.netVarianceM2 = round2(bucket.netVarianceM2 + row.varianceM2);
      bucket.netValue = round2(bucket.netValue + row.varianceValue);
    }

    return {
      totals: {
        sessions: sessionIds.size,
        lines: rows.length,
        shortageValue,
        surplusValue,
        netValue: round2(rows.reduce((total, row) => total + row.varianceValue, 0)),
        netVarianceM2: round2(rows.reduce((total, row) => total + row.varianceM2, 0)),
        unexplainedLines: rows.filter((row) => row.reasonSource === 'INFERRED').length,
      },
      byCountType: [...typeMap.values()].sort((left, right) => Math.abs(right.netValue) - Math.abs(left.netValue)),
      byWarehouse: [...warehouseMap.values()].sort((left, right) => Math.abs(right.netValue) - Math.abs(left.netValue)),
      rows,
    };
  }
}
