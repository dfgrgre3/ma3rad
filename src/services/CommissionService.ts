import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { round2 } from './financials';
import { localDateString } from '../utils/date';
import { postLedgerEntry, reverseLedgerEntry } from '../database/ledger';

export * from './commissionTypes';
import type { CommissionRow, CommissionStats } from './commissionTypes';

export class CommissionService {
  private db = DatabaseManager.getInstance();

  public getCommissions(filters: { month?: string; status?: string; employeeId?: string } = {}): CommissionRow[] {
    PermissionService.require(AuthService.requireAuth(), 'employees.view');
    let sql = `
      SELECT c.id, c.employee_id AS employeeId, e.full_name AS employeeName,
             c.source_type AS sourceType, c.source_id AS sourceId, c.period_month AS periodMonth,
             c.base_amount AS baseAmount, c.percentage, c.commission_amount AS commissionAmount,
             c.status, c.paid_at AS paidAt, c.notes, c.created_at AS createdAt,
             si.invoice_number AS invoiceNumber
      FROM commissions c
      JOIN employees e ON e.id = c.employee_id
      LEFT JOIN sales_invoices si ON si.id = c.source_id
      WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.month) { sql += ` AND c.period_month = ?`; params.push(filters.month); }
    if (filters.status && filters.status !== 'ALL') { sql += ` AND c.status = ?`; params.push(filters.status); }
    if (filters.employeeId) { sql += ` AND c.employee_id = ?`; params.push(filters.employeeId); }
    sql += ` ORDER BY c.period_month DESC, c.created_at DESC`;
    return this.db.query<CommissionRow>(sql, params);
  }

  public getStats(month?: string): CommissionStats {
    PermissionService.require(AuthService.requireAuth(), 'employees.view');
    const params: any[] = [];
    let where = '';
    if (month) { where = 'WHERE period_month = ?'; params.push(month); }
    const rows = this.db.query<any>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(commission_amount), 0) AS total
       FROM commissions ${where} GROUP BY status`,
      params
    );
    const stats: CommissionStats = { pending: 0, approved: 0, paid: 0, totalPending: 0, totalPaid: 0 };
    for (const row of rows) {
      if (row.status === 'PENDING') { stats.pending = Number(row.count); stats.totalPending += Number(row.total); }
      if (row.status === 'APPROVED') { stats.approved = Number(row.count); stats.totalPending += Number(row.total); }
      if (row.status === 'PAID') { stats.paid = Number(row.count); stats.totalPaid += Number(row.total); }
    }
    stats.totalPending = round2(stats.totalPending);
    stats.totalPaid = round2(stats.totalPaid);
    return stats;
  }

  public getSalesReps(): Array<{ id: string; name: string; percentage: number; monthlyTarget: number }> {
    return this.db.query(
      `SELECT id, full_name AS name, commission_percentage AS percentage, monthly_target AS monthlyTarget
       FROM employees WHERE is_active = 1 ORDER BY full_name`
    );
  }

  /** Generates pending commissions for all sales invoices of a month (idempotent). */
  public generateForMonth(month: string): { created: number; skipped: number; amount: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.manage');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');

    const invoices = this.db.query<any>(`
      SELECT si.id, si.invoice_number AS invoiceNumber, si.total_amount AS totalAmount,
             si.tax_amount AS taxAmount, si.sales_rep_id AS salesRepId,
             c.assigned_rep_id AS assignedRepId
      FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
      WHERE substr(si.date, 1, 7) = ? AND si.invoice_status != 'VOID'
      ORDER BY si.date ASC
    `, [month]);

    let created = 0;
    let skipped = 0;
    let amount = 0;
    this.db.executeTransaction((db) => {
      for (const invoice of invoices) {
        const employeeId = invoice.salesRepId || invoice.assignedRepId;
        if (!employeeId) { skipped++; continue; }

        const employee = db.query<any>(
          `SELECT commission_percentage AS percentage FROM employees WHERE id = ? AND is_active = 1`,
          [employeeId]
        )[0];
        const percentage = Number(employee?.percentage) || 0;
        if (percentage <= 0) { skipped++; continue; }

        const existing = db.query<any>(
          `SELECT id FROM commissions WHERE source_type = 'SALES_INVOICE' AND source_id = ?`,
          [invoice.id]
        );
        if (existing.length > 0) { skipped++; continue; }

        const base = round2(Math.max(0, Number(invoice.totalAmount) - Number(invoice.taxAmount || 0)));
        const commission = round2((base * percentage) / 100);
        if (commission <= 0) { skipped++; continue; }

        db.run(
          `INSERT INTO commissions (id, employee_id, source_type, source_id, period_month,
             base_amount, percentage, commission_amount, status, notes, created_by)
           VALUES (?, ?, 'SALES_INVOICE', ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [
            `com_${uuidv4().substring(0, 8)}`, employeeId, invoice.id, month,
            base, percentage, commission, `عمولة فاتورة ${invoice.invoiceNumber}`, actor.id,
          ]
        );
        created++;
        amount = round2(amount + commission);
      }
    });

    return { created, skipped, amount };
  }

  public setStatus(id: string, status: 'APPROVED' | 'PAID' | 'CANCELLED'): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.manage');
    const row = this.db.query<any>(`SELECT status, commission_amount AS amount, employee_id AS employee_id FROM commissions WHERE id = ?`, [id])[0];
    if (!row) throw new Error('العمولة غير موجودة.');
    if (row.status === 'PAID') throw new Error('العمولة مدفوعة بالفعل.');
    if (status === 'APPROVED' && row.status !== 'PENDING') throw new Error('لا يمكن اعتماد عمولة بهذه الحالة.');
    if (status === 'PAID' && row.status !== 'APPROVED') throw new Error('يجب اعتماد العمولة قبل صرفها.');

    const amount = round2(Number(row.amount));
    if (amount <= 0) throw new Error('Commission amount must be greater than zero.');
    const today = localDateString();
    this.db.executeTransaction((db) => {
      if (status === 'APPROVED') {
        postLedgerEntry(db.getDatabase(), {
          date: today, description: `Accrue commission for employee ${row.employeeId}`,
          referenceType: 'COMMISSION_APPROVAL', referenceId: id, createdBy: actor.id,
          lines: [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2103', debit: 0, credit: amount }],
        });
      } else if (status === 'PAID') {
        const register = db.query<any>('SELECT id FROM cash_registers WHERE id=? AND is_active=1', ['cr_main'])[0];
        if (!register) throw new Error('The main cash register is unavailable.');
        const accrued = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`, [id])[0];
        if (!accrued) postLedgerEntry(db.getDatabase(), {
          date: today, description: `Accrue commission before payment ${id}`,
          referenceType: 'COMMISSION_APPROVAL', referenceId: id, createdBy: actor.id,
          lines: [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2103', debit: 0, credit: amount }],
        });
        postLedgerEntry(db.getDatabase(), {
          date: today, description: `Pay commission ${id}`,
          referenceType: 'COMMISSION_PAYMENT', referenceId: id, createdBy: actor.id,
          lines: [{ accountCode: '2103', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }],
        });
        db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, register.id]);
        const shift = db.query<any>(`SELECT id FROM cash_shifts WHERE user_id=? AND register_id=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`, [actor.id, register.id])[0];
        if (shift) db.run('UPDATE cash_shifts SET total_expenses=total_expenses+? WHERE id=?', [amount, shift.id]);
      } else if (row.status === 'APPROVED') {
        const approval = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`, [id])[0];
        if (approval) reverseLedgerEntry(db.getDatabase(), approval.id, {
          date: today, description: `Reverse cancelled commission ${id}`,
          referenceType: 'COMMISSION_CANCELLATION', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
        });
      }
    });
    this.db.run(
      `UPDATE commissions SET status = ?, paid_at = ? WHERE id = ?`,
      [status, status === 'PAID' ? today : null, id]
    );
    this.db.run(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
       VALUES (?, ?, ?, ?, 'COMMISSIONS', ?, ?)`,
      [
        `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
        status === 'APPROVED' ? 'اعتماد عمولة' : status === 'PAID' ? 'صرف عمولة' : 'إلغاء عمولة',
        id, JSON.stringify({ status }),
      ]
    );
  }

  public deleteCommission(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.manage');
    const row = this.db.query<any>(`SELECT status FROM commissions WHERE id = ?`, [id])[0];
    if (!row) throw new Error('العمولة غير موجودة.');
    if (row.status === 'PAID') throw new Error('لا يمكن حذف عمولة مدفوعة.');
    this.db.executeTransaction((db) => {
      const accrual = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`, [id])[0];
      if (accrual) reverseLedgerEntry(db.getDatabase(), accrual.id, {
        date: localDateString(), description: `Reverse deleted commission ${id}`,
        referenceType: 'COMMISSION_CANCELLATION', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
      });
      db.run(`DELETE FROM commissions WHERE id = ?`, [id]);
    });
  }
}
