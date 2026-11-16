import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { round2 } from '../finance/financials';
import { ReportCacheService, ReportResult, ReportParams } from './ReportCacheService';

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export class InventoryReportsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view', '/reports');
    return actor;
  }

  private stockScope() {
    return this.branchAccess.sqlScope(
      'ws.warehouse_id',
      undefined,
      this.actor(),
    );
  }

  private tableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor());
  }

  public slowMovingStock({ from, to }: ReportParams): ReportResult {
    const days = Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
    const scope = this.stockScope();
    const rows = this.db.query<any>(`
      SELECT ws.product_id AS productId, p.name AS product, p.sku AS sku,
        w.name AS warehouse, ws.quantity_m2 AS quantity,
        COALESCE(p.cost_price, 0) * ws.quantity_m2 AS stockValue,
        (SELECT MAX(si.date) FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID') AS lastSaleDate,
        (SELECT SUM(sii.quantity_m2) FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID') AS soldInPeriod
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.quantity_m2 > 0 AND p.is_active = 1 AND ${scope.clause}
      ORDER BY stockValue DESC
    `, [from, to, from, to, ...scope.params]);
    const result = rows.map((row) => {
      const quantity = num(row.quantity);
      const sold = num(row.soldInPeriod);
      const daily = sold / days;
      const coverage = daily > 0 ? Math.round(quantity / daily) : null;
      const lastSale = row.lastSaleDate || '';
      const status = daily === 0 ? 'راكد' : coverage !== null && coverage > 120 ? 'بطيء' : 'نشط';
      return {
        sku: row.sku,
        product: row.product,
        warehouse: row.warehouse,
        quantity: round2(quantity),
        stockValue: round2(num(row.stockValue)),
        lastSaleDate: lastSale,
        daysSinceLast: lastSale ? Math.round((new Date(to).getTime() - new Date(lastSale).getTime()) / 86_400_000) : null,
        coverage,
        status,
      };
    }).sort((a, b) => b.stockValue - a.stockValue);
    return {
      kpis: [
        { label: 'قيمة المخزون البطيء', value: round2(result.filter((row) => row.status !== 'نشط').reduce((total, row) => total + row.stockValue, 0)), tone: 'danger' },
        { label: 'أصناف راكدة', value: result.filter((row) => row.status === 'راكد').length, tone: 'danger' },
        { label: 'أصناف بطيئة', value: result.filter((row) => row.status === 'بطيء').length, tone: 'warning' },
        { label: 'رأس المال المعرض', value: round2(result.reduce((total, row) => total + row.stockValue, 0)), tone: 'info' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'quantity', label: 'الرصيد', type: 'qty' },
        { key: 'stockValue', label: 'قيمة الرصيد', type: 'currency' },
        { key: 'lastSaleDate', label: 'آخر بيع', type: 'date' },
        { key: 'daysSinceLast', label: 'أيام منذ آخر بيع', type: 'number' },
        { key: 'coverage', label: 'أيام التغطية', type: 'number' },
        { key: 'status', label: 'التصنيف', type: 'badge' },
      ],
      rows: result,
    };
  }
}