import type { PaymentType, UnitType } from '../../types';

export interface CreateSaleDTO {
  customerId: string;
  warehouseId: string;
  shiftId?: string;
  orderId?: string;
  projectId?: string;
  items: {
    productId: string;
    soldBy: UnitType;
    quantityM2: number;
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
  quantityM2: number;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  reason: string;
}
