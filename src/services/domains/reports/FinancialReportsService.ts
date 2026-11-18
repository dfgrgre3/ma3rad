import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';
import { ReportCacheService, ReportResult, ReportParams, ReportKpi, ReportColumn } from './ReportCacheService';

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sum = (rows: Array<Record<string, any>>, key: string): number =>
  round2(rows.reduce((total, row) => total + num(row[key]), 0));

export class FinancialReportsService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  private actor() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'reports.view', '/reports');
    return actor;
  }

  private salesScope() {
    return this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      this.actor(),
    );
  }

  private purchaseScope() {
    return this.branchAccess.sqlScope(
      'pi.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = pi.warehouse_id)',
      this.actor(),
    );
  }

  private allBranchesTableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor(), true);
  }

  private tableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor());
  }

  public cashMovement({ from, to, registerId }: ReportParams): ReportResult {
    const sales = this.salesScope();
    const purchases = this.purchaseScope();
    const registerScope = registerId
      ? { clause: 'cp.register_id = ?', params: [registerId] }
      : this.allBranchesTableScope('cr.branch_id', '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)');
    const registerListScope = registerId
      ? { clause: 'id = ?', params: [registerId] }
      : this.allBranchesTableScope('branch_id');
    const paymentRows = this.db.query<any>(`
      SELECT date, cp.created_at AS createdAt, 'وارد' AS direction, 'سند قبض' AS source, receipt_number AS document,
        c.name AS party, amount / 100.0 AS amount, cp.register_id AS registerId
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN cash_registers cr ON cr.id = cp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}

      UNION ALL
      SELECT date, sp.created_at, 'منصرف', 'سند صرف', receipt_number, s.name, amount / 100.0, sp.register_id
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN cash_registers cr ON cr.id = sp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}

      UNION ALL
      SELECT date, ex.created_at, 'منصرف', 'مصروف', COALESCE(recipient, description), description, amount / 100.0, ex.register_id
      FROM expenses ex
      LEFT JOIN cash_registers cr ON cr.id = ex.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}
    `, [
      from, to, ...registerScope.params,
      from, to, ...registerScope.params,
      from, to, ...registerScope.params,
    ]);
    const invoiceRows = this.db.query<any>(`
      SELECT date, si.created_at AS createdAt, 'وارد' AS direction, 'تحصيل فاتورة' AS source,
        invoice_number AS document, c.name AS party, paid_amount / 100.0 AS amount, NULL AS registerId
      FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id
      WHERE date >= ? AND date <= ? AND paid_amount > 1 AND invoice_status != 'VOID' AND ${sales.clause}

      UNION ALL
      SELECT date, pi.created_at, 'منصرف', 'سداد فاتورة شراء', invoice_number, s.name, paid_amount / 100.0, NULL
      FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id
      WHERE date >= ? AND date <= ? AND paid_amount > 1 AND ${purchases.clause}
    `, [from, to, ...sales.params, from, to, ...purchases.params]);
    const rows = [...paymentRows, ...(registerId ? [] : invoiceRows)]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let running = 0;
    const result = rows.map((row) => {
      const amount = round2(num(row.amount));
      running = round2(running + (row.direction === 'وارد' ? amount : -amount));
      return { ...row, amount, balance: running };
    });
    const inflow = round2(result.filter((row) => row.direction === 'وارد').reduce((total, row) => total + row.amount, 0));
    const outflow = round2(result.filter((row) => row.direction === 'منصرف').reduce((total, row) => total + row.amount, 0));
    const registerList = this.db.query<any>(`SELECT id, name, current_balance / 100.0 AS balance FROM cash_registers WHERE ${registerListScope.clause} ORDER BY name`, registerListScope.params);
    return {
      kpis: [
        { label: 'إجمالي الورود', value: inflow, tone: 'success' },
        { label: 'إجمالي الصرف', value: outflow, tone: 'danger' },
        { label: 'صافي التدفق', value: round2(inflow - outflow), tone: inflow >= outflow ? 'success' : 'warning' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'source', label: 'المصدر' },
        { key: 'document', label: 'المستند' },
        { key: 'party', label: 'الطرف' },
        { key: 'direction', label: 'الاتجاه', type: 'badge' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'balance', label: 'الرصيد المتراكم', type: 'currency' },
      ],
      rows: result,
    };
  }

  public profitLoss({ from, to }: ReportParams): ReportResult {
    const sales = this.salesScope();
    const purchases = this.purchaseScope();
    const salesRows = this.db.query<any>(`
      SELECT SUM(si.total_amount) / 100.0 AS totalSales, SUM(si.paid_amount) / 100.0 AS collectedSales
      FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${sales.clause}
    `, [from, to, ...sales.params]);
    const purchaseRows = this.db.query<any>(`
      SELECT SUM(pi.total_amount) / 100.0 AS totalPurchases, SUM(pi.paid_amount) / 100.0 AS paidPurchases
      FROM purchase_invoices pi
      WHERE pi.date >= ? AND pi.date <= ? AND ${purchases.clause}
    `, [from, to, ...purchases.params]);
    const totalSales = num(salesRows[0]?.totalSales) || 0;
    const totalPurchases = num(purchaseRows[0]?.totalPurchases) || 0;
    const grossProfit = round2(totalSales - totalPurchases);
    return {
      kpis: [
        { label: 'إجمالي المبيعات', value: round2(totalSales), tone: 'success' },
        { label: 'إجمالي المشتريات', value: round2(totalPurchases), tone: 'warning' },
        { label: 'الربح الإجمالي', value: grossProfit, tone: grossProfit >= 0 ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'metric', label: 'المؤشر' },
        { key: 'value', label: 'القيمة', type: 'currency' },
      ],
      rows: [
        { metric: 'إجمالي المبيعات', value: round2(totalSales) },
        { metric: 'إجمالي المشتريات', value: round2(totalPurchases) },
        { metric: 'الربح الإجمالي', value: grossProfit },
      ],
    };
  }

  public balanceSheet({ to }: ReportParams): ReportResult {
    const scope = this.tableScope('b.branch_id');
    const rows = this.db.query<any>(`
      SELECT 'أصول' AS category, 'الأصول المتداولة' AS subCategory,
        SUM(COALESCE(cr.current_balance, 0)) / 100.0 AS amount
      FROM cash_registers cr
      WHERE 1=1 AND ${scope.clause}

      UNION ALL

      SELECT 'أصول' AS category, 'ذمم مدينة' AS subCategory,
        SUM(COALESCE(c.current_balance, 0)) / 100.0 AS amount
      FROM customers c
      WHERE 1=1 AND ${scope.clause}

      UNION ALL

      SELECT 'خصوم' AS category, 'ذمم دائنة' AS subCategory,
        SUM(COALESCE(s.current_balance, 0)) / 100.0 AS amount
      FROM suppliers s
      WHERE 1=1 AND ${scope.clause}
    `, [...scope.params]);
    return {
      kpis: [
        { label: 'إجمالي الأصول', value: round2(sum(rows.filter(r => r.category === 'أصول'), 'amount')), tone: 'info' },
        { label: 'إجمالي الخصوم', value: round2(sum(rows.filter(r => r.category === 'خصوم'), 'amount')), tone: 'warning' },
      ],
      columns: [
        { key: 'category', label: 'الفئة' },
        { key: 'subCategory', label: 'الفئة الفرعية' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
      ],
      rows,
    };
  }
}