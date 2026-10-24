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

    const cash = this.scalar(`SELECT COALESCE(SUM(current_balance), 0) FROM cash_registers WHERE is_active = 1`);
    const receivables = this.scalar(`SELECT COALESCE(SUM(current_balance), 0) FROM customers WHERE current_balance > 0`);
    const inventory = this.scalar(`
      SELECT COALESCE(SUM(ws.quantity_m2 * p.cost_price), 0)
      FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
    `);
    const fixedAssets = this.scalar(`
      SELECT COALESCE(SUM(purchase_cost - accumulated_depreciation), 0)
      FROM fixed_assets WHERE status != 'DISPOSED'
    `);
    const chequesReceived = this.scalar(`
      SELECT COALESCE(SUM(amount), 0) FROM cheques
      WHERE type = 'RECEIVED' AND status IN ('PENDING', 'DEPOSITED') AND due_date <= ?
    `, [date]);

    const payables = this.scalar(`SELECT COALESCE(SUM(current_balance), 0) FROM suppliers WHERE current_balance > 0`);
    const chequesIssued = this.scalar(`
      SELECT COALESCE(SUM(amount), 0) FROM cheques
      WHERE type = 'ISSUED' AND status IN ('PENDING', 'DEPOSITED')
    `);
    const taxPayable = Math.max(0, round2(
      this.scalar(`SELECT COALESCE(SUM(tax_amount), 0) FROM sales_invoices WHERE invoice_status != 'VOID' AND date <= ?`, [date]) -
      this.scalar(`SELECT COALESCE(SUM(tax_amount), 0) FROM purchase_invoices WHERE date <= ?`, [date])
    ));
    const customerAdvances = this.scalar(`SELECT COALESCE(SUM(ABS(current_balance)), 0) FROM customers WHERE current_balance < 0`);

    const totalAssets = round2(cash + receivables + inventory + fixedAssets + chequesReceived);
    const totalLiabilities = round2(payables + chequesIssued + taxPayable + customerAdvances);
    const netWorth = round2(totalAssets - totalLiabilities);

    const capital = this.scalar(`
      SELECT COALESCE(SUM(l.credit - l.debit), 0)
      FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.type = 'EQUITY'
    `);
    const manualRetained = this.scalar(`
      SELECT COALESCE(SUM(l.credit - l.debit), 0)
      FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.type IN ('REVENUE', 'EXPENSE')
    `);
    const residual = round2(netWorth - capital - manualRetained);

    return {
      asOf: date,
      assets: [
        { label: 'النقدية وأرصدة الخزائن', amount: round2(cash) },
        { label: 'مديونيات العملاء (ذمم مدينة)', amount: round2(receivables) },
        { label: 'قيمة المخزون بسعر التكلفة', amount: round2(inventory) },
        { label: 'الأصول الثابتة (بعد الإهلاك)', amount: round2(fixedAssets) },
        { label: 'شيكات واردة تحت التحصيل', amount: round2(chequesReceived) },
        { label: 'إجمالي الأصول', amount: totalAssets, emphasis: true },
      ],
      liabilities: [
        { label: 'مديونيات الموردين (ذمم دائنة)', amount: round2(payables) },
        { label: 'شيكات صادرة مستحقة', amount: round2(chequesIssued) },
        { label: 'ضريبة قيمة مضافة مستحقة (تقديري)', amount: round2(taxPayable) },
        { label: 'دفعات مقدمة من العملاء', amount: round2(customerAdvances) },
        { label: 'إجمالي الالتزامات', amount: totalLiabilities, emphasis: true },
      ],
      equity: [
        { label: 'رأس المال والاحتياطيات (من القيود)', amount: round2(capital) },
        { label: 'أرباح محتجزة / نتائج أعمال (من القيود)', amount: round2(manualRetained) },
        { label: 'صافي الفرق التشغيلي غير المُرحّل', amount: residual, indent: true },
        { label: 'صافي حقوق الملكية', amount: netWorth, emphasis: true },
      ],
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: netWorth,
        difference: round2(totalAssets - totalLiabilities - netWorth),
      },
    };
  }

  // ── Cash flow (simplified direct method) ─────────────────────────────────
  public getCashFlow(dateFrom?: string, dateTo?: string): { months: CashFlowMonth[]; totals: CashFlowMonth } {
    const from = dateFrom || localDateString(new Date(new Date().getFullYear(), 0, 1));
    const to = dateTo || localDateString();

    const rows = this.db.query<any>(`
      SELECT month, SUM(inflow) AS inflow, SUM(outflow) AS outflow FROM (
        SELECT substr(date, 1, 7) AS month, amount AS inflow, 0 AS outflow
        FROM customer_payments
        WHERE date >= ? AND date <= ? AND payment_type != 'CREDIT'
        UNION ALL
        SELECT substr(date, 1, 7) AS month, 0 AS inflow, amount AS outflow
        FROM supplier_payments
        WHERE date >= ? AND date <= ? AND payment_type != 'CREDIT'
        UNION ALL
        SELECT substr(date, 1, 7) AS month, 0 AS inflow, amount AS outflow
        FROM expenses
        WHERE date >= ? AND date <= ?
        UNION ALL
        SELECT substr(date, 1, 7) AS month, 0 AS inflow, amount AS outflow
        FROM payroll_transactions
        WHERE date >= ? AND date <= ? AND type IN ('SALARY_PAYOUT', 'ADVANCE', 'BONUS')
      )
      GROUP BY month ORDER BY month ASC
    `, [from, to, from, to, from, to, from, to]);

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
      SELECT c.id, c.name, c.phone, si.date AS docDate, si.remaining_amount AS remaining
      FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
      WHERE si.remaining_amount > 0.009 AND si.invoice_status != 'VOID' AND si.date <= ?
    `, [date]);
  }

  public getSupplierAging(asOf?: string): { rows: AgingRow[]; bucket: AgingBucket } {
    const date = asOf || localDateString();
    return this.buildAging(`
      SELECT s.id, s.name, s.phone, pi.date AS docDate, pi.remaining_amount AS remaining
      FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.remaining_amount > 0.009 AND pi.date <= ?
    `, [date], date);
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
      WHERE l.account_id = ? AND e.date < ?
    `, [accountId, from]);

    const rows = this.db.query<any>(`
      SELECT e.date, e.entry_number AS entryNumber, e.description,
             l.debit, l.credit, l.description AS lineDescription
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = ? AND e.date >= ? AND e.date <= ?
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
