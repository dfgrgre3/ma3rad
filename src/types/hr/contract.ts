export type ContractType = 'PERMANENT' | 'FIXED_TERM' | 'PART_TIME' | 'TEMPORARY';
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'TERMINATED';
export type ContractEffectiveStatus = ContractStatus | 'SCHEDULED' | 'EXPIRING' | 'EXPIRED';

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
  currency?: string;
  renewalNoticeDays?: number;
  notes?: string | null;
  signedDate?: string | null;
}

export interface ContractRenewalDTO {
  endDate: string;
  salary?: number;
  notes?: string | null;
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
