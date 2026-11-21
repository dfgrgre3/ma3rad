// Unified data access for the devices page.
// Branches between the local platform DB (platformAdminService) and the
// central server (centralPlatformClient) exactly like planData.ts.
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../../hooks/platform/useCentralDataSource';
import type {
  PlatformDevice,
  PlatformLicense,
  PlatformTenant,
} from '../../../services/domains/platform/platformTypes';

export class CentralBridgeUnavailableError extends Error {
  constructor() {
    super('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
    this.name = 'CentralBridgeUnavailableError';
  }
}

function assertDataSource(): 'local' | 'central' {
  const central = getCentralDataSourceState();
  if (central.misconfigured) throw new CentralBridgeUnavailableError();
  return central.active ? 'central' : 'local';
}

export function isCentralMode(): boolean {
  const central = getCentralDataSourceState();
  return central.active && !central.misconfigured;
}

export interface CloneDetectionResult {
  alerts: string[];
}

export async function listDevices(query: { tenantId?: string; status?: string } = {}): Promise<PlatformDevice[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listDevices(query);
  }
  const all = platformAdminService.listDevices(query.tenantId);
  return query.status ? all.filter((device) => device.status === query.status) : all;
}

export async function listTenants(): Promise<PlatformTenant[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listTenants();
  }
  return platformAdminService.listTenants();
}

export async function listLicenses(): Promise<PlatformLicense[]> {
  if (assertDataSource() === 'central') {
    return centralPlatformClient.listLicenses();
  }
  return platformAdminService.listLicenses();
}

export async function suspendDevice(deviceId: string, reason?: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.suspendDevice(deviceId, reason);
    return;
  }
  platformAdminService.suspendDevice(deviceId, reason);
}

export async function releaseDevice(deviceId: string, reason?: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.releaseDevice(deviceId, reason);
    return;
  }
  platformAdminService.releaseDevice(deviceId, reason);
}

export async function revokeDevice(deviceId: string, reason?: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.revokeDevice(deviceId, reason);
    return;
  }
  platformAdminService.revokeDevice(deviceId, reason);
}

export async function activateDevice(deviceId: string, reason?: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.activateDevice(deviceId, reason);
    return;
  }
  const device = platformAdminService.getDevice(deviceId);
  if (!device) throw new Error('الجهاز غير موجود.');
  if (device.status === 'REVOKED') throw new Error('لا يمكن إعادة تفعيل جهاز ملغي.');
  platformAdminService.setDeviceStatus(deviceId, 'ACTIVE');
}

/** Local-only parity for the devices page toggle (central has activate/suspend). */
export async function toggleDeviceStatus(deviceId: string): Promise<void> {
  if (assertDataSource() === 'central') {
    throw new Error('تبديل الحالة المباشر غير متاح في الوضع المركزي — استخدم تفعيل/إيقاف.');
  }
  const device = platformAdminService.getDevice(deviceId);
  if (!device) throw new Error('الجهاز غير موجود.');
  platformAdminService.setDeviceStatus(deviceId, device.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
}

export async function deleteDevice(deviceId: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.deleteDevice(deviceId);
    return;
  }
  platformAdminService.deleteDevice(deviceId);
}

export async function setDeviceCloneSuspected(deviceId: string, suspected: boolean): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.setDeviceCloneSuspected(deviceId, suspected);
    return;
  }
  platformAdminService.markDeviceCloneSuspected(deviceId, suspected);
}

export async function reassignDevice(deviceId: string, licenseId: string, reason?: string): Promise<void> {
  if (assertDataSource() === 'central') {
    await centralPlatformClient.reassignDevice(deviceId, licenseId, reason);
    return;
  }
  platformAdminService.reassignDeviceSeat(deviceId, licenseId);
}

/** Central-only: enroll/rotate the device credential (SHA-256 stored server-side). */
export async function enrollDeviceCredential(deviceId: string, credential: string): Promise<void> {
  if (assertDataSource() !== 'central') {
    throw new Error('تسجيل بيانات اعتماد الجهاز متاح في الوضع المركزي فقط.');
  }
  await centralPlatformClient.enrollDeviceCredential(deviceId, credential);
}

export async function detectCloneDevices(): Promise<CloneDetectionResult> {
  if (assertDataSource() === 'central') {
    const result = await centralPlatformClient.detectCloneDevices();
    return { alerts: result.alerts.map(String) };
  }
  const result = platformAdminService.detectCloneDevices();
  const alerts = result.groups.map(
    (group) => `بصمة العتاد ${group.hardwareId} مستخدمة على ${group.devices.length} أجهزة`
  );
  // Parity with the central detector, which persists clone_suspected=1 — flag
  // the local duplicates too so the "suspected only" filter stays meaningful.
  for (const group of result.groups) {
    for (const device of group.devices) {
      if (device.cloneSuspected) continue;
      try {
        platformAdminService.markDeviceCloneSuspected(device.id, true);
      } catch {
        /* read-only actors may lack devices.update — detection still reports */
      }
    }
  }
  return { alerts };
}
