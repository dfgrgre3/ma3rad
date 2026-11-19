import type { PlatformBillingCycle, PlatformSubscriptionStatus } from './billing';

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  billingCycle: PlatformBillingCycle;
  price: number;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  seatsLimit: number;
  branchesLimit: number;
  devicesLimit: number;
  storageLimitMb: number;
  maxProducts: number;
  maxWarehouses: number;
  trialDays: number;
  includedModules: string[];
  features: string[];
  permissions: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  subscriberCount?: number;
  /** Default offline grace period in days for licenses issued under this plan. */
  offlineGracePeriodDays: number;
  versioned?: boolean;
  currentVersion?: number;
}

export interface PlatformPlanInput {
  code: string;
  name: string;
  description?: string;
  billingCycle?: PlatformBillingCycle;
  price?: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
  currency?: string;
  seatsLimit?: number;
  branchesLimit?: number;
  devicesLimit?: number;
  storageLimitMb?: number;
  maxProducts?: number;
  maxWarehouses?: number;
  trialDays?: number;
  includedModules?: string[];
  features?: string[];
  permissions?: string[];
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  /** Default offline grace period in days for licenses issued under this plan. */
  offlineGracePeriodDays?: number;
  /** إذا كانت الخطة تدعم نسخ الأسعار مع تواريخ سريان. */
  versioned?: boolean;
  /** تاريخ سريان الإصدار الأولي (للخطط ذات النسخ). */
  effectiveFrom?: string;
  /** ملاحظة الإصدار الأولي. */
  initialChangeNote?: string;
}

// ─── Plan Versioning ─────────────────────────────────────────────────────────

export type PlatformPlanChangeType = 'upgrade' | 'downgrade' | 'same' | 'renewal' | 'new';

export interface PlatformPlanVersion {
  id: string;
  planId: string;
  version: number;
  name: string;
  description?: string | null;
  billingCycle: PlatformBillingCycle;
  price: number;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  seatsLimit: number;
  branchesLimit: number;
  devicesLimit: number;
  storageLimitMb: number;
  maxProducts: number;
  maxWarehouses: number;
  trialDays: number;
  includedModules: string[];
  features: string[];
  permissions: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  offlineGracePeriodDays: number;
  /** تاريخ بدء سريان هذا الإصدار (ISO). */
  effectiveFrom: string;
  /** إذا كان هذا الإصدار هو الساري حالياً للخطة الأساسية. */
  isCurrent: boolean;
  /** ملاحظة حول التغيير في هذا الإصدار. */
  changeNote?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PlatformPlanVersionInput {
  planId: string;
  version: number;
  name: string;
  description?: string;
  billingCycle?: PlatformBillingCycle;
  price?: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
  currency?: string;
  seatsLimit?: number;
  branchesLimit?: number;
  devicesLimit?: number;
  storageLimitMb?: number;
  maxProducts?: number;
  maxWarehouses?: number;
  trialDays?: number;
  includedModules?: string[];
  features?: string[];
  permissions?: string[];
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  offlineGracePeriodDays?: number;
  /** تاريخ بدء سريان هذا الإصدار (ISO). مطلوب. */
  effectiveFrom: string;
  /** إذا كان هذا الإصدار هو الساري حالياً. */
  isCurrent?: boolean;
  changeNote?: string;
  createdBy?: string;
}

export interface PlatformPriceHistoryEntry {
  id: string;
  planId: string;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  changedBy: string;
}

export interface PlatformSubscriptionPriceLock {
  id: string;
  subscriptionId: string;
  planId: string;
  lockedPrice: number;
  lockedMonthlyPrice: number;
  lockedYearlyPrice: number;
  currency: string;
  /** التاريخ الذي ينتهي عنده القفل (null = دائم). */
  expiresAt?: string | null;
  /** إذا كان السعر مقفلاً من خطة سابقة عند الترقية/التخفيض. */
  isGrandfathered: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Upgrade/Downgrade Rules ─────────────────────────────────────────────────

export interface PlatformPlanUpgradeRule {
  id: string;
  fromPlanId: string;
  toPlanId: string;
  allowed: boolean;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPlanUpgradeRuleInput {
  fromPlanId: string;
  toPlanId: string;
  allowed?: boolean;
  upgradeFeePercent?: number;
  requiresApproval?: boolean;
  notes?: string;
}

// ─── Plan Copy / Versioning Results ──────────────────────────────────────────

export interface PlatformPlanCopyResult {
  plan: PlatformPlan;
  copiedRules: number;
}

export interface PlatformPlanEffectivePricing {
  /** الخطة السارية للعميل في هذا التاريخ. */
  plan: PlatformPlan | null;
  /** الإصدار الساري من الخطة. */
  version: PlatformPlanVersion | null;
  /** السعر المطبق فعلياً (بعد القفل إن وجد). */
  appliedPrice: number;
  /** السعر الشهري المطبق. */
  appliedMonthlyPrice: number;
  /** السعر السنوي المطبق. */
  appliedYearlyPrice: number;
  /** العملة المطبق. */
  appliedCurrency: string;
  /** إذا كان السعر مقفلاً (grandfathered). */
  isPriceLocked: boolean;
  /** معرف القفل إن وجد. */
  priceLockId?: string | null;
}

// ─── Impact Preview ──────────────────────────────────────────────────────────

export interface PlatformPlanImpactPreview {
  planId: string;
  planName: string;
  affectedTenants: number;
  limitViolations: Array<{
    tenantId: string;
    tenantName: string;
    type: string;
    current: number;
    newLimit: number;
  }>;
  riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
  recommendation: string;
}

// ─── Plan Change Request (upgrade/downgrade with effective date) ─────────────

export interface PlatformPlanChangeRequest {
  tenantId: string;
  targetPlanId: string;
  /** تاريخ سريان التغيير الجديد. */
  effectiveFrom: string;
  /** إذا كان السعر مقفلاً للعميل الحالي (احتفظ بالسعر القديم). */
  lockOldPrice?: boolean;
  /** عدد المقاعد الجديد. */
  seats?: number;
  /** عدد الفروع الجديد. */
  branchesLimit?: number;
  /** ملاحظة حول التغيير. */
  notes?: string;
}

export interface PlatformPlanChangeResult {
  subscriptionId: string;
  planId: string;
  oldPlanId: string;
  effectiveFrom: string;
  priceChange: {
    oldPrice: number;
    newPrice: number;
    currency: string;
    proratedAmount: number;
  };
  status: PlatformSubscriptionStatus;
}

// ─── Extended PlanInput ──────────────────────────────────────────────────────

export interface PlatformPlanVersioningInput {
  /** إذا كانت الخطة تدعم نسخ الأسعار مع تواريخ سريان. */
  versioned?: boolean;
  /** نسخة أولية للخطة (لإنشاء إصدار أولي). */
  initialVersion?: PlatformPlanVersionInput;
}

export interface PlatformSubscriptionCreateInput {
  tenantId: string;
  planId: string;
  status?: PlatformSubscriptionStatus;
  startDate?: string;
  endDate?: string | null;
  seats?: number;
  price?: number;
  discount?: number;
  billingCycle?: PlatformBillingCycle;
  autoRenew?: boolean;
  branchesLimit?: number;
  /** إذا كان السعر مقفلاً (احتفظ بالسعر القديم). */
  lockPrice?: boolean;
  /** رمز الكوبون المطبق. */
  couponCode?: string | null;
  /** إذا كانت فترة تجريبية. */
  isTrial?: boolean;
  /** تاريخ نهاية الفترة التجريبية. */
  trialEndsAt?: string | null;
}

export interface PlatformTrialCreateInput {
  tenantId: string;
  planId: string;
  trialDays?: number;
  startsAt?: string;
  couponCode?: string | null;
  seats?: number;
  branchesLimit?: number;
}
