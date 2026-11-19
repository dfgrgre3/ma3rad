import type {
  PlatformTenant,
  PlatformTenantStatus,
  PlatformTenantUser,
  PlatformPlan,
  PlatformSubscription,
  PlatformLicense,
  PlatformInvoice,
  PlatformPayment,
  PlatformAuditEntry,
} from '../platformTypes';
import { toNumber, safeJsonArray } from '../platformUtils';

export function mapTenantJoinedRow(row: any): PlatformTenant {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    contactName: row.contactName ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    businessType: row.businessType ?? null,
    status: row.status as PlatformTenantStatus,
    planId: row.planId ?? null,
    planName: row.planName ?? null,
    planPrice: row.planPrice ?? null,
    subscriptionStartedAt: row.subscription_started_at ?? null,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    seatsLimit: toNumber(row.seats_limit, 1),
    branchesLimit: toNumber(row.branches_limit, 1),
    devicesLimit: toNumber(row.devices_limit, 1),
    notes: row.notes ?? null,
    activeLicenses: toNumber(row.activeLicenses, 0),
    licensesTotal: toNumber(row.licensesTotal, 0),
    devicesUsed: toNumber(row.devicesUsed, 0),
    outstanding: toNumber(row.outstanding, 0),
    subscriptionId: row.subscription_id ?? null,
    price: row.price != null ? Number(row.price) / 100 : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapTenantBaseRow(row: any): PlatformTenant {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    contactName: row.contactName ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    businessType: row.businessType ?? null,
    status: row.status as PlatformTenantStatus,
    planId: row.plan_id ?? null,
    planName: null,
    planPrice: null,
    subscriptionStartedAt: row.subscription_started_at ?? null,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    seatsLimit: toNumber(row.seats_limit, 1),
    branchesLimit: toNumber(row.branches_limit, 1),
    devicesLimit: toNumber(row.devices_limit, 1),
    notes: row.notes ?? null,
    activeLicenses: 0,
    licensesTotal: 0,
    devicesUsed: 0,
    outstanding: 0,
    subscriptionId: row.subscription_id ?? null,
    price: row.price != null ? Number(row.price) / 100 : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapTenantUser(row: any): PlatformTenantUser {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    username: String(row.username),
    fullName: String(row.full_name),
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: String(row.role),
    status: row.status as 'ACTIVE' | 'SUSPENDED' | 'INVITED',
    isActive: row.status === 'ACTIVE',
    provisioningStatus: row.provisioning_status as any ?? 'NOT_REQUESTED',
    provisioningMode: row.provisioning_mode ?? null,
    identityUserId: row.identity_user_id ?? null,
    scope: row.scope ?? null,
    inviteExpiresAt: row.invite_expires_at ?? null,
    lastError: row.last_error ?? null,
    notes: row.notes ?? null,
    provisionedAt: row.provisioned_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapPlan(row: any): PlatformPlan {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ?? null,
    billingCycle: row.billing_cycle,
    price: toNumber(row.price, 0) / 100,
    monthlyPrice: toNumber(row.monthly_price, 0) / 100,
    yearlyPrice: toNumber(row.yearly_price, 0) / 100,
    currency: row.currency ?? 'EGP',
    seatsLimit: toNumber(row.seats_limit, 1),
    branchesLimit: toNumber(row.branches_limit, 1),
    devicesLimit: toNumber(row.devices_limit, 1),
    storageLimitMb: toNumber(row.storage_limit_mb, 500),
    maxProducts: toNumber(row.max_products, 1000),
    maxWarehouses: toNumber(row.max_warehouses, 2),
    trialDays: toNumber(row.trial_days, 14),
    includedModules: safeJsonArray(row.included_modules),
    features: safeJsonArray(row.features),
    permissions: safeJsonArray(row.permissions),
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    sortOrder: toNumber(row.sort_order, 0),
    subscriberCount: toNumber(row.subscriber_count, 0),
    offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
    versioned: Boolean(row.versioned),
    currentVersion: row.current_version ?? null,
  };
}

export function mapSubscription(row: any): PlatformSubscription {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    planId: String(row.plan_id),
    status: row.status,
    startDate: String(row.start_date),
    endDate: row.end_date ?? null,
    seats: toNumber(row.seats, 1),
    price: toNumber(row.price, 0) / 100,
    billingCycle: row.billing_cycle,
    autoRenew: Boolean(row.auto_renew),
    branchesLimit: toNumber(row.branches_limit, 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapLicense(row: any): PlatformLicense {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    subscriptionId: String(row.subscription_id),
    planId: String(row.plan_id),
    licenseKey: String(row.license_key),
    status: row.status,
    issuedAt: String(row.issued_at),
    startsAt: String(row.starts_at),
    expiresAt: row.expires_at ?? null,
    seats: toNumber(row.seats, 1),
    deviceLimit: toNumber(row.device_limit, 1),
    branchesLimit: toNumber(row.branches_limit, 1),
    modules: safeJsonArray(row.modules),
    features: safeJsonArray(row.features),
    activationCode: row.activation_code ?? null,
    certificate: row.certificate ?? null,
    offlineGracePeriodDays: toNumber(row.offline_grace_period_days, 14),
    couplingMode: row.coupling_mode,
    notes: row.notes ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapInvoice(row: any): PlatformInvoice {
  return {
    id: String(row.id),
    number: String(row.number ?? row.id),
    tenantId: String(row.tenant_id),
    subscriptionId: row.subscription_id ?? null,
    status: row.status,
    total: toNumber(row.total, 0) / 100,
    paidAmount: toNumber(row.paid_amount ?? row.paidAmount ?? row.paid, 0) / 100,
    currency: row.currency ?? 'EGP',
    dueDate: row.due_date ?? null,
    issueDate: String(row.issued_at),
    notes: row.notes ?? null,
    createdAt: String(row.created_at),
    subtotal: toNumber(row.subtotal, 0) / 100,
    discount: toNumber(row.discount, 0) / 100,
    tax: toNumber(row.tax, 0) / 100,
  };
}

export function mapPayment(row: any): PlatformPayment {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    invoiceId: row.invoice_id ?? null,
    amount: toNumber(row.amount, 0) / 100,
    method: row.method,
    reference: row.reference ?? null,
    paidAt: String(row.received_at),
    notes: row.notes ?? null,
  };
}

export function mapAuditEntry(row: any): PlatformAuditEntry {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    actorType: row.actor_type,
    action: String(row.action),
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    details: row.details ?? null,
    severity: row.severity,
    status: row.status,
    tenantId: row.tenant_id ?? null,
    deviceId: row.device_id ?? null,
    deviceName: row.device_name ?? null,
    ipAddress: row.ip_address ?? null,
    oldValues: row.old_values ?? null,
    newValues: row.new_values ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: String(row.created_at),
  };
}
