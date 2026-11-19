import { v4 as uuidv4 } from 'uuid';
import type { FiscalPeriod } from '../../../../types/finance';
import { PeriodCloseTasksBase } from './tasks';
import type {
  FiscalCloseCheck,
  PeriodCloseTask,
  PeriodWorkflowState,
} from './types';

export abstract class PeriodCloseWorkflowBase extends PeriodCloseTasksBase {
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
    this.db.executeFinancialTransaction((tx) => {
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
    this.db.executeFinancialTransaction((tx) => {
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
    this.db.executeFinancialTransaction((tx) => {
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
}
