// Unified data access for the subscriptions management page.
// Branches between the local platform DB (platformAdminService) and the
// central server (centralPlatformClient) exactly like the rest of /platform.
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';
import type {
  PlatformSubscription,
  PlatformSubscriptionCreateInput,
  PlatformTrialCreateInput,
  PlatformTenant,
  PlatformPlan,
  PlatformInvoice,
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

export interface SubscriptionListFilters {
  status?: string;
  planId?: string;
  search?: string;
}

export async function listSubscriptions(filters: SubscriptionListFilters = {}): Promise<PlatformSubscription[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listSubscriptions({
      status: filters.status || undefined,
      planId: filters.planId || undefined,
      search: filters.search || undefined,
    });
  }
  return platformAdminService.listSubscriptions({
    status: filters.status,
    planId: filters.planId,
    search: filters.search,
  });
}

export async function listPlans(): Promise<PlatformPlan[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listPlans();
  }
  return platformAdminService.listPlans();
}

export async function listTenants(search = ''): Promise<PlatformTenant[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listTenants(search);
  }
  return platformAdminService.listTenants(search);
}

export async function createSubscription(input: PlatformSubscriptionCreateInput): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.createSubscription(input);
  }
  return platformAdminService.createSubscription(input);
}

export async function createTrialSubscription(input: PlatformTrialCreateInput): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.createTrialSubscription(input);
  }
  return platformAdminService.createTrialSubscription(input);
}

export async function renewSubscription(tenantId: string, months: number): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.renewSubscription(tenantId, months);
  }
  platformAdminService.renewTenantSubscription(tenantId, months);
  return null;
}

export async function cancelSubscription(tenantId: string, reason?: string): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.cancelSubscription(tenantId, reason);
  }
  platformAdminService.cancelTenantSubscription(tenantId, reason);
  return null;
}

export async function changeSubscriptionPlan(
  tenantId: string,
  planId: string,
  options: { months?: number; seats?: number; reason?: string } = {}
): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.changeSubscriptionPlan(tenantId, planId, options);
  }
  return platformAdminService.changeTenantPlan(tenantId, planId, {
    months: options.months,
    seats: options.seats,
    reason: options.reason,
  });
}

export async function suspendSubscription(tenantId: string, reason?: string): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.suspendSubscription(tenantId, reason);
  }
  return platformAdminService.suspendTenantSubscription(tenantId, reason);
}

export async function resumeSubscription(tenantId: string): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.resumeSubscription(tenantId);
  }
  return platformAdminService.resumeTenantSubscription(tenantId);
}

export async function setSubscriptionAutoRenew(tenantId: string, autoRenew: boolean): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.updateSubscriptionSettings(tenantId, { autoRenew });
  }
  platformAdminService.setSubscriptionAutoRenew(tenantId, autoRenew);
  return null;
}

export async function updateSubscriptionSeats(
  tenantId: string,
  seats: number,
  branchesLimit?: number
): Promise<unknown> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.updateSubscriptionSettings(tenantId, { seats, branchesLimit });
  }
  platformAdminService.updateSubscriptionSeats(tenantId, seats, branchesLimit);
  return null;
}

export async function getSubscriptionHistory(tenantId: string, limit = 50): Promise<CentralSubscriptionChangeRow[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.getSubscriptionHistory(tenantId, limit);
  }
  const rows = platformAdminService.listSubscriptionChanges(tenantId, limit);
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    subscription_id: row.subscriptionId != null ? String(row.subscriptionId) : null,
    change_type: row.changeType != null ? String(row.changeType) : null,
    old_values: (row.oldValues ?? null) as CentralSubscriptionChangeRow['old_values'],
    new_values: (row.newValues ?? null) as CentralSubscriptionChangeRow['new_values'],
    actor_name: row.actorName != null ? String(row.actorName) : null,
    reason: row.reason != null ? String(row.reason) : null,
    created_at: row.createdAt != null ? String(row.createdAt) : null,
  }));
}

export async function listTenantInvoices(tenantId: string): Promise<PlatformInvoice[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listInvoices({ tenantId });
  }
  return platformAdminService.listInvoices('', '', tenantId);
}
