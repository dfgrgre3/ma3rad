import type { StockReservation } from '../../../services/ReservationService';
import type { Order } from '../../../services/OrderService';
import { getProductUnitLabel } from '../../../utils/productUnits';

export type ReservationReferenceType = 'ORDER' | 'QUOTATION' | 'PROJECT' | 'MANUAL';

export type DepositPaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER';

export type ReservationTab = 'orders' | 'reservations';

export interface WarehouseOption {
  id: string;
  name: string;
}

export interface ReservationAvailability {
  onHand: number;
  reserved: number;
  available: number;
}

export interface NewReservationForm {
  productId: string;
  warehouseId: string;
  quantityM2: string;
  referenceType: ReservationReferenceType;
  referenceId: string;
  expiresAt: string;
  notes: string;
}

export interface ReservationStats {
  activeReservationsCount: number;
  reservedByUnit: Map<string, number>;
  pendingOrdersCount: number;
  totalDepositsCollected: number;
}

export const createEmptyNewReservationForm = (): NewReservationForm => ({
  productId: '',
  warehouseId: '',
  quantityM2: '',
  referenceType: 'MANUAL',
  referenceId: '',
  expiresAt: '',
  notes: '',
});

export const computeReservationStats = (
  reservations: StockReservation[],
  orders: Order[],
): ReservationStats => {
  const activeReservationsCount = reservations.filter((r) => r.status === 'ACTIVE').length;
  const reservedByUnit = new Map<string, number>();
  reservations.filter((r) => r.status === 'ACTIVE').forEach((reservation) => {
    const unit = getProductUnitLabel(reservation);
    reservedByUnit.set(unit, (reservedByUnit.get(unit) || 0) + Number(reservation.quantityM2 || 0));
  });
  const pendingOrdersCount = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
  const totalDepositsCollected = orders.reduce((sum, o) => sum + Number(o.paidAmount || 0), 0);

  return { activeReservationsCount, reservedByUnit, pendingOrdersCount, totalDepositsCollected };
};
