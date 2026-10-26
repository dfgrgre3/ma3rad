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

export interface SupplierQuotationItem {
  id: string;
  quotationId: string;
  rfqItemId: string | null;
  productId: string;
  productName?: string;
  quantityM2: number;
  unitCost: number;
  totalCost: number;
  notes: string | null;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface GoodsReceiptRow {
  id: string;
  grnNumber: string;
  date: string;
  purchaseOrderId: string | null;
  orderNumber?: string | null;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  deliveryNoteNumber: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  status: 'PENDING_INSPECTION' | 'ACCEPTED' | 'ACCEPTED_WITH_REMARKS' | 'REJECTED';
  totalReceivedM2: number;
  totalAcceptedM2: number;
  totalDamagedM2: number;
  totalShortageM2: number;
  notes: string | null;
  inspectedByName?: string;
  createdByName?: string;
  createdAt: string;
  itemsCount?: number;
  quantityBreakdown?: {
    unitLabel: string;
    totalReceived: number;
    totalAccepted: number;
    totalDamaged: number;
    totalShortage: number;
  }[];
}

export interface GoodsReceiptItem {
  id: string;
  grnId: string;
  purchaseOrderItemId: string | null;
  productId: string;
  productName: string;
  productSku?: string;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
  orderedQuantityM2: number;
  receivedQuantityM2: number;
  acceptedQuantityM2: number;
  damagedQuantityM2: number;
  shortageQuantityM2: number;
  batchNumber: string | null;
  toneShade: string | null;
  caliber: string | null;
  grade: string;
  unitCost: number;
  inspectionNotes: string | null;
  qualityVerdict: 'PASS' | 'DEFECT' | 'REJECT';
}

export interface SupplierClaimRow {
  id: string;
  claimNumber: string;
  date: string;
  supplierId: string;
  supplierName?: string;
  purchaseInvoiceId: string | null;
  invoiceNumber?: string | null;
  grnId: string | null;
  grnNumber?: string | null;
  purchaseOrderId: string | null;
  orderNumber?: string | null;
  claimType: 'SHORTAGE' | 'DAMAGE_DEFECT' | 'PRICE_DIFFERENCE' | 'LATE_DELIVERY' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  claimedAmount: number;
  agreedAmount: number;
  status: 'OPEN' | 'UNDER_REVIEW' | 'APPROVED' | 'SETTLED' | 'REJECTED';
  resolutionType: 'DEBIT_NOTE' | 'REPLACEMENT' | 'REFUND' | 'PENDING' | 'NONE';
  notes: string | null;
  createdByName?: string;
  createdAt: string;
  items?: SupplierClaimItem[];
}

export interface SupplierClaimItem {
  id: string;
  claimId: string;
  productId: string;
  productName: string;
  defectType: string | null;
  quantityM2: number;
  unitCost: number;
  totalAmount: number;
  notes: string | null;
}
