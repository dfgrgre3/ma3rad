import type { SalesInvoiceItem } from './index_part02';

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
  branchId?: string;
  warehouseName?: string;
  shiftId?: string;
  
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  shippingCost: number; // مشال ونقل
  extraFees?: number;
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

  // بيانات التوصيل والشحن
  deliveryAddress?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  deliveryDate?: string;
  deliveryNotes?: string;
  driverName?: string;

  // تفاصيل العروض والكوبونات المطبقة
  couponCode?: string;
  promotionName?: string;
  promotionDiscount?: number;

  // تفاصيل تجزئة المدفوعات (Split Payments)
  paymentSplits?: Array<{
    method: PaymentType | string;
    amount: number;
    reference?: string;
  }>;

  items?: SalesInvoiceItem[];
}
