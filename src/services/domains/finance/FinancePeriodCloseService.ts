import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { round2 } from './financials';
import type { Database } from 'sql.js';
import type { FiscalYear, FiscalPeriod } from '../../../types/finance';
import { FinanceEnterpriseContract01 } from './FinanceEnterpriseContract01';

export type CloseCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_APPLICABLE';
export type PeriodWorkflowState = 'OPEN' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'CLOSED' | 'LOCKED';

export interface FiscalCloseIssue {
  reference: string;
  message: string;
  documentId?: string;
  route?: string;
  amount?: number;
}

export interface FiscalCloseCheck {
  id: string;
  area:
    | 'SALES'
    | 'PURCHASES'
    | 'TREASURY'
    | 'BANKS'
    | 'CUSTOMERS'
    | 'SUPPLIERS'
    | 'INVENTORY'
    | 'COGS'
    | 'FIXED_ASSETS'
    | 'PAYROLL'
    | 'EXPENSES'
    | 'TAXES'
    | 'JOURNALS'
    | 'CONTROLS';
  label: string;
  status: CloseCheckStatus;
  /** Backwards-compatible flag: only FAIL blocks closing; warnings are review notes. */
  passed: boolean;
  issueCount: number;
  issues: string[];
  details: FiscalCloseIssue[];
  route?: string;
}

export interface PeriodCloseTask {
  id: string;
  fiscalPeriodId: string;
  closeRunId?: string | null;
  title: string;
  description?: string | null;
  department?: string | null;
  category: string;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEWED' | 'APPROVED' | 'CANCELLED';
  notes?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodAdjustment {
  id: string;
  fiscalPeriodId: string;
  adjustmentType: string;
  description: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REJECTED';
  journalEntryId?: string | null;
  createdBy: string;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  postedAt?: string | null;
  rejectionReason?: string | null;
}

export interface PeriodCloseReport {
  id: string;
  fiscalPeriodId: string;
  reportType: string;
  payload: PeriodCloseReportPayload;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface PeriodCloseReportPayload {
  period: { id: string; name: string; startDate: string; endDate: string };
  generatedAt: string;
  trialBalance: Array<{ code: string; name: string; type: string; debit: number; credit: number; balance: number }>;
  profitAndLoss: { revenue: number; expenses: number; grossProfit: number; netProfit: number };
  balanceSheet: { assets: number; liabilities: number; equity: number; balanced: boolean };
  cashFlow: { opening: number; inflow: number; outflow: number; closing: number };
  inventoryValuation: number;
  receivablesAging: Array<{ bucket: string; amount: number }>;
  partySubledgerBalances?: Array<{
    partyType: 'CUSTOMER' | 'SUPPLIER';
    partyId: string;
    controlAccountCode: string;
    balance: number;
  }>;
  subledgerCoverageStartDate?: string;
  legacyManualSubledgerMatches?: Array<{
    partyType: 'CUSTOMER' | 'SUPPLIER';
    verifiedSubledgerBalance: number;
    controlBalance: number;
    evidenceReference: string;
    notes?: string | null;
    createdByName: string;
    createdAt: string;
  }>;
}

export interface FiscalYearOpening {
  id: string;
  fiscalYearId: string;
  sourceYearId?: string | null;
  accountCode: string;
  accountName?: string | null;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
}

type QueryFn = (sql: string, params?: any[]) => any[];

interface PeriodRow {
  id: string;
  fiscalYearId: string;
  periodNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  workflowState?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  closeRunId?: string | null;
}

interface TaskInput {
  fiscalPeriodId: string;
  title: string;
  description?: string;
  department?: string;
  category?: string;
  assigneeUserId?: string;
  dueDate?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes?: string;
}

interface AdjustmentInput {
  fiscalPeriodId: string;
  adjustmentType:
    | 'ACCRUED_EXPENSE'
    | 'PREPAID_EXPENSE'
    | 'ACCRUED_REVENUE'
    | 'DEFERRED_REVENUE'
    | 'DEPRECIATION'
    | 'BAD_DEBT_PROVISION'
    | 'INVENTORY_VARIANCE'
    | 'COGS_ADJUSTMENT'
    | 'CASH_VARIANCE'
    | 'BANK_VARIANCE'
    | 'PAYROLL_ACCRUAL'
    | 'OTHER';
  description: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
}

const DEFAULT_CLOSE_TASKS: Array<{ title: string; department: string; category: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }> = [
  { title: 'مطابقة الخزينة والصناديق', department: 'الخزينة', category: 'TREASURY', priority: 'HIGH' },
  { title: 'مطابقة الحسابات البنكية', department: 'الحسابات', category: 'BANKS', priority: 'HIGH' },
  { title: 'مراجعة أرصدة العملاء', department: 'الحسابات', category: 'CUSTOMERS', priority: 'MEDIUM' },
  { title: 'مراجعة أرصدة الموردين', department: 'المشتريات والحسابات', category: 'SUPPLIERS', priority: 'MEDIUM' },
  { title: 'جرد وتسوية المخزون', department: 'المخازن', category: 'INVENTORY', priority: 'HIGH' },
  { title: 'احتساب وترحيل الإهلاك', department: 'الحسابات', category: 'FIXED_ASSETS', priority: 'MEDIUM' },
  { title: 'مراجعة الرواتب والعمولات', department: 'الموارد البشرية', category: 'PAYROLL', priority: 'MEDIUM' },
  { title: 'إعداد ميزان المراجعة', department: 'المحاسبة', category: 'JOURNALS', priority: 'HIGH' },
  { title: 'مراجعة الضرائب والتسويات', department: 'المحاسبة', category: 'TAXES', priority: 'MEDIUM' },
  { title: 'اعتماد إقفال الفترة', department: 'الإدارة المالية', category: 'APPROVAL', priority: 'CRITICAL' },
];

export abstract class FinancePeriodCloseService extends FinanceEnterpriseContract01 {
  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  protected closeActor() {
    return AuthService.requireAuth();
  }

  protected requireCloseControl() {
    const actor = this.closeActor();
    PermissionService.require(actor, 'finance.close');
    return actor;
  }

  protected getPeriodRow(periodId: string, query: QueryFn = (sql, params = []) => this.db.query<any>(sql, params)): PeriodRow {
    const period = query(`
      SELECT fp.id, fp.fiscal_year_id AS fiscalYearId, fp.period_number AS periodNumber,
             fp.name, fp.start_date AS startDate, fp.end_date AS endDate,
             fp.status, fp.workflow_state AS workflowState, fp.company_id AS companyId,
             fp.branch_id AS branchId, fp.close_run_id AS closeRunId
      FROM fiscal_periods fp WHERE fp.id = ?
    `, [periodId])[0];
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    return period as PeriodRow;
  }

  protected fiscalAudit(
    tx: { run: (sql: string, params?: any[]) => void },
    actor: { id: string; fullName: string },
    entityType: 'PERIOD' | 'YEAR' | 'ADJUSTMENT' | 'TASK',
    entityId: string,
    action: string,
    previousState?: string | null,
    newState?: string | null,
    reason?: string | null,
    extra?: { approvedBy?: string | null; journalEntryId?: string | null; metadata?: unknown; attachments?: unknown },
  ) {
    tx.run(`
      INSERT INTO fiscal_close_audit
        (id, entity_type, entity_id, action, previous_state, new_state, reason,
         actor_id, actor_name, approved_by, journal_entry_id, attachments_json, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `fca_${uuidv4().slice(0, 8)}`,
      entityType,
      entityId,
      action,
      previousState ?? null,
      newState ?? null,
      reason ?? null,
      actor.id,
      actor.fullName,
      extra?.approvedBy ?? null,
      extra?.journalEntryId ?? null,
      extra?.attachments ? JSON.stringify(extra.attachments) : null,
      extra?.metadata ? JSON.stringify(extra.metadata) : null,
      new Date().toISOString(),
    ]);
  }

  private issue(
    reference: string,
    message: string,
    route?: string,
    documentId?: string,
    amount?: number,
  ): FiscalCloseIssue {
    return { reference, message, route, documentId, amount };
  }

  private count(query: QueryFn, sql: string, params: any[] = []): number {
    return Number(query(sql, params)[0]?.count || 0);
  }

  private money(value: number): string {
    return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(value));
  }

  // -----------------------------------------------------------------
  // Automated monthly close review engine
  // -----------------------------------------------------------------
  protected buildPeriodCloseChecks(period: PeriodRow, query: QueryFn): FiscalCloseCheck[] {
    const params = [period.startDate, period.endDate];
    const checks: FiscalCloseCheck[] = [];

    // 1. Sales: posted invoices and returns -------------------------
    const salesMissing = query(`
      SELECT i.id AS documentId, i.invoice_number AS reference, i.total_amount AS amount
      FROM sales_invoices i
      WHERE i.date >= ? AND i.date <= ? AND i.invoice_status = 'COMPLETED'
        AND NOT EXISTS (SELECT 1 FROM journal_entries e
          WHERE e.reference_type = 'SALES_INVOICE' AND e.reference_id = i.id AND e.is_posted = 1)
      ORDER BY i.invoice_number LIMIT 25
    `, params);
    const returnsMissing = query(`
      SELECT r.id AS documentId, r.return_number AS reference, r.total_amount AS amount
      FROM sales_returns r
      WHERE r.date >= ? AND r.date <= ?
        AND NOT EXISTS (SELECT 1 FROM journal_entries e
          WHERE e.reference_type IN ('SALES_RETURN', 'SALES_VOID') AND e.reference_id = r.id AND e.is_posted = 1)
      ORDER BY r.return_number LIMIT 25
    `, params);
    const salesIssues = [
      ...salesMissing.map((row) => this.issue(row.reference, `فاتورة مبيعات غير مرحّلة: ${row.reference}`, '/sales/invoices', row.documentId, Number(row.amount || 0))),
      ...returnsMissing.map((row) => this.issue(row.reference, `مرتجع مبيعات غير مرحّل: ${row.reference}`, '/sales/returns', row.documentId, Number(row.amount || 0))),
    ];
    checks.push(this.makeCheck('sales', 'SALES', 'المبيعات: ترحيل الفواتير والمرتجعات والإشعارات',
      salesIssues.length ? 'FAIL' : 'PASS', salesIssues, '/sales/invoices'));

    // 2. Purchases ---------------------------------------------------
    const purchasesMissing = query(`
      SELECT i.id AS documentId, i.invoice_number AS reference, i.total_amount AS amount
      FROM purchase_invoices i
      WHERE i.date >= ? AND i.date <= ?
        AND NOT EXISTS (SELECT 1 FROM journal_entries e
          WHERE e.reference_type IN ('PURCHASE_INVOICE', 'PURCHASE_VOID') AND e.reference_id = i.id AND e.is_posted = 1)
      ORDER BY i.invoice_number LIMIT 25
    `, params);
    const purchaseReturnsMissing = query(`
      SELECT r.id AS documentId, r.return_number AS reference, r.total_amount AS amount
      FROM purchase_returns r
      WHERE r.date >= ? AND r.date <= ?
        AND NOT EXISTS (SELECT 1 FROM journal_entries e
          WHERE e.reference_type = 'PURCHASE_RETURN' AND e.reference_id = r.id AND e.is_posted = 1)
      ORDER BY r.return_number LIMIT 25
    `, params);
    const purchaseIssues = [
      ...purchasesMissing.map((row) => this.issue(row.reference, `فاتورة مشتريات غير مرحّلة: ${row.reference}`, '/purchases/invoices', row.documentId, Number(row.amount || 0))),
      ...purchaseReturnsMissing.map((row) => this.issue(row.reference, `مرتجع مشتريات غير مرحّل: ${row.reference}`, '/purchases/returns', row.documentId, Number(row.amount || 0))),
    ];
    checks.push(this.makeCheck('purchases', 'PURCHASES', 'المشتريات: الفواتير والمرتجعات والمستحقات',
      purchaseIssues.length ? 'FAIL' : 'PASS', purchaseIssues, '/purchases/invoices'));

    // 3. Treasury: shifts and cash differences ----------------------
    const openShifts = query(`
      SELECT cs.id AS documentId, cs.shift_number AS reference
      FROM cash_shifts cs
      WHERE date(cs.opened_at) <= date(?) AND (cs.closed_at IS NULL OR date(cs.closed_at) >= date(?))
        AND cs.status = 'OPEN'
      ORDER BY cs.shift_number LIMIT 25
    `, [period.endDate, period.startDate]);
    const cashDifferences = query(`
      SELECT cs.id AS documentId, cs.shift_number AS reference, cs.cash_difference AS amount
      FROM cash_shifts cs
      WHERE date(cs.closed_at) >= date(?) AND date(cs.closed_at) <= date(?)
        AND ABS(COALESCE(cs.cash_difference, 0)) > 0.009
      ORDER BY ABS(cs.cash_difference) DESC LIMIT 25
    `, params);
    const treasuryIssues = [
      ...openShifts.map((row) => this.issue(row.reference, `وردية خزينة مفتوحة: ${row.reference}`, '/operations/cashier', row.documentId)),
      ...cashDifferences.map((row) => this.issue(row.reference, `فرق خزينة غير معالج: ${row.reference} بمبلغ ${this.money(Number(row.amount || 0))}`, '/operations/cashier', row.documentId, Number(row.amount || 0))),
    ];
    checks.push(this.makeCheck('treasury', 'TREASURY', 'الخزينة: إغلاق الورديات ومطابقة الصناديق',
      openShifts.length ? 'FAIL' : cashDifferences.length ? 'WARNING' : 'PASS',
      treasuryIssues, '/operations/cashier'));

    // 4. Banks -------------------------------------------------------
    const unreconciled = query(`
      SELECT e.id AS documentId, e.entry_number AS reference, e.date AS date
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE e.date >= ? AND e.date <= ? AND e.is_posted = 1
        AND EXISTS (SELECT 1 FROM bank_accounts ba WHERE ba.gl_account_id = l.account_id AND ba.is_active = 1)
        AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_lines brl WHERE brl.journal_line_id = l.id AND brl.is_cleared = 1)
      GROUP BY e.id, e.entry_number, e.date
      ORDER BY e.date LIMIT 25
    `, params);
    const banksWithActivity = query(`
      SELECT DISTINCT ba.id AS documentId, ba.account_name AS reference
      FROM bank_accounts ba
      JOIN journal_entry_lines l ON l.account_id = ba.gl_account_id
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE ba.is_active = 1 AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
      ORDER BY ba.account_name LIMIT 25
    `, params);
    const approvedReconciliations = query(`
      SELECT DISTINCT br.bank_account_id AS bankAccountId
      FROM bank_reconciliations br
      WHERE br.status = 'APPROVED' AND br.statement_date >= ? AND br.statement_date <= ?
    `, params);
    const approvedIds = new Set(approvedReconciliations.map((row) => row.bankAccountId));
    const reconciliationIssues = [
      ...unreconciled.map((row) => this.issue(row.reference, `حركة بنكية غير مطابقة في القيد ${row.reference}`, '/finance/bank-reconciliation', row.documentId)),
      ...banksWithActivity
        .filter((row) => !approvedIds.has(row.documentId))
        .map((row) => this.issue(row.reference, `حساب بنكي به حركة بدون مطابقة معتمدة: ${row.reference}`, '/finance/bank-reconciliation', row.documentId)),
    ];
    checks.push(this.makeCheck('banks', 'BANKS', 'البنوك: اكتمال التسويات ومراجعة الحركات المعلقة',
      unreconciled.length ? 'WARNING' : reconciliationIssues.length ? 'WARNING' : 'PASS',
      reconciliationIssues, '/finance/bank-reconciliation'));

    checks.push(...this.buildPartyBalanceChecks(period, query));

    // 7. Inventory ---------------------------------------------------
    const stockValue = Number(query(`
      SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) AS count
      FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
    `)[0]?.count || 0);
    const inventoryGl = Number(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.code = '1104' AND e.is_posted = 1 AND e.date <= ?
    `, [period.endDate])[0]?.count || 0);
    const inventoryDelta = round2(stockValue - inventoryGl);
    const inventoryHasData = stockValue !== 0 || inventoryGl !== 0;
    checks.push(this.makeCheck('inventory', 'INVENTORY', 'المخزون: مطابقة الجرد الفعلي وتقييم السجلات',
      !inventoryHasData ? 'NOT_APPLICABLE' : Math.abs(inventoryDelta) > 1 ? 'WARNING' : 'PASS',
      Math.abs(inventoryDelta) > 1
        ? [this.issue('1104', `فرق تقييم المخزون: قيمة المخزون ${this.money(stockValue)} مقابل حساب المخزون ${this.money(inventoryGl)}`, '/inventory', undefined, inventoryDelta)]
        : [],
      '/inventory'));

    // 8. Cost of goods sold -----------------------------------------
    const invoiceCost = Number(query(`
      SELECT COALESCE(SUM(total_cost), 0) AS count FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status = 'COMPLETED'
    `, params)[0]?.count || 0);
    const cogsGl = Number(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.code = '5101' AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
    `, params)[0]?.count || 0);
    const cogsDelta = round2(invoiceCost - cogsGl);
    checks.push(this.makeCheck('cogs', 'COGS', 'تكلفة المبيعات: مراجعة تكلفة البضاعة المباعة',
      invoiceCost === 0 && cogsGl === 0 ? 'NOT_APPLICABLE' : Math.abs(cogsDelta) > 1 ? 'WARNING' : 'PASS',
      Math.abs(cogsDelta) > 1
        ? [this.issue('5101', `فرق تكلفة البضاعة المباعة: ${this.money(invoiceCost)} مقابل دفتر الأستاذ ${this.money(cogsGl)}`, '/finance/accounting', undefined, cogsDelta)]
        : [],
      '/finance/accounting'));

    // 9. Fixed assets depreciation ----------------------------------
    const periodKey = period.startDate.slice(0, 7);
    const depreciableAssets = query(`
      SELECT fa.id AS documentId, fa.code AS reference
      FROM fixed_assets fa
      WHERE fa.status = 'ACTIVE' AND fa.purchase_date <= ?
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries e
          WHERE e.reference_type = 'ASSET_DEPRECIATION'
            AND e.is_posted = 1
            AND e.reference_id = fa.id || ':' || ?
        )
      ORDER BY fa.code LIMIT 25
    `, [period.endDate, periodKey]);
    const totalAssets = this.count(query, `SELECT COUNT(*) AS count FROM fixed_assets WHERE status = 'ACTIVE'`);
    checks.push(this.makeCheck('fixed_assets', 'FIXED_ASSETS', 'الأصول الثابتة: ترحيل الإهلاكات الشهرية',
      totalAssets === 0 ? 'NOT_APPLICABLE' : depreciableAssets.length ? 'WARNING' : 'PASS',
      depreciableAssets.map((row) => this.issue(row.reference, `أصل بدون إهلاك مرحّل لهذا الشهر: ${row.reference}`, '/finance/fixed-assets', row.documentId)),
      '/finance/fixed-assets'));

    // 10. Payroll ----------------------------------------------------
    const payrollIssues = query(`
      SELECT pr.id AS documentId, pr.period AS reference, pr.status
      FROM payroll_runs pr
      WHERE pr.period = ? AND pr.status NOT IN ('PAID', 'CLOSED')
      ORDER BY pr.period LIMIT 25
    `, [periodKey]).map((row) => this.issue(row.reference, `دورة رواتب لم تُعتمد أو تُدفع بعد (${row.reference} - ${row.status})`, '/hr/payroll', row.documentId));
    const payrollActivity = this.count(query, `
      SELECT COUNT(*) AS count FROM journal_entries
      WHERE is_posted = 1 AND date >= ? AND date <= ?
        AND reference_type LIKE 'PAYROLL%'
    `, params);
    checks.push(this.makeCheck('payroll', 'PAYROLL', 'الموارد البشرية: الرواتب والسلف والخصومات المستحقة',
      payrollIssues.length ? 'WARNING' : payrollActivity ? 'PASS' : 'NOT_APPLICABLE',
      payrollIssues, '/hr/payroll'));

    // 11. Expenses ---------------------------------------------------
    const expenseIssues = query(`
      SELECT x.id AS documentId, COALESCE(x.description, x.category) AS reference, x.amount AS amount
      FROM expenses x
      WHERE x.date >= ? AND x.date <= ?
        AND NOT EXISTS (SELECT 1 FROM journal_entries j
          WHERE j.reference_type IN ('EXPENSE', 'EXPENSE_REVERSAL') AND j.reference_id = x.id AND j.is_posted = 1)
      ORDER BY x.date, x.id LIMIT 25
    `, params).map((row) => this.issue(
      row.reference,
      `مصروف غير مرحّل: ${row.reference} بمبلغ ${this.money(Number(row.amount || 0))}`,
      '/finance/expenses',
      row.documentId,
      Number(row.amount || 0),
    ));
    checks.push(this.makeCheck('expenses', 'EXPENSES', 'المصروفات: المستحقة والمقدمة والمكررة',
      expenseIssues.length ? 'FAIL' : 'PASS', expenseIssues, '/finance/expenses'));

    // 12. Taxes ------------------------------------------------------
    const outputTax = Number(query(`
      SELECT COALESCE(SUM(tax_amount), 0) AS count FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status = 'COMPLETED'
    `, params)[0]?.count || 0);
    const inputTax = Number(query(`
      SELECT COALESCE(SUM(tax_amount), 0) AS count FROM purchase_invoices
      WHERE date >= ? AND date <= ?
    `, params)[0]?.count || 0);
    const taxGl = Number(query(`
      SELECT COALESCE(SUM(l.credit - l.debit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.code = '2102' AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
    `, params)[0]?.count || 0);
    const taxExpected = round2(outputTax - inputTax);
    const taxDelta = round2(taxExpected - taxGl);
    checks.push(this.makeCheck('taxes', 'TAXES', 'الضرائب: مراجعة الحسابات والتسويات الضريبية',
      outputTax === 0 && inputTax === 0 && taxGl === 0 ? 'NOT_APPLICABLE' : Math.abs(taxDelta) > 1 ? 'WARNING' : 'PASS',
      Math.abs(taxDelta) > 1
        ? [this.issue('2102', `فرق الضريبة المستحقة: المتوقع ${this.money(taxExpected)} مقابل دفتر الأستاذ ${this.money(taxGl)}`, '/finance/tax', undefined, taxDelta)]
        : [],
      '/finance/tax'));

    // 13. Journal entries -------------------------------------------
    const unposted = query(`
      SELECT e.id AS documentId, e.entry_number AS reference, e.date AS date
      FROM journal_entries e
      WHERE e.date >= ? AND e.date <= ? AND e.is_posted = 0
      ORDER BY e.date, e.entry_number LIMIT 25
    `, params).map((row) => this.issue(row.reference, `قيد يومية غير مرحّل: ${row.reference}`, '/finance/journal', row.documentId));
    checks.push(this.makeCheck('unposted', 'JOURNALS', 'القيود اليومية: ترحيل جميع القيود',
      unposted.length ? 'FAIL' : 'PASS', unposted, '/finance/journal'));

    const unpostedCount = this.count(query, `
      SELECT COUNT(*) AS count FROM journal_entries
      WHERE date >= ? AND date <= ? AND is_posted = 0
    `, params);
    const unbalanced = query(`
      SELECT e.id AS documentId, e.entry_number AS reference
      FROM journal_entries e
      LEFT JOIN journal_entry_lines l ON l.entry_id = e.id
      WHERE e.date >= ? AND e.date <= ? AND e.is_posted = 1
      GROUP BY e.id, e.entry_number, e.total_debit, e.total_credit
      HAVING ABS(e.total_debit - e.total_credit) > 0.009
          OR ABS(COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)) > 0.009
      ORDER BY e.entry_number LIMIT 25
    `, params).map((row) => this.issue(row.reference, `قيد غير متزن: ${row.reference}`, '/finance/journal', row.documentId));
    checks.push(this.makeCheck('balances', 'JOURNALS', 'اتزان القيود المحاسبية المرحلة',
      unbalanced.length ? 'FAIL' : 'PASS', unbalanced, '/finance/journal'));

    // Keep the legacy unposted issue count visible in the UI.
    const unpostedCheck = checks.find((check) => check.id === 'unposted');
    if (unpostedCheck && unpostedCount > unpostedCheck.issueCount) {
      unpostedCheck.issueCount = unpostedCount;
      unpostedCheck.issues = [
        ...unpostedCheck.issues,
        `إجمالي القيود غير المرحلة: ${unpostedCount}`,
      ];
    }

    // 14. Suspense / intermediate accounts --------------------------
    const suspense = query(`
      SELECT a.code AS reference, a.name AS name, ROUND(SUM(l.debit - l.credit), 2) AS amount
      FROM chart_of_accounts a
      JOIN journal_entry_lines l ON l.account_id = a.id
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.code IN ('1106', '2103') AND e.is_posted = 1 AND e.date <= ?
      GROUP BY a.code, a.name
      HAVING ABS(SUM(l.debit - l.credit)) > 0.009
    `, [period.endDate]);
    checks.push(this.makeCheck('controls', 'CONTROLS', 'الحسابات المعلقة والوسيطة',
      suspense.length ? 'WARNING' : 'PASS',
      suspense.map((row) => this.issue(row.reference, `رصيد معلق في الحساب ${row.reference} - ${row.name}: ${this.money(Number(row.amount || 0))}`, '/finance/accounts', undefined, Number(row.amount || 0))),
      '/finance/accounts'));

    return checks;
  }

  private makeCheck(
    id: string,
    area: FiscalCloseCheck['area'],
    label: string,
    status: CloseCheckStatus,
    details: FiscalCloseIssue[],
    route?: string,
  ): FiscalCloseCheck {
    return {
      id,
      area,
      label,
      status,
      passed: status !== 'FAIL',
      issueCount: details.length,
      issues: details.map((detail) => detail.message),
      details,
      route,
    };
  }

  private buildPartyBalanceChecks(
    period: {
      id?: string;
      fiscalYearId?: string;
      startDate: string;
      endDate: string;
      companyId?: string | null;
    },
    query: QueryFn,
    idPrefix = '',
  ): FiscalCloseCheck[] {
    const companyId = period.companyId || 'cmp_main';
    const coverage = query(`
      SELECT coverage_start_date AS coverageStartDate, cutoff_entry_rowid AS cutoffEntryRowid
      FROM finance_subledger_coverage WHERE id = 1
    `)[0];
    const definitions = [
      {
        partyType: 'CUSTOMER' as const,
        accountCode: '1103',
        label: 'العملاء: مطابقة سجل الحركات مع حساب المدينين',
        route: '/customers',
        side: 'debit' as const,
      },
      {
        partyType: 'SUPPLIER' as const,
        accountCode: '2101',
        label: 'الموردون: مطابقة سجل الحركات مع حساب الدائنين',
        route: '/suppliers',
        side: 'credit' as const,
      },
    ];

    return definitions.map((definition) => {
      const details: FiscalCloseIssue[] = [];
      let manualMatchPassed = false;
      const coverageStartDate = coverage?.coverageStartDate;
      if (!coverageStartDate) {
        details.push(this.issue(
          definition.accountCode,
          'لم يُهيّأ خط أساس موثوق لسجل حركات الأطراف؛ يجب إكمال التهيئة والمطابقة قبل الإقفال.',
          definition.route,
        ));
      } else if (period.startDate < coverageStartDate) {
        const manualPeriodId = period.id || query(`
          SELECT id FROM fiscal_periods
          WHERE fiscal_year_id = ? AND end_date = ?
          ORDER BY period_number DESC LIMIT 1
        `, [period.fiscalYearId, period.endDate])[0]?.id;
        const manualMatch = query(`
          SELECT verified_subledger_balance AS verifiedSubledgerBalance,
                 control_balance AS controlBalance,
                 evidence_reference AS evidenceReference,
                 created_at AS createdAt
          FROM finance_subledger_manual_reconciliations
          WHERE period_id = ? AND company_id = ? AND party_type = ?
          ORDER BY created_at DESC LIMIT 1
        `, [manualPeriodId, companyId, definition.partyType])[0];
        const controlBalance = Number(query(`
          SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
          WHERE a.code = ? AND e.is_posted = 1 AND e.date <= ?
            AND COALESCE(e.company_id, 'cmp_main') = ?
        `, [definition.accountCode, period.endDate, companyId])[0]?.balance || 0);
        const normalizedControl = definition.side === 'debit' ? controlBalance : -controlBalance;
        if (!manualMatch) {
          details.push(this.issue(
            definition.accountCode,
            `الفترة تبدأ قبل تاريخ تغطية سجل الحركات (${coverageStartDate})؛ يلزم إجراء مطابقة يدوية موثقة لهذه الفترة.`,
            definition.route,
          ));
        } else if (
          Math.abs(Number(manualMatch.verifiedSubledgerBalance) - Number(manualMatch.controlBalance)) > 0.009
          || Math.abs(Number(manualMatch.controlBalance) - normalizedControl) > 0.009
        ) {
          details.push(this.issue(
            definition.accountCode,
            `المطابقة اليدوية المسجلة لا تطابق رصيد الأستاذ الحالي (${this.money(normalizedControl)}). أعد المطابقة مع مستندات الفترة.`,
            definition.route,
            undefined,
            round2(Number(manualMatch.verifiedSubledgerBalance) - normalizedControl),
          ));
        } else {
          manualMatchPassed = true;
          details.push(this.issue(
            definition.accountCode,
            `مطابقة يدوية موثقة (${manualMatch.evidenceReference}) بتاريخ ${manualMatch.createdAt}.`,
            definition.route,
          ));
        }
      } else {
        const baseline = query(`
          SELECT balance FROM finance_subledger_control_baselines
          WHERE company_id = ? AND account_code = ?
        `, [companyId, definition.accountCode])[0];
        const baselineControl = Number(query(`
          SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
          WHERE a.code = ? AND e.is_posted = 1
            AND e.date <= ? AND e.rowid <= ?
            AND COALESCE(e.company_id, 'cmp_main') = ?
        `, [
          definition.accountCode, coverageStartDate,
          Number(coverage.cutoffEntryRowid || 0), companyId,
        ])[0]?.balance || 0);
        const normalizedBaselineControl = definition.side === 'debit' ? baselineControl : -baselineControl;
        if (!baseline && Math.abs(normalizedBaselineControl) > 0.009) {
          details.push(this.issue(
            definition.accountCode,
            `توجد حركة تاريخية في حساب ${definition.accountCode} للشركة ${companyId} دون خط أساس موثوق.`,
            definition.route,
          ));
        } else if (baseline && Math.abs(Number(baseline.balance) - normalizedBaselineControl) > 0.009) {
          details.push(this.issue(
            definition.accountCode,
            `خط أساس الحساب ${definition.accountCode} لا يطابق الأستاذ العام عند التهيئة.`,
            definition.route,
            undefined,
            round2(Number(baseline.balance) - normalizedBaselineControl),
          ));
        }

        const partyBalance = Number(query(`
          SELECT COALESCE((
                   SELECT SUM(balance) FROM finance_subledger_party_baselines
                   WHERE company_id = ? AND party_type = ?
                 ), 0) + COALESCE((
                   SELECT SUM(amount) FROM finance_subledger_events
                   WHERE company_id = ? AND party_type = ? AND account_code = ?
                     AND effective_date <= ?
                 ), 0) AS balance
        `, [
          companyId, definition.partyType, companyId, definition.partyType,
          definition.accountCode, period.endDate,
        ])[0]?.balance || 0);
        const controlBalance = Number(query(`
          SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
          WHERE a.code = ? AND e.is_posted = 1 AND e.date <= ?
            AND COALESCE(e.company_id, 'cmp_main') = ?
        `, [definition.accountCode, period.endDate, companyId])[0]?.balance || 0);
        const normalizedControl = definition.side === 'debit' ? controlBalance : -controlBalance;
        const delta = round2(partyBalance - normalizedControl);
        if (Math.abs(delta) > 0.009) {
          details.push(this.issue(
            definition.accountCode,
            `فرق سجل الأطراف (${this.money(partyBalance)}) عن حساب الأستاذ العام (${this.money(normalizedControl)}) بمقدار ${this.money(delta)}.`,
            definition.route,
            undefined,
            delta,
          ));
        }

        const unassigned = query(`
          SELECT e.id AS documentId, e.entry_number AS reference,
                 ROUND(SUM(l.debit - l.credit), 2) AS amount
          FROM journal_entries e
          JOIN journal_entry_lines l ON l.entry_id = e.id
          JOIN chart_of_accounts a ON a.id = l.account_id
          WHERE a.code = ? AND e.is_posted = 1 AND e.date <= ?
            AND COALESCE(e.company_id, 'cmp_main') = ?
            AND e.rowid > ?
            AND NOT EXISTS (
              SELECT 1 FROM finance_subledger_events se
              WHERE se.journal_entry_id = e.id AND se.account_code = a.code
                AND se.company_id = ?
            )
          GROUP BY e.id, e.entry_number
          HAVING ABS(SUM(l.debit - l.credit)) > 0.009
          ORDER BY e.date, e.entry_number LIMIT 25
        `, [
          definition.accountCode, period.endDate, companyId,
          Number(coverage.cutoffEntryRowid || 0), companyId,
        ]);
        for (const row of unassigned) {
          details.push(this.issue(
            row.reference,
            `حركة غير مسندة إلى عميل أو مورد في حساب ${definition.accountCode}: ${row.reference}.`,
            definition.route,
            row.documentId,
            Number(row.amount || 0),
          ));
        }
      }

      return this.makeCheck(
        `${idPrefix}${definition.partyType.toLowerCase()}_subledger`,
        definition.partyType === 'CUSTOMER' ? 'CUSTOMERS' : 'SUPPLIERS',
        definition.label,
        manualMatchPassed && details.length === 1 ? 'PASS' : details.length ? 'FAIL' : 'PASS',
        details,
        definition.route,
      );
    });
  }

  public recordLegacySubledgerReconciliation(
    periodId: string,
    partyType: 'CUSTOMER' | 'SUPPLIER',
    verifiedSubledgerBalance: number,
    evidenceReference: string,
    notes?: string,
  ): void {
    const actor = this.requireCloseControl();
    const period = this.getPeriodRow(periodId);
    if (period.status !== 'OPEN') throw new Error('يجب إعادة فتح الفترة قبل تسجيل المطابقة اليدوية.');
    const coverage = this.db.query<{ coverageStartDate: string }>(`
      SELECT coverage_start_date AS coverageStartDate
      FROM finance_subledger_coverage WHERE id = 1
    `)[0];
    if (!coverage?.coverageStartDate) throw new Error('لم يُهيّأ تاريخ تغطية سجل حركات الأطراف.');
    if (period.startDate >= coverage.coverageStartDate) {
      throw new Error('المطابقة اليدوية مخصصة للفترات السابقة لتاريخ تغطية السجل.');
    }
    if (!Number.isFinite(verifiedSubledgerBalance) || !evidenceReference.trim()) {
      throw new Error('أدخل رصيد دفتر الأطراف ومرجع مستند المطابقة.');
    }

    const accountCode = partyType === 'CUSTOMER' ? '1103' : '2101';
    const companyId = period.companyId || 'cmp_main';
    const rawControlBalance = Number(this.db.query<{ balance: number }>(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE a.code = ? AND e.is_posted = 1 AND e.date <= ?
        AND COALESCE(e.company_id, 'cmp_main') = ?
    `, [accountCode, period.endDate, companyId])[0]?.balance || 0);
    const controlBalance = round2(partyType === 'CUSTOMER' ? rawControlBalance : -rawControlBalance);
    const verifiedBalance = round2(verifiedSubledgerBalance);
    if (Math.abs(verifiedBalance - controlBalance) > 0.009) {
      throw new Error(`رصيد دفتر الأطراف (${this.money(verifiedBalance)}) لا يطابق الأستاذ العام (${this.money(controlBalance)}).`);
    }

    this.db.run(`
      INSERT INTO finance_subledger_manual_reconciliations
        (id, period_id, company_id, party_type, verified_subledger_balance, control_balance,
         evidence_reference, notes, created_by, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `fsmr_${uuidv4().slice(0, 12)}`, periodId, companyId, partyType,
      verifiedBalance, controlBalance, evidenceReference.trim(), notes?.trim() || null,
      actor.id, actor.fullName, new Date().toISOString(),
    ]);
  }

  public getPeriodCloseChecks(periodId: string): FiscalCloseCheck[] {
    this.requireView();
    const period = this.getPeriodRow(periodId);
    return this.buildPeriodCloseChecks(period, (sql, params = []) => this.db.query<any>(sql, params));
  }

  // -----------------------------------------------------------------
  // Period workflow transitions
  // -----------------------------------------------------------------
  public getPeriodWorkflow(periodId: string): {
    period: FiscalPeriod;
    workflowState: PeriodWorkflowState;
    tasks: PeriodCloseTask[];
    checks: FiscalCloseCheck[];
    blockingIssues: number;
    warnings: number;
    completedTasks: number;
    totalTasks: number;
  } {
    const checks = this.getPeriodCloseChecks(periodId);
    const tasks = this.getPeriodCloseTasks(periodId);
    const period = this.getFiscalPeriods().find((item) => item.id === periodId);
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    return {
      period,
      workflowState: this.resolveWorkflowState(period.status, (period as any).workflowState),
      tasks,
      checks,
      blockingIssues: checks.filter((check) => check.status === 'FAIL').length,
      warnings: checks.filter((check) => check.status === 'WARNING').length,
      completedTasks: tasks.filter((task) => ['COMPLETED', 'REVIEWED', 'APPROVED'].includes(task.status)).length,
      totalTasks: tasks.length,
    };
  }

  private resolveWorkflowState(status: string, workflowState?: string | null): PeriodWorkflowState {
    if (status === 'LOCKED' || workflowState === 'LOCKED') return 'LOCKED';
    if (status === 'CLOSED' || workflowState === 'CLOSED') return 'CLOSED';
    if (workflowState === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
    if (workflowState === 'IN_REVIEW') return 'IN_REVIEW';
    return 'OPEN';
  }

  public startPeriodReview(periodId: string): void {
    const actor = this.requireCloseControl();
    this.transitionPeriod(periodId, ['OPEN'], 'IN_REVIEW', 'START_REVIEW', actor, () => ({
      review_started_by: actor.id,
      review_started_at: new Date().toISOString(),
    }));
  }

  public submitPeriodForApproval(periodId: string): void {
    const actor = this.requireCloseControl();
    const checks = this.getPeriodCloseChecks(periodId);
    const blocking = checks.filter((check) => check.status === 'FAIL');
    if (blocking.length) {
      throw new Error(`لا يمكن إرسال الفترة للاعتماد قبل معالجة ${blocking.length} فحصًا حاجبًا: ${blocking.map((check) => check.label).join('، ')}`);
    }
    this.transitionPeriod(periodId, ['OPEN', 'IN_REVIEW'], 'PENDING_APPROVAL', 'SUBMIT_FOR_APPROVAL', actor, () => ({
      submitted_by: actor.id,
      submitted_at: new Date().toISOString(),
    }));
  }

  public approveAndClosePeriod(periodId: string, notes?: string): void {
    const actor = this.requireCloseControl();
    const initialChecks = this.getPeriodCloseChecks(periodId);
    const initialBlocking = initialChecks.filter((check) => check.status === 'FAIL');
    if (initialBlocking.length) {
      throw new Error(`تعذر اعتماد الإقفال: ${initialBlocking.length} فحصًا حاجبًا لم يُستوفَ (${initialBlocking.map((check) => check.label).join('، ')}).`);
    }
    this.db.executeTransaction((tx) => {
      const period = this.getPeriodRow(periodId, (sql, params = []) => tx.query(sql, params));
      const workflow = this.resolveWorkflowState(period.status, period.workflowState);
      if (workflow === 'CLOSED' || workflow === 'LOCKED') throw new Error('الفترة مقفلة بالفعل.');
      const checks = this.buildPeriodCloseChecks(period, (sql, params = []) => tx.query<any>(sql, params));
      const blocking = checks.filter((check) => check.status === 'FAIL');
      if (blocking.length) {
        throw new Error(`تعذر اعتماد الإقفال: ${blocking.length} فحصًا حاجبًا لم يُستوفَ (${blocking.map((check) => check.label).join('، ')}).`);
      }
      const now = new Date().toISOString();
      const runId = this.createCloseRun(tx, period, actor, checks, 'APPROVED', notes);
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'CLOSED', workflow_state = 'CLOSED', closed_at = ?, closed_by = ?,
            closing_notes = ?, approved_by = ?, approved_at = ?, close_run_id = ?
        WHERE id = ?
      `, [now, actor.id, notes || null, actor.id, now, runId, periodId]);
      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'APPROVE_AND_CLOSE', workflow, 'CLOSED', notes);
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, notes, created_at)
        VALUES (?, 'PERIOD', ?, 'FINAL', 'APPROVED', ?, ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, periodId, actor.id, actor.fullName, notes || null, now]);
      const subledgerSnapshot = this.capturePartySubledgerSnapshot(tx, period);
      this.captureCloseSnapshot(
        tx, period, actor, runId,
        subledgerSnapshot.balances,
        subledgerSnapshot.coverageStartDate,
        subledgerSnapshot.manualMatches,
      );
    });
  }

  public lockPeriod(periodId: string): void {
    const actor = this.requireCloseControl();
    this.db.executeTransaction((tx) => {
      const period = this.getPeriodRow(periodId, (sql, params = []) => tx.query(sql, params));
      const workflow = this.resolveWorkflowState(period.status, period.workflowState);
      if (workflow !== 'CLOSED') throw new Error('لا يمكن تأمين الفترة نهائيًا قبل إقفالها واعتمادها.');
      const now = new Date().toISOString();
      tx.run(`
        UPDATE fiscal_periods SET status = 'LOCKED', workflow_state = 'LOCKED', locked_by = ?, locked_at = ?
        WHERE id = ?
      `, [actor.id, now, periodId]);
      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'LOCK_PERIOD', workflow, 'LOCKED');
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, created_at)
        VALUES (?, 'PERIOD', ?, 'FINAL', 'LOCKED', ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, periodId, actor.id, actor.fullName, now]);
    });
  }

  private transitionPeriod(
    periodId: string,
    from: PeriodWorkflowState[],
    to: PeriodWorkflowState,
    action: string,
    actor: { id: string; fullName: string },
    extra: () => Record<string, any>,
  ): void {
    this.db.executeTransaction((tx) => {
      const period = this.getPeriodRow(periodId, (sql, params = []) => tx.query(sql, params));
      const workflow = this.resolveWorkflowState(period.status, period.workflowState);
      if (!from.includes(workflow)) {
        throw new Error(`لا يمكن تنفيذ الإجراء من الحالة الحالية (${workflow}).`);
      }
      const fields = extra();
      const assignments = Object.keys(fields).map((key) => `${key} = ?`).join(', ');
      tx.run(`UPDATE fiscal_periods SET workflow_state = ?, ${assignments} WHERE id = ?`,
        [to, ...Object.values(fields), periodId]);
      this.fiscalAudit(tx, actor, 'PERIOD', periodId, action, workflow, to);
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, created_at)
        VALUES (?, 'PERIOD', ?, ?, 'SUBMITTED', ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, periodId, action, actor.id, actor.fullName, new Date().toISOString()]);
    });
  }

  // -----------------------------------------------------------------
  // Close runs / reconciliations / snapshots
  // -----------------------------------------------------------------
  protected createCloseRun(
    tx: any,
    period: PeriodRow,
    actor: { id: string; fullName: string },
    checks: FiscalCloseCheck[],
    status: 'BLOCKED' | 'COMPLETED' | 'APPROVED',
    notes?: string,
  ): string {
    const runNumber = Number(tx.query(
      'SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM period_close_runs WHERE fiscal_period_id = ?',
      [period.id],
    )[0]?.next || 1);
    const runId = `pcr_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    tx.run(`
      INSERT INTO period_close_runs
        (id, fiscal_period_id, run_number, status, started_by, started_at, completed_by, completed_at,
         approved_by, approved_at, summary_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      runId, period.id, runNumber, status, actor.id, now,
      status === 'BLOCKED' ? null : actor.id,
      status === 'BLOCKED' ? null : now,
      status === 'APPROVED' ? actor.id : null,
      status === 'APPROVED' ? now : null,
      JSON.stringify(checks), notes || null,
    ]);
    for (const check of checks) {
      tx.run(`
        INSERT INTO period_reconciliations
          (id, fiscal_period_id, close_run_id, area, status, issue_count, details_json, checked_by, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `prc_${uuidv4().slice(0, 8)}`, period.id, runId, check.area, check.status,
        check.issueCount, JSON.stringify(check.details), actor.id, now,
      ]);
    }
    return runId;
  }

  protected buildFinancialSnapshot(period: PeriodRow, query: QueryFn): PeriodCloseReportPayload {
    const trialBalance = query(`
      SELECT a.code AS code, a.name AS name, a.type AS type,
             ROUND(COALESCE(SUM(l.debit), 0), 2) AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
      GROUP BY a.code, a.name, a.type
      HAVING ABS(COALESCE(SUM(l.debit - l.credit), 0)) > 0.009
      ORDER BY a.code
    `, [period.startDate, period.endDate]).map((row) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      debit: round2(Number(row.debit || 0)),
      credit: round2(Number(row.credit || 0)),
      balance: round2(Number(row.balance || 0)),
    }));

    const revenue = round2(-trialBalance
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum + row.balance, 0));
    const expenses = round2(trialBalance
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + row.balance, 0));
    const cogs = round2(trialBalance
      .filter((row) => row.code === '5101')
      .reduce((sum, row) => sum + row.balance, 0));

    const assetBalance = round2(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'ASSET'
    `, [period.endDate])[0]?.count || 0);
    const liabilityBalance = round2(-Number(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'LIABILITY'
    `, [period.endDate])[0]?.count || 0));
    const equityBalance = round2(-Number(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'EQUITY'
    `, [period.endDate])[0]?.count || 0));

    const cashOpening = round2(query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date < ? AND a.code IN ('1101', '1102', '1105')
    `, [period.startDate])[0]?.count || 0);
    const cashMovement = query(`
      SELECT COALESCE(SUM(l.debit), 0) AS inflow, COALESCE(SUM(l.credit), 0) AS outflow
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ? AND a.code IN ('1101', '1102', '1105')
    `, [period.startDate, period.endDate])[0] || { inflow: 0, outflow: 0 };
    const inflow = round2(Number(cashMovement.inflow || 0));
    const outflow = round2(Number(cashMovement.outflow || 0));

    const inventoryValuation = round2(query(`
      SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) AS count
      FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
    `)[0]?.count || 0);

    const receivablesAging = query(`
      SELECT CASE
               WHEN julianday(?) - julianday(COALESCE(due_date, date)) <= 0 THEN 'غير مستحق'
               WHEN julianday(?) - julianday(COALESCE(due_date, date)) <= 30 THEN '1-30 يوم'
               WHEN julianday(?) - julianday(COALESCE(due_date, date)) <= 60 THEN '31-60 يوم'
               WHEN julianday(?) - julianday(COALESCE(due_date, date)) <= 90 THEN '61-90 يوم'
               ELSE 'أكثر من 90 يوم'
             END AS bucket,
             ROUND(SUM(remaining_amount), 2) AS amount
      FROM sales_invoices
      WHERE remaining_amount > 0.009 AND date <= ?
      GROUP BY bucket
    `, [period.endDate, period.endDate, period.endDate, period.endDate, period.endDate]).map((row) => ({
      bucket: row.bucket,
      amount: round2(Number(row.amount || 0)),
    }));

    return {
      period: { id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate },
      generatedAt: new Date().toISOString(),
      trialBalance,
      profitAndLoss: {
        revenue,
        expenses,
        grossProfit: round2(revenue - cogs),
        netProfit: round2(revenue - expenses),
      },
      balanceSheet: {
        assets: assetBalance,
        liabilities: liabilityBalance,
        equity: equityBalance,
        balanced: Math.abs(assetBalance - (liabilityBalance + equityBalance)) <= 1,
      },
      cashFlow: { opening: cashOpening, inflow, outflow, closing: round2(cashOpening + inflow - outflow) },
      inventoryValuation,
      receivablesAging,
    };
  }

  protected capturePartySubledgerSnapshot(
    tx: any,
    period: PeriodRow,
  ): {
    balances: NonNullable<PeriodCloseReportPayload['partySubledgerBalances']>;
    coverageStartDate?: string;
    manualMatches: NonNullable<PeriodCloseReportPayload['legacyManualSubledgerMatches']>;
  } {
    const companyId = period.companyId || 'cmp_main';
    const coverageStartDate = tx.query(`
      SELECT coverage_start_date AS coverageStartDate
      FROM finance_subledger_coverage WHERE id = 1
    `)[0]?.coverageStartDate;
    if (coverageStartDate && period.startDate < coverageStartDate) {
      const manualRows = tx.query(`
        SELECT party_type AS partyType,
               verified_subledger_balance AS verifiedSubledgerBalance,
               control_balance AS controlBalance,
               evidence_reference AS evidenceReference,
               notes, created_by_name AS createdByName, created_at AS createdAt
        FROM finance_subledger_manual_reconciliations
        WHERE period_id = ? AND company_id = ?
        ORDER BY party_type, created_at DESC
      `, [period.id, companyId]);
      const seenTypes = new Set<string>();
      const manualMatches = manualRows
        .filter((row: any) => {
          if (seenTypes.has(row.partyType)) return false;
          seenTypes.add(row.partyType);
          return true;
        })
        .map((row: any) => ({
          partyType: row.partyType as 'CUSTOMER' | 'SUPPLIER',
          verifiedSubledgerBalance: round2(Number(row.verifiedSubledgerBalance || 0)),
          controlBalance: round2(Number(row.controlBalance || 0)),
          evidenceReference: row.evidenceReference,
          notes: row.notes,
          createdByName: row.createdByName,
          createdAt: row.createdAt,
        }));
      return { balances: [], coverageStartDate, manualMatches };
    }
    const balances = tx.query(`
      WITH parties AS (
        SELECT party_type, party_id
        FROM finance_subledger_party_baselines WHERE company_id = ?
        UNION
        SELECT party_type, party_id
        FROM finance_subledger_events
        WHERE company_id = ? AND effective_date <= ?
      )
      SELECT p.party_type AS partyType, p.party_id AS partyId,
             CASE p.party_type WHEN 'CUSTOMER' THEN '1103' ELSE '2101' END AS controlAccountCode,
             ROUND(COALESCE(b.balance, 0) + COALESCE(SUM(e.amount), 0), 2) AS balance
      FROM parties p
      LEFT JOIN finance_subledger_party_baselines b
        ON b.company_id = ? AND b.party_type = p.party_type AND b.party_id = p.party_id
      LEFT JOIN finance_subledger_events e
        ON e.company_id = ? AND e.party_type = p.party_type AND e.party_id = p.party_id
        AND e.account_code = CASE p.party_type WHEN 'CUSTOMER' THEN '1103' ELSE '2101' END
        AND e.effective_date <= ?
      GROUP BY p.party_type, p.party_id, b.balance
      ORDER BY p.party_type, p.party_id
    `, [companyId, companyId, period.endDate, companyId, companyId, period.endDate])
      .map((row: any) => ({
        partyType: row.partyType as 'CUSTOMER' | 'SUPPLIER',
        partyId: row.partyId as string,
        controlAccountCode: row.controlAccountCode as string,
        balance: round2(Number(row.balance || 0)),
      }));
    const batchId = `pss_${uuidv4().slice(0, 12)}`;
    const capturedAt = new Date().toISOString();
    for (const balance of balances) {
      tx.run(`
        INSERT INTO fiscal_period_subledger_snapshots
          (id, snapshot_batch_id, period_id, company_id, party_type, party_id,
           control_account_code, balance, effective_date, captured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `psl_${uuidv4().slice(0, 12)}`, batchId, period.id, companyId,
        balance.partyType, balance.partyId, balance.controlAccountCode,
        balance.balance, period.endDate, capturedAt,
      ]);
    }
    return { balances, coverageStartDate, manualMatches: [] };
  }

  protected captureCloseSnapshot(
    tx: any,
    period: PeriodRow,
    actor: { id: string; fullName: string },
    runId: string,
    partySubledgerBalances?: PeriodCloseReportPayload['partySubledgerBalances'],
    subledgerCoverageStartDate?: string,
    legacyManualSubledgerMatches?: PeriodCloseReportPayload['legacyManualSubledgerMatches'],
  ): string {
    const payload = this.buildFinancialSnapshot(period, (sql, params = []) => tx.query(sql, params));
    payload.partySubledgerBalances = partySubledgerBalances;
    payload.subledgerCoverageStartDate = subledgerCoverageStartDate;
    payload.legacyManualSubledgerMatches = legacyManualSubledgerMatches;
    const reportId = `pcrep_${uuidv4().slice(0, 8)}`;
    tx.run(`
      INSERT INTO period_close_reports
        (id, fiscal_period_id, report_type, payload_json, approved_by, approved_at, created_by, created_at)
      VALUES (?, ?, 'MONTHLY_CLOSE', ?, ?, ?, ?, ?)
    `, [
      reportId, period.id, JSON.stringify(payload), actor.id,
      new Date().toISOString(), actor.id, new Date().toISOString(),
    ]);
    this.fiscalAudit(tx, actor, 'PERIOD', period.id, 'CAPTURE_CLOSE_REPORT', null, 'CLOSED', null, {
      metadata: { runId, reportId },
    });
    return reportId;
  }

  public getPeriodCloseReport(periodId: string): PeriodCloseReport | null {
    this.requireView();
    const row = this.db.query<any>(`
      SELECT id, fiscal_period_id AS fiscalPeriodId, report_type AS reportType,
             payload_json AS payloadJson, approved_by AS approvedBy, approved_at AS approvedAt,
             created_at AS createdAt
      FROM period_close_reports
      WHERE fiscal_period_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [periodId])[0];
    if (!row) return null;
    return {
      id: row.id,
      fiscalPeriodId: row.fiscalPeriodId,
      reportType: row.reportType,
      payload: JSON.parse(row.payloadJson),
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      createdAt: row.createdAt,
    };
  }

  public getCloseRuns(periodId: string): any[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT r.id, r.fiscal_period_id AS fiscalPeriodId, r.run_number AS runNumber,
             r.status, r.started_by AS startedBy, r.started_at AS startedAt,
             r.completed_at AS completedAt, r.approved_at AS approvedAt,
             r.summary_json AS summaryJson, r.notes, u.full_name AS startedByName
      FROM period_close_runs r
      LEFT JOIN users u ON u.id = r.started_by
      WHERE r.fiscal_period_id = ?
      ORDER BY r.run_number DESC
    `, [periodId]).map((row) => ({ ...row, summary: row.summaryJson ? JSON.parse(row.summaryJson) : [] }));
  }

  // -----------------------------------------------------------------
  // Monthly close tasks
  // -----------------------------------------------------------------
  public getPeriodCloseTasks(periodId?: string): PeriodCloseTask[] {
    this.requireView();
    const params: any[] = [];
    let where = '';
    if (periodId) {
      where = 'WHERE t.fiscal_period_id = ?';
      params.push(periodId);
    }
    return this.db.query<any>(`
      SELECT t.id, t.fiscal_period_id AS fiscalPeriodId, t.close_run_id AS closeRunId,
             t.title, t.description, t.department, t.category,
             t.assignee_user_id AS assigneeUserId, u.full_name AS assigneeName,
             t.due_date AS dueDate, t.priority, t.status, t.notes,
             t.completed_at AS completedAt, t.completed_by AS completedBy,
             cu.full_name AS completedByName, t.reviewed_at AS reviewedAt,
             t.approved_at AS approvedAt, t.created_by AS createdBy,
             t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM period_close_tasks t
      LEFT JOIN users u ON u.id = t.assignee_user_id
      LEFT JOIN users cu ON cu.id = t.completed_by
      ${where}
      ORDER BY
        CASE t.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        t.due_date, t.created_at
    `, params);
  }

  public createPeriodCloseTask(input: TaskInput): string {
    const actor = this.requireManage();
    this.getPeriodRow(input.fiscalPeriodId);
    if (!input.title?.trim()) throw new Error('عنوان المهمة إلزامي.');
    if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw new Error('تاريخ استحقاق المهمة غير صحيح.');
    }
    const id = `pct_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO period_close_tasks
          (id, fiscal_period_id, title, description, department, category, assignee_user_id,
           due_date, priority, status, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
      `, [
        id, input.fiscalPeriodId, input.title.trim(), input.description?.trim() || null,
        input.department?.trim() || null, input.category || 'GENERAL',
        input.assigneeUserId || null, input.dueDate || null, input.priority || 'MEDIUM',
        input.notes?.trim() || null, actor.id, now, now,
      ]);
      this.fiscalAudit(tx, actor, 'TASK', id, 'CREATE_TASK', null, 'PENDING', null, {
        metadata: { fiscalPeriodId: input.fiscalPeriodId, title: input.title },
      });
    });
    return id;
  }

  public generateDefaultPeriodTasks(periodId: string): number {
    const actor = this.requireManage();
    this.getPeriodRow(periodId);
    const existing = Number(this.db.query<any>(
      'SELECT COUNT(*) AS count FROM period_close_tasks WHERE fiscal_period_id = ?',
      [periodId],
    )[0]?.count || 0);
    if (existing > 0) throw new Error('توجد مهام إقفال لهذه الفترة بالفعل.');
    const period = this.getPeriodRow(periodId);
    const dueDate = period.endDate;
    let created = 0;
    this.db.executeTransaction((tx) => {
      for (const task of DEFAULT_CLOSE_TASKS) {
        const id = `pct_${uuidv4().slice(0, 8)}`;
        const now = new Date().toISOString();
        tx.run(`
          INSERT INTO period_close_tasks
            (id, fiscal_period_id, title, description, department, category, due_date,
             priority, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
        `, [
          id, periodId, task.title,
          `مهمة إقفال دورية للفترة ${period.name}`,
          task.department, task.category, dueDate, task.priority, actor.id, now, now,
        ]);
        created += 1;
      }
      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'GENERATE_DEFAULT_TASKS', null, 'PENDING', null, {
        metadata: { count: created },
      });
    });
    return created;
  }

  public updatePeriodCloseTask(taskId: string, patch: Partial<Omit<TaskInput, 'fiscalPeriodId'>> & {
    status?: PeriodCloseTask['status'];
    assigneeUserId?: string;
    notes?: string;
    dueDate?: string;
  }): void {
    const actor = this.requireManage();
    const task = this.db.query<any>('SELECT * FROM period_close_tasks WHERE id = ?', [taskId])[0];
    if (!task) throw new Error('مهمة الإقفال غير موجودة.');
    if (task.status === 'CANCELLED' || task.status === 'APPROVED') {
      throw new Error('لا يمكن تعديل مهمة ملغاة أو معتمدة.');
    }
    const now = new Date().toISOString();
    const status = patch.status;
    const fields: Record<string, any> = {
      title: patch.title?.trim() ?? task.title,
      description: patch.description?.trim() ?? task.description,
      department: patch.department?.trim() ?? task.department,
      category: patch.category ?? task.category,
      assignee_user_id: patch.assigneeUserId ?? task.assigneeUserId ?? null,
      due_date: patch.dueDate ?? task.dueDate ?? null,
      priority: patch.priority ?? task.priority,
      status: status ?? task.status,
      notes: patch.notes ?? task.notes,
      updated_at: now,
    };
    if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
      fields.completed_at = now;
      fields.completed_by = actor.id;
    }
    if (status === 'REVIEWED') {
      fields.reviewed_at = now;
      fields.reviewed_by = actor.id;
    }
    if (status === 'APPROVED') {
      fields.approved_at = now;
      fields.approved_by = actor.id;
    }
    this.db.executeTransaction((tx) => {
      const assignments = Object.keys(fields).map((key) => `${key} = ?`).join(', ');
      tx.run(`UPDATE period_close_tasks SET ${assignments} WHERE id = ?`, [...Object.values(fields), taskId]);
      this.fiscalAudit(tx, actor, 'TASK', taskId, 'UPDATE_TASK', task.status, fields.status, null, {
        metadata: { patch },
      });
    });
  }

  public deletePeriodCloseTask(taskId: string): void {
    const actor = this.requireManage();
    const task = this.db.query<any>('SELECT * FROM period_close_tasks WHERE id = ?', [taskId])[0];
    if (!task) throw new Error('مهمة الإقفال غير موجودة.');
    if (task.status === 'COMPLETED' || task.status === 'APPROVED') {
      throw new Error('لا يمكن حذف مهمة مكتملة أو معتمدة؛ يمكن إلغاؤها بدلًا من ذلك.');
    }
    this.db.executeTransaction((tx) => {
      tx.run('DELETE FROM period_close_tasks WHERE id = ?', [taskId]);
      this.fiscalAudit(tx, actor, 'TASK', taskId, 'DELETE_TASK', task.status, null);
    });
  }

  // -----------------------------------------------------------------
  // Monthly adjusting entries
  // -----------------------------------------------------------------
  public getPeriodAdjustments(periodId: string): PeriodAdjustment[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, fiscal_period_id AS fiscalPeriodId, adjustment_type AS adjustmentType,
             description, amount, debit_account_code AS debitAccountCode,
             credit_account_code AS creditAccountCode, status,
             journal_entry_id AS journalEntryId, created_by AS createdBy,
             created_at AS createdAt, approved_by AS approvedBy, approved_at AS approvedAt,
             posted_at AS postedAt, rejection_reason AS rejectionReason
      FROM period_adjustments
      WHERE fiscal_period_id = ?
      ORDER BY created_at DESC
    `, [periodId]);
  }

  public createPeriodAdjustment(input: AdjustmentInput): string {
    const actor = this.requireManage();
    this.getPeriodRow(input.fiscalPeriodId);
    if (!input.description?.trim()) throw new Error('وصف التسوية إلزامي.');
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('مبلغ التسوية يجب أن يكون أكبر من صفر.');
    if (input.debitAccountCode === input.creditAccountCode) throw new Error('يجب اختيار حسابين مختلفين للتسوية.');
    for (const code of [input.debitAccountCode, input.creditAccountCode]) {
      const account = this.db.query<any>('SELECT id FROM chart_of_accounts WHERE code = ? AND is_active = 1', [code])[0];
      if (!account) throw new Error(`حساب التسوية ${code} غير موجود أو غير نشط.`);
    }
    const id = `padj_${uuidv4().slice(0, 8)}`;
    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO period_adjustments
          (id, fiscal_period_id, adjustment_type, description, amount,
           debit_account_code, credit_account_code, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
      `, [
        id, input.fiscalPeriodId, input.adjustmentType, input.description.trim(),
        round2(input.amount), input.debitAccountCode, input.creditAccountCode, actor.id,
        new Date().toISOString(),
      ]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', id, 'CREATE_ADJUSTMENT', null, 'DRAFT', null, {
        metadata: { ...input },
      });
    });
    return id;
  }

  public submitPeriodAdjustment(adjustmentId: string): void {
    const actor = this.requireManage();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'DRAFT') throw new Error('لا يمكن إرسال تسوية إلا من حالة المسودة.');
    this.db.executeTransaction((tx) => {
      tx.run(`
        UPDATE period_adjustments
        SET status = 'PENDING_APPROVAL', submitted_by = ?, submitted_at = ?
        WHERE id = ?
      `, [actor.id, new Date().toISOString(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'SUBMIT_ADJUSTMENT', 'DRAFT', 'PENDING_APPROVAL');
    });
  }

  public approvePeriodAdjustment(adjustmentId: string): void {
    const actor = this.requireManage();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'PENDING_APPROVAL') throw new Error('لا يمكن اعتماد تسوية قبل إرسالها للاعتماد.');
    if (adjustment.createdBy === actor.id) {
      throw new Error('يجب أن يعتمد التسوية مستخدم آخر غير مُنشئها (فصل المهام).');
    }
    this.db.executeTransaction((tx) => {
      const now = new Date().toISOString();
      tx.run(`
        UPDATE period_adjustments
        SET status = 'APPROVED', approved_by = ?, approved_at = ?
        WHERE id = ?
      `, [actor.id, now, adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'APPROVE_ADJUSTMENT', 'PENDING_APPROVAL', 'APPROVED');
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, created_at)
        VALUES (?, 'ADJUSTMENT', ?, 'APPROVAL', 'APPROVED', ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, adjustmentId, actor.id, actor.fullName, now]);
    });
  }

  public rejectPeriodAdjustment(adjustmentId: string, reason: string): void {
    const actor = this.requireManage();
    if (!reason.trim()) throw new Error('سبب رفض التسوية إلزامي.');
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status === 'POSTED') throw new Error('لا يمكن رفض تسوية مرحّلة؛ استخدم قيد عكسي.');
    this.db.executeTransaction((tx) => {
      tx.run(`
        UPDATE period_adjustments
        SET status = 'REJECTED', approved_by = ?, approved_at = ?, rejection_reason = ?
        WHERE id = ?
      `, [actor.id, new Date().toISOString(), reason.trim(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'REJECT_ADJUSTMENT', adjustment.status, 'REJECTED', reason);
    });
  }

  public postPeriodAdjustment(adjustmentId: string): string {
    const actor = this.requireCloseControl();
    const adjustment = this.requireAdjustment(adjustmentId);
    if (adjustment.status !== 'APPROVED') throw new Error('لا يمكن ترحيل تسوية قبل اعتمادها.');
    const period = this.getPeriodRow(adjustment.fiscalPeriodId);
    if (period.status === 'CLOSED' || period.status === 'LOCKED') {
      throw new Error('لا يمكن ترحيل تسوية داخل فترة مقفلة؛ أعد فتح الفترة أولًا.');
    }
    let entryId = '';
    this.db.executeTransaction((tx) => {
      entryId = postLedgerEntry(tx.getDatabase(), {
        date: period.endDate,
        description: `تسوية شهرية (${adjustment.adjustmentType}): ${adjustment.description}`,
        referenceType: 'PERIOD_ADJUSTMENT',
        referenceId: adjustmentId,
        createdBy: actor.id,
        lines: [
          { accountCode: adjustment.debitAccountCode, debit: Number(adjustment.amount), credit: 0, description: adjustment.description },
          { accountCode: adjustment.creditAccountCode, debit: 0, credit: Number(adjustment.amount), description: adjustment.description },
        ],
      });
      tx.run(`
        UPDATE period_adjustments
        SET status = 'POSTED', journal_entry_id = ?, posted_by = ?, posted_at = ?
        WHERE id = ?
      `, [entryId, actor.id, new Date().toISOString(), adjustmentId]);
      this.fiscalAudit(tx, actor, 'ADJUSTMENT', adjustmentId, 'POST_ADJUSTMENT', 'APPROVED', 'POSTED', null, {
        journalEntryId: entryId,
      });
    });
    return entryId;
  }

  private requireAdjustment(adjustmentId: string): any {
    const adjustment = this.db.query<any>('SELECT * FROM period_adjustments WHERE id = ?', [adjustmentId])[0];
    if (!adjustment) throw new Error('تسوية الفترة غير موجودة.');
    return adjustment;
  }

  // -----------------------------------------------------------------
  // Year-end readiness and opening balances
  // -----------------------------------------------------------------
  public getFiscalYearReadiness(fiscalYearId: string): FiscalCloseCheck[] {
    this.requireView();
    const fy = this.db.query<any>('SELECT * FROM fiscal_years WHERE id = ?', [fiscalYearId])[0];
    if (!fy) throw new Error('السنة المالية غير موجودة.');
    return this.buildFiscalYearReadiness(fy, (sql, params = []) => this.db.query<any>(sql, params));
  }

  protected buildFiscalYearReadiness(fy: any, query: QueryFn): FiscalCloseCheck[] {
    const params = [fy.startDate, fy.endDate];
    const checks: FiscalCloseCheck[] = [];

    const periodStats = query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open
      FROM fiscal_periods WHERE fiscal_year_id = ?
    `, [fy.id])[0] || { total: 0, open: 0 };
    const openPeriods = Number(periodStats.open || 0);
    checks.push(this.makeCheck(
      'year_periods', 'CONTROLS', 'إقفال جميع الفترات الشهرية',
      !Number(periodStats.total) || openPeriods > 0 ? 'FAIL' : 'PASS',
      !Number(periodStats.total)
        ? [this.issue('PERIODS', 'لا توجد فترات مالية مكتملة لهذه السنة.', '/finance/fiscal-closing')]
        : openPeriods > 0
          ? [this.issue('PERIODS', `يوجد ${openPeriods} فترة مالية مفتوحة لم تُقفل بعد.`, '/finance/fiscal-closing')]
          : [],
      '/finance/fiscal-closing',
    ));

    const unposted = query(`
      SELECT e.entry_number AS reference, e.id AS documentId
      FROM journal_entries e
      WHERE e.date >= ? AND e.date <= ? AND e.is_posted = 0
      ORDER BY e.entry_number LIMIT 25
    `, params).map((row) => this.issue(row.reference, `قيد غير مرحّل: ${row.reference}`, '/finance/journal', row.documentId));
    checks.push(this.makeCheck('year_unposted', 'JOURNALS', 'ترحيل جميع قيود السنة',
      unposted.length ? 'FAIL' : 'PASS', unposted, '/finance/journal'));

    const unbalanced = query(`
      SELECT e.id AS documentId, e.entry_number AS reference
      FROM journal_entries e
      LEFT JOIN journal_entry_lines l ON l.entry_id = e.id
      WHERE e.date >= ? AND e.date <= ? AND e.is_posted = 1
      GROUP BY e.id, e.entry_number, e.total_debit, e.total_credit
      HAVING ABS(e.total_debit - e.total_credit) > 0.009
          OR ABS(COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)) > 0.009
      ORDER BY e.entry_number LIMIT 25
    `, params).map((row) => this.issue(row.reference, `قيد غير متزن: ${row.reference}`, '/finance/journal', row.documentId));
    checks.push(this.makeCheck('year_balanced', 'JOURNALS', 'توازن ميزان المراجعة للقيود المرحلة',
      unbalanced.length ? 'FAIL' : 'PASS', unbalanced, '/finance/journal'));

    const trial = query(`
      SELECT ROUND(COALESCE(SUM(l.debit), 0), 2) AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) AS credit
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
    `, params)[0] || { debit: 0, credit: 0 };
    const difference = round2(Number(trial.debit || 0) - Number(trial.credit || 0));
    checks.push(this.makeCheck('year_trial_balance', 'JOURNALS', 'تطابق طرفي ميزان المراجعة',
      Math.abs(difference) > 0.009 ? 'FAIL' : 'PASS',
      Math.abs(difference) > 0.009
        ? [this.issue('TRIAL', `ميزان المراجعة غير متزن بفرق ${this.money(difference)}.`, '/finance/reports')]
        : [],
      '/finance/reports'));

    const bankIssues = query(`
      SELECT ba.id AS documentId, ba.account_name AS reference
      FROM bank_accounts ba
      WHERE ba.is_active = 1
        AND EXISTS (
          SELECT 1 FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
          WHERE l.account_id = ba.gl_account_id AND e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM bank_reconciliations br
          WHERE br.bank_account_id = ba.id AND br.status = 'APPROVED'
            AND br.statement_date >= ? AND br.statement_date <= ?
        )
    `, [...params, ...params]).map((row) => this.issue(row.reference, `حساب بنكي بدون مطابقة معتمدة: ${row.reference}`, '/finance/bank-reconciliation', row.documentId));
    checks.push(this.makeCheck('year_banks', 'BANKS', 'مطابقة الأرصدة البنكية',
      bankIssues.length ? 'WARNING' : 'PASS', bankIssues, '/finance/bank-reconciliation'));

    const suspense = query(`
      SELECT a.code AS reference, a.name AS name, ROUND(SUM(l.debit - l.credit), 2) AS amount
      FROM chart_of_accounts a
      JOIN journal_entry_lines l ON l.account_id = a.id
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE a.code IN ('1106', '2103') AND e.is_posted = 1 AND e.date <= ?
      GROUP BY a.code, a.name
      HAVING ABS(SUM(l.debit - l.credit)) > 0.009
    `, [fy.endDate]);
    checks.push(this.makeCheck('year_suspense', 'CONTROLS', 'الحسابات المعلقة والوسيطة',
      suspense.length ? 'WARNING' : 'PASS',
      suspense.map((row) => this.issue(row.reference, `رصيد معلق في الحساب ${row.reference} - ${row.name}: ${this.money(Number(row.amount || 0))}`, '/finance/accounts', undefined, Number(row.amount || 0))),
      '/finance/accounts'));

    checks.push(...this.buildPartyBalanceChecks({
      startDate: fy.startDate,
      endDate: fy.endDate,
      fiscalYearId: fy.id,
      companyId: fy.companyId,
    }, query, 'year_'));

    return checks;
  }

  public getFiscalYearOpenings(fiscalYearId: string): FiscalYearOpening[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, fiscal_year_id AS fiscalYearId, source_year_id AS sourceYearId,
             account_code AS accountCode, account_name AS accountName,
             account_type AS accountType, debit, credit, balance
      FROM fiscal_year_openings
      WHERE fiscal_year_id = ?
      ORDER BY account_code
    `, [fiscalYearId]);
  }

  /**
   * Builds opening balances for a fiscal year from the closing balances of the
   * previous year. Assets, liabilities and equity carry forward; revenue and
   * expense balances must already be zero after the prior year closing entry.
   */
  public generateFiscalYearOpenings(fiscalYearId: string, previousYearId?: string): number {
    const actor = this.requireManage();
    const fy = this.db.query<any>('SELECT * FROM fiscal_years WHERE id = ?', [fiscalYearId])[0];
    if (!fy) throw new Error('السنة المالية غير موجودة.');
    const source = previousYearId
      ? this.db.query<any>('SELECT * FROM fiscal_years WHERE id = ?', [previousYearId])[0]
      : this.db.query<any>(`
          SELECT * FROM fiscal_years
          WHERE company_id = ? AND end_date < ?
          ORDER BY end_date DESC LIMIT 1
        `, [fy.companyId || 'cmp_main', fy.startDate])[0];
    if (previousYearId && !source) throw new Error('السنة المالية السابقة غير موجودة.');

    const sourceEnd = source?.endDate || this.db.query<any>(
      'SELECT date(?, ?) AS previousDay',
      [fy.startDate, '-1 day'],
    )[0]?.previousDay || fy.startDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sourceEnd))) throw new Error('تعذر تحديد تاريخ إقفال السنة السابقة.');

    const existing = Number(this.db.query<any>(
      'SELECT COUNT(*) AS count FROM fiscal_year_openings WHERE fiscal_year_id = ?',
      [fiscalYearId],
    )[0]?.count || 0);
    if (existing > 0) throw new Error('الأرصدة الافتتاحية لهذه السنة موجودة بالفعل.');

    const rows = this.db.query<any>(`
      SELECT a.code AS accountCode, a.name AS accountName, a.type AS accountType,
             ROUND(COALESCE(SUM(l.debit), 0), 2) AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.code, a.name, a.type
      HAVING ABS(COALESCE(SUM(l.debit - l.credit), 0)) > 0.009
      ORDER BY a.code
    `, [sourceEnd]);

    const debitTotal = round2(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0));
    const creditTotal = round2(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0));
    if (Math.abs(debitTotal - creditTotal) > 1) {
      throw new Error(`الأرصدة الافتتاحية غير متزنة (مدين ${this.money(debitTotal)} / دائن ${this.money(creditTotal)}).`);
    }

    this.db.executeTransaction((tx) => {
      for (const row of rows) {
        tx.run(`
          INSERT INTO fiscal_year_openings
            (id, fiscal_year_id, source_year_id, company_id, account_code, account_name,
             account_type, debit, credit, balance, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `fyo_${uuidv4().slice(0, 8)}`, fiscalYearId, source?.id || null,
          fy.companyId || 'cmp_main', row.accountCode, row.accountName, row.accountType,
          Number(row.debit || 0), Number(row.credit || 0), Number(row.balance || 0),
          actor.id, new Date().toISOString(),
        ]);
      }
      tx.run(`
        UPDATE fiscal_years SET previous_year_id = COALESCE(previous_year_id, ?) WHERE id = ?
      `, [source?.id || null, fiscalYearId]);
      this.fiscalAudit(tx, actor, 'YEAR', fiscalYearId, 'GENERATE_OPENING_BALANCES', null, 'OPEN', null, {
        metadata: { sourceYearId: source?.id || null, accounts: rows.length, debitTotal, creditTotal },
      });
    });
    return rows.length;
  }

  public getFiscalCloseAudit(entityType: 'PERIOD' | 'YEAR' | 'ADJUSTMENT' | 'TASK', entityId: string): any[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT id, entity_type AS entityType, entity_id AS entityId, action,
             previous_state AS previousState, new_state AS newState, reason,
             actor_id AS actorId, actor_name AS actorName, approved_by AS approvedBy,
             journal_entry_id AS journalEntryId, metadata_json AS metadataJson,
             created_at AS createdAt
      FROM fiscal_close_audit
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
    `, [entityType, entityId]).map((row) => ({
      ...row,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
    }));
  }

  // -----------------------------------------------------------------
  // Extended fiscal-year creation
  // -----------------------------------------------------------------
  public getFiscalYearSummary(fiscalYearId: string): {
    year: FiscalYear | null;
    periods: FiscalPeriod[];
    closedPeriods: number;
    openPeriods: number;
    totalTasks: number;
    openTasks: number;
    blockingChecks: number;
    warnings: number;
    readiness: FiscalCloseCheck[];
  } {
    this.requireView();
    const year = this.getFiscalYears().find((item) => item.id === fiscalYearId) || null;
    const periods = this.getFiscalPeriods(fiscalYearId);
    const readiness = year ? this.getFiscalYearReadiness(fiscalYearId) : [];
    const tasks = this.getPeriodCloseTasks();
    const periodIds = new Set(periods.map((period) => period.id));
    const yearTasks = tasks.filter((task) => periodIds.has(task.fiscalPeriodId));
    return {
      year,
      periods,
      closedPeriods: periods.filter((period) => period.status !== 'OPEN').length,
      openPeriods: periods.filter((period) => period.status === 'OPEN').length,
      totalTasks: yearTasks.length,
      openTasks: yearTasks.filter((task) => !['COMPLETED', 'REVIEWED', 'APPROVED', 'CANCELLED'].includes(task.status)).length,
      blockingChecks: readiness.filter((check) => check.status === 'FAIL').length,
      warnings: readiness.filter((check) => check.status === 'WARNING').length,
      readiness,
    };
  }

  // -----------------------------------------------------------------
  // Account validation used by year-end close
  // -----------------------------------------------------------------
  protected validateRetainedEarningsAccount(code: string, query: QueryFn): { code: string; name: string } {
    const account = query(`
      SELECT code, name, type, is_active AS isActive FROM chart_of_accounts WHERE code = ?
    `, [code])[0];
    if (!account) throw new Error(`حساب الأرباح المرحلة ${code} غير موجود في دليل الحسابات.`);
    if (Number(account.isActive) !== 1) throw new Error(`حساب الأرباح المرحلة ${code} غير نشط.`);
    if (account.type !== 'EQUITY') throw new Error(`حساب الأرباح المرحلة ${code} يجب أن يكون من نوع حقوق الملكية.`);
    return { code: account.code, name: account.name };
  }

  /** Persist a year-level snapshot and approval trail after closing. */
  protected finalizeFiscalYearClose(
    tx: any,
    fy: any,
    actor: { id: string; fullName: string },
    closingEntryId: string,
    netProfitOrLoss: number,
  ): void {
    const payload = {
      company: tx.query('SELECT name FROM companies WHERE id = ?', [fy.companyId || 'cmp_main'])[0]?.name || '',
      fiscalYear: { id: fy.id, code: fy.yearCode, name: fy.name, startDate: fy.startDate, endDate: fy.endDate },
      closedAt: new Date().toISOString(),
      netProfitOrLoss,
      closingEntryId,
      trialBalance: tx.query(`
        SELECT a.code AS code, a.name AS name, a.type AS type,
               ROUND(SUM(l.debit - l.credit), 2) AS balance
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        GROUP BY a.code, a.name, a.type
        ORDER BY a.code
      `, [fy.startDate, fy.endDate]),
      approver: actor.fullName,
    };
    tx.run(`
      UPDATE fiscal_years
      SET close_report_json = ?, workflow_state = 'CLOSED', approved_by = ?, approved_at = ?
      WHERE id = ?
    `, [JSON.stringify(payload), actor.id, new Date().toISOString(), fy.id]);
    tx.run(`
      INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, notes, created_at)
      VALUES (?, 'YEAR', ?, 'FINAL', 'APPROVED', ?, ?, ?, ?)
    `, [
      `fap_${uuidv4().slice(0, 8)}`, fy.id, actor.id, actor.fullName,
      'إقفال سنوي معتمد', new Date().toISOString(),
    ]);
    this.fiscalAudit(tx, actor, 'YEAR', fy.id, 'CLOSE_FISCAL_YEAR', 'OPEN', 'CLOSED', null, {
      journalEntryId: closingEntryId,
      metadata: { netProfitOrLoss, report: payload },
    });
  }

  /**
   * After a year is closed, create opening balances for the next chronological
   * year when one already exists. The operation is idempotent and silent when
   * no successor year has been defined yet.
   */
  protected generateSuccessorOpenings(tx: any, fy: any, actorId: string): void {
    const next = tx.query(`
      SELECT * FROM fiscal_years
      WHERE company_id = ? AND start_date = date(?, '+1 day')
      ORDER BY start_date LIMIT 1
    `, [fy.companyId || 'cmp_main', fy.endDate])[0];
    if (!next) return;
    const existing = Number(tx.query(
      'SELECT COUNT(*) AS count FROM fiscal_year_openings WHERE fiscal_year_id = ?',
      [next.id],
    )[0]?.count || 0);
    if (existing > 0) return;
    const rows = tx.query(`
      SELECT a.code AS accountCode, a.name AS accountName, a.type AS accountType,
             ROUND(COALESCE(SUM(l.debit), 0), 2) AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.code, a.name, a.type
      HAVING ABS(COALESCE(SUM(l.debit - l.credit), 0)) > 0.009
      ORDER BY a.code
    `, [fy.endDate]);
    const now = new Date().toISOString();
    for (const row of rows) {
      tx.run(`
        INSERT INTO fiscal_year_openings
          (id, fiscal_year_id, source_year_id, company_id, account_code, account_name,
           account_type, debit, credit, balance, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `fyo_${uuidv4().slice(0, 8)}`, next.id, fy.id, next.companyId || fy.companyId || 'cmp_main',
        row.accountCode, row.accountName, row.accountType,
        Number(row.debit || 0), Number(row.credit || 0), Number(row.balance || 0),
        actorId, now,
      ]);
    }
    tx.run('UPDATE fiscal_years SET previous_year_id = ? WHERE id = ?', [fy.id, next.id]);
  }
}

export type { Database };
