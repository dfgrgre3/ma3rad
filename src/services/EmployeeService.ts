import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { postLedgerEntry, reverseLedgerEntry } from '../database/ledger';
import { BranchAccessService } from './BranchAccessService';
import { localDateString } from '../utils/date';

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
export type SalaryType = 'MONTHLY' | 'DAILY';
export type PayrollTxType = 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface Employee {
  id: string;
  branchId?: string;
  name: string;
  location: string;
  role: string;
  phone: string;
  email: string;
  baseSalary: number;
  salaryType: SalaryType;
  status: EmployeeStatus;
  joinedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollTransaction {
  id: string;
  employeeId: string;
  branchId?: string;
  employeeName?: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export interface EmployeeFinancials {
  baseSalary: number;
  advances: number;
  bonuses: number;
  deductions: number;
  payouts: number;
  netDue: number;
}

export interface EmployeePayrollPayable {
  employeeId: string | null;
  employeeName: string;
  balance: number;
}

type PayrollTransactionInput = {
  employeeId: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy?: string;
  registerId?: string;
};

export class EmployeeService {
  private static db = DatabaseManager.getInstance();
  private static branchAccess = new BranchAccessService();

  private static requireView() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.view');
    return actor;
  }

  private static requireManage() {
    const actor = AuthService.requireAuth();
    PermissionService.require(actor, 'employees.manage');
    return actor;
  }

  private static requireEmployeeBranch(employeeId: string, actor = AuthService.requireAuth()): string {
    const branchId = this.db.query<{ branchId: string | null }>(
      'SELECT branch_id AS branchId FROM employees WHERE id = ?',
      [employeeId]
    )[0]?.branchId;
    if (!branchId) throw new Error('الموظف غير موجود أو غير مرتبط بفرع.');
    this.branchAccess.requireBranchAccess(branchId, actor);
    return branchId;
  }

  // ─── Employees ────────────────────────────────────────────────────────────────

  static getAll(opts: { search?: string; location?: string; status?: EmployeeStatus } = {}): Employee[] {
    const actor = this.requireView();
    const salaryColumns = PermissionService.can(actor, 'employees.manage')
      ? 'base_salary AS baseSalary, salary_type AS salaryType'
      : "0 AS baseSalary, 'MONTHLY' AS salaryType";
    const conditions: string[] = [];
    const params: any[] = [];
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);

    if (opts.search && opts.search.trim()) {
      conditions.push(`(name LIKE ? OR role LIKE ? OR phone LIKE ?)`);
      const t = `%${opts.search.trim()}%`;
      params.push(t, t, t);
    }
    if (opts.location && opts.location !== 'ALL') {
      conditions.push(`location = ?`);
      params.push(opts.location);
    }
    if (opts.status) {
      conditions.push(`status = ?`);
      params.push(opts.status);
    }
    conditions.push(scope.clause);
    params.push(...scope.params);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT e.id, e.branch_id AS branchId, e.name, e.location, e.role, e.phone, e.email, ${salaryColumns}, e.status,
                        e.joined_date, e.notes, e.created_at, e.updated_at
                 FROM employees e ${where} ORDER BY COALESCE(e.name, e.full_name) ASC`;
    return this.db.query<Employee>(sql, params);
  }

  static getById(id: string): Employee | null {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const salaryColumns = PermissionService.can(actor, 'employees.manage')
      ? 'base_salary AS baseSalary, salary_type AS salaryType'
      : "0 AS baseSalary, 'MONTHLY' AS salaryType";
    const rows = this.db.query<Employee>(
      `SELECT e.id, e.branch_id AS branchId, e.name, e.location, e.role, e.phone, e.email, ${salaryColumns}, e.status,
              e.joined_date, e.notes, e.created_at, e.updated_at FROM employees e WHERE e.id = ? AND ${scope.clause}`,
      [id, ...scope.params]
    );
    return rows[0] ?? null;
  }

  static create(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string }): Employee {
    const actor = this.requireManage();
    if (!data.name?.trim()) throw new Error('اسم الموظف مطلوب.');
    if (!data.phone?.trim()) throw new Error('رقم الهاتف مطلوب.');
    const branchId = data.branchId || this.branchAccess.getDefaultAccessibleBranchId(actor);
    this.branchAccess.requireBranchAccess(branchId, actor);
    const id = `emp_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('EMP');
      db.run(
        `INSERT INTO employees (
           id, code, full_name, name, phone, email, job_title, role, location, branch_id,
           employment_type, hired_at, joined_date, base_salary, salary_type, status, is_active, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL_TIME', ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, data.name, data.name, data.phone, data.email || null, data.role, data.role,
         data.location || '', branchId, data.joinedDate, data.joinedDate, data.baseSalary,
         data.salaryType, data.status, data.status === 'ACTIVE' ? 1 : 0, data.notes || null]
      );
      return this.getById(id)!;
    });
  }

  static update(id: string, data: Partial<Omit<Employee, 'id' | 'createdAt'>>): Employee {
    const actor = this.requireManage();
    const existing = this.getById(id);
    if (!existing) throw new Error('الموظف غير موجود.');
    if (data.branchId) this.branchAccess.requireBranchAccess(data.branchId, actor);
    const nextStatus = data.status ?? existing.status;
    this.db.run(
      `UPDATE employees SET
         name = COALESCE(?, name),
         full_name = COALESCE(?, full_name),
         location = COALESCE(?, location),
         branch_id = COALESCE(?, branch_id),
         role = COALESCE(?, role),
         job_title = COALESCE(?, job_title),
         phone = COALESCE(?, phone),
         email = COALESCE(?, email),
         base_salary = COALESCE(?, base_salary),
         salary_type = COALESCE(?, salary_type),
         status = ?,
         is_active = ?,
         joined_date = COALESCE(?, joined_date),
         hired_at = COALESCE(?, hired_at),
         notes = COALESCE(?, notes),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [data.name ?? null, data.name ?? null, data.location ?? null, data.branchId ?? null, data.role ?? null, data.role ?? null,
       data.phone ?? null, data.email ?? null, data.baseSalary ?? null, data.salaryType ?? null,
       nextStatus, nextStatus === 'ACTIVE' ? 1 : 0, data.joinedDate ?? null, data.joinedDate ?? null,
       data.notes ?? null, id]
    );
    return this.getById(id)!;
  }

  static delete(id: string): void {
    const actor = this.requireManage();
    this.requireEmployeeBranch(id, actor);
    this.db.run(`DELETE FROM employees WHERE id = ?`, [id]);
  }

  // ─── Payroll Transactions ─────────────────────────────────────────────────────

  static getTransactions(employeeId?: string): PayrollTransaction[] {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    if (employeeId) {
      this.requireEmployeeBranch(employeeId, actor);
      return this.db.query<PayrollTransaction>(
        `SELECT pt.*, e.name AS employee_name
         FROM payroll_transactions pt
         LEFT JOIN employees e ON e.id = pt.employee_id
         WHERE pt.employee_id = ? AND ${scope.clause}
         ORDER BY pt.date DESC, pt.created_at DESC`,
        [employeeId, ...scope.params]
      );
    }
    return this.db.query<PayrollTransaction>(
      `SELECT pt.*, e.name AS employee_name
       FROM payroll_transactions pt
       LEFT JOIN employees e ON e.id = pt.employee_id
       WHERE ${scope.clause}
       ORDER BY pt.date DESC, pt.created_at DESC`,
      scope.params
    );
  }

  private static ensureSalaryAccrual(
    db: DatabaseManager,
    employeeId: string,
    date: string,
    createdBy: string
  ): void {
    const period = date.slice(0, 7);
    const referenceId = `${employeeId}:${period}`;
    const accrued = db.query(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_SALARY_ACCRUAL' AND reference_id=?`, [referenceId])[0];
    if (accrued) return;

    const employee = db.query<{ name: string; baseSalary: number; salaryType: SalaryType }>(
      'SELECT name,base_salary AS baseSalary,salary_type AS salaryType FROM employees WHERE id=?',
      [employeeId]
    )[0];
    const salary = Math.round((Number(employee?.baseSalary || 0) * (employee?.salaryType === 'DAILY' ? 26 : 1)) * 100) / 100;
    if (salary <= 0) return;

    postLedgerEntry(db.getDatabase(), {
      date: `${period}-01`,
      description: `Salary accrual for ${employee?.name || employeeId} (${period})`,
      referenceType: 'PAYROLL_SALARY_ACCRUAL',
      referenceId,
      createdBy,
      lines: [{ accountCode: '5202', debit: salary, credit: 0 }, { accountCode: '2104', debit: 0, credit: salary }],
    });
  }

  private static applyAdvancesToSalary(
    db: DatabaseManager,
    employeeId: string,
    date: string,
    createdBy: string
  ): void {
    const period = date.slice(0, 7);
    const referenceId = `${employeeId}:${period}`;
    const applied = db.query(
      `SELECT id FROM journal_entries WHERE reference_type='PAYROLL_ADVANCE_APPLICATION' AND reference_id=?`,
      [referenceId]
    )[0];
    if (applied) return;

    const advances = Number(db.query<{ amount: number }>(
      `SELECT COALESCE(SUM(amount),0) AS amount FROM payroll_transactions WHERE employee_id=? AND type='ADVANCE' AND substr(date,1,7)=?`,
      [employeeId, period]
    )[0]?.amount || 0);
    if (advances <= 0) return;

    postLedgerEntry(db.getDatabase(), {
      date,
      description: `Apply employee advances to salary (${period})`,
      referenceType: 'PAYROLL_ADVANCE_APPLICATION',
      referenceId,
      createdBy,
      lines: [{ accountCode: '2104', debit: advances, credit: 0 }, { accountCode: '1202', debit: 0, credit: advances }],
    });
  }

  private static getPayrollPayable(db: DatabaseManager, employeeId: string, date: string): number {
    const period = date.slice(0, 7);
    return Number(db.query<{ amount: number }>(`
      SELECT COALESCE(SUM(l.credit-l.debit),0) AS amount
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id=l.entry_id AND e.is_posted=1
      JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE a.code='2104' AND (
        (e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION') AND e.reference_id=?)
        OR (e.reference_type='PAYROLL_TRANSACTION' AND e.reference_id IN (
          SELECT id FROM payroll_transactions
          WHERE employee_id=? AND substr(date,1,7)=? AND type IN ('BONUS','DEDUCTION','SALARY_PAYOUT')
        ))
      )
    `, [`${employeeId}:${period}`, employeeId, period])[0]?.amount || 0);
  }

  private static getPayrollPostingLines(type: PayrollTxType, amount: number, payable: number) {
    switch (type) {
      case 'ADVANCE':
        return [{ accountCode: '1202', debit: amount, credit: 0 }, { accountCode: '1101', debit: 0, credit: amount }];
      case 'BONUS':
        return [{ accountCode: '5202', debit: amount, credit: 0 }, { accountCode: '2104', debit: 0, credit: amount }];
      case 'DEDUCTION':
        return [{ accountCode: '2104', debit: amount, credit: 0 }, { accountCode: '5202', debit: 0, credit: amount }];
      case 'SALARY_PAYOUT':
        return [
          { accountCode: '2104', debit: Math.min(amount, Math.max(0, payable)), credit: 0 },
          { accountCode: '1101', debit: 0, credit: amount },
        ];
    }
  }

  private static persistPayrollTransaction(
    db: DatabaseManager,
    data: PayrollTransactionInput,
    amount: number,
    id: string,
    registerId: string | null,
    branchId: string,
    actor: ReturnType<typeof AuthService.requireAuth>
  ): void {
    if (registerId) this.branchAccess.requireRegisterAccess(registerId, actor, branchId);
    if ((data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT') && !registerId) {
      throw new Error('يجب تحديد خزينة فرع الموظف لهذه الحركة النقدية.');
    }
    db.run(
      `INSERT INTO payroll_transactions (id,employee_id,type,amount,date,notes,created_by,register_id,branch_id) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, data.employeeId, data.type, amount, data.date, data.notes, actor.id, registerId, branchId]
    );

    if (data.type === 'DEDUCTION' || data.type === 'SALARY_PAYOUT') {
      this.ensureSalaryAccrual(db, data.employeeId, data.date, actor.id);
    }
    if (data.type === 'SALARY_PAYOUT') {
      this.applyAdvancesToSalary(db, data.employeeId, data.date, actor.id);
    }

    const payable = data.type === 'SALARY_PAYOUT'
      ? this.getPayrollPayable(db, data.employeeId, data.date)
      : 0;
    if (data.type === 'SALARY_PAYOUT' && amount > payable + 0.009) {
      throw new Error(`Salary payout exceeds accrued payroll payable (${payable}).`);
    }
    const lines = this.getPayrollPostingLines(data.type, amount, payable);
    postLedgerEntry(db.getDatabase(), {
      date: data.date,
      description: `Payroll ${data.type} for ${this.getById(data.employeeId)?.name || data.employeeId}`,
      referenceType: 'PAYROLL_TRANSACTION',
      referenceId: id,
      createdBy: actor.id,
      lines,
    });

    if (data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT') {
      db.run('UPDATE cash_registers SET current_balance=current_balance-? WHERE id=?', [amount, registerId]);
    }
    db.run(
      `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values) VALUES (?,?,?,?,?,?,?)`,
      [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, `Payroll ${data.type}`, 'HR', id,
        JSON.stringify({ employeeId: data.employeeId, amount, date: data.date })]
    );
  }

  static addTransaction(data: PayrollTransactionInput): PayrollTransaction {
    const actor = this.requireManage();
    const branchId = this.requireEmployeeBranch(data.employeeId, actor);
    const id = `ptx_${uuidv4().substring(0, 8)}`;
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payroll amount must be greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(`${data.date}T00:00:00`))) throw new Error('Payroll date is invalid.');
    const hasCashMovement = data.type === 'ADVANCE' || data.type === 'SALARY_PAYOUT';
    const registerId = data.registerId
      ? data.registerId
      : hasCashMovement
        ? this.branchAccess.getDefaultRegisterId(branchId, actor)
        : null;
    this.db.executeTransaction((db) => {
      this.persistPayrollTransaction(db, data, amount, id, registerId, branchId, actor);
    });
    return this.getTransactions(data.employeeId).find(t => t.id === id)!;
  }

  static accrueMonthlyPayroll(period: string): { created: number; skipped: number } {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Payroll period must be YYYY-MM.');
    if (period > localDateString().slice(0, 7)) throw new Error('Future payroll periods cannot be accrued.');
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    const periodEnd = localDateString(new Date(year, month, 0));
    const employees = this.db.query<{ id: string; name: string; baseSalary: number; salaryType: SalaryType }>(
      `SELECT id, name, base_salary AS baseSalary, salary_type AS salaryType
       FROM employees e WHERE joined_date <= ? AND status != 'SUSPENDED' AND ${scope.clause} ORDER BY id`,
      [periodEnd, ...scope.params]
    );
    let created = 0;
    let skipped = 0;
    this.db.executeTransaction((db) => {
      for (const employee of employees) {
        const referenceId = `${employee.id}:${period}`;
        if (db.query(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_SALARY_ACCRUAL' AND reference_id=?`, [referenceId]).length) {
          skipped++;
          continue;
        }
        const salary = Math.round(Number(employee.baseSalary || 0) * (employee.salaryType === 'DAILY' ? 26 : 1) * 100) / 100;
        if (salary <= 0) continue;
        postLedgerEntry(db.getDatabase(), {
          date: `${period}-01`,
          description: `Salary accrual for ${employee.name} (${period})`,
          referenceType: 'PAYROLL_SALARY_ACCRUAL',
          referenceId,
          createdBy: actor.id,
          lines: [
            { accountCode: '5202', debit: salary, credit: 0 },
            { accountCode: '2104', debit: 0, credit: salary },
          ],
        });
        created++;
      }
      db.run(
        `INSERT INTO audit_logs (id,user_id,user_name,action,module,record_id,new_values)
         VALUES (?,?,?,?,?,?,?)`,
        [`aud_${uuidv4().substring(0, 8)}`, actor.id, actor.fullName, 'Accrue monthly payroll', 'HR', period,
          JSON.stringify({ created, skipped })]
      );
    });
    return { created, skipped };
  }

  static getPayrollPayables(): EmployeePayrollPayable[] {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<EmployeePayrollPayable>(`
      WITH payroll_lines AS (
        SELECT
          CASE
            WHEN e.reference_type IN ('PAYROLL_SALARY_ACCRUAL','PAYROLL_ADVANCE_APPLICATION')
              THEN substr(e.reference_id, 1, instr(e.reference_id, ':') - 1)
            WHEN e.reference_type = 'PAYROLL_TRANSACTION' THEN tx.employee_id
            WHEN e.reference_type = 'PAYROLL_REVERSAL' THEN reversed_tx.employee_id
            ELSE NULL
          END AS employee_id,
          l.credit - l.debit AS balance
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id AND e.is_posted = 1
        JOIN chart_of_accounts a ON a.id = l.account_id AND a.code = '2104'
        LEFT JOIN payroll_transactions tx
          ON e.reference_type = 'PAYROLL_TRANSACTION' AND tx.id = e.reference_id
        LEFT JOIN payroll_transactions reversed_tx
          ON e.reference_type = 'PAYROLL_REVERSAL'
          AND substr(e.reference_id, 1, length(reversed_tx.id) + 1) = reversed_tx.id || ':'
        WHERE ${scope.clause}
      )
      SELECT p.employee_id AS employeeId,
             COALESCE(emp.name, 'قيود رواتب غير موزعة') AS employeeName,
             ROUND(SUM(p.balance), 2) AS balance
      FROM payroll_lines p
      LEFT JOIN employees emp ON emp.id = p.employee_id
      GROUP BY p.employee_id, emp.name
      HAVING ABS(SUM(p.balance)) > 0.009
      ORDER BY employeeName
    `, scope.params);
  }

  static deleteTransaction(id: string): void {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id', actor);
    const row = this.db.query<any>(`
      SELECT pt.* FROM payroll_transactions pt
      LEFT JOIN employees e ON e.id = pt.employee_id
      WHERE pt.id = ? AND ${scope.clause}
    `, [id, ...scope.params])[0];
    if (!row) throw new Error('عملية الرواتب غير موجودة ضمن نطاق فروعك.');
    this.db.executeTransaction((db) => {
      const entry = db.query<any>(`SELECT id FROM journal_entries WHERE reference_type='PAYROLL_TRANSACTION' AND reference_id=?`, [id])[0];
      if (entry) reverseLedgerEntry(db.getDatabase(), entry.id, {
        date: localDateString(), description: `Reverse payroll transaction ${id}`,
        referenceType: 'PAYROLL_REVERSAL', referenceId: `${id}:${uuidv4()}`, createdBy: actor.id,
      });
      if (row.type === 'ADVANCE' || row.type === 'SALARY_PAYOUT') {
        db.run('UPDATE cash_registers SET current_balance=current_balance+? WHERE id=?', [row.amount, row.register_id || 'cr_main']);
      }
      db.run('DELETE FROM payroll_transactions WHERE id=?', [id]);
    });
  }

  static getEmployeeFinancials(employeeId: string): EmployeeFinancials {
    this.requireManage();
    const emp = this.getById(employeeId);
    if (!emp) throw new Error('الموظف غير موجود ضمن نطاق فروعك.');

    const scope = this.branchAccess.sqlScope('pt.branch_id', 'e.branch_id');
    const rows = this.db.query<{ type: PayrollTxType; total: number }>(
      `SELECT pt.type, SUM(pt.amount) AS total
       FROM payroll_transactions pt JOIN employees e ON e.id = pt.employee_id
       WHERE pt.employee_id = ? AND ${scope.clause} GROUP BY pt.type`,
      [employeeId, ...scope.params]
    );

    const map: Record<string, number> = {};
    for (const r of rows) map[r.type] = r.total ?? 0;

    const advances = map['ADVANCE'] ?? 0;
    const bonuses = map['BONUS'] ?? 0;
    const deductions = map['DEDUCTION'] ?? 0;
    const payouts = map['SALARY_PAYOUT'] ?? 0;
    const monthlySalary = emp.salaryType === 'DAILY' ? emp.baseSalary * 26 : emp.baseSalary;
    const netDue = monthlySalary + bonuses - advances - deductions - payouts;

    return { baseSalary: monthlySalary, advances, bonuses, deductions, payouts, netDue };
  }

  // ─── Attendance ────────────────────────────────────────────────────────────────

  static getAllAttendance(): Attendance[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<Attendance>(`
      SELECT a.* FROM attendance a JOIN employees e ON e.id = a.employee_id
      WHERE ${scope.clause} ORDER BY a.date DESC
    `, scope.params);
  }

  static getAttendanceByDate(date: string): Attendance[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<Attendance>(
      `SELECT a.* FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.date = ? AND ${scope.clause} ORDER BY a.created_at`,
      [date, ...scope.params]
    );
  }

  static upsertAttendance(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    notes?: string;
    recordedBy?: string;
  }): void {
    const actor = this.requireManage();
    this.requireEmployeeBranch(data.employeeId, actor);
    const id = `att_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO attendance (id, employee_id, date, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET
         status = excluded.status,
         notes = excluded.notes,
         recorded_by = excluded.recorded_by`,
      [id, data.employeeId, data.date, data.status, data.notes ?? null, actor.id]
    );
  }

  // ─── Analytics helpers ────────────────────────────────────────────────────────

  static getLocationCounts(): { location: string; count: number }[] {
    const actor = this.requireView();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    return this.db.query<{ location: string; count: number }>(
      `SELECT e.location, COUNT(*) AS count FROM employees e
       WHERE ${scope.clause} GROUP BY e.location ORDER BY count DESC`,
      scope.params
    );
  }

  static getTotalWagesBill(): number {
    const actor = this.requireManage();
    const scope = this.branchAccess.sqlScope('e.branch_id', undefined, actor);
    const rows = this.db.query<{ salaryType: string; baseSalary: number }>(
      `SELECT e.salary_type AS salaryType, e.base_salary AS baseSalary FROM employees e
       WHERE e.status = 'ACTIVE' AND ${scope.clause}`,
      scope.params
    );
    return rows.reduce((sum, e) => {
      return sum + (e.salaryType === 'DAILY' ? e.baseSalary * 26 : e.baseSalary);
    }, 0);
  }
}
