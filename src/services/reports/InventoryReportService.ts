import { DatabaseManager } from '../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { InventoryValuationService, type InventoryKpi } from '../inventory/InventoryValuationService';
import { PermissionService } from '../auth/PermissionService';

export interface PurchaseKpi {
  totalPurchases: number;
  totalInvoices: number;
  totalPaid: number;
  totalDue: number;
  topSuppliers: { name: string; total: number; count: number }[];
  topCategories: { category: string; total: number; qty: number; productType: 'CERAMIC' | 'GENERAL'; baseUnit: string; customUnit?: string }[];
  returnsTotal: number;
  returnsCount: number;
}

export function loadPurchaseKpi(from: string, to: string): PurchaseKpi {
  const actor = AuthService.requireAuth();
  PermissionService.requireAny(actor, ['ui.reports.purchases.view', 'ui.purchases.invoices.view']);
  const db = DatabaseManager.getInstance();
  const branchAccess = new BranchAccessService();
  const purchaseScope = branchAccess.sqlScope(
    'pi.branch_id',
    '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)'
  );
  const returnScope = branchAccess.sqlScope(
    'pi.branch_id',
    '(SELECT w.branch_id FROM warehouses w WHERE w.id = pr.warehouse_id)'
  );
  const base = `pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}`;
  const params = [from, to, ...purchaseScope.params];

  const summary = db.query<any>(`
    SELECT
      COALESCE(SUM(pi.total_amount), 0) AS total,
      COUNT(*) AS count,
      COALESCE(SUM(pi.paid_amount), 0) AS paid
    FROM purchase_invoices pi WHERE ${base}
  `, params)[0] || {};

  const topSuppliers = db.query<any>(`
    SELECT s.name, COALESCE(SUM(pi.total_amount), 0) AS total, COUNT(*) AS count
    FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
    WHERE ${base} GROUP BY s.id ORDER BY total DESC LIMIT 8
  `, params).map((row) => ({ name: row.name, total: Number(row.total), count: Number(row.count) }));

  const topCategories = db.query<any>(`
    SELECT COALESCE(c.name, 'غير مصنف') AS category,
      COALESCE(SUM(pii.unit_cost * pii.quantity_m2), 0) AS total,
      COALESCE(SUM(pii.quantity_m2), 0) AS qty,
      p.product_type AS productType, p.base_unit AS baseUnit, p.custom_unit AS customUnit
    FROM purchase_invoices pi
    JOIN purchase_invoice_items pii ON pii.purchase_id = pi.id
    JOIN products p ON p.id = pii.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${base} GROUP BY c.id, p.product_type, p.base_unit, p.custom_unit ORDER BY total DESC LIMIT 8
  `, params).map((row) => ({
    category: row.category,
    total: Number(row.total),
    qty: Number(row.qty),
    productType: row.productType,
    baseUnit: row.baseUnit,
    customUnit: row.customUnit,
  }));

  const returnsSummary = db.query<any>(`
    SELECT COALESCE(SUM(pr.total_amount), 0) AS total, COUNT(*) AS count
    FROM purchase_returns pr
    LEFT JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
    WHERE pr.created_at >= ? AND pr.created_at <= ? AND ${returnScope.clause}
  `, [from + 'T00:00:00', to + 'T23:59:59', ...returnScope.params])[0] || {};

  return {
    totalPurchases: Number(summary.total || 0),
    totalInvoices: Number(summary.count || 0),
    totalPaid: Number(summary.paid || 0),
    totalDue: Number(summary.total || 0) - Number(summary.paid || 0),
    topSuppliers,
    topCategories,
    returnsTotal: Number(returnsSummary.total || 0),
    returnsCount: Number(returnsSummary.count || 0),
  };
}

export function loadInventoryKpi(): InventoryKpi {
  return new InventoryValuationService().getKpi('ui.reports.inventory.view');
}
