import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Ceramics-showroom reports: design-level sales (brand / size / grade /
 * surface), saved area takeoffs and stock coverage by showroom vs store.
 * All queries are branch scoped like every other report.
 */
export function CeramicsReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class CeramicsReports extends Base {
    /** Design sales grouped by the requested dimension. */
    public async ceramicsDesignSales({ from, to, dimension }: ReportParams): Promise<ReportResult> {
      const scope = this.salesScope();
      const groupBy =
        dimension === 'size' ? 'p.size'
        : dimension === 'grade' ? 'p.grade'
        : dimension === 'surface' ? "COALESCE(p.surface_location, 'GENERAL')"
        : dimension === 'finish' ? "COALESCE(p.finish, '')"
        : 'COALESCE(b.name, \'\')';
      const labelExpr =
        dimension === 'size' ? 'p.size'
        : dimension === 'grade' ? 'p.grade'
        : dimension === 'surface' ? "COALESCE(p.surface_location, 'GENERAL')"
        : dimension === 'finish' ? "COALESCE(p.finish, '—')"
        : "COALESCE(NULLIF(b.name, ''), 'بدون ماركة')";
      const rows = await this.db.queryAsync<any>(`
        SELECT ${labelExpr} AS label,
               ROUND(SUM(sii.quantity_m2), 2) AS quantity,
               ROUND(SUM(sii.total_price) / 100.0, 2) AS revenue,
               ROUND(SUM(sii.total_cost) / 100.0, 2) AS cost,
               COUNT(DISTINCT sii.invoice_id) AS invoices
        FROM sales_invoice_items sii
        JOIN sales_invoices si ON si.id = sii.invoice_id
        JOIN products p ON p.id = sii.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        GROUP BY ${groupBy}
        ORDER BY revenue DESC`,
        [from, to, ...scope.params]);
      const revenue = rows.reduce((s, r) => s + num(r.revenue), 0);
      const cost = rows.reduce((s, r) => s + num(r.cost), 0);
      return {
        kpis: [
          { label: 'إجمالي الإيراد', value: revenue, tone: 'success' },
          { label: 'مجمل الربح', value: round2(revenue - cost), tone: 'info' },
          { label: 'عدد الفواتير', value: rows.reduce((s, r) => s + num(r.invoices), 0), tone: 'neutral' },
          { label: 'أصناف مباعة', value: rows.length, tone: 'neutral' },
        ],
        columns: [
          { key: 'label', label: 'التصنيف' },
          { key: 'quantity', label: 'المساحة (م²)', type: 'qty' },
          { key: 'revenue', label: 'الإيراد', type: 'currency' },
          { key: 'cost', label: 'التكلفة', type: 'currency' },
          { key: 'profit', label: 'الربح', type: 'currency' },
          { key: 'invoices', label: 'الفواتير', type: 'number' },
        ],
        rows: rows.map((r) => ({
          ...r,
          profit: round2(num(r.revenue) - num(r.cost)),
        })),
      };
    }

    /** Saved area takeoffs (مقاييسات المساحات) with conversion status. */
    public async ceramicTakeoffs({ from, to, status }: ReportParams): Promise<ReportResult> {
      this.actor();
      const scope = this.branchAccess.sqlScope('q.branch_id', undefined, this.actor());
      const clauses = [`q.created_at >= ?`, `q.created_at <= ?`, scope.clause];
      const params: unknown[] = [from, to, ...scope.params];
      if (status && status !== 'ALL') { clauses.push('q.status = ?'); params.push(status); }
      const rows = await this.db.queryAsync<any>(`
        SELECT q.quote_number AS quoteNumber, q.customer_name AS customer,
               q.product_name AS product, q.area_m2 AS areaM2, q.waste_percent AS waste,
               q.required_m2 AS requiredM2, q.boxes_needed AS boxes,
               q.unit_price_m2 / 1.0 AS unitPrice, q.total_amount / 1.0 AS total,
               q.status, q.quotation_number AS quotationNumber, q.created_at AS createdAt
        FROM ceramic_area_quotes q
        WHERE ${clauses.join(' AND ')}
        ORDER BY q.created_at DESC`, params);
      const total = rows.reduce((s, r) => s + num(r.total), 0);
      const converted = rows.filter((r) => r.quotationNumber).length;
      return {
        kpis: [
          { label: 'عدد المقاييسات', value: rows.length, tone: 'neutral' },
          { label: 'إجمالي القيمة', value: total, tone: 'success' },
          { label: 'محوّلة لعرض سعر', value: converted, tone: 'info' },
          { label: 'مفتوحة', value: rows.length - converted, tone: 'warning' },
        ],
        columns: [
          { key: 'quoteNumber', label: 'رقم المقاييسة' },
          { key: 'customer', label: 'العميل' },
          { key: 'product', label: 'الصنف' },
          { key: 'areaM2', label: 'المساحة (م²)', type: 'qty' },
          { key: 'waste', label: 'الهالك %', type: 'percent' },
          { key: 'boxes', label: 'الكراتين', type: 'qty' },
          { key: 'total', label: 'الإجمالي', type: 'currency' },
          { key: 'status', label: 'الحالة', type: 'badge' },
          { key: 'quotationNumber', label: 'عرض السعر', type: 'text' },
          { key: 'createdAt', label: 'التاريخ', type: 'date' },
        ],
        rows,
      };
    }

    /** Stock coverage: every active product split showroom vs store, in m² and boxes. */
    public async ceramicStockCoverage(): Promise<ReportResult> {
      this.actor();
      const scope = this.tableScope('br.id', 'w.id');
      const rows = await this.db.queryAsync<any>(`
        SELECT p.name, COALESCE(b.name, '') AS brand, p.grade, p.size,
               COALESCE(p.meters_per_box, 1.44) AS metersPerBox,
               COALESCE(SUM(CASE WHEN w.warehouse_type = 'SHOWROOM' THEN ws.quantity_m2 ELSE 0 END), 0) AS showroomM2,
               COALESCE(SUM(CASE WHEN w.warehouse_type != 'SHOWROOM' THEN ws.quantity_m2 ELSE 0 END), 0) AS storeM2,
               COALESCE(SUM(ws.quantity_m2), 0) AS totalM2,
               COALESCE(p.min_stock_level, 0) AS minStock
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
        LEFT JOIN warehouses w ON w.id = ws.warehouse_id
        LEFT JOIN branches br ON br.id = w.branch_id
        WHERE p.is_active = 1 AND (ws.product_id IS NULL OR ${scope.clause})
        GROUP BY p.id
        ORDER BY totalM2 DESC`, scope.params);
      const mapped = rows.map((r) => {
        const mPerBox = num(r.metersPerBox) || 1.44;
        const totalM2 = round2(num(r.totalM2));
        return {
          ...r,
          showroomM2: round2(num(r.showroomM2)),
          storeM2: round2(num(r.storeM2)),
          totalM2,
          boxes: mPerBox > 0 ? round2(totalM2 / mPerBox) : 0,
          lowStock: num(r.minStock) > 0 && totalM2 < num(r.minStock),
        };
      });
      const totalM2 = mapped.reduce((s, r) => s + r.totalM2, 0);
      const low = mapped.filter((r) => r.lowStock).length;
      return {
        kpis: [
          { label: 'إجمالي المخزون (م²)', value: totalM2, tone: 'info' },
          { label: 'أصناف تحت حد الطلب', value: low, tone: low ? 'danger' : 'success' },
          { label: 'عدد الأصناف', value: mapped.length, tone: 'neutral' },
        ],
        columns: [
          { key: 'name', label: 'الصنف' },
          { key: 'brand', label: 'الماركة' },
          { key: 'grade', label: 'الفرز' },
          { key: 'size', label: 'المقاس' },
          { key: 'showroomM2', label: 'المعرض (م²)', type: 'qty' },
          { key: 'storeM2', label: 'المخزن (م²)', type: 'qty' },
          { key: 'totalM2', label: 'الإجمالي (م²)', type: 'qty' },
          { key: 'boxes', label: 'الكراتين', type: 'qty' },
          { key: 'lowStock', label: 'منخفض', type: 'badge' },
        ],
        rows: mapped,
      };
    }
  };
}
