// Unified data access for the subscription plans page.
// Branches between the local platform DB (platformAdminService) and the
// central server (centralPlatformClient) exactly like subscriptionData.ts.
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';
import { safeJsonArray } from '../../../services/domains/platform/PlatformAdminApiClient/core';
import type {
  PlatformModule,
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanVersion,
  PlatformPriceHistoryEntry,
  PlatformPlanUpgradeRule,
  PlatformPlanUpgradeRuleInput,
  PlatformPlanImpactPreview,
  PlatformSubscription,
} from '../../../services/domains/platform/platformTypes';
import type { CentralSubscriptionChangeRow } from '../../../services/domains/platform/PlatformAdminApiClient/centralTypes';

export class CentralBridgeUnavailableError extends Error {
  constructor() {
    super('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
    this.name = 'CentralBridgeUnavailableError';
  }
}

function assertDataSource(): 'local' | 'central' {
  const central = getCentralDataSourceState();
  if (central.misconfigured) throw new CentralBridgeUnavailableError();
  return central.active ? 'central' : 'local';
}

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

/** Central plan rows arrive snake_case with prices in major units. */
export const normalizeCentralPlan = (row: any): PlatformPlan => ({
  id: String(row?.id ?? ''),
  code: String(row?.code ?? ''),
  name: String(row?.name ?? row?.code ?? ''),
  description: row?.description ?? null,
  billingCycle: String(row?.billing_cycle ?? row?.billingCycle ?? 'MONTHLY') as PlatformPlan['billingCycle'],
  price: num(row?.price),
  monthlyPrice: num(row?.monthly_price ?? row?.monthlyPrice),
  yearlyPrice: num(row?.yearly_price ?? row?.yearlyPrice ?? row?.price),
  currency: String(row?.currency ?? 'EGP'),
  seatsLimit: num(row?.seats_limit ?? row?.seatsLimit, 1),
  branchesLimit: num(row?.branches_limit ?? row?.branchesLimit, 1),
  devicesLimit: num(row?.devices_limit ?? row?.devicesLimit, 1),
  storageLimitMb: num(row?.storage_limit_mb ?? row?.storageLimitMb, 500),
  maxProducts: num(row?.max_products ?? row?.maxProducts, 1000),
  maxWarehouses: num(row?.max_warehouses ?? row?.maxWarehouses, 2),
  trialDays: num(row?.trial_days ?? row?.trialDays, 14),
  includedModules: safeJsonArray(row?.included_modules ?? row?.includedModules),
  features: safeJsonArray(row?.features),
  permissions: safeJsonArray(row?.permissions),
  isActive: bool(row?.is_active ?? row?.isActive),
  isDefault: bool(row?.is_default ?? row?.isDefault),
  sortOrder: num(row?.sort_order ?? row?.sortOrder),
  subscriberCount: num(row?.subscriber_count ?? row?.subscriberCount),
  offlineGracePeriodDays: num(row?.offline_grace_period_days ?? row?.offlineGracePeriodDays, 14),
  versioned: bool(row?.versioned),
  currentVersion: row?.current_version ?? row?.currentVersion ?? null,
});

export const normalizeCentralModule = (row: any): PlatformModule => ({
  id: String(row?.id ?? row?.code ?? ''),
  code: String(row?.code ?? row?.id ?? ''),
  name: String(row?.name ?? row?.code ?? ''),
  description: row?.description ?? null,
  category: row?.category ?? null,
  isEnabled: bool(row?.isEnabled ?? row?.is_enabled ?? row?.isActive ?? row?.is_active ?? true),
  minPlanCode: row?.minPlanCode ?? row?.min_plan_code ?? null,
  sortOrder: num(row?.sortOrder ?? row?.sort_order),
  isActive: bool(row?.isActive ?? row?.is_active ?? true),
  createdAt: String(row?.createdAt ?? row?.created_at ?? ''),
  updatedAt: String(row?.updatedAt ?? row?.updated_at ?? ''),
});

export interface PlanSubscriber {
  id: string;
  tenantId: string;
  tenantName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  seats: number;
  price: number;
  billingCycle: string;
  autoRenew: boolean;
  branchesLimit: number;
  createdAt: string | null;
}

const normalizeSubscriber = (row: any): PlanSubscriber => ({
  id: String(row?.id ?? ''),
  tenantId: String(row?.tenantId ?? row?.tenant_id ?? ''),
  tenantName: row?.tenantName ?? row?.tenant_name ?? null,
  status: String(row?.status ?? ''),
  startDate: row?.startDate ?? row?.start_date ?? null,
  endDate: row?.endDate ?? row?.end_date ?? null,
  seats: num(row?.seats, 1),
  price: num(row?.price),
  billingCycle: String(row?.billingCycle ?? row?.billing_cycle ?? ''),
  autoRenew: bool(row?.autoRenew ?? row?.auto_renew),
  branchesLimit: num(row?.branchesLimit ?? row?.branches_limit, 1),
  createdAt: row?.createdAt ?? row?.created_at ?? null,
});

export async function listPlans(): Promise<PlatformPlan[]> {
  if (assertDataSource() === 'central') {
    const rows = await centralPlatformClient.listPlans();
    return (Array.isArray(rows) ? rows : []).map(normalizeCentralPlan);
  }
  return platformAdminService.listPlans();
}

export async function getPlan(id: string): Promise<PlatformPlan | null> {
  if (assertDataSource() === 'central') {
    const row = await centralPlatformClient.getPlan(id);
    return row ? normalizeCentralPlan(row) : null;
  }
  return platformAdminService.listPlans().find((plan) => plan.id === id) ?? null;
}

export async function listModules(): Promise<PlatformModule[]> {
  if (assertDataSource() === 'central') {
    const rows = await centralPlatformClient.listModules();
    return (Array.isArray(rows) ? rows : []).map(normalizeCentralModule);
  }
  return platformAdminService.listModules();
}

export async function createPlan(input: PlatformPlanInput): Promise<PlatformPlan> {
  if (assertDataSource() === 'central') {
    const row = await centralPlatformClient.createPlan(input as Record<string, any>);
    return normalizeCentralPlan(row);
  }
  return platformAdminService.createPlan(input);
}

export async function updatePlan(id: string, input: PlatformPlanInput): Promise<PlatformPlan> {
  if (assertDataSource() === 'central') {
    const row = await centralPlatformClient.updatePlan(id, input as Record<string, any>);
    return normalizeCentralPlan(row);
  }
  return platformAdminService.updatePlan(id, input);
}

export async function setPlanActive(id: string, active: boolean): Promise<void> {
  if (assertDataSource() === 'central') {
    const plan = await getPlan(id);
    if (!plan) throw new Error('الخطة غير موجودة.');
    const { id: _id, subscriberCount: _sc, currentVersion: _cv, versioned: _v, ...rest } = plan;
    await centralPlatformClient.updatePlan(id, { ...rest, isActive: active } as Record<string, any>);
    return;
  }
  platformAdminService.setPlanActive(id, active);
}

export async function deletePlan(id: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.deletePlan(id);
    return;
  }
  platformAdminService.deletePlan(id);
}

export async function listPlanVersions(planId: string): Promise<PlatformPlanVersion[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listPlanVersions(planId);
  }
  return platformAdminService.listPlanVersions(planId);
}

export async function listPriceHistory(planId: string): Promise<PlatformPriceHistoryEntry[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listPlanPriceHistory(planId);
  }
  return platformAdminService.listPriceHistory(planId);
}

export async function listPlanSubscribers(planId: string): Promise<PlanSubscriber[]> {
  if (assertDataSource() === 'central') {
    const rows = await centralPlatformClient.listPlanSubscribers(planId);
    return (Array.isArray(rows) ? rows : []).map(normalizeSubscriber);
  }
  const subs = platformAdminService.listSubscriptions({ planId });
  return subs.map((sub: PlatformSubscription) => normalizeSubscriber({
    id: sub.id,
    tenant_id: sub.tenantId,
    tenant_name: sub.tenantName ?? null,
    status: sub.status,
    start_date: sub.startDate,
    end_date: sub.endDate ?? null,
    seats: sub.seats,
    price: sub.price,
    billing_cycle: sub.billingCycle,
    auto_renew: sub.autoRenew,
    branches_limit: sub.branchesLimit,
    created_at: sub.createdAt,
  }));
}

export async function copyPlan(
  id: string,
  input: { code: string; name: string; effectiveFrom?: string }
): Promise<{ plan: PlatformPlan; copiedRules: number }> {
  if (assertDataSource() === 'central') {
    const result = await centralPlatformClient.copyPlan(id, input);
    return { plan: normalizeCentralPlan(result?.plan), copiedRules: num(result?.copiedRules) };
  }
  const result = platformAdminService.copyPlan(id, input.code, input.name, input.effectiveFrom);
  return { plan: result.plan, copiedRules: result.copiedRules };
}

export async function listUpgradeRules(): Promise<PlatformPlanUpgradeRule[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listPlanUpgradeRules();
  }
  return platformAdminService.listPlanUpgradeRules();
}

export async function upsertUpgradeRule(input: PlatformPlanUpgradeRuleInput): Promise<PlatformPlanUpgradeRule> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.upsertPlanUpgradeRule(input);
  }
  return platformAdminService.setPlanUpgradeRule(input);
}

export async function previewPlanImpact(
  planId: string,
  input: Partial<PlatformPlanInput>
): Promise<PlatformPlanImpactPreview> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.previewPlanImpact(planId, input);
  }
  return platformAdminService.previewPlanChangeImpact(planId, input as PlatformPlanInput);
}

export async function getPlanDeactivationCheck(
  planId: string
): Promise<{ canDeactivate: boolean; activeSubscriptions: number; message: string }> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.getPlanDeactivationCheck(planId);
  }
  return platformAdminService.validatePlanDeactivation(planId);
}

// Re-export for callers that need the raw subscription change history type.
export type { CentralSubscriptionChangeRow };
