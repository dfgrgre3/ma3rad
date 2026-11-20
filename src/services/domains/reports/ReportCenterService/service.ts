import { ReportCenterContext } from './context';
import { OperationsReports } from './OperationsReports';
import { SalesReports } from './SalesReports';
import { ReceivablesReports } from './ReceivablesReports';
import { InventoryReports } from './InventoryReports';
import { PurchaseReports } from './PurchaseReports';
import { AuditLogsReports } from './AuditLogsReports';
import { FinanceReports } from './FinanceReports';
import { CustomerAnalyticsReports } from './CustomerAnalyticsReports';
import { HrPayrollReports } from './HrPayrollReports';
import { HrStaffReports } from './HrStaffReports';
import { HrPerformanceReports } from './HrPerformanceReports';
import { BusinessKpisReports } from './BusinessKpisReports';
import { ManufacturingReports } from './ManufacturingReports';
import { CeramicsReports } from './CeramicsReports';
import { ConstructionReports } from './ConstructionReports';
import { ActivityReports } from './ActivityReports';
import { reportCache } from './cache';
import { normalizeReportFilterValue, rowPropertyVariants } from './helpers';
import type { ReportParams, ReportResult } from './types';

/**
 * Read-only data source for the report center. Every method is branch scoped
 * through BranchAccessService and enforces the reports.view permission.
 *
 * The public surface is composed from per-domain mixins; method behaviour is
 * unchanged from the original single-class implementation.
 */
export class ReportCenterService extends OperationsReports(
  SalesReports(
    ReceivablesReports(
      InventoryReports(
        PurchaseReports(
          AuditLogsReports(
            FinanceReports(
              CustomerAnalyticsReports(
                HrPayrollReports(
                  HrStaffReports(
                    HrPerformanceReports(
                      BusinessKpisReports(
                        ConstructionReports(
                          CeramicsReports(
                            ActivityReports(
                              ManufacturingReports(ReportCenterContext),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
) {
  public static clearCache(): void {
    reportCache.clear();
  }

  public static applyAdvancedFilters(result: ReportResult | null, params: Partial<ReportParams>): ReportResult | null {
    if (!result) return result;
    const rows = [...result.rows];
    const filterKeys: Array<{ key: keyof ReportParams; aliases: string[] }> = [
      { key: 'branchId', aliases: rowPropertyVariants('branchId') },
      { key: 'warehouseId', aliases: rowPropertyVariants('warehouseId') },
      { key: 'registerId', aliases: rowPropertyVariants('registerId') },
      { key: 'customerId', aliases: rowPropertyVariants('customerId') },
      { key: 'supplierId', aliases: rowPropertyVariants('supplierId') },
      { key: 'employeeId', aliases: rowPropertyVariants('employeeId') },
      { key: 'status', aliases: rowPropertyVariants('status') },
      { key: 'paymentMethod', aliases: rowPropertyVariants('paymentMethod') },
      { key: 'compareBranchId', aliases: rowPropertyVariants('compareBranchId') },
    ];

    const filtered = filterKeys.reduce((current, { key, aliases }) => {
      const value = params[key];
      if (!value || value === 'all' || value === 'all-branches' || value === 'none') return current;
      return current.filter((row) => {
        const matches = aliases
          .map((alias) => row[alias])
          .filter((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
        return matches.some((candidate) => normalizeReportFilterValue(candidate) === normalizeReportFilterValue(value));
      });
    }, rows);

    return { ...result, rows: filtered };
  }
}
