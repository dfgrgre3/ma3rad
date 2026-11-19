import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import { reportCache, CACHE_TTL_MS } from './cache';
import { num } from './helpers';
import type { ReportParams, ReportResult } from './types';

/**
 * Shared base for the report-center domain mixins. Holds the database handle,
 * branch-scope helpers, actor/permission checks and the report cache so every
 * report method keeps identical scoping behaviour.
 */
export class ReportCenterContext {
  protected db = DatabaseManager.getInstance();
  protected branchAccess = new BranchAccessService();

  protected async withCache(key: string, compute: () => Promise<ReportResult>): Promise<ReportResult> {
    const now = Date.now();
    const hit = reportCache.get(key);
    if (hit && hit.expiresAt > now) return hit.result;
    const result = await compute();
    reportCache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
    return result;
  }

  protected actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view', '/reports');
    return actor;
  }

  protected salesScope() {
    return this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      this.actor(),
    );
  }

  protected purchaseScope() {
    return this.branchAccess.sqlScope(
      'pi.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)',
      this.actor(),
    );
  }

  protected allBranchesScope() {
    return this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      this.actor(),
      true,
    );
  }

  protected allBranchesTableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor(), true);
  }

  protected cachePartition(actor: ReturnType<typeof AuthService.requireAuth>): string {
    const allowedBranches = this.branchAccess.getAccessibleBranchIds(actor);
    const branchScope = allowedBranches === null ? '*' : [...allowedBranches].sort().join(',');
    const activeBranch = this.branchAccess.getCurrentBranchId(actor);
    const companyId = this.branchAccess.companyScope('company_id', actor).params[0] || '';
    return `${actor.id}:${activeBranch}:${companyId}:${branchScope}`;
  }

  protected tableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor());
  }

  protected withAdvancedQueryScope(
    base: { clause: string; params: any[] },
    params: Partial<ReportParams>,
    additions: Array<{ predicate: string; values: any[] }>,
  ): { clause: string; params: any[] } {
    const effective = additions.filter(({ values }) => values.some((value) => value !== undefined && value !== null && value !== '' && value !== 'all' && value !== 'all-branches' && value !== 'none'));
    if (!effective.length) return base;

    const values: any[] = [...base.params];
    const clause = `${base.clause}${effective.map(({ predicate }) => ` AND ${predicate}`).join('')}`;
    for (const addition of effective) {
      values.push(...addition.values.filter((value) => value !== undefined && value !== null && value !== '' && value !== 'all' && value !== 'all-branches' && value !== 'none'));
    }

    return { clause, params: values };
  }

  protected async periodMetrics(from: string, to: string) {
    const scope = this.salesScope();
    const invoiceRow = (await this.db.queryAsync<any>(`
      SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) / 100.0 AS sales,
        COALESCE(SUM(si.gross_profit), 0) / 100.0 AS profit,
        COUNT(DISTINCT si.id) AS invoices,
        COUNT(DISTINCT si.customer_id) AS customers
      FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params]))[0] || {};
    const returnScope = this.salesScope();
    const returnRow = (await this.db.queryAsync<any>(`
      SELECT COALESCE(SUM(sr.total_amount), 0) / 100.0 AS returns,
        COALESCE(SUM((
          SELECT SUM(sri.quantity_m2 * sri.unit_cost)
          FROM sales_return_items sri WHERE sri.return_id = sr.id
        )), 0) / 100.0 AS returnedCost
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${returnScope.clause}
    `, [from, to, ...returnScope.params]))[0] || {};
    return {
      sales: num(invoiceRow.sales) - num(returnRow.returns),
      profit: num(invoiceRow.profit) - num(returnRow.returns) + num(returnRow.returnedCost),
      invoices: num(invoiceRow.invoices),
      customers: num(invoiceRow.customers),
    };
  }
}
