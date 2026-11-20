import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { PermissionService } from '../auth/PermissionService';
import { ModuleRegistryService } from '../config/ModuleRegistryService';
import { round2 } from '../finance/financials';
import { ExpiryService, type ExpiryLot } from '../inventory/ExpiryService';
import { WarrantyClaimService, type WarrantyClaimsStats } from '../sales/WarrantyClaimService';

export interface RetailWorkspaceStats {
  todaySales: number;
  monthSales: number;
  lowStockCount: number;
  openQuotes: number;
  openOrders: number;
}

export interface RetailTopProduct {
  productId: string;
  name: string;
  sku: string;
  totalQty: number;
  totalAmount: number;
  invoices: number;
}

export interface RetailLowStockRow {
  productId: string;
  name: string;
  sku: string;
  stockQty: number;
  minStockLevel: number;
}

export interface RetailExpirySummary {
  expiredCount: number;
  expiringCount: number;
  trackedProducts: number;
  totalLots: number;
  upcoming: ExpiryLot[];
}

export interface RetailOpenOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  date: string;
}

const localDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Generic workspace data for retail activities that do not have a dedicated
 * vertical page (sanitary, furniture, food, electronics, ...). Everything is
 * scoped to the current branch/company like the other domain services.
 */
export class RetailWorkspaceService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private requireView() {
    ModuleRegistryService.assertModuleEnabled('sales');
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'sales.view');
    return actor;
  }

  private invoiceScope(alias = 'si') {
    const scope = this.branchAccess.sqlScope(
      `${alias}.branch_id`,
      `(SELECT bw.branch_id FROM branch_warehouses bw JOIN warehouses w2 ON w2.id = bw.warehouse_id WHERE bw.is_primary = 1)`
    );
    const company = this.branchAccess.companyScopeViaBranch(`${alias}.branch_id`);
    return {
      clause: `${scope.clause} AND ${company.clause}`,
      params: [...scope.params, ...company.params],
    };
  }

  private orderScope(alias = 'o') {
    const branchExpr = `COALESCE(${alias}.branch_id, (SELECT w2.branch_id FROM warehouses w2 WHERE w2.id = ${alias}.warehouse_id))`;
    const scope = this.branchAccess.sqlScope(branchExpr);
    const company = this.branchAccess.companyScopeViaBranch(branchExpr);
    return {
      clause: `${scope.clause} AND ${company.clause}`,
      params: [...scope.params, ...company.params],
    };
  }

  public getStats(): RetailWorkspaceStats {
    this.requireView();
    const scope = this.invoiceScope();
    const today = localDateString();
    const monthStart = `${today.slice(0, 7)}-01`;

    const sales = (from: string) => Number(this.db.query<any>(
      `SELECT COALESCE(SUM(si.total_amount),0) / 100.0 AS total
       FROM sales_invoices si
       WHERE si.date >= ? AND si.invoice_status != 'VOID' AND ${scope.clause}`,
      [from, ...scope.params]
    )[0]?.total ?? 0);

    const lowStock = Number(this.db.query<any>(
      `SELECT COUNT(*) AS c FROM products p
       WHERE p.is_active = 1 AND COALESCE(p.min_stock_level,0) > 0
         AND COALESCE((SELECT SUM(ws.quantity_m2) FROM warehouse_stock ws WHERE ws.product_id = p.id),0) < p.min_stock_level`
    )[0]?.c ?? 0);

    const quoteScope = this.branchAccess.sqlScope('branch_id');
    const quoteCompany = this.branchAccess.companyScope('company_id');
    const quotes = this.db.query<any>(
      `SELECT COUNT(*) AS open FROM quotations
       WHERE status = 'PENDING' AND ${quoteScope.clause} AND ${quoteCompany.clause}`,
      [...quoteScope.params, ...quoteCompany.params]
    )[0];

    const orderScope = this.orderScope();
    const orders = this.db.query<any>(
      `SELECT COUNT(*) AS c FROM orders o WHERE o.status NOT IN ('COMPLETED','CANCELLED') AND ${orderScope.clause}`,
      orderScope.params
    )[0];

    return {
      todaySales: round2(sales(today)),
      monthSales: round2(sales(monthStart)),
      lowStockCount: Number(lowStock),
      openQuotes: Number(quotes?.open ?? 0),
      openOrders: Number(orders?.c ?? 0),
    };
  }

  public getTopProducts(days = 30, limit = 6): RetailTopProduct[] {
    this.requireView();
    const scope = this.invoiceScope();
    return this.db.query<any>(
      `SELECT p.id AS productId, p.name, p.sku,
              ROUND(SUM(sii.quantity_m2), 2) AS totalQty,
              ROUND(SUM(sii.total_price) / 100.0, 2) AS totalAmount,
              COUNT(DISTINCT sii.invoice_id) AS invoices
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       JOIN products p ON p.id = sii.product_id
       WHERE si.invoice_status = 'COMPLETED' AND si.date >= date('now', ?)
         AND ${scope.clause}
       GROUP BY p.id
       ORDER BY totalQty DESC
       LIMIT ?`,
      [`-${Math.max(1, days)} days`, ...scope.params, limit]
    ).map((r) => ({
      ...r,
      totalQty: round2(r.totalQty), totalAmount: round2(r.totalAmount), invoices: Number(r.invoices),
    }));
  }

  public getLowStockRows(limit = 8): RetailLowStockRow[] {
    this.requireView();
    return this.db.query<any>(
      `SELECT p.id AS productId, p.name, p.sku,
              COALESCE(SUM(ws.quantity_m2),0) AS stockQty,
              p.min_stock_level AS minStockLevel
       FROM products p
       LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
       WHERE p.is_active = 1 AND COALESCE(p.min_stock_level,0) > 0
       GROUP BY p.id
       HAVING stockQty < p.min_stock_level
       ORDER BY stockQty ASC
       LIMIT ?`,
      [limit]
    ).map((r) => ({ ...r, stockQty: round2(r.stockQty), minStockLevel: round2(r.minStockLevel) }));
  }

  public getExpirySummary(): RetailExpirySummary | null {
    this.requireView();
    try {
      const expiry = new ExpiryService();
      const stats = expiry.getDashboardStats();
      return {
        expiredCount: stats.expiredCount,
        expiringCount: stats.expiringCount,
        trackedProducts: stats.trackedProducts,
        totalLots: stats.totalLots,
        upcoming: expiry.getLots({ status: 'expiring' }).slice(0, 5),
      };
    } catch {
      return null;
    }
  }

  public getWarrantyStats(): WarrantyClaimsStats | null {
    this.requireView();
    try {
      return new WarrantyClaimService().stats();
    } catch {
      return null;
    }
  }

  public getOpenOrders(limit = 6): RetailOpenOrder[] {
    this.requireView();
    const scope = this.orderScope();
    return this.db.query<any>(
      `SELECT o.id, o.order_number AS orderNumber, c.name AS customerName,
              o.status, o.date
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.status NOT IN ('COMPLETED','CANCELLED')
         AND ${scope.clause}
       ORDER BY o.date DESC
       LIMIT ?`,
      [...scope.params, limit]
    );
  }
}
