// Central telemetry & release client for the desktop app.
// Reports unhandled errors and checks for published app releases.
// All operations are best-effort and never block local business operations.

import { CentralLicenseService } from './CentralLicenseService';

export interface ReleaseInfo {
  id: string;
  version: string;
  release_notes: string;
  download_url: string;
  min_required_version: string;
  is_mandatory: number;
  created_at: string;
}

export class CentralTelemetryService {
  static getServerUrl(): string {
    return CentralLicenseService.getServerUrl();
  }

  static async reportError(payload: {
    title?: string;
    description?: string;
    stackTrace?: string;
    issueType?: string;
    severity?: string;
    deviceId?: string;
  }): Promise<void> {
    const base = this.getServerUrl();
    if (!base) return;
    try {
      const cred = CentralLicenseService.getCredential();
      const deviceId = payload.deviceId || CentralLicenseService.getDeviceId();
      await fetch(base + '/api/v1/telemetry/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          deviceCredential: cred,
          title: payload.title || 'Unhandled error',
          description: payload.description || '',
          stackTrace: payload.stackTrace || '',
          issueType: payload.issueType || 'error',
          severity: payload.severity || 'medium',
        }),
      });
    } catch { /* ignore */ }
  }

  static async fetchReleases(): Promise<ReleaseInfo[]> {
    const base = this.getServerUrl();
    if (!base) return [];
    try {
      const cred = CentralLicenseService.getCredential();
      const res = await fetch(base + '/api/v1/releases', {
        headers: cred ? { 'X-Device-Id': CentralLicenseService.getDeviceId(), 'X-Device-Credential': cred } : {},
      });
      if (!res.ok) return [] as ReleaseInfo[];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch { return [] as ReleaseInfo[]; }
  }

  static async checkForUpdates(currentVersion: string): Promise<ReleaseInfo | null> {
    const releases = await this.fetchReleases();
    if (!releases.length) return null;
    const newer = releases.filter(r => r.version && r.version !== currentVersion);
    if (!newer.length) return null;
    newer.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return newer[0];
  }
}