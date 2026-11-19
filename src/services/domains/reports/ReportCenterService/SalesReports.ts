import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, sum, fmtMoney, dimensionLabel, previousRange } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function SalesReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class SalesReports extends Base {
  private async salesActivityRows(from: string, to: string) {
    const scope = this.salesScope();
    return await this.db.queryAsync<any>(`
      SELECT si.date, si.customer_id AS customerId, c.name AS customerName,
        COALESCE(e.full_name, u.full_name, 'بدون مندوب') AS repName,
        COALESCE(w.name, 'بدون مخزن') AS warehouseName,
        sii.product_id AS productId, p.name AS productName,
        sii.quantity_m2 AS quantity, sii.total_price / 100.0 AS revenue, sii.total_cost / 100.0 AS cost,
        sii.discount_amount / 100.0 AS lineDiscount, 0 AS isReturn
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      JOIN products p ON p.id = sii.product_id
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN orders o ON o.invoice_id = si.id
      LEFT JOIN employees e ON e.id = COALESCE(si.sales_rep_id, o.sales_rep_id)
      LEFT JOIN users u ON u.id = si.created_by
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      UNION ALL
      SELECT sr.date, sr.customer_id, c.name,
        COALESCE(u.full_name, 'بدون مندوب'),
        COALESCE(w.name, 'بدون مخزن'),
        sri.product_id, p.name, -sri.quantity_m2, -sri.total_refund / 100.0, -(sri.quantity_m2 * sri.unit_cost) / 100.0,
        0, 1
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      JOIN sales_return_items sri ON sri.return_id = sr.id
      JOIN products p ON p.id = sri.product_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params, from, to, ...scope.params]);
  }
  public async salesAnalysis(params: ReportParams): Promise<ReportResult> {
    const dimension = params.dimension || 'warehouse';
    const rows = await this.salesActivityRows(params.from, params.to);
    const keyOf = (row: any): string => {
      if (dimension === 'customer') return row.customerName || 'بدون عميل';
      if (dimension === 'rep') return row.repName || 'بدون مندوب';
      if (dimension === 'product') return row.productName || 'بدون صنف';
      return row.warehouseName || 'بدون مخزن';
    };
    const groups = new Map<string, { label: string; quantity: number; revenue: number; cost: number; returns: number; invoices: number }>();
    for (const row of rows) {
      const label = keyOf(row);
      const group = groups.get(label) || { label, quantity: 0, revenue: 0, cost: 0, returns: 0, invoices: 0 };
      group.quantity += num(row.quantity);
      group.revenue += num(row.revenue);
      group.cost += num(row.cost);
      if (row.isReturn) group.returns += Math.abs(num(row.revenue));
      else group.invoices += 1;
      groups.set(label, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        label: group.label,
        quantity: round2(group.quantity),
        revenue: round2(group.revenue),
        cost: round2(group.cost),
        profit: round2(group.revenue - group.cost),
        margin: group.revenue ? round2(((group.revenue - group.cost) / group.revenue) * 100) : 0,
        returns: round2(group.returns),
        lines: group.invoices,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    return {
      kpis: [
        { label: 'صافي المبيعات', value: round2(result.reduce((total, row) => total + row.revenue, 0)), tone: 'success' },
        { label: 'صافي الربح', value: round2(result.reduce((total, row) => total + row.profit, 0)), tone: 'info' },
        { label: 'المرتجعات', value: round2(result.reduce((total, row) => total + row.returns, 0)), tone: 'warning' },
        { label: 'الكمية المباعة', value: round2(result.reduce((total, row) => total + row.quantity, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: dimensionLabel(dimension) },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'revenue', label: 'صافي الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'هامش الربح', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'lines', label: 'عدد السطور', type: 'number' },
      ],
      rows: result,
    };
  }
  public async productSales({ from, to }: ReportParams): Promise<ReportResult> {
    const result = await this.salesAnalysis({ from, to, dimension: 'product' });
    return {
      ...result,
      columns: [
        { key: 'label', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية المباعة (م²)', type: 'qty' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
      ],
    };
  }
  public async productDetail({ from, to, productId }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const purchaseScope = this.purchaseScope();
    const product = productId
      ? (await this.db.queryAsync<any>('SELECT id, name, sku, cost_price / 100.0 AS costPrice, selling_price_m2 / 100.0 AS sellingPrice FROM products WHERE id = ?', [productId]))[0]
      : null;
    const sales = productId
      ? await this.db.queryAsync<any>(`
          SELECT si.date, si.invoice_number AS docNumber, 'فاتورة بيع' AS docType,
            c.name AS party, sii.quantity_m2 AS quantity, sii.unit_price / 100.0 AS unitPrice,
            sii.total_price / 100.0 AS amount, sii.total_cost / 100.0 AS cost,
            (sii.total_price - sii.total_cost) / 100.0 AS profit
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          LEFT JOIN customers c ON c.id = si.customer_id
          WHERE sii.product_id = ? AND si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
          ORDER BY si.date DESC
        `, [productId, from, to, ...scope.params])
      : [];
    const returns = productId
      ? await this.db.queryAsync<any>(`
          SELECT sr.date, sr.return_number AS docNumber, 'مرتجع بيع' AS docType,
            c.name AS party, -sri.quantity_m2 AS quantity, sri.unit_price / 100.0 AS unitPrice,
            -sri.total_refund / 100.0 AS amount, -(sri.quantity_m2 * sri.unit_cost) / 100.0 AS cost,
            (-sri.total_refund + sri.quantity_m2 * sri.unit_cost) / 100.0 AS profit
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          LEFT JOIN customers c ON c.id = sr.customer_id
          WHERE sri.product_id = ? AND sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
          ORDER BY sr.date DESC
        `, [productId, from, to, ...scope.params])
      : [];
    const purchases = productId
      ? await this.db.queryAsync<any>(`
          SELECT pi.date, pi.invoice_number AS docNumber, 'فاتورة شراء' AS docType,
            s.name AS party, pii.quantity_m2 AS quantity, pii.unit_cost / 100.0 AS unitPrice,
            pii.total_cost / 100.0 AS amount, 0 AS cost, 0 AS profit
          FROM purchase_invoice_items pii
          JOIN purchase_invoices pi ON pi.id = pii.purchase_id
          LEFT JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pii.product_id = ? AND pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}
          ORDER BY pi.date DESC
        `, [productId, from, to, ...purchaseScope.params])
      : [];
    const rows = [...sales, ...returns, ...purchases].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const totalRevenue = sum(rows.filter((row) => row.docType !== 'فاتورة شراء'), 'amount');
    const totalCost = sum(rows.filter((row) => row.docType !== 'فاتورة شراء'), 'cost');
    const purchased = sum(rows.filter((row) => row.docType === 'فاتورة شراء'), 'amount');
    return {
      kpis: [
        { label: 'الصنف', value: product?.name || 'اختر صنفًا', hint: product?.sku || '', tone: 'info' },
        { label: 'صافي المبيعات', value: totalRevenue, tone: 'success' },
        { label: 'صافي الربح', value: round2(totalRevenue - totalCost), tone: 'info' },
        { label: 'قيمة المشتريات', value: purchased, tone: 'warning' },
        { label: 'صافي الكمية', value: round2(sum(rows, 'quantity')), tone: 'neutral' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'docType', label: 'نوع المستند', type: 'badge' },
        { key: 'docNumber', label: 'رقم المستند' },
        { key: 'party', label: 'الطرف' },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'unitPrice', label: 'السعر', type: 'currency' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
      ],
      rows,
      notes: productId ? undefined : ['اختر صنفًا من القائمة أعلاه لعرض تفاصيله.'],
    };
  }
  public async productProfitability({ from, to }: ReportParams): Promise<ReportResult> {
    const result = await this.salesAnalysis({ from, to, dimension: 'product' });
    const rows = result.rows.map((row) => ({ ...row }));
    const totalProfit = rows.reduce((total, row) => total + num(row.profit), 0);
    let cumulative = 0;
    rows.sort((a, b) => num(b.profit) - num(a.profit));
    for (const row of rows) {
      cumulative += Math.max(0, num(row.profit));
      const share = totalProfit > 0 ? (Math.max(0, num(row.profit)) / totalProfit) * 100 : 0;
      row.share = round2(share);
      row.cumulativeShare = round2(totalProfit > 0 ? (cumulative / totalProfit) * 100 : 0);
      row.abc = row.cumulativeShare <= 80 ? 'A' : row.cumulativeShare <= 95 ? 'B' : 'C';
      row.status = num(row.profit) < 0 ? 'خاسر' : num(row.margin) < 10 ? 'هامش منخفض' : 'ربحي';
    }
    return {
      kpis: [
        { label: 'إجمالي الربح', value: round2(totalProfit), tone: 'success' },
        { label: 'أصناف A', value: rows.filter((row) => row.abc === 'A').length, hint: 'تساهم بـ 80% من الربح', tone: 'info' },
        { label: 'أصناف خاسرة', value: rows.filter((row) => num(row.profit) < 0).length, tone: 'danger' },
        { label: 'متوسط الهامش', value: round2(rows.length ? rows.reduce((total, row) => total + num(row.margin), 0) / rows.length : 0), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'share', label: 'نسبة الربح', type: 'percent' },
        { key: 'abc', label: 'تصنيف ABC', type: 'badge' },
      ],
      rows,
      notes: ['تصنيف ABC (باريتو): A أول 80% من الربح، B حتى 95%، C الباقي.'],
    };
  }
  public async customerProfitability({ from, to }: ReportParams): Promise<ReportResult> {
    const rows = await this.salesActivityRows(from, to);
    const groups = new Map<string, { customer: string; revenue: number; cost: number; returns: number; invoices: number; discounts: number; lastPurchase: string }>();
    for (const row of rows) {
      const key = row.customerName || 'بدون عميل';
      const group = groups.get(key) || { customer: key, revenue: 0, cost: 0, returns: 0, invoices: 0, discounts: 0, lastPurchase: '' };
      group.revenue += num(row.revenue);
      group.cost += num(row.cost);
      group.discounts += Math.abs(num(row.lineDiscount));
      if (row.isReturn) group.returns += Math.abs(num(row.revenue));
      else {
        group.invoices += 1;
        if (!group.lastPurchase || row.date > group.lastPurchase) group.lastPurchase = row.date;
      }
      groups.set(key, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        customer: group.customer,
        revenue: round2(group.revenue),
        cost: round2(group.cost),
        profit: round2(group.revenue - group.cost),
        margin: group.revenue ? round2(((group.revenue - group.cost) / group.revenue) * 100) : 0,
        discounts: round2(group.discounts),
        discountRate: group.revenue + group.discounts > 0 ? round2((group.discounts / (group.revenue + group.discounts)) * 100) : 0,
        returns: round2(group.returns),
        averageInvoice: group.invoices ? round2(group.revenue / group.invoices) : 0,
        lastPurchase: group.lastPurchase,
      }))
      .sort((a, b) => b.profit - a.profit);
    return {
      kpis: [
        { label: 'صافي المبيعات', value: round2(result.reduce((total, row) => total + row.revenue, 0)), tone: 'success' },
        { label: 'صافي الربح', value: round2(result.reduce((total, row) => total + row.profit, 0)), tone: 'info' },
        { label: 'العملاء', value: result.length, tone: 'neutral' },
        { label: 'أعلى عميل ربحًا', value: result[0]?.customer || '—', hint: fmtMoney(result[0]?.profit), tone: 'success' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'discounts', label: 'الخصومات', type: 'currency' },
        { key: 'discountRate', label: 'نسبة الخصم', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'averageInvoice', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'lastPurchase', label: 'آخر شراء', type: 'date' },
      ],
      rows: result,
    };
  }
  public async periodComparison({ from, to }: ReportParams): Promise<ReportResult> {
    const current = await this.periodMetrics(from, to);
    const previousRangeValue = previousRange(from, to);
    const previous = await this.periodMetrics(previousRangeValue.from, previousRangeValue.to);
    const metrics = [
      ['المبيعات', 'sales', 'currency'],
      ['الربح', 'profit', 'currency'],
      ['عدد الفواتير', 'invoices', 'number'],
      ['عدد العملاء', 'customers', 'number'],
    ] as const;
    const rows = metrics.map(([label, key, type]) => {
      const currentValue = num(current[key]);
      const previousValue = num(previous[key]);
      const currentDisplay = type === 'currency' ? round2(currentValue) : Math.round(currentValue);
      const previousDisplay = type === 'currency' ? round2(previousValue) : Math.round(previousValue);
      return {
        metric: label,
        type,
        current: currentDisplay,
        previous: previousDisplay,
        change: type === 'currency' ? round2(currentValue - previousValue) : Math.round(currentValue - previousValue),
        changePercent: previousValue ? round2(((currentValue - previousValue) / Math.abs(previousValue)) * 100) : 0,
      };
    });
    return {
      kpis: [
        { label: 'مبيعات الفترة الحالية', value: num(current.sales), hint: `${from} → ${to}`, tone: 'success' },
        { label: 'مبيعات الفترة السابقة', value: num(previous.sales), hint: `${previousRangeValue.from} → ${previousRangeValue.to}`, tone: 'neutral' },
        { label: 'نمو المبيعات', value: previous.sales ? round2(((num(current.sales) - num(previous.sales)) / Math.abs(num(previous.sales))) * 100) : 0, tone: num(current.sales) >= num(previous.sales) ? 'success' : 'danger' },
        { label: 'تغير الربح', value: round2(num(current.profit) - num(previous.profit)), tone: num(current.profit) >= num(previous.profit) ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'metric', label: 'المؤشر' },
        { key: 'current', label: 'الفترة الحالية', type: 'text' },
        { key: 'previous', label: 'الفترة السابقة', type: 'text' },
        { key: 'change', label: 'الفرق', type: 'text' },
        { key: 'changePercent', label: 'نسبة التغير', type: 'percent' },
      ],
      rows,
      notes: [`الفترة السابقة: ${previousRangeValue.from} إلى ${previousRangeValue.to}.`],
    };
  }
  };
}
