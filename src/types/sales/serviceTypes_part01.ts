import type { PaymentType } from '..';

export interface CreateSaleDTO {
  customerId: string;
  warehouseId: string;
  shiftId?: string;
  orderId?: string;
  restaurantOrderId?: string;
  projectId?: string;
  items: {
    productId: string;
    /** Source special-stock record for approved discounted sale inventory. */
    specialStockId?: string;
    /** Unit the cashier entered the line in; kept for display/reporting. */
    soldBy: string;
    /** Legacy base-unit quantity. Ignored for math when `uom` + `quantity` are given. */
    quantityM2: number;
    /** Explicit selling unit (e.g. BOX or TON). When present, `quantity` is in it. */
    uom?: string;
    /** Quantity expressed in `uom`. When present, `unitPrice` is per `uom`. */
    quantity?: number;
    boxesCount: number;
    piecesCount: number;
    unitPrice: number;
    /** Indicates the price was selected by the POS pricing resolver. The service still revalidates it. */
    pricingSource?: 'POS';
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
  /** Optional split-payment breakdown. When provided, sum(amount) should equal paidAmount. */
  payments?: { method: PaymentType; amount: number; reference?: string; bankAccountId?: string }[];
  bankAccountId?: string;
  notes?: string;
  performedBy?: string;
  loyaltyRedemption?: { points: number; discountAmount: number };
  promotionUsage?: { promotionId: string; couponCode?: string; discountAmount: number };
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
