// Adapter connecting Super Admin operations to the central server via the Electron bridge (electron/centralApi.js).
import type {
  PlatformTenant,
  PlatformPlan,
  PlatformTenantInput,
  CentralLicenseIssueRequest,
  CentralLicenseIssueResponse,
  PlatformLicense,
  PlatformDevice,
  PlatformSubscription,
  PlatformInvoice,
  PlatformInvoiceInput,
  PlatformInvoiceStatus,
  PlatformPayment,
  PlatformPaymentInput,
  PlatformPaymentMethod,
} from './platformTypes';

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

export interface PlatformRoleSummary {
  code: string;
  name: string;
  description: string | null;
  isSystem: number | boolean;
}

function safeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Map a central `platform_licenses` row (+ joined tenant/plan names) to the UI type. */
export function mapCentralLicense(row: any): PlatformLicense {
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
export function mapCentralDevice(row: any): PlatformDevice {
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
export function mapCentralInvoice(row: any): PlatformInvoice {
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
      ? row.items.map((item: any) => ({
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
export function mapCentralPayment(row: any): PlatformPayment {
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

export class PlatformAdminApiClient {
  private baseUrl: string | null = null;
  private authToken: string | null = null;

  setBaseUrl(url: string | null): void {
    this.baseUrl = url;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
    if (token) {
      try {
        localStorage.setItem('ceramisys_central_admin_token', token);
      } catch {
        // ignore localStorage errors
      }
    } else {
      this.clearAuthToken();
    }
  }

  clearAuthToken(): void {
    this.authToken = null;
    try {
      localStorage.removeItem('ceramisys_central_admin_token');
    } catch {
      // ignore
    }
  }

  getAuthToken(): string | null {
    if (!this.authToken) {
      try {
        this.authToken = localStorage.getItem('ceramisys_central_admin_token');
      } catch {
        this.authToken = null;
      }
    }
    return this.authToken;
  }

  public isAvailable(): boolean {
    return Boolean((window as any)?.ceramisys?.central?.request);
  }

  private async requestEnvelope<T>(req: CentralRequest): Promise<CentralApiEnvelope<T>> {
    const bridge = (window as any)?.ceramisys?.central;
    if (!bridge?.request) {
      throw new Error('بوابة الاتصال بالسيرفر المركزي غير متاحة في هذا الإصدار.');
    }

    const headers: Record<string, string> = {
      ...(req.headers || {}),
    };

    const token = this.getAuthToken();
    if (token && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await bridge.request({
      path: req.path,
      method: req.method,
      body: req.body ? JSON.stringify(req.body) : undefined,
      headers,
    });

    const status = Number(res?.status ?? (res?.ok ? 200 : 0));
    const envelope = (res?.body ?? null) as CentralApiEnvelope<T> | null;

    if (!res || res.ok === false || envelope?.success === false) {
      const error = envelope?.error || (status >= 500 ? 'فشل الخدمة المركزية.' : 'فشل الطلب عبر الخدمة المركزية.');
      const apiError = new CentralApiError({
        status,
        envelope: envelope ?? null,
        message: envelope?.message || error,
      });
      // An expired/invalid session must not be retried silently with a stale token.
      if (status === 401) {
        this.clearAuthToken();
      }
      throw apiError;
    }

    return (
      envelope ?? ({ success: true, data: null, error: null, message: null, requestId: null, meta: {} } as CentralApiEnvelope<T>)
    );
  }

  private async request<T>(req: CentralRequest): Promise<T> {
    const envelope = await this.requestEnvelope<T>(req);
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data ?? null) as T;
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; admin: any }> {
    const envelope = await this.requestEnvelope<{ token: string; admin: any }>({
      path: '/api/v1/admin/auth/login',
      method: 'POST',
      body: { username, password },
    });
    if (!envelope.success || !envelope.data?.token) {
      throw new CentralApiError({ status: 0, envelope });
    }
    this.setAuthToken(envelope.data.token);
    return envelope.data;
  }

  async getCurrentAdmin(): Promise<{ admin: any }> {
    const envelope = await this.requestEnvelope<{ admin: any }>({ path: '/api/v1/admin/auth/me', method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return envelope.data as { admin: any };
  }

  // Tenants
  async listTenants(search = '', status = '', planId = ''): Promise<PlatformTenant[]> {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (status) params.status = status;
    if (planId) params.planId = planId;
    const q = new URLSearchParams(params).toString();
    const queryPart = q ? `?${q}` : '';
    return this.request<PlatformTenant[]>({ path: `/api/v1/admin/tenants${queryPart}`, method: 'GET' });
  }

  async createTenant(input: PlatformTenantInput): Promise<PlatformTenant> {
    return this.request<PlatformTenant>({
      path: '/api/v1/admin/tenants',
      method: 'POST',
      body: input,
    });
  }

  // Plans
  async listPlans(): Promise<PlatformPlan[]> {
    return this.request<PlatformPlan[]>({ path: '/api/v1/admin/plans', method: 'GET' });
  }

  // Licenses
  async renewLicense(licenseId: string, months: number): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/renew`,
      method: 'POST',
      body: { months },
    });
  }

  async suspendLicense(licenseId: string, reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/suspend`,
      method: 'POST',
      body: { reason },
    });
  }

  async revokeLicense(licenseId: string, reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/revoke`,
      method: 'POST',
      body: { reason },
    });
  }

  /**
   * Issue a new license via central server (Ed25519 signed).
   * This is the production path - local issuance is dev-only.
   */
  async issueLicense(input: CentralLicenseIssueRequest): Promise<CentralLicenseIssueResponse> {
    return this.request<CentralLicenseIssueResponse>({
      path: '/api/v1/admin/licenses/issue',
      method: 'POST',
      body: input,
    });
  }

  // Staff
  async listStaff(): Promise<any[]> {
    return this.request<any[]>({ path: '/api/v1/admin/staff', method: 'GET' });
  }

  async createStaff(input: any): Promise<any> {
    return this.request<any>({
      path: '/api/v1/admin/staff',
      method: 'POST',
      body: input,
    });
  }

  // Roles & permission catalog
  async listRoles(): Promise<PlatformRoleSummary[]> {
    const envelope = await this.requestEnvelope<PlatformRoleSummary[]>({ path: '/api/v1/admin/roles',
      method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as PlatformRoleSummary[]) || [];
  }

  async getRolePermissions(roleCode: string): Promise<string[]> {
    const envelope = await this.requestEnvelope<string[]>({
      path: `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as string[]) || [];
  }

  async getPermissionCatalog(): Promise<{
    sections: unknown[];
    pages: unknown[];
    permissions: unknown[];
    roles: Array<PlatformRoleSummary & { permissions: string[] }>;
  }> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/permissions/catalog',
      method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data ?? {}) as any;
  }

  // Audit center
  async listAuditEvents(query: PlatformAuditQuery = {}): Promise<PlatformAuditPage> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    }
    const qs = new URLSearchParams(params).toString();
    const envelope = await this.requestEnvelope<PlatformAuditEvent[]>({
      path: `/api/v1/admin/audit${qs ? `?${qs}` : ''}`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as PlatformAuditEvent[]) || [];
    const meta = (envelope.meta as { total: number; page: number; limit: number }) || { total: data.length, page: 1, limit: 50 };
    return { data, meta, requestId: envelope.requestId || undefined };
  }

  async getAuditEvent(id: string): Promise<PlatformAuditEvent> {
    const envelope = await this.requestEnvelope<PlatformAuditEvent>({
      path: `/api/v1/admin/audit/${encodeURIComponent(id)}`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as PlatformAuditEvent) || ({} as PlatformAuditEvent);
  }

  async verifyAuditChain(fromSequence = 1): Promise<PlatformAuditVerification> {
    const envelope = await this.requestEnvelope<PlatformAuditVerification>({
      path: `/api/v1/admin/audit/verify?fromSequence=${encodeURIComponent(String(fromSequence))}`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as PlatformAuditVerification) || ({} as PlatformAuditVerification);
  }

  // Tenant-scoped feature permission overrides (central persistence).
  async getFeaturePermissions(scope: { tenantId: string | null; planId: string | null }): Promise<TenantFeaturePermissions> {
    const params = new URLSearchParams();
    if (scope.tenantId) params.set('tenantId', scope.tenantId);
    if (scope.planId) params.set('planId', scope.planId);
    const qs = params.toString();
    const envelope = await this.requestEnvelope<TenantFeaturePermissions>({
      path: `/api/v1/admin/config/feature-permissions${qs ? `?${qs}` : ''}`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as TenantFeaturePermissions) || { hiddenMenus: [], disabledPermissions: [], featurePermissions: [] };
    return {
      hiddenMenus: Array.isArray(data.hiddenMenus) ? data.hiddenMenus.map(String) : [],
      disabledPermissions: Array.isArray(data.disabledPermissions) ? data.disabledPermissions.map(String) : [],
      featurePermissions: Array.isArray(data.featurePermissions) ? data.featurePermissions : [],
    };
  }

  async setFeaturePermissions(input: {
    tenantId?: string | null;
    planId?: string | null;
    hiddenMenus?: string[];
    disabledPermissions?: string[];
    featurePermissions?: Array<Record<string, unknown>>;
  }): Promise<void> {
    const envelope = await this.requestEnvelope<{ ok: boolean }>({
      path: '/api/v1/admin/config/feature-permissions',
      method: 'PUT',
      body: {
        tenantId: input.tenantId ?? null,
        planId: input.planId ?? null,
        hiddenMenus: input.hiddenMenus ?? [],
        disabledPermissions: input.disabledPermissions ?? [],
        featurePermissions: input.featurePermissions ?? [],
      },
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
  }

  // ── Webhooks / Integrations ────────────────────────────────────────────────

  async listWebhooks(): Promise<Array<{
    id: string; name: string; url: string; events: string[]; secret: string;
    isActive: boolean; createdAt: string; updatedAt: string;
  }>> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/integrations/webhooks', method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    return rows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      events: safeJsonArray(row.events),
      secret: String(row.secret || ''),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at || row.createdAt || ''),
      updatedAt: String(row.updated_at || row.updatedAt || ''),
    }));
  }

  async createWebhook(input: { name: string; url: string; events?: string[]; secret?: string; isActive?: boolean }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/integrations/webhooks',
      method: 'POST',
      body: { name: input.name, url: input.url, events: input.events || [], secret: input.secret || null, isActive: input.isActive !== false },
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return envelope.data;
  }

  async updateWebhook(id: string, input: { name?: string; url?: string; events?: string[]; secret?: string; isActive?: boolean }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: { name: input.name, url: input.url, events: input.events, secret: input.secret, isActive: input.isActive },
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return envelope.data;
  }

  async deleteWebhook(id: string): Promise<void> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}`, method: 'DELETE' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
  }

  async listCentralSigningKeys(): Promise<{ keys: Array<{ id: string; keyId: string; isActive: boolean; createdAt: string; expiresAt: string | null }>; currentKeyId: string | null }> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/signing-keys', method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as any) || {};
    return {
      keys: Array.isArray(data.keys) ? data.keys : [],
      currentKeyId: data.currentKeyId ?? null,
    };
  }

  async rotateCentralSigningKey(): Promise<{ keyId: string; currentKeyId: string | null }> {
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/security/signing-keys/rotate',
      method: 'POST',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as any) || {};
    return { keyId: String(data.keyId || ''), currentKeyId: data.currentKeyId ?? null };
  }

  async testWebhook(id: string): Promise<{ webhookId: string; url: string; status: string; httpStatus?: number | null; error?: string | null; sentAt: string }> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/integrations/webhooks/${encodeURIComponent(id)}/test`,
      method: 'POST',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as any) || {};
    return {
      webhookId: String(data.webhookId || id),
      url: String(data.url || ''),
      status: String(data.status || 'FAILED'),
      httpStatus: data.httpStatus ?? null,
      error: data.error ?? null,
      sentAt: String(data.sentAt || new Date().toISOString()),
    };
  }

  // Notifications: delivery history, templates and real send.
  async listNotifications(params?: {
    tenantId?: string | null;
    status?: string | null;
    page?: number;
    limit?: number;
  }): Promise<{ notifications: any[]; deliveries: any[]; meta: Record<string, unknown> }> {
    const qs = new URLSearchParams();
    if (params?.tenantId) qs.set('tenantId', params.tenantId);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const envelope = await this.requestEnvelope<{ notifications: any[]; deliveries: any[]; meta: Record<string, unknown> }>({
      path: `/api/v1/admin/notifications${qs.toString() ? `?${qs.toString()}` : ''}`,
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return {
      notifications: (envelope.data?.notifications as any[]) || [],
      deliveries: (envelope.data?.deliveries as any[]) || [],
      meta: (envelope.data?.meta as Record<string, unknown>) || {},
    };
  }

  async sendNotification(input: {
    tenantId?: string | null;
    audience?: string;
    channel?: 'EMAIL' | 'SMS' | 'IN_APP';
    templateId?: string | null;
    subject: string;
    message: string;
  }): Promise<{ notification: any; deliveries: any[] }> {
    const envelope = await this.requestEnvelope<{ notification: any; deliveries: any[] }>({
      path: '/api/v1/admin/notifications',
      method: 'POST',
      body: {
        tenantId: input.tenantId ?? null,
        audience: input.audience ?? 'ALL',
        channel: input.channel ?? 'IN_APP',
        templateId: input.templateId ?? null,
        subject: input.subject,
        message: input.message,
      },
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as { notification: any; deliveries: any[] } | null) || { notification: null, deliveries: [] };
    return { notification: data.notification, deliveries: data.deliveries || [] };
  }

  async listNotificationTemplates(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/notifications/templates',
      method: 'GET' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as any[]) || [];
  }

  // ── Roles & permissions ────────────────────────────────────────────────────

  /** Replace a role's granted permission codes (SUPER_ADMIN is immutable server-side). */
  async updateRolePermissions(roleCode: string, permissions: string[]): Promise<{ roleCode: string; permissions: string[] }> {
    const envelope = await this.requestEnvelope<{ roleCode: string; permissions: string[] }>({
      path: `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
      method: 'PUT',
      body: { permissions },
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as { roleCode: string; permissions: string[] }) || { roleCode, permissions };
  }

  // ── Licenses ───────────────────────────────────────────────────────────────

  async listLicenses(search = '', status = ''): Promise<PlatformLicense[]> {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (status) params.status = status;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/licenses${qs ? `?${qs}` : ''}`, method: 'GET' });
    return (Array.isArray(rows) ? rows : []).map(mapCentralLicense);
  }

  async reactivateLicense(licenseId: string, reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/reactivate`,
      method: 'POST',
      body: { reason },
    });
  }

  /** Bind/move a license to a hardware id (central transfer endpoint). */
  async transferLicense(licenseId: string, newHardwareId: string, reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/transfer`,
      method: 'POST',
      body: { newHardwareId, reason },
    });
  }

  // ── Devices ────────────────────────────────────────────────────────────────

  async listDevices(query: { tenantId?: string; status?: string } = {}): Promise<PlatformDevice[]> {
    const params: Record<string, string> = {};
    if (query.tenantId) params.tenantId = query.tenantId;
    if (query.status) params.status = query.status;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/devices${qs ? `?${qs}` : ''}`, method: 'GET' });
    return (Array.isArray(rows) ? rows : []).map(mapCentralDevice);
  }

  private async deviceAction(id: string, action: 'suspend' | 'release' | 'revoke', reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/devices/${encodeURIComponent(id)}/${action}`,
      method: 'POST',
      body: { reason },
    });
  }

  suspendDevice(deviceId: string, reason?: string): Promise<any> {
    return this.deviceAction(deviceId, 'suspend', reason);
  }

  releaseDevice(deviceId: string, reason?: string): Promise<any> {
    return this.deviceAction(deviceId, 'release', reason);
  }

  revokeDevice(deviceId: string, reason?: string): Promise<any> {
    return this.deviceAction(deviceId, 'revoke', reason);
  }

  async updateTenant(id: string, payload: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: payload,
    });
  }

  async setTenantStatus(id: string, status: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/status`,
      method: 'POST',
      body: { status },
    });
  }

  async archiveTenant(id: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/archive`,
      method: 'POST',
    });
  }

  async getTenantProfile(id: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/profile`,
      method: 'GET',
    });
  }

  async createTenantAccount(
    id: string,
    input: { username?: string; email?: string; fullName?: string; password?: string } = {}
  ): Promise<{ account: any; temporaryPassword: string; activationCode: string }> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account`,
      method: 'POST',
      body: input,
    });
  }

  async resetTenantAccountPassword(id: string): Promise<{ temporaryPassword: string }> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/reset-password`,
      method: 'POST',
    });
  }

  async setTenantAccountActive(id: string, isActive: boolean): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(id)}/account/status`,
      method: 'POST',
      body: { isActive },
    });
  }

  // ── Tenant directory users ────────────────────────────────────────────────

  async listTenantUsers(tenantId: string): Promise<any[]> {
    const rows = await this.request<any[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async createTenantUser(tenantId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users`,
      method: 'POST',
      body: input,
    });
  }

  async updateTenantUser(tenantId: string, userId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
      method: 'PUT',
      body: input,
    });
  }

  async deleteTenantUser(tenantId: string, userId: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
      method: 'DELETE',
    });
  }

  async setTenantUserActive(tenantId: string, userId: string, isActive: boolean): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/status`,
      method: 'POST',
      body: { isActive },
    });
  }

  async resendTenantUserInvite(tenantId: string, userId: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/resend-invite`,
      method: 'POST',
    });
  }

  // ── Tenant overrides ─────────────────────────────────────────────────────

  async listTenantOverrides(tenantId: string): Promise<any[]> {
    const rows = await this.request<any[]>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async addTenantOverride(tenantId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides`,
      method: 'POST',
      body: input,
    });
  }

  async removeTenantOverride(tenantId: string, overrideId: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/overrides/${encodeURIComponent(overrideId)}`,
      method: 'DELETE',
    });
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async recordTenantPayment(tenantId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/payments`,
      method: 'POST',
      body: input,
    });
  }

  // ── Remote control ────────────────────────────────────────────────────────

  async getTenantRemoteControl(tenantId: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote`, method: 'GET' });
  }

  async pushTenantConfig(tenantId: string, input: { key: string; value: any; scope?: string; targetDeviceIds?: string[] }): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/config`,
      method: 'POST',
      body: input,
    });
  }

  async forceTenantSync(tenantId: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/remote/sync`,
      method: 'POST',
    });
  }

  // ── Tenant branches ────────────────────────────────────────────────────────

  async listTenantBranches(tenantId: string): Promise<any[]> {
    const rows = await this.request<any[]>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
      method: 'GET',
    });
    return Array.isArray(rows) ? rows : [];
  }

  async createTenantBranch(tenantId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches`,
      method: 'POST',
      body: input,
    });
  }

  async updateTenantBranch(tenantId: string, branchId: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
      method: 'PUT',
      body: input,
    });
  }

  async closeTenantBranch(tenantId: string, branchId: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/branches/${encodeURIComponent(branchId)}`,
      method: 'DELETE',
    });
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async listSubscriptions(filters: { status?: string; planId?: string; search?: string } = {}): Promise<PlatformSubscription[]> {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.planId) params.planId = filters.planId;
    if (filters.search) params.search = filters.search;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/subscriptions${qs ? `?${qs}` : ''}`, method: 'GET' });
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: String(row.id),
      tenantId: String(row.tenantId ?? row.tenant_id),
      tenantName: row.tenantName ?? row.tenant_name ?? null,
      planId: String(row.planId ?? row.plan_id),
      planName: row.planName ?? row.plan_name ?? null,
      status: String(row.status) as PlatformSubscription['status'],
      startDate: String(row.startDate ?? row.start_date),
      endDate: row.endDate ?? row.end_date ?? null,
      seats: toNumber(row.seats, 1),
      price: toNumber(row.price, 0) / 100,
      discount: toNumber(row.discount, 0) / 100,
      billingCycle: String(row.billingCycle ?? row.billing_cycle) as PlatformSubscription['billingCycle'],
      autoRenew: Boolean(row.autoRenew ?? row.auto_renew),
      branchesLimit: toNumber(row.branchesLimit ?? row.branches_limit, 1),
      createdAt: String(row.createdAt ?? row.created_at ?? ''),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
    }));
  }

  async renewSubscription(tenantId: string, months: number): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/renew`,
      method: 'POST',
      body: { months },
    });
  }

  async cancelSubscription(tenantId: string, reason?: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/cancel`,
      method: 'POST',
      body: { reason },
    });
  }

  async changeSubscriptionPlan(
    tenantId: string,
    planId: string,
    options: { months?: number; seats?: number; reason?: string } = {}
  ): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/subscriptions/${encodeURIComponent(tenantId)}/change-plan`,
      method: 'POST',
      body: { planId, months: options.months, seats: options.seats, reason: options.reason },
    });
  }

  // ── Backups ────────────────────────────────────────────────────────────────

  async listBackups(filters: { tenantId?: string; status?: string; type?: string; q?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.status) params.status = filters.status;
    if (filters.type) params.type = filters.type;
    if (filters.q) params.q = filters.q;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/backups${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async createBackup(input: { tenantId?: string | null; name?: string; type?: string; notes?: string; triggerSource?: string }): Promise<any> {
    return this.request<any>({ path: '/api/v1/admin/backups', method: 'POST', body: input });
  }

  async getBackup(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/backups/${encodeURIComponent(id)}`, method: 'GET' });
  }

  /** Downloads the raw backup artifact (a JSON document, not an API envelope). */
  async downloadBackupArtifact(id: string): Promise<any> {
    const bridge = (window as any)?.ceramisys?.central;
    if (!bridge?.request) {
      throw new Error('بوابة الاتصال بالسيرفر المركزي غير متاحة في هذا الإصدار.');
    }
    const headers: Record<string, string> = {};
    const token = this.getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await bridge.request({
      path: `/api/v1/admin/backups/${encodeURIComponent(id)}/download`,
      method: 'GET',
      headers,
    });
    if (!res?.ok) {
      const message = res?.body?.error || res?.body?.message || `فشل تنزيل النسخة (${res?.status ?? '؟'})`;
      throw new Error(message);
    }
    return res.body;
  }

  async restoreBackup(id: string, notes = ''): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/backups/${encodeURIComponent(id)}/restore`,
      method: 'POST',
      body: { notes },
    });
  }

  // ── Application (ERP) backups — opaque encrypted device snapshots ──────────

  async listAppBackups(filters: { tenantId?: string; status?: string; restoreStatus?: string; q?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.status) params.status = filters.status;
    if (filters.restoreStatus) params.restoreStatus = filters.restoreStatus;
    if (filters.q) params.q = filters.q;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/app-backups${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async getAppBackup(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}`, method: 'GET' });
  }

  async requestAppBackupRestore(id: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}/restore`,
      method: 'POST',
      body: {},
    });
  }

  async cancelAppBackupRestore(id: string): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}/restore/cancel`,
      method: 'POST',
      body: {},
    });
  }

  async listBackupRestores(filters: { tenantId?: string; status?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.status) params.status = filters.status;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/backups/restores${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  // ── Operations jobs & usage ────────────────────────────────────────────────

  async listOpsJobs(filters: { status?: string; type?: string; tenantId?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.type) params.type = filters.type;
    if (filters.tenantId) params.tenantId = filters.tenantId;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/operations/jobs${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async createOpsJob(input: { tenantId?: string | null; type: string; payload?: any; runAt?: string | null }): Promise<any> {
    return this.request<any>({ path: '/api/v1/admin/operations/jobs', method: 'POST', body: input });
  }

  async cancelOpsJob(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/operations/jobs/${encodeURIComponent(id)}/cancel`, method: 'POST' });
  }

  async retryOpsJob(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/operations/jobs/${encodeURIComponent(id)}/retry`, method: 'POST' });
  }

  async listTenantUsage(filters: { status?: string; planId?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.planId) params.planId = filters.planId;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/operations/usage${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async getTenantUsageDetail(tenantId: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/operations/usage/${encodeURIComponent(tenantId)}`, method: 'GET' });
  }

  // ── Support tickets ────────────────────────────────────────────────────────

  async listSupportTickets(filters: { tenantId?: string; status?: string; priority?: string; category?: string; q?: string; assigneeId?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.category) params.category = filters.category;
    if (filters.q) params.q = filters.q;
    if (filters.assigneeId) params.assigneeId = filters.assigneeId;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/support${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async createSupportTicket(input: Record<string, any>): Promise<any> {
    return this.request<any>({ path: '/api/v1/admin/support', method: 'POST', body: input });
  }

  async getSupportTicket(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'GET' });
  }

  async updateSupportTicket(id: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'PUT', body: input });
  }

  async addSupportTicketMessage(id: string, body: string, internal = false): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/support/${encodeURIComponent(id)}/messages`,
      method: 'POST',
      body: { body, internal },
    });
  }

  async deleteSupportTicket(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/support/${encodeURIComponent(id)}`, method: 'DELETE' });
  }

  // ── Error monitoring ───────────────────────────────────────────────────────

  async listErrorReports(filters: { status?: string; severity?: string; tenantId?: string; q?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.q) params.q = filters.q;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/monitoring/errors${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async getErrorReportsSummary(): Promise<any> {
    return this.request<any>({ path: '/api/v1/admin/monitoring/errors/summary', method: 'GET' });
  }

  async setErrorReportStatus(id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen'): Promise<any> {
    return this.request<any>({
      path: `/api/v1/admin/monitoring/errors/${encodeURIComponent(id)}/${action}`,
      method: 'POST',
    });
  }

  // ── Releases & phased rollout ──────────────────────────────────────────────

  async listReleases(filters: { status?: string; channel?: string; q?: string } = {}): Promise<any[]> {
    const params: Record<string, string> = {};
    if (filters.status) params.status = filters.status;
    if (filters.channel) params.channel = filters.channel;
    if (filters.q) params.q = filters.q;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({ path: `/api/v1/admin/releases${qs ? `?${qs}` : ''}`, method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  async createRelease(input: Record<string, any>): Promise<any> {
    return this.request<any>({ path: '/api/v1/admin/releases', method: 'POST', body: input });
  }

  async updateRelease(id: string, input: Record<string, any>): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}`, method: 'PUT', body: input });
  }

  async publishRelease(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}/publish`, method: 'POST' });
  }

  async rollbackRelease(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}/rollback`, method: 'POST' });
  }

  async deleteRelease(id: string): Promise<any> {
    return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}`, method: 'DELETE' });
  }

  /** Cross-tenant clone detection; requires full tenant scope server-side. */
  async detectCloneDevices(): Promise<{ devices: PlatformDevice[]; licenses: PlatformLicense[]; alerts: string[] }> {
    const envelope = await this.requestEnvelope<{ devices: any[]; licenses: any[]; alerts: string[] }>({ path: '/api/v1/admin/devices/detect-clones',
      method: 'POST' });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    const data = (envelope.data as any) || {};
    return {
      devices: (Array.isArray(data.devices) ? data.devices : []).map(mapCentralDevice),
      licenses: (Array.isArray(data.licenses) ? data.licenses : []).map(mapCentralLicense),
      alerts: Array.isArray(data.alerts) ? data.alerts.map(String) : [],
    };
  }

  // ── Billing: invoices & payments ──────────────────────────────────────────

  async listInvoices(filters: { search?: string; status?: string; tenantId?: string } = {}): Promise<PlatformInvoice[]> {
    const params: Record<string, string> = {};
    if (filters.search) params.search = filters.search;
    if (filters.status) params.status = filters.status;
    if (filters.tenantId) params.tenantId = filters.tenantId;
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({
      path: `/api/v1/admin/billing/invoices${qs ? `?${qs}` : ''}`,
      method: 'GET',
    });
    return (Array.isArray(rows) ? rows : []).map(mapCentralInvoice);
  }

  async getInvoice(id: string): Promise<PlatformInvoice | null> {
    const row = await this.request<any>({
      path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}`,
      method: 'GET',
    });
    return row ? mapCentralInvoice(row) : null;
  }

  async createInvoice(input: PlatformInvoiceInput, number?: string): Promise<PlatformInvoice> {
    const payload = {
      tenantId: input.tenantId,
      number: number || `INV-${Date.now()}`,
      subscriptionId: input.subscriptionId ?? null,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      status: input.status ?? 'DRAFT',
      discount: input.discount ?? 0,
      tax: input.tax ?? 0,
      notes: input.notes ?? null,
      items: input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };
    const row = await this.request<any>({
      path: '/api/v1/admin/billing/invoices',
      method: 'POST',
      body: payload,
    });
    return mapCentralInvoice(row);
  }

  async setInvoiceStatus(id: string, status: PlatformInvoiceStatus): Promise<PlatformInvoice> {
    const row = await this.request<any>({
      path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}/status`,
      method: 'POST',
      body: { status },
    });
    return mapCentralInvoice(row);
  }

  async voidInvoice(id: string): Promise<PlatformInvoice> {
    const row = await this.request<any>({
      path: `/api/v1/admin/billing/invoices/${encodeURIComponent(id)}/void`,
      method: 'POST',
      body: {},
    });
    return mapCentralInvoice(row);
  }

  async listPayments(filters: { tenantId?: string; invoiceId?: string; limit?: number } = {}): Promise<PlatformPayment[]> {
    const params: Record<string, string> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.invoiceId) params.invoiceId = filters.invoiceId;
    if (filters.limit) params.limit = String(filters.limit);
    const qs = new URLSearchParams(params).toString();
    const rows = await this.request<any[]>({
      path: `/api/v1/admin/billing/payments${qs ? `?${qs}` : ''}`,
      method: 'GET',
    });
    return (Array.isArray(rows) ? rows : []).map(mapCentralPayment);
  }

  async addPayment(input: PlatformPaymentInput): Promise<PlatformPayment> {
    const row = await this.request<any>({
      path: '/api/v1/admin/billing/payments',
      method: 'POST',
      body: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId ?? null,
        amount: input.amount,
        method: input.method ?? 'CASH',
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        paidAt: input.paidAt ?? null,
      },
    });
    return mapCentralPayment(row);
  }

  async voidPayment(id: string): Promise<void> {
    await this.request<any>({
      path: `/api/v1/admin/billing/payments/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
  }

  // ── Dashboard Overview ──────────────────────────────────────────────────
  async getOverview(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/overview', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async createPayment(input: { tenantId: string; invoiceId?: string; amount: number; method?: string; reference?: string; notes?: string }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/billing/payments', method: 'POST', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Platform Settings ───────────────────────────────────────────────────
  async getSettings(): Promise<Record<string, string>> {
    const envelope = await this.requestEnvelope<Record<string, string>>({ path: '/api/v1/admin/settings', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data || {};
  }

  async updateSettings(settings: Record<string, string>): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/settings', method: 'PUT', body: settings });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Platform Policies (stored in platform_settings) ─────────────────────
  async getPlatformPolicies(): Promise<{ terms: string; privacy: string; retention: any; updatedAt: string }> {
    const settings = await this.getSettings();
    let retention: any = {};
    try {
      retention = settings['policy.retention'] ? JSON.parse(settings['policy.retention']) : {};
    } catch { /* keep defaults */ }
    return {
      terms: settings['policy.terms'] || '',
      privacy: settings['policy.privacy'] || '',
      retention,
      updatedAt: settings['policy.updated_at'] || '',
    };
  }

  async savePlatformPolicies(input: { terms?: string; privacy?: string; retention?: any }): Promise<any> {
    const updates: Record<string, string> = {};
    const now = new Date().toISOString();
    if (input.terms !== undefined) updates['policy.terms'] = input.terms;
    if (input.privacy !== undefined) updates['policy.privacy'] = input.privacy;
    if (input.retention !== undefined) {
      const current = await this.getPlatformPolicies();
      updates['policy.retention'] = JSON.stringify({ ...current.retention, ...input.retention });
    }
    updates['policy.updated_at'] = now;
    return this.updateSettings(updates);
  }

  // ── Product Modules & Feature Flags ─────────────────────────────────────
  async listModules(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/modules', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createModule(input: { code: string; name: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/modules', method: 'POST', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async updateModule(id: string, input: { name?: string; description?: string; category?: string; isActive?: boolean; sortOrder?: number }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/modules/${encodeURIComponent(id)}`, method: 'PUT', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listFeatureFlags(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/feature-flags', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createFeatureFlag(input: { key: string; name: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[] }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/feature-flags', method: 'POST', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async updateFeatureFlag(id: string, input: { name?: string; description?: string; isEnabled?: boolean; rolloutPercentage?: number; targetTenants?: string[] }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/feature-flags/${encodeURIComponent(id)}`, method: 'PUT', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Staff Sessions, Devices & Invites ───────────────────────────────────
  async listStaffSessions(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/sessions', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async revokeStaffSession(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/sessions/${encodeURIComponent(id)}`, method: 'DELETE' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listStaffDevices(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/devices', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async revokeStaffDevice(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/devices/${encodeURIComponent(id)}`, method: 'DELETE' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listStaffInvites(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/staff/invites', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createStaffInvite(input: { email: string; fullName: string; phone?: string; role?: string; expiresInDays?: number }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/staff/invites', method: 'POST', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async revokeStaffInvite(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: `/api/v1/admin/staff/invites/${encodeURIComponent(id)}`, method: 'DELETE' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Security Center ─────────────────────────────────────────────────────
  async getSecurityOverview(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/overview', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listSecurityEvents(filters: { severity?: string; eventType?: string; limit?: number } = {}): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters.severity) params.set('severity', filters.severity);
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const envelope = await this.requestEnvelope<any[]>({ path: `/api/v1/admin/security/events${query ? `?${query}` : ''}`, method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  // ── Sync Monitor ────────────────────────────────────────────────────────
  async listSyncEvents(filters: { tenantId?: string; status?: string; limit?: number } = {}): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters.tenantId) params.set('tenantId', filters.tenantId);
    if (filters.status) params.set('status', filters.status);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/sync/events${query ? `?${query}` : ''}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async getSyncStatus(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/sync/status', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listApiKeys(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/security/api-keys', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createApiKey(input: { name: string; scopes?: string[]; expiresInDays?: number }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/api-keys', method: 'POST', body: input });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async revokeApiKey(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/security/api-keys/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }
  // ── Complex Analytics ───────────────────────────────────────────────────
  async getBusinessPerformance(period: string = '30d'): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/analytics/business-performance?period=${period}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async getCustomerMetrics(period: string = '30d'): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/analytics/customer-metrics?period=${period}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async getLicenseMetrics(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/license-metrics', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async getSubscriptionMetrics(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/subscription-metrics', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async getOperationsMetrics(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/analytics/operations-metrics', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Tenant Branding ─────────────────────────────────────────────────────
  async getPlatformBranding(): Promise<any> {
    const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/branding/platform', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async getTenantBranding(tenantId: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async saveTenantBranding(tenantId: string, input: Record<string, any>): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}`,
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listTenantBrandingVersions(tenantId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/versions`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async rollbackTenantBranding(tenantId: string, version: number): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/branding/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
      method: 'POST',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Tenant UI Customization ─────────────────────────────────────────────
  async listUiProfiles(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/customization/ui-profiles', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async getTenantUiCustomization(tenantId: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async saveTenantUiCustomization(tenantId: string, input: Record<string, any>): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}`,
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listTenantUiVersions(tenantId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/versions`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async rollbackTenantUi(tenantId: string, version: number): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/customization/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
      method: 'POST',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Tenant App Configuration ────────────────────────────────────────────
  async listConfigTemplates(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/app-config/templates', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async listConfigRollouts(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/app-config/rollouts', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createConfigRollout(input: { templateId: string; targetTenants?: string[] }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/app-config/rollouts',
      method: 'POST',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async startConfigRollout(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(id)}/start`,
      method: 'POST',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listConfigAcks(rolloutId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/app-config/rollouts/${encodeURIComponent(rolloutId)}/acks`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async getTenantConfig(tenantId: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async saveTenantConfig(tenantId: string, input: { templateId?: string; configPayload?: any }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}`,
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listTenantConfigVersions(tenantId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/versions`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async rollbackTenantConfig(tenantId: string, version: number): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/app-config/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
      method: 'POST',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Tenant Activity Settings ────────────────────────────────────────────
  async getTenantActivity(tenantId: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async saveTenantActivity(tenantId: string, input: { activityId: string; enabledModules?: any; customTerminology?: any }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}`,
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listTenantActivityVersions(tenantId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/versions`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async rollbackTenantActivity(tenantId: string, version: number): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/activity/tenant/${encodeURIComponent(tenantId)}/rollback/${version}`,
      method: 'POST',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Admin Control ───────────────────────────────────────────────────────
  async listAdminControlStaff(filters: { search?: string; role?: string } = {}): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.role) params.set('role', filters.role);
    const query = params.toString();
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/admin-control/staff${query ? `?${query}` : ''}`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async listAdminControlStaffRoles(): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/admin-control/staff-roles', method: 'GET' });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }

  async createAdminControlStaff(input: { fullName: string; email: string; phone?: string; role?: string; permissions?: any }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/admin-control/staff',
      method: 'POST',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async updateAdminControlStaff(id: string, input: Record<string, any>): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async deleteAdminControlStaff(id: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/admin-control/staff/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Integration Providers ───────────────────────────────────────────────
  async listIntegrationProviders(): Promise<{ payments: any[]; sms: any[] }> {
    const envelope = await this.requestEnvelope<{ payments: any[]; sms: any[] }>({
      path: '/api/v1/admin/integrations/providers',
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data || { payments: [], sms: [] };
  }

  async updateIntegrationProvider(input: {
    type: 'payment' | 'sms';
    providerCode: string;
    providerName?: string;
    isEnabled?: boolean;
    config?: any;
    senderId?: string;
    dailyQuota?: number;
  }): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/integrations/providers',
      method: 'PUT',
      body: input,
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  // ── Support Remote Access ────────────────────────────────────────────────
  async requestRemoteAccess(ticketId: string, requested: boolean, durationMinutes: number = 60): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/request`,
      method: 'POST',
      body: { requested, durationMinutes },
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async approveRemoteAccess(ticketId: string, approved: boolean): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/approve`,
      method: 'POST',
      body: { approved },
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async startRemoteSession(ticketId: string, technicianName: string, durationMinutes: number = 60): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-access/start`,
      method: 'POST',
      body: { technicianName, durationMinutes },
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async endRemoteSession(sessionId: string, summary?: string): Promise<any> {
    const envelope = await this.requestEnvelope<any>({
      path: `/api/v1/admin/support/remote-sessions/${encodeURIComponent(sessionId)}/end`,
      method: 'POST',
      body: { summary },
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return envelope.data;
  }

  async listRemoteSessions(ticketId: string): Promise<any[]> {
    const envelope = await this.requestEnvelope<any[]>({
      path: `/api/v1/admin/support/${encodeURIComponent(ticketId)}/remote-sessions`,
      method: 'GET',
    });
    if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
    return Array.isArray(envelope.data) ? envelope.data : [];
  }
}

export const platformAdminApiClient = new PlatformAdminApiClient();
