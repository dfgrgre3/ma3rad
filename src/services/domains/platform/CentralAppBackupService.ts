import type { CentralAppBackupInfo } from '../../../types/electron';
import { BackupService } from '../../infrastructure/backup/BackupService';

/**
 * Tenant application (ERP) backup channel to the central platform.
 *
 * Uploads the device's own encrypted .sqlite.enc backup to the central server
 * (stored opaquely — the server cannot read business data) and applies
 * platform-requested restores through the standard verified local restore
 * flow (snapshot → import → rollback on failure).
 */
export class CentralAppBackupService {
  private readonly backupService = new BackupService();

  private bridge() {
    const bridge = typeof window !== 'undefined' ? window.ceramisys?.centralAppBackup : undefined;
    if (!bridge) {
      throw new Error('قناة النسخ الاحتياطي المركزي تتطلب تشغيل تطبيق سطح المكتب.');
    }
    return bridge;
  }

  async status(): Promise<{ configured: boolean; activated: boolean }> {
    return (await this.bridge().status?.()) ?? { configured: false, activated: false };
  }

  async listBackups(): Promise<CentralAppBackupInfo[]> {
    return (await this.bridge().list?.()) ?? [];
  }

  async pendingRestore(): Promise<CentralAppBackupInfo | null> {
    return (await this.bridge().pending?.()) ?? null;
  }

  /**
   * Creates a fresh encrypted local backup and uploads it to the central
   * platform under this device's tenant.
   */
  async createAndUploadBackup(type: 'FULL' | 'INCREMENTAL' | 'MANUAL' = 'MANUAL'): Promise<CentralAppBackupInfo> {
    const createBackup = window.ceramisys?.db?.backup;
    if (!createBackup) throw new Error('إنشاء النسخة المحلية يتطلب تشغيل تطبيق سطح المكتب.');
    const local = await createBackup('central');
    if (!local?.ok || !local.path) {
      throw new Error(local?.error || 'فشل إنشاء النسخة المحلية قبل الرفع.');
    }
    const fileName = local.path.split(/[\\/]/).pop();
    if (!fileName) throw new Error('تعذر تحديد اسم ملف النسخة المحلية.');
    return this.bridge().upload!({ fileName, name: fileName, type });
  }

  /**
   * Applies the pending central restore request (if any) using the standard
   * verified restore flow, then reports the terminal state back to the
   * platform. Returns null when nothing is pending.
   */
  async applyPendingRestore(): Promise<{ applied: boolean; backup?: CentralAppBackupInfo | null }> {
    const pending = await this.pendingRestore();
    if (!pending) return { applied: false };

    const report = this.bridge().reportResult!;
    try {
      const fetched = await this.bridge().fetchRestore!({ id: pending.id });
      const file = new File(
        [new Uint8Array(fetched.bytes)],
        `${pending.name || pending.id}.sqlite`,
        { type: 'application/octet-stream' }
      );
      await this.backupService.restoreBackupFromFile(file);
      await report({ id: pending.id, status: 'COMPLETED' });
      return { applied: true, backup: pending };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await report({ id: pending.id, status: 'FAILED', error: message });
      } catch { /* reporting failure must not mask the original error */ }
      throw error;
    }
  }
}
