import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { postLedgerEntry } from '../database/ledger';
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
} from '../types/finance';
import type { Cheque } from './FinanceExtrasService';
import { FinanceEnterprisePart01 } from './FinanceEnterprisePart01';

export abstract class FinanceEnterprisePart02 extends FinanceEnterprisePart01 {
public reopenPeriod(periodId: string, reason: string): void {
    const actor = this.requireManage();
    if (!reason.trim()) throw new Error('سبب إعادة فتح الفترة إلزامي للرقابة والتدقيق.');
    const period = this.db.query<any>('SELECT * FROM fiscal_periods WHERE id = ?', [periodId])[0];
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    if (period.status === 'LOCKED') throw new Error('الفترة مؤمنة نهائياً لا يمكن إعادة فتحها إلا بقرار إدارة عليا.');

    this.db.executeTransaction((tx) => {
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'OPEN', closed_at = NULL, closed_by = NULL, closing_notes = closing_notes || ?
        WHERE id = ?
      `, [` [أعيد فتحها بواسطة ${actor.fullName} لسبب: ${reason}]`, periodId]);

      // Recalculate latest closed period end date for system setting lock
      const latestClosed = tx.query<any>(`
        SELECT MAX(end_date) as maxDate FROM fiscal_periods WHERE status IN ('CLOSED', 'LOCKED')
      `)[0]?.maxDate || '';
      tx.run("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES ('accounting_closed_until_date', ?, 'Closed accounting date lock')",
        [latestClosed]);

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'REOPEN_FISCAL_PERIOD', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, periodId, JSON.stringify({ reason })]);
    });
  }

public closeFiscalYear(fiscalYearId: string, retainedEarningsCode = '3102'): string {
    const actor = this.requireManage();
    const fy = this.db.query<any>('SELECT * FROM fiscal_years WHERE id = ?', [fiscalYearId])[0];
    if (!fy) throw new Error('السنة المالية غير موجودة.');
    if (fy.status !== 'OPEN') throw new Error('السنة المالية مقفلة بالفعل.');

    // 1. Get net balances of all Revenue and Expense accounts
    const balances = this.db.query<{ code: string; type: string; balance: number }>(`
      SELECT a.code, a.type,
             ROUND(SUM(l.debit - l.credit), 2) as balance
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id
      JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE e.is_posted = 1 AND e.date >= ? AND e.date <= ?
        AND a.type IN ('REVENUE', 'EXPENSE')
      GROUP BY a.code, a.type
      HAVING ABS(balance) > 0.009
    `, [fy.start_date, fy.end_date]);

    // Construct year-end closing entry lines
    // To zero an account:
    // If balance is positive (debit > credit): credit the account by balance
    // If balance is negative (credit > debit): debit the account by -balance
    const closingLines: Array<{ accountCode: string; debit: number; credit: number; description: string }> = [];
    let netDebit = 0;
    let netCredit = 0;

    for (const b of balances) {
      const bal = Number(b.balance);
      if (bal > 0) {
        closingLines.push({ accountCode: b.code, debit: 0, credit: bal, description: `إقفال حساب ${b.code} للسنة المالية ${fy.year_code}` });
        netCredit += bal;
      } else if (bal < 0) {
        const positive = Math.abs(bal);
        closingLines.push({ accountCode: b.code, debit: positive, credit: 0, description: `إقفال حساب ${b.code} للسنة المالية ${fy.year_code}` });
        netDebit += positive;
      }
    }

    const netProfitOrLoss = round2(netDebit - netCredit);
    if (Math.abs(netProfitOrLoss) > 0.009) {
      if (netProfitOrLoss > 0) {
        // Net credit needed on retained earnings (Profit)
        closingLines.push({ accountCode: retainedEarningsCode, debit: 0, credit: netProfitOrLoss, description: `ترحيل صافي أرباح السنة المالية ${fy.year_code} إلى الأرباح المرحلة` });
      } else {
        // Net debit needed on retained earnings (Loss)
        const positive = Math.abs(netProfitOrLoss);
        closingLines.push({ accountCode: retainedEarningsCode, debit: positive, credit: 0, description: `ترحيل صافي خسائر السنة المالية ${fy.year_code} إلى الأرباح المرحلة` });
      }
    }

    let closingEntryId: string | null = null;
    this.db.executeTransaction((tx) => {
      // Close all periods
      tx.run(`UPDATE fiscal_periods SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE fiscal_year_id = ?`,
        [actor.id, fiscalYearId]);

      // Post closing journal entry if there was revenue/expense activity
      if (closingLines.length >= 2) {
        closingEntryId = postLedgerEntry(tx.getDatabase(), {
          date: fy.end_date,
          description: `قيد الإقفال السنوي وترحيل الأرباح والخسائر للسنة المالية ${fy.year_code}`,
          referenceType: 'YEAR_END_CLOSE',
          referenceId: fiscalYearId,
          createdBy: actor.id,
          lines: closingLines,
        });
      }

      // Mark fiscal year as CLOSED
      tx.run(`
        UPDATE fiscal_years
        SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, closed_by = ?, closing_entry_id = ?
        WHERE id = ?
      `, [actor.id, closingEntryId, fiscalYearId]);

      // Update system setting
      tx.run("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES ('accounting_closed_until_date', ?, 'Closed accounting date lock')",
        [fy.end_date]);

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CLOSE_FISCAL_YEAR', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, fiscalYearId, JSON.stringify({ closingEntryId, netProfitOrLoss })]);
    });

    return closingEntryId || '';
  }
}
