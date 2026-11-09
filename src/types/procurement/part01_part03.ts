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
