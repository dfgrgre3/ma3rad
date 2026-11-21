// Adapter connecting Super Admin operations to the central server via the Electron bridge (electron/centralApi.js).
//
// The endpoint methods are grouped by responsibility under ./PlatformAdminApiClient/
// and attached to the prototype below; this file keeps the transport/auth core and
// re-exports the full public API.
import {
  CentralApiError,
  type CentralApiEnvelope,
  type CentralRequest,
} from './PlatformAdminApiClient/core';
import { createTenantApi, type TenantApi } from './PlatformAdminApiClient/tenants';
import { createDirectoryApi, type DirectoryApi } from './PlatformAdminApiClient/directory';
import { createLicenseApi, type LicenseApi } from './PlatformAdminApiClient/licenses';
import { createAuditSecurityApi, type AuditSecurityApi } from './PlatformAdminApiClient/auditSecurity';
import { createIntegrationApi, type IntegrationApi } from './PlatformAdminApiClient/integrations';
import { createBillingApi, type BillingApi } from './PlatformAdminApiClient/billing';
import { createOperationsApi, type OperationsApi } from './PlatformAdminApiClient/operations';
import { createSupportApi, type SupportApi } from './PlatformAdminApiClient/support';
import { createSettingsApi, type SettingsApi } from './PlatformAdminApiClient/settings';
import { createTenantExperienceApi, type TenantExperienceApi } from './PlatformAdminApiClient/tenantExperience';
import { createPoliciesApi, type PoliciesApi } from './PlatformAdminApiClient/policies';

// Re-export all public types/helpers so existing imports keep working.
export {
  CentralApiError,
  mapCentralLicense,
  mapCentralDevice,
  mapCentralInvoice,
  mapCentralPayment,
} from './PlatformAdminApiClient/core';
export type {
  CentralRequest,
  CentralApiEnvelope,
  PlatformAuditEvent,
  PlatformAuditQuery,
  PlatformAuditPage,
  PlatformAuditVerification,
  TenantFeaturePermissions,
  EffectiveTenantFeaturePermissions,
  TenantPermissionLimit,
  PlatformRoleSummary,
} from './PlatformAdminApiClient/core';

/** Full public surface of {@link PlatformAdminApiClient}, assembled from the domain modules. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class/interface merge to re-attach split method groups
export interface PlatformAdminApiClient
  extends TenantApi,
    DirectoryApi,
    LicenseApi,
    AuditSecurityApi,
    IntegrationApi,
    BillingApi,
    OperationsApi,
    SupportApi,
    SettingsApi,
    TenantExperienceApi,
    PoliciesApi {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional class/interface merge to re-attach split method groups
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

  async requestEnvelope<T>(req: CentralRequest): Promise<CentralApiEnvelope<T>> {
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

  async request<T>(req: CentralRequest): Promise<T> {
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
}

// Attach the domain endpoint groups to the prototype (pure delegation; bodies are
// verbatim moves of the original class methods and run with `this` = client).
Object.assign(
  PlatformAdminApiClient.prototype,
  createTenantApi(),
  createDirectoryApi(),
  createLicenseApi(),
  createAuditSecurityApi(),
  createIntegrationApi(),
  createBillingApi(),
  createOperationsApi(),
  createSupportApi(),
  createSettingsApi(),
  createTenantExperienceApi(),
  createPoliciesApi()
);

export const platformAdminApiClient = new PlatformAdminApiClient();
