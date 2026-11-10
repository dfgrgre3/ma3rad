import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/AuthService';
import { PermissionService } from '../auth/PermissionService';
import { round2 } from '../finance/financials';
import { localDateString } from '../../../utils/shared/date';
import { postLedgerEntry, reverseLedgerEntry } from '../../../database/repositories/ledger';
import { BranchAccessService } from '../auth/BranchAccessService';
import { EmployeeDepartmentAccessService } from '../auth/EmployeeDepartmentAccessService';

export * from '../../../types/hr/commission';
import type { CommissionRow, CommissionStats } from '../../../types/hr/commission';

export class CommissionService {
  private db = DatabaseManager.getInstance();
  private branchAccess = new BranchAccessService();
  private departmentAccess = new EmployeeDepartmentAccessService();

  public getCommissions(filters: { month?: string; status?: string; employeeId?: string } = {}): CommissionRow[] {
    const actor = AuthService.requireAuth();
    PermissionService.requireAny(actor, ['employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
    const scope = this.branchAccess.sqlScope('c.branch_id', 'e.branch_id', actor);
    const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
    let sql = `
      SELECT c.id, c.employee_id AS employeeId, e.full_name AS employeeName,
             c.source_type AS sourceType, c.source_id AS sourceId, c.period_month AS periodMonth,
             c.base_amount AS baseAmount, c.percentage, c.commission_amount AS commissionAmount,
             c.status, c.paid_at AS paidAt, c.notes, c.created_at AS createdAt,
             si.invoice_number AS invoiceNumber
      FROM commissions c
      JOIN employees e ON e.id = c.employee_id
      LEFT JOIN sales_invoices si ON si.id = c.source_id
      WHERE ${scope.clause} AND ${departmentScope.clause}`;
    const params: any[] = [...scope.params, ...departmentScope.params];
    if (filters.month) { sql += ` AND c.period_month = ?`; params.push(filters.month); }
    if (filters.status && filters.status !== 'ALL') { sql += ` AND c.status = ?`; params.push(filters.status); }
    if (filters.employeeId) { sql += ` AND c.employee_id = ?`; params.push(filters.employeeId); }
    sql += ` ORDER BY c.period_month DESC, c.created_at DESC`;
    return this.db.query<CommissionRow>(sql, params);
  }

  public getStats(month?: string): CommissionStats {
    PermissionService.requireAny(AuthService.requireAuth(), ['employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
    const scope = this.branchAccess.sqlScope('c.branch_id', 'e.branch_id');
    const departmentScope = this.departmentAccess.sqlScope('e.department_id');
    const params: any[] = [];
    const conditions = [scope.clause, departmentScope.clause];
    params.push(...scope.params, ...departmentScope.params);
    if (month) { conditions.push('c.period_month = ?'); params.push(month); }
    const rows = this.db.query<any>(
      `SELECT c.status, COUNT(*) AS count, COALESCE(SUM(c.commission_amount), 0) AS total
       FROM commissions c JOIN employees e ON e.id = c.employee_id
       WHERE ${conditions.join(' AND ')} GROUP BY c.status`,
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
    PermissionService.requireAny(AuthService.requireAuth(), ['employees.payroll.view', 'employees.payroll.manage', 'employees.payroll.approve']);
    const scope = this.branchAccess.sqlScope('e.branch_id');
    const departmentScope = this.departmentAccess.sqlScope('e.department_id');
    return this.db.query(
      `SELECT e.id, e.full_name AS name, e.commission_percentage AS percentage, e.monthly_target AS monthlyTarget
       FROM employees e WHERE e.is_active = 1 AND ${scope.clause} AND ${departmentScope.clause} ORDER BY e.full_name`,
      [...scope.params, ...departmentScope.params]
    );
  }

  /** Generates pending commissions for all sales invoices of a month (idempotent). */
  public generateForMonth(month: string): { created: number; skipped: number; amount: number } {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.payroll.manage');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('صيغة الشهر غير صحيحة (YYYY-MM).');
    const payrollScope = this.branchAccess.sqlScope('pr.branch_id', undefined, actor);
    if (this.db.query(
      `SELECT pr.id FROM payroll_runs pr
       WHERE pr.period = ? AND pr.status != 'DRAFT' AND ${payrollScope.clause}
       LIMIT 1`,
      [month, ...payrollScope.params]
    ).length) {
      throw new Error('فترة الرواتب معتمدة؛ لا يمكن إنشاء عمولات جديدة لها.');
    }
    const scope = this.branchAccess.sqlScope('si.branch_id');

    const invoices = this.db.query<any>(`
      SELECT si.id, si.invoice_number AS invoiceNumber, si.total_amount AS totalAmount,
             si.tax_amount AS taxAmount, si.sales_rep_id AS salesRepId,
             c.assigned_rep_id AS assignedRepId, si.branch_id AS branchId
      FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
      WHERE substr(si.date, 1, 7) = ? AND si.invoice_status != 'VOID' AND ${scope.clause}
      ORDER BY si.date ASC
    `, [month, ...scope.params]);

    let created = 0;
    let skipped = 0;
    let amount = 0;
    this.db.executeTransaction((db) => {
      for (const invoice of invoices) {
        const employeeId = invoice.salesRepId || invoice.assignedRepId;
        if (!employeeId) { skipped++; continue; }

        const departmentScope = this.departmentAccess.sqlScope('e.department_id', actor);
        const employee = db.query<any>(
          `SELECT e.commission_percentage AS percentage FROM employees e
           WHERE e.id = ? AND e.is_active = 1 AND ${departmentScope.clause}`,
          [employeeId, ...departmentScope.params]
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
          `INSERT INTO commissions (id, employee_id, source_type, source_id, period_month, branch_id,
             base_amount, percentage, commission_amount, status, notes, created_by)
           VALUES (?, ?, 'SALES_INVOICE', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          [
            `com_${uuidv4().substring(0, 8)}`, employeeId, invoice.id, month, invoice.branchId,
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
    PermissionService.require(actor, status === 'APPROVED' || status === 'PAID'
      ? 'employees.payroll.approve'
      : 'employees.payroll.manage');
    const row = this.db.query<{
      status: CommissionRow['status'];
      amount: number;
      employeeId: string;
      periodMonth: string;
      branchId: string | null;
    }>(`
      SELECT c.status, c.commission_amount AS amount, c.employee_id AS employeeId, c.period_month AS periodMonth,
             COALESCE(c.branch_id, e.branch_id) AS branchId
      FROM commissions c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?
    `, [id])[0];
    if (!row) throw new Error('العمولة غير موجودة.');
    if (!row.branchId) throw new Error('العمولة غير مرتبطة بفرع.');
    const branchId = row.branchId;
    this.branchAccess.requireBranchAccess(branchId, actor);
    this.departmentAccess.requireEmployeeAccess(row.employeeId, actor);
    if (this.db.query(
      `SELECT id FROM payroll_runs WHERE branch_id = ? AND period = ? AND status != 'DRAFT'`,
      [branchId, row.periodMonth]
    ).length) {
      throw new Error('العمولة مرتبطة بدورة رواتب معتمدة؛ لا يمكن تعديلها خارج دورة الرواتب.');
    }
    if (row.status === 'PAID') throw new Error('العمولة مدفوعة بالفعل.');
    if (status === 'APPROVED' && row.status !== 'PENDING') throw new Error('لا يمكن اعتماد عمولة بهذه الحالة.');
    if (status === 'PAID' && row.status !== 'APPROVED') throw new Error('يجب اعتماد العمولة قبل صرفها.');

    const amount = round2(Number(row.amount));
    if (amount <= 0) throw new Error('Commission amount must be greater than zero.');
    const today = localDateString();
    this.db.executeTransaction((db) => {
      const current = db.query<{ status: CommissionRow['status'] }>(
        'SELECT status FROM commissions WHERE id = ?',
        [id]
      )[0];
      if (!current) throw new Error('العمولة غير موجودة.');
      if (current.status === 'PAID') throw new Error('العمولة مدفوعة بالفعل.');
      if (status === 'APPROVED' && current.status !== 'PENDING') {
        throw new Error('لا يمكن اعتماد عمولة بهذه الحالة.');
      }
      if (status === 'PAID' && current.status !== 'APPROVED') {
        throw new Error('يجب اعتماد العمولة قبل صرفها.');
      }
      if (status === 'CANCELLED' && !['PENDING', 'APPROVED'].includes(current.status)) {
        throw new Error('لا يمكن إلغاء عمولة بهذه الحالة.');
      }

      if (status === 'APPROVED') {
        postLedgerEntry(db.getDatabase(), {
          date: today, description: `Accrue commission for employee ${row.employeeId}`,
          referenceType: 'COMMISSION_APPROVAL', referenceId: id, createdBy: actor.id, branchId,
          lines: [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2103', debit: 0, credit: amount }],
        });
      } else if (status === 'PAID') {
        const registerId = this.branchAccess.getDefaultRegisterId(branchId, actor);
        const register = db.query<{ id: string }>(
          'SELECT id FROM cash_registers WHERE id=? AND is_active=1',
          [registerId]
        )[0];
        if (!register) throw new Error('خزينة فرع العمولة غير متاحة.');
        const accrued = db.query<{ id: string }>(
          `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`,
          [id]
        )[0];
        if (!accrued) postLedgerEntry(db.getDatabase(), {
          date: today, description: `Accrue commission before payment ${id}`,
          referenceType: 'COMMISSION_APPROVAL', referenceId: id, createdBy: actor.id, branchId,
          lines: [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2103', debit: 0, credit: amount }],
        });
        const paymentEntry = db.query<{ id: string }>(
          `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_PAYMENT' AND reference_id=?`,
          [id]
        )[0];
        if (!paymentEntry) {
          postLedgerEntry(db.getDatabase(), {
            date: today, description: `Pay commission ${id}`,
            referenceType: 'COMMISSION_PAYMENT', referenceId: id, createdBy: actor.id, branchId,
            lines: [{ accountCode: '2103', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }],
          });
          db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, register.id]);
          const shift = db.query<{ id: string }>(
            `SELECT id FROM cash_shifts WHERE user_id=? AND register_id=? AND status='OPEN'
             ORDER BY opened_at DESC LIMIT 1`,
            [actor.id, register.id]
          )[0];
          if (shift) db.run('UPDATE cash_shifts SET total_expenses=total_expenses+? WHERE id=?', [amount, shift.id]);
        }
      } else if (row.status === 'APPROVED') {
        const payment = db.query<{ id: string }>(
          `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_PAYMENT' AND reference_id=?`,
          [id]
        )[0];
        if (payment) throw new Error('لا يمكن إلغاء عمولة لها حركة صرف مسجلة.');
        const approval = db.query<{ id: string }>(
          `SELECT id FROM journal_entries WHERE reference_type='COMMISSION_APPROVAL' AND reference_id=?`,
          [id]
        )[0];
        if (approval) reverseLedgerEntry(db.getDatabase(), approval.id, {
          date: today, description: `Reverse cancelled commission ${id}`,
          referenceType: 'COMMISSION_CANCELLATION', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
        });
      }

      db.run(
        `UPDATE commissions SET status = ?, paid_at = ? WHERE id = ? AND status = ?`,
        [status, status === 'PAID' ? today : null, id, current.status]
      );
      const updated = db.query<{ status: string }>('SELECT status FROM commissions WHERE id = ?', [id])[0];
      if (updated?.status !== status) throw new Error('تعذر تحديث حالة العمولة؛ تم التراجع عن العملية المالية.');
      db.run(
        `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_id, new_values)
         VALUES (?, ?, ?, ?, 'COMMISSIONS', ?, ?)`,
        [
          `aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName,
          status === 'APPROVED' ? 'اعتماد عمولة' : status === 'PAID' ? 'صرف عمولة' : 'إلغاء عمولة',
          id, JSON.stringify({ previousStatus: current.status, status }),
        ]
      );
    });
  }

  public deleteCommission(id: string): void {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.payroll.manage');
    const row = this.db.query<any>(`
      SELECT c.status, c.employee_id AS employeeId, c.period_month AS periodMonth,
             COALESCE(c.branch_id, e.branch_id) AS branchId
      FROM commissions c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?
    `, [id])[0];
    if (!row) throw new Error('العمولة غير موجودة.');
    if (!row.branchId) throw new Error('العمولة غير مرتبطة بفرع.');
    this.branchAccess.requireBranchAccess(row.branchId, actor);
    this.departmentAccess.requireEmployeeAccess(row.employeeId, actor);
    if (this.db.query(
      `SELECT id FROM payroll_runs WHERE branch_id = ? AND period = ? AND status != 'DRAFT'`,
      [row.branchId, row.periodMonth]
    ).length) {
      throw new Error('العمولة مرتبطة بدورة رواتب معتمدة؛ لا يمكن حذفها.');
    }
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
