export interface Employee {
  id: string;
  code: string;
  branchId?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY';
  name: string;
  nationalId?: string | null;
  birthDate?: string | null;
  gender?: 'FEMALE' | 'MALE' | 'OTHER' | null;
  location: string; // e.g. مخزن الهرم, معرض بنها, إلخ
  role: string;
  phone: string;
  phone2?: string | null;
  email: string;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  jobGradeId?: string | null;
  costCenterId?: string | null;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;
  terminatedAt?: string | null;
  notes?: string;
  baseSalary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  salaryPaymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'WALLET';
  bankName?: string | null;
  bankAccountNumber?: string | null;
  walletProvider?: string | null;
  walletNumber?: string | null;
  socialInsuranceNumber?: string | null;
  taxFileNumber?: string | null;
  taxExempt?: boolean;
  taxExemptionAmount?: number;
  taxDependents?: number;
  education?: string | null;
  previousExperience?: string | null;
  status: 'PROBATION' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED';
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
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';
  notes?: string;
}

export interface PayrollPayable {
  employeeId: string | null;
  employeeName: string;
  balance: number;
}

export interface EmployeeFormState {
  branchId: string;
  employmentType: NonNullable<Employee['employmentType']>;
  name: string;
  nationalId: string;
  birthDate: string;
  gender: NonNullable<Employee['gender']>;
  location: string;
  role: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  departmentId: string;
  managerEmployeeId: string;
  probationStartDate: string;
  probationEndDate: string;
  baseSalary: number;
  salaryType: Employee['salaryType'];
  salaryPaymentMethod: NonNullable<Employee['salaryPaymentMethod']>;
  bankName: string;
  bankAccountNumber: string;
  walletProvider: string;
  walletNumber: string;
  socialInsuranceNumber: string;
  taxFileNumber: string;
  taxExempt: boolean;
  taxExemptionAmount: number;
  taxDependents: number;
  education: string;
  previousExperience: string;
  status: Employee['status'];
  joinedDate: string;
  notes: string;
}

export interface TransactionFormState {
  type: FinancialTransaction['type'];
  amount: number;
  date: string;
  notes: string;
}

export type EmployeeTab = 'directory' | 'finance' | 'attendance' | 'analytics';

export const STATUS_LABELS: Record<Employee['status'], { label: string; color: string }> = {
  PROBATION: { label: 'تحت الاختبار', color: 'bg-sky-500/10 text-sky-600 border-sky-500/25' },
  ACTIVE: { label: 'على رأس العمل', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25' },
  ON_LEAVE: { label: 'في إجازة رسمية', color: 'bg-amber-500/10 text-amber-600 border-amber-500/25' },
  SUSPENDED: { label: 'موقوف مؤقتاً', color: 'bg-rose-500/10 text-rose-600 border-rose-500/25' },
  RESIGNED: { label: 'مستقيل', color: 'bg-slate-500/10 text-slate-600 border-slate-500/25' },
  TERMINATED: { label: 'منتهية خدمته', color: 'bg-slate-500/10 text-slate-600 border-slate-500/25' },
};

export const TX_TYPES = {
  ADVANCE: { label: 'سُلفة', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  BONUS: { label: 'مكافأة / حافز', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  DEDUCTION: { label: 'خصم جزائي', color: 'text-rose-600 bg-rose-500/10 border-rose-500/20' },
  SALARY_PAYOUT: { label: 'صرف راتب / دفعة لليد', color: 'text-sky-600 bg-sky-500/10 border-sky-500/20' },
};
