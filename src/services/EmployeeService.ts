import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
export type SalaryType = 'MONTHLY' | 'DAILY';
export type PayrollTxType = 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface Employee {
  id: string;
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

export class EmployeeService {
  private static db = DatabaseManager.getInstance();

  // ─── Employees ────────────────────────────────────────────────────────────────

  static getAll(opts: { search?: string; location?: string; status?: EmployeeStatus } = {}): Employee[] {
    const conditions: string[] = [];
    const params: any[] = [];

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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM employees ${where} ORDER BY COALESCE(name, full_name) ASC`;
    return this.db.query<Employee>(sql, params);
  }

  static getById(id: string): Employee | null {
    const rows = this.db.query<Employee>(`SELECT * FROM employees WHERE id = ?`, [id]);
    return rows[0] ?? null;
  }

  static create(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'notes'> & { notes?: string }): Employee {
    if (!data.name?.trim()) throw new Error('اسم الموظف مطلوب.');
    if (!data.phone?.trim()) throw new Error('رقم الهاتف مطلوب.');
    const id = `emp_${uuidv4().substring(0, 8)}`;
    return this.db.executeTransaction((db) => {
      const code = db.nextNumber('EMP');
      db.run(
        `INSERT INTO employees (
           id, code, full_name, name, phone, email, job_title, role, location,
           employment_type, hired_at, joined_date, base_salary, salary_type, status, is_active, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'FULL_TIME', ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, data.name, data.name, data.phone, data.email || null, data.role, data.role,
         data.location || '', data.joinedDate, data.joinedDate, data.baseSalary,
         data.salaryType, data.status, data.status === 'ACTIVE' ? 1 : 0, data.notes || null]
      );
      return this.getById(id)!;
    });
  }

  static update(id: string, data: Partial<Omit<Employee, 'id' | 'createdAt'>>): Employee {
    const existing = this.getById(id);
    if (!existing) throw new Error('الموظف غير موجود.');
    const nextStatus = data.status ?? existing.status;
    this.db.run(
      `UPDATE employees SET
         name = COALESCE(?, name),
         full_name = COALESCE(?, full_name),
         location = COALESCE(?, location),
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
      [data.name ?? null, data.name ?? null, data.location ?? null, data.role ?? null, data.role ?? null,
       data.phone ?? null, data.email ?? null, data.baseSalary ?? null, data.salaryType ?? null,
       nextStatus, nextStatus === 'ACTIVE' ? 1 : 0, data.joinedDate ?? null, data.joinedDate ?? null,
       data.notes ?? null, id]
    );
    return this.getById(id)!;
  }

  static delete(id: string): void {
    // Cascade deletes payroll_transactions & attendance via FK
    this.db.run(`DELETE FROM employees WHERE id = ?`, [id]);
  }

  // ─── Payroll Transactions ─────────────────────────────────────────────────────

  static getTransactions(employeeId?: string): PayrollTransaction[] {
    if (employeeId) {
      return this.db.query<PayrollTransaction>(
        `SELECT pt.*, e.name AS employee_name
         FROM payroll_transactions pt
         LEFT JOIN employees e ON e.id = pt.employee_id
         WHERE pt.employee_id = ?
         ORDER BY pt.date DESC, pt.created_at DESC`,
        [employeeId]
      );
    }
    return this.db.query<PayrollTransaction>(
      `SELECT pt.*, e.name AS employee_name
       FROM payroll_transactions pt
       LEFT JOIN employees e ON e.id = pt.employee_id
       ORDER BY pt.date DESC, pt.created_at DESC`
    );
  }

  static addTransaction(data: {
    employeeId: string;
    type: PayrollTxType;
    amount: number;
    date: string;
    notes: string;
    createdBy?: string;
  }): PayrollTransaction {
    if (!this.getById(data.employeeId)) throw new Error('الموظف غير موجود.');
    const id = `ptx_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO payroll_transactions (id, employee_id, type, amount, date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.employeeId, data.type, data.amount, data.date, data.notes, data.createdBy ?? 'usr_admin']
    );
    return this.getTransactions(data.employeeId).find(t => t.id === id)!;
  }

  static deleteTransaction(id: string): void {
    this.db.run(`DELETE FROM payroll_transactions WHERE id = ?`, [id]);
  }

  static getEmployeeFinancials(employeeId: string): EmployeeFinancials {
    const emp = this.getById(employeeId);
    if (!emp) return { baseSalary: 0, advances: 0, bonuses: 0, deductions: 0, payouts: 0, netDue: 0 };

    const rows = this.db.query<{ type: PayrollTxType; total: number }>(
      `SELECT type, SUM(amount) AS total FROM payroll_transactions WHERE employee_id = ? GROUP BY type`,
      [employeeId]
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
    return this.db.query<Attendance>(`SELECT * FROM attendance ORDER BY date DESC`);
  }

  static getAttendanceByDate(date: string): Attendance[] {
    return this.db.query<Attendance>(
      `SELECT * FROM attendance WHERE date = ? ORDER BY created_at`,
      [date]
    );
  }

  static upsertAttendance(data: {
    employeeId: string;
    date: string;
    status: AttendanceStatus;
    notes?: string;
    recordedBy?: string;
  }): void {
    const id = `att_${uuidv4().substring(0, 8)}`;
    this.db.run(
      `INSERT INTO attendance (id, employee_id, date, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET
         status = excluded.status,
         notes = excluded.notes,
         recorded_by = excluded.recorded_by`,
      [id, data.employeeId, data.date, data.status, data.notes ?? null, data.recordedBy ?? 'usr_admin']
    );
  }

  // ─── Analytics helpers ────────────────────────────────────────────────────────

  static getLocationCounts(): { location: string; count: number }[] {
    return this.db.query<{ location: string; count: number }>(
      `SELECT location, COUNT(*) AS count FROM employees GROUP BY location ORDER BY count DESC`
    );
  }

  static getTotalWagesBill(): number {
    const rows = this.db.query<{ salaryType: string; baseSalary: number }>(
      `SELECT salary_type, base_salary FROM employees WHERE status = 'ACTIVE'`
    );
    return rows.reduce((sum, e) => {
      return sum + (e.salaryType === 'DAILY' ? e.baseSalary * 26 : e.baseSalary);
    }, 0);
  }
}
