import { BranchAccessService, type BranchSqlScope } from '../auth/BranchAccessService';
import type { User } from '../../../types';

/** Shared scope builders for dashboard/report queries. Always pass the actor
 * explicitly so these queries cannot inherit a different user's branch. */
export class DashboardQueryScopeService {
  private static branches = new BranchAccessService();

  static branch(alias: string, user: User): BranchSqlScope {
    return this.branches.sqlScope(`${alias}.branch_id`, undefined, user);
  }

  static expenseBranch(alias: string, user: User): BranchSqlScope {
    return this.branches.sqlScope(
      `${alias}.branch_id`,
      `(SELECT cr.branch_id FROM cash_registers cr WHERE cr.id = ${alias}.register_id)`,
      user
    );
  }

  static warehouseBranch(alias: string, user: User): BranchSqlScope {
    return this.branches.warehouseBranchScope(alias, undefined, user);
  }

  static company(alias: string, user: User): BranchSqlScope {
    return this.branches.companyScope(`${alias}.company_id`, user);
  }
}

export interface DashboardDb {
  exec(sql: string, params?: any[]): Array<{ values: any[][] }>;
}

export interface FinanceOverviewMetrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalReceivables: number;
  totalPayables: number;
  cashBalance: number;
  inventoryValue: number;
}

export const scalar = (result: Array<{ values: unknown[][] }>): number =>
  Number(result[0]?.values[0]?.[0] || 0);
