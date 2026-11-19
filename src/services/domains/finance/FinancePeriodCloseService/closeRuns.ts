import { v4 as uuidv4 } from 'uuid';
import { round2 } from '../financials';
import { PeriodCloseChecksBase } from './closeChecks';
import type {
  FiscalCloseCheck,
  PeriodCloseReport,
  PeriodCloseReportPayload,
  PeriodRow,
  QueryFn,
} from './types';

export abstract class PeriodCloseRunsBase extends PeriodCloseChecksBase {
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
             ROUND(COALESCE(SUM(l.debit), 0), 2) / 100.0 AS debit,
             ROUND(COALESCE(SUM(l.credit), 0), 2) / 100.0 AS credit,
             ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) / 100.0 AS balance
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
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'ASSET'
    `, [period.endDate])[0]?.count || 0);
    const liabilityBalance = round2(-Number(query(`
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'LIABILITY'
    `, [period.endDate])[0]?.count || 0));
    const equityBalance = round2(-Number(query(`
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date <= ? AND a.type = 'EQUITY'
    `, [period.endDate])[0]?.count || 0));

    const cashOpening = round2(query(`
      SELECT COALESCE(SUM((l.debit - l.credit) / 100.0), 0) AS count
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date < ? AND a.code IN ('1101', '1102', '1105')
    `, [period.startDate])[0]?.count || 0);
    const cashMovement = query(`
      SELECT COALESCE(SUM(l.debit), 0) / 100.0 AS inflow, COALESCE(SUM(l.credit), 0) / 100.0 AS outflow
      FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ? AND a.code IN ('1101', '1102', '1105')
    `, [period.startDate, period.endDate])[0] || { inflow: 0, outflow: 0 };
    const inflow = round2(Number(cashMovement.inflow || 0));
    const outflow = round2(Number(cashMovement.outflow || 0));

    const inventoryValuation = round2(query(`
      SELECT COALESCE(SUM(ws.quantity_m2 * COALESCE(p.cost_price, 0)), 0) / 100.0 AS count
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
             SUM(remaining_amount) / 100.0 AS amount
      FROM sales_invoices
      WHERE remaining_amount > 1 AND date <= ?
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
               verified_subledger_balance / 100.0 AS verifiedSubledgerBalance,
               control_balance / 100.0 AS controlBalance,
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
             ROUND((COALESCE(b.balance, 0) + COALESCE(SUM(e.amount), 0)) / 100.0, 2) AS balance
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
        Math.round(balance.balance * 100), period.endDate, capturedAt,
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
}
