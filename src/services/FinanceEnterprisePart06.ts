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
import { FinanceEnterprisePart05 } from './FinanceEnterprisePart05';

export abstract class FinanceEnterprisePart06 extends FinanceEnterprisePart05 {
public getCostCenters(): CostCenter[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT cc.*, b.name as branchName, u.full_name as managerName
      FROM cost_centers cc
      LEFT JOIN branches b ON cc.branch_id = b.id
      LEFT JOIN users u ON cc.manager_id = u.id
      ORDER BY cc.is_active DESC, cc.code ASC
    `).map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      branchId: r.branch_id,
      branchName: r.branchName,
      managerId: r.manager_id,
      managerName: r.managerName,
      isActive: r.is_active === 1,
      description: r.description,
      createdAt: r.created_at,
    }));
  }

public saveCostCenter(input: Partial<CostCenter> & { code: string; name: string }): string {
    const actor = this.requireManage();
    if (!input.code.trim()) throw new Error('كود مركز التكلفة مطلوب.');
    if (!input.name.trim()) throw new Error('اسم مركز التكلفة مطلوب.');

    if (input.id) {
      this.db.run(`
        UPDATE cost_centers
        SET code = ?, name = ?, branch_id = ?, manager_id = ?, is_active = ?, description = ?
        WHERE id = ?
      `, [input.code.trim(), input.name.trim(), input.branchId || null, input.managerId || null, input.isActive ? 1 : 0, input.description || null, input.id]);
      return input.id;
    } else {
      const id = `cc_${uuidv4().substring(0, 8)}`;
      this.db.run(`
        INSERT INTO cost_centers (id, code, name, branch_id, manager_id, is_active, description)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [id, input.code.trim(), input.name.trim(), input.branchId || null, input.managerId || null, input.description || null]);
      return id;
    }
  }

public getBudgets(fiscalYearId?: string): Budget[] {
    this.requireView();
    let sql = `
      SELECT b.*, fy.year_code as fiscalYearCode, cc.name as costCenterName, u.full_name as approvedByName
      FROM budgets b
      JOIN fiscal_years fy ON b.fiscal_year_id = fy.id
      LEFT JOIN cost_centers cc ON b.cost_center_id = cc.id
      LEFT JOIN users u ON b.approved_by = u.id
    `;
    const params: any[] = [];
    if (fiscalYearId) {
      sql += ' WHERE b.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }
    sql += ' ORDER BY b.created_at DESC';

    const budgets = this.db.query<any>(sql, params).map(r => ({
      id: r.id,
      budgetCode: r.budget_code,
      fiscalYearId: r.fiscal_year_id,
      fiscalYearCode: r.fiscalYearCode,
      costCenterId: r.cost_center_id,
      costCenterName: r.costCenterName,
      name: r.name,
      totalAllocated: Number(r.total_allocated),
      status: r.status,
      approvedBy: r.approved_by,
      approvedByName: r.approvedByName,
      approvedAt: r.approved_at,
      createdAt: r.created_at,
    }));

    return budgets;
  }

public getBudgetWithItems(budgetId: string): Budget | null {
    this.requireView();
    const budget = this.getBudgets().find(b => b.id === budgetId);
    if (!budget) return null;

    const fy = this.db.query<any>('SELECT start_date, end_date FROM fiscal_years WHERE id = ?', [budget.fiscalYearId])[0];
    const startDate = fy?.start_date || '2000-01-01';
    const endDate = fy?.end_date || '2099-12-31';

    const items = this.db.query<any>(`
      SELECT bi.*, coa.code as accountCode, coa.name as accountName
      FROM budget_items bi
      JOIN chart_of_accounts coa ON bi.account_id = coa.id
      WHERE bi.budget_id = ?
      ORDER BY coa.code ASC
    `, [budgetId]).map(i => {
      // Calculate actual spending for this account within this fiscal year and optional cost center
      let actualSql = `
        SELECT COALESCE(SUM(l.debit - l.credit), 0) as spent
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.account_id = ? AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
      `;
      const actualParams: any[] = [i.account_id, startDate, endDate];
      if (budget.costCenterId) {
        actualSql += ' AND l.cost_center_id = ?';
        actualParams.push(budget.costCenterId);
      }
      const actualSpent = round2(Number(this.db.query<any>(actualSql, actualParams)[0]?.spent || 0));
      const allocatedAmount = Number(i.allocated_amount);
      const variance = round2(allocatedAmount - actualSpent);

      return {
        id: i.id,
        budgetId: i.budget_id,
        accountId: i.account_id,
        accountCode: i.accountCode,
        accountName: i.accountName,
        allocatedAmount,
        actualSpent,
        variance,
        notes: i.notes,
      };
    });

    return { ...budget, items };
  }
}
