import { CentralLicenseService } from '../licensing/CentralLicenseService';

/**
 * Reverse sync: local `users` mutations are reported to the central platform
 * directory (`platform_tenant_users`) so the super-admin console mirrors what
 * actually exists inside this ERP.
 *
 * The channel is device-authenticated (`X-Device-Id` + credential injected by
 * the Electron bridge); the tenant is resolved server-side from the device.
 *
 * Loop prevention: TenantIdentityProvisioningService wraps every applied
 * provisioning job in `suppress()`, so changes that originated FROM the
 * platform never get reported back.
 *
 * Delivery is best-effort: reports are queued locally and flushed in batches.
 * A failed flush keeps nothing (reports carry full user fields and are
 * idempotent upserts), and reporting never blocks user management.
 */

export type TenantUserSyncReport = {
  event?: 'UPSERT' | 'DELETE';
  identityUserId?: string | null;
  username?: string | null;
  previousUsername?: string | null;
  fullName?: string | null;
  role?: string | null;
  phone?: string | null;
  isActive?: boolean;
};

const REPORT_PATH = '/api/v1/device/tenant-users/report';
const MAX_BATCH = 50;

export class CentralTenantUserSyncService {
  private static suppressDepth = 0;
  private static pending: TenantUserSyncReport[] = [];
  private static flushing = false;

  /** True while provisioning-originated writes are being applied. */
  static isSuppressed(): boolean {
    return this.suppressDepth > 0;
  }

  /** Run `fn` with reverse reporting disabled (used by the provisioning executor). */
  static suppress<T>(fn: () => T): T {
    this.suppressDepth += 1;
    try {
      return fn();
    } finally {
      this.suppressDepth -= 1;
    }
  }

  /** Queue a user mutation for reporting. Never throws, never blocks. */
  static report(change: TenantUserSyncReport): void {
    if (this.isSuppressed()) return;
    this.pending.push(change);
    void this.flush();
  }

  private static async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const status = await CentralLicenseService.getStatus();
      if (!status.configured || !status.activated) return;
      const central = typeof globalThis !== 'undefined' ? (globalThis as any)?.window?.ceramisys?.central : null;
      if (!central || typeof central.request !== 'function') return;

      while (this.pending.length) {
        const batch = this.pending.splice(0, MAX_BATCH);
        try {
          await central.request({
            path: REPORT_PATH,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Device-Id': CentralLicenseService.getDeviceId() },
            body: JSON.stringify({ reports: batch }),
          });
        } catch {
          // Best-effort: a lost batch is acceptable — the next mutation
          // resends the current state of that user.
        }
      }
    } catch {
      // Best-effort: directory sync must never break user management.
    } finally {
      this.flushing = false;
    }
  }
}

export const centralTenantUserSyncService = new CentralTenantUserSyncService();
