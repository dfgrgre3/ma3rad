export interface Employee {
  id: string;
  name: string;
  location: string; // e.g. مخزن الهرم, معرض بنها, إلخ
  role: string;
  phone: string;
  email: string;
  baseSalary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED';
  joinedDate: string;
}

export interface FinancialTransaction {
  id: string;
  employeeId: string;
  type: 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT'; // سلفة, مكافأة, خصم, صرف راتب
  amount: number;
  date: string;
  notes: string;
}

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  employeeId: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';
  notes?: string;
}

export interface PayrollPayable {
  employeeId: string | null;
  employeeName: string;
  balance: number;
}

export interface EmployeeFormState {
  name: string;
  location: string;
  role: string;
  phone: string;
  email: string;
  baseSalary: number;
  salaryType: Employee['salaryType'];
  status: Employee['status'];
  joinedDate: string;
}

export interface TransactionFormState {
  type: FinancialTransaction['type'];
  amount: number;
  date: string;
  notes: string;
}

export type EmployeeTab = 'directory' | 'finance' | 'attendance' | 'analytics';

export const DEFAULT_LOCATIONS = [
  'معرض بنها',
  'المخزن الرئيسي',
  'مخزن الهرم',
  'معرض مدينة نصر',
  'فرع أكتوبر',
  'الإدارة العامة / الحسابات'
];

export const STATUS_LABELS: Record<Employee['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'على رأس العمل', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25' },
  ON_LEAVE: { label: 'في إجازة رسمية', color: 'bg-amber-500/10 text-amber-600 border-amber-500/25' },
  SUSPENDED: { label: 'موقوف مؤقتاً', color: 'bg-rose-500/10 text-rose-600 border-rose-500/25' },
};

export const TX_TYPES = {
  ADVANCE: { label: 'سُلفة', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  BONUS: { label: 'مكافأة / حافز', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  DEDUCTION: { label: 'خصم جزائي', color: 'text-rose-600 bg-rose-500/10 border-rose-500/20' },
  SALARY_PAYOUT: { label: 'صرف راتب / دفعة لليد', color: 'text-sky-600 bg-sky-500/10 border-sky-500/20' },
};
