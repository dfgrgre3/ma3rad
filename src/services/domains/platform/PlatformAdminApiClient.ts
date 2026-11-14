// Phase 2 adapter: mirrors PlatformAdminService method surface but calls the
// central API through the Electron bridge (electron/centralApi.js).
// Network failures are NOT swallowed here; callers (PlatformAdminService facade)
// decide caching/outbox behaviour.
import type { PlatformTenant, PlatformPlan } from './platformTypes';

export type CentralRequest = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
};

export class PlatformAdminApiClient {
  private baseUrl: string | null = null;

  setBaseUrl(url: string | null): void {
    this.baseUrl = url;
  }

  private async request<T>(req: CentralRequest): Promise<T> {
    const bridge = (window as any)?.ceramisys?.central;
    if (!bridge?.request) throw new Error('Central bridge unavailable.');
    const res = await bridge.request({
      path: req.path,
      method: req.method,
      body: req.body ? JSON.stringify(req.body) : undefined,
      headers: req.headers,
    });
    if (!res || res.ok === false) throw new Error(res?.error || 'Central request failed.');
    return (res.data ?? res) as T;
  }

  async listTenants(search = '', status = ''): Promise<PlatformTenant[]> {
    const q = new URLSearchParams({ search, status }).toString();
    return this.request<PlatformTenant[]>({ path: `/api/v1/admin/tenants?${q}`, method: 'GET' });
  }

  async listPlans(): Promise<PlatformPlan[]> {
    return this.request<PlatformPlan[]>({ path: '/api/v1/admin/plans', method: 'GET' });
  }
}

export const platformAdminApiClient = new PlatformAdminApiClient();