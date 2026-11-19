import type { PaymentType } from '../../../../types';

export const ORDER_MONEY_FIELDS = ['subtotal', 'discount_amount', 'tax_amount', 'shipping_cost', 'total_amount', 'paid_amount', 'remaining_amount'] as const;
export const ORDER_ITEM_MONEY_FIELDS = ['unit_price', 'discount_amount', 'total_price'] as const;

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  warehouseId: string;
  warehouseName?: string;
  quotationId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  expectedDeliveryDate?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCost: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: OrderStatus;
  salesRepId?: string | null;
  deliveryStatus?: 'PENDING' | 'PARTIAL' | 'DELIVERED';
  billingStatus?: 'NOT_INVOICED' | 'INVOICED';
  financialStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  bankAccountId?: string | null;
  notes?: string | null;
  deliveryNotes?: string | null;
  deliveredAt?: string | null;
  itemsCount?: number;
  totalM2?: number;
  deliveredM2?: number;
  invoicedM2?: number;
  deliveryProgress?: number;
  createdAt: string;
  updatedAt?: string;
  branchId?: string | null;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  grade: string;
  size?: string | null;
  sku?: string | null;
  quantityM2: number;
  boxesCount: number;
  deliveredM2: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  invoicedM2?: number;
  notes?: string | null;
  metersPerBox?: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
}

export interface OrderDeposit {
  id: string;
  orderId: string;
  depositNumber: string;
  amount: number;
  paymentMethod: PaymentType;
  date: string;
  invoiceId: string | null;
  refundId: string | null;
  refundNumber: string | null;
  refundable: number;
}

export interface OrderDeliveryLine {
  itemId: string;
  quantityM2: number;
}

export interface OrderStatusEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface OrderItemInput {
  productId: string;
  /** Quantity in the product's base unit; used when `uom`/`quantity` are absent. */
  quantityM2: number;
  unitPrice: number;
  discountAmount?: number;
  /** Selling unit the user typed the line in (services are always base-unit only). */
  uom?: string;
  /** Quantity expressed in `uom`; `unitPrice` is then per `uom`. */
  quantity?: number;
}

export interface OrderInput {
  customerId: string;
  warehouseId?: string;
  quotationId?: string;
  salesRepId?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  shippingCost?: number;
  discountAmount?: number;
  taxAmount?: number;
  items: OrderItemInput[];
}

export interface OrderFilters {
  search?: string;
  status?: 'ALL' | OrderStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderStats {
  total: number;
  totalValue: number;
  pending: number;
  pendingValue: number;
  processing: number;
  completed: number;
  completedValue: number;
  cancelled: number;
}

export interface ConvertOrderOptions {
  warehouseId?: string;
  paidAmount?: number;
  paymentType?: PaymentType;
  notes?: string;
  shiftId?: string;
}

/** Result of normalizing raw order item input into priced, base-unit lines. */
export interface NormalizedOrderItem {
  productId: string;
  productName: string;
  grade: string;
  quantityM2: number;
  unitPrice: number;
  discountAmount: number;
  boxesCount: number;
  productType?: 'CERAMIC' | 'GENERAL';
  baseUnit?: string;
  customUnit?: string;
  totalPrice: number;
}
