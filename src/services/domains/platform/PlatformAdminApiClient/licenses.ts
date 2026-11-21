// License & device endpoints: issuing, renew/suspend/revoke/reactivate/transfer,
// device seat management and cross-tenant clone detection.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError, mapCentralDevice, mapCentralLicense } from './core';
import type {
  CentralLicenseIssueRequest,
  CentralLicenseIssueResponse,
  CentralLicenseSuspendResponse,
  CentralLicenseRevokeResponse,
  CentralLicenseTransferResponse,
  PlatformLicense,
  PlatformLicenseChange,
  PlatformLicenseChangeType,
  PlatformDevice,
} from '../platformTypes';
import type {
  CentralDeviceRow,
  CentralDeviceStatusResult,
  CentralLicenseRow,
  CentralLicenseRenewResult,
  CentralLicenseStatusResult,
} from './centralTypes';
import type { PlatformLicenseActivation } from '../platformTypes';

async function deviceAction(
  client: PlatformAdminApiCore,
  id: string,
  action: 'suspend' | 'release' | 'revoke',
  reason?: string
): Promise<CentralDeviceStatusResult> {
  return client.request<CentralDeviceStatusResult>({
    path: `/api/v1/admin/devices/${encodeURIComponent(id)}/${action}`,
    method: 'POST',
    body: { reason },
  });
}

export interface LicenseUpdateFields {
  seats?: number;
  deviceLimit?: number;
  branchesLimit?: number;
  offlineGracePeriodDays?: number;
  notes?: string | null;
  couplingMode?: PlatformLicense['couplingMode'];
}

export interface LicenseApi {
  getLicense(this: PlatformAdminApiCore, licenseId: string): Promise<PlatformLicense | null>;
  updateLicense(this: PlatformAdminApiCore, licenseId: string, fields: LicenseUpdateFields): Promise<PlatformLicense>;
  listLicenseActivations(this: PlatformAdminApiCore, licenseId: string): Promise<PlatformLicenseActivation[]>;
  listLicenseChanges(this: PlatformAdminApiCore, licenseId: string): Promise<PlatformLicenseChange[]>;
  renewLicense(this: PlatformAdminApiCore, licenseId: string, months: number): Promise<CentralLicenseRenewResult>;
  suspendLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<CentralLicenseSuspendResponse>;
  revokeLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<CentralLicenseRevokeResponse>;
  issueLicense(this: PlatformAdminApiCore, input: CentralLicenseIssueRequest): Promise<CentralLicenseIssueResponse>;
  listLicenses(this: PlatformAdminApiCore, search?: string, status?: string): Promise<PlatformLicense[]>;
  reactivateLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<CentralLicenseStatusResult>;
  transferLicense(this: PlatformAdminApiCore, licenseId: string, newHardwareId: string, reason?: string): Promise<CentralLicenseTransferResponse>;
  listDevices(this: PlatformAdminApiCore, query?: { tenantId?: string; status?: string }): Promise<PlatformDevice[]>;
  suspendDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<CentralDeviceStatusResult>;
  releaseDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<CentralDeviceStatusResult>;
  revokeDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<CentralDeviceStatusResult>;
  activateDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<{ device: PlatformDevice }>;
  enrollDeviceCredential(this: PlatformAdminApiCore, deviceId: string, credential: string): Promise<{ deviceId: string; credentialEnrolled: boolean }>;
  reassignDevice(this: PlatformAdminApiCore, deviceId: string, licenseId: string, reason?: string): Promise<PlatformDevice>;
  setDeviceCloneSuspected(this: PlatformAdminApiCore, deviceId: string, suspected: boolean): Promise<PlatformDevice>;
  deleteDevice(this: PlatformAdminApiCore, deviceId: string): Promise<void>;
  detectCloneDevices(this: PlatformAdminApiCore): Promise<{
    devices: PlatformDevice[];
    licenses: PlatformLicense[];
    alerts: string[];
    duplicateHwids: Array<{ hardwareId: string; tenants: string[]; tenantCount: number }>;
    overLimitLicenses: Array<{ licenseId: string; licenseKey: string; tenantId: string; deviceCount: number; deviceLimit: number }>;
    suspiciousTransfers: Array<{ licenseId: string; licenseKey: string; tenantId: string; transferCount: number }>;
  }>;
}

export function createLicenseApi(): LicenseApi {
  return {
    async getLicense(this: PlatformAdminApiCore, licenseId: string) {
      const row = await this.request<CentralLicenseRow>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}`,
        method: 'GET',
      });
      return row ? mapCentralLicense(row) : null;
    },

    async updateLicense(this: PlatformAdminApiCore, licenseId: string, fields: LicenseUpdateFields) {
      const body: Record<string, unknown> = {};
      if (fields.seats !== undefined) body.seats = fields.seats;
      if (fields.deviceLimit !== undefined) body.deviceLimit = fields.deviceLimit;
      if (fields.branchesLimit !== undefined) body.branchesLimit = fields.branchesLimit;
      if (fields.offlineGracePeriodDays !== undefined) body.offlineGracePeriodDays = fields.offlineGracePeriodDays;
      if (fields.notes !== undefined) body.notes = fields.notes;
      if (fields.couplingMode !== undefined) body.couplingMode = fields.couplingMode;
      const result = await this.request<{ license?: CentralLicenseRow }>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}`,
        method: 'PATCH',
        body,
      });
      if (!result?.license) throw new CentralApiError({ status: 0, envelope: { success: false, error: 'Empty license update response' } as any });
      return mapCentralLicense(result.license);
    },

    async listLicenseActivations(this: PlatformAdminApiCore, licenseId: string) {
      const rows = await this.request<Array<Record<string, any>>>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/activations`,
        method: 'GET',
      });
      return (Array.isArray(rows) ? rows : []).map((row): PlatformLicenseActivation => ({
        id: String(row.id),
        licenseId: String(row.license_id ?? row.licenseId ?? licenseId),
        tenantId: String(row.tenant_id ?? row.tenantId ?? ''),
        licenseKey: row.license_key ?? row.licenseKey ?? undefined,
        deviceId: row.device_id ?? row.deviceId ?? null,
        activationCode: row.activation_code ?? row.activationCode ?? null,
        mode: String(row.mode ?? 'ONLINE') as PlatformLicenseActivation['mode'],
        action: String(row.action ?? 'ACTIVATE') as PlatformLicenseActivation['action'],
        status: String(row.status ?? 'SUCCESS') as PlatformLicenseActivation['status'],
        ipAddress: row.ip_address ?? row.ipAddress ?? null,
        notes: row.notes ?? null,
        createdAt: String(row.created_at ?? row.createdAt ?? row.activated_at ?? ''),
      }));
    },

    async listLicenseChanges(this: PlatformAdminApiCore, licenseId: string) {
      const rows = await this.request<Array<Record<string, any>>>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/changes`,
        method: 'GET',
      });
      const parseValues = (raw: unknown): Record<string, unknown> | null => {
        if (!raw) return null;
        if (typeof raw === 'object') return raw as Record<string, unknown>;
        try { return JSON.parse(String(raw)); } catch { return null; }
      };
      return (Array.isArray(rows) ? rows : []).map((row): PlatformLicenseChange => ({
        id: String(row.id),
        licenseId: String(row.license_id ?? row.licenseId ?? licenseId),
        subscriptionId: row.subscription_id ?? row.subscriptionId ?? null,
        changeType: String(row.change_type ?? row.changeType ?? 'UPDATE') as PlatformLicenseChangeType,
        oldValues: parseValues(row.old_values ?? row.oldValues),
        newValues: parseValues(row.new_values ?? row.newValues),
        actorId: row.actor_id ?? row.actorId ?? null,
        actorName: row.actor_name ?? row.actorName ?? null,
        reason: row.reason ?? null,
        createdAt: String(row.created_at ?? row.createdAt ?? ''),
      }));
    },

    async renewLicense(this: PlatformAdminApiCore, licenseId: string, months: number) {
      return this.request<CentralLicenseRenewResult>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/renew`,
        method: 'POST',
        body: { months },
      });
    },

    async suspendLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<CentralLicenseSuspendResponse>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/suspend`,
        method: 'POST',
        body: { reason },
      });
    },

    async revokeLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<CentralLicenseRevokeResponse>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/revoke`,
        method: 'POST',
        body: { reason },
      });
    },

    /**
     * Issue a new license via central server (Ed25519 signed).
     * This is the production path - local issuance is dev-only.
     */
    async issueLicense(this: PlatformAdminApiCore, input: CentralLicenseIssueRequest) {
      return this.request<CentralLicenseIssueResponse>({
        path: '/api/v1/admin/licenses/issue',
        method: 'POST',
        body: input,
      });
    },

    // ── Licenses ───────────────────────────────────────────────────────────────

    async listLicenses(this: PlatformAdminApiCore, search = '', status = '') {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<CentralLicenseRow[]>({ path: `/api/v1/admin/licenses${qs ? `?${qs}` : ''}`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map(mapCentralLicense);
    },

    async reactivateLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<CentralLicenseStatusResult>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/reactivate`,
        method: 'POST',
        body: { reason },
      });
    },

    /** Bind/move a license to a hardware id (central transfer endpoint). */
    async transferLicense(this: PlatformAdminApiCore, licenseId: string, newHardwareId: string, reason?: string) {
      return this.request<CentralLicenseTransferResponse>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/transfer`,
        method: 'POST',
        body: { newHardwareId, reason },
      });
    },

    // ── Devices ────────────────────────────────────────────────────────────────

    async listDevices(this: PlatformAdminApiCore, query: { tenantId?: string; status?: string } = {}) {
      const params: Record<string, string> = {};
      if (query.tenantId) params.tenantId = query.tenantId;
      if (query.status) params.status = query.status;
      const qs = new URLSearchParams(params).toString();
      const rows = await this.request<CentralDeviceRow[]>({ path: `/api/v1/admin/devices${qs ? `?${qs}` : ''}`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map(mapCentralDevice);
    },

    suspendDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string) {
      return deviceAction(this, deviceId, 'suspend', reason);
    },

    releaseDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string) {
      return deviceAction(this, deviceId, 'release', reason);
    },

    revokeDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string) {
      return deviceAction(this, deviceId, 'revoke', reason);
    },

    async activateDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string) {
      const result = await this.request<{ device?: CentralDeviceRow }>({
        path: `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/activate`,
        method: 'POST',
        body: { reason },
      });
      if (!result?.device) throw new CentralApiError({ status: 0, envelope: { success: false, error: 'Empty device activate response' } as any });
      return { device: mapCentralDevice(result.device) };
    },

    async enrollDeviceCredential(this: PlatformAdminApiCore, deviceId: string, credential: string) {
      return this.request<{ deviceId: string; credentialEnrolled: boolean }>({
        path: `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/credential`,
        method: 'PUT',
        body: { credential },
      });
    },

    async reassignDevice(this: PlatformAdminApiCore, deviceId: string, licenseId: string, reason?: string) {
      const result = await this.request<{ device?: CentralDeviceRow }>({
        path: `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/reassign`,
        method: 'POST',
        body: { licenseId, reason },
      });
      if (!result?.device) throw new CentralApiError({ status: 0, envelope: { success: false, error: 'Empty device reassign response' } as any });
      return mapCentralDevice(result.device);
    },

    async setDeviceCloneSuspected(this: PlatformAdminApiCore, deviceId: string, suspected: boolean) {
      const result = await this.request<{ device?: CentralDeviceRow }>({
        path: `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/clone-flag`,
        method: 'POST',
        body: { suspected },
      });
      if (!result?.device) throw new CentralApiError({ status: 0, envelope: { success: false, error: 'Empty clone-flag response' } as any });
      return mapCentralDevice(result.device);
    },

    async deleteDevice(this: PlatformAdminApiCore, deviceId: string) {
      await this.request<{ deviceId?: string; deleted?: boolean }>({
        path: `/api/v1/admin/devices/${encodeURIComponent(deviceId)}`,
        method: 'DELETE',
      });
    },

    /** Cross-tenant clone detection; requires full tenant scope server-side. */
    async detectCloneDevices(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<{
        devices: CentralDeviceRow[];
        licenses: CentralLicenseRow[];
        alerts: string[];
        duplicateHwids?: Array<Record<string, any>>;
        overLimitLicenses?: Array<Record<string, any>>;
        suspiciousTransfers?: Array<Record<string, any>>;
      }>({ path: '/api/v1/admin/devices/detect-clones',
        method: 'POST' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data || {}) as {
        devices?: CentralDeviceRow[];
        licenses?: CentralLicenseRow[];
        alerts?: string[];
        duplicateHwids?: Array<Record<string, any>>;
        overLimitLicenses?: Array<Record<string, any>>;
        suspiciousTransfers?: Array<Record<string, any>>;
      };
      return {
        devices: (Array.isArray(data.devices) ? data.devices : []).map(mapCentralDevice),
        licenses: (Array.isArray(data.licenses) ? data.licenses : []).map(mapCentralLicense),
        alerts: Array.isArray(data.alerts) ? data.alerts.map(String) : [],
        duplicateHwids: (Array.isArray(data.duplicateHwids) ? data.duplicateHwids : []).map((row) => ({
          hardwareId: String(row.hardwareId ?? row.hardware_id ?? ''),
          tenants: Array.isArray(row.tenants) ? row.tenants.map(String) : [],
          tenantCount: Number(row.tenantCount ?? row.tenant_count ?? 0) || 0,
        })),
        overLimitLicenses: (Array.isArray(data.overLimitLicenses) ? data.overLimitLicenses : []).map((row) => ({
          licenseId: String(row.licenseId ?? row.license_id ?? ''),
          licenseKey: String(row.licenseKey ?? row.license_key ?? ''),
          tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
          deviceCount: Number(row.deviceCount ?? row.device_count ?? row.active_device_count ?? 0) || 0,
          deviceLimit: Number(row.deviceLimit ?? row.device_limit ?? 0) || 0,
        })),
        suspiciousTransfers: (Array.isArray(data.suspiciousTransfers) ? data.suspiciousTransfers : []).map((row) => ({
          licenseId: String(row.licenseId ?? row.license_id ?? ''),
          licenseKey: String(row.licenseKey ?? row.license_key ?? ''),
          tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
          transferCount: Number(row.transferCount ?? row.transfer_count ?? 0) || 0,
        })),
      };
    },
  };
}
