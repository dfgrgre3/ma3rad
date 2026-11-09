import type { SupplierQuotationItem } from './part01_part02';

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  categoryName: string | null;
  brandName: string | null;
  currentStock: number;
  minStockLevel: number;
  maxStockLevel: number | null;
  suggestedQuantity: number;
  unitCost: number;
  estimatedCost: number;
  unit: string;
}

export interface SupplierRfqRow {
  id: string;
  rfqNumber: string;
  date: string;
  dueDate: string | null;
  status: 'OPEN' | 'EVALUATING' | 'AWARDED' | 'CANCELLED';
  notes: string | null;
  createdByName?: string;
  createdAt: string;
  itemsCount?: number;
  quotationsCount?: number;
}

export interface SupplierRfqItem {
  id: string;
  rfqId: string;
  productId: string;
  productName: string;
  quantityM2: number;
  notes: string | null;
  productSku?: string;
  categoryName?: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface SupplierQuotationRow {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName?: string;
  supplierPhone?: string;
  quotationNumber: string;
  date: string;
  validUntil: string | null;
  totalAmount: number;
  deliveryDays: number;
  paymentTerms: string;
  qualityRating: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  notes: string | null;
  createdAt: string;
  items?: SupplierQuotationItem[];
}
