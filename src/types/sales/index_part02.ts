import type { UnitType, CeramicGrade } from '../products';

export interface SalesInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  specialStockId?: string | null;
  productName: string;
  productSku: string;
  productGrade: CeramicGrade;
  size: string;
  
  soldBy: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
  quantityM2: number; // الكمية الصافية بالمتر
  /** Generic base-unit quantity (equals quantityM2 unless the product uses another base unit). */
  quantity?: number;
  /** Unit that `quantity` is expressed in (the product base unit). */
  uom?: string;
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
  returnTaxAmount?: number | null;
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
  invoiceItemId?: string | null;
  productId: string;
  productName: string;
  grade: CeramicGrade;
  quantityM2: number;
  quantity?: number;
  uom?: string;
  boxesCount: number;
  unitPrice: number;
  unitCost: number;
  totalRefund: number;
  sourceType?: 'INVOICE' | 'SPECIAL_STOCK_SALE' | null;
  specialStockId?: string | null;
  disposition?: 'RESTOCK' | 'SPECIAL_STOCK' | 'QUARANTINE' | 'DAMAGED' | null;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
}
