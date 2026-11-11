import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { v4 as uuidv4 } from 'uuid';
import type { FiscalYear, FiscalPeriod } from '../../../types/finance';
import {
  FinancePeriodCloseService,
  type FiscalCloseCheck,
} from './FinancePeriodCloseService';

export type { FiscalCloseCheck, CloseCheckStatus, FiscalCloseIssue } from './FinancePeriodCloseService';

export interface CreateFiscalYearInput {
  yearCode: string;
  name: string;
  startDate: string;
  endDate: string;
  companyId?: string;
  branchScope?: string;
  currency?: string;
  yearType?: string;
  periodCount?: number;
  previousYearId?: string;
  periodType?: string;
  periods?: Array<{ name: string; startDate: string; endDate: string; type?: string }>;
}

export abstract class FinanceFiscalCloseService extends FinancePeriodCloseService {
  protected requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'ui.finance.overview.view',
      'ui.finance.fiscal_closing.close',
      'finance.fiscal_closing.view',
      'finance.close',
      'finance.view',
    ]);
    return actor;
  }

  protected requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'ui.finance.receivables.approve',
      'finance.fiscal_closing.execute',
      'finance.approve',
      'finance.close',
    ]);
    return actor;
  }

  protected requireClose() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, [
      'ui.finance.fiscal_closing.close',
      'finance.fiscal_closing.execute',
      'finance.close',
    ]);
    return actor;
  }

  public getFiscalYears(): FiscalYear[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT fy.*, u.full_name as closedByName, c.name as companyName
      FROM fiscal_years fy
      LEFT JOIN users u ON fy.closed_by = u.id
      LEFT JOIN companies c ON c.id = fy.company_id
      ORDER BY fy.start_date DESC
    `).map((r) => ({
      id: r.id,
      yearCode: r.yearCode,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      workflowState: r.workflowState,
      companyId: r.companyId,
      companyName: r.companyName,
      branchScope: r.branchScope,
      currency: r.currency,
      yearType: r.yearType,
      periodCount: r.periodCount,
      previousYearId: r.previousYearId,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt,
      lockedAt: r.lockedAt,
      closedAt: r.closedAt,
      closedBy: r.closedBy,
      closingEntryId: r.closingEntryId,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }

  public getFiscalPeriods(fiscalYearId?: string): FiscalPeriod[] {
    this.requireView();
    let sql = `
      SELECT fp.*, u.full_name as closedByName
      FROM fiscal_periods fp
      LEFT JOIN users u ON fp.closed_by = u.id
    `;
    const params: any[] = [];
    if (fiscalYearId) {
      sql += ' WHERE fp.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }
    sql += ' ORDER BY fp.start_date ASC';

    return this.db.query<any>(sql, params).map((r) => ({
      id: r.id,
      fiscalYearId: r.fiscalYearId,
      periodNumber: r.periodNumber,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      workflowState: r.workflowState,
      periodType: r.periodType,
      companyId: r.companyId,
      branchId: r.branchId,
      reviewStartedAt: r.reviewStartedAt,
      submittedAt: r.submittedAt,
      approvedAt: r.approvedAt,
      lockedAt: r.lockedAt,
      closeRunId: r.closeRunId,
      closedAt: r.closedAt,
      closedBy: r.closedBy,
      closingNotes: r.closingNotes,
      createdAt: r.createdAt,
    }));
  }

  public getUnpostedJournalEntryCount(startDate: string, endDate: string): number {
    this.requireView();
    return Number(this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM journal_entries
      WHERE date >= ? AND date <= ? AND is_posted = 0
    `, [startDate, endDate])[0]?.count ?? 0);
  }

  public getPeriodCloseChecklist(periodId: string): FiscalCloseCheck[] {
    this.requireView();
    const period = this.getPeriodRow(periodId);
    return this.buildPeriodCloseChecks(period, (sql, params = []) => this.db.query<any>(sql, params));
  }

  public createFiscalYear(input: CreateFiscalYearInput): string {
    const actor = this.requireManage();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${input.endDate}T00:00:00.000Z`);
    if (
      !datePattern.test(input.startDate)
      || !datePattern.test(input.endDate)
      || Number.isNaN(startDate.getTime())
      || Number.isNaN(endDate.getTime())
      || startDate.toISOString().slice(0, 10) !== input.startDate
      || endDate.toISOString().slice(0, 10) !== input.endDate
      || startDate > endDate
    ) {
      throw new Error('يجب إدخال تاريخي بداية ونهاية صحيحين، وأن تكون البداية قبل النهاية.');
    }
    if (!input.yearCode?.trim() || !input.name?.trim()) {
      throw new Error('رمز السنة المالية واسمها إلزاميان.');
    }
    const companyId = input.companyId?.trim() || 'cmp_main';
    const company = this.db.query<any>('SELECT id FROM companies WHERE id = ?', [companyId])[0];
    if (!company) throw new Error('الشركة المحددة للسنة المالية غير موجودة.');

    // Prevent overlapping financial years for the same legal entity.
    const overlap = this.db.query<any>(`
      SELECT id, year_code AS yearCode FROM fiscal_years
      WHERE company_id = ? AND start_date <= ? AND end_date >= ?
      LIMIT 1
    `, [companyId, input.endDate, input.startDate])[0];
    if (overlap) {
      throw new Error(`توجد سنة مالية متداخلة لنفس الشركة: ${overlap.yearCode}. يجب تحديد نطاق زمني مستقل.`);
    }

    const id = `fy_${input.yearCode.trim()}`;
    const manualPeriods = Array.isArray(input.periods) && input.periods.length > 0 ? input.periods : null;
    if (manualPeriods) {
      for (const period of manualPeriods) {
        if (!datePattern.test(period.startDate) || !datePattern.test(period.endDate)
          || period.startDate < input.startDate || period.endDate > input.endDate
          || period.startDate > period.endDate) {
          throw new Error('إحدى الفترات المالية المخصصة خارج نطاق السنة أو بتواريخ غير صحيحة.');
        }
      }
      const sorted = [...manualPeriods].sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].startDate <= sorted[index - 1].endDate) {
          throw new Error('الفترات المالية المخصصة متداخلة؛ يجب أن تكون كل فترة مستقلة.');
        }
      }
    }

    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO fiscal_years
          (id, year_code, name, start_date, end_date, status, company_id, branch_scope,
           currency, year_type, period_count, previous_year_id, workflow_state)
        VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, 'OPEN')
      `, [
        id, input.yearCode.trim(), input.name.trim(), input.startDate, input.endDate,
        companyId,
        input.branchScope?.trim() || 'ALL',
        input.currency?.trim() || 'EGP',
        input.yearType?.trim() || (manualPeriods ? 'CUSTOM' : 'STANDARD'),
        manualPeriods ? manualPeriods.length : Number(input.periodCount) || 12,
        input.previousYearId || null,
      ]);

      const periodRows: Array<{ name: string; startDate: string; endDate: string; type: string }> = [];
      if (manualPeriods) {
        manualPeriods
          .slice()
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .forEach((period) => periodRows.push({
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            type: period.type || 'MONTHLY',
          }));
      } else {
        const startYear = startDate.getUTCFullYear();
        const startMonth = startDate.getUTCMonth();
        let periodNumber = 1;
        for (let monthOffset = 0; ; monthOffset++, periodNumber++) {
          const monthStart = new Date(Date.UTC(startYear, startMonth + monthOffset, 1));
          if (monthStart > endDate) break;
          const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
          const periodStart = monthStart < startDate ? startDate : monthStart;
          const periodEnd = monthEnd > endDate ? endDate : monthEnd;
          const periodCode = String(periodNumber).padStart(2, '0');
          periodRows.push({
            name: `فترة ${periodCode} / ${input.yearCode.trim()}`,
            startDate: periodStart.toISOString().slice(0, 10),
            endDate: periodEnd.toISOString().slice(0, 10),
            type: input.periodType || 'MONTHLY',
          });
        }
      }

      periodRows.forEach((period, index) => {
        const periodNumber = index + 1;
        const periodCode = String(periodNumber).padStart(2, '0');
        tx.run(`
          INSERT INTO fiscal_periods
            (id, fiscal_year_id, period_number, name, start_date, end_date, status,
             company_id, period_type, workflow_state)
          VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, 'OPEN')
        `, [
          `fp_${input.yearCode.trim()}_${periodCode}`,
          id,
          periodNumber,
          period.name,
          period.startDate,
          period.endDate,
          companyId,
          period.type || 'MONTHLY',
        ]);
      });

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CREATE_FISCAL_YEAR', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(input)]);
      this.fiscalAudit(tx, actor, 'YEAR', id, 'CREATE_FISCAL_YEAR', null, 'OPEN', null, {
        metadata: { input, periods: periodRows.length },
      });
    });
    return id;
  }

  public closePeriod(periodId: string, notes?: string): void {
    const actor = this.requireClose();
    this.db.executeTransaction((tx) => {
      const query: (sql: string, params?: any[]) => any[] = (sql, params = []) => tx.query<any>(sql, params);
      const period = this.getPeriodRow(periodId, query);
      if (period.status === 'CLOSED' || period.status === 'LOCKED') throw new Error('الفترة مقفلة بالفعل.');

      const checks = this.buildPeriodCloseChecks(period, query);
      const blocking = checks.filter((check) => check.status === 'FAIL');
      if (blocking.length) {
        const details = blocking
          .map((check) => `${check.label}: ${check.issueCount}${check.issues.length ? ` (${check.issues.join('، ')})` : ''}`)
          .join('؛ ');
        throw new Error(`تعذر إقفال الفترة قبل استيفاء قائمة المراجعة: ${details}`);
      }

      const now = new Date().toISOString();
      const runId = this.createCloseRun(tx, period, actor, checks, 'COMPLETED', notes);
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'CLOSED', workflow_state = 'CLOSED', closed_at = ?, closed_by = ?,
            closing_notes = ?, close_run_id = ?
        WHERE id = ? AND status = 'OPEN'
      `, [now, actor.id, notes || null, runId, periodId]);

      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'CLOSE_FISCAL_PERIOD', period.workflowState || period.status, 'CLOSED', notes);
      const subledgerSnapshot = this.capturePartySubledgerSnapshot(tx, period);
      this.captureCloseSnapshot(
        tx, period, actor, runId,
        subledgerSnapshot.balances,
        subledgerSnapshot.coverageStartDate,
        subledgerSnapshot.manualMatches,
      );

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CLOSE_FISCAL_PERIOD', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, periodId, JSON.stringify({ notes, endDate: period.endDate, runId })]);
    });
  }
}
