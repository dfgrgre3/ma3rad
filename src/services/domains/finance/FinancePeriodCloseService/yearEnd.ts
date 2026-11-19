import { v4 as uuidv4 } from 'uuid';
import type { FiscalYear, FiscalPeriod } from '../../../../types/finance';
import { round2 } from '../financials';
import { PeriodAdjustmentsBase } from './adjustments';
import type {
  FiscalCloseCheck,
  FiscalYearOpening,
  QueryFn,
} from './types';

export abstract class PeriodYearEndBase extends PeriodAdjustmentsBase {
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
      SELECT ROUND(COALESCE(SUM(l.debit), 0), 2) / 100.0 AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) / 100.0 AS credit
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
      SELECT a.code AS reference, a.name AS name, ROUND(SUM(l.debit - l.credit), 2) / 100.0 AS amount
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
             account_type AS accountType, debit / 100.0 AS debit, credit / 100.0 AS credit, balance / 100.0 AS balance
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
             ROUND(COALESCE(SUM(l.debit), 0), 2) / 100.0 AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) / 100.0 AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) / 100.0 AS balance
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

    this.db.executeFinancialTransaction((tx) => {
      for (const row of rows) {
        tx.run(`
          INSERT INTO fiscal_year_openings
            (id, fiscal_year_id, source_year_id, company_id, account_code, account_name,
             account_type, debit, credit, balance, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ?, ?)
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
               ROUND(SUM(l.debit - l.credit), 2) / 100.0 AS balance
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
             ROUND(COALESCE(SUM(l.debit), 0) / 100.0, 2) AS debit,
             ROUND(COALESCE(SUM(l.credit), 0) / 100.0, 2) AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0) / 100.0, 2) AS balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.code, a.name, a.type
      HAVING ABS(COALESCE(SUM(l.debit - l.credit), 0)) > 0
      ORDER BY a.code
    `, [fy.endDate]);
    const now = new Date().toISOString();
    for (const row of rows) {
      tx.run(`
        INSERT INTO fiscal_year_openings
          (id, fiscal_year_id, source_year_id, company_id, account_code, account_name,
           account_type, debit, credit, balance, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ROUND(? * 100), ROUND(? * 100), ROUND(? * 100), ?, ?)
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
