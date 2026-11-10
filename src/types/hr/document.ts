export type HrDocumentType = 'IDENTITY' | 'CONTRACT' | 'CERTIFICATE' | 'MEDICAL' | 'EDUCATION' | 'OTHER';
export type HrDocumentStatus = 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
export type HrDocumentEffectiveStatus = HrDocumentStatus | 'EXPIRING';
export type HrDocumentConfidentiality = 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  branchId: string;
  branchName?: string | null;
  documentType: HrDocumentType;
  title: string;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: HrDocumentStatus;
  effectiveStatus: HrDocumentEffectiveStatus;
  confidentiality: HrDocumentConfidentiality;
  notes: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
  updatedByName?: string | null;
  versionCount?: number;
  latestVersionId?: string | null;
  latestVersionNumber?: number | null;
  latestFileName?: string | null;
  latestMimeType?: string | null;
  latestFileSize?: number | null;
  latestUploaderName?: string | null;
}

export interface EmployeeDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  storageName: string;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface EmployeeDocumentAuditEntry {
  id: string;
  userName: string;
  action: string;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

export type EmployeeDocumentVersionInput = Omit<
  EmployeeDocumentVersion,
  'id' | 'documentId' | 'versionNumber' | 'createdBy' | 'createdByName' | 'createdAt'
>;

export interface CreateEmployeeDocumentDTO {
  employeeId: string;
  documentType?: HrDocumentType;
  title: string;
  documentNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  confidentiality?: HrDocumentConfidentiality;
  notes?: string | null;
  attachment?: EmployeeDocumentVersionInput;
  attachmentNotes?: string | null;
}

export interface UpdateEmployeeDocumentDTO {
  documentType?: HrDocumentType;
  title?: string;
  documentNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  confidentiality?: HrDocumentConfidentiality;
  notes?: string | null;
}

export interface EmployeeDocumentFilters {
  employeeId?: string;
  documentType?: HrDocumentType | 'ALL';
  status?: HrDocumentStatus | 'ALL';
  expiringWithinDays?: number;
}

export interface EmployeeDocumentSummary {
  active: number;
  expiring: number;
  expired: number;
  archived: number;
}
