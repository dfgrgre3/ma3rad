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
