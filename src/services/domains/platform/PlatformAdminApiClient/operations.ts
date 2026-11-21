// Operations endpoints: backups (central + app), ops jobs, tenant usage,
// maintenance windows and releases (+ per-release targets).
import type { PlatformAdminApiCore } from './core';
import type {
  PlatformMaintenanceWindow,
  PlatformMaintenanceStatus,
  PlatformReleaseTarget,
} from '../platformTypes';

/** Map a central maintenance-window row (camelCase per contract; snake_case tolerated) to the UI type. */
function mapMaintenanceWindow(row: any): PlatformMaintenanceWindow {
  const services = row.affectedServices ?? row.affected_services;
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: row.description ?? undefined,
    startsAt: String(row.startsAt ?? row.starts_at ?? ''),
    endsAt: String(row.endsAt ?? row.ends_at ?? ''),
    affectedServices: Array.isArray(services) ? services.map(String).filter(Boolean) : [],
    status: String(row.status ?? 'SCHEDULED') as PlatformMaintenanceStatus,
    createdBy: String(row.createdBy ?? row.created_by ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
}

/** Map a central release-target row to the UI type. */
function mapReleaseTarget(row: any): PlatformReleaseTarget {
  return {
    id: String(row.id ?? ''),
    releaseId: String(row.releaseId ?? row.release_id ?? ''),
    tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
    tenantName: row.tenantName ?? row.tenant_name ?? null,
    deviceId: row.deviceId ?? row.device_id ?? null,
    clientVersion: row.clientVersion ?? row.client_version ?? null,
    attemptCount: Number(row.attemptCount ?? row.attempt_count ?? 0) || 0,
    status: String(row.status ?? 'PENDING'),
    appliedAt: row.appliedAt ?? row.applied_at ?? null,
    error: row.error ?? null,
    deployedAt: row.deployedAt ?? row.deployed_at ?? null,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
  };
}

export interface OperationsApi {
  listBackups(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string; type?: string; q?: string }): Promise<any[]>;
  createBackup(this: PlatformAdminApiCore, input: { tenantId?: string | null; name?: string; type?: string; notes?: string; triggerSource?: string }): Promise<any>;
  getBackup(this: PlatformAdminApiCore, id: string): Promise<any>;
  downloadBackupArtifact(this: PlatformAdminApiCore, id: string): Promise<any>;
  restoreBackup(this: PlatformAdminApiCore, id: string, notes?: string): Promise<any>;
  listAppBackups(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string; restoreStatus?: string; q?: string }): Promise<any[]>;
  getAppBackup(this: PlatformAdminApiCore, id: string): Promise<any>;
  requestAppBackupRestore(this: PlatformAdminApiCore, id: string): Promise<any>;
  cancelAppBackupRestore(this: PlatformAdminApiCore, id: string): Promise<any>;
  listBackupRestores(this: PlatformAdminApiCore, filters?: { tenantId?: string; status?: string }): Promise<any[]>;
  listOpsJobs(this: PlatformAdminApiCore, filters?: { status?: string; type?: string; tenantId?: string }): Promise<any[]>;
  createOpsJob(this: PlatformAdminApiCore, input: { tenantId?: string | null; type: string; payload?: any; runAt?: string | null }): Promise<any>;
  cancelOpsJob(this: PlatformAdminApiCore, id: string): Promise<any>;
  retryOpsJob(this: PlatformAdminApiCore, id: string): Promise<any>;
  listTenantUsage(this: PlatformAdminApiCore, filters?: { status?: string; planId?: string }): Promise<any[]>;
  getTenantUsageDetail(this: PlatformAdminApiCore, tenantId: string): Promise<any>;
  listReleases(this: PlatformAdminApiCore, filters?: { status?: string; channel?: string; q?: string }): Promise<any[]>;
  createRelease(this: PlatformAdminApiCore, input: Record<string, any>): Promise<any>;
  updateRelease(this: PlatformAdminApiCore, id: string, input: Record<string, any>): Promise<any>;
  publishRelease(this: PlatformAdminApiCore, id: string): Promise<any>;
  rollbackRelease(this: PlatformAdminApiCore, id: string): Promise<any>;
  deleteRelease(this: PlatformAdminApiCore, id: string): Promise<any>;
  listMaintenanceWindows(this: PlatformAdminApiCore, filters?: { status?: string }): Promise<PlatformMaintenanceWindow[]>;
  createMaintenanceWindow(this: PlatformAdminApiCore, input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }): Promise<PlatformMaintenanceWindow>;
  cancelMaintenanceWindow(this: PlatformAdminApiCore, id: string): Promise<PlatformMaintenanceWindow>;
  listReleaseTargets(this: PlatformAdminApiCore, releaseId: string): Promise<PlatformReleaseTarget[]>;
  setReleaseTargets(this: PlatformAdminApiCore, releaseId: string, tenantIds: string[]): Promise<PlatformReleaseTarget[]>;
  setReleaseTargetStatus(this: PlatformAdminApiCore, releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string): Promise<PlatformReleaseTarget>;
}

export function createOperationsApi(): OperationsApi {
  return {
    // ── Backups ────────────────────────────────────────────────────────────────

    async listBackups(this: PlatformAdminApiCore, filters: { tenantId?: string; status?: string; type?: string; q?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.q) params.q = filters.q;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/backups${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createBackup(this: PlatformAdminApiCore, input: { tenantId?: string | null; name?: string; type?: string; notes?: string; triggerSource?: string }) {
      return this.request<any>({ path: '/api/v1/admin/backups', method: 'POST', body: input });
    },

    async getBackup(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/backups/${encodeURIComponent(id)}`, method: 'GET' });
    },

    /** Downloads the raw backup artifact (a JSON document, not an API envelope). */
    async downloadBackupArtifact(this: PlatformAdminApiCore, id: string) {
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
    },

    async restoreBackup(this: PlatformAdminApiCore, id: string, notes = '') {
      return this.request<any>({
        path: `/api/v1/admin/backups/${encodeURIComponent(id)}/restore`,
        method: 'POST',
        body: { notes },
      });
    },

    // ── Application (ERP) backups — opaque encrypted device snapshots ──────────

    async listAppBackups(this: PlatformAdminApiCore, filters: { tenantId?: string; status?: string; restoreStatus?: string; q?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.status) params.status = filters.status;
      if (filters.restoreStatus) params.restoreStatus = filters.restoreStatus;
      if (filters.q) params.q = filters.q;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/app-backups${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async getAppBackup(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}`, method: 'GET' });
    },

    async requestAppBackupRestore(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({
        path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}/restore`,
        method: 'POST',
        body: {},
      });
    },

    async cancelAppBackupRestore(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({
        path: `/api/v1/admin/app-backups/${encodeURIComponent(id)}/restore/cancel`,
        method: 'POST',
        body: {},
      });
    },

    async listBackupRestores(this: PlatformAdminApiCore, filters: { tenantId?: string; status?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.tenantId) params.tenantId = filters.tenantId;
      if (filters.status) params.status = filters.status;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/backups/restores${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    // ── Operations jobs & usage ────────────────────────────────────────────────

    async listOpsJobs(this: PlatformAdminApiCore, filters: { status?: string; type?: string; tenantId?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.tenantId) params.tenantId = filters.tenantId;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/operations/jobs${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createOpsJob(this: PlatformAdminApiCore, input: { tenantId?: string | null; type: string; payload?: any; runAt?: string | null }) {
      return this.request<any>({ path: '/api/v1/admin/operations/jobs', method: 'POST', body: input });
    },

    async cancelOpsJob(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/operations/jobs/${encodeURIComponent(id)}/cancel`, method: 'POST' });
    },

    async retryOpsJob(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/operations/jobs/${encodeURIComponent(id)}/retry`, method: 'POST' });
    },

    async listTenantUsage(this: PlatformAdminApiCore, filters: { status?: string; planId?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.planId) params.planId = filters.planId;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/operations/usage${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async getTenantUsageDetail(this: PlatformAdminApiCore, tenantId: string) {
      return this.request<any>({ path: `/api/v1/admin/operations/usage/${encodeURIComponent(tenantId)}`, method: 'GET' });
    },

    // ── Releases & phased rollout ──────────────────────────────────────────────

    async listReleases(this: PlatformAdminApiCore, filters: { status?: string; channel?: string; q?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.channel) params.channel = filters.channel;
      if (filters.q) params.q = filters.q;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/releases${qs ? `?${qs}` : ''}`, method: 'GET' });
      return Array.isArray(rows) ? rows : [];
    },

    async createRelease(this: PlatformAdminApiCore, input: Record<string, any>) {
      return this.request<any>({ path: '/api/v1/admin/releases', method: 'POST', body: input });
    },

    async updateRelease(this: PlatformAdminApiCore, id: string, input: Record<string, any>) {
      return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}`, method: 'PUT', body: input });
    },

    async publishRelease(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}/publish`, method: 'POST' });
    },

    async rollbackRelease(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}/rollback`, method: 'POST' });
    },

    async deleteRelease(this: PlatformAdminApiCore, id: string) {
      return this.request<any>({ path: `/api/v1/admin/releases/${encodeURIComponent(id)}`, method: 'DELETE' });
    },

    // ── Maintenance windows ──────────────────────────────────────────────────

    async listMaintenanceWindows(this: PlatformAdminApiCore, filters: { status?: string } = {}) {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<any[]>({ path: `/api/v1/admin/operations/maintenance-windows${qs ? `?${qs}` : ''}`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map(mapMaintenanceWindow);
    },

    async createMaintenanceWindow(this: PlatformAdminApiCore, input: { title: string; description?: string; startsAt: string; endsAt: string; affectedServices?: string[] }) {
      const row = await this.request<any>({ path: '/api/v1/admin/operations/maintenance-windows', method: 'POST', body: input });
      return mapMaintenanceWindow(row ?? {});
    },

    async cancelMaintenanceWindow(this: PlatformAdminApiCore, id: string) {
      const row = await this.request<any>({ path: `/api/v1/admin/operations/maintenance-windows/${encodeURIComponent(id)}/cancel`, method: 'POST' });
      return mapMaintenanceWindow(row ?? {});
    },

    // ── Release targets (per-tenant rollout tracking) ───────────────────────

    async listReleaseTargets(this: PlatformAdminApiCore, releaseId: string) {
      const rows = await this.request<any[]>({ path: `/api/v1/admin/releases/${encodeURIComponent(releaseId)}/targets`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map(mapReleaseTarget);
    },

    async setReleaseTargets(this: PlatformAdminApiCore, releaseId: string, tenantIds: string[]) {
      const rows = await this.request<any[]>({
        path: `/api/v1/admin/releases/${encodeURIComponent(releaseId)}/targets`,
        method: 'PUT',
        body: { tenantIds },
      });
      return (Array.isArray(rows) ? rows : []).map(mapReleaseTarget);
    },

    async setReleaseTargetStatus(this: PlatformAdminApiCore, releaseId: string, tenantId: string, status: PlatformReleaseTarget['status'], error?: string) {
      const row = await this.request<any>({
        path: `/api/v1/admin/releases/${encodeURIComponent(releaseId)}/targets/${encodeURIComponent(tenantId)}/status`,
        method: 'POST',
        body: error !== undefined ? { status, error } : { status },
      });
      return mapReleaseTarget(row ?? {});
    },
  };
}
