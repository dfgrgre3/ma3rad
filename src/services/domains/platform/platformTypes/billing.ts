import type { PlatformPlanChangeType } from './plans';

export type PlatformLicenseStatus = 'ISSUED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
export type PlatformSubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type PlatformPaymentMethod = 'CASH' | 'BANK' | 'CARD' | 'WALLET' | 'OTHER';
export type PlatformBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'LIFETIME';
/** How subscription and license changes are coupled. */
export type PlatformCouplingMode = 'FULL' | 'EXPIRY_ONLY' | 'NONE';

export type PlatformInvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';

export const PLATFORM_INVOICE_STATUS_LABELS: Record<PlatformInvoiceStatus, string> = {
  DRAFT: 'مسودة',
  SENT: 'مرسلة',
  PARTIAL: 'مدفوعة جزئياً',
  PAID: 'مدفوعة',
  OVERDUE: 'متأخرة',
  VOID: 'ملغاة',
};

export interface PlatformInvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface PlatformInvoice {
  id: string;
  number: string;
  tenantId: string;
  tenantName?: string;
  subscriptionId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  status: PlatformInvoiceStatus;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  createdAt: string;
  items?: PlatformInvoiceItem[];
}

export interface PlatformInvoiceInput {
  tenantId: string;
  subscriptionId?: string | null;
  issueDate?: string;
  dueDate?: string;
  discount?: number;
  tax?: number;
  notes?: string;
  status?: 'DRAFT' | 'SENT';
  items: PlatformInvoiceItem[];
}

export interface PlatformPayment {
  id: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  tenantId: string;
  tenantName?: string;
  amount: number;
  method: PlatformPaymentMethod;
  reference?: string | null;
  paidAt: string;
  notes?: string | null;
}

export interface PlatformPaymentInput {
  invoiceId?: string | null;
  tenantId: string;
  amount: number;
  method?: PlatformPaymentMethod;
  reference?: string;
  paidAt?: string;
  notes?: string;
}

export interface PlatformSubscription {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  planId: string;
  planName?: string | null;
  status: PlatformSubscriptionStatus;
  startDate: string;
  endDate?: string | null;
  seats: number;
  price: number;
  discount?: number;
  billingCycle: PlatformBillingCycle;
  autoRenew: boolean;
  /** Maximum number of branches allowed by this subscription. */
  branchesLimit: number;
  /** السعر المقفل لهذا الاشتراك (للحفاظ على السعر القديم عند تغيير الخطة). */
  lockedPrice?: number | null;
  /** العملة المقفلة. */
  lockedCurrency?: string | null;
  /** رمز الكوبون المطبق على هذا الاشتراك (إن وجد). */
  couponCode?: string | null;
  /** رقم الإصدار الساري من الخطة. */
  planVersion?: number;
  /** نوع التغيير الأخير: upgrade / downgrade / same / renewal. */
  lastChangeType?: PlatformPlanChangeType | null;
  /** تاريخ انتهاء الفترة التجريبية المجانية. */
  trialEndsAt?: string | null;
  /** هل هذه فترة تجريبية مجانية. */
  isTrial?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCoupon {
  id: string;
  code: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  applicablePlans: string[];
  minSubtotal: number;
  startsAt?: string | null;
  notes?: string | null;
}

export interface PlatformCouponInput {
  code: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
  applicablePlans?: string[];
  minSubtotal?: number;
  startsAt?: string | null;
  notes?: string;
}

