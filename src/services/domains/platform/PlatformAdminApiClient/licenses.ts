// License & device endpoints: issuing, renew/suspend/revoke/reactivate/transfer,
// device seat management and cross-tenant clone detection.
import type { PlatformAdminApiCore } from './core';
import { CentralApiError, mapCentralDevice, mapCentralLicense } from './core';
import type {
  CentralLicenseIssueRequest,
  CentralLicenseIssueResponse,
  PlatformLicense,
  PlatformDevice,
} from '../platformTypes';

async function deviceAction(
  client: PlatformAdminApiCore,
  id: string,
  action: 'suspend' | 'release' | 'revoke',
  reason?: string
): Promise<any> {
  return client.request<any>({
    path: `/api/v1/admin/devices/${encodeURIComponent(id)}/${action}`,
    method: 'POST',
    body: { reason },
  });
}

export interface LicenseApi {
  renewLicense(this: PlatformAdminApiCore, licenseId: string, months: number): Promise<any>;
  suspendLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<any>;
  revokeLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<any>;
  issueLicense(this: PlatformAdminApiCore, input: CentralLicenseIssueRequest): Promise<CentralLicenseIssueResponse>;
  listLicenses(this: PlatformAdminApiCore, search?: string, status?: string): Promise<PlatformLicense[]>;
  reactivateLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string): Promise<any>;
  transferLicense(this: PlatformAdminApiCore, licenseId: string, newHardwareId: string, reason?: string): Promise<any>;
  listDevices(this: PlatformAdminApiCore, query?: { tenantId?: string; status?: string }): Promise<PlatformDevice[]>;
  suspendDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<any>;
  releaseDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<any>;
  revokeDevice(this: PlatformAdminApiCore, deviceId: string, reason?: string): Promise<any>;
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
    async renewLicense(this: PlatformAdminApiCore, licenseId: string, months: number) {
      return this.request<any>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/renew`,
        method: 'POST',
        body: { months },
      });
    },

    async suspendLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<any>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/suspend`,
        method: 'POST',
        body: { reason },
      });
    },

    async revokeLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<any>({
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
      const rows = await this.request<any[]>({ path: `/api/v1/admin/licenses${qs ? `?${qs}` : ''}`, method: 'GET' });
      return (Array.isArray(rows) ? rows : []).map(mapCentralLicense);
    },

    async reactivateLicense(this: PlatformAdminApiCore, licenseId: string, reason?: string) {
      return this.request<any>({
        path: `/api/v1/admin/licenses/${encodeURIComponent(licenseId)}/reactivate`,
        method: 'POST',
        body: { reason },
      });
    },

    /** Bind/move a license to a hardware id (central transfer endpoint). */
    async transferLicense(this: PlatformAdminApiCore, licenseId: string, newHardwareId: string, reason?: string) {
      return this.request<any>({
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
      const rows = await this.request<any[]>({ path: `/api/v1/admin/devices${qs ? `?${qs}` : ''}`, method: 'GET' });
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

    /** Cross-tenant clone detection; requires full tenant scope server-side. */
    async detectCloneDevices(this: PlatformAdminApiCore) {
      const envelope = await this.requestEnvelope<{
        devices: any[];
        licenses: any[];
        alerts: string[];
        duplicateHwids?: any[];
        overLimitLicenses?: any[];
        suspiciousTransfers?: any[];
      }>({ path: '/api/v1/admin/devices/detect-clones',
        method: 'POST' });
      if (envelope.success === false) {
        throw new CentralApiError({ status: 0, envelope });
      }
      const data = (envelope.data as any) || {};
      return {
        devices: (Array.isArray(data.devices) ? data.devices : []).map(mapCentralDevice),
        licenses: (Array.isArray(data.licenses) ? data.licenses : []).map(mapCentralLicense),
        alerts: Array.isArray(data.alerts) ? data.alerts.map(String) : [],
        duplicateHwids: (Array.isArray(data.duplicateHwids) ? data.duplicateHwids : []).map((row: any) => ({
          hardwareId: String(row.hardwareId ?? row.hardware_id ?? ''),
          tenants: Array.isArray(row.tenants) ? row.tenants.map(String) : [],
          tenantCount: Number(row.tenantCount ?? row.tenant_count ?? 0) || 0,
        })),
        overLimitLicenses: (Array.isArray(data.overLimitLicenses) ? data.overLimitLicenses : []).map((row: any) => ({
          licenseId: String(row.licenseId ?? row.license_id ?? ''),
          licenseKey: String(row.licenseKey ?? row.license_key ?? ''),
          tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
          deviceCount: Number(row.deviceCount ?? row.device_count ?? row.active_device_count ?? 0) || 0,
          deviceLimit: Number(row.deviceLimit ?? row.device_limit ?? 0) || 0,
        })),
        suspiciousTransfers: (Array.isArray(data.suspiciousTransfers) ? data.suspiciousTransfers : []).map((row: any) => ({
          licenseId: String(row.licenseId ?? row.license_id ?? ''),
          licenseKey: String(row.licenseKey ?? row.license_key ?? ''),
          tenantId: String(row.tenantId ?? row.tenant_id ?? ''),
          transferCount: Number(row.transferCount ?? row.transfer_count ?? 0) || 0,
        })),
      };
    },
  };
}
