import type { UnitType, CeramicGrade } from './products';
import type { PaymentType, PaymentStatus } from './sales';

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber?: string;
  date: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  
  notes?: string;
  createdBy: string;
  createdAt: string;
  items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: UnitType;
  customUnit?: string;
  grade: CeramicGrade;
  
  quantityM2: number;
  boxesCount: number;
  unitCost: number;
  totalCost: number;
  
  metersPerBox: number;
  piecesPerBox: number;
}
