export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'EXPIRED';
export type ReservationReference = 'ORDER' | 'QUOTATION' | 'PROJECT' | 'MANUAL';

export interface StockReservation {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
  warehouseId: string;
  warehouseName: string;
  quantityM2: number;
  referenceType: ReservationReference;
  referenceId?: string | null;
  status: ReservationStatus;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  releasedAt?: string | null;
}
