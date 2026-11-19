import type { AuthService } from '../../auth/AuthService';
import type { PayrollTaxBasis, PayrollTaxBreakdownLine, PayrollTaxSource } from '../PayrollTaxService';

export type EmployeeStatus = 'PROBATION' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED';
export type SalaryType = 'MONTHLY' | 'DAILY';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY';
export type PayrollTxType = 'ADVANCE' | 'BONUS' | 'DEDUCTION' | 'SALARY_PAYOUT';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';

/** Authenticated actor shape returned by AuthService.requireAuth(). */
export type EmployeeServiceActor = ReturnType<typeof AuthService.requireAuth>;

export interface Employee {
  id: string;
  code: string;
  branchId?: string;
  employmentType?: EmploymentType;
  name: string;
  nationalId?: string | null;
  birthDate?: string | null;
  gender?: 'FEMALE' | 'MALE' | 'OTHER' | null;
  location: string;
  role: string;
  phone: string;
  phone2?: string | null;
  email: string;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  managerEmployeeId?: string | null;
  managerName?: string | null;
  probationStartDate?: string | null;
  probationEndDate?: string | null;
  terminatedAt?: string | null;
  baseSalary: number;
  salaryType: SalaryType;
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
  status: EmployeeStatus;
  joinedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Sales representative flag (employees.is_sales_rep). */
  isSalesRep?: boolean;
  /** Commission percentage applied to eligible sales. */
  commissionPercentage?: number;
  /** Monthly sales target in major currency units. */
  monthlyTarget?: number;
  /** Branches the employee serves beyond the home branch (employees.branch_id). */
  additionalBranchIds?: string[];
}

export interface EmployeeBranchAssignment {
  branchId: string;
  branchName: string;
}

export interface SalesRepOption {
  id: string;
  code: string;
  name: string;
  homeBranchId: string | null;
  /** Home branch + all additional assigned branches. */
  branchIds: string[];
  branchNames: string;
  isSalesRep: boolean;
  commissionPercentage: number;
  /** Present when the caller passed a branch filter: whether the rep serves it. */
  servesBranch?: boolean;
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
  paymentMethod?: PayrollPaymentMethod;
  bankAccountId?: string | null;
  walletProvider?: string | null;
  walletNumber?: string | null;
  referenceNumber?: string | null;
  proofReference?: string | null;
  paymentStatus?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes?: number;
  lateMinutes: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes: number;
  breakMinutes?: number;
  overtimeApproved?: boolean;
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

export type PayrollRunStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CLOSED';
export type PayrollPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'WALLET';
export type PayrollPayoutStatus = 'PENDING' | 'PAID';

export interface PayrollPaymentInstruction {
  method?: PayrollPaymentMethod;
  registerId?: string;
  bankAccountId?: string;
  walletProvider?: string;
  walletNumber?: string;
  referenceNumber?: string;
  proofReference?: string;
}

export interface PayrollPayOptions {
  batchReference?: string;
  defaultRegisterId?: string;
  defaultBankAccountId?: string;
  payments?: Record<string, PayrollPaymentInstruction>;
}

export interface PayrollPaymentReconciliationItem {
  itemId: string;
  employeeId: string;
  employeeName: string;
  paymentMethod: PayrollPaymentMethod;
  expectedAmount: number;
  paidAmount: number;
  difference: number;
  payoutStatus: PayrollPayoutStatus;
  payoutTransactionId: string | null;
  paymentReference: string | null;
  paymentProof: string | null;
  issues: string[];
}

export interface PayrollPaymentReconciliation {
  runId: string;
  period: string;
  expectedTotal: number;
  paidTotal: number;
  difference: number;
  isBalanced: boolean;
  items: PayrollPaymentReconciliationItem[];
  byMethod: Array<{ method: PayrollPaymentMethod; count: number; amount: number }>;
}

export interface PayrollRunItem {
  id: string;
  employeeId: string;
  branchId: string;
  employeeName: string;
  salaryType: SalaryType;
  baseSalary: number;
  expectedWorkdays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  overtimeMinutes: number;
  baseAmount: number;
  overtimeAmount: number;
  bonusAmount: number;
  commissionAmount: number;
  allowanceAmount: number;
  loanDeductionAmount: number;
  advanceAmount: number;
  manualDeductionAmount: number;
  attendanceDeductionAmount: number;
  taxAmount: number;
  socialInsuranceBase: number;
  socialInsuranceEmployeeShare: number;
  socialInsuranceEmployerShare: number;
  socialInsuranceTotal: number;
  grossAmount: number;
  netAmount: number;
  warnings: string[];
  paymentMethod: PayrollPaymentMethod;
  paymentReference: string | null;
  paymentProof: string | null;
  paidAmount: number;
  payoutStatus: PayrollPayoutStatus;
  details: {
    workingDaysPerMonth: number;
    workingHoursPerDay: number;
    overtimeMultiplier: number;
    taxRate: number;
    previousPayoutAmount: number;
    commissionIds: string[];
    loanInstallmentIds?: string[];
    salaryComponents?: Array<{ name: string; amount: number }>;
    salaryComponentTotal?: number;
    salaryPaymentMethod?: PayrollPaymentMethod;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    walletProvider?: string | null;
    walletNumber?: string | null;
    taxRuleId?: string | null;
    taxRuleName?: string;
    taxSource?: PayrollTaxSource;
    taxBasis?: PayrollTaxBasis;
    taxableAmount?: number;
    taxExemptionAmount?: number;
    taxDependentAllowance?: number;
    taxDependents?: number;
    taxBreakdown?: PayrollTaxBreakdownLine[];
    socialInsuranceRuleId?: string | null;
    socialInsuranceRuleName?: string | null;
    socialInsuranceCeilingApplied?: boolean;
    endOfServiceBenefit?: number;
    endOfServiceRuleId?: string | null;
    endOfServiceRuleName?: string | null;
  };
  payoutTransactionId: string | null;
}

export interface PayrollRun {
  id: string;
  period: string;
  branchId: string;
  status: PayrollRunStatus;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  items: PayrollRunItem[];
}

export type PayrollTransactionInput = {
  employeeId: string;
  type: PayrollTxType;
  amount: number;
  date: string;
  notes: string;
  createdBy?: string;
  registerId?: string;
  paymentMethod?: PayrollPaymentMethod;
  bankAccountId?: string;
  walletProvider?: string;
  walletNumber?: string;
  referenceNumber?: string;
  proofReference?: string;
};
