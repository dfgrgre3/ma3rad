import { DatabaseManager } from '../database/db';
import { round2 } from './financials';
import { localDateString } from '../utils/date';

function calendarDayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
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

export class FinancialStatementsService {
  private db = DatabaseManager.getInstance();

  // ── Balance sheet ────────────────────────────────────────────────────────
  public getBalanceSheet(asOf?: string): BalanceSheet {
    const date = asOf || localDateString();
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

  // ── Cash flow (simplified direct method) ─────────────────────────────────
  public getCashFlow(dateFrom?: string, dateTo?: string): { months: CashFlowMonth[]; totals: CashFlowMonth } {
    const from = dateFrom || localDateString(new Date(new Date().getFullYear(), 0, 1));
    const to = dateTo || localDateString();

    const rows = this.db.query<any>(`
      SELECT substr(e.date, 1, 7) AS month,
             SUM(l.debit) AS inflow,
             SUM(l.credit) AS outflow
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        AND a.code IN ('1101', '1102', '1106')
      GROUP BY substr(e.date, 1, 7)
      ORDER BY month ASC
    `, [from, to]);

    const months: CashFlowMonth[] = rows.map((r) => ({
      month: r.month,
      inflows: round2(r.inflow || 0),
      outflows: round2(r.outflow || 0),
      net: round2((r.inflow || 0) - (r.outflow || 0)),
    }));

    const totals = months.reduce<CashFlowMonth>(
      (acc, m) => ({
        month: 'الإجمالي',
        inflows: round2(acc.inflows + m.inflows),
        outflows: round2(acc.outflows + m.outflows),
        net: round2(acc.net + m.net),
      }),
      { month: 'الإجمالي', inflows: 0, outflows: 0, net: 0 }
    );

    return { months, totals };
  }

  // ── AR / AP aging ────────────────────────────────────────────────────────
  public getCustomerAging(asOf?: string): { rows: AgingRow[]; bucket: AgingBucket } {
    const date = asOf || localDateString();
    return this.buildAging(`
      SELECT c.id, c.name, c.phone, si.date AS docDate,
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
    const date = asOf || localDateString();
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
    return this.db.query(`
      SELECT id, code, name, type FROM chart_of_accounts WHERE is_active = 1 ORDER BY code
    `);
  }

  public getGeneralLedger(accountId: string, dateFrom?: string, dateTo?: string): {
    opening: number; lines: LedgerLine[]; closing: number; account?: { code: string; name: string };
  } {
    const account = this.db.query<any>(`SELECT code, name FROM chart_of_accounts WHERE id = ?`, [accountId])[0];
    const from = dateFrom || '0000-01-01';
    const to = dateTo || '9999-12-31';
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
