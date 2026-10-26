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

// ─── ELECTRONIC INVOICING ─────────────────────────────────────────────────────
