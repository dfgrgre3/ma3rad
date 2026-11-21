// Commercial delegations → PlatformPlanService, PlatformSubscriptionService,
// PlatformCouponService and PlatformInvoiceService.
import { platformPlanService } from '../PlatformPlanService';
import { platformSubscriptionService } from '../PlatformSubscriptionService';
import { platformCouponService } from '../PlatformCouponService';
import { platformInvoiceService } from '../PlatformInvoiceService';
import type {
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanVersion,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanCopyResult,
  PlatformPlanImpactPreview,
  PlatformPlanChangeResult,
  PlatformSubscription,
  PlatformSubscriptionCreateInput,
  PlatformTrialCreateInput,
  PlatformCoupon,
  PlatformCouponInput,
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformTenant,
} from '../platformTypes';

export interface BillingApi {
  // Plan Management - Delegate to PlatformPlanService
  listPlans(includeInactive?: boolean): PlatformPlan[];
  createPlan(input: PlatformPlanInput): PlatformPlan;
  updatePlan(id: string, input: PlatformPlanInput): PlatformPlan;
  setPlanActive(id: string, active: boolean): void;
  deletePlan(id: string): void;
  listPlanVersions(planId: string): PlatformPlanVersion[];
  getPlanVersion(planId: string, version: number): PlatformPlanVersion | null;
  listPriceHistory(planId: string): PlatformPriceHistoryEntry[];
  copyPlan(sourcePlanId: string, newCode: string, newName: string, effectiveFrom?: string): PlatformPlanCopyResult;
  listPlanUpgradeRules(): PlatformPlanUpgradeRule[];
  setPlanUpgradeRule(input: PlatformPlanUpgradeRuleInput): PlatformPlanUpgradeRule;
  changeSubscriptionPlan(
    tenantId: string,
    targetPlanId: string,
    options?: {
      months?: number;
      price?: number;
      seats?: number;
      branchesLimit?: number;
      couponCode?: string;
      coupling?: 'FULL' | 'EXPIRY_ONLY' | 'NONE';
      priceLockMonths?: number;
      reason?: string;
      allowLocal?: boolean;
      approvalId?: string;
    }
  ): PlatformPlanChangeResult;
  previewPlanChangeImpact(planId: string, newPlanData: PlatformPlanInput): PlatformPlanImpactPreview;
  validatePlanDeactivation(planId: string): { canDeactivate: boolean; activeSubscriptions: number; message: string };
  // Subscription Management - Delegate to PlatformSubscriptionService
  listSubscriptions(filters?: { status?: string; planId?: string; search?: string }): PlatformSubscription[];
  createSubscription(input: PlatformSubscriptionCreateInput): PlatformSubscription;
  createTrialSubscription(input: PlatformTrialCreateInput): PlatformSubscription;
  renewTenantSubscription(tenantId: string, months?: number): PlatformTenant;
  cancelTenantSubscription(tenantId: string, reason?: string): PlatformTenant;
  suspendTenantSubscription(tenantId: string, reason?: string): PlatformTenant;
  resumeTenantSubscription(tenantId: string): PlatformTenant;
  setSubscriptionAutoRenew(tenantId: string, autoRenew: boolean): void;
  updateSubscriptionSeats(tenantId: string, seats: number, branchesLimit?: number): void;
  listSubscriptionChanges(tenantId: string, limit?: number): Array<Record<string, unknown>>;
  // Coupon Management - Delegate to PlatformCouponService
  listCoupons(): PlatformCoupon[];
  createCoupon(input: PlatformCouponInput): PlatformCoupon;
  validateCoupon(code: string, subtotal: number): { coupon: PlatformCoupon; discount: number };
  applyCoupon(code: string): PlatformCoupon;
  // Invoice & Payment Management - Delegate to PlatformInvoiceService
  listInvoices(search?: string, status?: string, tenantId?: string): PlatformInvoice[];
  getInvoice(id: string): PlatformInvoice | null;
  createInvoice(input: PlatformInvoiceInput): PlatformInvoice;
  setInvoiceStatus(id: string, status: PlatformInvoiceStatus): void;
  voidInvoice(id: string): void;
  listPayments(limit?: number): PlatformPayment[];
  addPayment(input: PlatformPaymentInput): PlatformPayment;
  voidPayment(id: string, reason?: string): void;
}

export function createBillingApi(): BillingApi {
  return {
    // Plan Management - Delegate to PlatformPlanService
    listPlans(includeInactive = true) {
      return platformPlanService.listPlans(includeInactive);
    },

    createPlan(input: PlatformPlanInput) {
      return platformPlanService.createPlan(input);
    },

    updatePlan(id: string, input: PlatformPlanInput) {
      return platformPlanService.updatePlan(id, input);
    },

    setPlanActive(id: string, active: boolean) {
      platformPlanService.setPlanActive(id, active);
    },

    deletePlan(id: string) {
      platformPlanService.deletePlan(id);
    },

    listPlanVersions(planId: string) {
      return platformPlanService.listPlanVersions(planId);
    },

    getPlanVersion(planId: string, version: number) {
      return platformPlanService.getPlanVersion(planId, version);
    },

    listPriceHistory(planId: string) {
      return platformPlanService.listPriceHistory(planId);
    },

    copyPlan(sourcePlanId: string, newCode: string, newName: string, effectiveFrom?: string) {
      return platformPlanService.copyPlan(sourcePlanId, newCode, newName, effectiveFrom);
    },

    listPlanUpgradeRules() {
      return platformPlanService.listPlanUpgradeRules();
    },

    setPlanUpgradeRule(input: PlatformPlanUpgradeRuleInput) {
      return platformPlanService.setPlanUpgradeRule(input);
    },

    changeSubscriptionPlan(
      tenantId: string,
      targetPlanId: string,
      options: {
        months?: number;
        price?: number;
        seats?: number;
        branchesLimit?: number;
        couponCode?: string;
        coupling?: 'FULL' | 'EXPIRY_ONLY' | 'NONE';
        priceLockMonths?: number;
        reason?: string;
        allowLocal?: boolean;
        approvalId?: string;
      } = {}
    ) {
      return platformSubscriptionService.changeSubscriptionPlan(tenantId, targetPlanId, options);
    },

    previewPlanChangeImpact(planId: string, newPlanData: PlatformPlanInput) {
      return platformPlanService.previewPlanChangeImpact(planId, newPlanData);
    },

    validatePlanDeactivation(planId: string) {
      return platformPlanService.validatePlanDeactivation(planId);
    },

    // Subscription Management - Delegate to PlatformSubscriptionService
    listSubscriptions(filters?: { status?: string; planId?: string; search?: string }) {
      return platformSubscriptionService.listSubscriptions(filters);
    },

    createSubscription(input: PlatformSubscriptionCreateInput) {
      return platformSubscriptionService.createSubscription(input);
    },

    createTrialSubscription(input: PlatformTrialCreateInput) {
      return platformSubscriptionService.createTrialSubscription(input);
    },

    renewTenantSubscription(tenantId: string, months = 12) {
      return platformSubscriptionService.renewTenantSubscription(tenantId, months);
    },

    cancelTenantSubscription(tenantId: string, reason?: string) {
      return platformSubscriptionService.cancelTenantSubscription(tenantId, reason);
    },

    suspendTenantSubscription(tenantId: string, reason?: string) {
      return platformSubscriptionService.suspendTenantSubscription(tenantId, reason);
    },

    resumeTenantSubscription(tenantId: string) {
      return platformSubscriptionService.resumeTenantSubscription(tenantId);
    },

    setSubscriptionAutoRenew(tenantId: string, autoRenew: boolean) {
      platformSubscriptionService.setSubscriptionAutoRenew(tenantId, autoRenew);
    },

    updateSubscriptionSeats(tenantId: string, seats: number, branchesLimit?: number) {
      platformSubscriptionService.updateSubscriptionSeats(tenantId, seats, branchesLimit);
    },

    listSubscriptionChanges(tenantId: string, limit = 50) {
      return platformSubscriptionService.listSubscriptionChanges(tenantId, limit);
    },

    // Coupon Management - Delegate to PlatformCouponService
    listCoupons() {
      return platformCouponService.listCoupons();
    },

    createCoupon(input: PlatformCouponInput) {
      return platformCouponService.createCoupon(input);
    },

    validateCoupon(code: string, subtotal: number) {
      return platformCouponService.validateCoupon(code, subtotal);
    },

    applyCoupon(code: string) {
      return platformCouponService.applyCoupon(code);
    },

    // Invoice & Payment Management - Delegate to PlatformInvoiceService
    listInvoices(search = '', status = '', tenantId = '') {
      return platformInvoiceService.listInvoices(search, status, tenantId);
    },

    getInvoice(id: string) {
      return platformInvoiceService.getInvoice(id);
    },

    createInvoice(input: PlatformInvoiceInput) {
      return platformInvoiceService.createInvoice(input);
    },

    setInvoiceStatus(id: string, status: PlatformInvoiceStatus) {
      platformInvoiceService.setInvoiceStatus(id, status);
    },

    voidInvoice(id: string) {
      platformInvoiceService.voidInvoice(id);
    },

    listPayments(limit = 200) {
      return platformInvoiceService.listPayments(limit);
    },

    addPayment(input: PlatformPaymentInput) {
      return platformInvoiceService.addPayment(input);
    },

    voidPayment(id: string, reason?: string) {
      platformInvoiceService.voidPayment(id, reason);
    },
  };
}
