import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, daysBetween } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function InventoryReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class InventoryReports extends Base {
  public async inventoryBalances(): Promise<ReportResult> {
    const scope = this.tableScope(
      'br.id',
      'w.id',
    );
    const rows = await this.db.queryAsync<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product, c.name AS category,
        w.name AS warehouse, ws.quantity_m2 AS quantity, ws.reserved_m2 AS reserved,
        (ws.quantity_m2 - ws.reserved_m2) AS available,
        COALESCE(p.cost_price, 0) / 100.0 AS unitCost,
        (ws.quantity_m2 * COALESCE(p.cost_price, 0)) / 100.0 AS stockValue,
        (ws.quantity_m2 * COALESCE(p.selling_price_m2, 0)) / 100.0 AS retailValue,
        COALESCE(p.min_stock_level, 0) AS minLevel
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN warehouses w ON w.id = ws.warehouse_id
      LEFT JOIN branches br ON br.id = w.branch_id
      WHERE p.is_active = 1 AND ws.quantity_m2 > 0 AND ${scope.clause}
      ORDER BY stockValue DESC
    `, scope.params);
    const result = rows.map((row) => ({
      ...row,
      quantity: round2(num(row.quantity)),
      reserved: round2(num(row.reserved)),
      available: round2(num(row.available)),
      stockValue: round2(num(row.stockValue)),
      retailValue: round2(num(row.retailValue)),
      status: num(row.available) <= num(row.minLevel) ? 'تحت حد الطلب' : 'متاح',
    }));
    return {
      kpis: [
        { label: 'قيمة المخزون بالتكلفة', value: round2(result.reduce((total, row) => total + row.stockValue, 0)), tone: 'success' },
        { label: 'القيمة البيعية', value: round2(result.reduce((total, row) => total + row.retailValue, 0)), tone: 'info' },
        { label: 'أصناف تحت الحد', value: result.filter((row) => row.status !== 'متاح').length, tone: 'danger' },
        { label: 'إجمالي الكمية', value: round2(result.reduce((total, row) => total + row.quantity, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'quantity', label: 'الرصيد (م²)', type: 'qty' },
        { key: 'reserved', label: 'المحجوز', type: 'qty' },
        { key: 'available', label: 'المتاح', type: 'qty' },
        { key: 'unitCost', label: 'تكلفة الوحدة', type: 'currency' },
        { key: 'stockValue', label: 'قيمة المخزون', type: 'currency' },
        { key: 'minLevel', label: 'حد الطلب', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }
  public async slowMoving({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const stockScope = this.tableScope('w.branch_id');
    const days = Math.max(1, daysBetween(from, to));
    const rows = await this.db.queryAsync<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product,
        w.name AS warehouse, ws.quantity_m2 AS quantity,
        (ws.quantity_m2 * COALESCE(p.cost_price, 0)) / 100.0 AS stockValue,
        COALESCE((
          SELECT MAX(si.date) FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.invoice_status != 'VOID' AND ${scope.clause}
        ), '') AS lastSaleDate,
        COALESCE((
          SELECT SUM(sii.quantity_m2) FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.product_id = p.id AND si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
        ), 0) AS soldInPeriod
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.quantity_m2 > 0 AND p.is_active = 1 AND ${stockScope.clause}
      ORDER BY stockValue DESC
    `, [...scope.params, from, to, ...scope.params, ...stockScope.params]);
    const result = rows.map((row) => {
      const quantity = num(row.quantity);
      const sold = num(row.soldInPeriod);
      const daily = sold / days;
      const coverage = daily > 0 ? Math.round(quantity / daily) : null;
      const lastSale = row.lastSaleDate || '';
      const daysSinceLast = lastSale ? daysBetween(lastSale, to) : null;
      return {
        sku: row.sku,
        product: row.product,
        warehouse: row.warehouse,
        quantity: round2(quantity),
        stockValue: round2(num(row.stockValue)),
        lastSaleDate: lastSale,
        daysSinceLast,
        coverage,
        status: daily === 0 ? 'راكد' : coverage !== null && coverage > 120 ? 'بطيء' : 'نشط',
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
  };
}
