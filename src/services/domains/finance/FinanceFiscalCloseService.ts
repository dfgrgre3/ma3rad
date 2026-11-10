import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { round2 } from './financials';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry } from '../../../database/repositories/ledger';
import { v4 as uuidv4 } from 'uuid';
import { FinanceEnterpriseContract01 } from './FinanceEnterpriseContract01';
import type { FiscalYear, FiscalPeriod } from '../../../types/finance';

export abstract class FinanceFiscalCloseService extends FinanceEnterpriseContract01 {
  protected requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['ui.finance.overview.view', 'ui.finance.fiscal_closing.close']);
    return actor;
  }

  protected requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.receivables.approve');
    return actor;
  }

  protected requireClose() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'ui.finance.fiscal_closing.close');
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
      yearCode: r.yearCode,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
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

    return this.db.query<any>(sql, params).map(r => ({
      id: r.id,
      fiscalYearId: r.fiscalYearId,
      periodNumber: r.periodNumber,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
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

  public createFiscalYear(input: { yearCode: string; name: string; startDate: string; endDate: string }): string {
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

    const id = `fy_${input.yearCode}`;
    this.db.executeTransaction((tx) => {
      tx.run(`
        INSERT INTO fiscal_years (id, year_code, name, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, 'OPEN')
      `, [id, input.yearCode.trim(), input.name.trim(), input.startDate, input.endDate]);

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
        tx.run(`
          INSERT INTO fiscal_periods (id, fiscal_year_id, period_number, name, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
        `, [
          `fp_${input.yearCode}_${periodCode}`,
          id,
          periodNumber,
          `فترة ${periodCode} / ${input.yearCode}`,
          periodStart.toISOString().slice(0, 10),
          periodEnd.toISOString().slice(0, 10),
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
    const actor = this.requireClose();
    const period = this.db.query<any>('SELECT * FROM fiscal_periods WHERE id = ?', [periodId])[0];
    if (!period) throw new Error('الفترة المالية غير موجودة.');
    if (period.status === 'CLOSED' || period.status === 'LOCKED') throw new Error('الفترة مقفلة بالفعل.');

    const unposted = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM journal_entries
      WHERE date >= ? AND date <= ? AND is_posted = 0
    `, [period.startDate, period.endDate])[0]?.count || 0;
    if (unposted > 0) throw new Error(`يوجد ${unposted} قيد غير مرحل في هذه الفترة. يجب ترحيل أو حذف جميع القيود أولاً.`);

    this.db.executeTransaction((tx) => {
      const now = new Date().toISOString();
      tx.run(`
        UPDATE fiscal_periods
        SET status = 'CLOSED', closed_at = ?, closed_by = ?, closing_notes = ?
        WHERE id = ?
      `, [now, actor.id, notes || null, periodId]);

      const currentClosed = tx.query<any>("SELECT value FROM system_settings WHERE key = 'accounting_closed_until_date'")[0]?.value;
      if (!currentClosed || period.endDate > currentClosed) {
        tx.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('accounting_closed_until_date', ?)",
          [period.endDate]);
      }

      tx.run(`
        INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
        VALUES (?, ?, ?, 'CLOSE_FISCAL_PERIOD', 'FINANCE', ?, ?)
      `, [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, periodId, JSON.stringify({ notes, endDate: period.endDate })]);
    });
  }
}