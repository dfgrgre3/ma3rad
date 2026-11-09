import type { PaymentType, Product } from '..';

/** Any unit a line can be sold in; the canonical list comes from `getSellableUnits`. */
export type PosUnit = string;
export type SortMode = 'NAME' | 'PRICE_ASC' | 'PRICE_DESC' | 'STOCK_DESC';

export interface CartItem {
  product: Product;
  /** Unit the cashier is entering quantity and price in. */
  soldBy: PosUnit;
  /** Quantity expressed in `soldBy` (what the cashier typed). */
  soldQuantity: number;
  /** Quantity in the product's base unit (what stock and costing use). */
  quantityM2: number;
  boxesCount: number;
  piecesCount: number;
  /** Price per base unit; display/entry price is derived for `soldBy`. */
  unitPrice: number;
  discountAmount: number;
  availableStockM2: number;
  notes?: string;
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
  /** مصاريف إضافية — اختيارية للتوافق مع الفواتير المعلقة القديمة */
  extraFees?: number;
  /** توزيع الدفع المختلط — اختياري للتوافق مع المعلقات القديمة */
  splitCash?: number;
  splitCard?: number;
  splitBank?: number;
  splitCheque?: number;
  splitCredit?: number;
  notes: string;
  paidAmount?: number;
  paymentType?: PaymentType;
  couponCode?: string;
  redeemPoints?: number;
  loyaltyDiscount?: number;
}

export interface Toast {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface InvoicePreview {
  title: string;
  subtitle?: string;
  fileName: string;
  html: string;
  excel?: () => void;
  whatsapp?: () => void;
}

export const HELD_STORAGE_KEY = 'ceramisys_pos_held_orders';

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Locale-aware compare function for text arrays (avoids default alphabetical coercion). */
export const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'ar', { numeric: true, sensitivity: 'base' });
