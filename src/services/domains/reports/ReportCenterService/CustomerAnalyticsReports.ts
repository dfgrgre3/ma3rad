import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, sum, daysBetween, shiftDate } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function CustomerAnalyticsReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class CustomerAnalyticsReports extends Base {
  public async customerChurn({ to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const rows = await this.db.queryAsync<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COUNT(si.id) AS invoices,
        MIN(si.date) AS firstPurchase,
        MAX(si.date) AS lastPurchase,
        COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS totalSpend
      FROM customers c
      JOIN sales_invoices si ON si.customer_id = c.id AND si.invoice_status != 'VOID'
      WHERE si.date <= ? AND ${scope.clause}
      GROUP BY c.id
      HAVING lastPurchase IS NOT NULL
      ORDER BY lastPurchase ASC
    `, [to, ...scope.params]);
    const result = rows.map((row) => {
      const invoices = num(row.invoices);
      const daysSinceLast = row.lastPurchase ? daysBetween(row.lastPurchase, to) : null;
      const span = row.firstPurchase && row.lastPurchase ? Math.max(1, daysBetween(row.firstPurchase, row.lastPurchase)) : 0;
      const interval = invoices > 1 && span > 0 ? round2(span / (invoices - 1)) : null;
      const averageSpend = invoices ? round2(num(row.totalSpend) / invoices) : 0;
      const expectedNext = interval !== null && row.lastPurchase ? shiftDate(row.lastPurchase, Math.round(interval)) : '';
      const atRisk = interval !== null && daysSinceLast !== null && daysSinceLast > interval;
      return {
        customer: row.customer,
        phone: row.phone,
        invoices,
        lastPurchase: row.lastPurchase,
        daysSinceLast,
        interval,
        expectedNext,
        averageSpend,
        atRiskValue: atRisk ? averageSpend : 0,
        status: atRisk ? 'معرض للفقد' : 'منتظم',
      };
    }).sort((a, b) => b.atRiskValue - a.atRiskValue);
    return {
      kpis: [
        { label: 'عملاء معرضون للفقد', value: result.filter((row) => row.status === 'معرض للفقد').length, tone: 'danger' },
        { label: 'القيمة المعرضة', value: round2(result.reduce((total, row) => total + row.atRiskValue, 0)), tone: 'warning' },
        { label: 'إجمالي العملاء', value: result.length, tone: 'info' },
        { label: 'متوسط أيام الغياب', value: result.length ? round2(result.reduce((total, row) => total + num(row.daysSinceLast), 0) / result.length) : 0, tone: 'neutral' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'invoices', label: 'عدد الفواتير', type: 'number' },
        { key: 'lastPurchase', label: 'آخر شراء', type: 'date' },
        { key: 'daysSinceLast', label: 'أيام منذ آخر شراء', type: 'number' },
        { key: 'interval', label: 'إيقاع الشراء (يوم)', type: 'number' },
        { key: 'expectedNext', label: 'الشراء المتوقع', type: 'date' },
        { key: 'averageSpend', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'atRiskValue', label: 'القيمة المعرضة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async paymentBehavior({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('cp.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.payment_terms_days, 0) AS terms,
        COUNT(DISTINCT cp.id) AS payments,
        COALESCE(AVG(CASE WHEN a.sales_invoice_id IS NOT NULL
          THEN julianday(cp.date) - julianday(si.date) END), 0) AS avgDays,
        COALESCE(MAX(CASE WHEN a.sales_invoice_id IS NOT NULL
          THEN julianday(cp.date) - julianday(si.date) END), 0) AS maxDays,
        COALESCE(SUM(cp.amount), 0) AS totalPaid
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN customer_payment_allocations a ON a.payment_id = cp.id
      LEFT JOIN sales_invoices si ON si.id = a.sales_invoice_id
      WHERE cp.date >= ? AND cp.date <= ? AND ${scope.clause}
      GROUP BY c.id
      ORDER BY avgDays DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => {
      const terms = num(row.terms);
      const avgDays = round2(num(row.avgDays));
      const maxDays = round2(num(row.maxDays));
      const adherence = terms > 0 ? round2(Math.min(100, (terms / Math.max(1, avgDays)) * 100)) : 0;
      return {
        customer: row.customer,
        phone: row.phone,
        terms,
        payments: num(row.payments),
        avgDays,
        maxDays,
        lateDays: round2(Math.max(0, avgDays - terms)),
        adherence,
        totalPaid: round2(num(row.totalPaid)),
        status: avgDays <= terms ? 'ملتزم' : 'متأخر',
      };
    });
    return {
      kpis: [
        { label: 'إجمالي المدفوعات', value: round2(result.reduce((total, row) => total + row.totalPaid, 0)), tone: 'success' },
        { label: 'متوسط أيام السداد', value: result.length ? round2(result.reduce((total, row) => total + row.avgDays, 0) / result.length) : 0, tone: 'info' },
        { label: 'عملاء متأخرون', value: result.filter((row) => row.status === 'متأخر').length, tone: 'danger' },
        { label: 'أطول تأخير', value: round2(Math.max(0, ...result.map((row) => row.maxDays))), tone: 'warning' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'terms', label: 'المدة المتفق عليها', type: 'number' },
        { key: 'payments', label: 'عدد الدفعات', type: 'number' },
        { key: 'avgDays', label: 'متوسط أيام السداد', type: 'number' },
        { key: 'maxDays', label: 'أطول تأخير', type: 'number' },
        { key: 'lateDays', label: 'أيام التأخير', type: 'number' },
        { key: 'adherence', label: 'نسبة الالتزام', type: 'percent' },
        { key: 'totalPaid', label: 'إجمالي المدفوع', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
      notes: ['يعتمد متوسط أيام السداد على تخصيص الدفعات للفواتير عند تسجيلها.'],
    };
  }
  public async basketAnalysis({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const rows = await this.db.queryAsync<any>(`
      SELECT a.product_id AS productA, pa.name AS productAName,
        b.product_id AS productB, pb.name AS productBName,
        COUNT(*) AS invoices,
        SUM(a.total_price) / 100.0 AS valueA, SUM(b.total_price) / 100.0 AS valueB
      FROM sales_invoice_items a
      JOIN sales_invoice_items b ON b.invoice_id = a.invoice_id AND a.product_id < b.product_id
      JOIN sales_invoices si ON si.id = a.invoice_id
      JOIN products pa ON pa.id = a.product_id
      JOIN products pb ON pb.id = b.product_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY a.product_id, b.product_id
      ORDER BY invoices DESC
      LIMIT 200
    `, [from, to, ...scope.params]);
    const invoiceCount = (await this.db.queryAsync<any>(`
      SELECT COUNT(DISTINCT si.id) AS count FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params]))[0]?.count || 0;
    const result = rows.map((row) => ({
      productA: row.productAName,
      productB: row.productBName,
      invoices: num(row.invoices),
      support: invoiceCount ? round2((num(row.invoices) / invoiceCount) * 100) : 0,
      combinedValue: round2(num(row.valueA) + num(row.valueB)),
    }));
    return {
      kpis: [
        { label: 'أزواج منتجات', value: result.length, tone: 'info' },
        { label: 'أقوى اقتران', value: result[0] ? `${result[0].productA} + ${result[0].productB}` : '—', hint: `${result[0]?.invoices || 0} فاتورة`, tone: 'success' },
        { label: 'متوسط قيمة الزوج', value: result.length ? round2(result.reduce((total, row) => total + row.combinedValue, 0) / result.length) : 0, tone: 'neutral' },
      ],
      columns: [
        { key: 'productA', label: 'الصنف الأول' },
        { key: 'productB', label: 'الصنف الثاني' },
        { key: 'invoices', label: 'عدد الفواتير معًا', type: 'number' },
        { key: 'support', label: 'نسبة التكرار', type: 'percent' },
        { key: 'combinedValue', label: 'القيمة المشتركة', type: 'currency' },
      ],
      rows: result,
      notes: ['استخدم هذه الأزواج في عروض «اشتري ده وخد ده» وترتيب الرفوف.'],
    };
  }
  // --------------------------------------------------------------------------
  // New Enhanced Reports: Cash Flow Detailed & Sales Rep Performance
  // --------------------------------------------------------------------------
  public async cashFlowDetailed(params: ReportParams): Promise<ReportResult> {
    const actor = this.actor();
    const key = `${this.cachePartition(actor)}:cashFlowDetailed:${params.from}:${params.to}:${params.registerId || 'all'}`;
    return await this.withCache(key, async () => {
    const sales = this.allBranchesScope();
    const customerPayment = this.allBranchesTableScope(
      'cp.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)',
    );
    const supplierPayment = this.allBranchesTableScope(
      'sp.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = sp.register_id)',
    );
    const expenses = this.allBranchesTableScope(
      'ex.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = ex.register_id)',
    );
    const registerFilter = params.registerId ? 'AND registerId = ?' : '';
    const rows = await this.db.queryAsync<any>(`
      SELECT * FROM (
        SELECT si.date AS transDate, 'IN' AS transType, COALESCE(sip.method, si.payment_type) AS category,
          COALESCE(sip.amount / 100.0, si.paid_amount / 100.0) AS amount, 'تحصيل فاتورة بيع ' || si.invoice_number AS description,
          cr.id AS registerId, cr.name AS registerName, u.full_name AS userName
        FROM sales_invoices si
        LEFT JOIN sales_invoice_payments sip ON sip.invoice_id = si.id
        LEFT JOIN cash_shifts cs ON cs.id = si.shift_id
        LEFT JOIN cash_registers cr ON cr.id = cs.register_id
        LEFT JOIN users u ON u.id = si.created_by
        WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
          AND si.paid_amount > 0
          AND (sip.id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM sales_invoice_payments sip0 WHERE sip0.invoice_id = si.id
          ))
          AND ${sales.clause}
        UNION ALL
        SELECT cp.date, 'IN', cp.payment_type, cp.amount,
          'سند قبض ' || cp.receipt_number, cr.id, cr.name, u.full_name
        FROM customer_payments cp
        LEFT JOIN cash_registers cr ON cr.id = cp.register_id
        LEFT JOIN users u ON u.id = cp.performed_by
        WHERE cp.date BETWEEN ? AND ? AND ${customerPayment.clause}
        UNION ALL
        SELECT sp.date, 'OUT', sp.payment_type, sp.amount / 100.0,
          'سند صرف ' || sp.receipt_number, cr.id, cr.name, u.full_name
        FROM supplier_payments sp
        LEFT JOIN cash_registers cr ON cr.id = sp.register_id
        LEFT JOIN users u ON u.id = sp.performed_by
        WHERE sp.date BETWEEN ? AND ? AND ${supplierPayment.clause}
        UNION ALL
        SELECT ex.date, 'OUT', ex.payment_type, ex.amount / 100.0,
          COALESCE(ex.description, ex.category), cr.id, cr.name, u.full_name
        FROM expenses ex
        LEFT JOIN cash_registers cr ON cr.id = ex.register_id
        LEFT JOIN users u ON u.id = ex.performed_by
        WHERE ex.date BETWEEN ? AND ? AND ${expenses.clause}
      ) movements
      WHERE 1 = 1 ${registerFilter}
      ORDER BY transDate DESC
    `, [
      params.from, params.to, ...sales.params,
      params.from, params.to, ...customerPayment.params,
      params.from, params.to, ...supplierPayment.params,
      params.from, params.to, ...expenses.params,
      ...(params.registerId ? [params.registerId] : []),
    ]);
      let totalIn = 0;
      let totalOut = 0;
      const formattedRows = rows.map((r) => {
        const amt = num(r.amount);
        const isIn = r.transType === 'IN';
        const absAmt = Math.abs(amt);
        if (isIn) {
          totalIn += absAmt;
        } else {
          totalOut += absAmt;
        }
    return {
          transDate: String(r.transDate || '').slice(0, 16).replace('T', ' '),
          registerName: r.registerName || 'غير محددة',
          category: r.category || (isIn ? 'مقبوضات' : 'مدفوعات'),
          description: r.description || (isIn ? 'تحصيل نقدي' : 'صرف نقدي'),
          inflow: isIn ? round2(absAmt) : 0,
          outflow: !isIn ? round2(absAmt) : 0,
          userName: r.userName || '—',
          status: isIn ? 'وارد' : 'منصرف',
        };
      });
      const netCash = round2(totalIn - totalOut);
      return {
        kpis: [
          { label: 'إجمالي المقبوضات (وارد)', value: round2(totalIn), tone: 'success' },
          { label: 'إجمالي المصروفات (منصرف)', value: round2(totalOut), tone: 'danger' },
          { label: 'صافي التدفق النقدي', value: netCash, tone: netCash >= 0 ? 'success' : 'danger' },
          { label: 'عدد العمليات النقدية', value: rows.length, tone: 'neutral' },
        ],
        columns: [
          { key: 'transDate', label: 'التاريخ والوقت', type: 'text' },
          { key: 'registerName', label: 'الخزينة' },
          { key: 'category', label: 'التصنيف' },
          { key: 'description', label: 'البيان / الوصف' },
          { key: 'inflow', label: 'وارد (+)', type: 'currency' },
          { key: 'outflow', label: 'منصرف (-)', type: 'currency' },
          { key: 'userName', label: 'المستخدم' },
          { key: 'status', label: 'الحركة', type: 'badge' },
        ],
        rows: formattedRows,
        notes: ['يعرض التقرير التحصيلات المسجلة على الفواتير والسندات والمصروفات؛ لا تشمل الأرقام حركات نقدية غير مسجلة في هذه المستندات.'],
    };
    });
  }
  public async salesRepPerformance(params: ReportParams): Promise<ReportResult> {
    const actor = this.actor();
    const key = `${this.cachePartition(actor)}:salesRepPerformance:${params.from}:${params.to}`;
    return await this.withCache(key, async () => {
      const scope = this.salesScope();
      const rows = await this.db.queryAsync<any>(`
        SELECT
          COALESCE(e.full_name, u.full_name, 'غير محدد') AS repName,
          (SELECT GROUP_CONCAT(bx.name, '، ') FROM (
             SELECT e.branch_id AS bid
             UNION
             SELECT a.branch_id FROM employee_branch_assignments a WHERE a.employee_id = e.id
           ) cov JOIN branches bx ON bx.id = cov.bid) AS repBranches,
          COUNT(si.id) AS invoiceCount,
          COALESCE(SUM(si.total_amount), 0) / 100.0 AS totalSales,
          COALESCE(SUM(si.paid_amount), 0) / 100.0 AS totalCollected,
          COALESCE(SUM(si.remaining_amount), 0) / 100.0 AS totalPending,
          COALESCE(SUM(si.gross_profit), 0) / 100.0 AS estimatedProfit
        FROM sales_invoices si
        LEFT JOIN orders o ON o.invoice_id = si.id
        LEFT JOIN employees e ON e.id = COALESCE(si.sales_rep_id, o.sales_rep_id)
        LEFT JOIN users u ON u.id = si.created_by
        WHERE si.date BETWEEN ? AND ?
          AND si.invoice_status != 'VOID'
          AND ${scope.clause}
        GROUP BY COALESCE(e.full_name, u.full_name, 'غير محدد')
        ORDER BY totalSales DESC
      `, [params.from, params.to, ...scope.params]);
      const totalSalesAll = sum(rows, 'totalSales');
      const totalCollectedAll = sum(rows, 'totalCollected');
      const totalProfitAll = sum(rows, 'estimatedProfit');
      const mapped = rows.map((r) => {
        const sales = num(r.totalSales);
        const col = num(r.totalCollected);
        const profit = num(r.estimatedProfit);
        const colRate = sales > 0 ? round2((col / sales) * 100) : 0;
        const margin = sales > 0 ? round2((profit / sales) * 100) : 0;
        return {
          repName: r.repName,
          repBranches: r.repBranches || '—',
          invoiceCount: num(r.invoiceCount),
          totalSales: round2(sales),
          totalCollected: round2(col),
          totalPending: round2(num(r.totalPending)),
          collectionRate: colRate,
          estimatedProfit: round2(profit),
          profitMargin: margin,
          performanceBadge: colRate >= 80 ? 'ممتاز' : colRate >= 50 ? 'متوسط' : 'يحتاج متابعة',
        };
      });
      return {
        kpis: [
          { label: 'إجمالي مبيعات الفريق', value: round2(totalSalesAll), tone: 'info' },
          { label: 'إجمالي التحصيلات', value: round2(totalCollectedAll), tone: 'success' },
          { label: 'إجمالي الأرباح المقدرة', value: round2(totalProfitAll), tone: 'success' },
          { label: 'مندوب المبيعات', value: mapped[0]?.totalSales || 0, hint: mapped[0]?.repName || '—', tone: 'neutral' },
        ],
        columns: [
          { key: 'repName', label: 'مندوب المبيعات' },
          { key: 'repBranches', label: 'الفروع' },
          { key: 'invoiceCount', label: 'عدد الفواتير', type: 'number' },
          { key: 'totalSales', label: 'إجمالي المبيعات', type: 'currency' },
          { key: 'totalCollected', label: 'المحصل', type: 'currency' },
          { key: 'totalPending', label: 'المتبقي / آجل', type: 'currency' },
          { key: 'collectionRate', label: 'نسبة التحصيل', type: 'percent' },
          { key: 'estimatedProfit', label: 'الأرباح التقديرية', type: 'currency' },
          { key: 'profitMargin', label: 'هامش الربح', type: 'percent' },
          { key: 'performanceBadge', label: 'التقييم', type: 'badge' },
        ],
        rows: mapped,
        notes: ['يُجمّع التقرير حسب مندوب المبيعات عند توفره، مع احتياطية إلى منشئ الفاتورة عند غياب المندوب الفعلي.'],
      };
    });
  }
  public async demandForecast({ to }: ReportParams): Promise<ReportResult> {
    const salesScope = this.salesScope();
    const stockScope = this.tableScope('w.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product,
        COALESCE(SUM(CASE WHEN si.id IS NOT NULL THEN sii.quantity_m2 ELSE 0 END), 0) AS sold12m,
        COALESCE(SUM(CASE WHEN si.date >= ? THEN sii.quantity_m2 ELSE 0 END), 0) AS soldLast90,
        COALESCE(SUM(CASE WHEN si.date >= ? THEN sii.quantity_m2 ELSE 0 END), 0) AS soldPrevYearMonth,
        COALESCE((SELECT SUM(ws.quantity_m2) FROM warehouse_stock ws
          JOIN warehouses w ON w.id = ws.warehouse_id
          WHERE ws.product_id = p.id AND ${stockScope.clause}), 0) AS stock,
        COALESCE(p.min_stock_level, 0) AS minLevel
      FROM products p
      LEFT JOIN sales_invoice_items sii ON sii.product_id = p.id
      LEFT JOIN sales_invoices si ON si.id = sii.invoice_id AND si.invoice_status != 'VOID' AND ${salesScope.clause}
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY sold12m DESC
    `, [shiftDate(to, -90), shiftDate(to, -365), ...stockScope.params, ...salesScope.params]);
    const result = rows.map((row) => {
      const monthlyAverage = round2(num(row.sold12m) / 12);
      const last90 = num(row.soldLast90) / 3;
      const seasonal = last90 > 0 ? round2(Math.max(0, last90)) : monthlyAverage;
      const forecast = round2((monthlyAverage + seasonal) / 2);
      const daily = forecast / 30;
      const stock = num(row.stock);
      const coverage = daily > 0 ? Math.round(stock / daily) : null;
      const suggested = round2(Math.max(0, forecast * 1.5 - stock));
      return {
        sku: row.sku,
        product: row.product,
        sold12m: round2(num(row.sold12m)),
        monthlyAverage,
        forecast,
        stock: round2(stock),
        coverage,
        suggested,
        status: coverage !== null && coverage <= 15 ? 'نفاد قريب' : coverage !== null && coverage <= 30 ? 'يحتاج متابعة' : 'آمن',
      };
    }).sort((a, b) => b.forecast - a.forecast);
    return {
      kpis: [
        { label: 'أصناف نفاد قريب', value: result.filter((row) => row.status === 'نفاد قريب').length, tone: 'danger' },
        { label: 'أصناف تحتاج متابعة', value: result.filter((row) => row.status === 'يحتاج متابعة').length, tone: 'warning' },
        { label: 'إجمالي الكمية المقترحة', value: round2(result.reduce((total, row) => total + row.suggested, 0)), tone: 'info' },
        { label: 'أعلى توقع شهري', value: result[0]?.forecast || 0, hint: result[0]?.product, tone: 'neutral' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'sold12m', label: 'مبيعات 12 شهر', type: 'qty' },
        { key: 'monthlyAverage', label: 'المتوسط الشهري', type: 'qty' },
        { key: 'forecast', label: 'توقع الشهر القادم', type: 'qty' },
        { key: 'stock', label: 'المخزون', type: 'qty' },
        { key: 'coverage', label: 'أيام التغطية', type: 'number' },
        { key: 'suggested', label: 'الكمية المقترحة', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
      notes: ['التوقع = متوسط المبيعات الشهرية للسنة الماضية مع موسمية آخر 3 أشهر. الكمية المقترحة تغطي 1.5 شهر بعد الرصيد الحالي.'],
    };
  }
  };
}
