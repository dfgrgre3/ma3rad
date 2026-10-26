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
import { FinanceEnterprisePart06 } from './FinanceEnterprisePart06';

export abstract class FinanceEnterprisePart07 extends FinanceEnterprisePart06 {
public saveBudget(input: {
    fiscalYearId: string;
    costCenterId?: string;
    name: string;
    items: Array<{ accountId: string; allocatedAmount: number; notes?: string }>;
  }): string {
    const actor = this.requireManage();
    if (!input.name.trim()) throw new Error('اسم الموازنة التقديرية مطلوب.');
    if (!input.items?.length) throw new Error('يجب إدراج حساب وبند مالي واحد على الأقل في الموازنة.');

    const budgetId = `bgt_${uuidv4().substring(0, 8)}`;
    const budgetCode = `BGT-${new Date().getFullYear()}-${uuidv4().substring(0, 4).toUpperCase()}`;
    const totalAllocated = round2(input.items.reduce((sum, item) => sum + Number(item.allocatedAmount || 0), 0));

    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO budgets (id, budget_code, fiscal_year_id, cost_center_id, name, total_allocated, status, approved_by, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', ?, CURRENT_TIMESTAMP)
      `, [budgetId, budgetCode, input.fiscalYearId, input.costCenterId || null, input.name.trim(), totalAllocated, actor.id]);

      for (const item of input.items) {
        tx.run(`
          INSERT INTO budget_items (id, budget_id, account_id, allocated_amount, notes)
          VALUES (?, ?, ?, ?, ?)
        `, [`bi_${uuidv4().substring(0, 8)}`, budgetId, item.accountId, round2(item.allocatedAmount), item.notes || null]);
      }
    });

    return budgetId;
  }
}
