import type { UnitType, CeramicGrade } from './products';

export type PaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT' | 'MIXED';

export type InvoiceStatus = 'COMPLETED' | 'HOLD' | 'VOID' | 'DRAFT';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  warehouseId: string;
  warehouseName?: string;
  shiftId?: string;
  
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number; // مشال ونقل
  totalAmount: number;
  
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  invoiceStatus: InvoiceStatus;
  
  totalCost: number; // إجمالي تكلفة البضاعة
  grossProfit: number; // الربح الإجمالي
  returnedAmount?: number; // إجمالي المرتجعات المرتبطة بالفاتورة
  orderId?: string | null;
  projectId?: string | null;
  
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  
  items?: SalesInvoiceItem[];
}

export interface SalesInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  productSku: string;
  productGrade: CeramicGrade;
  size: string;
  
  soldBy: UnitType;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
  quantityM2: number; // الكمية الصافية بالمتر
  boxesCount: number; // عدد الكراتين
  piecesCount: number; // عدد القطع
  
  unitPrice: number; // سعر المتر أو القطعة
  originalUnitPrice: number;
  unitCost: number; // تكلفة المتر لحساب الربح
  
  discountAmount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  
  metersPerBox: number;
  piecesPerBox: number;
}

export interface SalesReturn {
  id: string;
  returnNumber: string;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  customerId: string;
  customerName?: string;
  warehouseId: string;
  date: string;
  totalAmount: number;
  refundedAmount: number;
  remainingToBalance: number; // تم إضافته لرصيد العميل
  reason: string;
  refundMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'BALANCE';
  createdBy: string;
  createdAt: string;
  items?: SalesReturnItem[];
}

export interface SalesReturnItem {
  id: string;
  returnId: string;
  productId: string;
  productName: string;
  grade: CeramicGrade;
  quantityM2: number;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  totalRefund: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
}
