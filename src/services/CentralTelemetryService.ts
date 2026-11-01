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
  static async reportError(payload: {
    title?: string;
    description?: string;
    stackTrace?: string;
    issueType?: string;
    severity?: string;
    deviceId?: string;
  }): Promise<void> {
    await CentralLicenseService.postTelemetryError({
      deviceId: payload.deviceId,
      title: payload.title || 'Unhandled error',
      description: payload.description || '',
      stackTrace: payload.stackTrace || '',
      issueType: payload.issueType || 'error',
      severity: payload.severity || 'medium',
    });
  }

  static async fetchReleases(): Promise<ReleaseInfo[]> {
    const data = await CentralLicenseService.fetchReleases();
    return data as ReleaseInfo[];
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