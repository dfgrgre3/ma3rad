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
import { FinanceEnterprisePart09 } from './FinanceEnterprisePart09';

export abstract class FinanceEnterprisePart10 extends FinanceEnterprisePart09 {
public getMultiDimensionalPnL(filters: MultiDimensionalReportFilters = {}): {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    accountsBreakdown: Array<{ code: string; name: string; type: string; amount: number }>;
  } {
    this.requireView();
    const conditions = ['e.is_posted = 1', "a.type IN ('REVENUE', 'EXPENSE')"];
    const params: any[] = [];
    const scope = this.ledgerScope();
    conditions.push(scope.clause);
    params.push(...scope.params);

    if (filters.dateFrom) { conditions.push('e.date >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { conditions.push('e.date <= ?'); params.push(filters.dateTo); }
    if (filters.costCenterId) { conditions.push('l.cost_center_id = ?'); params.push(filters.costCenterId); }

    const rows = this.db.query<{ code: string; name: string; type: string; amount: number }>(`
      SELECT a.code, a.name, a.type,
             ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit ELSE l.debit - l.credit END), 2) AS amount
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.code, a.name, a.type
      ORDER BY a.code ASC
    `, params);

    const revenue = round2(rows.filter(r => r.type === 'REVENUE').reduce((s, r) => s + Number(r.amount || 0), 0));
    const cogs = round2(rows.filter(r => r.type === 'EXPENSE' && r.code === '5101').reduce((s, r) => s + Number(r.amount || 0), 0));
    const grossProfit = round2(revenue - cogs);
    const expenses = round2(rows.filter(r => r.type === 'EXPENSE' && r.code !== '5101').reduce((s, r) => s + Number(r.amount || 0), 0));
    const netProfit = round2(grossProfit - expenses);

    return { revenue, cogs, grossProfit, expenses, netProfit, accountsBreakdown: rows };
  }
}
