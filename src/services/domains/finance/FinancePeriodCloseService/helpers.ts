import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../auth/AuthService';
import { PermissionService } from '../../auth/PermissionService';
import { round2 } from '../financials';
import { FinanceEnterpriseContract01 } from '../FinanceEnterpriseContract01';
import type {
  CloseCheckStatus,
  FiscalCloseCheck,
  FiscalCloseIssue,
  PeriodRow,
  QueryFn,
} from './types';

export abstract class PeriodCloseHelpersBase extends FinanceEnterpriseContract01 {
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

  protected issue(
    reference: string,
    message: string,
    route?: string,
    documentId?: string,
    amount?: number,
  ): FiscalCloseIssue {
    return { reference, message, route, documentId, amount };
  }

  protected count(query: QueryFn, sql: string, params: any[] = []): number {
    return Number(query(sql, params)[0]?.count || 0);
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(value));
  }

  protected makeCheck(
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
}
