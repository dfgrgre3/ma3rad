export interface ThreeWayMatchingResult {
  matchingStatus: 'MATCHED' | 'PRICE_VARIANCE' | 'QTY_VARIANCE' | 'BOTH_VARIANCE';
  priceVarianceTotal: number;
  qtyVarianceTotal: number;
  items: Array<{
    productId: string;
    productName: string;
    invoiceQty: number;
    invoicePrice: number;
    poPrice: number;
    grnAcceptedQty: number;
    priceVariance: number;
    qtyVariance: number;
    status: 'MATCHED' | 'PRICE_DIFF' | 'QTY_DIFF' | 'BOTH_DIFF';
  }>;
}

export interface LandedCostBreakdownItem {
  productId: string;
  productName: string;
  quantityM2: number;
  baseUnitCost: number;
  baseTotalCost: number;
  landedShare: number;
  effectiveUnitCost: number;
  effectiveTotalCost: number;
}

export interface SupplierScorecard {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  receivedOrders: number;
  onTimeDeliveries: number;
  onTimeDeliveryRate: number; // 0 - 100%
  totalReceivedM2: number;
  totalAcceptedM2: number;
  totalDamagedM2: number;
  acceptanceRate: number; // 0 - 100%
  damageRate: number; // 0 - 100%
  totalClaimsCount: number;
  settledClaimsCount: number;
  totalClaimedAmount: number;
  totalAgreedAmount: number;
  averagePaymentDays: number;
  currentBalance: number;
  totalPurchases: number;
  overallScore: number; // 0 - 100
  ratingLabel: 'ممتاز' | 'جيد جداً' | 'جيد' | 'يحتاج تحسين' | 'ضعيف';
}

export interface ProductPriceHistoryEntry {
  productId: string;
  date: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  quantityM2: number;
  unitCost: number;
  effectiveUnitCost: number;
  batchNumber: string | null;
}
