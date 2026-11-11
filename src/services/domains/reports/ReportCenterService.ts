import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { BranchAccessService } from '../auth/BranchAccessService';
import { FinancialStatementsService } from './FinancialStatementsService';
import { localDateString } from '../../../utils/shared/date';
import { round2 } from '../finance/financials';

export type ReportValueType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge' | 'qty';
export type ReportTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export interface ReportColumn {
  key: string;
  label: string;
  type?: ReportValueType;
  align?: 'start' | 'center' | 'end';
}

export interface ReportKpi {
  label: string;
  value: number | string;
  hint?: string;
  tone?: ReportTone;
}

export interface ReportResult {
  kpis: ReportKpi[];
  columns: ReportColumn[];
  rows: Array<Record<string, any>>;
  notes?: string[];
}

export interface ReportParams {
  from: string;
  to: string;
  productId?: string;
  userId?: string;
  registerId?: string;
  branchId?: string;
  warehouseId?: string;
  customerId?: string;
  supplierId?: string;
  employeeId?: string;
  status?: string;
  paymentMethod?: string;
  compareBranchId?: string;
  dimension?: string;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sum = (rows: Array<Record<string, any>>, key: string): number =>
  round2(rows.reduce((total, row) => total + num(row[key]), 0));

const classifyExpense = (category?: string | null, description?: string | null): 'fixed' | 'variable' | 'semi' => {
  const haystack = `${category || ''} ${description || ''}`.toLowerCase();
  const fixedTerms = ['راتب', 'رواتب', 'أجرة', 'إيجار', 'مكتب', 'إدارة', 'مصاريف ثابت', 'تأمين', 'اتصالات', 'مياه', 'كهرباء', 'ضرائب', 'اشتراك', 'مزايا'];
  const variableTerms = ['شحن', 'توصيل', 'حمل', 'موزع', 'عمولة', 'مناولة', 'مستلزمات', 'مواد', 'تعبئة', 'تغليف', 'برد', 'خدمة حسب', 'مبيعات', 'مستلزمات'];
  if (fixedTerms.some((term) => haystack.includes(term))) return 'fixed';
  if (variableTerms.some((term) => haystack.includes(term))) return 'variable';
  if (/(صيانة|نقل|موبايل|مرفق|طاقة|خدمة)/.test(haystack)) return 'semi';
  return 'fixed';
};

const formatComparisonValue = (value: number, type: 'currency' | 'number' | 'percent'): string => {
  if (type === 'currency') return `${round2(value)} ج`;
  if (type === 'percent') return `${round2(value)}%`;
  return `${Math.round(value)}`;
};

const daysBetween = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
};

const shiftDate = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return localDateString(value);
};

const previousRange = (from: string, to: string): { from: string; to: string } => {
  const length = Math.max(1, daysBetween(from, to) + 1);
  const previousTo = shiftDate(from, -1);
  return { from: shiftDate(previousTo, -(length - 1)), to: previousTo };
};

interface CacheEntry {
  expiresAt: number;
  result: ReportResult;
}
const reportCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

const normalizeReportFilterValue = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const rowPropertyVariants = (key: string): string[] => {
  const variants = new Set<string>([
    key,
    key.toLowerCase(),
    key.replace(/([A-Z])/g, '_$1').toLowerCase(),
    key.replace(/Id$/i, '_id'),
    key.replace(/_id$/i, 'Id'),
    key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
    key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase(),
  ]);

  switch (key) {
    case 'branchId':
      variants.add('branch_id'); variants.add('branch'); variants.add('branchName'); variants.add('branch_name'); break;
    case 'warehouseId':
      variants.add('warehouse_id'); variants.add('warehouse'); variants.add('warehouseName'); variants.add('warehouse_name'); break;
    case 'registerId':
      variants.add('register_id'); variants.add('cash_register_id'); variants.add('register'); variants.add('cashRegisterId'); break;
    case 'customerId':
      variants.add('customer_id'); variants.add('customer'); variants.add('client_id'); variants.add('client'); variants.add('customerName'); break;
    case 'supplierId':
      variants.add('supplier_id'); variants.add('vendor_id'); variants.add('supplier'); variants.add('vendor'); break;
    case 'employeeId':
      variants.add('employee_id'); variants.add('user_id'); variants.add('userId'); variants.add('rep_id'); variants.add('sales_rep_id'); variants.add('created_by'); break;
    case 'status':
      variants.add('invoice_status'); variants.add('payment_status'); variants.add('state'); variants.add('doc_status'); break;
    case 'paymentMethod':
      variants.add('payment_method'); variants.add('means_of_payment'); variants.add('method'); variants.add('payment'); break;
    case 'compareBranchId':
      variants.add('compare_branch_id'); variants.add('compareBranch'); variants.add('compare_branch'); break;
    default:
      break;
  }

  return Array.from(variants);
};

/**
 * Read-only data source for the report center. Every method is branch scoped
 * through BranchAccessService and enforces the reports.view permission.
 */
export class ReportCenterService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();

  public static clearCache(): void {
    reportCache.clear();
  }

  private withCache(key: string, compute: () => ReportResult): ReportResult {
    const now = Date.now();
    const hit = reportCache.get(key);
    if (hit && hit.expiresAt > now) return hit.result;
    const result = compute();
    reportCache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
    return result;
  }

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

  private allBranchesScope() {
    return this.branchAccess.sqlScope(
      'si.branch_id',
      '(SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id)',
      this.actor(),
      true,
    );
  }

  private allBranchesTableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor(), true);
  }

  private cachePartition(actor: ReturnType<typeof AuthService.requireAuth>): string {
    const allowedBranches = this.branchAccess.getAccessibleBranchIds(actor);
    const branchScope = allowedBranches === null ? '*' : [...allowedBranches].sort().join(',');
    const activeBranch = this.branchAccess.getCurrentBranchId(actor);
    const companyId = this.branchAccess.companyScope('company_id', actor).params[0] || '';
    return `${actor.id}:${activeBranch}:${companyId}:${branchScope}`;
  }

  private tableScope(expression: string, fallback?: string) {
    return this.branchAccess.sqlScope(expression, fallback, this.actor());
  }

  private withAdvancedQueryScope(
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

  // ── Operations & audit ────────────────────────────────────────────────────

  public operationsLog({ from, to }: ReportParams): ReportResult {
    const sales = this.salesScope();
    const purchases = this.purchaseScope();
    const cash = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)',
      undefined,
      this.actor(),
    );
    const supply = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = sp.register_id)',
      undefined,
      this.actor(),
    );
    const expense = this.branchAccess.sqlScope(
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = ex.register_id)',
      undefined,
      this.actor(),
    );

    const rows = this.db.query<any>(`
      SELECT si.date AS date, si.created_at AS createdAt, 'فاتورة بيع' AS docType,
        si.invoice_number AS docNumber, c.name AS party, si.total_amount AS amount,
        COALESCE(u.full_name, '—') AS userName, si.invoice_status AS status
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN users u ON u.id = si.created_by
      WHERE si.date >= ? AND si.date <= ? AND ${sales.clause}

      UNION ALL
      SELECT pi.date, pi.created_at, 'فاتورة شراء', pi.invoice_number, s.name, pi.total_amount,
        COALESCE(u.full_name, '—'), pi.payment_status
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      LEFT JOIN users u ON u.id = pi.created_by
      WHERE pi.date >= ? AND pi.date <= ? AND ${purchases.clause}

      UNION ALL
      SELECT sr.date, sr.created_at, 'مرتجع بيع', sr.return_number, c.name, sr.total_amount,
        COALESCE(u.full_name, '—'), 'COMPLETED'
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.date >= ? AND sr.date <= ? AND ${sales.clause}

      UNION ALL
      SELECT pr.date, pr.created_at, 'مرتجع شراء', pr.return_number, s.name, pr.total_amount,
        COALESCE(u.full_name, '—'), 'COMPLETED'
      FROM purchase_returns pr
      JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE pr.date >= ? AND pr.date <= ? AND ${purchases.clause}

      UNION ALL
      SELECT cp.date, cp.created_at, 'سند قبض', cp.receipt_number, c.name, cp.amount,
        COALESCE(u.full_name, '—'), 'POSTED'
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN users u ON u.id = cp.performed_by
      WHERE cp.date >= ? AND cp.date <= ? AND ${cash.clause}

      UNION ALL
      SELECT sp.date, sp.created_at, 'سند صرف', sp.receipt_number, s.name, sp.amount,
        COALESCE(u.full_name, '—'), 'POSTED'
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN users u ON u.id = sp.performed_by
      WHERE sp.date >= ? AND sp.date <= ? AND ${supply.clause}

      UNION ALL
      SELECT ex.date, ex.created_at, 'مصروف', COALESCE(ex.recipient, ex.description), ex.description, ex.amount,
        COALESCE(u.full_name, '—'), ex.payment_type
      FROM expenses ex
      LEFT JOIN users u ON u.id = ex.performed_by
      WHERE ex.date >= ? AND ex.date <= ? AND ${expense.clause}

      ORDER BY date DESC, createdAt DESC
    `, [
      from, to, ...sales.params,
      from, to, ...purchases.params,
      from, to, ...sales.params,
      from, to, ...purchases.params,
      from, to, ...cash.params,
      from, to, ...supply.params,
      from, to, ...expense.params,
    ]);

    const byType = rows.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
      const bucket = acc[row.docType] || { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += num(row.amount);
      acc[row.docType] = bucket;
      return acc;
    }, {});

    return {
      kpis: [
        { label: 'إجمالي الحركات', value: rows.length, hint: 'فاتورة وسند ومصروف', tone: 'info' },
        { label: 'فواتير البيع', value: byType['فاتورة بيع']?.count || 0, hint: fmtMoney(byType['فاتورة بيع']?.total), tone: 'success' },
        { label: 'فواتير الشراء', value: byType['فاتورة شراء']?.count || 0, hint: fmtMoney(byType['فاتورة شراء']?.total), tone: 'warning' },
        { label: 'سندات القبض', value: byType['سند قبض']?.count || 0, hint: fmtMoney(byType['سند قبض']?.total), tone: 'success' },
        { label: 'سندات الصرف والمصروفات', value: (byType['سند صرف']?.count || 0) + (byType['مصروف']?.count || 0), hint: fmtMoney((byType['سند صرف']?.total || 0) + (byType['مصروف']?.total || 0)), tone: 'danger' },
        { label: 'المرتجعات', value: (byType['مرتجع بيع']?.count || 0) + (byType['مرتجع شراء']?.count || 0), hint: fmtMoney((byType['مرتجع بيع']?.total || 0) + (byType['مرتجع شراء']?.total || 0)), tone: 'warning' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'createdAt', label: 'الوقت', type: 'text' },
        { key: 'docType', label: 'نوع الحركة', type: 'badge' },
        { key: 'docNumber', label: 'رقم المستند' },
        { key: 'party', label: 'الطرف الآخر' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'userName', label: 'المستخدم' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows,
    };
  }

  public userActivity({ from, to }: ReportParams): ReportResult {
    const log = this.operationsLog({ from, to });
    const grouped = new Map<string, { userName: string; types: Record<string, number>; total: number; count: number }>();
    for (const row of log.rows) {
      const key = String(row.userName || '—');
      const entry = grouped.get(key) || { userName: key, types: {}, total: 0, count: 0 };
      entry.types[row.docType] = (entry.types[row.docType] || 0) + 1;
      entry.total += num(row.amount);
      entry.count += 1;
      grouped.set(key, entry);
    }
    const rows = Array.from(grouped.values())
      .map((entry) => ({
        userName: entry.userName,
        invoices: entry.types['فاتورة بيع'] || 0,
        purchases: entry.types['فاتورة شراء'] || 0,
        receipts: entry.types['سند قبض'] || 0,
        payments: entry.types['سند صرف'] || 0,
        expenses: entry.types['مصروف'] || 0,
        returns: (entry.types['مرتجع بيع'] || 0) + (entry.types['مرتجع شراء'] || 0),
        count: entry.count,
        total: round2(entry.total),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      kpis: [
        { label: 'عدد المستخدمين', value: rows.length, tone: 'info' },
        { label: 'إجمالي الحركات', value: log.rows.length, tone: 'neutral' },
        { label: 'أكثر مستخدم نشاطًا', value: rows[0]?.userName || '—', hint: `${rows[0]?.count || 0} حركة`, tone: 'success' },
      ],
      columns: [
        { key: 'userName', label: 'المستخدم' },
        { key: 'invoices', label: 'فواتير بيع', type: 'number' },
        { key: 'purchases', label: 'فواتير شراء', type: 'number' },
        { key: 'receipts', label: 'سندات قبض', type: 'number' },
        { key: 'payments', label: 'سندات صرف', type: 'number' },
        { key: 'expenses', label: 'مصروفات', type: 'number' },
        { key: 'returns', label: 'مرتجعات', type: 'number' },
        { key: 'count', label: 'إجمالي الحركات', type: 'number' },
        { key: 'total', label: 'إجمالي القيمة', type: 'currency' },
      ],
      rows,
    };
  }

  public dailyMovements({ from, to }: ReportParams): ReportResult {
    const log = this.operationsLog({ from, to });
    const grouped = new Map<string, { date: string; userName: string; docType: string; count: number; total: number }>();
    for (const row of log.rows) {
      const key = `${row.date}|${row.userName}|${row.docType}`;
      const entry = grouped.get(key) || { date: row.date, userName: row.userName, docType: row.docType, count: 0, total: 0 };
      entry.count += 1;
      entry.total += num(row.amount);
      grouped.set(key, entry);
    }
    const rows = Array.from(grouped.values())
      .map((row) => ({ ...row, total: round2(row.total) }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.count - a.count);

    return {
      kpis: [
        { label: 'أيام بها حركة', value: new Set(rows.map((row) => row.date)).size, tone: 'info' },
        { label: 'إجمالي الحركات', value: log.rows.length, tone: 'neutral' },
        { label: 'قيمة الحركة', value: round2(rows.reduce((total, row) => total + row.total, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'userName', label: 'المستخدم' },
        { key: 'docType', label: 'نوع الحركة', type: 'badge' },
        { key: 'count', label: 'عدد الحركات', type: 'number' },
        { key: 'total', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['استخدم البحث أو الفرز لتصفية التقرير حسب التاريخ أو المستخدم أو نوع الحركة.'],
    };
  }

  // ── Sales analytics ───────────────────────────────────────────────────────

  private salesActivityRows(from: string, to: string) {
    const scope = this.salesScope();
    return this.db.query<any>(`
      SELECT si.date, si.customer_id AS customerId, c.name AS customerName,
        COALESCE(e.full_name, u.full_name, 'بدون مندوب') AS repName,
        COALESCE(w.name, 'بدون مخزن') AS warehouseName,
        sii.product_id AS productId, p.name AS productName,
        sii.quantity_m2 AS quantity, sii.total_price AS revenue, sii.total_cost AS cost,
        sii.discount_amount AS lineDiscount, 0 AS isReturn
      FROM sales_invoices si
      JOIN sales_invoice_items sii ON sii.invoice_id = si.id
      JOIN products p ON p.id = sii.product_id
      LEFT JOIN customers c ON c.id = si.customer_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN orders o ON o.invoice_id = si.id
      LEFT JOIN employees e ON e.id = o.sales_rep_id
      LEFT JOIN users u ON u.id = si.created_by
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}

      UNION ALL

      SELECT sr.date, sr.customer_id, c.name,
        COALESCE(u.full_name, 'بدون مندوب'),
        COALESCE(w.name, 'بدون مخزن'),
        sri.product_id, p.name, -sri.quantity_m2, -sri.total_refund, -(sri.quantity_m2 * sri.unit_cost),
        0, 1
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      JOIN sales_return_items sri ON sri.return_id = sr.id
      JOIN products p ON p.id = sri.product_id
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN warehouses w ON w.id = si.warehouse_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params, from, to, ...scope.params]);
  }

  public salesAnalysis(params: ReportParams): ReportResult {
    const dimension = params.dimension || 'warehouse';
    const rows = this.salesActivityRows(params.from, params.to);
    const keyOf = (row: any): string => {
      if (dimension === 'customer') return row.customerName || 'بدون عميل';
      if (dimension === 'rep') return row.repName || 'بدون مندوب';
      if (dimension === 'product') return row.productName || 'بدون صنف';
      return row.warehouseName || 'بدون مخزن';
    };
    const groups = new Map<string, { label: string; quantity: number; revenue: number; cost: number; returns: number; invoices: number }>();
    for (const row of rows) {
      const label = keyOf(row);
      const group = groups.get(label) || { label, quantity: 0, revenue: 0, cost: 0, returns: 0, invoices: 0 };
      group.quantity += num(row.quantity);
      group.revenue += num(row.revenue);
      group.cost += num(row.cost);
      if (row.isReturn) group.returns += Math.abs(num(row.revenue));
      else group.invoices += 1;
      groups.set(label, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        label: group.label,
        quantity: round2(group.quantity),
        revenue: round2(group.revenue),
        cost: round2(group.cost),
        profit: round2(group.revenue - group.cost),
        margin: group.revenue ? round2(((group.revenue - group.cost) / group.revenue) * 100) : 0,
        returns: round2(group.returns),
        lines: group.invoices,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      kpis: [
        { label: 'صافي المبيعات', value: round2(result.reduce((total, row) => total + row.revenue, 0)), tone: 'success' },
        { label: 'صافي الربح', value: round2(result.reduce((total, row) => total + row.profit, 0)), tone: 'info' },
        { label: 'المرتجعات', value: round2(result.reduce((total, row) => total + row.returns, 0)), tone: 'warning' },
        { label: 'الكمية المباعة', value: round2(result.reduce((total, row) => total + row.quantity, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: dimensionLabel(dimension) },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'revenue', label: 'صافي الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'هامش الربح', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'lines', label: 'عدد السطور', type: 'number' },
      ],
      rows: result,
    };
  }

  public productSales({ from, to }: ReportParams): ReportResult {
    const result = this.salesAnalysis({ from, to, dimension: 'product' });
    return {
      ...result,
      columns: [
        { key: 'label', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية المباعة (م²)', type: 'qty' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
      ],
    };
  }

  public productDetail({ from, to, productId }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const purchaseScope = this.purchaseScope();
    const product = productId
      ? this.db.query<any>('SELECT id, name, sku, cost_price AS costPrice, selling_price_m2 AS sellingPrice FROM products WHERE id = ?', [productId])[0]
      : null;
    const sales = productId
      ? this.db.query<any>(`
          SELECT si.date, si.invoice_number AS docNumber, 'فاتورة بيع' AS docType,
            c.name AS party, sii.quantity_m2 AS quantity, sii.unit_price AS unitPrice,
            sii.total_price AS amount, sii.total_cost AS cost,
            (sii.total_price - sii.total_cost) AS profit
          FROM sales_invoice_items sii
          JOIN sales_invoices si ON si.id = sii.invoice_id
          LEFT JOIN customers c ON c.id = si.customer_id
          WHERE sii.product_id = ? AND si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
          ORDER BY si.date DESC
        `, [productId, from, to, ...scope.params])
      : [];
    const returns = productId
      ? this.db.query<any>(`
          SELECT sr.date, sr.return_number AS docNumber, 'مرتجع بيع' AS docType,
            c.name AS party, -sri.quantity_m2 AS quantity, sri.unit_price AS unitPrice,
            -sri.total_refund AS amount, -(sri.quantity_m2 * sri.unit_cost) AS cost,
            (-sri.total_refund + sri.quantity_m2 * sri.unit_cost) AS profit
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN sales_invoices si ON si.id = sr.original_invoice_id
          LEFT JOIN customers c ON c.id = sr.customer_id
          WHERE sri.product_id = ? AND sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
          ORDER BY sr.date DESC
        `, [productId, from, to, ...scope.params])
      : [];
    const purchases = productId
      ? this.db.query<any>(`
          SELECT pi.date, pi.invoice_number AS docNumber, 'فاتورة شراء' AS docType,
            s.name AS party, pii.quantity_m2 AS quantity, pii.unit_cost AS unitPrice,
            pii.total_cost AS amount, 0 AS cost, 0 AS profit
          FROM purchase_invoice_items pii
          JOIN purchase_invoices pi ON pi.id = pii.purchase_id
          LEFT JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pii.product_id = ? AND pi.date >= ? AND pi.date <= ? AND ${purchaseScope.clause}
          ORDER BY pi.date DESC
        `, [productId, from, to, ...purchaseScope.params])
      : [];
    const rows = [...sales, ...returns, ...purchases].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const totalRevenue = sum(rows.filter((row) => row.docType !== 'فاتورة شراء'), 'amount');
    const totalCost = sum(rows.filter((row) => row.docType !== 'فاتورة شراء'), 'cost');
    const purchased = sum(rows.filter((row) => row.docType === 'فاتورة شراء'), 'amount');

    return {
      kpis: [
        { label: 'الصنف', value: product?.name || 'اختر صنفًا', hint: product?.sku || '', tone: 'info' },
        { label: 'صافي المبيعات', value: totalRevenue, tone: 'success' },
        { label: 'صافي الربح', value: round2(totalRevenue - totalCost), tone: 'info' },
        { label: 'قيمة المشتريات', value: purchased, tone: 'warning' },
        { label: 'صافي الكمية', value: round2(sum(rows, 'quantity')), tone: 'neutral' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'docType', label: 'نوع المستند', type: 'badge' },
        { key: 'docNumber', label: 'رقم المستند' },
        { key: 'party', label: 'الطرف' },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'unitPrice', label: 'السعر', type: 'currency' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
      ],
      rows,
      notes: productId ? undefined : ['اختر صنفًا من القائمة أعلاه لعرض تفاصيله.'],
    };
  }

  public productProfitability({ from, to }: ReportParams): ReportResult {
    const result = this.salesAnalysis({ from, to, dimension: 'product' });
    const rows = result.rows.map((row) => ({ ...row }));
    const totalProfit = rows.reduce((total, row) => total + num(row.profit), 0);
    let cumulative = 0;
    rows.sort((a, b) => num(b.profit) - num(a.profit));
    for (const row of rows) {
      cumulative += Math.max(0, num(row.profit));
      const share = totalProfit > 0 ? (Math.max(0, num(row.profit)) / totalProfit) * 100 : 0;
      row.share = round2(share);
      row.cumulativeShare = round2(totalProfit > 0 ? (cumulative / totalProfit) * 100 : 0);
      row.abc = row.cumulativeShare <= 80 ? 'A' : row.cumulativeShare <= 95 ? 'B' : 'C';
      row.status = num(row.profit) < 0 ? 'خاسر' : num(row.margin) < 10 ? 'هامش منخفض' : 'ربحي';
    }
    return {
      kpis: [
        { label: 'إجمالي الربح', value: round2(totalProfit), tone: 'success' },
        { label: 'أصناف A', value: rows.filter((row) => row.abc === 'A').length, hint: 'تساهم بـ 80% من الربح', tone: 'info' },
        { label: 'أصناف خاسرة', value: rows.filter((row) => num(row.profit) < 0).length, tone: 'danger' },
        { label: 'متوسط الهامش', value: round2(rows.length ? rows.reduce((total, row) => total + num(row.margin), 0) / rows.length : 0), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'share', label: 'نسبة الربح', type: 'percent' },
        { key: 'abc', label: 'تصنيف ABC', type: 'badge' },
      ],
      rows,
      notes: ['تصنيف ABC (باريتو): A أول 80% من الربح، B حتى 95%، C الباقي.'],
    };
  }

  public customerProfitability({ from, to }: ReportParams): ReportResult {
    const rows = this.salesActivityRows(from, to);
    const groups = new Map<string, { customer: string; revenue: number; cost: number; returns: number; invoices: number; discounts: number; lastPurchase: string }>();
    for (const row of rows) {
      const key = row.customerName || 'بدون عميل';
      const group = groups.get(key) || { customer: key, revenue: 0, cost: 0, returns: 0, invoices: 0, discounts: 0, lastPurchase: '' };
      group.revenue += num(row.revenue);
      group.cost += num(row.cost);
      group.discounts += Math.abs(num(row.lineDiscount));
      if (row.isReturn) group.returns += Math.abs(num(row.revenue));
      else {
        group.invoices += 1;
        if (!group.lastPurchase || row.date > group.lastPurchase) group.lastPurchase = row.date;
      }
      groups.set(key, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        customer: group.customer,
        revenue: round2(group.revenue),
        cost: round2(group.cost),
        profit: round2(group.revenue - group.cost),
        margin: group.revenue ? round2(((group.revenue - group.cost) / group.revenue) * 100) : 0,
        discounts: round2(group.discounts),
        discountRate: group.revenue + group.discounts > 0 ? round2((group.discounts / (group.revenue + group.discounts)) * 100) : 0,
        returns: round2(group.returns),
        averageInvoice: group.invoices ? round2(group.revenue / group.invoices) : 0,
        lastPurchase: group.lastPurchase,
      }))
      .sort((a, b) => b.profit - a.profit);

    return {
      kpis: [
        { label: 'صافي المبيعات', value: round2(result.reduce((total, row) => total + row.revenue, 0)), tone: 'success' },
        { label: 'صافي الربح', value: round2(result.reduce((total, row) => total + row.profit, 0)), tone: 'info' },
        { label: 'العملاء', value: result.length, tone: 'neutral' },
        { label: 'أعلى عميل ربحًا', value: result[0]?.customer || '—', hint: fmtMoney(result[0]?.profit), tone: 'success' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'revenue', label: 'الإيراد', type: 'currency' },
        { key: 'cost', label: 'التكلفة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'discounts', label: 'الخصومات', type: 'currency' },
        { key: 'discountRate', label: 'نسبة الخصم', type: 'percent' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'averageInvoice', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'lastPurchase', label: 'آخر شراء', type: 'date' },
      ],
      rows: result,
    };
  }

  public periodComparison({ from, to }: ReportParams): ReportResult {
    const current = this.periodMetrics(from, to);
    const previousRangeValue = previousRange(from, to);
    const previous = this.periodMetrics(previousRangeValue.from, previousRangeValue.to);
    const metrics = [
      ['المبيعات', 'sales', 'currency'],
      ['الربح', 'profit', 'currency'],
      ['عدد الفواتير', 'invoices', 'number'],
      ['عدد العملاء', 'customers', 'number'],
    ] as const;
    const rows = metrics.map(([label, key, type]) => {
      const currentValue = num(current[key]);
      const previousValue = num(previous[key]);
      const currentDisplay = type === 'currency' ? round2(currentValue) : Math.round(currentValue);
      const previousDisplay = type === 'currency' ? round2(previousValue) : Math.round(previousValue);
      return {
        metric: label,
        type,
        current: currentDisplay,
        previous: previousDisplay,
        change: type === 'currency' ? round2(currentValue - previousValue) : Math.round(currentValue - previousValue),
        changePercent: previousValue ? round2(((currentValue - previousValue) / Math.abs(previousValue)) * 100) : 0,
      };
    });
    return {
      kpis: [
        { label: 'مبيعات الفترة الحالية', value: num(current.sales), hint: `${from} → ${to}`, tone: 'success' },
        { label: 'مبيعات الفترة السابقة', value: num(previous.sales), hint: `${previousRangeValue.from} → ${previousRangeValue.to}`, tone: 'neutral' },
        { label: 'نمو المبيعات', value: previous.sales ? round2(((num(current.sales) - num(previous.sales)) / Math.abs(num(previous.sales))) * 100) : 0, tone: num(current.sales) >= num(previous.sales) ? 'success' : 'danger' },
        { label: 'تغير الربح', value: round2(num(current.profit) - num(previous.profit)), tone: num(current.profit) >= num(previous.profit) ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'metric', label: 'المؤشر' },
        { key: 'current', label: 'الفترة الحالية', type: 'text' },
        { key: 'previous', label: 'الفترة السابقة', type: 'text' },
        { key: 'change', label: 'الفرق', type: 'text' },
        { key: 'changePercent', label: 'نسبة التغير', type: 'percent' },
      ],
      rows,
      notes: [`الفترة السابقة: ${previousRangeValue.from} إلى ${previousRangeValue.to}.`],
    };
  }

  private periodMetrics(from: string, to: string) {
    const scope = this.salesScope();
    const invoiceRow = this.db.query<any>(`
      SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS sales,
        COALESCE(SUM(si.gross_profit), 0) AS profit,
        COUNT(DISTINCT si.id) AS invoices,
        COUNT(DISTINCT si.customer_id) AS customers
      FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params])[0] || {};
    const returnScope = this.salesScope();
    const returnRow = this.db.query<any>(`
      SELECT COALESCE(SUM(sr.total_amount), 0) AS returns,
        COALESCE(SUM((
          SELECT SUM(sri.quantity_m2 * sri.unit_cost)
          FROM sales_return_items sri WHERE sri.return_id = sr.id
        )), 0) AS returnedCost
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID' AND ${returnScope.clause}
    `, [from, to, ...returnScope.params])[0] || {};
    return {
      sales: num(invoiceRow.sales) - num(returnRow.returns),
      profit: num(invoiceRow.profit) - num(returnRow.returns) + num(returnRow.returnedCost),
      invoices: num(invoiceRow.invoices),
      customers: num(invoiceRow.customers),
    };
  }

  // ── Receivables & credit ──────────────────────────────────────────────────

  public arAging({ to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const docs = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) AS creditLimit,
        COALESCE(si.due_date, si.date) AS dueDate,
        MAX(0, si.total_amount
          - MAX(0, si.paid_amount - COALESCE((
            SELECT SUM(cpa0.amount) FROM customer_payment_allocations cpa0
            WHERE cpa0.sales_invoice_id = si.id
          ), 0))
          - COALESCE((
            SELECT SUM(cpa.amount) FROM customer_payment_allocations cpa
            JOIN customer_payments cp ON cp.id = cpa.payment_id
            WHERE cpa.sales_invoice_id = si.id AND cp.date <= ?
          ), 0)
          - COALESCE((
            SELECT SUM(sr.remaining_to_balance) FROM sales_returns sr
            WHERE sr.original_invoice_id = si.id AND sr.date <= ?
          ), 0)
        ) AS outstanding
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      ORDER BY c.name, dueDate
    `, [to, to, to, ...scope.params]);
    const referenceDay = Date.UTC(
      Number(to.slice(0, 4)),
      Number(to.slice(5, 7)) - 1,
      Number(to.slice(8, 10)),
    ) / 86_400_000;
    const byCustomer = new Map<string, Record<string, any>>();
    for (const doc of docs) {
      if (num(doc.outstanding) <= 0.01) continue;
      const dueDate = String(doc.dueDate);
      const dueDay = Date.UTC(
        Number(dueDate.slice(0, 4)),
        Number(dueDate.slice(5, 7)) - 1,
        Number(dueDate.slice(8, 10)),
      ) / 86_400_000;
      const daysOverdue = Math.max(0, referenceDay - dueDay);
      const outstanding = num(doc.outstanding);
      const row = byCustomer.get(doc.customerId) || {
        customerId: doc.customerId,
        customer: doc.customer,
        phone: doc.phone,
        creditLimit: num(doc.creditLimit),
        dueDate,
        bucket0: 0,
        bucket31: 0,
        bucket61: 0,
        bucket91: 0,
        bucket120: 0,
        total: 0,
        oldestDays: '0-30',
        oldestAge: -1,
      };
      if (daysOverdue <= 30) row.bucket0 += outstanding;
      else if (daysOverdue <= 60) row.bucket31 += outstanding;
      else if (daysOverdue <= 90) row.bucket61 += outstanding;
      else if (daysOverdue <= 120) row.bucket91 += outstanding;
      else row.bucket120 += outstanding;
      row.total += outstanding;
      if (daysOverdue > row.oldestAge) {
        row.oldestAge = daysOverdue;
        row.dueDate = dueDate;
        row.oldestDays = daysOverdue <= 30 ? '0-30'
          : daysOverdue <= 60 ? '31-60'
            : daysOverdue <= 90 ? '61-90'
              : daysOverdue <= 120 ? '91-120' : '>120';
      }
      byCustomer.set(doc.customerId, row);
    }
    const result = Array.from(byCustomer.values()).map(({ oldestAge: _oldestAge, ...row }) => ({
      ...row,
      bucket0: round2(row.bucket0),
      bucket31: round2(row.bucket31),
      bucket61: round2(row.bucket61),
      bucket91: round2(row.bucket91),
      bucket120: round2(row.bucket120),
      total: round2(row.total),
    })).sort((a, b) => b.total - a.total);
    return {
      kpis: [
        { label: 'إجمالي المستحق', value: round2(result.reduce((total, row) => total + row.total, 0)), tone: 'warning' },
        { label: 'مستحق 0-30', value: round2(result.reduce((total, row) => total + row.bucket0, 0)), tone: 'success' },
        { label: 'مستحق 31-90', value: round2(result.reduce((total, row) => total + row.bucket31 + row.bucket61, 0)), tone: 'info' },
        { label: 'متأخر أكثر من 90', value: round2(result.reduce((total, row) => total + row.bucket91 + row.bucket120, 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'dueDate', label: 'أقدم تاريخ استحقاق', type: 'date' },
        { key: 'bucket0', label: '0-30 يوم', type: 'currency' },
        { key: 'bucket31', label: '31-60 يوم', type: 'currency' },
        { key: 'bucket61', label: '61-90 يوم', type: 'currency' },
        { key: 'bucket91', label: '91-120 يوم', type: 'currency' },
        { key: 'bucket120', label: 'أكثر من 120', type: 'currency' },
        { key: 'total', label: 'الإجمالي', type: 'currency' },
        { key: 'oldestDays', label: 'أقدم شريحة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public creditExposure({ to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const rows = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.credit_limit, 0) AS creditLimit,
        COALESCE(c.current_balance, 0) AS balance,
        SUM(si.remaining_amount) AS outstanding,
        SUM(CASE WHEN si.due_date IS NOT NULL AND si.due_date < ? THEN si.remaining_amount ELSE 0 END) AS overdue,
        MIN(CASE WHEN si.remaining_amount > 0.01 THEN COALESCE(si.due_date, si.date) END) AS oldestDue
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id
        AND si.remaining_amount > 0.01 AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY c.id
      HAVING outstanding > 0.01 OR balance > 0.01
      ORDER BY outstanding DESC
    `, [to, to, ...scope.params]);
    const result = rows.map((row) => {
      const outstanding = round2(num(row.outstanding));
      const creditLimit = round2(num(row.creditLimit));
      const overdue = round2(num(row.overdue));
      return {
        customer: row.customer,
        phone: row.phone,
        creditLimit,
        outstanding,
        overdue,
        available: round2(Math.max(0, creditLimit - outstanding)),
        usage: creditLimit > 0 ? round2((outstanding / creditLimit) * 100) : 0,
        overLimit: creditLimit > 0 && outstanding > creditLimit,
        status: overdue > 0 ? 'متأخر' : creditLimit > 0 && outstanding > creditLimit ? 'تجاوز الحد' : 'منتظم',
        oldestDue: row.oldestDue || '',
      };
    });
    return {
      kpis: [
        { label: 'إجمالي المستحق', value: round2(result.reduce((total, row) => total + row.outstanding, 0)), tone: 'warning' },
        { label: 'المتأخرات', value: round2(result.reduce((total, row) => total + row.overdue, 0)), tone: 'danger' },
        { label: 'عملاء تجاوزوا الحد', value: result.filter((row) => row.overLimit).length, tone: 'danger' },
        { label: 'عملاء متأخرون', value: result.filter((row) => row.overdue > 0).length, tone: 'warning' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'creditLimit', label: 'حد الائتمان', type: 'currency' },
        { key: 'outstanding', label: 'المستحق', type: 'currency' },
        { key: 'overdue', label: 'المتأخر', type: 'currency' },
        { key: 'available', label: 'المتاح', type: 'currency' },
        { key: 'usage', label: 'نسبة الاستخدام', type: 'percent' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public chequeMaturity({ to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT cheque_number AS chequeNumber, type, party_name AS party, bank_name AS bank,
        amount, due_date AS dueDate,
        CAST(julianday(due_date) - julianday(?) AS INTEGER) AS daysLeft,
        status
      FROM cheques
      WHERE status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
      ORDER BY due_date ASC
    `, [to]);
    return {
      kpis: [
        { label: 'شيكات مفتوحة', value: rows.length, tone: 'info' },
        { label: 'قيمة الشيكات', value: round2(rows.reduce((total, row) => total + num(row.amount), 0)), tone: 'warning' },
        { label: 'تستحق خلال 7 أيام', value: rows.filter((row) => num(row.daysLeft) <= 7).length, tone: 'danger' },
        { label: 'شيكات صادرة', value: round2(rows.filter((row) => row.type === 'ISSUED').reduce((total, row) => total + num(row.amount), 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'chequeNumber', label: 'رقم الشيك' },
        { key: 'type', label: 'النوع', type: 'badge' },
        { key: 'party', label: 'الطرف' },
        { key: 'bank', label: 'البنك' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
        { key: 'daysLeft', label: 'أيام متبقية', type: 'number' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows,
    };
  }

  public bouncedCheques({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT c.cheque_number AS chequeNumber, c.type, c.party_name AS party, c.bank_name AS bank,
        c.amount, c.due_date AS dueDate, c.status,
        COALESCE((SELECT h.notes FROM cheque_status_history h
          WHERE h.cheque_id = c.id AND h.to_status = 'BOUNCED'
          ORDER BY h.changed_at DESC LIMIT 1), c.notes, '') AS reason,
        COALESCE((SELECT h.changed_at FROM cheque_status_history h
          WHERE h.cheque_id = c.id AND h.to_status = 'BOUNCED'
          ORDER BY h.changed_at DESC LIMIT 1), c.updated_at) AS bouncedAt
      FROM cheques c
      WHERE c.status = 'BOUNCED' AND COALESCE(c.due_date, c.created_at) >= ? AND COALESCE(c.due_date, c.created_at) <= ?
      ORDER BY c.due_date DESC
    `, [from, to]);
    return {
      kpis: [
        { label: 'شيكات مرتدة', value: rows.length, tone: 'danger' },
        { label: 'قيمة الشيكات', value: round2(rows.reduce((total, row) => total + num(row.amount), 0)), tone: 'danger' },
        { label: 'شيكات واردة مرتدة', value: rows.filter((row) => row.type === 'RECEIVED').length, tone: 'warning' },
        { label: 'شيكات صادرة مرتدة', value: rows.filter((row) => row.type === 'ISSUED').length, tone: 'warning' },
      ],
      columns: [
        { key: 'chequeNumber', label: 'رقم الشيك' },
        { key: 'type', label: 'النوع', type: 'badge' },
        { key: 'party', label: 'الطرف' },
        { key: 'bank', label: 'البنك' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
        { key: 'bouncedAt', label: 'تاريخ الرد', type: 'date' },
        { key: 'reason', label: 'السبب' },
      ],
      rows,
    };
  }

  public installmentAging({ to }: ReportParams): ReportResult {
    const scope = this.tableScope('p.branch_id');
    const rows = this.db.query<any>(`
      SELECT p.plan_number AS planNumber, c.name AS customer, i.sequence_number AS sequence,
        i.due_date AS dueDate, i.amount, i.paid_amount AS paid, i.remaining_amount AS remaining,
        i.status,
        CAST(julianday(?) - julianday(i.due_date) AS INTEGER) AS overdueDays
      FROM installments i
      JOIN installment_plans p ON p.id = i.plan_id
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE i.remaining_amount > 0.01 AND i.due_date <= ? AND ${scope.clause}
      ORDER BY i.due_date ASC
    `, [to, to, ...scope.params]);
    const withBucket = rows.map((row) => {
      const overdueDays = num(row.overdueDays);
      const bucket = overdueDays <= 0 ? 'غير مستحق' : overdueDays <= 30 ? '0-30' : overdueDays <= 60 ? '31-60' : overdueDays <= 90 ? '61-90' : 'أكثر من 90';
      return { ...row, overdueDays, bucket };
    });
    return {
      kpis: [
        { label: 'أقساط مستحقة', value: withBucket.length, tone: 'info' },
        { label: 'إجمالي المتبقي', value: round2(withBucket.reduce((total, row) => total + num(row.remaining), 0)), tone: 'warning' },
        { label: 'متأخر السداد', value: round2(withBucket.reduce((total, row) => total + (num(row.overdueDays) > 0 ? num(row.remaining) : 0), 0)), tone: 'danger' },
        { label: 'خطط متأخرة', value: new Set(withBucket.filter((row) => num(row.overdueDays) > 0).map((row) => row.planNumber)).size, tone: 'danger' },
      ],
      columns: [
        { key: 'planNumber', label: 'رقم الخطة' },
        { key: 'customer', label: 'العميل' },
        { key: 'sequence', label: 'القسط', type: 'number' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'paid', label: 'المدفوع', type: 'currency' },
        { key: 'remaining', label: 'المتبقي', type: 'currency' },
        { key: 'overdueDays', label: 'أيام التأخير', type: 'number' },
        { key: 'bucket', label: 'الشريحة', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: withBucket,
    };
  }

  // ── Inventory & purchasing ────────────────────────────────────────────────

  public inventoryBalances(): ReportResult {
    const scope = this.tableScope(
      'br.id',
      'w.id',
    );
    const rows = this.db.query<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product, c.name AS category,
        w.name AS warehouse, ws.quantity_m2 AS quantity, ws.reserved_m2 AS reserved,
        (ws.quantity_m2 - ws.reserved_m2) AS available,
        COALESCE(p.cost_price, 0) AS unitCost,
        (ws.quantity_m2 * COALESCE(p.cost_price, 0)) AS stockValue,
        (ws.quantity_m2 * COALESCE(p.selling_price_m2, 0)) AS retailValue,
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

  public slowMoving({ from, to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const stockScope = this.tableScope('w.branch_id');
    const days = Math.max(1, daysBetween(from, to));
    const rows = this.db.query<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product,
        w.name AS warehouse, ws.quantity_m2 AS quantity,
        (ws.quantity_m2 * COALESCE(p.cost_price, 0)) AS stockValue,
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

  public purchaseAnalysis(params: ReportParams): ReportResult {
    const dimension = params.dimension || 'supplier';
    const scope = this.purchaseScope();
    const rows = this.db.query<any>(`
      SELECT pi.date, COALESCE(s.name, 'بدون مورد') AS supplier,
        COALESCE(w.name, 'بدون مخزن') AS warehouse, p.name AS product,
        pii.quantity_m2 AS quantity, pii.total_cost AS amount, 0 AS isReturn
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN products p ON p.id = pii.product_id
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      LEFT JOIN warehouses w ON w.id = pi.warehouse_id
      WHERE pi.date >= ? AND pi.date <= ? AND ${scope.clause}

      UNION ALL

      SELECT pr.date, COALESCE(s.name, 'بدون مورد'), COALESCE(w.name, 'بدون مخزن'), p.name,
        -pri.quantity_m2, -pri.total_refund, 1
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      JOIN purchase_invoices pi ON pi.id = pr.original_purchase_id
      JOIN products p ON p.id = pri.product_id
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN warehouses w ON w.id = pr.warehouse_id
      WHERE pr.date >= ? AND pr.date <= ? AND ${scope.clause}
    `, [params.from, params.to, ...scope.params, params.from, params.to, ...scope.params]);
    const labelOf = (row: any): string => {
      if (dimension === 'warehouse') return row.warehouse;
      if (dimension === 'product') return row.product;
      return row.supplier;
    };
    const groups = new Map<string, { label: string; quantity: number; amount: number; returns: number }>();
    for (const row of rows) {
      const label = labelOf(row);
      const group = groups.get(label) || { label, quantity: 0, amount: 0, returns: 0 };
      group.quantity += num(row.quantity);
      group.amount += num(row.amount);
      if (row.isReturn) group.returns += Math.abs(num(row.amount));
      groups.set(label, group);
    }
    const result = Array.from(groups.values())
      .map((group) => ({
        label: group.label,
        quantity: round2(group.quantity),
        amount: round2(group.amount),
        returns: round2(group.returns),
        net: round2(group.amount - group.returns),
        averageCost: group.quantity ? round2(group.amount / group.quantity) : 0,
      }))
      .sort((a, b) => b.net - a.net);
    return {
      kpis: [
        { label: 'إجمالي المشتريات', value: round2(result.reduce((total, row) => total + row.amount, 0)), tone: 'warning' },
        { label: 'مرتجعات الشراء', value: round2(result.reduce((total, row) => total + row.returns, 0)), tone: 'danger' },
        { label: 'صافي المشتريات', value: round2(result.reduce((total, row) => total + row.net, 0)), tone: 'info' },
        { label: 'الكمية المشتراة', value: round2(result.reduce((total, row) => total + row.quantity, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'label', label: dimensionLabel(dimension) },
        { key: 'quantity', label: 'الكمية (م²)', type: 'qty' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'net', label: 'الصافي', type: 'currency' },
        { key: 'averageCost', label: 'متوسط التكلفة', type: 'currency' },
      ],
      rows: result,
    };
  }

  public supplierPrices({ from, to }: ReportParams): ReportResult {
    const scope = this.purchaseScope();
    const rows = this.db.query<any>(`
      SELECT p.id AS productId, p.name AS product, s.name AS supplier,
        MIN(pii.unit_cost) AS minPrice, MAX(pii.unit_cost) AS maxPrice,
        AVG(pii.unit_cost) AS avgPrice,
        (SELECT pii2.unit_cost FROM purchase_invoice_items pii2
          JOIN purchase_invoices pi2 ON pi2.id = pii2.purchase_id
          WHERE pii2.product_id = p.id AND pi2.supplier_id = s.id AND pi2.date <= ?
          ORDER BY pi2.date DESC, pii2.id DESC LIMIT 1) AS lastPrice,
        SUM(pii.quantity_m2) AS quantity, MAX(pi.date) AS lastPurchase
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_id
      JOIN products p ON p.id = pii.product_id
      JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.date >= ? AND pi.date <= ? AND ${scope.clause}
      GROUP BY p.id, s.id
      ORDER BY p.name, avgPrice ASC
    `, [to, from, to, ...scope.params]);
    const best = new Map<string, number>();
    for (const row of rows) {
      const current = best.get(row.productId);
      if (current === undefined || num(row.avgPrice) < current) best.set(row.productId, num(row.avgPrice));
    }
    const result = rows.map((row) => ({
      product: row.product,
      supplier: row.supplier,
      minPrice: round2(num(row.minPrice)),
      maxPrice: round2(num(row.maxPrice)),
      avgPrice: round2(num(row.avgPrice)),
      lastPrice: round2(num(row.lastPrice)),
      quantity: round2(num(row.quantity)),
      lastPurchase: row.lastPurchase,
      cheapest: num(row.avgPrice) <= (best.get(row.productId) ?? Infinity),
      saving: round2(Math.max(0, num(row.maxPrice) - num(row.minPrice))),
    })).sort((a, b) => a.product.localeCompare(b.product) || a.avgPrice - b.avgPrice);
    return {
      kpis: [
        { label: 'أصناف مقارنة', value: best.size, tone: 'info' },
        { label: 'موردون', value: new Set(result.map((row) => row.supplier)).size, tone: 'neutral' },
        { label: 'فرق السعر المتاح', value: round2(result.reduce((total, row) => total + row.saving, 0)), hint: 'الفرق بين أعلى وأقل سعر لكل صنف', tone: 'success' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'supplier', label: 'المورد' },
        { key: 'minPrice', label: 'أقل سعر', type: 'currency' },
        { key: 'avgPrice', label: 'متوسط السعر', type: 'currency' },
        { key: 'lastPrice', label: 'آخر سعر', type: 'currency' },
        { key: 'maxPrice', label: 'أعلى سعر', type: 'currency' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'saving', label: 'فرق السعر', type: 'currency' },
      ],
      rows: result,
    };
  }

  public countVariance({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('w.branch_id');
    const rows = this.db.query<any>(`
      SELECT sc.count_number AS countNumber, sc.date, w.name AS warehouse,
        p.name AS product, sci.system_quantity_m2 AS systemQty,
        sci.counted_quantity_m2 AS countedQty, sci.variance_m2 AS variance,
        sci.unit_cost AS unitCost, sci.variance_value AS varianceValue,
        sc.status
      FROM stock_count_items sci
      JOIN stock_counts sc ON sc.id = sci.count_id
      JOIN products p ON p.id = sci.product_id
      LEFT JOIN warehouses w ON w.id = sc.warehouse_id
      WHERE sc.date >= ? AND sc.date <= ? AND sc.status = 'POSTED' AND ABS(sci.variance_m2) > 0.001 AND ${scope.clause}
      ORDER BY ABS(sci.variance_value) DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      systemQty: round2(num(row.systemQty)),
      countedQty: round2(num(row.countedQty)),
      variance: round2(num(row.variance)),
      varianceValue: round2(num(row.varianceValue)),
      kind: num(row.variance) > 0 ? 'زيادة' : 'عجز',
    }));
    return {
      kpis: [
        { label: 'صافي فروقات الجرد', value: round2(result.reduce((total, row) => total + row.varianceValue, 0)), tone: 'warning' },
        { label: 'قيمة العجز', value: round2(result.filter((row) => num(row.variance) < 0).reduce((total, row) => total + Math.abs(num(row.varianceValue)), 0)), tone: 'danger' },
        { label: 'قيمة الزيادة', value: round2(result.filter((row) => num(row.variance) > 0).reduce((total, row) => total + num(row.varianceValue), 0)), tone: 'success' },
        { label: 'جلسات جرد', value: new Set(result.map((row) => row.countNumber)).size, tone: 'info' },
      ],
      columns: [
        { key: 'countNumber', label: 'رقم الجرد' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'product', label: 'الصنف' },
        { key: 'systemQty', label: 'رصيد النظام', type: 'qty' },
        { key: 'countedQty', label: 'الرصيد المعدود', type: 'qty' },
        { key: 'variance', label: 'الفرق', type: 'qty' },
        { key: 'varianceValue', label: 'قيمة الفرق', type: 'currency' },
        { key: 'kind', label: 'النوع', type: 'badge' },
      ],
      rows: result,
    };
  }

  // ── Governance, shifts & approvals ────────────────────────────────────────

  public shiftClosing({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('cs.branch_id');
    const rows = this.db.query<any>(`
      SELECT cs.shift_number AS shiftNumber, cs.opened_at AS openedAt, cs.closed_at AS closedAt,
        cr.name AS register, COALESCE(u.full_name, '—') AS cashier, cs.status,
        cs.opening_balance AS opening, cs.total_sales_cash AS cashSales,
        cs.total_sales_card AS cardSales, cs.total_customer_payments AS collections,
        cs.total_expenses AS expenses, cs.total_refunds AS refunds,
        cs.expected_ending_cash AS expected, cs.actual_ending_cash AS actual,
        cs.cash_difference AS difference
      FROM cash_shifts cs
      LEFT JOIN cash_registers cr ON cr.id = cs.register_id
      LEFT JOIN users u ON u.id = cs.user_id
      WHERE substr(cs.opened_at, 1, 10) >= ? AND substr(cs.opened_at, 1, 10) <= ? AND ${scope.clause}
      ORDER BY cs.opened_at DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      opening: round2(num(row.opening)),
      cashSales: round2(num(row.cashSales)),
      cardSales: round2(num(row.cardSales)),
      collections: round2(num(row.collections)),
      expenses: round2(num(row.expenses)),
      refunds: round2(num(row.refunds)),
      expected: round2(num(row.expected)),
      actual: round2(num(row.actual)),
      difference: round2(num(row.difference)),
    }));
    return {
      kpis: [
        { label: 'عدد الورديات', value: result.length, tone: 'info' },
        { label: 'ورديات مفتوحة', value: result.filter((row) => row.status === 'OPEN').length, tone: 'warning' },
        { label: 'إجمالي العجز/الزيادة', value: round2(result.reduce((total, row) => total + row.difference, 0)), tone: 'danger' },
        { label: 'إجمالي المبيعات النقدية', value: round2(result.reduce((total, row) => total + row.cashSales, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'shiftNumber', label: 'رقم الوردية' },
        { key: 'register', label: 'الخزينة' },
        { key: 'cashier', label: 'الكاشير' },
        { key: 'openedAt', label: 'الفتح', type: 'date' },
        { key: 'closedAt', label: 'الإقفال', type: 'date' },
        { key: 'opening', label: 'رصيد الفتح', type: 'currency' },
        { key: 'cashSales', label: 'مبيعات نقدية', type: 'currency' },
        { key: 'cardSales', label: 'مبيعات بطاقات', type: 'currency' },
        { key: 'collections', label: 'تحصيل', type: 'currency' },
        { key: 'expenses', label: 'مصروفات', type: 'currency' },
        { key: 'expected', label: 'المتوقع', type: 'currency' },
        { key: 'actual', label: 'المعدود', type: 'currency' },
        { key: 'difference', label: 'العجز/الزيادة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public approvalsLog({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('a.branch_id');
    const rows = this.db.query<any>(`
      SELECT a.request_number AS requestNumber, a.request_type AS requestType, a.title,
        a.status, a.priority, a.requested_value AS requestedValue,
        a.current_value AS currentValue, a.created_at AS createdAt, a.decided_at AS decidedAt,
        COALESCE(ru.full_name, '—') AS requestedBy, COALESCE(du.full_name, '—') AS decidedBy,
        a.decision_notes AS decisionNotes
      FROM approval_requests a
      LEFT JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN users du ON du.id = a.decided_by
      WHERE substr(a.created_at, 1, 10) >= ? AND substr(a.created_at, 1, 10) <= ?
        AND ${scope.clause}
      ORDER BY a.created_at DESC
    `, [from, to, ...scope.params]);
    return {
      kpis: [
        { label: 'إجمالي الطلبات', value: rows.length, tone: 'info' },
        { label: 'معلقة', value: rows.filter((row) => row.status === 'PENDING').length, tone: 'warning' },
        { label: 'موافق عليها', value: rows.filter((row) => row.status === 'APPROVED').length, tone: 'success' },
        { label: 'مرفوضة', value: rows.filter((row) => row.status === 'REJECTED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'requestNumber', label: 'رقم الطلب' },
        { key: 'requestType', label: 'النوع', type: 'badge' },
        { key: 'title', label: 'الموضوع' },
        { key: 'requestedBy', label: 'مقدم الطلب' },
        { key: 'decidedBy', label: 'الموافق' },
        { key: 'requestedValue', label: 'القيمة المطلوبة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'createdAt', label: 'تاريخ الطلب', type: 'date' },
        { key: 'decidedAt', label: 'تاريخ القرار', type: 'date' },
      ],
      rows,
    };
  }

  public exceptionsLog({ from, to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const priceRows = this.db.query<any>(`
      SELECT si.date, 'بيع تحت الحد الأدنى' AS exceptionType,
        ('فاتورة ' || si.invoice_number || ' - ' || p.name) AS details,
        COALESCE(u.full_name, '—') AS userName,
        ((p.min_selling_price_m2 - sii.unit_price) * sii.quantity_m2) AS value,
        COALESCE(c.name, '—') AS party
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      LEFT JOIN users u ON u.id = si.created_by
      LEFT JOIN customers c ON c.id = si.customer_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
        AND p.min_selling_price_m2 > 0 AND sii.unit_price < p.min_selling_price_m2 AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const voidRows = this.db.query<any>(`
      SELECT substr(al.created_at, 1, 10) AS date,
        CASE WHEN al.action LIKE '%DELETE%' THEN 'حذف سطر/مستند' ELSE 'إلغاء عملية' END AS exceptionType,
        (al.module || ' - ' || COALESCE(al.record_id, '')) AS details,
        al.user_name AS userName, 0 AS value, '—' AS party
      FROM audit_logs al
      WHERE substr(al.created_at, 1, 10) >= ? AND substr(al.created_at, 1, 10) <= ?
        AND (al.action LIKE '%DELETE%' OR al.action LIKE '%VOID%' OR al.action LIKE '%CANCEL%')
      ORDER BY al.created_at DESC
    `, [from, to]);
    const returnRows = this.db.query<any>(`
      SELECT sr.date, 'مرتجع بدون ربط فاتورة' AS exceptionType,
        ('مرتجع ' || sr.return_number) AS details, COALESCE(u.full_name, '—') AS userName,
        sr.total_amount AS value, COALESCE(c.name, '—') AS party
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.date >= ? AND sr.date <= ? AND (sr.original_invoice_id IS NULL OR sr.original_invoice_id = '') AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const approvalScope = this.tableScope('a.branch_id');
    const approvalRows = this.db.query<any>(`
      SELECT substr(a.created_at, 1, 10) AS date,
        ('موافقة: ' || a.request_type) AS exceptionType, a.title AS details,
        COALESCE(ru.full_name, '—') AS userName, COALESCE(a.requested_value, 0) AS value,
        COALESCE(du.full_name, '—') AS party
      FROM approval_requests a
      LEFT JOIN users ru ON ru.id = a.requested_by
      LEFT JOIN users du ON du.id = a.decided_by
      WHERE substr(a.created_at, 1, 10) >= ? AND substr(a.created_at, 1, 10) <= ?
        AND a.request_type IN ('DISCOUNT', 'PRICE_CHANGE', 'SALES_RETURN', 'STOCK_ADJUSTMENT', 'CREDIT_LIMIT')
        AND ${approvalScope.clause}
    `, [from, to, ...approvalScope.params]);
    const rows = [...priceRows, ...voidRows, ...returnRows, ...approvalRows]
      .map((row) => ({ ...row, value: round2(Math.abs(num(row.value))) }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.value - a.value);
    return {
      kpis: [
        { label: 'عدد الاستثناءات', value: rows.length, tone: 'warning' },
        { label: 'بيع تحت الحد الأدنى', value: priceRows.length, tone: 'danger' },
        { label: 'حذف/إلغاء', value: voidRows.length, tone: 'danger' },
        { label: 'موافقات استثنائية', value: approvalRows.length, tone: 'info' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'exceptionType', label: 'نوع الاستثناء', type: 'badge' },
        { key: 'details', label: 'التفاصيل' },
        { key: 'party', label: 'الطرف/الموافق' },
        { key: 'userName', label: 'المستخدم' },
        { key: 'value', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['يشمل التقرير البيع تحت الحد الأدنى، عمليات الحذف أو الإلغاء المسجلة في سجل التدقيق، والموافقات الاستثنائية.'],
    };
  }

  public receivedReports({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('d.branch_id');
    const rows = this.db.query<any>(`
      SELECT d.document_number AS documentNumber, d.title, d.category,
        d.status, d.created_at AS createdAt, d.updated_at AS updatedAt,
        b.name AS branch, COALESCE(u.full_name, '—') AS createdBy,
        (SELECT COUNT(*) FROM enterprise_document_versions v WHERE v.document_id = d.id) AS versions
      FROM enterprise_documents d
      LEFT JOIN branches b ON b.id = d.branch_id
      LEFT JOIN users u ON u.id = d.created_by
      WHERE substr(d.created_at, 1, 10) >= ? AND substr(d.created_at, 1, 10) <= ?
        AND (UPPER(d.category) LIKE '%REPORT%' OR d.title LIKE '%تقرير%')
        AND ${scope.clause}
      ORDER BY d.created_at DESC
    `, [from, to, ...scope.params]);
    return {
      kpis: [
        { label: 'تقارير واردة', value: rows.length, tone: 'info' },
        { label: 'مسودات', value: rows.filter((row) => row.status === 'DRAFT').length, tone: 'warning' },
        { label: 'نشطة', value: rows.filter((row) => row.status === 'ACTIVE').length, tone: 'success' },
        { label: 'فروع مرسلة', value: new Set(rows.map((row) => row.branch).filter(Boolean)).size, tone: 'neutral' },
      ],
      columns: [
        { key: 'documentNumber', label: 'رقم المستند' },
        { key: 'title', label: 'العنوان' },
        { key: 'branch', label: 'الفرع' },
        { key: 'createdBy', label: 'المرسل' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'versions', label: 'الإصدارات', type: 'number' },
        { key: 'createdAt', label: 'تاريخ الإرسال', type: 'date' },
      ],
      rows,
    };
  }

  public alertsSummary({ to }: ReportParams): ReportResult {
    const stockScope = this.tableScope(
      'w.branch_id',
      'ws.warehouse_id',
    );
    const registerScope = this.tableScope('cr.branch_id');
    const customerScope = this.tableScope('c.branch_id');
    const approvalScope = this.tableScope('a.branch_id');
    const lowStock = this.db.query<any>(`
      SELECT p.name, ws.quantity_m2 AS quantity, p.min_stock_level AS minLevel
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND ws.quantity_m2 <= COALESCE(p.min_stock_level, 0)
        AND ${stockScope.clause}
      ORDER BY ws.quantity_m2 ASC LIMIT 200
    `, [...stockScope.params]);
    const negativeRegisters = this.db.query<any>(`
      SELECT cr.name, cr.current_balance AS balance
      FROM cash_registers cr
      WHERE cr.current_balance < 0 AND ${registerScope.clause}
    `, [...registerScope.params]);
    const overLimit = this.db.query<any>(`
      SELECT c.name, c.current_balance AS balance, c.credit_limit AS creditLimit
      FROM customers c
      WHERE c.credit_limit > 0 AND c.current_balance > c.credit_limit
        AND ${customerScope.clause}
    `, [...customerScope.params]);
    const dueCheques = this.db.query<any>(`
      SELECT cheque_number AS number, party_name AS party, amount, due_date AS dueDate
      FROM cheques WHERE status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
        AND due_date <= ? AND due_date >= ?
    `, [shiftDate(to, 7), to]);
    const pendingApprovals = this.db.query<any>(`
      SELECT a.request_number AS number, a.title, a.requested_value AS value, a.created_at AS createdAt
      FROM approval_requests a
      WHERE a.status = 'PENDING' AND ${approvalScope.clause}
    `, [...approvalScope.params]);
    const lowMargin = this.db.query<any>(`
      SELECT p.name, p.selling_price_m2 AS price, p.cost_price AS cost
      FROM products p
      WHERE p.is_active = 1 AND p.selling_price_m2 > 0
        AND ((p.selling_price_m2 - p.cost_price) / p.selling_price_m2) < 0.1
      LIMIT 100
    `);
    const rows: Array<Record<string, any>> = [
      ...lowStock.map((row) => ({ severity: 'danger', area: 'المخزون', message: `الصنف ${row.name} وصل للحد الأدنى (${round2(num(row.quantity))} م²)`, value: round2(num(row.minLevel)) })),
      ...negativeRegisters.map((row) => ({ severity: 'danger', area: 'الخزينة', message: `الخزينة ${row.name} رصيدها سالب`, value: round2(num(row.balance)) })),
      ...overLimit.map((row) => ({ severity: 'warning', area: 'الائتمان', message: `العميل ${row.name} تجاوز حد الائتمان`, value: round2(num(row.balance)) })),
      ...dueCheques.map((row) => ({ severity: 'warning', area: 'الشيكات', message: `شيك ${row.number} للطرف ${row.party} يستحق قريبًا`, value: round2(num(row.amount)) })),
      ...pendingApprovals.map((row) => ({ severity: 'info', area: 'الموافقات', message: `طلب معلّق: ${row.title}`, value: round2(num(row.value)) })),
      ...lowMargin.map((row) => ({ severity: 'warning', area: 'الربحية', message: `هامش الصنف ${row.name} أقل من 10%`, value: round2(num(row.price) - num(row.cost)) })),
    ];
    return {
      kpis: [
        { label: 'إجمالي التنبيهات', value: rows.length, tone: 'warning' },
        { label: 'تنبيهات حرجة', value: rows.filter((row) => row.severity === 'danger').length, tone: 'danger' },
        { label: 'أصناف تحت الحد', value: lowStock.length, tone: 'danger' },
        { label: 'موافقات معلقة', value: pendingApprovals.length, tone: 'info' },
      ],
      columns: [
        { key: 'severity', label: 'الأهمية', type: 'badge' },
        { key: 'area', label: 'المجال' },
        { key: 'message', label: 'التنبيه' },
        { key: 'value', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['يمكن إرسال الملخص الأسبوعي إلى إدارة المنشأة عبر واتساب من خلال إشعارات النظام.'],
    };
  }

  // ── Branch & finance ─────────────────────────────────────────────────────

  public branchPerformance({ from, to }: ReportParams): ReportResult {
    const previous = previousRange(from, to);
    const branches = this.branchAccess.getSelectableBranches(this.actor());
    const rows = branches.map((branch) => {
      const sales = this.db.query<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS sales,
          COALESCE(SUM(si.gross_profit), 0) AS profit, COUNT(DISTINCT si.id) AS invoices
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [from, to, branch.id, branch.id])[0] || {};
      const previousSales = this.db.query<any>(`
        SELECT COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS sales
        FROM sales_invoices si
        WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [previous.from, previous.to, branch.id, branch.id])[0]?.sales || 0;
      const returns = this.db.query<any>(`
        SELECT COALESCE(SUM(sr.total_amount), 0) AS returns,
          COALESCE(SUM((
            SELECT SUM(sri.quantity_m2 * sri.unit_cost)
            FROM sales_return_items sri WHERE sri.return_id = sr.id
          )), 0) AS returnedCost
        FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.original_invoice_id
        WHERE sr.date >= ? AND sr.date <= ? AND si.invoice_status != 'VOID'
          AND (si.branch_id = ? OR (si.branch_id IS NULL AND (SELECT w.branch_id FROM warehouses w WHERE w.id = si.warehouse_id) = ?))
      `, [from, to, branch.id, branch.id])[0] || {};
      const expenses = this.db.query<any>(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
        WHERE date >= ? AND date <= ? AND branch_id = ?
      `, [from, to, branch.id])[0]?.total || 0;
      const collections = this.db.query<any>(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments
        WHERE date >= ? AND date <= ? AND branch_id = ?
      `, [from, to, branch.id])[0]?.total || 0;
      const stock = this.db.query<any>(`
        SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) AS value
        FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
        JOIN warehouses w ON w.id = ws.warehouse_id
        WHERE w.branch_id = ?
      `, [branch.id])[0]?.value || 0;
      const salesValue = round2(num(sales.sales));
      const returnsValue = round2(num(returns.returns));
      const netSales = round2(salesValue - returnsValue);
      const adjustedProfit = round2(num(sales.profit) - returnsValue + num(returns.returnedCost));
      return {
        branch: branch.name,
        sales: salesValue,
        returns: returnsValue,
        netSales,
        invoices: num(sales.invoices),
        averageInvoice: num(sales.invoices) ? round2(salesValue / num(sales.invoices)) : 0,
        profit: adjustedProfit,
        margin: netSales ? round2((adjustedProfit / netSales) * 100) : 0,
        expenses: round2(num(expenses)),
        collections: round2(num(collections)),
        stockValue: round2(num(stock)),
        growth: num(previousSales) ? round2(((salesValue - num(previousSales)) / Math.abs(num(previousSales))) * 100) : 0,
      };
    });
    const totalSales = round2(rows.reduce((total, row) => total + row.netSales, 0));
    const result = rows.map((row) => ({ ...row, share: totalSales ? round2((row.netSales / totalSales) * 100) : 0 }))
      .sort((a, b) => b.netSales - a.netSales);
    return {
      kpis: [
        { label: 'أفضل فرع', value: result[0]?.branch || '—', hint: fmtMoney(result[0]?.netSales), tone: 'success' },
        { label: 'أضعف فرع', value: result[result.length - 1]?.branch || '—', hint: fmtMoney(result[result.length - 1]?.netSales), tone: 'danger' },
        { label: 'إجمالي صافي المبيعات', value: totalSales, tone: 'info' },
        { label: 'إجمالي المخزون', value: round2(result.reduce((total, row) => total + row.stockValue, 0)), tone: 'neutral' },
      ],
      columns: [
        { key: 'branch', label: 'الفرع' },
        { key: 'sales', label: 'المبيعات', type: 'currency' },
        { key: 'returns', label: 'المرتجعات', type: 'currency' },
        { key: 'netSales', label: 'صافي المبيعات', type: 'currency' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'averageInvoice', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'profit', label: 'الربح', type: 'currency' },
        { key: 'margin', label: 'الهامش', type: 'percent' },
        { key: 'expenses', label: 'المصروفات', type: 'currency' },
        { key: 'collections', label: 'التحصيل', type: 'currency' },
        { key: 'stockValue', label: 'المخزون', type: 'currency' },
        { key: 'growth', label: 'النمو', type: 'percent' },
        { key: 'share', label: 'النصيب', type: 'percent' },
      ],
      rows: result,
      notes: [`مقارنة النمو مع الفترة ${previous.from} → ${previous.to}.`],
    };
  }

  public financialPosition({ to }: ReportParams): ReportResult {
    const balance = new FinancialStatementsService().getBalanceSheet(to);
    const rows: Array<Record<string, any>> = [
      ...balance.assets.map((row) => ({ section: 'الأصول', label: row.label, amount: row.amount })),
      ...balance.liabilities.map((row) => ({ section: 'الالتزامات', label: row.label, amount: row.amount })),
      ...balance.equity.map((row) => ({ section: 'حقوق الملكية', label: row.label, amount: row.amount })),
    ];
    return {
      kpis: [
        { label: 'إجمالي الأصول', value: balance.totals.assets, tone: 'info' },
        { label: 'إجمالي الالتزامات', value: balance.totals.liabilities, tone: 'warning' },
        { label: 'حقوق الملكية', value: balance.totals.equity, tone: 'success' },
        { label: 'فرق التوازن', value: balance.totals.difference, tone: Math.abs(balance.totals.difference) < 0.01 ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'section', label: 'القسم' },
        { key: 'label', label: 'البند' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: [`المركز المالي كما في ${to}. للربح خلال فترة استخدم تحليل الربحية أو الأرباح والخسائر.`],
    };
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
        c.name AS party, amount, cp.register_id AS registerId
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN cash_registers cr ON cr.id = cp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}

      UNION ALL
      SELECT date, sp.created_at, 'منصرف', 'سند صرف', receipt_number, s.name, amount, sp.register_id
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN cash_registers cr ON cr.id = sp.register_id
      WHERE date >= ? AND date <= ? AND ${registerScope.clause}

      UNION ALL
      SELECT date, ex.created_at, 'منصرف', 'مصروف', COALESCE(recipient, description), description, amount, ex.register_id
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
        invoice_number AS document, c.name AS party, paid_amount AS amount, NULL AS registerId
      FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id
      WHERE date >= ? AND date <= ? AND paid_amount > 0 AND invoice_status != 'VOID' AND ${sales.clause}

      UNION ALL
      SELECT date, pi.created_at, 'منصرف', 'سداد فاتورة شراء', invoice_number, s.name, paid_amount, NULL
      FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id
      WHERE date >= ? AND date <= ? AND paid_amount > 0 AND ${purchases.clause}
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
    const registerList = this.db.query<any>(`SELECT id, name, current_balance AS balance FROM cash_registers WHERE ${registerListScope.clause} ORDER BY name`, registerListScope.params);
    return {
      kpis: [
        { label: 'إجمالي الوارد', value: inflow, tone: 'success' },
        { label: 'إجمالي المنصرف', value: outflow, tone: 'danger' },
        { label: 'صافي الحركة', value: round2(inflow - outflow), tone: inflow >= outflow ? 'success' : 'danger' },
        { label: 'الرصيد الحالي للخزائن', value: round2(registerList.reduce((total, row) => total + num(row.balance), 0)), tone: 'info' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'direction', label: 'الاتجاه', type: 'badge' },
        { key: 'source', label: 'نوع الحركة' },
        { key: 'document', label: 'المستند' },
        { key: 'party', label: 'الطرف' },
        { key: 'amount', label: 'القيمة', type: 'currency' },
        { key: 'balance', label: 'الرصيد الجاري', type: 'currency' },
      ],
      rows: result,
      notes: registerList.length ? undefined : ['لا توجد خزائن مسجلة في النطاق الحالي.'],
    };
  }

  public cashFlowForecast({ to }: ReportParams): ReportResult {
    const start = shiftDate(to, 1);
    const salesScope = this.salesScope();
    const purchaseScope = this.purchaseScope();
    const expenseScope = this.tableScope('e.branch_id');
    const payrollScope = this.tableScope('e.branch_id');
    const installmentScope = this.tableScope('ip.branch_id');
    const cashScope = this.allBranchesTableScope('cr.branch_id');
    const openingBalance = this.db.query<any>(`
      SELECT COALESCE(SUM(cr.current_balance), 0) AS total FROM cash_registers cr
      WHERE ${cashScope.clause}
    `, cashScope.params)[0]?.total || 0;
    const weeklyPayroll = this.db.query<any>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN e.salary_type = 'MONTHLY' THEN e.base_salary / 4.0
          WHEN e.salary_type = 'DAILY' THEN (e.base_salary * 26) / 4.0
          ELSE e.base_salary / 4.0
        END), 0) AS total
      FROM employees e
      WHERE e.is_active = 1 AND e.status = 'ACTIVE' AND ${payrollScope.clause}
    `, payrollScope.params)[0]?.total || 0;
    const weeks: Array<Record<string, any>> = [];
    for (let week = 0; week < 8; week += 1) {
      const weekStart = shiftDate(start, week * 7);
      const weekEnd = shiftDate(weekStart, 6);
      const invoices = this.db.query<any>(`
        SELECT COALESCE(SUM(si.total_amount - si.paid_amount), 0) AS total FROM sales_invoices si
        WHERE si.remaining_amount > 0.01 AND si.due_date >= ? AND si.due_date <= ? AND si.invoice_status != 'VOID' AND ${salesScope.clause}
      `, [weekStart, weekEnd, ...salesScope.params])[0]?.total || 0;
      const purchases = this.db.query<any>(`
        SELECT COALESCE(SUM(pi.remaining_amount), 0) AS total FROM purchase_invoices pi
        WHERE pi.remaining_amount > 0.01 AND pi.due_date >= ? AND pi.due_date <= ? AND ${purchaseScope.clause}
      `, [weekStart, weekEnd, ...purchaseScope.params])[0]?.total || 0;
      const chequesIn = this.db.query<any>(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM cheques
        WHERE type = 'RECEIVED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED') AND due_date >= ? AND due_date <= ?
      `, [weekStart, weekEnd])[0]?.total || 0;
      const chequesOut = this.db.query<any>(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM cheques
        WHERE type = 'ISSUED' AND status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED') AND due_date >= ? AND due_date <= ?
      `, [weekStart, weekEnd])[0]?.total || 0;
      const installments = this.db.query<any>(`
        SELECT COALESCE(SUM(i.remaining_amount), 0) AS total FROM installments i
        JOIN installment_plans ip ON ip.id = i.plan_id
        WHERE i.remaining_amount > 0.01 AND i.due_date >= ? AND i.due_date <= ? AND ${installmentScope.clause}
      `, [weekStart, weekEnd, ...installmentScope.params])[0]?.total || 0;
      const expenses = this.db.query<any>(`
        SELECT COALESCE(SUM(e.amount), 0) / 30.0 * 7 AS total FROM expenses e
        WHERE e.date >= ? AND e.date <= ? AND ${expenseScope.clause}
      `, [shiftDate(to, -30), to, ...expenseScope.params])[0]?.total || 0;
      const inflow = round2(num(invoices) + num(chequesIn) + num(installments));
      const outflow = round2(num(purchases) + num(chequesOut) + num(weeklyPayroll) + num(expenses));
      weeks.push({
        week: `أسبوع ${week + 1}`,
        from: weekStart,
        to: weekEnd,
        openingBalance: round2(num(openingBalance)),
        invoices: round2(num(invoices)),
        installments: round2(num(installments)),
        chequesIn: round2(num(chequesIn)),
        inflow,
        purchases: round2(num(purchases)),
        chequesOut: round2(num(chequesOut)),
        payroll: round2(num(weeklyPayroll)),
        expenses: round2(num(expenses)),
        outflow,
        net: round2(inflow - outflow),
      });
    }
    let running = round2(num(openingBalance));
    const result: Array<Record<string, any>> = weeks.map((row) => {
      const projectedBalance = round2(running + row.net);
      running = projectedBalance;
      return { ...row, projectedBalance, cumulative: running };
    });
    const lowest = result.reduce<Record<string, any>>((min, row) => (row.cumulative < min.cumulative ? row : min), result[0]);
    return {
      kpis: [
        { label: 'الرصيد النقدي الحالي', value: round2(num(openingBalance)), tone: 'info' },
        { label: 'إجمالي الوارد المتوقع', value: round2(result.reduce((total, row) => total + row.inflow, 0)), tone: 'success' },
        { label: 'إجمالي المدفوعات المستحقة', value: round2(result.reduce((total, row) => total + row.outflow, 0)), tone: 'danger' },
        { label: 'الرصيد المتوقع في آخر أسبوع', value: lowest?.cumulative || 0, hint: lowest?.week, tone: (lowest?.cumulative || 0) < 0 ? 'danger' : 'success' },
      ],
      columns: [
        { key: 'week', label: 'الأسبوع' },
        { key: 'from', label: 'من', type: 'date' },
        { key: 'to', label: 'إلى', type: 'date' },
        { key: 'openingBalance', label: 'الرصيد الفعلي', type: 'currency' },
        { key: 'inflow', label: 'التحصيلات المتوقعة', type: 'currency' },
        { key: 'outflow', label: 'المدفوعات المستحقة', type: 'currency' },
        { key: 'net', label: 'صافي الأسبوع', type: 'currency' },
        { key: 'projectedBalance', label: 'الرصيد المتوقع', type: 'currency' },
      ],
      rows: result,
      notes: ['يبدأ التقرير من الرصيد النقدي الحالي الفعلي، ثم يضيف التحصيلات المتوقعة وخصم الالتزامات المستحقة حسب تواريخ الاستحقاق.'],
    };
  }

  public breakEven({ from, to }: ReportParams): ReportResult {
    const metrics = this.periodMetrics(from, to);
    const scope = this.tableScope('branch_id');
    const expenseRows = this.db.query<any>(`
      SELECT amount, category, description FROM expenses
      WHERE date >= ? AND date <= ? AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const totals = { fixed: 0, variable: 0, semi: 0 };
    for (const row of expenseRows) {
      const amount = num(row.amount);
      const bucket = classifyExpense(row.category, row.description);
      totals[bucket] += amount;
    }
    const revenue = round2(num(metrics.sales));
    const profit = round2(num(metrics.profit));
    const variableCost = Math.max(0, round2(revenue - profit));
    const contribution = round2(revenue - variableCost);
    const contributionMargin = revenue ? round2((contribution / revenue) * 100) : 0;
    const fixed = round2(totals.fixed + totals.semi * 0.5);
    const breakEvenRevenue = contributionMargin > 0 ? round2(fixed / (contributionMargin / 100)) : 0;
    const marginOfSafety = revenue ? round2(((revenue - breakEvenRevenue) / revenue) * 100) : 0;
    const rows = [
      { metric: 'المبيعات', value: revenue, type: 'currency' },
      { metric: 'التكلفة المتغيرة', value: variableCost, type: 'currency' },
      { metric: 'هامش المساهمة', value: contribution, type: 'currency' },
      { metric: 'نسبة هامش المساهمة', value: contributionMargin, type: 'percent' },
      { metric: 'المصروفات الثابتة', value: fixed, type: 'currency' },
      { metric: 'المصروفات شبه المتغيرة', value: round2(totals.semi), type: 'currency' },
      { metric: 'مبيعات نقطة التعادل', value: breakEvenRevenue, type: 'currency' },
      { metric: 'هامش الأمان', value: marginOfSafety, type: 'percent' },
      { metric: 'صافي الربح', value: profit, type: 'currency' },
    ];
    return {
      kpis: [
        { label: 'نقطة التعادل', value: breakEvenRevenue, hint: 'مبيعات مطلوبة لتغطية المصروفات الثابتة', tone: 'warning' },
        { label: 'هامش المساهمة', value: contributionMargin, tone: 'info' },
        { label: 'المصروفات الثابتة', value: fixed, tone: 'danger' },
        { label: 'هامش الأمان', value: marginOfSafety, tone: marginOfSafety >= 0 ? 'success' : 'danger' },
      ],
      columns: [
        { key: 'metric', label: 'البند' },
        { key: 'value', label: 'القيمة', type: 'currency' },
      ],
      rows,
      notes: ['يُصنَّف كل مصروف إلى ثابت أو متغير أو شبه متغير، فلا تُعامل جميع المصروفات كتكاليف ثابتة.'],
    };
  }

  // ── Customer behaviour & forecasting ─────────────────────────────────────

  public customerChurn({ to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const rows = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COUNT(si.id) AS invoices,
        MIN(si.date) AS firstPurchase,
        MAX(si.date) AS lastPurchase,
        COALESCE(SUM(si.subtotal - si.discount_amount), 0) AS totalSpend
      FROM customers c
      JOIN sales_invoices si ON si.customer_id = c.id AND si.invoice_status != 'VOID'
      WHERE si.date <= ? AND ${scope.clause}
      GROUP BY c.id
      HAVING lastPurchase IS NOT NULL
      ORDER BY lastPurchase ASC
    `, [to, ...scope.params]);
    const result = rows.map((row) => {
      const invoices = num(row.invoices);
      const daysSinceLast = row.lastPurchase ? daysBetween(row.lastPurchase, to) : null;
      const span = row.firstPurchase && row.lastPurchase ? Math.max(1, daysBetween(row.firstPurchase, row.lastPurchase)) : 0;
      const interval = invoices > 1 && span > 0 ? round2(span / (invoices - 1)) : null;
      const averageSpend = invoices ? round2(num(row.totalSpend) / invoices) : 0;
      const expectedNext = interval !== null && row.lastPurchase ? shiftDate(row.lastPurchase, Math.round(interval)) : '';
      const atRisk = interval !== null && daysSinceLast !== null && daysSinceLast > interval;
      return {
        customer: row.customer,
        phone: row.phone,
        invoices,
        lastPurchase: row.lastPurchase,
        daysSinceLast,
        interval,
        expectedNext,
        averageSpend,
        atRiskValue: atRisk ? averageSpend : 0,
        status: atRisk ? 'معرض للفقد' : 'منتظم',
      };
    }).sort((a, b) => b.atRiskValue - a.atRiskValue);
    return {
      kpis: [
        { label: 'عملاء معرضون للفقد', value: result.filter((row) => row.status === 'معرض للفقد').length, tone: 'danger' },
        { label: 'القيمة المعرضة', value: round2(result.reduce((total, row) => total + row.atRiskValue, 0)), tone: 'warning' },
        { label: 'إجمالي العملاء', value: result.length, tone: 'info' },
        { label: 'متوسط أيام الغياب', value: result.length ? round2(result.reduce((total, row) => total + num(row.daysSinceLast), 0) / result.length) : 0, tone: 'neutral' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'invoices', label: 'عدد الفواتير', type: 'number' },
        { key: 'lastPurchase', label: 'آخر شراء', type: 'date' },
        { key: 'daysSinceLast', label: 'أيام منذ آخر شراء', type: 'number' },
        { key: 'interval', label: 'إيقاع الشراء (يوم)', type: 'number' },
        { key: 'expectedNext', label: 'الشراء المتوقع', type: 'date' },
        { key: 'averageSpend', label: 'متوسط الفاتورة', type: 'currency' },
        { key: 'atRiskValue', label: 'القيمة المعرضة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public paymentBehavior({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('cp.branch_id');
    const rows = this.db.query<any>(`
      SELECT c.id AS customerId, c.name AS customer, c.phone,
        COALESCE(c.payment_terms_days, 0) AS terms,
        COUNT(DISTINCT cp.id) AS payments,
        COALESCE(AVG(CASE WHEN a.sales_invoice_id IS NOT NULL
          THEN julianday(cp.date) - julianday(si.date) END), 0) AS avgDays,
        COALESCE(MAX(CASE WHEN a.sales_invoice_id IS NOT NULL
          THEN julianday(cp.date) - julianday(si.date) END), 0) AS maxDays,
        COALESCE(SUM(cp.amount), 0) AS totalPaid
      FROM customer_payments cp
      LEFT JOIN customers c ON c.id = cp.customer_id
      LEFT JOIN customer_payment_allocations a ON a.payment_id = cp.id
      LEFT JOIN sales_invoices si ON si.id = a.sales_invoice_id
      WHERE cp.date >= ? AND cp.date <= ? AND ${scope.clause}
      GROUP BY c.id
      ORDER BY avgDays DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => {
      const terms = num(row.terms);
      const avgDays = round2(num(row.avgDays));
      const maxDays = round2(num(row.maxDays));
      const adherence = terms > 0 ? round2(Math.min(100, (terms / Math.max(1, avgDays)) * 100)) : 0;
      return {
        customer: row.customer,
        phone: row.phone,
        terms,
        payments: num(row.payments),
        avgDays,
        maxDays,
        lateDays: round2(Math.max(0, avgDays - terms)),
        adherence,
        totalPaid: round2(num(row.totalPaid)),
        status: avgDays <= terms ? 'ملتزم' : 'متأخر',
      };
    });
    return {
      kpis: [
        { label: 'إجمالي المدفوعات', value: round2(result.reduce((total, row) => total + row.totalPaid, 0)), tone: 'success' },
        { label: 'متوسط أيام السداد', value: result.length ? round2(result.reduce((total, row) => total + row.avgDays, 0) / result.length) : 0, tone: 'info' },
        { label: 'عملاء متأخرون', value: result.filter((row) => row.status === 'متأخر').length, tone: 'danger' },
        { label: 'أطول تأخير', value: round2(Math.max(0, ...result.map((row) => row.maxDays))), tone: 'warning' },
      ],
      columns: [
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'terms', label: 'المدة المتفق عليها', type: 'number' },
        { key: 'payments', label: 'عدد الدفعات', type: 'number' },
        { key: 'avgDays', label: 'متوسط أيام السداد', type: 'number' },
        { key: 'maxDays', label: 'أطول تأخير', type: 'number' },
        { key: 'lateDays', label: 'أيام التأخير', type: 'number' },
        { key: 'adherence', label: 'نسبة الالتزام', type: 'percent' },
        { key: 'totalPaid', label: 'إجمالي المدفوع', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
      notes: ['يعتمد متوسط أيام السداد على تخصيص الدفعات للفواتير عند تسجيلها.'],
    };
  }

  public basketAnalysis({ from, to }: ReportParams): ReportResult {
    const scope = this.salesScope();
    const rows = this.db.query<any>(`
      SELECT a.product_id AS productA, pa.name AS productAName,
        b.product_id AS productB, pb.name AS productBName,
        COUNT(*) AS invoices,
        SUM(a.total_price) AS valueA, SUM(b.total_price) AS valueB
      FROM sales_invoice_items a
      JOIN sales_invoice_items b ON b.invoice_id = a.invoice_id AND a.product_id < b.product_id
      JOIN sales_invoices si ON si.id = a.invoice_id
      JOIN products pa ON pa.id = a.product_id
      JOIN products pb ON pb.id = b.product_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      GROUP BY a.product_id, b.product_id
      ORDER BY invoices DESC
      LIMIT 200
    `, [from, to, ...scope.params]);
    const invoiceCount = this.db.query<any>(`
      SELECT COUNT(DISTINCT si.id) AS count FROM sales_invoices si
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID' AND ${scope.clause}
    `, [from, to, ...scope.params])[0]?.count || 0;
    const result = rows.map((row) => ({
      productA: row.productAName,
      productB: row.productBName,
      invoices: num(row.invoices),
      support: invoiceCount ? round2((num(row.invoices) / invoiceCount) * 100) : 0,
      combinedValue: round2(num(row.valueA) + num(row.valueB)),
    }));
    return {
      kpis: [
        { label: 'أزواج منتجات', value: result.length, tone: 'info' },
        { label: 'أقوى اقتران', value: result[0] ? `${result[0].productA} + ${result[0].productB}` : '—', hint: `${result[0]?.invoices || 0} فاتورة`, tone: 'success' },
        { label: 'متوسط قيمة الزوج', value: result.length ? round2(result.reduce((total, row) => total + row.combinedValue, 0) / result.length) : 0, tone: 'neutral' },
      ],
      columns: [
        { key: 'productA', label: 'الصنف الأول' },
        { key: 'productB', label: 'الصنف الثاني' },
        { key: 'invoices', label: 'عدد الفواتير معًا', type: 'number' },
        { key: 'support', label: 'نسبة التكرار', type: 'percent' },
        { key: 'combinedValue', label: 'القيمة المشتركة', type: 'currency' },
      ],
      rows: result,
      notes: ['استخدم هذه الأزواج في عروض «اشتري ده وخد ده» وترتيب الرفوف.'],
    };
  }

  // --------------------------------------------------------------------------
  // New Enhanced Reports: Cash Flow Detailed & Sales Rep Performance
  // --------------------------------------------------------------------------

  public cashFlowDetailed(params: ReportParams): ReportResult {
    const actor = this.actor();
    const key = `${this.cachePartition(actor)}:cashFlowDetailed:${params.from}:${params.to}:${params.registerId || 'all'}`;
    return this.withCache(key, () => {
    const sales = this.allBranchesScope();
    const customerPayment = this.allBranchesTableScope(
      'cp.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = cp.register_id)',
    );
    const supplierPayment = this.allBranchesTableScope(
      'sp.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = sp.register_id)',
    );
    const expenses = this.allBranchesTableScope(
      'ex.branch_id',
      '(SELECT br.branch_id FROM cash_registers br WHERE br.id = ex.register_id)',
    );
    const registerFilter = params.registerId ? 'AND registerId = ?' : '';
    const rows = this.db.query<any>(`
      SELECT * FROM (
        SELECT si.date AS transDate, 'IN' AS transType, COALESCE(sip.method, si.payment_type) AS category,
          COALESCE(sip.amount, si.paid_amount) AS amount, 'تحصيل فاتورة بيع ' || si.invoice_number AS description,
          cr.id AS registerId, cr.name AS registerName, u.full_name AS userName
        FROM sales_invoices si
        LEFT JOIN sales_invoice_payments sip ON sip.invoice_id = si.id
        LEFT JOIN cash_shifts cs ON cs.id = si.shift_id
        LEFT JOIN cash_registers cr ON cr.id = cs.register_id
        LEFT JOIN users u ON u.id = si.created_by
        WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
          AND si.paid_amount > 0
          AND (sip.id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM sales_invoice_payments sip0 WHERE sip0.invoice_id = si.id
          ))
          AND ${sales.clause}

        UNION ALL
        SELECT cp.date, 'IN', cp.payment_type, cp.amount,
          'سند قبض ' || cp.receipt_number, cr.id, cr.name, u.full_name
        FROM customer_payments cp
        LEFT JOIN cash_registers cr ON cr.id = cp.register_id
        LEFT JOIN users u ON u.id = cp.performed_by
        WHERE cp.date BETWEEN ? AND ? AND ${customerPayment.clause}

        UNION ALL
        SELECT sp.date, 'OUT', sp.payment_type, sp.amount,
          'سند صرف ' || sp.receipt_number, cr.id, cr.name, u.full_name
        FROM supplier_payments sp
        LEFT JOIN cash_registers cr ON cr.id = sp.register_id
        LEFT JOIN users u ON u.id = sp.performed_by
        WHERE sp.date BETWEEN ? AND ? AND ${supplierPayment.clause}

        UNION ALL
        SELECT ex.date, 'OUT', ex.payment_type, ex.amount,
          COALESCE(ex.description, ex.category), cr.id, cr.name, u.full_name
        FROM expenses ex
        LEFT JOIN cash_registers cr ON cr.id = ex.register_id
        LEFT JOIN users u ON u.id = ex.performed_by
        WHERE ex.date BETWEEN ? AND ? AND ${expenses.clause}
      ) movements
      WHERE 1 = 1 ${registerFilter}
      ORDER BY transDate DESC
    `, [
      params.from, params.to, ...sales.params,
      params.from, params.to, ...customerPayment.params,
      params.from, params.to, ...supplierPayment.params,
      params.from, params.to, ...expenses.params,
      ...(params.registerId ? [params.registerId] : []),
    ]);

      let totalIn = 0;
      let totalOut = 0;

      const formattedRows = rows.map((r) => {
        const amt = num(r.amount);
        const isIn = r.transType === 'IN';
        const absAmt = Math.abs(amt);
        if (isIn) {
          totalIn += absAmt;
        } else {
          totalOut += absAmt;
        }

    return {
          transDate: String(r.transDate || '').slice(0, 16).replace('T', ' '),
          registerName: r.registerName || 'غير محددة',
          category: r.category || (isIn ? 'مقبوضات' : 'مدفوعات'),
          description: r.description || (isIn ? 'تحصيل نقدي' : 'صرف نقدي'),
          inflow: isIn ? round2(absAmt) : 0,
          outflow: !isIn ? round2(absAmt) : 0,
          userName: r.userName || '—',
          status: isIn ? 'وارد' : 'منصرف',
        };
      });

      const netCash = round2(totalIn - totalOut);

      return {
        kpis: [
          { label: 'إجمالي المقبوضات (وارد)', value: round2(totalIn), tone: 'success' },
          { label: 'إجمالي المصروفات (منصرف)', value: round2(totalOut), tone: 'danger' },
          { label: 'صافي التدفق النقدي', value: netCash, tone: netCash >= 0 ? 'success' : 'danger' },
          { label: 'عدد العمليات النقدية', value: rows.length, tone: 'neutral' },
        ],
        columns: [
          { key: 'transDate', label: 'التاريخ والوقت', type: 'text' },
          { key: 'registerName', label: 'الخزينة' },
          { key: 'category', label: 'التصنيف' },
          { key: 'description', label: 'البيان / الوصف' },
          { key: 'inflow', label: 'وارد (+)', type: 'currency' },
          { key: 'outflow', label: 'منصرف (-)', type: 'currency' },
          { key: 'userName', label: 'المستخدم' },
          { key: 'status', label: 'الحركة', type: 'badge' },
        ],
        rows: formattedRows,
        notes: ['يعرض التقرير التحصيلات المسجلة على الفواتير والسندات والمصروفات؛ لا تشمل الأرقام حركات نقدية غير مسجلة في هذه المستندات.'],
    };
    });
  }

  public salesRepPerformance(params: ReportParams): ReportResult {
    const actor = this.actor();
    const key = `${this.cachePartition(actor)}:salesRepPerformance:${params.from}:${params.to}`;
    return this.withCache(key, () => {
      const scope = this.salesScope();
      const rows = this.db.query<any>(`
        SELECT
          COALESCE(e.full_name, u.full_name, 'غير محدد') AS repName,
          COUNT(si.id) AS invoiceCount,
          COALESCE(SUM(si.total_amount), 0) AS totalSales,
          COALESCE(SUM(si.paid_amount), 0) AS totalCollected,
          COALESCE(SUM(si.remaining_amount), 0) AS totalPending,
          COALESCE(SUM(si.gross_profit), 0) AS estimatedProfit
        FROM sales_invoices si
        LEFT JOIN orders o ON o.invoice_id = si.id
        LEFT JOIN employees e ON e.id = o.sales_rep_id
        LEFT JOIN users u ON u.id = si.created_by
        WHERE si.date BETWEEN ? AND ?
          AND si.invoice_status != 'VOID'
          AND ${scope.clause}
        GROUP BY COALESCE(e.full_name, u.full_name, 'غير محدد')
        ORDER BY totalSales DESC
      `, [params.from, params.to, ...scope.params]);

      const totalSalesAll = sum(rows, 'totalSales');
      const totalCollectedAll = sum(rows, 'totalCollected');
      const totalProfitAll = sum(rows, 'estimatedProfit');

      const mapped = rows.map((r) => {
        const sales = num(r.totalSales);
        const col = num(r.totalCollected);
        const profit = num(r.estimatedProfit);
        const colRate = sales > 0 ? round2((col / sales) * 100) : 0;
        const margin = sales > 0 ? round2((profit / sales) * 100) : 0;

        return {
          repName: r.repName,
          invoiceCount: num(r.invoiceCount),
          totalSales: round2(sales),
          totalCollected: round2(col),
          totalPending: round2(num(r.totalPending)),
          collectionRate: colRate,
          estimatedProfit: round2(profit),
          profitMargin: margin,
          performanceBadge: colRate >= 80 ? 'ممتاز' : colRate >= 50 ? 'متوسط' : 'يحتاج متابعة',
        };
      });

      return {
        kpis: [
          { label: 'إجمالي مبيعات الفريق', value: round2(totalSalesAll), tone: 'info' },
          { label: 'إجمالي التحصيلات', value: round2(totalCollectedAll), tone: 'success' },
          { label: 'إجمالي الأرباح المقدرة', value: round2(totalProfitAll), tone: 'success' },
          { label: 'مندوب المبيعات', value: mapped[0]?.totalSales || 0, hint: mapped[0]?.repName || '—', tone: 'neutral' },
        ],
        columns: [
          { key: 'repName', label: 'مندوب المبيعات' },
          { key: 'invoiceCount', label: 'عدد الفواتير', type: 'number' },
          { key: 'totalSales', label: 'إجمالي المبيعات', type: 'currency' },
          { key: 'totalCollected', label: 'المحصل', type: 'currency' },
          { key: 'totalPending', label: 'المتبقي / آجل', type: 'currency' },
          { key: 'collectionRate', label: 'نسبة التحصيل', type: 'percent' },
          { key: 'estimatedProfit', label: 'الأرباح التقديرية', type: 'currency' },
          { key: 'profitMargin', label: 'هامش الربح', type: 'percent' },
          { key: 'performanceBadge', label: 'التقييم', type: 'badge' },
        ],
        rows: mapped,
        notes: ['يُجمّع التقرير حسب مندوب المبيعات عند توفره، مع احتياطية إلى منشئ الفاتورة عند غياب المندوب الفعلي.'],
      };
    });
  }

  public demandForecast({ to }: ReportParams): ReportResult {
    const salesScope = this.salesScope();
    const stockScope = this.tableScope('w.branch_id');
    const rows = this.db.query<any>(`
      SELECT p.id AS productId, p.sku, p.name AS product,
        COALESCE(SUM(CASE WHEN si.id IS NOT NULL THEN sii.quantity_m2 ELSE 0 END), 0) AS sold12m,
        COALESCE(SUM(CASE WHEN si.date >= ? THEN sii.quantity_m2 ELSE 0 END), 0) AS soldLast90,
        COALESCE(SUM(CASE WHEN si.date >= ? THEN sii.quantity_m2 ELSE 0 END), 0) AS soldPrevYearMonth,
        COALESCE((SELECT SUM(ws.quantity_m2) FROM warehouse_stock ws
          JOIN warehouses w ON w.id = ws.warehouse_id
          WHERE ws.product_id = p.id AND ${stockScope.clause}), 0) AS stock,
        COALESCE(p.min_stock_level, 0) AS minLevel
      FROM products p
      LEFT JOIN sales_invoice_items sii ON sii.product_id = p.id
      LEFT JOIN sales_invoices si ON si.id = sii.invoice_id AND si.invoice_status != 'VOID' AND ${salesScope.clause}
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY sold12m DESC
    `, [shiftDate(to, -90), shiftDate(to, -365), ...stockScope.params, ...salesScope.params]);
    const result = rows.map((row) => {
      const monthlyAverage = round2(num(row.sold12m) / 12);
      const last90 = num(row.soldLast90) / 3;
      const seasonal = last90 > 0 ? round2(Math.max(0, last90)) : monthlyAverage;
      const forecast = round2((monthlyAverage + seasonal) / 2);
      const daily = forecast / 30;
      const stock = num(row.stock);
      const coverage = daily > 0 ? Math.round(stock / daily) : null;
      const suggested = round2(Math.max(0, forecast * 1.5 - stock));
      return {
        sku: row.sku,
        product: row.product,
        sold12m: round2(num(row.sold12m)),
        monthlyAverage,
        forecast,
        stock: round2(stock),
        coverage,
        suggested,
        status: coverage !== null && coverage <= 15 ? 'نفاد قريب' : coverage !== null && coverage <= 30 ? 'يحتاج متابعة' : 'آمن',
      };
    }).sort((a, b) => b.forecast - a.forecast);
    return {
      kpis: [
        { label: 'أصناف نفاد قريب', value: result.filter((row) => row.status === 'نفاد قريب').length, tone: 'danger' },
        { label: 'أصناف تحتاج متابعة', value: result.filter((row) => row.status === 'يحتاج متابعة').length, tone: 'warning' },
        { label: 'إجمالي الكمية المقترحة', value: round2(result.reduce((total, row) => total + row.suggested, 0)), tone: 'info' },
        { label: 'أعلى توقع شهري', value: result[0]?.forecast || 0, hint: result[0]?.product, tone: 'neutral' },
      ],
      columns: [
        { key: 'product', label: 'الصنف' },
        { key: 'sku', label: 'الكود' },
        { key: 'sold12m', label: 'مبيعات 12 شهر', type: 'qty' },
        { key: 'monthlyAverage', label: 'المتوسط الشهري', type: 'qty' },
        { key: 'forecast', label: 'توقع الشهر القادم', type: 'qty' },
        { key: 'stock', label: 'المخزون', type: 'qty' },
        { key: 'coverage', label: 'أيام التغطية', type: 'number' },
        { key: 'suggested', label: 'الكمية المقترحة', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
      notes: ['التوقع = متوسط المبيعات الشهرية للسنة الماضية مع موسمية آخر 3 أشهر. الكمية المقترحة تغطي 1.5 شهر بعد الرصيد الحالي.'],
    };
  }

  public hrPayrollSummary({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('pr.branch_id');
    const rows = this.db.query<any>(`
      SELECT pr.period, COALESCE(e.name, '—') AS employeeName,
        COALESCE(prt.base_amount, 0) AS baseAmount,
        COALESCE(prt.overtime_amount, 0) AS overtimeAmount,
        COALESCE(prt.bonus_amount, 0) AS bonusAmount,
        COALESCE(prt.commission_amount, 0) AS commissionAmount,
        COALESCE(prt.attendance_deduction_amount, 0) AS attendanceDeduction,
        COALESCE(prt.manual_deduction_amount, 0) AS manualDeduction,
        COALESCE(prt.advance_amount, 0) AS advanceAmount,
        COALESCE(prt.tax_amount, 0) AS taxAmount,
        COALESCE(prt.net_amount, 0) AS netAmount,
        COALESCE(prt.payment_method, 'CASH') AS paymentMethod,
        COALESCE(prt.payout_status, 'PENDING') AS payoutStatus
      FROM payroll_runs pr
      JOIN payroll_run_items prt ON prt.payroll_run_id = pr.id
      LEFT JOIN employees e ON e.id = prt.employee_id
      WHERE pr.period >= ? AND pr.period <= ? AND ${scope.clause}
      ORDER BY pr.period, e.name
    `, [from.slice(0, 7), to.slice(0, 7), ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      baseAmount: round2(num(row.baseAmount)),
      overtimeAmount: round2(num(row.overtimeAmount)),
      bonusAmount: round2(num(row.bonusAmount)),
      commissionAmount: round2(num(row.commissionAmount)),
      attendanceDeduction: round2(num(row.attendanceDeduction)),
      manualDeduction: round2(num(row.manualDeduction)),
      advanceAmount: round2(num(row.advanceAmount)),
      taxAmount: round2(num(row.taxAmount)),
      netAmount: round2(num(row.netAmount)),
    }));
    return {
      kpis: [
        { label: 'دورات/موظفين', value: result.length, tone: 'info' },
        { label: 'إجمالي الاستحقاقات', value: round2(result.reduce((t, r) => t + r.baseAmount + r.overtimeAmount + r.bonusAmount + r.commissionAmount, 0)), tone: 'success' },
        { label: 'إجمالي الخصومات والضرائب', value: round2(result.reduce((t, r) => t + r.attendanceDeduction + r.manualDeduction + r.advanceAmount + r.taxAmount, 0)), tone: 'danger' },
        { label: 'صافي الرواتب', value: round2(result.reduce((t, r) => t + r.netAmount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'period', label: 'الفترة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'baseAmount', label: 'الأساسي', type: 'currency' },
        { key: 'overtimeAmount', label: 'إضافي', type: 'currency' },
        { key: 'bonusAmount', label: 'مكافأة', type: 'currency' },
        { key: 'commissionAmount', label: 'عمولة', type: 'currency' },
        { key: 'attendanceDeduction', label: 'غياب/تأخير', type: 'currency' },
        { key: 'manualDeduction', label: 'خصومات', type: 'currency' },
        { key: 'advanceAmount', label: 'سلف', type: 'currency' },
        { key: 'taxAmount', label: 'ضريبة', type: 'currency' },
        { key: 'netAmount', label: 'الصافي', type: 'currency' },
        { key: 'paymentMethod', label: 'طريقة الصرف', type: 'badge' },
        { key: 'payoutStatus', label: 'حالة الصرف', type: 'badge' },
      ],
      rows: result,
      notes: ['يستخدم دورات الرواتب (مسودة/معتمدة/مصروفة).'],
    };
  }

  public hrPayrollPayouts({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('pt.branch_id');
    const rows = this.db.query<any>(`
      SELECT pt.date, COALESCE(e.name, '—') AS employeeName, pt.type, pt.amount,
        COALESCE(pt.payment_method, 'CASH') AS paymentMethod,
        pt.bank_account_id AS bankAccountId, pt.reference_number AS referenceNumber,
        pt.proof_reference AS proofReference, pt.payment_status AS paymentStatus
      FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.type = 'SALARY_PAYOUT' AND substr(pt.date, 1, 10) >= ? AND substr(pt.date, 1, 10) <= ?
        AND ${scope.clause}
      ORDER BY pt.date DESC, e.name
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      amount: round2(num(row.amount)),
    }));
    const byMethod = (method: string) => result.filter((row) => row.paymentMethod === method);
    return {
      kpis: [
        { label: 'عدد عمليات الصرف', value: result.length, tone: 'info' },
        { label: 'نقدي', value: round2(byMethod('CASH').reduce((t, r) => t + r.amount, 0)), tone: 'success' },
        { label: 'تحويل بنكي', value: round2(byMethod('BANK_TRANSFER').reduce((t, r) => t + r.amount, 0)), tone: 'info' },
        { label: 'محفظة', value: round2(byMethod('WALLET').reduce((t, r) => t + r.amount, 0)), tone: 'warning' },
      ],
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'paymentMethod', label: 'الطريقة', type: 'badge' },
        { key: 'bankAccountId', label: 'الحساب البنكي' },
        { key: 'referenceNumber', label: 'المرجع' },
        { key: 'proofReference', label: 'الإثبات' },
        { key: 'paymentStatus', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public hrAttendanceSummary({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('e.branch_id');
    const rows = this.db.query<any>(`
      SELECT e.id AS employeeId, COALESCE(e.name, '—') AS employeeName,
        COUNT(a.id) AS days, COALESCE(SUM(a.worked_minutes), 0) AS workedMinutes,
        COALESCE(SUM(a.late_minutes), 0) AS lateMinutes,
        COALESCE(SUM(a.overtime_minutes), 0) AS overtimeMinutes,
        COALESCE(SUM(CASE WHEN a.overtime_approved = 1 THEN a.overtime_minutes ELSE 0 END), 0) AS approvedOvertime
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date >= ? AND a.date <= ?
      WHERE e.is_active = 1 AND ${scope.clause}
      GROUP BY e.id, e.name
      ORDER BY e.name
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      days: num(row.days),
      workedMinutes: num(row.workedMinutes),
      lateMinutes: num(row.lateMinutes),
      overtimeMinutes: num(row.overtimeMinutes),
      approvedOvertime: num(row.approvedOvertime),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'أيام حضور', value: result.reduce((t, r) => t + r.days, 0), tone: 'info' },
        { label: 'دقائق تأخير', value: result.reduce((t, r) => t + r.lateMinutes, 0), tone: 'warning' },
        { label: 'عمل إضافي (دقائق)', value: result.reduce((t, r) => t + r.overtimeMinutes, 0), tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'days', label: 'أيام', type: 'qty' },
        { key: 'workedMinutes', label: 'عمل (دقائق)', type: 'qty' },
        { key: 'lateMinutes', label: 'تأخير (دقائق)', type: 'qty' },
        { key: 'overtimeMinutes', label: 'إضافي (دقائق)', type: 'qty' },
        { key: 'approvedOvertime', label: 'إضافي معتمد (دقائق)', type: 'qty' },
      ],
      rows: result,
      notes: ['يعتمد على جدول الحضور (attendance) المُحدّث من periods/shifts.'],
    };
  }

  public hrLeaveSummary({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('lr.branch_id');
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, lr.leave_type AS leaveType,
        lr.start_date AS startDate, lr.end_date AS endDate, lr.days, lr.status,
        lr.reason, lr.decision_note AS decisionNote
      FROM employee_leave_requests lr
      LEFT JOIN employees e ON e.id = lr.employee_id
      WHERE lr.start_date <= ? AND lr.end_date >= ? AND ${scope.clause}
      ORDER BY lr.start_date DESC, e.name
    `, [to, from, ...scope.params]);
    const result = rows.map((row) => ({ ...row, days: num(row.days) }));
    return {
      kpis: [
        { label: 'طلبات', value: result.length, tone: 'info' },
        { label: 'معتمدة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'معلقة', value: result.filter((r) => r.status === 'PENDING').length, tone: 'warning' },
        { label: 'أيام إجازة', value: result.reduce((t, r) => t + (r.status === 'APPROVED' ? r.days : 0), 0), tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'leaveType', label: 'النوع', type: 'badge' },
        { key: 'startDate', label: 'من', type: 'date' },
        { key: 'endDate', label: 'إلى', type: 'date' },
        { key: 'days', label: 'أيام', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'reason', label: 'السبب' },
        { key: 'decisionNote', label: 'ملاحظة القرار' },
      ],
      rows: result,
    };
  }

  public hrTaxSummary({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('pr.branch_id');
    const rows = this.db.query<any>(`
      SELECT pr.period, COALESCE(e.name, '—') AS employeeName,
        COALESCE(prt.tax_amount, 0) AS taxAmount,
        COALESCE(json_extract(prt.detail_json, '$.taxRuleName'), '—') AS taxRuleName,
        COALESCE(json_extract(prt.detail_json, '$.taxSource'), '—') AS taxSource,
        COALESCE(json_extract(prt.detail_json, '$.taxableAmount'), 0) AS taxableAmount,
        COALESCE(json_extract(prt.detail_json, '$.taxExemptionAmount'), 0) AS exemptionAmount
      FROM payroll_runs pr
      JOIN payroll_run_items prt ON prt.payroll_run_id = pr.id
      LEFT JOIN employees e ON e.id = prt.employee_id
      WHERE pr.period >= ? AND pr.period <= ? AND ${scope.clause}
      ORDER BY pr.period, e.name
    `, [from.slice(0, 7), to.slice(0, 7), ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      taxAmount: round2(num(row.taxAmount)),
      taxableAmount: round2(num(row.taxableAmount)),
      exemptionAmount: round2(num(row.exemptionAmount)),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'إجمالي الضريبة', value: round2(result.reduce((t, r) => t + r.taxAmount, 0)), tone: 'danger' },
        { label: 'إجمالي الخاضع', value: round2(result.reduce((t, r) => t + r.taxableAmount, 0)), tone: 'info' },
        { label: 'إجمالي الإعفاءات', value: round2(result.reduce((t, r) => t + r.exemptionAmount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'period', label: 'الفترة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'taxRuleName', label: 'قاعدة الضريبة' },
        { key: 'taxSource', label: 'المصدر', type: 'badge' },
        { key: 'taxableAmount', label: 'الخاضع', type: 'currency' },
        { key: 'exemptionAmount', label: 'الإعفاء', type: 'currency' },
        { key: 'taxAmount', label: 'الضريبة', type: 'currency' },
      ],
      rows: result,
    };
  }


  public hrVacancies({ from: _from, to: _to }: ReportParams): ReportResult {
    const scope = this.tableScope('d.branch_id');
    const rows = this.db.query<any>(`
      SELECT d.id AS departmentId, d.name AS departmentName,
        COALESCE(d.required_headcount, 0) AS requiredHeadcount,
        (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.is_active = 1) AS actualHeadcount
      FROM departments d
      WHERE d.is_active = 1 AND ${scope.clause}
      ORDER BY d.name
    `, scope.params);
    const result = rows.map((row) => ({
      ...row,
      requiredHeadcount: num(row.requiredHeadcount),
      actualHeadcount: num(row.actualHeadcount),
      vacant: Math.max(0, num(row.requiredHeadcount) - num(row.actualHeadcount)),
    }));
    return {
      kpis: [
        { label: 'أقسام', value: result.length, tone: 'info' },
        { label: 'مطلوب', value: result.reduce((t, r) => t + r.requiredHeadcount, 0), tone: 'info' },
        { label: 'فعلي', value: result.reduce((t, r) => t + r.actualHeadcount, 0), tone: 'success' },
        { label: 'شاغر', value: result.reduce((t, r) => t + r.vacant, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'departmentName', label: 'القسم' },
        { key: 'requiredHeadcount', label: 'المطلوب', type: 'qty' },
        { key: 'actualHeadcount', label: 'الفعلي', type: 'qty' },
        { key: 'vacant', label: 'الشاغر', type: 'qty' },
      ],
      rows: result,
    };
  }

  public hrOnboarding({ from: _from, to: _to }: ReportParams): ReportResult {
    const scope = this.tableScope('e.branch_id');
    const rows = this.db.query<any>(`
      SELECT e.id AS employeeId, COALESCE(e.name, '—') AS employeeName,
        COUNT(t.id) AS total,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN t.status = 'PENDING' AND (t.due_date IS NULL OR t.due_date <= ?) THEN 1 ELSE 0 END) AS overdue
      FROM employees e
      LEFT JOIN employee_onboarding_tasks t ON t.employee_id = e.id
      WHERE ${scope.clause}
      GROUP BY e.id, e.name
      HAVING COUNT(t.id) > 0
      ORDER BY e.name
    `, [_to, ...scope.params]);
    const result = rows.map((row) => ({
      ...row,
      total: num(row.total),
      completed: num(row.completed),
      pending: num(row.pending),
      overdue: num(row.overdue),
    }));
    return {
      kpis: [
        { label: 'موظفون', value: result.length, tone: 'info' },
        { label: 'مهام', value: result.reduce((t, r) => t + r.total, 0), tone: 'info' },
        { label: 'مكتملة', value: result.reduce((t, r) => t + r.completed, 0), tone: 'success' },
        { label: 'متأخرة', value: result.reduce((t, r) => t + r.overdue, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'total', label: 'المهام', type: 'qty' },
        { key: 'completed', label: 'مكتملة', type: 'qty' },
        { key: 'pending', label: 'معلقة', type: 'qty' },
        { key: 'overdue', label: 'متأخرة', type: 'qty' },
      ],
      rows: result,
    };
  }

  public hrProbation({ from, to }: ReportParams): ReportResult {
    const scope = this.tableScope('e.branch_id');
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, r.review_date AS reviewDate,
        r.score, r.rating, r.recommendation, r.status
      FROM employee_probation_reviews r
      LEFT JOIN employees e ON e.id = r.employee_id
      WHERE r.review_date >= ? AND r.review_date <= ? AND ${scope.clause}
      ORDER BY r.review_date DESC
    `, [from, to, ...scope.params]);
    const result = rows.map((row) => ({ ...row, score: num(row.score) }));
    return {
      kpis: [
        { label: 'تقييمات', value: result.length, tone: 'info' },
        { label: 'معتمدة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'معلقة', value: result.filter((r) => r.status !== 'APPROVED').length, tone: 'warning' },
        { label: 'متوسط الدرجة', value: result.length ? round2(result.reduce((t, r) => t + r.score, 0) / result.length) : 0, tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'reviewDate', label: 'التاريخ', type: 'date' },
        { key: 'score', label: 'الدرجة', type: 'number' },
        { key: 'rating', label: 'التقييم', type: 'badge' },
        { key: 'recommendation', label: 'التوصية', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }


  public hrViolations({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, v.violation_type AS violationType,
        v.severity, v.status, v.occurred_at AS occurredAt, v.description
      FROM hr_violations v
      LEFT JOIN employees e ON e.id = v.employee_id
      WHERE v.occurred_at >= ? AND v.occurred_at <= ? AND (e.branch_id IS NULL OR e.branch_id IN (
        SELECT id FROM branches WHERE id = e.branch_id
      ))
      ORDER BY v.occurred_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'مخالفات', value: result.length, tone: 'info' },
        { label: 'حرجة', value: result.filter((r) => r.severity === 'CRITICAL').length, tone: 'danger' },
        { label: 'كبيرة', value: result.filter((r) => r.severity === 'MAJOR').length, tone: 'warning' },
        { label: 'مغلقة', value: result.filter((r) => r.status === 'CLOSED').length, tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'violationType', label: 'النوع' },
        { key: 'severity', label: 'الخطورة', type: 'badge' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'occurredAt', label: 'التاريخ', type: 'date' },
        { key: 'description', label: 'الوصف' },
      ],
      rows: result,
    };
  }

  public hrComplaints({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, c.subject, c.status, c.submitted_at AS submittedAt,
        c.resolved_at AS resolvedAt, c.resolution
      FROM hr_complaints c
      LEFT JOIN employees e ON e.id = c.employee_id
      WHERE c.submitted_at >= ? AND c.submitted_at <= ?
      ORDER BY c.submitted_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'شكاوى', value: result.length, tone: 'info' },
        { label: 'مفتوحة', value: result.filter((r) => r.status === 'OPEN' || r.status === 'UNDER_REVIEW').length, tone: 'warning' },
        { label: 'محلولة', value: result.filter((r) => r.status === 'RESOLVED').length, tone: 'success' },
        { label: 'مرفوضة', value: result.filter((r) => r.status === 'REJECTED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'subject', label: 'الموضوع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'submittedAt', label: 'تاريخ التقديم', type: 'date' },
        { key: 'resolvedAt', label: 'تاريخ الحل', type: 'date' },
        { key: 'resolution', label: 'القرار' },
      ],
      rows: result,
    };
  }

  public hrPenaltiesReport({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, p.penalty_type AS penaltyType, p.amount, p.status,
        p.approved_at AS approvedAt, p.notes
      FROM hr_penalties p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE p.created_at >= ? AND p.created_at <= ?
      ORDER BY p.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'جزاءات', value: result.length, tone: 'info' },
        { label: 'معتمدة/مرحّلة', value: result.filter((r) => r.status === 'POSTED' || r.status === 'APPROVED').length, tone: 'success' },
        { label: 'مسودات', value: result.filter((r) => r.status === 'DRAFT').length, tone: 'warning' },
        { label: 'إجمالي', value: result.reduce((t, r) => t + r.amount, 0), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'penaltyType', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'approvedAt', label: 'تاريخ الاعتماد', type: 'date' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: result,
    };
  }


  public hrWarnings({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, w.warning_type AS warningType, w.status,
        w.issued_at AS issuedAt, w.notes
      FROM hr_warnings w
      LEFT JOIN employees e ON e.id = w.employee_id
      WHERE w.issued_at >= ? AND w.issued_at <= ?
      ORDER BY w.issued_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'إنذارات', value: result.length, tone: 'info' },
        { label: 'صادرة', value: result.filter((r) => r.status === 'ISSUED').length, tone: 'warning' },
        { label: 'ملغاة', value: result.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'warningType', label: 'النوع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'issuedAt', label: 'تاريخ الإصدار', type: 'date' },
        { key: 'notes', label: 'ملاحظات' },
      ],
      rows: result,
    };
  }

  public hrAppeals({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, a.reference_type AS referenceType, a.reference_id AS referenceId,
        a.status, a.created_at AS createdAt, a.decided_at AS decidedAt, a.decision
      FROM hr_appeals a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.created_at >= ? AND a.created_at <= ?
      ORDER BY a.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'تظلمات', value: result.length, tone: 'info' },
        { label: 'مفتوحة', value: result.filter((r) => r.status === 'OPEN').length, tone: 'warning' },
        { label: 'مقبولة', value: result.filter((r) => r.status === 'APPROVED').length, tone: 'success' },
        { label: 'مرفوضة', value: result.filter((r) => r.status === 'REJECTED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'referenceType', label: 'نوع المرجع' },
        { key: 'referenceId', label: 'معرف المرجع' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'createdAt', label: 'تاريخ التقديم', type: 'date' },
        { key: 'decidedAt', label: 'تاريخ القرار', type: 'date' },
        { key: 'decision', label: 'القرار' },
      ],
      rows: result,
    };
  }


  public hrAttachments({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT a.reference_type AS referenceType, a.reference_id AS referenceId,
        a.file_name AS fileName, COALESCE(u.full_name, '—') AS uploadedBy, a.created_at AS createdAt
      FROM hr_case_attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.created_at >= ? AND a.created_at <= ?
      ORDER BY a.created_at DESC
    `, [from + 'T00:00:00', to + 'T23:59:59']);
    const result = rows.map((row) => ({ ...row }));
    return {
      kpis: [
        { label: 'مرفقات', value: result.length, tone: 'info' },
        { label: 'مخالفات', value: result.filter((r) => r.referenceType === 'HR_VIOLATION').length, tone: 'warning' },
        { label: 'شكاوى', value: result.filter((r) => r.referenceType === 'HR_COMPLAINT').length, tone: 'info' },
        { label: 'جزاءات', value: result.filter((r) => r.referenceType === 'HR_PENALTY').length, tone: 'danger' },
      ],
      columns: [
        { key: 'referenceType', label: 'نوع المرجع', type: 'badge' },
        { key: 'referenceId', label: 'معرف المرجع' },
        { key: 'fileName', label: 'اسم الملف' },
        { key: 'uploadedBy', label: 'رفع بواسطة' },
        { key: 'createdAt', label: 'تاريخ الرفع', type: 'date' },
      ],
      rows: result,
    };
  }


  public hrAllowances({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, a.allowance_type AS allowanceType,
        a.amount, a.frequency, a.effective_from AS effectiveFrom,
        COALESCE(a.effective_to, '—') AS effectiveTo,
        CASE WHEN a.is_active = 1 THEN 'نشط' ELSE 'موقوف' END AS activeLabel
      FROM hr_allowances a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
      ORDER BY e.name, a.effective_from DESC
    `, [to, from]);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'بدلات', value: result.length, tone: 'info' },
        { label: 'نشطة', value: result.filter((r) => r.activeLabel === 'نشط').length, tone: 'success' },
        { label: 'شهرية', value: result.filter((r) => r.frequency === 'MONTHLY' && r.activeLabel === 'نشط').length, tone: 'info' },        { label: 'إجمالي الشهرية النشطة', value: fmtMoney(result.filter((r) => r.frequency === 'MONTHLY' && r.activeLabel === 'نشط').reduce((t, r) => t + r.amount, 0)), tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'allowanceType', label: 'النوع' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'frequency', label: 'التكرار' },
        { key: 'effectiveFrom', label: 'من', type: 'date' },
        { key: 'effectiveTo', label: 'إلى', type: 'date' },
        { key: 'activeLabel', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public hrBenefits({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, b.benefit_type AS benefitType,
        COALESCE(b.provider, '—') AS provider, COALESCE(b.policy_number, '—') AS policyNumber,
        b.start_date AS startDate, COALESCE(b.end_date, '—') AS endDate, b.amount, b.status
      FROM hr_benefits b
      LEFT JOIN employees e ON e.id = b.employee_id
      WHERE b.start_date <= ? AND (b.end_date IS NULL OR b.end_date >= ?)
      ORDER BY e.name, b.start_date DESC
    `, [to, from]);
    const result = rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
    return {
      kpis: [
        { label: 'مزايا/تأمينات', value: result.length, tone: 'info' },
        { label: 'سارية', value: result.filter((r) => r.status === 'ACTIVE').length, tone: 'success' },
        { label: 'منتهية', value: result.filter((r) => r.status === 'EXPIRED').length, tone: 'warning' },
        { label: 'ملغاة', value: result.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
        { label: 'إجمالي التكلفة', value: fmtMoney(result.reduce((t, r) => t + r.amount, 0)), tone: 'info' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'benefitType', label: 'النوع' },
        { key: 'provider', label: 'جهة التوفير' },
        { key: 'policyNumber', label: 'رقم البوليصة' },
        { key: 'startDate', label: 'من', type: 'date' },
        { key: 'endDate', label: 'إلى', type: 'date' },
        { key: 'amount', label: 'التكلفة', type: 'currency' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public hrLoans({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, '—') AS employeeName, l.id AS loanId, l.principal,
        l.installment_amount AS installmentAmount, l.remaining_balance AS remainingBalance,
        l.start_date AS startDate, l.status,
        COALESCE((SELECT COUNT(*) FROM hr_loan_installments i
          WHERE i.loan_id = l.id AND i.status = 'PAID'), 0) AS paidInstallments,
        COALESCE((SELECT COUNT(*) FROM hr_loan_installments i
          WHERE i.loan_id = l.id AND i.status = 'PENDING'), 0) AS pendingInstallments
      FROM hr_loans l
      LEFT JOIN employees e ON e.id = l.employee_id
      WHERE l.start_date >= ? AND l.start_date <= ?
      ORDER BY l.start_date DESC
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      principal: Number(row.principal) || 0,
      installmentAmount: Number(row.installmentAmount) || 0,
      remainingBalance: Number(row.remainingBalance) || 0,
      paidInstallments: Number(row.paidInstallments) || 0,
      pendingInstallments: Number(row.pendingInstallments) || 0,
    }));
    return {
      kpis: [
        { label: 'قروض', value: result.length, tone: 'info' },
        { label: 'نشطة', value: result.filter((r) => r.status === 'ACTIVE').length, tone: 'warning' },
        { label: 'مسددة', value: result.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'إجمالي المتبقي', value: fmtMoney(result.reduce((t, r) => t + r.remainingBalance, 0)), tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'loanId', label: 'معرف القرض' },
        { key: 'principal', label: 'أصل القرض', type: 'currency' },
        { key: 'installmentAmount', label: 'القسط', type: 'currency' },
        { key: 'paidInstallments', label: 'أقساط مسددة' },
        { key: 'pendingInstallments', label: 'أقساط متبقية' },
        { key: 'remainingBalance', label: 'المتبقي', type: 'currency' },
        { key: 'startDate', label: 'تاريخ البداية', type: 'date' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public hrPerformanceEvaluations({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, COALESCE(pc.name, '—') AS cycleName,
        pe.evaluator_type AS evaluatorType, pe.score, pe.rating, pe.status,
        pe.submitted_at AS submittedAt, COALESCE(pe.notes, '—') AS notes,
        (SELECT COUNT(*) FROM performance_evaluation_items i WHERE i.evaluation_id = pe.id) AS itemsCount
      FROM performance_evaluations pe
      LEFT JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN performance_cycles pc ON pc.id = pe.cycle_id
      WHERE date(COALESCE(pe.submitted_at, pe.created_at)) BETWEEN ? AND ?
      ORDER BY pe.score DESC, e.name
    `, [from, to]);
    const result = rows.map((row) => ({ ...row, score: num(row.score), itemsCount: num(row.itemsCount) }));
    const scored = result.filter((r) => r.status !== 'DRAFT');
    const avgScore = scored.length ? round2(scored.reduce((t, r) => t + r.score, 0) / scored.length) : 0;
    return {
      kpis: [
        { label: 'تقييمات', value: result.length, tone: 'info' },
        { label: 'مقدم/معتمد', value: result.filter((r) => r.status !== 'DRAFT').length, tone: 'success' },
        { label: 'متوسط الدرجة', value: avgScore, hint: scored.length ? `${scored.length} تقييم مكتمل` : '—', tone: 'info' },
        { label: 'متميزون (4.5+)', value: scored.filter((r) => r.score >= 4.5).length, tone: 'success' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'cycleName', label: 'دورة التقييم' },
        { key: 'evaluatorType', label: 'نوع المقيّم', type: 'badge' },
        { key: 'score', label: 'الدرجة', type: 'number' },
        { key: 'rating', label: 'التقدير', type: 'badge' },
        { key: 'itemsCount', label: 'عدد البنود', type: 'number' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'submittedAt', label: 'تاريخ التقديم', type: 'date' },
      ],
      rows: result,
    };
  }

  public hrPerformanceGoals({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, g.title, g.weight,
        g.target_value AS targetValue, g.actual_value AS actualValue, g.status,
        CASE WHEN g.target_value IS NOT NULL AND g.target_value > 0
          THEN round(COALESCE(g.actual_value, 0) * 100.0 / g.target_value, 1) ELSE NULL END AS progress
      FROM performance_goals g
      LEFT JOIN employees e ON e.id = g.employee_id
      WHERE date(g.created_at) BETWEEN ? AND ?
      ORDER BY progress DESC, e.name
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      weight: num(row.weight),
      targetValue: row.targetValue === null ? null : num(row.targetValue),
      actualValue: row.actualValue === null ? null : num(row.actualValue),
      progress: row.progress === null ? null : num(row.progress),
    }));
    const withProgress = result.filter((r) => r.progress !== null);
    const avgProgress = withProgress.length ? round2(withProgress.reduce((t, r) => t + (r.progress || 0), 0) / withProgress.length) : 0;
    return {
      kpis: [
        { label: 'أهداف', value: result.length, tone: 'info' },
        { label: 'مكتملة', value: result.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'متجاوزة للمستهدف', value: withProgress.filter((r) => (r.progress || 0) >= 100).length, tone: 'success' },
        { label: 'متوسط الإنجاز', value: avgProgress, hint: '٪ من المستهدف', tone: 'warning' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'title', label: 'الهدف' },
        { key: 'weight', label: 'الوزن', type: 'number' },
        { key: 'targetValue', label: 'المستهدف', type: 'number' },
        { key: 'actualValue', label: 'المحقق', type: 'number' },
        { key: 'progress', label: 'نسبة الإنجاز', type: 'percent' },
        { key: 'status', label: 'الحالة', type: 'badge' },
      ],
      rows: result,
    };
  }

  public hrPerformancePips({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS employeeName, p.start_date AS startDate,
        p.end_date AS endDate, p.reason, COALESCE(p.goals, '—') AS goals,
        p.status, COALESCE(p.outcome, '—') AS outcome, p.review_date AS reviewDate
      FROM performance_pips p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE date(p.start_date) BETWEEN ? AND ?
      ORDER BY p.end_date, e.name
    `, [from, to]);
    return {
      kpis: [
        { label: 'خطط تحسين', value: rows.length, tone: 'info' },
        { label: 'نشطة', value: rows.filter((r) => r.status === 'ACTIVE').length, tone: 'warning' },
        { label: 'مكتملة', value: rows.filter((r) => r.status === 'COMPLETED').length, tone: 'success' },
        { label: 'ملغاة', value: rows.filter((r) => r.status === 'CANCELLED').length, tone: 'danger' },
      ],
      columns: [
        { key: 'employeeName', label: 'الموظف' },
        { key: 'startDate', label: 'البداية', type: 'date' },
        { key: 'endDate', label: 'النهاية', type: 'date' },
        { key: 'reviewDate', label: 'مراجعة', type: 'date' },
        { key: 'reason', label: 'السبب' },
        { key: 'goals', label: 'الأهداف' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'outcome', label: 'النتيجة' },
      ],
      rows,
    };
  }

  public mfgProductionKpis({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT po.order_number AS orderNumber, COALESCE(p.name, '—') AS productName, po.quantity,
        po.status, po.priority, po.start_date AS startDate, po.due_date AS dueDate,
        po.completed_at AS completedAt, b.name AS branchName,
        CASE WHEN po.due_date IS NOT NULL AND po.completed_at IS NOT NULL
          AND date(po.completed_at) > date(po.due_date) THEN 1 ELSE 0 END AS lateFlag,
        COALESCE((SELECT SUM(q.quantity_accepted) FROM manufacturing_quality_checks q
          WHERE q.production_order_id = po.id), 0) AS acceptedQty,
        COALESCE((SELECT SUM(q.quantity_rejected) FROM manufacturing_quality_checks q
          WHERE q.production_order_id = po.id), 0) AS rejectedQty
      FROM production_orders po
      LEFT JOIN products p ON p.id = po.product_id
      LEFT JOIN branches b ON b.id = po.branch_id
      WHERE date(po.created_at) BETWEEN ? AND ?
      ORDER BY po.created_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({
      ...row,
      quantity: num(row.quantity),
      acceptedQty: num(row.acceptedQty),
      rejectedQty: num(row.rejectedQty),
      lateFlag: Number(row.lateFlag) || 0,
      lateLabel: Number(row.lateFlag) ? 'متأخر' : 'في الموعد',
    }));
    const completed = result.filter((r) => r.status === 'COMPLETED');
    const onTime = completed.filter((r) => !r.lateFlag).length;
    const inspected = result.reduce((t, r) => t + r.acceptedQty + r.rejectedQty, 0);
    const qualityRate = inspected > 0 ? round2((result.reduce((t, r) => t + r.acceptedQty, 0) / inspected) * 100) : 0;
    return {
      kpis: [
        { label: 'أوامر الإنتاج', value: result.length, tone: 'info' },
        { label: 'مكتملة', value: completed.length, tone: 'success' },
        { label: 'التسليم في الموعد', value: completed.length ? round2((onTime / completed.length) * 100) : 0, hint: '٪ من المكتملة', tone: 'warning' },
        { label: 'نسبة الجودة', value: qualityRate, hint: '٪ مقبول من المفحوص', tone: 'info' },
      ],
      columns: [
        { key: 'orderNumber', label: 'أمر الإنتاج' },
        { key: 'productName', label: 'المنتج' },
        { key: 'branchName', label: 'الفرع' },
        { key: 'quantity', label: 'الكمية', type: 'qty' },
        { key: 'acceptedQty', label: 'مقبول', type: 'qty' },
        { key: 'rejectedQty', label: 'مرفوض', type: 'qty' },
        { key: 'status', label: 'الحالة', type: 'badge' },
        { key: 'priority', label: 'الأولوية', type: 'badge' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'completedAt', label: 'الإكمال', type: 'date' },
        { key: 'lateLabel', label: 'الالتزام', type: 'badge' },
      ],
      rows: result,
    };
  }

  public salesTargetKpis({ from, to }: ReportParams): ReportResult {
    const daysInRange = Math.max(1, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1);
    const rows = this.db.query<any>(`
      SELECT COALESCE(e.name, e.full_name, '—') AS repName, e.monthly_target AS monthlyTarget,
        e.commission_percentage AS commissionPct,
        COALESCE(SUM(CASE WHEN si.date BETWEEN ? AND ? THEN si.total_amount ELSE 0 END), 0) AS totalSales
      FROM employees e
      LEFT JOIN orders o ON o.sales_rep_id = e.id
      LEFT JOIN sales_invoices si ON si.id = o.invoice_id AND si.invoice_status != 'VOID'
      WHERE e.is_sales_rep = 1 AND e.is_active = 1
      GROUP BY e.id
      ORDER BY totalSales DESC
    `, [from, to]);
    const result = rows.map((row) => {
      const monthlyTarget = num(row.monthlyTarget);
      const proratedTarget = round2(monthlyTarget * daysInRange / 30);
      const sales = round2(num(row.totalSales));
      const achievement = proratedTarget > 0 ? round2((sales / proratedTarget) * 100) : null;
      return {
        repName: row.repName,
        monthlyTarget: round2(monthlyTarget),
        proratedTarget,
        totalSales: sales,
        achievement,
        commissionPct: num(row.commissionPct),
        expectedCommission: round2(sales * num(row.commissionPct) / 100),
        targetBadge: achievement === null ? 'بلا هدف' : achievement >= 100 ? 'محقق' : achievement >= 70 ? 'قريب' : 'متأخر',
      };
    });
    const withTargets = result.filter((r) => r.proratedTarget > 0);
    const totalTarget = round2(withTargets.reduce((t, r) => t + r.proratedTarget, 0));
    const totalSales = round2(result.reduce((t, r) => t + r.totalSales, 0));
    return {
      kpis: [
        { label: 'مندوبون بمستهدفات', value: withTargets.length, hint: `${result.length} مندوب نشط`, tone: 'info' },
        { label: 'إجمالي المستهدف', value: fmtMoney(totalTarget), tone: 'info' },
        { label: 'إجمالي المحقق', value: fmtMoney(totalSales), tone: 'success' },
        { label: 'نسبة الإنجاز', value: totalTarget > 0 ? round2((totalSales / totalTarget) * 100) : 0, hint: '٪ من المستهدف الموزع', tone: totalSales >= totalTarget ? 'success' : 'warning' },
      ],
      columns: [
        { key: 'repName', label: 'المندوب' },
        { key: 'monthlyTarget', label: 'المستهدف الشهري', type: 'currency' },
        { key: 'proratedTarget', label: 'المستهدف للفترة', type: 'currency' },
        { key: 'totalSales', label: 'المحقق', type: 'currency' },
        { key: 'achievement', label: 'نسبة الإنجاز', type: 'percent' },
        { key: 'targetBadge', label: 'الحالة', type: 'badge' },
        { key: 'commissionPct', label: 'العمولة', type: 'percent' },
        { key: 'expectedCommission', label: 'عمولة متوقعة', type: 'currency' },
      ],
      rows: result,
      notes: [`المستهدف موزع تناسبيًا على ${daysInRange} يوم من الفترة المحددة.`],
    };
  }

  public hrTrainingExpenses({ from, to }: ReportParams): ReportResult {
    const rows = this.db.query<any>(`
      SELECT COALESCE(c.name, '—') AS courseName, COALESCE(e.name, e.full_name, '—') AS employeeName,
        te.amount, te.expense_date AS expenseDate, te.payment_method AS paymentMethod,
        COALESCE(te.description, '—') AS description
      FROM training_expenses te
      LEFT JOIN training_courses c ON c.id = te.course_id
      LEFT JOIN employees e ON e.id = te.employee_id
      WHERE date(te.expense_date) BETWEEN ? AND ?
      ORDER BY te.expense_date DESC, te.created_at DESC
    `, [from, to]);
    const result = rows.map((row) => ({ ...row, amount: num(row.amount) }));
    const total = sum(result, 'amount');
    const topCourse = Object.entries(
      result.reduce<Record<string, number>>((acc, r) => { acc[r.courseName] = (acc[r.courseName] || 0) + r.amount; return acc; }, {})
    ).sort((a, b) => b[1] - a[1])[0];
    return {
      kpis: [
        { label: 'مصروفات تدريب', value: result.length, tone: 'info' },
        { label: 'إجمالي المصروف', value: fmtMoney(total), tone: 'warning' },
        { label: 'متوسط المصروف', value: result.length ? fmtMoney(total / result.length) : fmtMoney(0), tone: 'info' },
        { label: 'أعلى دورة تكلفة', value: topCourse ? topCourse[0] : '—', hint: topCourse ? fmtMoney(topCourse[1]) : undefined, tone: 'neutral' },
      ],
      columns: [
        { key: 'courseName', label: 'الدورة' },
        { key: 'employeeName', label: 'الموظف' },
        { key: 'amount', label: 'المبلغ', type: 'currency' },
        { key: 'expenseDate', label: 'التاريخ', type: 'date' },
        { key: 'paymentMethod', label: 'طريقة الدفع', type: 'badge' },
        { key: 'description', label: 'الوصف' },
      ],
      rows: result,
    };
  }

  public workforceAnalytics({ from, to }: ReportParams): ReportResult {
    const actor = this.actor();
    const branchScope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const companyScope = this.branchAccess.companyScope('e.company_id', actor);

    const headcountByBranch = this.db.query<any>(`
      SELECT b.id AS branchId, b.name AS branchName,
             COUNT(e.id) AS headcount,
             COALESCE(SUM(e.base_salary), 0) AS totalSalaryCost
      FROM employees e
      JOIN branches b ON b.id = e.branch_id
      WHERE e.is_active = 1 AND ${branchScope.clause} AND ${companyScope.clause}
      GROUP BY b.id, b.name
      ORDER BY headcount DESC
    `, [...branchScope.params, ...companyScope.params]);

    const totalHeadcount = headcountByBranch.reduce((sum, r) => sum + Number(r.headcount), 0);
    const totalSalaryCost = headcountByBranch.reduce((sum, r) => sum + Number(r.totalSalaryCost), 0);

    return {
      kpis: [
        { label: 'إجمالي القوى العاملة', value: totalHeadcount, tone: 'info' },
        { label: 'إجمالي تكلفة الرواتب', value: fmtMoney(totalSalaryCost), tone: 'warning' },
      ],
      columns: [
        { key: 'branchName', label: 'الفرع' },
        { key: 'headcount', label: 'عدد القوى العاملة', type: 'number' },
        { key: 'totalSalaryCost', label: 'تكلفة الرواتب', type: 'currency' },
      ],
      rows: headcountByBranch,
    };
  }

  public assetAnalytics({ from, to }: ReportParams): ReportResult {
    const actor = this.actor();
    const branchScope = this.branchAccess.sqlScope('fa.branch_id', undefined, actor);

    const assetsByStatus = this.db.query<any>(`
      SELECT fa.status, COUNT(*) AS count
      FROM facility_assets fa
      WHERE ${branchScope.clause}
      GROUP BY fa.status
    `, [...branchScope.params]);

    const totalAssets = assetsByStatus.reduce((sum, r) => sum + Number(r.count), 0);

    return {
      kpis: [
        { label: 'إجمالي الأصول', value: totalAssets, tone: 'info' },
        { label: 'الأصول النشطة', value: Number(assetsByStatus.find((r: any) => r.status === 'ACTIVE')?.count || 0), tone: 'success' },
      ],
      columns: [
        { key: 'status', label: 'حالة الأصل' },
        { key: 'count', label: 'العدد', type: 'number' },
      ],
      rows: assetsByStatus,
    };
  }

  public facilityAnalytics({ from, to }: ReportParams): ReportResult {
    const actor = this.actor();
    const companyId = this.branchAccess.companyScope('company_id', actor).params[0] || 'cmp_main';

    const utilityConsumption = this.db.query<any>(`
      SELECT um.utility_type AS type,
             SUM(ur.consumption) AS totalConsumption,
             SUM(ur.cost) AS totalCost
      FROM facility_utility_readings ur
      JOIN facility_utility_meters um ON um.id = ur.meter_id
      WHERE um.company_id = ? AND ur.reading_date >= ? AND ur.reading_date <= ?
      GROUP BY um.utility_type
      ORDER BY totalCost DESC
    `, [companyId, from, to]);

    const totalUtilityCost = utilityConsumption.reduce((sum, r) => sum + Number(r.totalCost), 0);

    return {
      kpis: [
        { label: 'إجمالي تكلفة المرافق', value: fmtMoney(totalUtilityCost), tone: 'warning' },
      ],
      columns: [
        { key: 'type', label: 'نوع المرفق' },
        { key: 'totalConsumption', label: 'الاستهلاك', type: 'number' },
        { key: 'totalCost', label: 'التكلفة', type: 'currency' },
      ],
      rows: utilityConsumption,
    };
  }

}

function fmtMoney(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(number)} ج`;
}

function dimensionLabel(dimension: string): string {
  if (dimension === 'customer') return 'العميل';
  if (dimension === 'rep') return 'المندوب';
  if (dimension === 'product') return 'الصنف';
  return 'المخزن';
}