import type { DocumentStatus } from './index_part01';

export interface DocumentFilters {
  search?: string;
  status?: DocumentStatus | 'ALL';
  category?: string;
  companyId?: string;
  branchId?: string;
  expiringWithinDays?: number;
  page?: number;
  pageSize?: number;
}

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'TERMINATED';

export type ContractPartyType = 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'OTHER';

export type ContractEffectiveStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TERMINATED';

export interface EnterpriseContract {
  id: string;
  companyId: string;
  companyName?: string | null;
  branchId: string | null;
  contractNumber: string;
  title: string;
  partyType: ContractPartyType;
  partyId: string | null;
  partyName: string;
  startDate: string;
  endDate: string;
  value: number;
  currency: string;
  status: ContractStatus;
  effectiveStatus: ContractEffectiveStatus;
  autoRenew: boolean;
  renewalNoticeDays: number;
  ownerUserId: string | null;
  ownerName?: string | null;
  documentId: string | null;
  documentTitle?: string | null;
  notes: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  daysToExpiry: number | null;
}
