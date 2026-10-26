import type { AttendanceRecord, Employee, FinancialTransaction } from './types';

export interface EmployeeFinancials {
  base: number;
  advances: number;
  bonuses: number;
  deductions: number;
  payouts: number;
  netDue: number;
}

export const getEmployeeFinancials = (
  employees: Employee[],
  transactions: FinancialTransaction[],
  empId: string
): EmployeeFinancials => {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return { base: 0, advances: 0, bonuses: 0, deductions: 0, payouts: 0, netDue: 0 };

  const empTxs = transactions.filter(t => t.employeeId === empId);
  const advances = empTxs.filter(t => t.type === 'ADVANCE').reduce((sum, t) => sum + t.amount, 0);
  const bonuses = empTxs.filter(t => t.type === 'BONUS').reduce((sum, t) => sum + t.amount, 0);
  const deductions = empTxs.filter(t => t.type === 'DEDUCTION').reduce((sum, t) => sum + t.amount, 0);
  const payouts = empTxs.filter(t => t.type === 'SALARY_PAYOUT').reduce((sum, t) => sum + t.amount, 0);

  // netDue calculation: baseSalary + bonuses - (deductions + advances + payouts)
  const netDue = emp.baseSalary + bonuses - (deductions + advances + payouts);

  return {
    base: emp.baseSalary,
    advances,
    bonuses,
    deductions,
    payouts,
    netDue
  };
};

export const filterEmployees = (
  employees: Employee[],
  searchQuery: string,
  selectedLocation: string
): Employee[] => {
  return employees.filter(emp => {
    const matchesSearch = emp.name.includes(searchQuery) || emp.role.includes(searchQuery) || emp.phone.includes(searchQuery);
    const matchesLocation = selectedLocation === 'ALL' || emp.location === selectedLocation;
    return matchesSearch && matchesLocation;
  });
};

export const fmtCurrency = (num: number) => {
  return new Intl.NumberFormat('ar-EG').format(num) + ' ج.م';
};

// --- Reports calculations ---
export const calculateTotalWagesBill = (employees: Employee[]) => {
  return employees.reduce((sum, e) => sum + (e.salaryType === 'MONTHLY' ? e.baseSalary : e.baseSalary * 26), 0);
};

export const sumTransactionsByType = (
  transactions: FinancialTransaction[],
  type: FinancialTransaction['type']
) => {
  return transactions.filter(t => t.type === type).reduce((sum, t) => sum + t.amount, 0);
};

export const countAttendanceByStatus = (
  employees: Employee[],
  attendance: AttendanceRecord[],
  attendanceDate: string,
  status: AttendanceRecord['status']
) => {
  return employees.filter(e => attendance.find(a => a.date === attendanceDate && a.employeeId === e.id && a.status === status)).length;
};
