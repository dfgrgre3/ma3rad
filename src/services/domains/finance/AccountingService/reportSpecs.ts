import type { BranchAccessService } from '../../auth/BranchAccessService';
import { branchScope, ledgerScope } from './scopes';
import { requireView } from './permissions';

export function buildPurchaseReportSpec(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): { invoicesSql: string; totalsSql: string; params: any[] } {
  requireView('ui.finance.overview.view');
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  const scope = branchScope(access, 'pi.branch_id');
  whereClause += ` AND ${scope.clause}`;
  params.push(...scope.params);

  if (dateFrom) {
    whereClause += ' AND pi.date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND pi.date <= ?';
    params.push(dateTo);
  }

  return {
    invoicesSql: `
      SELECT pi.*, s.name as supplierName, w.name as warehouseName
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON pi.supplier_id = s.id
      LEFT JOIN warehouses w ON pi.warehouse_id = w.id
      ${whereClause}
      ORDER BY pi.date DESC
    `,
    totalsSql: `
      SELECT
        SUM(total_amount) as totalPurchases,
        SUM(paid_amount) as totalPaid,
        SUM(remaining_amount) as totalRemaining
      FROM purchase_invoices pi
      ${whereClause}
    `,
    params,
  };
}

export function buildExpenseReportSpec(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): { whereClause: string; params: any[] } {
  requireView('ui.finance.overview.view');
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  const scope = branchScope(access, 'e.branch_id');
  whereClause += ` AND ${scope.clause}`;
  params.push(...scope.params);

  if (dateFrom) {
    whereClause += ' AND e.date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND e.date <= ?';
    params.push(dateTo);
  }
  return { whereClause, params };
}

export function buildProfitAndLossSpecs(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): {
  balancesSql: string; balancesParams: string[];
  sourceExpensesSql: string; sourceExpensesParams: string[];
} {
  const conditions = ['e.is_posted = 1', "a.type IN ('REVENUE', 'EXPENSE')"];
  const params: string[] = [];
  const scope = ledgerScope(access);
  conditions.push(scope.clause);
  params.push(...scope.params);
  if (dateFrom) { conditions.push('e.date >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('e.date <= ?'); params.push(dateTo); }
  const sourceExpenseScope = branchScope(access, 'ex.branch_id');
  const sourceExpenseConditions = [sourceExpenseScope.clause];
  const sourceExpenseParams: string[] = [...sourceExpenseScope.params];
  if (dateFrom) { sourceExpenseConditions.push('ex.date >= ?'); sourceExpenseParams.push(dateFrom); }
  if (dateTo) { sourceExpenseConditions.push('ex.date <= ?'); sourceExpenseParams.push(dateTo); }
  return {
    balancesSql: `
      SELECT a.code, a.type,
             ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN (l.credit - l.debit) / 100.0 ELSE (l.debit - l.credit) / 100.0 END), 2) AS amount
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.code, a.type
    `,
    balancesParams: params,
    sourceExpensesSql: `
      SELECT COALESCE(SUM(ex.amount), 0) / 100.0 AS total
      FROM expenses ex
      WHERE ${sourceExpenseConditions.join(' AND ')}
    `,
    sourceExpensesParams: sourceExpenseParams,
  };
}

export function buildSalesReportWhere(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): { whereClause: string; params: any[] } {
  let whereClause = 'WHERE si.invoice_status != \'VOID\'';
  const params: any[] = [];
  const scope = branchScope(access, 'si.branch_id');
  whereClause += ` AND ${scope.clause}`;
  params.push(...scope.params);

  if (dateFrom) {
    whereClause += ' AND si.date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND si.date <= ?';
    params.push(dateTo);
  }
  return { whereClause, params };
}

const UNIT_LABEL_CASE = `
        CASE
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'CUSTOM' THEN COALESCE(NULLIF(TRIM(p.custom_unit), ''), 'وحدة')
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'BOX' THEN 'كرتونة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'PIECE' THEN 'قطعة'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'KG' THEN 'كجم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'TON' THEN 'طن'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'SET' THEN 'طقم'
          WHEN p.product_type = 'GENERAL' AND p.base_unit = 'LINEAR_METER' THEN 'متر طولي'
          WHEN p.product_type = 'GENERAL' THEN 'م²'
          ELSE 'م²'
        END`;

export function buildCategorySalesSpec(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): { sql: string; params: any[] } {
  const { whereClause, params } = buildSalesReportWhere(dateFrom, dateTo, access);
  return {
    sql: `
      SELECT
        c.name as categoryName,
        ${UNIT_LABEL_CASE} as unitLabel,
        p.product_type as productType,
        p.base_unit as baseUnit,
        p.custom_unit as customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue,
        SUM(sii.profit) / 100.0 as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY c.id, c.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `,
    params,
  };
}

export function buildBrandSalesSpec(dateFrom: string | undefined, dateTo: string | undefined, access: BranchAccessService): { sql: string; params: any[] } {
  const { whereClause, params } = buildSalesReportWhere(dateFrom, dateTo, access);
  return {
    sql: `
      SELECT
        b.name as brandName,
        ${UNIT_LABEL_CASE} as unitLabel,
        p.product_type as productType,
        p.base_unit as baseUnit,
        p.custom_unit as customUnit,
        SUM(sii.quantity_m2) as quantityM2,
        SUM(sii.total_price) / 100.0 as totalRevenue,
        SUM(sii.profit) / 100.0 as profit
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      JOIN sales_invoices si ON sii.invoice_id = si.id
      ${whereClause}
      GROUP BY b.id, b.name, p.product_type, p.base_unit, p.custom_unit
      ORDER BY totalRevenue DESC
    `,
    params,
  };
}

export function buildInventoryValuationSpecs(access: BranchAccessService): { byWarehouseSql: string; totalsSql: string; params: any[] } {
  requireView('ui.finance.overview.view');
  const scope = branchScope(access,
    'w.branch_id',
    '(SELECT bw.branch_id FROM branch_warehouses bw WHERE bw.warehouse_id = w.id ORDER BY bw.is_primary DESC, bw.branch_id LIMIT 1)'
  );
  return {
    byWarehouseSql: `
      SELECT
        w.name as warehouseName,
        SUM(ws.quantity_m2 * p.cost_price) / 100.0 as costValue,
        SUM(ws.quantity_m2 * p.selling_price_m2) / 100.0 as saleValue,
        COUNT(ws.id) as items
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
      GROUP BY w.id, w.name
      ORDER BY costValue DESC
    `,
    totalsSql: `
      SELECT
        SUM(ws.quantity_m2 * p.cost_price) / 100.0 as totalCost,
        SUM(ws.quantity_m2 * p.selling_price_m2) / 100.0 as totalSale
      FROM warehouse_stock ws
      JOIN warehouses w ON ws.warehouse_id = w.id
      JOIN products p ON ws.product_id = p.id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
    `,
    params: [...scope.params],
  };
}
