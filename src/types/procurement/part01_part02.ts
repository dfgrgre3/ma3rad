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
