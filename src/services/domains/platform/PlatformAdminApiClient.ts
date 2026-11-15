// Adapter connecting Super Admin operations to the central server via the Electron bridge (electron/centralApi.js).
import type { PlatformTenant, PlatformPlan, PlatformTenantInput } from './platformTypes';

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
    const envelope = await this.requestEnvelope<PlatformRoleSummary[]>({
      path: '/api/v1/admin/roles',
      method: 'GET',
    });
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
    const envelope = await this.requestEnvelope<any>({
      path: '/api/v1/admin/permissions/catalog',
      method: 'GET',
    });
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
    const envelope = await this.requestEnvelope<any[]>({
      path: '/api/v1/admin/notifications/templates',
      method: 'GET',
    });
    if (envelope.success === false) {
      throw new CentralApiError({ status: 0, envelope });
    }
    return (envelope.data as any[]) || [];
  }
}

export const platformAdminApiClient = new PlatformAdminApiClient();
