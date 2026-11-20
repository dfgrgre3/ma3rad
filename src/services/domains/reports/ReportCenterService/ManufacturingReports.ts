import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, fmtMoney } from './helpers';

type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Manufacturing reports: production orders with incurred cost, WIP snapshot
 * and quality yield. All queries are branch scoped like every other report.
 */
export function ManufacturingReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class ManufacturingReports extends Base {
    /** Production orders created in the period with material/labor/total cost. */
    public async manufacturingProduction({ from, to }: ReportParams): Promise<ReportResult> {
      const actor = this.actor();
      const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
      const key = `mfg-production:${this.cachePartition(actor)}:${from}:${to}`;
      return this.withCache(key, async () => {
        const rows = await this.db.queryAsync<any>(`
          SELECT o.id, o.order_number AS orderNumber, p.name AS productName, o.quantity,
                 o.produced_qty AS producedQty, o.status, o.priority,
                 o.start_date AS startDate, o.due_date AS dueDate, o.completed_at AS completedAt,
                 o.created_at AS createdAt,
                 so.order_number AS salesOrderNumber, c.name AS customerName,
                 br.name AS branchName
          FROM production_orders o
          JOIN products p ON p.id = o.product_id
          LEFT JOIN orders so ON so.id = o.sales_order_id
          LEFT JOIN customers c ON c.id = o.customer_id
          LEFT JOIN branches br ON br.id = o.branch_id
          WHERE o.status != 'CANCELLED'
            AND o.created_at >= ? AND o.created_at <= ?
            AND ${scope.clause}
          ORDER BY o.created_at DESC`,
          [`${from}T00:00:00`, `${to}T23:59:59`, ...scope.params]
        );

        const orderIds = rows.map((row) => row.id ?? row.orderId).filter(Boolean);
        // Cost aggregates per order (materials consumed + labor incl. overhead).
        const costs = new Map<string, { material: number; labor: number }>();
        if (orderIds.length > 0) {
          const placeholders = orderIds.map(() => '?').join(',');
          const costRows = await this.db.queryAsync<any>(`
            SELECT m.order_id AS orderId,
                   COALESCE(SUM(m.consumed_qty * pr.cost_price / 100.0), 0) AS materialCost
            FROM production_order_materials m
            JOIN products pr ON pr.id = m.product_id
            WHERE m.order_id IN (${placeholders})
            GROUP BY m.order_id`,
            orderIds
          );
          const laborRows = await this.db.queryAsync<any>(`
            SELECT op.order_id AS orderId,
                   COALESCE(SUM(op.actual_minutes * (wc.cost_per_hour + wc.overhead_per_hour) / 100.0 / 60.0), 0) AS laborCost
            FROM production_order_operations op
            JOIN work_centers wc ON wc.id = op.work_center_id
            WHERE op.order_id IN (${placeholders})
            GROUP BY op.order_id`,
            orderIds
          );
          for (const row of costRows) costs.set(row.orderId, { material: num(row.materialCost), labor: 0 });
          for (const row of laborRows) {
            const entry = costs.get(row.orderId) || { material: 0, labor: 0 };
            entry.labor = num(row.laborCost);
            costs.set(row.orderId, entry);
          }
        }

        const reportRows = rows.map((row) => {
          const orderId = row.id ?? row.orderId;
          const cost = costs.get(orderId) || { material: 0, labor: 0 };
          const total = cost.material + cost.labor;
          const qty = num(row.quantity);
          return {
            orderNumber: row.orderNumber,
            productName: row.productName,
            quantity: qty,
            producedQty: num(row.producedQty),
            status: row.status,
            priority: row.priority,
            salesOrderNumber: row.salesOrderNumber || '—',
            customerName: row.customerName || '—',
            branchName: row.branchName || '—',
            startDate: row.startDate || '—',
            dueDate: row.dueDate || '—',
            completedAt: row.completedAt ? String(row.completedAt).slice(0, 10) : '—',
            materialCost: fmtMoney(cost.material),
            laborCost: fmtMoney(cost.labor),
            totalCost: fmtMoney(total),
            costPerUnit: qty > 0 ? fmtMoney(total / qty) : '—',
          };
        });

        const completedQty = reportRows.reduce((sum, row) => sum + num(row.producedQty || row.quantity), 0);
        const totalCost = [...costs.values()].reduce((sum, c) => sum + c.material + c.labor, 0);
        return {
          kpis: [
            { label: 'أوامر الإنتاج', value: reportRows.length },
            { label: 'الكمية المنتجة', value: Math.round(completedQty * 100) / 100 },
            { label: 'إجمالي التكلفة', value: fmtMoney(totalCost), tone: 'success' as const },
          ],
          columns: [
            { key: 'orderNumber', label: 'رقم الأمر' },
            { key: 'productName', label: 'المنتج' },
            { key: 'quantity', label: 'الكمية', type: 'qty' as const, align: 'end' as const },
            { key: 'producedQty', label: 'المنتج فعليًا', type: 'qty' as const, align: 'end' as const },
            { key: 'status', label: 'الحالة' },
            { key: 'priority', label: 'الأولوية' },
            { key: 'salesOrderNumber', label: 'أمر البيع' },
            { key: 'customerName', label: 'العميل' },
            { key: 'branchName', label: 'الفرع' },
            { key: 'startDate', label: 'البدء' },
            { key: 'dueDate', label: 'الاستحقاق' },
            { key: 'completedAt', label: 'الاكتمال' },
            { key: 'materialCost', label: 'تكلفة المواد', align: 'end' as const },
            { key: 'laborCost', label: 'تكلفة العمالة', align: 'end' as const },
            { key: 'totalCost', label: 'الإجمالي', align: 'end' as const },
            { key: 'costPerUnit', label: 'تكلفة/وحدة', align: 'end' as const },
          ],
          rows: reportRows,
        };
      });
    }

    /** WIP valuation snapshot: open orders with planned material cost. */
    public async manufacturingWip(_: ReportParams): Promise<ReportResult> {
      const actor = this.actor();
      const scope = this.branchAccess.sqlScope('o.branch_id', undefined, actor);
      const key = `mfg-wip:${this.cachePartition(actor)}`;
      return this.withCache(key, async () => {
        const rows = await this.db.queryAsync<any>(`
          SELECT o.id AS orderId, o.order_number AS orderNumber, p.name AS productName,
                 o.quantity, o.produced_qty AS producedQty, o.status, o.priority,
                 o.due_date AS dueDate, br.name AS branchName,
                 COALESCE(SUM(m.planned_qty * pr.cost_price / 100.0), 0) AS plannedMaterialCost,
                 COALESCE(SUM(m.consumed_qty * pr.cost_price / 100.0), 0) AS consumedMaterialCost
          FROM production_orders o
          JOIN products p ON p.id = o.product_id
          LEFT JOIN production_order_materials m ON m.order_id = o.id
          LEFT JOIN products pr ON pr.id = m.product_id
          LEFT JOIN branches br ON br.id = o.branch_id
          WHERE o.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS')
            AND ${scope.clause}
          GROUP BY o.id
          ORDER BY o.due_date IS NULL, o.due_date`,
          scope.params
        );
        const reportRows = rows.map((row) => ({
          orderNumber: row.orderNumber,
          productName: row.productName,
          quantity: num(row.quantity),
          producedQty: num(row.producedQty),
          remainingQty: Math.round((num(row.quantity) - num(row.producedQty)) * 1000) / 1000,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate || '—',
          branchName: row.branchName || '—',
          plannedMaterialCost: fmtMoney(num(row.plannedMaterialCost)),
          consumedMaterialCost: fmtMoney(num(row.consumedMaterialCost)),
        }));
        const totalPlanned = rows.reduce((sum, row) => sum + num(row.plannedMaterialCost), 0);
        return {
          kpis: [
            { label: 'أوامر مفتوحة', value: reportRows.length },
            { label: 'القيمة المخططة', value: fmtMoney(totalPlanned), tone: 'warning' as const },
          ],
          columns: [
            { key: 'orderNumber', label: 'رقم الأمر' },
            { key: 'productName', label: 'المنتج' },
            { key: 'quantity', label: 'الكمية', type: 'qty' as const, align: 'end' as const },
            { key: 'producedQty', label: 'المنتج', type: 'qty' as const, align: 'end' as const },
            { key: 'remainingQty', label: 'المتبقي', type: 'qty' as const, align: 'end' as const },
            { key: 'status', label: 'الحالة' },
            { key: 'priority', label: 'الأولوية' },
            { key: 'dueDate', label: 'الاستحقاق' },
            { key: 'branchName', label: 'الفرع' },
            { key: 'plannedMaterialCost', label: 'تكلفة المواد المخططة', align: 'end' as const },
            { key: 'consumedMaterialCost', label: 'المصروف فعليًا', align: 'end' as const },
          ],
          rows: reportRows,
        };
      });
    }

    /** OEE per work center: availability × performance × quality. */
    public async manufacturingOee(_: ReportParams): Promise<ReportResult> {
      const actor = this.actor();
      const wcScope = this.branchAccess.sqlScope('wc.branch_id', undefined, actor);
      const key = `mfg-oee:${this.cachePartition(actor)}`;
      return this.withCache(key, async () => {
        const centers = await this.db.queryAsync<any>(`
          SELECT wc.id, wc.code, wc.name, wc.branch_id AS branchId
          FROM work_centers wc
          WHERE wc.is_active = 1 AND ${wcScope.clause}
          ORDER BY wc.code`,
          wcScope.params
        );
        const reportRows = [] as any[];
        for (const center of centers) {
          const load = (await this.db.queryAsync<any>(`
            SELECT COALESCE(SUM(op.planned_minutes),0) AS plannedMinutes,
                   COALESCE(SUM(CASE WHEN op.status = 'COMPLETED' THEN op.actual_minutes ELSE 0 END),0) AS actualMinutes
            FROM production_order_operations op
            JOIN production_orders o ON o.id = op.order_id
            WHERE op.work_center_id = ? AND o.status != 'CANCELLED'`,
            [center.id]
          ))[0];
          const down = (await this.db.queryAsync<any>(`
            SELECT COALESCE(SUM(minutes),0) AS minutes FROM manufacturing_downtime WHERE work_center_id = ?`,
            [center.id]
          ))[0];
          const qual = (await this.db.queryAsync<any>(`
            SELECT COALESCE(SUM(q.quantity_inspected),0) AS inspected,
                   COALESCE(SUM(q.quantity_accepted),0) AS accepted
            FROM manufacturing_quality_checks q
            JOIN production_orders o ON o.id = q.production_order_id
            WHERE o.status != 'CANCELLED'
              AND EXISTS (SELECT 1 FROM production_order_operations op
                          WHERE op.order_id = o.id AND op.work_center_id = ?)`,
            [center.id]
          ))[0];
          const planned = num(load?.plannedMinutes);
          const actual = num(load?.actualMinutes);
          const downMin = num(down?.minutes);
          const inspected = num(qual?.inspected);
          const accepted = num(qual?.accepted);
          const availability = planned > 0 ? Math.round(Math.max(0, (planned - downMin) / planned) * 10000) / 100 : null;
          const perfRaw = actual > 0 ? Math.round((planned / actual) * 10000) / 100 : null;
          const performance = perfRaw === null ? null : Math.min(perfRaw, 100);
          const qualityPct = inspected > 0 ? Math.round((accepted / inspected) * 10000) / 100 : null;
          const oee = availability !== null && performance !== null && qualityPct !== null
            ? Math.round((availability / 100) * (performance / 100) * (qualityPct / 100) * 10000) / 100
            : null;
          reportRows.push({
            code: center.code,
            name: center.name,
            plannedMinutes: Math.round(planned),
            actualMinutes: Math.round(actual),
            downtimeMinutes: Math.round(downMin),
            availabilityPercent: availability,
            performancePercent: performance,
            qualityPercent: qualityPct,
            oeePercent: oee,
          });
        }
        const avgOee = reportRows.filter((r) => r.oeePercent !== null);
        const avg = avgOee.length
          ? Math.round((avgOee.reduce((s, r) => s + r.oeePercent, 0) / avgOee.length) * 100) / 100
          : null;
        return {
          kpis: [
            { label: 'مراكز العمل', value: reportRows.length },
            { label: 'متوسط OEE', value: avg === null ? '—' : `${avg}%`, tone: 'info' as const },
          ],
          columns: [
            { key: 'code', label: 'الرمز' },
            { key: 'name', label: 'مركز العمل' },
            { key: 'plannedMinutes', label: 'مخطط (دقيقة)', type: 'qty' as const, align: 'end' as const },
            { key: 'actualMinutes', label: 'فعلي (دقيقة)', type: 'qty' as const, align: 'end' as const },
            { key: 'downtimeMinutes', label: 'توقف (دقيقة)', type: 'qty' as const, align: 'end' as const },
            { key: 'availabilityPercent', label: 'التوافر %', align: 'end' as const },
            { key: 'performancePercent', label: 'الأداء %', align: 'end' as const },
            { key: 'qualityPercent', label: 'الجودة %', align: 'end' as const },
            { key: 'oeePercent', label: 'OEE %', align: 'end' as const },
          ],
          rows: reportRows,
          notes: ['OEE = التوافر × الأداء × الجودة عبر كامل سجلات الإنتاج غير الملغاة.'],
        };
      });
    }
  };
}
