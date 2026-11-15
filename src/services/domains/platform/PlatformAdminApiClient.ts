// Adapter connecting Super Admin operations to the central server via the Electron bridge (electron/centralApi.js).
import type { PlatformTenant, PlatformPlan, PlatformTenantInput } from './platformTypes';

export type CentralRequest = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
};

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

export interface PlatformRoleSummary {
  code: string;
  name: string;
  description: string | null;
  isSystem: number | boolean;
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
      try {
        localStorage.removeItem('ceramisys_central_admin_token');
      } catch {
        // ignore
      }
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

  private async request<T>(req: CentralRequest): Promise<T> {
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

    if (!res || res.ok === false) {
      throw new Error(res?.error || 'فشل الاتصال بالسيرفر المركزي.');
    }
    return (res.data ?? res) as T;
  }

  // Auth
  async login(username: string, password: string):Promise<{ token: string; admin: any }> {
    const res = await this.request<{ token: string; admin: any }>({
      path: '/api/v1/admin/auth/login',
      method: 'POST',
      body: { username, password },
    });
    if (res?.token) {
      this.setAuthToken(res.token);
    }
    return res;
  }

  async getCurrentAdmin(): Promise<{ admin: any }> {
    return this.request<{ admin: any }>({
      path: '/api/v1/admin/auth/me',
      method: 'GET',
    });
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
    const res = await this.request<{ data: PlatformRoleSummary[] }>({
      path: '/api/v1/admin/roles',
      method: 'GET',
    });
    return res.data;
  }

  async getRolePermissions(roleCode: string): Promise<string[]> {
    const res = await this.request<{ data: string[] }>({
      path: `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
      method: 'GET',
    });
    return res.data;
  }

  async getPermissionCatalog(): Promise<{
    sections: unknown[];
    pages: unknown[];
    permissions: unknown[];
    roles: Array<PlatformRoleSummary & { permissions: string[] }>;
  }> {
    const res = await this.request<{ data: any }>({
      path: '/api/v1/admin/permissions/catalog',
      method: 'GET',
    });
    return res.data;
  }

  // Audit center
  async listAuditEvents(query: PlatformAuditQuery = {}): Promise<PlatformAuditPage> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    }
    const qs = new URLSearchParams(params).toString();
    return this.request<PlatformAuditPage>({
      path: `/api/v1/admin/audit${qs ? `?${qs}` : ''}`,
      method: 'GET',
    });
  }

  async getAuditEvent(id: string): Promise<PlatformAuditEvent> {
    const res = await this.request<{ data: PlatformAuditEvent }>({
      path: `/api/v1/admin/audit/${encodeURIComponent(id)}`,
      method: 'GET',
    });
    return res.data;
  }

  async verifyAuditChain(fromSequence = 1): Promise<PlatformAuditVerification> {
    const res = await this.request<{ data: PlatformAuditVerification }>({
      path: `/api/v1/admin/audit/verify?fromSequence=${encodeURIComponent(String(fromSequence))}`,
      method: 'GET',
    });
    return res.data;
  }
}

export const platformAdminApiClient = new PlatformAdminApiClient();
