import { ReportCenterContext } from './context';
import type { ReportParams, ReportResult } from './types';
import { num, shiftDate } from './helpers';
import { round2 } from '../../finance/financials';

type Constructor<T = object> = new (...args: any[]) => T;

export function AuditLogsReports<TBase extends Constructor<ReportCenterContext>>(Base: TBase) {
  return class AuditLogsReports extends Base {
  public async shiftClosing({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('cs.branch_id');
    const rows = await this.db.queryAsync<any>(`
      SELECT cs.shift_number AS shiftNumber, cs.opened_at AS openedAt, cs.closed_at AS closedAt,
        cr.name AS register, COALESCE(u.full_name, '—') AS cashier, cs.status,
        cs.opening_balance / 100.0 AS opening, cs.total_sales_cash / 100.0 AS cashSales,
        cs.total_sales_card / 100.0 AS cardSales, cs.total_customer_payments / 100.0 AS collections,
        cs.total_expenses / 100.0 AS expenses, cs.total_refunds / 100.0 AS refunds,
        cs.expected_ending_cash / 100.0 AS expected, cs.actual_ending_cash / 100.0 AS actual,
        cs.cash_difference / 100.0 AS difference
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
  public async approvalsLog({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('a.branch_id');
    const rows = await this.db.queryAsync<any>(`
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
  public async exceptionsLog({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.salesScope();
    const priceRows = await this.db.queryAsync<any>(`
      SELECT si.date, 'بيع تحت الحد الأدنى' AS exceptionType,
        ('فاتورة ' || si.invoice_number || ' - ' || p.name) AS details,
        COALESCE(u.full_name, '—') AS userName,
        ((p.min_selling_price_m2 - sii.unit_price / 100.0) * sii.quantity_m2) AS value,
        COALESCE(c.name, '—') AS party
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      LEFT JOIN users u ON u.id = si.created_by
      LEFT JOIN customers c ON c.id = si.customer_id
      WHERE si.date >= ? AND si.date <= ? AND si.invoice_status != 'VOID'
        AND p.min_selling_price_m2 > 0 AND sii.unit_price / 100.0 < p.min_selling_price_m2 AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const voidRows = await this.db.queryAsync<any>(`
      SELECT substr(al.created_at, 1, 10) AS date,
        CASE WHEN al.action LIKE '%DELETE%' THEN 'حذف سطر/مستند' ELSE 'إلغاء عملية' END AS exceptionType,
        (al.module || ' - ' || COALESCE(al.record_id, '')) AS details,
        al.user_name AS userName, 0 AS value, '—' AS party
      FROM audit_logs al
      WHERE substr(al.created_at, 1, 10) >= ? AND substr(al.created_at, 1, 10) <= ?
        AND (al.action LIKE '%DELETE%' OR al.action LIKE '%VOID%' OR al.action LIKE '%CANCEL%')
      ORDER BY al.created_at DESC
    `, [from, to]);
    const returnRows = await this.db.queryAsync<any>(`
      SELECT sr.date, 'مرتجع بدون ربط فاتورة' AS exceptionType,
        ('مرتجع ' || sr.return_number) AS details, COALESCE(u.full_name, '—') AS userName,
        sr.total_amount / 100.0 AS value, COALESCE(c.name, '—') AS party
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.original_invoice_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.date >= ? AND sr.date <= ? AND (sr.original_invoice_id IS NULL OR sr.original_invoice_id = '') AND ${scope.clause}
    `, [from, to, ...scope.params]);
    const approvalScope = this.tableScope('a.branch_id');
    const approvalRows = await this.db.queryAsync<any>(`
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
  public async receivedReports({ from, to }: ReportParams): Promise<ReportResult> {
    const scope = this.tableScope('d.branch_id');
    const rows = await this.db.queryAsync<any>(`
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
  public async alertsSummary({ to }: ReportParams): Promise<ReportResult> {
    const stockScope = this.tableScope(
      'w.branch_id',
      'ws.warehouse_id',
    );
    const registerScope = this.tableScope('cr.branch_id');
    const customerScope = this.tableScope('c.branch_id');
    const approvalScope = this.tableScope('a.branch_id');
    const lowStock = await this.db.queryAsync<any>(`
      SELECT p.name, ws.quantity_m2 AS quantity, p.min_stock_level AS minLevel
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND ws.quantity_m2 <= COALESCE(p.min_stock_level, 0)
        AND ${stockScope.clause}
      ORDER BY ws.quantity_m2 ASC LIMIT 200
    `, [...stockScope.params]);
    const negativeRegisters = await this.db.queryAsync<any>(`
      SELECT cr.name, cr.current_balance / 100.0 AS balance
      FROM cash_registers cr
      WHERE cr.current_balance < 0 AND ${registerScope.clause}
    `, [...registerScope.params]);
    const overLimit = await this.db.queryAsync<any>(`
      SELECT c.name, c.current_balance / 100.0 AS balance, c.credit_limit AS creditLimit
      FROM customers c
      WHERE c.credit_limit > 0 AND c.current_balance > c.credit_limit
        AND ${customerScope.clause}
    `, [...customerScope.params]);
    const dueCheques = await this.db.queryAsync<any>(`
      SELECT cheque_number AS number, party_name AS party, amount / 100.0 AS amount, due_date AS dueDate
      FROM cheques WHERE status IN ('PENDING', 'DEPOSITED', 'RE_PRESENTED')
        AND due_date <= ? AND due_date >= ?
    `, [shiftDate(to, 7), to]);
    const pendingApprovals = await this.db.queryAsync<any>(`
      SELECT a.request_number AS number, a.title, a.requested_value AS value, a.created_at AS createdAt
      FROM approval_requests a
      WHERE a.status = 'PENDING' AND ${approvalScope.clause}
    `, [...approvalScope.params]);
    const lowMargin = await this.db.queryAsync<any>(`
      SELECT p.name, p.selling_price_m2 / 100.0 AS price, p.cost_price / 100.0 AS cost
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
  };
}
