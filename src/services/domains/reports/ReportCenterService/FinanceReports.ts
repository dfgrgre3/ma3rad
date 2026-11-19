import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, fmtMoney, classifyExpense, shiftDate, previousRange } from './helpers';
import { FinancialStatementsService } from '../FinancialStatementsService';
import { InventoryCostingService } from '../../inventory/InventoryCostingService';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function FinanceReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class FinanceReports extends Base {
  public async branchPerformance({ from, to }: ReportParams): Promise<ReportResult> {
    const previous = previousRange(from, to);
    const branches = this.branchAccess.getSelectableBranches(this.actor());
    const rows = await Promise.all(branches.map(async (branch) => {
      const sales = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales,
          COALESCE(SUM(si.gross_profit), 0) / 100.0 AS profit, COUNT(DISTINCT si.id) AS invoices
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [from, to, branch.id, branch.id]))[0] || {};
      const previousSales = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [previous.from, previous.to, branch.id, branch.id]))[0]?.sales || 0;
      const returns = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS returns,
          COALESCE(SUM((
            SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id
          )), 0) / 100.0 AS returnedCost
        FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [from, to, branch.id, branch.id]))[0] || {};
      const expenses = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(amount), 0) / 100.0 AS total FROM expenses
        WHERE date >= ? AND date <= ? AND branch_id = ?
      `, [from, to, branch.id]))[0]?.total || 0;
      const collections = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(amount), 0) / 100.0 AS total FROM customer_payments
        WHERE date >= ? AND date <= ? AND branch_id = ?
      `, [from, to, branch.id]))[0]?.total || 0;
      const stock = InventoryCostingService.costingMethod(this.db) === 'FIFO'
        ? (await this.db.queryAsync<any>(`
            SELECT COALESCE(SUM(icl.quantity_remaining * icl.unit_cost), 0) / 100.0 AS value
            FROM inventory_cost_layers icl
            JOIN warehouses w ON w.id = icl.warehouse_id
            WHERE icl.quantity_remaining > 0.009 AND w.branch_id = ?
          `, [branch.id]))[0] || {}
        : (await this.db.queryAsync<any>(`
            SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) / 100.0 AS value
            FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
            JOIN warehouses w ON w.id = ws.warehouse_id
            WHERE w.branch_id = ?
          `, [branch.id]))[0] || {};
      const salesValue = round2(num(sales.sales));
      const returnsValue = round2(num(returns.returns));
      const netSales = round2(salesValue - returnsValue);
      const adjustedProfit = round2(num(sales.profit) - returnsValue + num(returns.returnedCost));
      return {
        branch: branch.name,
        sales: salesValue,
        returns: returnsValue,
        netSales,
        invoices: num(sales.invoices),
        averageInvoice: num(sales.invoices) ? round2(salesValue / num(sales.invoices)) : 0,
        profit: adjustedProfit,
        margin: netSales ? round2((adjustedProfit / netSales) * 100) : 0,
        expenses: round2(num(expenses)),
        collections: round2(num(collections)),
        stockValue: round2(num(stock.value)),
        growth: num(previousSales) ? round2(((salesValue - num(previousSales)) / Math.abs(num(previousSales))) * 100) : 0,
      };
    }));
    const totalSales = round2(rows.reduce((total, row) => total + row.netSales, 0));
    const result = rows.map((row) => ({ ...row, share: totalSales ? round2((row.netSales / totalSales) * 100) : 0 }))
      .sort((a, b) => b.netSales - a.netSales);
    return {
      kpis: [
        { label: 'أفضل فرع', value: result[0]?.branch || '—', hint: fmtMoney(result[0]?.netSales), tone: 'success' },
        { label: 'أضعف فرع', value: result[result.length - 1]?.branch || '—', hint: fmtMoney(result[result.length - 1]?.netSales), tone: 'danger' },
        { label: 'إجمالي صافي المبيعات', value: totalSales, tone: 'info' },
        { label: 'إجمالي المخزون', value: round2(result.reduce((total, row) => total + row.stockValue, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'branch', label: 'الفرع' },
        { key: 'sales', label: 'المبيعات', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'netSales', label: 'صافي المبيعات', type: 'currency' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'averageInvoice', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'expenses', label: 'المصروفات', type: 'currency' },
        { key: 'collections', label: 'التحصيل', type: 'currency' },
        { key: 'stockValue', label: 'المخزون', type: 'currency' },
        { key: 'growth', label: 'النمو', type: 'percent' },
        { key: 'share', label: 'النصيب', type: 'percent' },
      ],
      rows: result,
      notes: [`مقارنة النمو مع الفترة ${previous.from} → ${previous.to}.`],
    };
  }
  public async financialPosition({ to }: ReportParams): Promise<ReportResult> {
    const balance = await new FinancialStatementsService().getBalanceSheet(to);
    const rows: Array<Record<string, any>> = [
      ...balance.assets.map((row) => ({ section: 'الأصول', label: row.label, amount: row.amount })),
      ...balance.liabilities.map((row) => ({ section: 'الالتزامات', label: row.label, amount: row.amount })),
      ...balance.equity.map((row) => ({ section: 'حقوق الملكية', label: row.label, amount: row.amount })),
    ];
    return {
      kpis: [
        { label: 'إجمالي الأصول', value: balance.totals.assets, tone: 'info' },
        { label: 'إجمالي الالتزامات', value: balance.totals.liabilities, tone: 'warning' },
        { label: 'حقوق الملكية', value: balance.totals.equity, tone: 'success' },
        { label: 'فرق التوازن', value: balance.totals.difference, tone: Math.abs(balance.totals.difference) < 0.01 ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'section', label: 'القسم' },
        { key: 'label', label: 'البند' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: [`المركز المالي كما في ${to}. للربح خلال فترة استخدم تحليل الربحية أو الأرباح والخسائر.`],
    };
  }
  public async cashMovement({ from, to, registerId }: ReportParams): Promise<ReportResult> {
    const sales = this.salesScope();
    const purchases = this.purchaseScope();
    const registerScope = registerId
      ? { clause: 'cp.register_id = ?', params: [registerId] }
      : this.allBranchesTableScope('cr.branch_id', '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)');
    const registerListScope = registerId
      ? { clause: 'id = ?', params: [registerId] }
      : this.allBranchesTableScope('branch_id');
    const paymentRows = await this.db.queryAsync<any>(`
      SELECT date, cp.created_at AS createdAt, 'وارد' AS direction, 'سند قبض' AS source, receipt_number AS document,
        c.name AS party, amount, cp.register_id AS registerId
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN cash_registers cr ON cr.id = cp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}
      UNION ALL
      SELECT date, sp.created_at, 'منصرف', 'سند صرف', receipt_number, s.name, amount / 100.0, sp.register_id
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN cash_registers cr ON cr.id = sp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}
      UNION ALL
      SELECT date, ex.created_at, 'منصرف', 'مصروف', COALESCE(recipient, description), description, amount / 100.0, ex.register_id
      FROM expenses ex
      LEFT JOIN cash_registers cr ON cr.id = ex.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}
    `, [
      from, to, ...registerScope.params,
      from, to, ...registerScope.params,
      from, to, ...registerScope.params,
    ]);
    const invoiceRows = await this.db.queryAsync<any>(`
      SELECT date, si.created_at AS createdAt, 'وارد' AS direction, 'تحصيل فاتورة' AS source,
        invoice_number AS document, c.name AS party, paid_amount / 100.0 AS amount, NULL AS registerId
      FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id
      WHERE date >= ? AND date <= ? AND paid_amount > 0 AND invoice_status != 'VOID' AND ${sales.clause}
      UNION ALL
      SELECT date, pi.created_at, 'منصرف', 'سداد فاتورة شراء', invoice_number, s.name, paid_amount / 100.0, NULL
      FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id
      WHERE date >= ? AND date <= ? AND paid_amount > 1 AND ${purchases.clause}
    `, [from, to, ...sales.params, from, to, ...purchases.params]);
    const rows = [...paymentRows, ...(registerId ? [] : invoiceRows)]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let running = 0;
    const result = rows.map((row) => {
      const amount = round2(num(row.amount));
      running = round2(running + (row.direction === 'وارد' ? amount : -amount));
      return { ...row, amount, balance: running };
    });
    const inflow = round2(result.filter((row) => row.direction === 'وارد').reduce((total, row) => total + row.amount, 0));
    const outflow = round2(result.filter((row) => row.direction === 'منصرف').reduce((total, row) => total + row.amount, 0));
    const registerList = await this.db.queryAsync<any>(`SELECT id, name, current_balance / 100.0 AS balance FROM cash_registers WHERE ${registerListScope.clause} ORDER BY name`, registerListScope.params);
    return {
      kpis: [
        { label: 'إجمالي الوارد', value: inflow, tone: 'success' },
        { label: 'إجمالي المنصرف', value: outflow, tone: 'danger' },
        { label: 'صافي الحركة', value: round2(inflow - outflow), tone: inflow >= outflow ? 'success' : 'danger' },
        { label: 'الرصيد الحالي للخزائن', value: round2(registerList.reduce((total, row) => total + num(row.balance), 0)), tone: 'info' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'direction', label: 'الاتجاه', type: 'badge' },
        { key: 'source', label: 'نوع الحركة' },
        { key: 'document', label: 'المستند' },
        { key: 'party', label: 'الطرف' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'balance', label: 'الرصيد الجاري', type: 'currency' },
      ],
      rows: result,
      notes: registerList.length ? undefined : ['لا توجد خزائن مسجلة في النطاق الحالي.'],
    };
  }
  public async cashFlowForecast({ to }: ReportParams): Promise<ReportResult> {
    const start = shiftDate(to, 1);
    const salesScope = this.salesScope();
    const purchaseScope = this.purchaseScope();
    const expenseScope = this.tableScope('e.branch_id');
    const payrollScope = this.tableScope('e.branch_id');
    const installmentScope = this.tableScope('ip.branch_id');
    const cashScope = this.allBranchesTableScope('cr.branch_id');
    const openingBalance = (await this.db.queryAsync<any>(`
      SELECT COALESCE(SUM(cr.current_balance) / 100.0, 0) AS total FROM cash_registers cr
      WHERE ${cashScope.clause}
    `, cashScope.params))[0]?.total || 0;
    const weeklyPayroll = (await this.db.queryAsync<any>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN e.salary_type = 'MONTHLY' THEN e.base_salary / 400.0
          WHEN e.salary_type = 'DAILY' THEN (e.base_salary * 26) / 400.0
          ELSE e.base_salary / 400.0
        END), 0) AS total
      FROM employees e
      WHERE e.is_active = 1 AND e.status = 'ACTIVE' AND ${payrollScope.clause}
    `, payrollScope.params))[0]?.total || 0;
    const weeks: Array<Record<string, any>> = [];
    for (let week = 0; week < 8; week += 1) {
      const weekStart = shiftDate(start, week * 7);
      const weekEnd = shiftDate(weekStart, 6);
      const invoices = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(si.total_amount - si.paid_amount), 0) / 100.0 AS total FROM sales_invoices si
        WHERE si.remaining_amount > 1 AND si.due_date >= ? AND si.due_date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}
      `, [weekStart, weekEnd, ...salesScope.params]))[0]?.total || 0;
      const purchases = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(pi.remaining_amount), 0) / 100.0 AS total FROM purchase_invoices pi
        WHERE pi.remaining_amount > 1 AND pi.due_date >= ? AND pi.due_date <= ? AND ${purchaseScope.clause}
      `, [weekStart, weekEnd, ...purchaseScope.params]))[0]?.total || 0;
      const chequesIn = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(amount), 0) / 100.0 AS total FROM cheques
        WHERE type = 'RECEIVED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED') AND due_date >= ? AND due_date <= ?
      `, [weekStart, weekEnd]))[0]?.total || 0;
      const chequesOut = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(amount), 0) / 100.0 AS total FROM cheques
        WHERE type = 'ISSUED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED') AND due_date >= ? AND due_date <= ?
      `, [weekStart, weekEnd]))[0]?.total || 0;
      const installments = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(i.remaining_amount), 0) AS total FROM installments i
        JOIN installment_plans ip ON ip.id = i.plan_id
        WHERE i.remaining_amount > 0.01 AND i.due_date >= ? AND i.due_date <= ? AND ${installmentScope.clause}
      `, [weekStart, weekEnd, ...installmentScope.params]))[0]?.total || 0;
      const expenses = (await this.db.queryAsync<any>(`
        SELECT COALESCE(SUM(e.amount), 0) / 100.0 / 30.0 * 7 AS total FROM expenses e
        WHERE e.date >= ? AND e.date <= ? AND ${expenseScope.clause}
      `, [shiftDate(to, -30), to, ...expenseScope.params]))[0]?.total || 0;
      const inflow = round2(num(invoices) + num(chequesIn) + num(installments));
      const outflow = round2(num(purchases) + num(chequesOut) + num(weeklyPayroll) + num(expenses));
      weeks.push({
        week: `أسبوع ${week + 1}`,
        from: weekStart,
        to: weekEnd,
        openingBalance: round2(num(openingBalance)),
        invoices: round2(num(invoices)),
        installments: round2(num(installments)),
        chequesIn: round2(num(chequesIn)),
        inflow,
        purchases: round2(num(purchases)),
        chequesOut: round2(num(chequesOut)),
        payroll: round2(num(weeklyPayroll)),
        expenses: round2(num(expenses)),
        outflow,
        net: round2(inflow - outflow),
      });
    }
    let running = round2(num(openingBalance));
    const result: Array<Record<string, any>> = weeks.map((row) => {
      const projectedBalance = round2(running + row.net);
      running = projectedBalance;
      return { ...row, projectedBalance, cumulative: running };
    });
    const lowest = result.reduce<Record<string, any>>((min, row) => (row.cumulative < min.cumulative ? row : min), result[0]);
    return {
      kpis: [
        { label: 'الرصيد النقدي الحالي', value: round2(num(openingBalance)), tone: 'info' },
        { label: 'إجمالي الوارد المتوقع', value: round2(result.reduce((total, row) => total + row.inflow, 0)), tone: 'success' },
        { label: 'إجمالي المدفوعات المستحقة', value: round2(result.reduce((total, row) => total + row.outflow, 0)), tone: 'danger' },
        { label: 'الرصيد المتوقع في آخر أسبوع', value: lowest?.cumulative || 0, hint: lowest?.week, tone: (lowest?.cumulative || 0) < 0 ? 'danger' : 'success' },
      ],
      columns: [
        { key: 'week', label: 'الأسبوع' },
        { key: 'from', label: 'من', type: 'date' },
        { key: 'to', label: 'إلى', type: 'date' },
        { key: 'openingBalance', label: 'الرصيد الفعلي', type: 'currency' },
        { key: 'inflow', label: 'التحصيلات المتوقعة', type: 'currency' },
        { key: 'outflow', label: 'المدفوعات المستحقة', type: 'currency' },
        { key: 'net', label: 'صافي الأسبوع', type: 'currency' },
        { key: 'projectedBalance', label: 'الرصيد المتوقع', type: 'currency' },
      ],
      rows: result,
      notes: ['يبدأ التقرير من الرصيد النقدي الحالي الفعلي، ثم يضيف التحصيلات المتوقعة وخصم الالتزامات المستحقة حسب تواريخ الاستحقاق.'],
    };
  }
  public async breakEven({ from, to }: ReportParams): Promise<ReportResult> {
    const metrics = await this.periodMetrics(from, to);
    const scope = this.tableScope('branch_id');
    const expenseRows = await this.db.queryAsync<any>(`
      SELECT amount / 100.0 AS amount, category, description FROM expenses
      WHERE date >= ? AND date <= ? AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const totals = { fixed: 0, variable: 0, semi: 0 };
    for (const row of expenseRows) {
      const amount = num(row.amount);
      const bucket = classifyExpense(row.category, row.description);
      totals[bucket] += amount;
    }
    const revenue = round2(num(metrics.sales));
    const profit = round2(num(metrics.profit));
    const variableCost = Math.max(0, round2(revenue - profit));
    const contribution = round2(revenue - variableCost);
    const contributionMargin = revenue ? round2((contribution / revenue) * 100) : 0;
    const fixed = round2(totals.fixed + totals.semi * 0.5);
    const breakEvenRevenue = contributionMargin > 0 ? round2(fixed / (contributionMargin / 100)) : 0;
    const marginOfSafety = revenue ? round2(((revenue - breakEvenRevenue) / revenue) * 100) : 0;
    const rows = [
      { metric: 'المبيعات', value: revenue, type: 'currency' },
      { metric: 'التكلفة المتغيرة', value: variableCost, type: 'currency' },
      { metric: 'هامش المساهمة', value: contribution, type: 'currency' },
      { metric: 'نسبة هامش المساهمة', value: contributionMargin, type: 'percent' },
      { metric: 'المصروفات الثابتة', value: fixed, type: 'currency' },
      { metric: 'المصروفات شبه المتغيرة', value: round2(totals.semi), type: 'currency' },
      { metric: 'مبيعات نقطة التعادل', value: breakEvenRevenue, type: 'currency' },
      { metric: 'هامش الأمان', value: marginOfSafety, type: 'percent' },
      { metric: 'صافي الربح', value: profit, type: 'currency' },
    ];
    return {
      kpis: [
        { label: 'نقطة التعادل', value: breakEvenRevenue, hint: 'مبيعات مطلوبة لتغطية المصروفات الثابتة', tone: 'warning' },
        { label: 'هامش المساهمة', value: contributionMargin, tone: 'info' },
        { label: 'المصروفات الثابتة', value: fixed, tone: 'danger' },
        { label: 'هامش الأمان', value: marginOfSafety, tone: marginOfSafety >= 0 ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'metric', label: 'البند' },
        { key: 'value', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['يُصنَّف كل مصروف إلى ثابت أو متغير أو شبه متغير، فلا تُعامل جميع المصروفات كتكاليف ثابتة.'],
    };
  }
  };
}
