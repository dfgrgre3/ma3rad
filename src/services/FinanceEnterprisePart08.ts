import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
import type {
  FiscalYear,
  FiscalPeriod,
  BankAccount,
  BankReconciliation,
  BankReconciliationLine,
  ExtendedChequeStatus,
  ChequeStatusHistory,
  CostCenter,
  Budget,
  BudgetItem,
  CashForecastItem,
  CashForecastDaySummary,
  PaymentGateway,
  PaymentGatewaySettlement,
  MultiDimensionalReportFilters,
} from '../types/finance';
import type { Cheque } from './FinanceExtrasService';
import { FinanceEnterprisePart07 } from './FinanceEnterprisePart07';

export abstract class FinanceEnterprisePart08 extends FinanceEnterprisePart07 {
public getCashFlowForecast(daysAhead = 60): {
    currentCashBalance: number;
    projectedEndBalance: number;
    totalExpectedInflow: number;
    totalExpectedOutflow: number;
    days: CashForecastDaySummary[];
  } {
    this.requireView();
    const today = localDateString();

    // 1. Current real cash + bank balance
    const currentCash = this.db.query<any>(`
      SELECT COALESCE(SUM(balance), 0) as totalCash
      FROM chart_of_accounts
      WHERE code IN ('1101', '1102') AND is_active = 1
    `)[0]?.totalCash || 0;
    const initialCash = round2(Number(currentCash));

    // 2. Fetch upcoming items:
    // a) Open customer invoices with due dates >= today
    const invoiceInflows = this.db.query<any>(`
      SELECT si.id, si.due_date as date, (si.total_amount - si.paid_amount) as amount,
             'INVOICE' as sourceType, 'تحصيل فاتورة مبيعات' as category,
             ('فاتورة ' || si.invoice_number || ' - ' || c.name) as description
      FROM sales_invoices si
      JOIN customers c ON si.customer_id = c.id
      WHERE si.invoice_status != 'VOID' AND (si.total_amount - si.paid_amount) > 0.01
        AND si.due_date IS NOT NULL AND si.due_date >= ?
    `, [today]);

    // b) Pending received cheques
    const chequeInflows = this.db.query<any>(`
      SELECT id, due_date as date, amount, 'CHEQUE' as sourceType, 'شيك برسم التحصيل' as category,
             ('شيك وارد رقم ' || cheque_number || ' - ' || party_name) as description
      FROM cheques
      WHERE type = 'RECEIVED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
        AND due_date >= ?
    `, [today]);

    // c) Unpaid supplier invoices due
    const purchaseOutflows = this.db.query<any>(`
      SELECT pi.id, pi.due_date as date, pi.remaining_amount as amount,
             'PURCHASE' as sourceType, 'سداد مستحقات موردين' as category,
             ('فاتورة شراء ' || pi.invoice_number || ' - ' || s.name) as description
      FROM purchase_invoices pi
      JOIN suppliers s ON pi.supplier_id = s.id
      WHERE pi.remaining_amount > 0.01 AND pi.due_date IS NOT NULL AND pi.due_date >= ?
    `, [today]);

    // d) Issued cheques payable
    const chequeOutflows = this.db.query<any>(`
      SELECT id, due_date as date, amount, 'CHEQUE' as sourceType, 'صرف شيك صادر' as category,
             ('شيك صادر رقم ' || cheque_number || ' - ' || party_name) as description
      FROM cheques
      WHERE type = 'ISSUED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
        AND due_date >= ?
    `, [today]);

    // Combine into dates map
    const dateMap = new Map<string, { inflows: CashForecastItem[]; outflows: CashForecastItem[] }>();

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + daysAhead);
    const maxDateStr = localDateString(maxDate);

    const addItem = (type: 'INFLOW' | 'OUTFLOW', row: any) => {
      const d = row.date;
      if (d < today || d > maxDateStr) return;
      if (!dateMap.has(d)) dateMap.set(d, { inflows: [], outflows: [] });
      const item: CashForecastItem = {
        id: `fct_${uuidv4().substring(0, 8)}`,
        forecastDate: d,
        type,
        sourceType: row.sourceType,
        sourceId: row.id,
        category: row.category,
        description: row.description,
        amount: round2(row.amount),
        probability: 0.95,
        status: 'PROJECTED',
        createdAt: today,
      };
      if (type === 'INFLOW') dateMap.get(d)!.inflows.push(item);
      else dateMap.get(d)!.outflows.push(item);
    };

    invoiceInflows.forEach(r => addItem('INFLOW', r));
    chequeInflows.forEach(r => addItem('INFLOW', r));
    purchaseOutflows.forEach(r => addItem('OUTFLOW', r));
    chequeOutflows.forEach(r => addItem('OUTFLOW', r));

    // Construct sequential day summaries
    const days: CashForecastDaySummary[] = [];
    let runningBalance = initialCash;
    let totalExpectedInflow = 0;
    let totalExpectedOutflow = 0;

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));

    for (const d of sortedDates) {
      const group = dateMap.get(d)!;
      const dayIn = round2(group.inflows.reduce((s, i) => s + i.amount, 0));
      const dayOut = round2(group.outflows.reduce((s, i) => s + i.amount, 0));
      const net = round2(dayIn - dayOut);
      runningBalance = round2(runningBalance + net);
      totalExpectedInflow += dayIn;
      totalExpectedOutflow += dayOut;

      days.push({
        date: d,
        inflows: dayIn,
        outflows: dayOut,
        net,
        projectedClosingBalance: runningBalance,
        items: [...group.inflows, ...group.outflows],
      });
    }

    return {
      currentCashBalance: initialCash,
      projectedEndBalance: runningBalance,
      totalExpectedInflow: round2(totalExpectedInflow),
      totalExpectedOutflow: round2(totalExpectedOutflow),
      days,
    };
  }
}
