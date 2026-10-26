import { DatabaseManager } from '../database/db';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

function calendarDayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export interface StatementLine {
  label: string;
  amount: number;
  indent?: boolean;
  emphasis?: boolean;
}

export interface BalanceSheet {
  asOf: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totals: { assets: number; liabilities: number; equity: number; difference: number };
}

export interface CashFlowMonth {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface AgingBucket {
  label: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export interface AgingRow {
  id: string;
  name: string;
  phone?: string | null;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export interface LedgerLine {
  date: string;
  entryNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ReconciliationCheck {
  key: string;
  label: string;
  ledger: number;
  source: number;
  difference: number;
  status: 'MATCH' | 'DIFFERENCE';
  detail: string;
}

export class FinancialStatementsService {
  private db = DatabaseManager.getInstance();

  private requireView(permission: string): void {
    PermissionService.require(AuthService.requireAuth(), permission);
  }

  public getReconciliation(): ReconciliationCheck[] {
    this.requireView('finance.view');
    const accountBalance = (code: string, normal: 'DEBIT' | 'CREDIT') => {
      const row = this.db.query<{ balance: number }>(`
        SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
        FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND a.code = ?
      `, [code])[0];
      const signed = Number(row?.balance || 0);
      return round2(normal === 'DEBIT' ? signed : -signed);
    };
    const checks: ReconciliationCheck[] = [];
    const add = (key: string, label: string, ledger: number, source: number, detail: string) => {
      const difference = round2(ledger - source);
      checks.push({ key, label, ledger: round2(ledger), source: round2(source), difference,
        status: Math.abs(difference) < 0.01 ? 'MATCH' : 'DIFFERENCE', detail });
    };

    const integrity = this.db.query<{ entries: number; unbalanced: number; debit: number; credit: number }>(`
      WITH entry_totals AS (
        SELECT e.id, e.total_debit, e.total_credit,
               COALESCE(SUM(l.debit), 0) AS line_debit,
               COALESCE(SUM(l.credit), 0) AS line_credit
        FROM journal_entries e LEFT JOIN journal_entry_lines l ON l.entry_id = e.id
        WHERE e.is_posted = 1 GROUP BY e.id
      )
      SELECT COUNT(*) AS entries,
             COALESCE(SUM(CASE WHEN ABS(ROUND(line_debit - line_credit, 2)) > 0 OR
               ABS(ROUND(total_debit - line_debit, 2)) > 0 OR ABS(ROUND(total_credit - line_credit, 2)) > 0
               THEN 1 ELSE 0 END), 0) AS unbalanced,
             COALESCE(SUM(line_debit), 0) AS debit, COALESCE(SUM(line_credit), 0) AS credit
      FROM entry_totals
    `)[0];
    const journalDifference = round2(Number(integrity?.debit || 0) - Number(integrity?.credit || 0));
    const unbalancedEntries = Number(integrity?.unbalanced || 0);
    checks.push({ key: 'journal', label: 'توازن القيود المرحلة', ledger: round2(integrity?.debit || 0),
      source: round2(integrity?.credit || 0), difference: journalDifference,
      status: unbalancedEntries === 0 ? 'MATCH' : 'DIFFERENCE',
      detail: `${unbalancedEntries} قيد غير متوازن من ${Number(integrity?.entries || 0)} قيد مرحل` });

    const cached = this.db.query<{ mismatches: number; maxDifference: number }>(`
      SELECT COALESCE(SUM(CASE WHEN ABS(ROUND(a.balance - COALESCE(x.balance, 0), 2)) > 0 THEN 1 ELSE 0 END), 0) AS mismatches,
             COALESCE(MAX(ABS(ROUND(a.balance - COALESCE(x.balance, 0), 2))), 0) AS maxDifference
      FROM chart_of_accounts a
      LEFT JOIN (
        SELECT l.account_id, SUM(l.debit - l.credit) AS balance
        FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE e.is_posted = 1 GROUP BY l.account_id
      ) x ON x.account_id = a.id
    `)[0];
    add('cached', 'أرصدة دليل الحسابات المخزنة', 0, Number(cached?.maxDifference || 0),
      `${Number(cached?.mismatches || 0)} حساب يحتاج إلى تحديث رصيده المخزن`);

    const customers = this.db.query<{ balance: number }>('SELECT COALESCE(SUM(current_balance), 0) AS balance FROM customers')[0]?.balance || 0;
    add('customers', 'ذمم العملاء مقابل الأستاذ العام', accountBalance('1103', 'DEBIT'), Number(customers),
      'مقارنة حساب العملاء 1103 بإجمالي الأرصدة الحالية في سجل العملاء');

    const suppliers = this.db.query<{ balance: number }>('SELECT COALESCE(SUM(current_balance), 0) AS balance FROM suppliers')[0]?.balance || 0;
    add('suppliers', 'ذمم الموردين مقابل الأستاذ العام', accountBalance('2101', 'CREDIT'), Number(suppliers),
      'مقارنة حساب الموردين 2101 بإجمالي الأرصدة الحالية في سجل الموردين');

    const inventory = this.db.query<{ value: number; estimatedLayers: number }>(`
      SELECT COALESCE(SUM(quantity_remaining * unit_cost), 0) AS value,
             COALESCE(SUM(CASE WHEN is_estimated = 1 AND quantity_remaining > 0.009 THEN 1 ELSE 0 END), 0) AS estimatedLayers
      FROM inventory_cost_layers WHERE quantity_remaining > 0.009
    `)[0];
    const costingMethod = this.db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='costingMethod'`)[0]?.value || 'AVERAGE_COST';
    const inventoryValue = Number(inventory?.value || 0);
    const ledgerValue = accountBalance('1104', 'DEBIT');

    if (costingMethod === 'FIFO') {
      add('inventory', 'قيمة المخزون حسب طبقات التكلفة (FIFO)', ledgerValue, inventoryValue,
        `${Number(inventory?.estimatedLayers || 0)} طبقة تكلفة متبقية تقديرية؛ قد تفسر جزءًا من الفرق`);
    } else {
      // For AVERAGE_COST, compare ledger with calculated value from stock * cost_price
      const stockValue = this.db.query<{ value: number }>(`
        SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0) AS value
        FROM warehouse_stock ws
        JOIN products p ON p.id = ws.product_id
      `)[0]?.value || 0;
      add('inventory', 'قيمة المخزون حسب التكلفة المتوسطة (Stock × Cost Price)', ledgerValue, Number(stockValue),
        'الفرق بسبب طريقة التكلفة المتوسطة المرجحة');
    }

    return checks;
  }

  // ── Balance sheet ────────────────────────────────────────────────────────
  public getBalanceSheet(asOf?: string): BalanceSheet {
    this.requireView('finance.view');
    const date = asOf || localDateString();
    if (!isValidDate(date)) throw new Error('Invalid balance sheet date.');
    const accounts = this.db.query<{
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
    }>(`
      SELECT a.code, a.name, a.type,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit ELSE 0 END), 0) AS debit,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit ELSE 0 END), 0) AS credit
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1 AND e.date <= ?
      GROUP BY a.id
    `, [date]);
    const accountBalance = (code: string, type: string) => {
      const account = accounts.find((row) => row.code === code);
      if (!account) return 0;
      const debit = Number(account.debit) || 0;
      const credit = Number(account.credit) || 0;
      return type === 'ASSET' || type === 'EXPENSE' ? debit - credit : credit - debit;
    };
    const assetBalance = (row: typeof accounts[number]) => round2(Number(row.debit || 0) - Number(row.credit || 0));
    const creditBalance = (row: typeof accounts[number]) => round2(Number(row.credit || 0) - Number(row.debit || 0));
    const cash = round2(['1101', '1102', '1106'].reduce((sum, code) => sum + accountBalance(code, 'ASSET'), 0));
    const receivableBalance = accountBalance('1103', 'ASSET');
    const receivables = round2(Math.max(0, receivableBalance));
    const customerAdvances = round2(Math.max(0, -receivableBalance));
    const inventory = round2(accountBalance('1104', 'ASSET'));
    const fixedAssets = round2(accountBalance('1601', 'ASSET') + accountBalance('1602', 'ASSET'));
    const chequesReceived = round2(accountBalance('1105', 'ASSET'));
    const inputTax = round2(accountBalance('1201', 'ASSET'));
    const payables = round2(accountBalance('2101', 'LIABILITY'));
    const taxPayable = round2(accountBalance('2102', 'LIABILITY'));
    const payrollPayable = round2(accountBalance('2104', 'LIABILITY'));
    const otherAssets = round2(accounts
      .filter((row) => row.type === 'ASSET' && !['1101', '1102', '1103', '1104', '1105', '1106', '1201', '1601', '1602'].includes(row.code))
      .reduce((sum, row) => sum + assetBalance(row), 0));
    const otherLiabilities = round2(accounts
      .filter((row) => row.type === 'LIABILITY' && !['2101', '2102', '2104'].includes(row.code))
      .reduce((sum, row) => sum + creditBalance(row), 0));
    const totalAssets = round2(cash + receivables + inventory + fixedAssets + chequesReceived + inputTax + otherAssets);
    const totalLiabilities = round2(payables + taxPayable + payrollPayable + otherLiabilities + customerAdvances);
    const capital = round2(accounts
      .filter((row) => row.type === 'EQUITY')
      .reduce((sum, row) => sum + creditBalance(row), 0));
    const revenue = round2(accounts
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum + creditBalance(row), 0));
    const expenses = round2(accounts
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + assetBalance(row), 0));
    const netIncome = round2(revenue - expenses);
    const totalEquity = round2(capital + netIncome);

    return {
      asOf: date,
      assets: [
        { label: 'النقدية والبنوك والمقاصة', amount: cash },
        { label: 'مديونيات العملاء (ذمم مدينة)', amount: receivables },
        { label: 'قيمة المخزون بسعر التكلفة', amount: inventory },
        { label: 'الأصول الثابتة (بعد الإهلاك)', amount: fixedAssets },
        { label: 'شيكات تحت التحصيل', amount: chequesReceived },
        { label: 'ضريبة مدخلات وأصول أخرى', amount: round2(inputTax + otherAssets) },
        { label: 'إجمالي الأصول', amount: totalAssets, emphasis: true },
      ],
      liabilities: [
        { label: 'مديونيات الموردين (ذمم دائنة)', amount: payables },
        { label: 'ضريبة قيمة مضافة مستحقة', amount: taxPayable },
        { label: 'مستحقات الرواتب', amount: payrollPayable },
        { label: 'دفعات مقدمة من العملاء', amount: customerAdvances },
        { label: 'التزامات أخرى', amount: otherLiabilities },
        { label: 'إجمالي الالتزامات', amount: totalLiabilities, emphasis: true },
      ],
      equity: [
        { label: 'رأس المال والأرباح المرحلة', amount: capital },
        { label: 'صافي نتيجة الأعمال من القيود', amount: netIncome },
        { label: 'إجمالي حقوق الملكية', amount: totalEquity, emphasis: true },
      ],
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        difference: round2(totalAssets - totalLiabilities - totalEquity),
      },
    };
  }

  // ── Cash flow (simplified direct method with activity classification) ─────────────────────────────────
  public getCashFlow(dateFrom?: string, dateTo?: string): {
    months: CashFlowMonth[];
    totals: CashFlowMonth;
    byActivity: { operating: CashFlowMonth; investing: CashFlowMonth; financing: CashFlowMonth };
  } {
    this.requireView('finance.view');
    const from = dateFrom || localDateString(new Date(new Date().getFullYear(), 0, 1));
    const to = dateTo || localDateString();
    if (!isValidDate(from) || !isValidDate(to) || from > to) {
      throw new Error('Invalid cash flow date range.');
    }

    // Operating activities: all operating cash movements (sales, purchases, expenses, manual adjustments)
    const operatingRows = this.db.query<any>(`
      WITH cash_by_entry AS (
        SELECT e.id, substr(e.date, 1, 7) AS month,
               SUM(CASE
                 WHEN a.code IN ('1101', '1102', '1106')
                      AND e.reference_type NOT IN ('FIXED_ASSET_PURCHASE', 'FIXED_ASSET_SALE', 'LOAN_RECEIVED', 'LOAN_REPAYMENT', 'CAPITAL_INJECTION', 'DIVIDEND_PAYMENT')
                 THEN l.debit - l.credit
                 ELSE 0
               END) AS net_cash
        FROM journal_entries e
        JOIN journal_entry_lines l ON l.entry_id = e.id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        GROUP BY e.id, substr(e.date, 1, 7)
      )
      SELECT month, SUM(MAX(net_cash, 0)) AS inflow, SUM(MAX(-net_cash, 0)) AS outflow
      FROM cash_by_entry
      GROUP BY month
      ORDER BY month ASC
    `, [from, to]);

    // Investing activities: fixed assets, investments
    const investingRows = this.db.query<any>(`
      WITH cash_by_entry AS (
        SELECT e.id, substr(e.date, 1, 7) AS month,
               SUM(CASE
                 WHEN a.code IN ('1101', '1102', '1106') AND e.reference_type IN ('FIXED_ASSET_PURCHASE', 'FIXED_ASSET_SALE') THEN l.debit - l.credit
                 ELSE 0
               END) AS net_cash
        FROM journal_entries e
        JOIN journal_entry_lines l ON l.entry_id = e.id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        GROUP BY e.id, substr(e.date, 1, 7)
      )
      SELECT month, SUM(MAX(net_cash, 0)) AS inflow, SUM(MAX(-net_cash, 0)) AS outflow
      FROM cash_by_entry
      GROUP BY month
      ORDER BY month ASC
    `, [from, to]);

    // Financing activities: loans, capital, dividends
    const financingRows = this.db.query<any>(`
      WITH cash_by_entry AS (
        SELECT e.id, substr(e.date, 1, 7) AS month,
               SUM(CASE
                 WHEN a.code IN ('1101', '1102', '1106') AND e.reference_type IN ('LOAN_RECEIVED', 'LOAN_REPAYMENT', 'CAPITAL_INJECTION', 'DIVIDEND_PAYMENT') THEN l.debit - l.credit
                 ELSE 0
               END) AS net_cash
        FROM journal_entries e
        JOIN journal_entry_lines l ON l.entry_id = e.id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        GROUP BY e.id, substr(e.date, 1, 7)
      )
      SELECT month, SUM(MAX(net_cash, 0)) AS inflow, SUM(MAX(-net_cash, 0)) AS outflow
      FROM cash_by_entry
      GROUP BY month
      ORDER BY month ASC
    `, [from, to]);

    // Combine all cash flows
    const combinedMap = new Map<string, { inflow: number; outflow: number }>();

    const addRows = (rows: any[]) => {
      for (const r of rows) {
        const existing = combinedMap.get(r.month) || { inflow: 0, outflow: 0 };
        existing.inflow += Number(r.inflow || 0);
        existing.outflow += Number(r.outflow || 0);
        combinedMap.set(r.month, existing);
      }
    };

    addRows(operatingRows);
    addRows(investingRows);
    addRows(financingRows);

    const months: CashFlowMonth[] = Array.from(combinedMap.entries())
      .map(([month, values]) => ({
        month,
        inflows: round2(values.inflow),
        outflows: round2(values.outflow),
        net: round2(values.inflow - values.outflow),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const totals = months.reduce<CashFlowMonth>(
      (acc, m) => ({
        month: 'الإجمالي',
        inflows: round2(acc.inflows + m.inflows),
        outflows: round2(acc.outflows + m.outflows),
        net: round2(acc.net + m.net),
      }),
      { month: 'الإجمالي', inflows: 0, outflows: 0, net: 0 }
    );

    // Calculate totals by activity type
    const operatingTotal = operatingRows.reduce((sum, r) => ({
      inflow: sum.inflow + Number(r.inflow || 0),
      outflow: sum.outflow + Number(r.outflow || 0),
    }), { inflow: 0, outflow: 0 });

    const investingTotal = investingRows.reduce((sum, r) => ({
      inflow: sum.inflow + Number(r.inflow || 0),
      outflow: sum.outflow + Number(r.outflow || 0),
    }), { inflow: 0, outflow: 0 });

    const financingTotal = financingRows.reduce((sum, r) => ({
      inflow: sum.inflow + Number(r.inflow || 0),
      outflow: sum.outflow + Number(r.outflow || 0),
    }), { inflow: 0, outflow: 0 });

    const byActivity = {
      operating: {
        month: 'الأنشطة التشغيلية',
        inflows: round2(operatingTotal.inflow),
        outflows: round2(operatingTotal.outflow),
        net: round2(operatingTotal.inflow - operatingTotal.outflow),
      },
      investing: {
        month: 'الأنشطة الاستثمارية',
        inflows: round2(investingTotal.inflow),
        outflows: round2(investingTotal.outflow),
        net: round2(investingTotal.inflow - investingTotal.outflow),
      },
      financing: {
        month: 'الأنشطة التمويلية',
        inflows: round2(financingTotal.inflow),
        outflows: round2(financingTotal.outflow),
        net: round2(financingTotal.inflow - financingTotal.outflow),
      },
    };

    return { months, totals, byActivity };
  }

  // ── AR / AP aging ────────────────────────────────────────────────────────
  public getCustomerAging(asOf?: string): { rows: AgingRow[]; bucket: AgingBucket } {
    this.requireView('finance.debts.view');
    const date = asOf || localDateString();
    if (!isValidDate(date)) throw new Error('Invalid aging date.');
    return this.buildAging(`
      SELECT c.id, c.name, c.phone, COALESCE(si.due_date, si.date) AS docDate,
        MAX(0, si.total_amount
          - MAX(0, si.paid_amount - COALESCE((SELECT SUM(cpa0.amount) FROM customer_payment_allocations cpa0
              WHERE cpa0.sales_invoice_id = si.id), 0))
          - COALESCE((SELECT SUM(cpa.amount) FROM customer_payment_allocations cpa
              JOIN customer_payments cp ON cp.id=cpa.payment_id
              WHERE cpa.sales_invoice_id = si.id AND cp.date <= ?), 0)
          - COALESCE((SELECT SUM(sr.remaining_to_balance) FROM sales_returns sr
              WHERE sr.original_invoice_id = si.id AND sr.date <= ?), 0)
        ) AS remaining
      FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
      WHERE si.invoice_status != 'VOID' AND si.date <= ?
        AND si.total_amount
          - MAX(0, si.paid_amount - COALESCE((SELECT SUM(cpa0.amount) FROM customer_payment_allocations cpa0
              WHERE cpa0.sales_invoice_id = si.id), 0))
          - COALESCE((SELECT SUM(cpa.amount) FROM customer_payment_allocations cpa
              JOIN customer_payments cp ON cp.id=cpa.payment_id
              WHERE cpa.sales_invoice_id = si.id AND cp.date <= ?), 0)
          - COALESCE((SELECT SUM(sr.remaining_to_balance) FROM sales_returns sr
              WHERE sr.original_invoice_id = si.id AND sr.date <= ?), 0) > 0.009
    `, [date, date, date, date, date], date);
  }

  public getSupplierAging(asOf?: string): { rows: AgingRow[]; bucket: AgingBucket } {
    this.requireView('finance.debts.view');
    const date = asOf || localDateString();
    if (!isValidDate(date)) throw new Error('Invalid aging date.');
    return this.buildAging(`
      SELECT s.id, s.name, s.phone, pi.date AS docDate,
        MAX(0, pi.total_amount
          - MAX(0, pi.paid_amount - COALESCE((SELECT SUM(spa0.amount) FROM supplier_payment_allocations spa0
              WHERE spa0.purchase_invoice_id = pi.id), 0))
          - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocations spa
              JOIN supplier_payments sp ON sp.id=spa.payment_id
              WHERE spa.purchase_invoice_id = pi.id AND sp.date <= ?), 0)
          - COALESCE((SELECT SUM(pr.remaining_to_balance) FROM purchase_returns pr
              WHERE pr.original_purchase_id = pi.id AND pr.date <= ?), 0)
        ) AS remaining
      FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.date <= ?
        AND pi.total_amount
          - MAX(0, pi.paid_amount - COALESCE((SELECT SUM(spa0.amount) FROM supplier_payment_allocations spa0
              WHERE spa0.purchase_invoice_id = pi.id), 0))
          - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocations spa
              JOIN supplier_payments sp ON sp.id=spa.payment_id
              WHERE spa.purchase_invoice_id = pi.id AND sp.date <= ?), 0)
          - COALESCE((SELECT SUM(pr.remaining_to_balance) FROM purchase_returns pr
              WHERE pr.original_purchase_id = pi.id AND pr.date <= ?), 0) > 0.009
    `, [date, date, date, date, date], date);
  }

  private buildAging(sql: string, params: any[], asOf?: string): { rows: AgingRow[]; bucket: AgingBucket } {
    const reference = calendarDayNumber(asOf || localDateString());
    const docs = this.db.query<any>(sql, params);
    const map = new Map<string, AgingRow>();

    for (const doc of docs) {
      const row = map.get(doc.id) || {
        id: doc.id, name: doc.name, phone: doc.phone,
        current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0,
      };
      const days = Math.max(0, reference - calendarDayNumber(doc.docDate));
      const amount = Number(doc.remaining) || 0;
      if (days <= 30) row.current += amount;
      else if (days <= 60) row.days30 += amount;
      else if (days <= 90) row.days60 += amount;
      else if (days <= 120) row.days90 += amount;
      else row.over90 += amount;
      row.total += amount;
      row.current = round2(row.current);
      row.days30 = round2(row.days30);
      row.days60 = round2(row.days60);
      row.days90 = round2(row.days90);
      row.over90 = round2(row.over90);
      row.total = round2(row.total);
      map.set(doc.id, row);
    }

    const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
    const bucket = rows.reduce<AgingBucket>(
      (acc, row) => ({
        label: 'الإجمالي',
        current: round2(acc.current + row.current),
        days30: round2(acc.days30 + row.days30),
        days60: round2(acc.days60 + row.days60),
        days90: round2(acc.days90 + row.days90),
        over90: round2(acc.over90 + row.over90),
        total: round2(acc.total + row.total),
      }),
      { label: 'الإجمالي', current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 }
    );
    return { rows, bucket };
  }

  // ── General ledger ───────────────────────────────────────────────────────
  public getAccountsForLedger(): Array<{ id: string; code: string; name: string; type: string }> {
    this.requireView('finance.view');
    return this.db.query(`
      SELECT id, code, name, type FROM chart_of_accounts WHERE is_active = 1 ORDER BY code
    `);
  }

  public getGeneralLedger(accountId: string, dateFrom?: string, dateTo?: string): {
    opening: number; lines: LedgerLine[]; closing: number; account?: { code: string; name: string };
  } {
    this.requireView('finance.view');
    const account = this.db.query<any>(`SELECT code, name FROM chart_of_accounts WHERE id = ?`, [accountId])[0];
    const from = dateFrom || '0000-01-01';
    const to = dateTo || '9999-12-31';
    if ((dateFrom && !isValidDate(dateFrom)) || (dateTo && !isValidDate(dateTo)) || from > to) {
      throw new Error('Invalid general ledger date range.');
    }
    const opening = this.scalar(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0)
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = ? AND e.is_posted = 1 AND e.date < ?
    `, [accountId, from]);

    const rows = this.db.query<any>(`
      SELECT e.date, e.entry_number AS entryNumber, e.description,
             l.debit, l.credit, l.description AS lineDescription
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = ? AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
      ORDER BY e.date ASC, e.created_at ASC
    `, [accountId, from, to]);

    let running = opening;
    const lines = rows.map((row) => {
      running = round2(running + (Number(row.debit) || 0) - (Number(row.credit) || 0));
      return {
        date: row.date,
        entryNumber: row.entryNumber,
        description: row.lineDescription || row.description,
        debit: round2(row.debit || 0),
        credit: round2(row.credit || 0),
        balance: running,
      };
    });

    return { opening: round2(opening), lines, closing: round2(running), account };
  }

  private scalar(sql: string, params: any[] = []): number {
    const row = this.db.query<any>(sql, params)[0];
    if (!row) return 0;
    const value = Object.values(row)[0];
    return Number(value) || 0;
  }
}
