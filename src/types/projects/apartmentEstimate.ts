import type { EstimateLine, EstimateRoom } from './estimateMeasurement';

export interface ApartmentEstimate {
  id: string;
  projectId: string;
  name: string;
  areaM2: number;
  totalAmount: number;
  rooms: EstimateRoom[];
  costLines: EstimateLine[];
  quotationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveApartmentEstimateInput {
  id?: string;
  projectId: string;
  name: string;
  areaM2: number;
  totalAmount: number;
  rooms: EstimateRoom[];
  costLines: EstimateLine[];
}
