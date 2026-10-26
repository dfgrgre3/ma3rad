import { FinanceEnterpriseContract01 } from './FinanceEnterpriseContract01';
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

export abstract class FinanceEnterprisePart01 extends FinanceEnterpriseContract01 {
protected requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.view');
    return actor;
  }

protected requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'finance.approve');
    return actor;
  }

public getFiscalYears(): FiscalYear[] {
    this.requireView();
    return this.db.query<any>(`
      SELECT fy.*, u.full_name as closedByName
      FROM fiscal_years fy
      LEFT JOIN users u ON fy.closed_by = u.id
      ORDER BY fy.start_date DESC
    `).map(r => ({
      id: r.id,
      yearCode: r.year_code,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      closedAt: r.closed_at,
      closedBy: r.closed_by,
      closingEntryId: r.closing_entry_id,
      notes: r.notes,
      createdAt: r.created_at,
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

    return this.db.query<any>(sql, params).map(r => ({
      id: r.id,
      fiscalYearId: r.fiscal_year_id,
      periodNumber: r.period_number,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      closedAt: r.closed_at,
      closedBy: r.closed_by,
      closingNotes: r.closing_notes,
      createdAt: r.created_at,
    }));
  }

public createFiscalYear(input: { yearCode: string; name: string; startDate: string; endDate: string }): string {
    const actor = this.requireManage();
    const id = `fy_${input.yearCode}`;
    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO fiscal_years (id, year_code, name, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, 'OPEN')
      `, [id, input.yearCode.trim(), input.name.trim(), input.startDate, input.endDate]);

      const [startYear] = input.startDate.split('-').map(Number);
      for (let m = 1; m <= 12; m++) {
        const mStr = String(m).padStart(2, '0');
        const lastDay = new Date(startYear, m, 0).getDate();
        tx.run(`
          INSERT INTO fiscal_periods (id, fiscal_year_id, period_number, name, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
        `, [
          `fp_${input.yearCode}_${mStr}`,
          id,
          m,
          `فترة ${mStr} / ${input.yearCode}`,
          `${startYear}-${mStr}-01`,
          `${startYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
        ]);
      }

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CREATE_FISCAL_YEAR', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, id, JSON.stringify(input)]);
    });
    return id;
  }

public closePeriod(periodId: string, notes?: string): void {
    const actor = this.requireManage();
    const period = this.db.query<any>('SELECT * FROM fiscal_periods WHERE id = ?', [periodId])[0];
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    if (period.status === 'CLOSED' || period.status === 'LOCKED') throw new Error('الفترة مقفلة بالفعل.');

    // Check for unbalanced or draft journal entries in this period
    const unposted = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM journal_entries
      WHERE date >= ? AND date <= ? AND is_posted = 0
    `, [period.start_date, period.end_date])[0]?.count || 0;
    if (unposted > 0) throw new Error(`يوجد ${unposted} قيد غير مرحل في هذه الفترة. يجب ترحيل أو حذف جميع القيود أولاً.`);

    this.db.executeTransaction((tx) => {
      const now = new Date().toISOString();
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'CLOSED', closed_at = ?, closed_by = ?, closing_notes = ?
        WHERE id = ?
      `, [now, actor.id, notes || null, periodId]);

      // Update system closed until date if this period end_date is newer
      const currentClosed = tx.query<any>("SELECT value FROM system_settings WHERE key = 'accounting_closed_until_date'")[0]?.value;
      if (!currentClosed || period.end_date > currentClosed) {
        tx.run("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES ('accounting_closed_until_date', ?, 'Closed accounting date lock')",
          [period.end_date]);
      }

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CLOSE_FISCAL_PERIOD', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, periodId, JSON.stringify({ notes, endDate: period.end_date })]);
    });
  }
}
