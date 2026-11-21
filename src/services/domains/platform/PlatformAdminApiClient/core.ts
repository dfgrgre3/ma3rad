// Core types, errors, row mappers and shared helpers for the Platform Admin API client.
import type {
  PlatformLicense,
  PlatformDevice,
  PlatformInvoice,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentMethod,
} from '../platformTypes';

export type CentralRequest = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Unified Central API response envelope (mirrors `central-server/lib/envelope.js`):
 * { success, data, error, message, code?, requestId, meta }
 */
export interface CentralApiEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  message: string | null;
  code?: string;
  requestId: string | null;
  meta: Record<string, unknown>;
}

export class CentralApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly envelope: CentralApiEnvelope | null;

  constructor(init: { status: number; envelope?: CentralApiEnvelope | null; message?: string }) {
    const envelope = init.envelope ?? null;
    const message =
      init.message ||
      (envelope && typeof envelope.error === 'string' && envelope.error) ||
      (envelope && typeof envelope.message === 'string' && envelope.message) ||
      'Central API request failed';
    super(message);
    this.name = 'CentralApiError';
    this.status = init.status;
    this.code = (envelope && typeof envelope.code === 'string' && envelope.code) || (init.status >= 500 ? 'CENTRAL_SERVER_ERROR' : 'CENTRAL_API_ERROR');
    this.requestId = envelope?.requestId ?? null;
    this.envelope = envelope;
  }
}

/** One row of the central tamper-evident audit chain. */
export interface PlatformAuditEvent {
  id: string;
  sequence: number | null;
  actorType: 'PLATFORM' | 'TENANT' | 'SYSTEM';
  actorId: string | null;
  actorName: string | null;
  tenantId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  beforeData: string | null;
  afterData: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  prevHash: string | null;
  recordHash: string | null;
  createdAt: string;
}

export interface PlatformAuditQuery {
  action?: string;
  actorId?: string;
  actorType?: string;
  tenantId?: string;
  resourceType?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface PlatformAuditPage {
  data: PlatformAuditEvent[];
  meta: { total: number; page: number; limit: number };
  requestId?: string;
}

export interface PlatformAuditVerification {
  isValid: boolean;
  checkedCount: number;
  lastSequence?: number;
  lastHash?: string;
  brokenAtId?: string;
  brokenAtSequence?: number;
  reason?: 'SEQUENCE_GAP' | 'PREV_HASH_MISMATCH' | 'RECORD_HASH_MISMATCH';
}

/** Tenant-scoped feature permission overrides persisted centrally. */
export interface TenantFeaturePermissions {
  hiddenMenus: string[];
  disabledPermissions: string[];
  featurePermissions: Array<Record<string, unknown>>;
}

/** Effective (layer-merged) feature config plus the tenant's own stored row. */
export interface EffectiveTenantFeaturePermissions {
  effective: TenantFeaturePermissions;
  tenant: TenantFeaturePermissions;
}

/** Per-tenant permission limit row (tenant_permission_limits). */
export interface TenantPermissionLimit {
  permissionCode: string;
  maxAmount?: number | null;
  costVisible?: number | null;
  profitVisible?: number | null;
  disabled?: number | boolean;
  updatedAt?: string;
}

export interface PlatformRoleSummary {
  code: string;
  name: string;
  description: string | null;
  isSystem: number | boolean;
}

export function safeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Map a central `platform_licenses` row (+ joined tenant/plan names) to the UI type. */
export function mapCentralLicense(row: Record<string, any>): PlatformLicense {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? row.tenantId ?? ''),
    tenantName: row.tenantName ?? row.tenant_name ?? undefined,
    subscriptionId: row.subscription_id ?? row.subscriptionId ?? null,
    planId: row.plan_id ?? row.planId ?? null,
    planName: row.planName ?? row.plan_name ?? null,
    licenseKey: String(row.license_key ?? row.licenseKey ?? ''),
    status: String(row.status ?? 'ACTIVE') as PlatformLicense['status'],
    issuedAt: String(row.issued_at ?? row.issuedAt ?? ''),
    startsAt: row.starts_at ?? row.startsAt ?? null,
    activatedAt: row.activated_at ?? row.activatedAt ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    seats: toNumber(row.seats, 1),
    deviceLimit: toNumber(row.device_limit ?? row.deviceLimit, 1),
    branchesLimit: toNumber(row.branches_limit ?? row.branchesLimit, 1),
    hardwareId: row.hardware_id ?? row.hardwareId ?? null,
    activationCode: row.activation_code ?? row.activationCode ?? null,
    certificate: row.certificate ?? null,
    transferCount: toNumber(row.transfer_count ?? row.transferCount, 0),
    modules: safeJsonArray(row.modules),
    features: safeJsonArray(row.features),
    offlineGracePeriodDays: row.offline_grace_period_days ?? row.offlineGracePeriodDays ?? null,
    couplingMode: (row.coupling_mode ?? row.couplingMode ?? 'FULL') as PlatformLicense['couplingMode'],
    notes: row.notes ?? null,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  };
}

/** Map a central `platform_devices` row to the UI type. */
export function mapCentralDevice(row: Record<string, any>): PlatformDevice {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? row.tenantId ?? ''),
    licenseId: row.license_id ?? row.licenseId ?? null,
    hardwareId: String(row.hardware_id ?? row.hardwareId ?? ''),
    name: row.name ?? null,
    os: row.os ?? null,
    appVersion: row.app_version ?? row.appVersion ?? null,
    ipAddress: row.ip_address ?? row.ipAddress ?? null,
    status: String(row.status ?? 'ACTIVE') as PlatformDevice['status'],
    firstActivatedAt: String(row.first_activated_at ?? row.firstActivatedAt ?? ''),
    lastSeenAt: row.last_seen_at ?? row.lastSeenAt ?? null,
    cloneSuspected: Boolean(row.clone_suspected ?? row.cloneSuspected),
    notes: row.notes ?? null,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  };
}

/** Map a central `platform_invoices` row to the UI type (amounts are major units). */
export function mapCentralInvoice(row: Record<string, any>): PlatformInvoice {
  return {
    id: String(row.id),
    number: String(row.number ?? row.id ?? ''),
    tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
    tenantName: row.tenantName ?? row.tenant_name ?? undefined,
    subscriptionId: row.subscriptionId ?? row.subscription_id ?? null,
    issueDate: String(row.issueDate ?? row.issue_date ?? ''),
    dueDate: row.dueDate ?? row.due_date ?? null,
    status: String(row.status ?? 'DRAFT') as PlatformInvoiceStatus,
    currency: String(row.currency ?? 'EGP'),
    subtotal: toNumber(row.subtotal, 0),
    discount: toNumber(row.discount, 0),
    tax: toNumber(row.tax, 0),
    total: toNumber(row.total, 0),
    paidAmount: toNumber(row.paidAmount ?? row.paid_amount, 0),
    notes: row.notes ?? null,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    items: Array.isArray(row.items)
      ? row.items.map((item: Record<string, any>) => ({
          id: item.id ? String(item.id) : undefined,
          description: String(item.description ?? ''),
          quantity: toNumber(item.quantity, 0),
          unitPrice: toNumber(item.unitPrice ?? item.unit_price, 0),
          total: item.total === undefined ? undefined : toNumber(item.total, 0),
        }))
      : undefined,
  };
}

/** Map a central `platform_payments` row to the UI type (amounts are major units). */
export function mapCentralPayment(row: Record<string, any>): PlatformPayment {
  return {
    id: String(row.id),
    invoiceId: row.invoiceId ?? row.invoice_id ?? null,
    invoiceNumber: row.invoiceNumber ?? row.invoice_number ?? null,
    tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
    tenantName: row.tenantName ?? row.tenant_name ?? undefined,
    amount: toNumber(row.amount, 0),
    method: String(row.method ?? 'CASH') as PlatformPaymentMethod,
    reference: row.reference ?? null,
    paidAt: String(row.paidAt ?? row.paid_at ?? ''),
    notes: row.notes ?? null,
  };
}

/**
 * The subset of `PlatformAdminApiClient` surface that domain method modules
 * need when invoked with `this` bound to a client instance. The concrete class
 * implements all of these members.
 */
export interface PlatformAdminApiCore {
  request<T>(req: CentralRequest): Promise<T>;
  requestEnvelope<T>(req: CentralRequest): Promise<CentralApiEnvelope<T>>;
  getAuthToken(): string | null;
  setAuthToken(token: string | null): void;
  clearAuthToken(): void;
  setBaseUrl(url: string | null): void;
  isAvailable(): boolean;
  getSettings(): Promise<Record<string, string>>;
  updateSettings(settings: Record<string, string>): Promise<Record<string, any>>;
  getPlatformPolicies(): Promise<{ terms: string; privacy: string; retention: Record<string, any>; updatedAt: string }>;
}
