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

/**
 * مقارنة بسيطة بأجزاء رقمية للإصدارات (1.10 > 1.9، 1.1.5 > 1.1.4).
 * تُرجع true فقط عندما يكون الإصدار المقترح أحدث من الإصدار الحالي.
 */
export function isNewerVersion(currentVersion: string, version: string): boolean {
  const candidate = String(version || '');
  if (!candidate) return false;
  const currentParts = String(currentVersion || '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const candidateParts = candidate
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(currentParts.length, candidateParts.length);
  for (let index = 0; index < length; index += 1) {
    const currentSegment = currentParts[index] || 0;
    const candidateSegment = candidateParts[index] || 0;
    if (currentSegment !== candidateSegment) return candidateSegment > currentSegment;
  }
  return false;
}

/** أحدث إصدار أحدث من الإصدار الحالي (آخر نشر). */
export function getLatestNewerRelease(releases: ReleaseInfo[], currentVersion: string): ReleaseInfo | null {
  const newer = (releases || [])
    .map((release) => ({ ...release, version: String(release?.version || '') }))
    .filter((release) => release.version && isNewerVersion(currentVersion, release.version));
  if (!newer.length) return null;
  newer.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return newer[0];
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
    const latest = getLatestNewerRelease(releases as ReleaseInfo[], currentVersion);
    if (!latest) return null;
    return {
      id: String(latest.id ?? ''),
      version: String(latest.version || ''),
      release_notes: typeof latest.release_notes === 'string' ? latest.release_notes : '',
      download_url: String(latest.download_url || ''),
      min_required_version: String(latest.min_required_version || '0.0.0'),
      is_mandatory: latest.is_mandatory ? 1 : 0,
      created_at: String(latest.created_at || ''),
    };
  }
}