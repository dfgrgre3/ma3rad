export type ContractType = 'PERMANENT' | 'FIXED_TERM' | 'PART_TIME' | 'TEMPORARY';
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'TERMINATED';
export type ContractEffectiveStatus = ContractStatus | 'SCHEDULED' | 'EXPIRING' | 'EXPIRED';

export interface ContractSalaryComponent {
  name: string;
  amount: number;
}

export interface EmployeeContract {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  branchId: string;
  branchName?: string | null;
  contractNumber: string;
  contractType: ContractType;
  startDate: string;
  endDate: string | null;
  jobTitle: string;
  salary: number;
  salaryComponentsJson?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  renewedFromId?: string | null;
  currency: string;
  status: ContractStatus;
  effectiveStatus?: ContractEffectiveStatus;
  signedDate: string | null;
  renewalNoticeDays: number;
  terminatedAt: string | null;
  terminationReason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractDTO {
  employeeId: string;
  contractType?: ContractType;
  startDate: string;
  endDate?: string | null;
  jobTitle: string;
  salary?: number;
  salaryComponents?: ContractSalaryComponent[];
  currency?: string;
  renewalNoticeDays?: number;
  notes?: string | null;
}

export interface UpdateContractDTO {
  contractType?: ContractType;
  startDate?: string;
  endDate?: string | null;
  jobTitle?: string;
  salary?: number;
  salaryComponents?: ContractSalaryComponent[];
  currency?: string;
  renewalNoticeDays?: number;
  notes?: string | null;
  signedDate?: string | null;
}

export interface ContractRenewalDTO {
  endDate: string;
  startDate?: string;
  salary?: number;
  salaryComponents?: ContractSalaryComponent[];
  notes?: string | null;
}

export interface ContractTerminationDTO {
  terminationDate: string;
  reason: string;
  employeeStatus: 'RESIGNED' | 'TERMINATED';
}

export interface EmployeeFinalSettlement {
  id: string;
  employeeId: string;
  employeeName: string;
  contractId: string;
  contractNumber: string;
  branchId: string;
  terminationDate: string;
  reason: string;
  salaryType: 'MONTHLY' | 'DAILY';
  baseSalary: number;
  earnedWages: number;
  unusedAnnualLeaveDays: number;
  leavePayout: number;
  totalAmount: number;
  detailsJson: string;
  createdBy: string;
  createdAt: string;
}

export interface EmployeeSalaryHistoryEntry {
  id: string;
  previousSalary: number | null;
  nextSalary: number;
  salaryType: 'MONTHLY' | 'DAILY';
  effectiveDate: string;
  sourceType: 'CONTRACT' | 'MANUAL';
  reason: string;
  actorName: string;
}

export interface EmployeeStatusHistoryEntry {
  id: string;
  previousStatus: string | null;
  nextStatus: string;
  effectiveDate: string;
  reason: string;
  actorName: string;
}

export interface EmployeeLifecycleHistory {
  salaryChanges: EmployeeSalaryHistoryEntry[];
  statusChanges: EmployeeStatusHistoryEntry[];
}

export interface ContractFilters {
  employeeId?: string;
  status?: ContractStatus | 'ALL';
  effectiveStatus?: ContractEffectiveStatus | 'ALL';
}

export interface ContractSummary {
  draft: number;
  active: number;
  expiring: number;
  expired: number;
  terminated: number;
}
