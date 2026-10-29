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
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeDocumentDTO {
  employeeId: string;
  documentType?: HrDocumentType;
  title: string;
  documentNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  confidentiality?: HrDocumentConfidentiality;
  notes?: string | null;
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
