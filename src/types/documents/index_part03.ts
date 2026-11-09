import type { ContractEffectiveStatus, ContractPartyType } from './index_part02';

export interface CreateContractDTO {
  companyId: string;
  branchId?: string | null;
  contractNumber?: string;
  title: string;
  partyType?: ContractPartyType;
  partyId?: string | null;
  partyName: string;
  startDate: string;
  endDate: string;
  value?: number;
  currency?: string;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  ownerUserId?: string | null;
  documentId?: string | null;
  notes?: string | null;
}

export interface UpdateContractDTO {
  title?: string;
  partyType?: ContractPartyType;
  partyId?: string | null;
  partyName?: string;
  startDate?: string;
  endDate?: string;
  value?: number;
  currency?: string;
  autoRenew?: boolean;
  renewalNoticeDays?: number;
  ownerUserId?: string | null;
  documentId?: string | null;
  notes?: string | null;
}

export interface ContractFilters {
  search?: string;
  status?: ContractEffectiveStatus | 'ALL';
  companyId?: string;
  partyType?: ContractPartyType;
  expiringWithinDays?: number;
  page?: number;
  pageSize?: number;
}

export interface DocumentModuleSummary {
  documents: number;
  activeDocuments: number;
  archivedDocuments: number;
  expiringDocuments: number;
  contracts: number;
  activeContracts: number;
  expiringContracts: number;
}

export interface DocumentCompanyOption {
  id: string;
  name: string;
  code: string;
}
