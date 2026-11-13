import type { EstimateLine, EstimateRoom } from './estimateMeasurement';

export interface ApartmentEstimate {
  id: string;
  projectId: string;
  name: string;
  areaM2: number;
  totalAmount: number;
  terms?: string;
  contingencyPercent: number;
  taxPercent: number;
  payments: EstimatePayment[];
  rooms: EstimateRoom[];
  costLines: EstimateLine[];
  quotationId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersionId?: string | null;
  currentVersionNumber?: number | null;
  currentVersionStatus?: EstimateVersionStatus | null;
}

export type EstimateVersionStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'RETURNED';
export interface ApartmentEstimateVersion {
  id: string;
  estimateId: string;
  projectId: string;
  versionNumber: number;
  status: EstimateVersionStatus;
  snapshot: Omit<ApartmentEstimate, 'currentVersionId' | 'currentVersionNumber' | 'currentVersionStatus' | 'createdAt' | 'updatedAt' | 'quotationId'> & { lineQuantities?: Record<string, number> };
  changeSummary: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ApartmentEstimateQuotationLink {
  quotationId: string;
  quotationNumber: string;
  versionId: string | null;
  versionNumber: number | null;
  createdAt: string;
}

export interface SaveApartmentEstimateInput {
  id?: string;
  projectId: string;
  name: string;
  areaM2: number;
  totalAmount: number;
  terms?: string;
  contingencyPercent?: number;
  taxPercent?: number;
  payments?: EstimatePayment[];
  changeSummary?: string;
  lineQuantities?: Record<string, number>;
  rooms: EstimateRoom[];
  costLines: EstimateLine[];
}

export interface EstimatePayment { id: string; date: string; amount: number; method: string; reference?: string; notes?: string }
