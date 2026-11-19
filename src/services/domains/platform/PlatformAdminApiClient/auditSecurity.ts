// Audit center, error monitoring, security center, sync monitor and signing keys.
import type {
  PlatformAdminApiCore,
  PlatformAuditEvent,
  PlatformAuditPage,
  PlatformAuditQuery,
  PlatformAuditVerification,
} from './core';
import { CentralApiError } from './core';

export interface AuditSecurityApi {
  listAuditEvents(this: PlatformAdminApiCore, query?: PlatformAuditQuery): Promise<PlatformAuditPage>;
  getAuditEvent(this: PlatformAdminApiCore, id: string): Promise<PlatformAuditEvent>;
  verifyAuditChain(this: PlatformAdminApiCore, fromSequence?: number): Promise<PlatformAuditVerification>;
  listErrorReports(this: PlatformAdminApiCore, filters?: { status?: string; severity?: string; tenantId?: string; q?: string }): Promise<any[]>;
  getErrorReportsSummary(this: PlatformAdminApiCore): Promise<any>;
  setErrorReportStatus(this: PlatformAdminApiCore, id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen'): Promise<any>;
  getSecurityOverview(this: PlatformAdminApiCore): Promise<any>;
  listSecurityEvents(this: PlatformAdminApiCore, filters?: { severity?: string; eventType?: string; limit?: number }): Promise<any[]>;
  listSyncEvents(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string; limit?: number }): Promise<any[]>;
  getSyncStatus(this: PlatformAdminApiCore): Promise<any>;
  listCentralSigningKeys(this: PlatformAdminApiCore): Promise<{ keys: Array<{ id: string; keyId: string; isActive: boolean; createdAt: string; expiresAt: string | null }>; currentKeyId: string | null }>;
  rotateCentralSigningKey(this: PlatformAdminApiCore): Promise<{ keyId: string; currentKeyId: string | null }>;
  listApiKeys(this: PlatformAdminApiCore): Promise<any[]>;
  createApiKey(this: PlatformAdminApiCore, input: { name: string; scopes?: string[]; expiresInDays?: number }): Promise<any>;
  revokeApiKey(this: PlatformAdminApiCore, id: string): Promise<any>;
}

export function createAuditSecurityApi(): AuditSecurityApi {
  return {
    // Audit center
    async listAuditEvents(this: PlatformAdminApiCore, query: PlatformAuditQuery = {}) {
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
    },

    async getAuditEvent(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<PlatformAuditEvent>({
        path: `/api/v1/admin/audit/${encodeURIComponent(id)}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as PlatformAuditEvent) || ({} as PlatformAuditEvent);
    },

    async verifyAuditChain(this: PlatformAdminApiCore, fromSequence = 1) {
      const envelope = await this.requestEnvelope<PlatformAuditVerification>({
        path: `/api/v1/admin/audit/verify?fromSequence=${encodeURIComponent(String(fromSequence))}`,
        method: 'GET',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      return (envelope.data as PlatformAuditVerification) || ({} as PlatformAuditVerification);
    },

    // ── Error monitoring ───────────────────────────────────────────────────────

    async listErrorReports(this: PlatformAdminApiCore, filters: { status?: string; severity?: string; tenantId?: string; q?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.q) params.q = filters.q;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/monitoring/errors${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async getErrorReportsSummary(this: PlatformAdminApiCore) {
      return this.request<any>({ path: '/api/v1/admin/monitoring/errors/summary', method: 'GET' });
    },

    async setErrorReportStatus(this: PlatformAdminApiCore, id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') {
      return this.request<any>({
        path: `/api/v1/admin/monitoring/errors/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
      });
    },

    // ── Security Center ─────────────────────────────────────────────────────
    async getSecurityOverview(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/overview', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listSecurityEvents(this: PlatformAdminApiCore, filters: { severity?: string; eventType?: string; limit?: number } = {}) {
      const params = new URLSearchParams();
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.eventType) params.set('eventType', filters.eventType);
      if (filters.limit) params.set('limit', String(filters.limit));
      const query = params.toString();
      const envelope = await this.requestEnvelope<any[]>({ path: `/api/v1/admin/security/events${query ? `?${query}` : ''}`, method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    // ── Sync Monitor ────────────────────────────────────────────────────────
    async listSyncEvents(this: PlatformAdminApiCore, filters: { tenantId?: string; status?: string; limit?: number } = {}) {
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
    },

    async getSyncStatus(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/sync/status', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async listCentralSigningKeys(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/signing-keys', method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as any) || {};
      return {
        keys: Array.isArray(data.keys) ? data.keys : [],
        currentKeyId: data.currentKeyId ?? null,
      };
    },

    async rotateCentralSigningKey(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any>({
        path: '/api/v1/admin/security/signing-keys/rotate',
        method: 'POST',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as any) || {};
      return { keyId: String(data.keyId || ''), currentKeyId: data.currentKeyId ?? null };
    },

    async listApiKeys(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<any[]>({ path: '/api/v1/admin/security/api-keys', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createApiKey(this: PlatformAdminApiCore, input: { name: string; scopes?: string[]; expiresInDays?: number }) {
      const envelope = await this.requestEnvelope<any>({ path: '/api/v1/admin/security/api-keys', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },

    async revokeApiKey(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<any>({
        path: `/api/v1/admin/security/api-keys/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data;
    },
  };
}
