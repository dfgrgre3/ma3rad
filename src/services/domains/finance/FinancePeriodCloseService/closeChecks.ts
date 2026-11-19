import { v4 as uuidv4 } from 'uuid';
import { round2 } from '../financials';
import { PeriodCloseHelpersBase } from './helpers';
import type {
  FiscalCloseCheck,
  FiscalCloseIssue,
  PeriodRow,
  QueryFn,
} from './types';

export abstract class PeriodCloseChecksBase extends PeriodCloseHelpersBase {
  // -----------------------------------------------------------------
  // Automated monthly close review engine
  // -----------------------------------------------------------------
  protected buildPeriodCloseChecks(period: PeriodRow, query: QueryFn): FiscalCloseCheck[] {
    const params = [period.startDate, period.endDate];
    const checks: FiscalCloseCheck[] = [];

    // 1. Sales: posted invoices and returns -------------------------
    const salesMissing = query(`
      SELECT i.id AS documentId, i.invoice_number AS reference, i.total_amount / 100.0 AS amount
      FROM sales_invoices i
      WHERE i.date >= ? AND i.date <= ? AND i.invoice_status = 'COMPLETED'
        AND NOT EXISTS (SELECT 1 FROM journal_entries e
          WHERE e.reference_type = 'SALES_INVOICE' AND e.reference_id = i.id AND e.is_posted = 1)
      ORDER BY i.invoice_number LIMIT 25
    `, params);
    const returnsMissing = query(`
      SELECT r.id AS documentId, r.return_number AS reference, r.total_amount / 100.0 AS amount
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
      SELECT r.id AS documentId, r.return_number AS reference, r.total_amount / 100.0 AS amount
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
      SELECT cs.id AS documentId, cs.shift_number AS reference, cs.cash_difference / 100.0 AS amount
      FROM cash_shifts cs
      WHERE date(cs.closed_at) >= date(?) AND date(cs.closed_at) <= date(?)
        AND ABS(COALESCE(cs.cash_difference, 0)) > 0
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
      SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) / 100.0 AS count
      FROM warehouse_stock ws JOIN products p ON p.id = ws.product_id
    `)[0]?.count || 0);
    const inventoryGl = Number(query(`
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
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
      SELECT COALESCE(SUM(total_cost), 0) / 100.0 AS count FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status = 'COMPLETED'
    `, params)[0]?.count || 0);
    const cogsGl = Number(query(`
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
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
      SELECT x.id AS documentId, COALESCE(x.description, x.category) AS reference, x.amount / 100.0 AS amount
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
      SELECT COALESCE(SUM(tax_amount), 0) / 100.0 AS count FROM sales_invoices
      WHERE date >= ? AND date <= ? AND invoice_status = 'COMPLETED'
    `, params)[0]?.count || 0);
    const inputTax = Number(query(`
      SELECT COALESCE(SUM(tax_amount), 0) / 100.0 AS count FROM purchase_invoices
      WHERE date >= ? AND date <= ?
    `, params)[0]?.count || 0);
    const taxGl = Number(query(`
      SELECT COALESCE(SUM(l.credit - l.debit), 0) / 100.0 AS count
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
      SELECT a.code AS reference, a.name AS name, ROUND(SUM(l.debit - l.credit), 2) / 100.0 AS amount
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

  protected buildPartyBalanceChecks(
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
          SELECT verified_subledger_balance / 100.0 AS verifiedSubledgerBalance,
                 control_balance / 100.0 AS controlBalance,
                 evidence_reference AS evidenceReference,
                 created_at AS createdAt
          FROM finance_subledger_manual_reconciliations
          WHERE period_id = ? AND company_id = ? AND party_type = ?
          ORDER BY created_at DESC LIMIT 1
        `, [manualPeriodId, companyId, definition.partyType])[0];
        const controlBalance = Number(query(`
          SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS balance
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
          SELECT balance / 100.0 AS balance FROM finance_subledger_control_baselines
          WHERE company_id = ? AND account_code = ?
        `, [companyId, definition.accountCode])[0];
        const baselineControl = Number(query(`
          SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS balance
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
                   SELECT SUM(balance) / 100.0 FROM finance_subledger_party_baselines
                   WHERE company_id = ? AND party_type = ?
                 ), 0) + COALESCE((
                   SELECT SUM(amount) / 100.0 FROM finance_subledger_events
                   WHERE company_id = ? AND party_type = ? AND account_code = ?
                     AND effective_date <= ?
                 ), 0) AS balance
        `, [
          companyId, definition.partyType, companyId, definition.partyType,
          definition.accountCode, period.endDate,
        ])[0]?.balance || 0);
        const controlBalance = Number(query(`
          SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS balance
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
                 ROUND(SUM(l.debit - l.credit), 2) / 100.0 AS amount
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
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS balance
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
      VALUES (?, ?, ?, ?, ROUND(?*100), ROUND(?*100), ?, ?, ?, ?, ?)
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
}
