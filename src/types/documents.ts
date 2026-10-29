export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type DocumentConfidentiality = 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';

export interface EnterpriseDocument {
  id: string;
  companyId: string;
  companyName?: string | null;
  branchId: string | null;
  branchName?: string | null;
  documentNumber: string;
  title: string;
  category: string;
  description: string | null;
  status: DocumentStatus;
  confidentiality: DocumentConfidentiality;
  ownerUserId: string | null;
  ownerName?: string | null;
  currentVersion: number;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  versions?: EnterpriseDocumentVersion[];
}

export interface EnterpriseDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  storageName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface CreateDocumentDTO {
  companyId: string;
  branchId?: string | null;
  documentNumber?: string;
  title: string;
  category?: string;
  description?: string;
  confidentiality?: DocumentConfidentiality;
  ownerUserId?: string | null;
  expiresAt?: string | null;
  initialVersion?: CreateDocumentVersionDTO;
}

export interface UpdateDocumentDTO {
  title?: string;
  category?: string;
  description?: string | null;
  confidentiality?: DocumentConfidentiality;
  ownerUserId?: string | null;
  expiresAt?: string | null;
}

export interface CreateDocumentVersionDTO {
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  storageName?: string | null;
  notes?: string | null;
}

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
