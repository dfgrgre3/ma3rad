import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, dimensionLabel } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function PurchaseReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class PurchaseReports extends Base {
  public async purchaseAnalysis(params: ReportParams): Promise<ReportResult> {
    const dimension = params.dimension || 'supplier';
    const scope = this.purchaseScope();
    const rows = await this.db.queryAsync<any>(`
      SELECT pi.date, COALESCE(s.name, 'بدون مورد') AS supplier,
        COALESCE(w.name, 'بدون مخزن') AS warehouse, p.name AS product,
        pii.quantity_m2 AS quantity, pii.total_cost / 100.0 AS amount, 0 AS isReturn
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN products p ON p.id = pii.product_id
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      LEFT JOIN warehouses w ON w.id = pi.warehouse_id
      WHERE pi.date >= ? AND pi.date <= ? AND ${scope.clause}
      UNION ALL
      SELECT pr.date, COALESCE(s.name, 'بدون مورد'), COALESCE(w.name, 'بدون مخزن'), p.name,
        -pri.quantity_m2, -pri.total_refund / 100.0, 1
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      JOIN products p ON p.id = pri.product_id
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN warehouses w ON w.id = pr.warehouse_id
      WHERE pr.date >= ? AND pr.date <= ? AND ${scope.clause}
    `, [params.from, params.to, ...scope.params, params.from, params.to, ...scope.params]);
    const labelOf = (row: any): string => {
      if (dimension === 'warehouse') return row.warehouse;
      if (dimension === 'product') return row.product;
      return row.supplier;
    };
    const groups = new Map<string, { label: string; quantity: number; amount: number; returns: number }>();
    for (const row of rows) {
      const label = labelOf(row);
      const group = groups.get(label) || { label, quantity: 0, amount: 0, returns: 0 };
      group.quantity += num(row.quantity);
      group.amount += num(row.amount);
      if (row.isReturn) group.returns += Math.abs(num(row.amount));
      groups.set(label, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        label: group.label,
        quantity: round2(group.quantity),
        amount: round2(group.amount),
        returns: round2(group.returns),
        net: round2(group.amount - group.returns),
        averageCost: group.quantity ? round2(group.amount / group.quantity) : 0,
      }))
      .sort((a, b) => b.net - a.net);
    return {
      kpis: [
        { label: 'إجمالي المشتريات', value: round2(result.reduce((total, row) => total + row.amount, 0)), tone: 'warning' },
        { label: 'مرتجعات الشراء', value: round2(result.reduce((total, row) => total + row.returns, 0)), tone: 'danger' },
        { label: 'صافي المشتريات', value: round2(result.reduce((total, row) => total + row.net, 0)), tone: 'info' },
        { label: 'الكمية المشتراة', value: round2(result.reduce((total, row) => total + row.quantity, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: dimensionLabel(dimension) },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'net', label: 'الصافي', type: 'currency' },
        { key: 'averageCost', label: 'متوسط التكلفة', type: 'currency' },
      ],
      rows: result,
    };
  }
  public async supplierPrices({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.purchaseScope();
    const rows = await this.db.queryAsync<any>(`
      SELECT p.id AS productId, p.name AS product, s.name AS supplier,
        MIN(pii.unit_cost) / 100.0 AS minPrice, MAX(pii.unit_cost) / 100.0 AS maxPrice,
        AVG(pii.unit_cost) / 100.0 AS avgPrice,
        (SELECT pii2.unit_cost / 100.0 FROM purchase_invoice_items pii2
          JOIN purchase_invoices pi2 ON pi2.id = pii2.purchase_id
          WHERE pii2.product_id = p.id AND pi2.supplier_id = s.id AND pi2.date <= ?
          ORDER BY pi2.date DESC, pii2.id DESC LIMIT 1) AS lastPrice,
        SUM(pii.quantity_m2) AS quantity, MAX(pi.date) AS lastPurchase
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN products p ON p.id = pii.product_id
      JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.date >= ? AND pi.date <= ? AND ${scope.clause}
      GROUP BY p.id, s.id
      ORDER BY p.name, avgPrice ASC
    `, [to, from, to, ...scope.params]);
    const best = new Map<string, number>();
    for (const row of rows) {
      const current = best.get(row.productId);
      if (current === undefined || num(row.avgPrice) < current) best.set(row.productId, num(row.avgPrice));
    }
    const result = rows.map((row) => ({
      product: row.product,
      supplier: row.supplier,
      minPrice: round2(num(row.minPrice)),
      maxPrice: round2(num(row.maxPrice)),
      avgPrice: round2(num(row.avgPrice)),
      lastPrice: round2(num(row.lastPrice)),
      quantity: round2(num(row.quantity)),
      lastPurchase: row.lastPurchase,
      cheapest: num(row.avgPrice) <= (best.get(row.productId) ?? Infinity),
      saving: round2(Math.max(0, num(row.maxPrice) - num(row.minPrice))),
    })).sort((a, b) => a.product.localeCompare(b.product) || a.avgPrice - b.avgPrice);
    return {
      kpis: [
        { label: 'أصناف مقارنة', value: best.size, tone: 'info' },
        { label: 'موردون', value: new Set(result.map((row) => row.supplier)).size, tone: 'neutral' },
        { label: 'فرق السعر المتاح', value: round2(result.reduce((total, row) => total + row.saving, 0)), hint: 'الفرق بين أعلى وأقل سعر لكل صنف', tone: 'success' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'supplier', label: 'المورد' },
        { key: 'minPrice', label: 'أقل سعر', type: 'currency' },
        { key: 'avgPrice', label: 'متوسط السعر', type: 'currency' },
        { key: 'lastPrice', label: 'آخر سعر', type: 'currency' },
        { key: 'maxPrice', label: 'أعلى سعر', type: 'currency' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'saving', label: 'فرق السعر', type: 'currency' },
      ],
      rows: result,
    };
  }
  public async countVariance({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('w.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT sc.count_number AS countNumber, sc.date, w.name AS warehouse,
        p.name AS product, sci.system_quantity_m2 AS systemQty,
        sci.counted_quantity_m2 AS countedQty, sci.variance_m2 AS variance,
        sci.unit_cost / 100.0 AS unitCost, sci.variance_value / 100.0 AS varianceValue,
        sc.status
      FROM stock_count_items sci
      JOIN stock_counts sc ON sc.id = sci.count_id
      JOIN products p ON p.id = sci.product_id
      LEFT JOIN warehouses w ON w.id = sc.warehouse_id
      WHERE sc.date >= ? AND sc.date <= ? AND sc.status = 'POSTED' AND ABS(sci.variance_m2) > 0.001 AND ${scope.clause}
      ORDER BY ABS(sci.variance_value) DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      systemQty: round2(num(row.systemQty)),
      countedQty: round2(num(row.countedQty)),
      variance: round2(num(row.variance)),
      varianceValue: round2(num(row.varianceValue)),
      kind: num(row.variance) > 0 ? 'زيادة' : 'عجز',
    }));
    return {
      kpis: [
        { label: 'صافي فروقات الجرد', value: round2(result.reduce((total, row) => total + row.varianceValue, 0)), tone: 'warning' },
        { label: 'قيمة العجز', value: round2(result.filter((row) => num(row.variance) < 0).reduce((total, row) => total + Math.abs(num(row.varianceValue)), 0)), tone: 'danger' },
        { label: 'قيمة الزيادة', value: round2(result.filter((row) => num(row.variance) > 0).reduce((total, row) => total + num(row.varianceValue), 0)), tone: 'success' },
        { label: 'جلسات جرد', value: new Set(result.map((row) => row.countNumber)).size, tone: 'info' },
      ],
      columns: [
        { key: 'countNumber', label: 'رقم الجرد' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'product', label: 'الصنف' },
        { key: 'systemQty', label: 'رصيد النظام', type: 'qty' },
        { key: 'countedQty', label: 'الرصيد المعدود', type: 'qty' },
        { key: 'variance', label: 'الفرق', type: 'qty' },
        { key: 'varianceValue', label: 'قيمة الفرق', type: 'currency' },
        { key: 'kind', label: 'النوع', type: 'badge' },
      ],
      rows: result,
    };
  }
  };
}
