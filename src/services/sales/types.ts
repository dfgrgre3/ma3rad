import type { PaymentType } from '../../types';

export interface CreateSaleDTO {
  customerId: string;
  warehouseId: string;
  shiftId?: string;
  orderId?: string;
  projectId?: string;
  items: {
    productId: string;
    /** Unit the cashier entered the line in; kept for display/reporting. */
    soldBy: string;
    /** Legacy base-unit quantity. Ignored for math when `uom` + `quantity` are given. */
    quantityM2: number;
    /** Explicit selling unit (e.g. BOX or TON). When present, `quantity` is in it. */
    uom?: string;
    /** Quantity expressed in `uom`. When present, `unitPrice` is per `uom`. */
    quantity?: number;
    boxesCount: number;
    piecesCount: number;
    unitPrice: number;
    unitCost?: number;
    discountAmount?: number;
  }[];
  discountPercentage?: number;
  discountAmount?: number;
  taxPercentage?: number;
  taxAmount?: number;
  shippingCost?: number;
  paidAmount: number;
  paymentType: PaymentType;
  notes?: string;
  performedBy?: string;
}

export interface InvoiceFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID';
  invoiceStatus?: 'ALL' | 'COMPLETED' | 'VOID' | 'HOLD' | 'DRAFT';
  customerId?: string;
  warehouseId?: string;
}

export interface InvoiceStats {
  count: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  returnedAmount: number;
  totalCost: number;
  grossProfit: number;
}

export interface ReturnableItem {
  productId: string;
  productName: string;
  grade: string;
  size: string;
  soldM2: number;
  returnedM2: number;
  returnableM2: number;
  unitPrice: number;
  unitCost: number;
  boxesCount: number;
  metersPerBox: number;
  piecesPerBox?: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface ReturnStats {
  count: number;
  totalAmount: number;
  cashRefunded: number;
  creditedToBalance: number;
  todayCount: number;
  todayAmount: number;
}

export interface ReturnRequestItem {
  productId: string;
  /** Base-unit quantity, used when `uom`/`quantity` are not supplied. */
  quantityM2: number;
  /** Optional selling unit for the returned quantity (e.g. BOX). */
  uom?: string;
  /** Quantity expressed in `uom`; converted to `quantityM2` before validation. */
  quantity?: number;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  reason: string;
}
