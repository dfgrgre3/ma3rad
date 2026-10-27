import type { PaymentType, Product } from '../../types';

export type PosUnit = 'M2' | 'BOX' | 'PIECE';
export type SortMode = 'NAME' | 'PRICE_ASC' | 'PRICE_DESC' | 'STOCK_DESC';

export interface CartItem {
  product: Product;
  soldBy: PosUnit;
  quantityM2: number;
  boxesCount: number;
  piecesCount: number;
  unitPrice: number;
  discountAmount: number;
  availableStockM2: number;
}

export interface HeldOrder {
  id: string;
  label: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  warehouseId: string;
  items: CartItem[];
  discountAmount: number;
  taxPercentage?: number;
  shippingCost: number;
  notes: string;
  paidAmount?: number;
  paymentType?: PaymentType;
}

export interface Toast {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export const HELD_STORAGE_KEY = 'ceramisys_pos_held_orders';

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Locale-aware compare function for text arrays (avoids default alphabetical coercion). */
export const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'ar', { numeric: true, sensitivity: 'base' });
