// Audit center, error monitoring, security center, sync monitor and signing keys.
import type {
  PlatformAdminApiCore,
  PlatformAuditEvent,
  PlatformAuditPage,
  PlatformAuditQuery,
  PlatformAuditVerification,
} from './core';
import { CentralApiError } from './core';
import type {
  CentralErrorReport,
  CentralErrorReportsSummary,
  CentralDeviceMetric,
  CentralMonitoringHealth,
  CentralSecurityOverviewStats,
  CentralSecurityEventRow,
  CentralSyncEventRow,
  CentralSyncStatusSummary,
  CentralApiKeyRow,
  CentralApiKeyCreated,
  CentralIpBanRow,
  CentralMutationResult,
} from './centralTypes';

export interface AuditSecurityApi {
  listAuditEvents(this: PlatformAdminApiCore, query?: PlatformAuditQuery): Promise<PlatformAuditPage>;
  getAuditEvent(this: PlatformAdminApiCore, id: string): Promise<PlatformAuditEvent>;
  verifyAuditChain(this: PlatformAdminApiCore, fromSequence?: number): Promise<PlatformAuditVerification>;
  listErrorReports(this: PlatformAdminApiCore, filters?: { status?: string; severity?: string; tenantId?: string; q?: string }): Promise<CentralErrorReport[]>;
  getErrorReportsSummary(this: PlatformAdminApiCore): Promise<CentralErrorReportsSummary>;
  setErrorReportStatus(this: PlatformAdminApiCore, id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen'): Promise<CentralErrorReport>;
  getMonitoringHealth(this: PlatformAdminApiCore): Promise<CentralMonitoringHealth>;
  listDeviceMetrics(this: PlatformAdminApiCore, filters?: { tenantId?: string; deviceId?: string; metricName?: string; since?: string; limit?: number }): Promise<CentralDeviceMetric[]>;
  getSecurityOverview(this: PlatformAdminApiCore): Promise<CentralSecurityOverviewStats>;
  listSecurityEvents(this: PlatformAdminApiCore, filters?: { severity?: string; eventType?: string; limit?: number }): Promise<CentralSecurityEventRow[]>;
  listSyncEvents(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string; limit?: number }): Promise<CentralSyncEventRow[]>;
  getSyncStatus(this: PlatformAdminApiCore): Promise<CentralSyncStatusSummary>;
  listCentralSigningKeys(this: PlatformAdminApiCore): Promise<{ keys: Array<{ id: string; keyId: string; isActive: boolean; createdAt: string; expiresAt: string | null }>; currentKeyId: string | null }>;
  rotateCentralSigningKey(this: PlatformAdminApiCore): Promise<{ keyId: string; currentKeyId: string | null }>;
  listApiKeys(this: PlatformAdminApiCore): Promise<CentralApiKeyRow[]>;
  createApiKey(this: PlatformAdminApiCore, input: { name: string; scopes?: string[]; expiresInDays?: number }): Promise<CentralApiKeyCreated>;
  revokeApiKey(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
  listIpBans(this: PlatformAdminApiCore, filters?: { activeOnly?: boolean }): Promise<CentralIpBanRow[]>;
  banIp(this: PlatformAdminApiCore, input: { ipAddress: string; reason?: string; expiresAt?: string }): Promise<CentralIpBanRow>;
  liftIpBan(this: PlatformAdminApiCore, id: string): Promise<CentralMutationResult>;
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
      const rows = await this.request<CentralErrorReport[]>({ path: `/api/v1/admin/monitoring/errors${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async getErrorReportsSummary(this: PlatformAdminApiCore) {
      return this.request<CentralErrorReportsSummary>({ path: '/api/v1/admin/monitoring/errors/summary', method: 'GET' });
    },

    async setErrorReportStatus(this: PlatformAdminApiCore, id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') {
      return this.request<CentralErrorReport>({
        path: `/api/v1/admin/monitoring/errors/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
      });
    },

    // ── Technical health & device metrics ────────────────────────────────────

    async getMonitoringHealth(this: PlatformAdminApiCore) {
      return this.request<CentralMonitoringHealth>({ path: '/api/v1/admin/monitoring/health', method: 'GET' });
    },

    async listDeviceMetrics(this: PlatformAdminApiCore, filters: { tenantId?: string; deviceId?: string; metricName?: string; since?: string; limit?: number } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.deviceId) params.deviceId = filters.deviceId;
      if (filters.metricName) params.metricName = filters.metricName;
      if (filters.since) params.since = filters.since;
      if (filters.limit) params.limit = String(filters.limit);
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<CentralDeviceMetric[]>({ path: `/api/v1/admin/monitoring/metrics${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    // ── Security Center ─────────────────────────────────────────────────────
    async getSecurityOverview(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralSecurityOverviewStats>({ path: '/api/v1/admin/security/overview', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralSecurityOverviewStats;
    },

    async listSecurityEvents(this: PlatformAdminApiCore, filters: { severity?: string; eventType?: string; limit?: number } = {}) {
      const params = new URLSearchParams();
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.eventType) params.set('eventType', filters.eventType);
      if (filters.limit) params.set('limit', String(filters.limit));
      const query = params.toString();
      const envelope = await this.requestEnvelope<CentralSecurityEventRow[]>({ path: `/api/v1/admin/security/events${query ? `?${query}` : ''}`, method: 'GET' });
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
      const envelope = await this.requestEnvelope<CentralSyncEventRow[]>({
        path: `/api/v1/admin/sync/events${query ? `?${query}` : ''}`,
        method: 'GET',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async getSyncStatus(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralSyncStatusSummary>({ path: '/api/v1/admin/sync/status', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralSyncStatusSummary;
    },

    async listCentralSigningKeys(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<{
        keys: Array<{ id: string; keyId: string; isActive: boolean; createdAt: string; expiresAt: string | null }>;
        currentKeyId: string | null;
      }>({ path: '/api/v1/admin/security/signing-keys', method: 'GET' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = envelope.data || { keys: [], currentKeyId: null };
      return {
        keys: Array.isArray(data.keys) ? data.keys : [],
        currentKeyId: data.currentKeyId ?? null,
      };
    },

    async rotateCentralSigningKey(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<{ keyId?: string; currentKeyId?: string | null }>({
        path: '/api/v1/admin/security/signing-keys/rotate',
        method: 'POST',
      });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = envelope.data || {};
      return { keyId: String(data.keyId || ''), currentKeyId: data.currentKeyId ?? null };
    },

    async listApiKeys(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<CentralApiKeyRow[]>({ path: '/api/v1/admin/security/api-keys', method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async createApiKey(this: PlatformAdminApiCore, input: { name: string; scopes?: string[]; expiresInDays?: number }) {
      const envelope = await this.requestEnvelope<CentralApiKeyCreated>({ path: '/api/v1/admin/security/api-keys', method: 'POST', body: input });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralApiKeyCreated;
    },

    async revokeApiKey(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({
        path: `/api/v1/admin/security/api-keys/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },

    // ── IP Bans ────────────────────────────────────────────────────────────
    async listIpBans(this: PlatformAdminApiCore, filters: { activeOnly?: boolean } = {}) {
      const qs = filters.activeOnly ? '?active=1' : '';
      const envelope = await this.requestEnvelope<CentralIpBanRow[]>({ path: `/api/v1/admin/security/ip-bans${qs}`, method: 'GET' });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return Array.isArray(envelope.data) ? envelope.data : [];
    },

    async banIp(this: PlatformAdminApiCore, input: { ipAddress: string; reason?: string; expiresAt?: string }) {
      const envelope = await this.requestEnvelope<CentralIpBanRow>({
        path: '/api/v1/admin/security/ip-bans',
        method: 'POST',
        body: input,
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralIpBanRow;
    },

    async liftIpBan(this: PlatformAdminApiCore, id: string) {
      const envelope = await this.requestEnvelope<CentralMutationResult>({
        path: `/api/v1/admin/security/ip-bans/${encodeURIComponent(id)}/lift`,
        method: 'POST',
      });
      if (envelope.success === false) throw new CentralApiError({ status: 0, envelope });
      return envelope.data as CentralMutationResult;
    },
  };
}
