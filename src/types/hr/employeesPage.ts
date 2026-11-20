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
  isSalesRep?: boolean;
  commissionPercentage?: number;
  monthlyTarget?: number;
  additionalBranchIds?: string[];
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
  isSalesRep: boolean;
  commissionPercentage: number;
  monthlyTarget: number;
  additionalBranchIds: string[];
}

export interface TransactionFormState {
  type: FinancialTransaction['type'];
  amount: number;
  date: string;
  notes: string;
}

export type EmployeeTab = 'directory' | 'finance' | 'attendance' | 'analytics';

export const STATUS_LABELS: Record<Employee['status'], { label: string; color: string }> = {
  PROBATION: { label: 'تحت الاختبار', color: 'bg-primary/10 text-primary border-primary/25' },
  ACTIVE: { label: 'على رأس العمل', color: 'bg-success/10 text-success border-success/25' },
  ON_LEAVE: { label: 'في إجازة رسمية', color: 'bg-warning/10 text-warning border-warning/25' },
  SUSPENDED: { label: 'موقوف مؤقتاً', color: 'bg-danger/10 text-danger border-danger/25' },
  RESIGNED: { label: 'مستقيل', color: 'bg-line-strong/10 text-ink-secondary border-line-strong/25' },
  TERMINATED: { label: 'منتهية خدمته', color: 'bg-line-strong/10 text-ink-secondary border-line-strong/25' },
};

export const TX_TYPES = {
  ADVANCE: { label: 'سُلفة', color: 'text-warning bg-warning/10 border-warning/20' },
  BONUS: { label: 'مكافأة / حافز', color: 'text-success bg-success/10 border-success/20' },
  DEDUCTION: { label: 'خصم جزائي', color: 'text-danger bg-danger/10 border-danger/20' },
  SALARY_PAYOUT: { label: 'صرف راتب / دفعة لليد', color: 'text-primary bg-primary/10 border-primary/20' },
};
