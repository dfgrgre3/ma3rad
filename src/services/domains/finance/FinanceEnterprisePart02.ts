import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { round2 } from './financials';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import type {
  FiscalYear,
  FiscalPeriod,
  BankAccount,
  BankReconciliation,
  BankReconciliationLine,
  ExtendedChequeStatus,
  ChequeStatusHistory,
  CostCenter,
  Budget,
  BudgetItem,
  CashForecastItem,
  CashForecastDaySummary,
  PaymentGateway,
  PaymentGatewaySettlement,
  MultiDimensionalReportFilters,
} from '../../../types/finance';
import type { Cheque } from './FinanceExtrasService';
import { FinanceEnterprisePart01 } from './FinanceEnterprisePart01';

export abstract class FinanceEnterprisePart02 extends FinanceEnterprisePart01 {
public reopenPeriod(periodId: string, reason: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.reopen');
    if (!reason.trim()) throw new Error('سبب إعادة فتح الفترة إلزامي للرقابة والتدقيق.');
    const period = this.db.query<any>('SELECT * FROM fiscal_periods WHERE id = ?', [periodId])[0];
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    if (period.status === 'LOCKED') throw new Error('الفترة مؤمنة نهائياً لا يمكن إعادة فتحها إلا بقرار إدارة عليا.');

    this.db.executeTransaction((tx) => {
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'OPEN', workflow_state = 'OPEN', closed_at = NULL, closed_by = NULL,
            approved_by = NULL, approved_at = NULL, submitted_by = NULL, submitted_at = NULL,
            closing_notes = closing_notes || ?
        WHERE id = ?
      `, [` [أعيد فتحها بواسطة ${actor.fullName} لسبب: ${reason}]`, periodId]);

      if (period.closeRunId) {
        tx.run(`
          UPDATE period_close_runs SET status = 'REOPENED' WHERE id = ?
        `, [period.closeRunId]);
      }

      this.fiscalAudit(tx, actor, 'PERIOD', periodId, 'REOPEN_FISCAL_PERIOD',
        period.workflowState || period.status, 'OPEN', reason);
      tx.run(`
        INSERT INTO fiscal_close_approvals (id, entity_type, entity_id, stage, decision, actor_id, actor_name, notes, created_at)
        VALUES (?, 'PERIOD', ?, 'REOPEN', 'REOPENED', ?, ?, ?, ?)
      `, [`fap_${uuidv4().slice(0, 8)}`, periodId, actor.id, actor.fullName, reason, new Date().toISOString()]);

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'REOPEN_FISCAL_PERIOD', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, periodId, JSON.stringify({ reason })]);
    });
  }

public closeFiscalYear(fiscalYearId: string, retainedEarningsCode = '3102'): string {
    const actor = this.requireClose();
    let closingEntryId: string | null = null;
    let netProfitOrLoss = 0;
    this.db.executeTransaction((tx) => {
      const fy = tx.query<any>('SELECT * FROM fiscal_years WHERE id = ?', [fiscalYearId])[0];
      if (!fy) throw new Error('السنة المالية غير موجودة.');
      if (fy.status !== 'OPEN') throw new Error('السنة المالية مقفلة بالفعل.');

      const periods = tx.query<{ periodNumber: number; startDate: string; endDate: string; status: string }>(`
        SELECT period_number AS periodNumber, start_date AS startDate, end_date AS endDate, status
        FROM fiscal_periods WHERE fiscal_year_id = ? ORDER BY period_number
      `, [fiscalYearId]);
      const start = new Date(`${fy.startDate}T00:00:00.000Z`);
      const end = new Date(`${fy.endDate}T00:00:00.000Z`);
      const expectedPeriods: Array<{ startDate: string; endDate: string }> = [];
      for (let offset = 0; ; offset++) {
        const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
        if (monthStart > end) break;
        const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
        expectedPeriods.push({
          startDate: monthStart < start ? fy.startDate : monthStart.toISOString().slice(0, 10),
          endDate: monthEnd > end ? fy.endDate : monthEnd.toISOString().slice(0, 10),
        });
      }
      const periodsReady = periods.length === expectedPeriods.length && periods.every((period, index) =>
        period.periodNumber === index + 1
        && period.startDate === expectedPeriods[index].startDate
        && period.endDate === expectedPeriods[index].endDate
        && period.status !== 'OPEN'
      );
      if (!periodsReady) {
        throw new Error('لا يمكن إقفال السنة المالية قبل إنشاء جميع فتراتها وإقفال كل فترة على حدة.');
      }

      const unposted = Number(tx.query<{ count: number }>(`
        SELECT COUNT(*) AS count FROM journal_entries
        WHERE date >= ? AND date <= ? AND is_posted = 0
      `, [fy.startDate, fy.endDate])[0]?.count || 0);
      if (unposted > 0) throw new Error(`يوجد ${unposted} قيد غير مرحل في السنة المالية. يجب ترحيله أو حذفه أولاً.`);

      const readiness = this.buildFiscalYearReadiness(fy, (sql, params = []) => tx.query<any>(sql, params));
      const blocking = readiness.filter((check) => check.status === 'FAIL');
      if (blocking.length) {
        throw new Error(`تعذر إقفال السنة المالية قبل استيفاء الفحوص الحاجبة: ${blocking
          .map((check) => `${check.label}${check.issues.length ? ` (${check.issues.join('، ')})` : ''}`)
          .join('؛ ')}`);
      }
      this.validateRetainedEarningsAccount(retainedEarningsCode, (sql, params = []) => tx.query<any>(sql, params));

      const balances = tx.query<{ code: string; type: string; balance: number }>(`
        SELECT a.code, a.type,
               ROUND(SUM(l.debit - l.credit), 2) as balance
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id
        JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
          AND a.type IN ('REVENUE', 'EXPENSE')
        GROUP BY a.code, a.type
        HAVING ABS(balance) > 0.009
      `, [fy.startDate, fy.endDate]);

      const closingLines: Array<{ accountCode: string; debit: number; credit: number; description: string }> = [];
      let netDebit = 0;
      let netCredit = 0;
      for (const balance of balances) {
        const amount = Number(balance.balance);
        if (amount > 0) {
          closingLines.push({ accountCode: balance.code, debit: 0, credit: amount, description: `إقفال حساب ${balance.code} للسنة المالية ${fy.yearCode}` });
          netCredit += amount;
        } else if (amount < 0) {
          const amountToClose = Math.abs(amount);
          closingLines.push({ accountCode: balance.code, debit: amountToClose, credit: 0, description: `إقفال حساب ${balance.code} للسنة المالية ${fy.yearCode}` });
          netDebit += amountToClose;
        }
      }

      netProfitOrLoss = round2(netDebit - netCredit);
      if (Math.abs(netProfitOrLoss) > 0.009) {
        if (netProfitOrLoss > 0) {
          closingLines.push({ accountCode: retainedEarningsCode, debit: 0, credit: netProfitOrLoss, description: `ترحيل صافي أرباح السنة المالية ${fy.yearCode} إلى الأرباح المرحلة` });
        } else {
          closingLines.push({ accountCode: retainedEarningsCode, debit: Math.abs(netProfitOrLoss), credit: 0, description: `ترحيل صافي خسائر السنة المالية ${fy.yearCode} إلى الأرباح المرحلة` });
        }
      }

      const closingDebit = round2(closingLines.reduce((sum, line) => sum + line.debit, 0));
      const closingCredit = round2(closingLines.reduce((sum, line) => sum + line.credit, 0));
      if (Math.abs(closingDebit - closingCredit) > 0.009) {
        throw new Error(`قيد الإقفال السنوي غير متزن (${closingDebit} مدين، ${closingCredit} دائن).`);
      }

      // Post closing journal entry if there was revenue/expense activity
      if (closingLines.length >= 2) {
        closingEntryId = postLedgerEntry(tx.getDatabase(), {
          date: fy.endDate,
          description: `قيد الإقفال السنوي وترحيل الأرباح والخسائر للسنة المالية ${fy.yearCode}`,
          referenceType: 'YEAR_END_CLOSE',
          referenceId: fiscalYearId,
          createdBy: actor.id,
          lines: closingLines,
        });
      }

      // Mark fiscal year as CLOSED
      tx.run(`
        UPDATE fiscal_years
        SET status = 'CLOSED', workflow_state = 'CLOSED', closed_at = CURRENT_TIMESTAMP,
            closed_by = ?, closing_entry_id = ?
        WHERE id = ?
      `, [actor.id, closingEntryId, fiscalYearId]);

      // Persist the official closing report, approval trail, and carry the
      // opening balances into the next already-defined fiscal year.
      this.finalizeFiscalYearClose(tx, fy, actor, closingEntryId || '', netProfitOrLoss);
      this.generateSuccessorOpenings(tx, fy, actor.id);

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CLOSE_FISCAL_YEAR', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, fiscalYearId, JSON.stringify({ closingEntryId, netProfitOrLoss })]);
    });

    return closingEntryId || '';
  }
}
