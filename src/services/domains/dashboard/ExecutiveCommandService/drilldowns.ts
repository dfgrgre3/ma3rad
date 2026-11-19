import { localDateString } from '../../../../utils/shared/date';
import { DatabaseManager } from '../../../../database/repositories/databaseManager';
import { AuthService } from '../../auth/AuthService';
import { BranchAccessService } from '../../auth/BranchAccessService';
import type {
  DrilldownKey,
  DrilldownResult,
  DrilldownRow,
} from '../../../../types/dashboard/executiveCommand';
import { MAX_DRILLDOWN_ROWS, SLOW_MOVING_DAYS, paymentStatusLabel, paymentTypeLabel, round2, toNumber } from './formatters';
import { CommandScopes } from './scopes';
import type { ExecutiveCommandAggregates } from './aggregates';

/**
 * Drill-down record queries behind ExecutiveCommandService.getDrilldown.
 * Extracted verbatim; each headline number returns the exact records that
 * produced it.
 */
export class ExecutiveCommandDrilldowns {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private scopes = new CommandScopes();

  private readonly aggregates: ExecutiveCommandAggregates;
  constructor(aggregates: ExecutiveCommandAggregates) { this.aggregates = aggregates; }

  public invoiceDrilldown(key: DrilldownKey, title: string, subtitle: string, from: string, to: string): DrilldownResult {
    const sales = this.scopes.salesScopes();
    const rows = this.db.query<any>(
      `SELECT si.id, si.invoice_number AS invoiceNumber, si.date, si.due_date AS dueDate,
              c.name AS customer,
              COALESCE(e.full_name, u.full_name, '—') AS employee,
              (si.subtotal - si.discount_amount) / 100.0 AS net,
              si.total_amount / 100.0 AS total, si.paid_amount / 100.0 AS paid, si.remaining_amount / 100.0 AS remaining,
              si.payment_status AS paymentStatus
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       LEFT JOIN employees e ON e.id = si.sales_rep_id
       LEFT JOIN users u ON u.id = si.created_by
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID'
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY si.date DESC, si.created_at DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );

    const totalNet = rows.reduce((sum, row) => sum + toNumber(row.net), 0);
    return {
      key,
      title,
      subtitle,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'customer', label: 'العميل' },
        { key: 'employee', label: 'الموظف' },
        { key: 'net', label: 'صافي المبيعات', type: 'money' },
        { key: 'total', label: 'الإجمالي', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'paymentStatus', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        customer: String(row.customer),
        employee: String(row.employee),
        net: round2(toNumber(row.net)),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        paymentStatus: paymentStatusLabel(String(row.paymentStatus)),
      })),
      totals: [
        { label: 'صافي المبيعات', value: round2(totalNet), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? `يتم عرض أحدث ${MAX_DRILLDOWN_ROWS} فاتورة.` : undefined,
    };
  }

  public expenseDrilldown(key: DrilldownKey, title: string, subtitle: string, from: string, to: string): DrilldownResult {
    const scope = this.scopes.expenseScopes();
    const rows = this.db.query<any>(
      `SELECT e.id, e.date, COALESCE(ec.name, e.category) AS category, e.amount / 100.0 AS amount,
              e.recipient, e.description, COALESCE(cr.name, '—') AS registerName,
              COALESCE(u.full_name, '—') AS performedBy
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN cash_registers cr ON cr.id = e.register_id
       LEFT JOIN users u ON u.id = e.performed_by
       WHERE e.date BETWEEN ? AND ? AND ${scope.branch.clause} AND ${scope.company.clause}
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT ?`,
      [from, to, ...scope.branch.params, ...scope.company.params, MAX_DRILLDOWN_ROWS],
    );

    return {
      key,
      title,
      subtitle,
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'category', label: 'البند' },
        { key: 'description', label: 'البيان' },
        { key: 'recipient', label: 'المستفيد' },
        { key: 'registerName', label: 'الخزينة' },
        { key: 'performedBy', label: 'بواسطة' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: rows.map((row) => ({
        date: String(row.date),
        category: String(row.category ?? '—'),
        description: String(row.description ?? ''),
        recipient: String(row.recipient ?? '—'),
        registerName: String(row.registerName),
        performedBy: String(row.performedBy),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'إجمالي المصروفات', value: round2(rows.reduce((sum, row) => sum + toNumber(row.amount), 0)), type: 'money' },
        { label: 'عدد الحركات', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? 'يتم عرض أحدث الحركات فقط.' : undefined,
    };
  }

  public collectionsDrilldown(from: string, to: string): DrilldownResult {
    const actor = AuthService.requireAuth();
    const sales = this.scopes.salesScopes();
    const paymentBranch = this.branchAccess.sqlScope('cp.branch_id', undefined, actor);
    const paymentCompany = this.branchAccess.companyScopeViaBranch('cp.branch_id', actor);

    const invoiceRows = this.db.query<any>(
      `SELECT si.id, si.invoice_number AS reference, si.date, c.name AS party,
              si.paid_amount / 100.0 AS amount, si.payment_type AS method, 'تحصيل على فاتورة' AS kind
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.date BETWEEN ? AND ? AND si.invoice_status != 'VOID' AND si.paid_amount > 0
         AND ${sales.branch.clause} AND ${sales.company.clause}
       ORDER BY si.date DESC
       LIMIT ?`,
      [from, to, ...sales.branch.params, ...sales.company.params, MAX_DRILLDOWN_ROWS],
    );

    const paymentRows = this.db.query<any>(
      `SELECT cp.id, cp.receipt_number AS reference, cp.date, c.name AS party,
              cp.amount / 100.0 AS amount, cp.payment_type AS method, 'سند قبض' AS kind
       FROM customer_payments cp
       JOIN sales_invoices si ON si.id = cp.invoice_id
       JOIN customers c ON c.id = cp.customer_id
       WHERE cp.date BETWEEN ? AND ? AND si.date < ? AND si.invoice_status != 'VOID'
         AND ${paymentBranch.clause} AND ${paymentCompany.clause}
       ORDER BY cp.date DESC
       LIMIT ?`,
      [from, to, from, ...paymentBranch.params, ...paymentCompany.params, MAX_DRILLDOWN_ROWS],
    );

    const combined = [
      ...invoiceRows.map((row) => ({ ...row, sortDate: String(row.date) })),
      ...paymentRows.map((row) => ({ ...row, sortDate: String(row.date) })),
    ].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).slice(0, MAX_DRILLDOWN_ROWS);

    return {
      key: 'collections',
      title: 'التحصيلات',
      subtitle: 'المبالغ المحصلة من العملاء خلال الفترة',
      columns: [
        { key: 'kind', label: 'نوع الحركة' },
        { key: 'reference', label: 'المرجع' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'party', label: 'العميل' },
        { key: 'method', label: 'وسيلة الدفع' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: combined.map((row) => ({
        kind: String(row.kind),
        reference: String(row.reference),
        date: String(row.date),
        party: String(row.party),
        method: paymentTypeLabel(String(row.method)),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'إجمالي التحصيلات', value: round2(combined.reduce((sum, row) => sum + toNumber(row.amount), 0)), type: 'money' },
        { label: 'عدد الحركات', value: combined.length, type: 'number' },
      ],
      note: 'يشمل المدفوع على الفواتير داخل الفترة وسندات القبض المسددة على فواتير سابقة.',
    };
  }

  public receivablesDrilldown(onlyOverdue: boolean): DrilldownResult {
    const today = localDateString();
    const rows = onlyOverdue ? this.aggregates.getOverdueInvoiceRows(today) : this.aggregates.getReceivableInvoiceRows();
    return {
      key: onlyOverdue ? 'overdueInvoices' : 'receivables',
      title: onlyOverdue ? 'الفواتير المتأخرة' : 'المديونيات المستحقة',
      subtitle: onlyOverdue ? 'فواتير تجاوزت تاريخ الاستحقاق ولم تُسدد' : 'أرصدة العملاء المستحقة على الفواتير',
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'customer', label: 'العميل' },
        { key: 'total', label: 'إجمالي الفاتورة', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'daysOverdue', label: 'أيام التأخير', type: 'number' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        dueDate: String(row.dueDate ?? '—'),
        customer: String(row.customer),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        daysOverdue: Math.max(0, Math.trunc(toNumber(row.daysOverdue))),
      })),
      totals: [
        { label: 'إجمالي المتبقي', value: round2(rows.reduce((sum, row) => sum + toNumber(row.remaining), 0)), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
      note: rows.length >= MAX_DRILLDOWN_ROWS ? 'يتم عرض أكبر الأرصدة فقط.' : undefined,
    };
  }

  public cashDrilldown(): DrilldownResult {
    const liquidity = this.aggregates.getLiquidity();
    return {
      key: 'cashBalance',
      title: 'أرصدة الخزائن والبنوك',
      subtitle: 'الرصيد الحالي لكل خزينة وحساب بنكي',
      columns: [
        { key: 'name', label: 'الخزينة / الحساب' },
        { key: 'type', label: 'النوع' },
        { key: 'branchName', label: 'الفرع' },
        { key: 'balance', label: 'الرصيد', type: 'money' },
      ],
      rows: liquidity.cashAccounts.map((account) => ({
        name: account.name,
        type: account.type === 'cash' ? 'خزينة' : 'بنك',
        branchName: account.branchName,
        balance: account.balance,
      })),
      totals: [
        { label: 'إجمالي النقدية', value: liquidity.cashTotal, type: 'money' },
        { label: 'إجمالي البنوك', value: liquidity.bankTotal, type: 'money' },
        { label: 'الإجمالي', value: liquidity.total, type: 'money' },
      ],
    };
  }

  public inventoryDrilldown(): DrilldownResult {
    const rows = this.aggregates.getInventoryRows();
    return {
      key: 'inventoryValue',
      title: 'قيمة المخزون الحالية',
      subtitle: 'رصيد وتقييم كل صنف في المخازن',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'costValue', label: 'التكلفة', type: 'money' },
        { key: 'saleValue', label: 'قيمة البيع', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        costValue: row.costValue,
        saleValue: row.saleValue,
      })),
      totals: [
        { label: 'قيمة المخزون بالتكلفة', value: round2(rows.reduce((sum, row) => sum + row.costValue, 0)), type: 'money' },
        { label: 'قيمة المخزون بالبيع', value: round2(rows.reduce((sum, row) => sum + row.saleValue, 0)), type: 'money' },
        { label: 'عدد الأصناف', value: rows.length, type: 'number' },
      ],
    };
  }

  public topProductsDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.aggregates.getTopProducts(from, to, MAX_DRILLDOWN_ROWS);
    return {
      key: 'topProducts',
      title: 'الأصناف الأكثر مبيعًا',
      subtitle: 'ترتيب الأصناف حسب الإيراد خلال الفترة',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'revenue', label: 'الإيراد', type: 'money' },
        { key: 'profit', label: 'الربح', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        revenue: row.revenue,
        profit: row.profit,
      })),
      totals: [
        { label: 'إيراد الأصناف', value: round2(rows.reduce((sum, row) => sum + row.revenue, 0)), type: 'money' },
        { label: 'ربح الأصناف', value: round2(rows.reduce((sum, row) => sum + row.profit, 0)), type: 'money' },
      ],
    };
  }

  public slowMovingDrilldown(): DrilldownResult {
    const rows = this.aggregates.getSlowMoving(MAX_DRILLDOWN_ROWS);
    return {
      key: 'slowMoving',
      title: 'الأصناف الراكدة',
      subtitle: `أصناف لديها رصيد ولم تُبع خلال ${SLOW_MOVING_DAYS} يومًا`,
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'stockQty', label: 'الرصيد', type: 'number' },
        { key: 'stockValue', label: 'قيمة الرصيد', type: 'money' },
        { key: 'lastSaleDate', label: 'آخر بيع', type: 'date' },
        { key: 'daysIdle', label: 'أيام بدون بيع', type: 'number' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        stockQty: row.stockQty,
        stockValue: row.stockValue,
        lastSaleDate: row.lastSaleDate ?? 'لم يُبع',
        daysIdle: row.daysIdle ?? '—',
      })),
      totals: [
        { label: 'قيمة المخزون الراكد', value: round2(rows.reduce((sum, row) => sum + row.stockValue, 0)), type: 'money' },
        { label: 'عدد الأصناف', value: rows.length, type: 'number' },
      ],
    };
  }

  public branchesDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.aggregates.getBranchPerformance(from, to);
    return {
      key: 'branches',
      title: 'أداء الفروع',
      subtitle: 'مبيعات وربحية كل فرع خلال الفترة',
      columns: [
        { key: 'name', label: 'الفرع' },
        { key: 'sales', label: 'المبيعات', type: 'money' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'grossProfit', label: 'الربح الإجمالي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        sales: row.sales,
        invoices: row.invoices,
        grossProfit: row.grossProfit,
      })),
      totals: [
        { label: 'إجمالي المبيعات', value: round2(rows.reduce((sum, row) => sum + row.sales, 0)), type: 'money' },
        { label: 'إجمالي الفواتير', value: rows.reduce((sum, row) => sum + row.invoices, 0), type: 'number' },
      ],
    };
  }

  public employeesDrilldown(from: string, to: string): DrilldownResult {
    const rows = this.aggregates.getEmployeeSales(from, to, MAX_DRILLDOWN_ROWS);
    return {
      key: 'employees',
      title: 'المبيعات حسب الموظف',
      subtitle: 'أداء مندوبي وموظفي البيع خلال الفترة',
      columns: [
        { key: 'name', label: 'الموظف' },
        { key: 'sales', label: 'المبيعات', type: 'money' },
        { key: 'invoices', label: 'الفواتير', type: 'number' },
        { key: 'grossProfit', label: 'الربح الإجمالي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        sales: row.sales,
        invoices: row.invoices,
        grossProfit: row.grossProfit,
      })),
      totals: [
        { label: 'إجمالي المبيعات', value: round2(rows.reduce((sum, row) => sum + row.sales, 0)), type: 'money' },
        { label: 'عدد الموظفين', value: rows.length, type: 'number' },
      ],
    };
  }

  public purchasesDrilldown(from: string, to: string): DrilldownResult {
    const purchase = this.scopes.purchaseScopes();
    const rows = this.db.query<any>(
      `SELECT pi.id, pi.invoice_number AS invoiceNumber, pi.date, s.name AS supplier,
              pi.total_amount / 100.0 AS total, pi.paid_amount / 100.0 AS paid, pi.remaining_amount / 100.0 AS remaining,
              pi.payment_status AS paymentStatus
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.date BETWEEN ? AND ? AND ${purchase.branch.clause} AND ${purchase.company.clause}
       ORDER BY pi.date DESC, pi.created_at DESC
       LIMIT ?`,
      [from, to, ...purchase.branch.params, ...purchase.company.params, MAX_DRILLDOWN_ROWS],
    );
    return {
      key: 'purchases',
      title: 'المشتريات',
      subtitle: 'فواتير التوريد خلال الفترة',
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' },
        { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'supplier', label: 'المورد' },
        { key: 'total', label: 'الإجمالي', type: 'money' },
        { key: 'paid', label: 'المدفوع', type: 'money' },
        { key: 'remaining', label: 'المتبقي', type: 'money' },
        { key: 'paymentStatus', label: 'الحالة' },
      ],
      rows: rows.map((row) => ({
        invoiceNumber: String(row.invoiceNumber),
        date: String(row.date),
        supplier: String(row.supplier),
        total: round2(toNumber(row.total)),
        paid: round2(toNumber(row.paid)),
        remaining: round2(toNumber(row.remaining)),
        paymentStatus: paymentStatusLabel(String(row.paymentStatus)),
      })),
      totals: [
        { label: 'إجمالي المشتريات', value: round2(rows.reduce((sum, row) => sum + toNumber(row.total), 0)), type: 'money' },
        { label: 'عدد الفواتير', value: rows.length, type: 'number' },
      ],
    };
  }

  public lowStockDrilldown(): DrilldownResult {
    const rows = this.aggregates.getLowStockRows();
    return {
      key: 'lowStock',
      title: 'نواقص المخزون',
      subtitle: 'أصناف وصلت إلى الحد الأدنى أو نفدت من المخزن',
      columns: [
        { key: 'name', label: 'الصنف' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'quantity', label: 'الرصيد', type: 'number' },
        { key: 'minLevel', label: 'حد الطلب', type: 'number' },
      ],
      rows: rows.map((row) => ({
        name: row.name,
        warehouse: row.warehouse,
        quantity: row.quantity,
        minLevel: row.minLevel,
      })),
      totals: [
        { label: 'عدد الحالات', value: rows.length, type: 'number' },
        { label: 'أصناف نفدت', value: rows.filter((row) => row.quantity <= 0).length, type: 'number' },
      ],
    };
  }

  public profitDrilldown(from: string, to: string): DrilldownResult {
    const actor = AuthService.requireAuth();
    const branch = this.branchAccess.sqlScope('je.branch_id', undefined, actor);
    const company = this.branchAccess.companyScope('je.company_id', actor);
    const rows = this.db.query<any>(
      `SELECT a.code, a.name, a.type,
              ROUND(SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit ELSE l.debit - l.credit END) / 100.0, 2) AS amount
       FROM journal_entries je
       JOIN journal_entry_lines l ON l.entry_id = je.id
       JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE je.is_posted = 1 AND a.type IN ('REVENUE', 'EXPENSE')
         AND je.date BETWEEN ? AND ? AND ${branch.clause} AND ${company.clause}
       GROUP BY a.id
       HAVING ABS(amount) > 0.009
       ORDER BY a.type DESC, amount DESC`,
      [from, to, ...branch.params, ...company.params],
    );

    const revenue = rows.filter((row) => row.type === 'REVENUE').reduce((sum, row) => sum + toNumber(row.amount), 0);
    const expenses = rows.filter((row) => row.type === 'EXPENSE').reduce((sum, row) => sum + toNumber(row.amount), 0);

    return {
      key: 'profit',
      title: 'تفاصيل صافي الربح',
      subtitle: 'الإيرادات والمصروفات المرحلة في دفتر اليومية',
      columns: [
        { key: 'code', label: 'الحساب' },
        { key: 'name', label: 'اسم الحساب' },
        { key: 'type', label: 'النوع' },
        { key: 'amount', label: 'الصافي', type: 'money' },
      ],
      rows: rows.map((row) => ({
        code: String(row.code),
        name: String(row.name),
        type: row.type === 'REVENUE' ? 'إيراد' : 'مصروف',
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'الإيرادات', value: round2(revenue), type: 'money' },
        { label: 'المصروفات', value: round2(expenses), type: 'money' },
        { label: 'صافي الربح', value: round2(revenue - expenses), type: 'money' },
      ],
      note: 'يُحسب صافي الربح من القيود المرحلة، لذلك لا تدخل الفواتير غير المرحلة في النتيجة.',
    };
  }

  public cashFlowDrilldown(from: string, to: string, key: DrilldownKey): DrilldownResult {
    const collections = this.aggregates.getCollections(from, to);
    const expenses = this.aggregates.getExpenseTotals(from, to);
    const cashFlow = this.aggregates.getCashFlow(from, to, expenses.total, collections.total);
    const rows: DrilldownRow[] = [];

    if (key !== 'cashOutflow') {
      rows.push({ label: 'تحصيلات العملاء', direction: 'داخل', amount: cashFlow.inflow });
    }
    if (key !== 'cashInflow') {
      rows.push({ label: 'المصروفات', direction: 'خارج', amount: -cashFlow.expenses });
      rows.push({ label: 'مدفوعات فواتير التوريد', direction: 'خارج', amount: -cashFlow.purchasesPaid });
      rows.push({ label: 'سداد موردين على فواتير سابقة', direction: 'خارج', amount: -cashFlow.supplierPayments });
    }
    rows.push({ label: 'صافي التدفق النقدي', direction: cashFlow.net >= 0 ? 'صافي داخل' : 'صافي خارج', amount: cashFlow.net });

    return {
      key,
      title: key === 'cashInflow' ? 'التدفقات النقدية الداخلة' : key === 'cashOutflow' ? 'التدفقات النقدية الخارجة' : 'مؤشرات التدفق النقدي',
      subtitle: 'حركة النقد المتوقعة من التحصيلات والمدفوعات',
      columns: [
        { key: 'label', label: 'البند' },
        { key: 'direction', label: 'الاتجاه' },
        { key: 'amount', label: 'المبلغ', type: 'money' },
      ],
      rows: rows.map((row) => ({
        label: String(row.label),
        direction: String(row.direction),
        amount: round2(toNumber(row.amount)),
      })),
      totals: [
        { label: 'التدفق الداخل', value: cashFlow.inflow, type: 'money' },
        { label: 'التدفق الخارج', value: cashFlow.outflow, type: 'money' },
        { label: 'الصافي', value: cashFlow.net, type: 'money' },
      ],
    };
  }

  public manufacturingDrilldown(): DrilldownResult {
    const actor = AuthService.requireAuth();
    const scope = this.branchAccess.sqlScope('po.branch_id', undefined, actor);
    const rows = this.db.query<any>(
      `SELECT po.order_number AS orderNumber, p.name AS product, po.quantity, po.status,
              po.priority, po.due_date AS dueDate, br.name AS branch,
              so.order_number AS salesOrder, c.name AS customer
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       LEFT JOIN branches br ON br.id = po.branch_id
       LEFT JOIN orders so ON so.id = po.sales_order_id
       LEFT JOIN customers c ON c.id = po.customer_id
       WHERE po.status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS') AND ${scope.clause}
       ORDER BY po.due_date IS NULL, po.due_date, po.created_at
       LIMIT ?`,
      [...scope.params, MAX_DRILLDOWN_ROWS]
    );
    const statusLabels: Record<string, string> = {
      PLANNED: 'مخطط', RELEASED: 'صادر', IN_PROGRESS: 'قيد التنفيذ',
      COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
    };
    const priorityLabels: Record<string, string> = {
      LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجلة',
    };
    return {
      key: 'manufacturing',
      title: 'أوامر الإنتاج النشطة',
      subtitle: 'الأوامر المخططة والصادرة وقيد التنفيذ',
      columns: [
        { key: 'orderNumber', label: 'رقم الأمر' },
        { key: 'product', label: 'المنتج' },
        { key: 'quantity', label: 'الكمية', type: 'number' },
        { key: 'status', label: 'الحالة' },
        { key: 'priority', label: 'الأولوية' },
        { key: 'dueDate', label: 'الاستحقاق', type: 'date' },
        { key: 'branch', label: 'الفرع' },
        { key: 'salesOrder', label: 'أمر البيع' },
        { key: 'customer', label: 'العميل' },
      ],
      rows: rows.map((row) => ({
        orderNumber: row.orderNumber,
        product: row.product,
        quantity: toNumber(row.quantity),
        status: statusLabels[row.status] || row.status,
        priority: priorityLabels[row.priority] || row.priority,
        dueDate: row.dueDate,
        branch: row.branch || '—',
        salesOrder: row.salesOrder || '—',
        customer: row.customer || '—',
      })),
      totals: [{ label: 'عدد الأوامر', value: rows.length, type: 'number' }],
    };
  }
}
