import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';

export class BackupService {
  private db = DatabaseManager.getInstance();

  private require(): { id: string; fullName: string } {
    const user = AuthService.requireAuth();
    PermissionService.require(user, 'settings.backup');
    return user;
  }

  public exportBackupFile(): void {
    const user = this.require();
    const binary = this.db.exportDatabaseBinary();
    const blob = new Blob([binary as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `ceramics_erp_backup_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.sqlite`;
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    this.db.run(
      `INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, backup_type, status)
       VALUES (?, ?, ?, ?, 'MANUAL_DOWNLOAD', 'SUCCESS')`,
      [`bak_${uuidv4().substring(0, 8)}`, fileName, 'Browser / User Download', binary.length]
    );

    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: 'تصدير نسخة احتياطية',
      module: 'SYSTEM',
      newValues: JSON.stringify({ fileName, bytes: binary.length }),
    });
  }

  public async restoreBackupFromFile(file: File): Promise<void> {
    const user = this.require();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Validate before replacing the live database.
    this.db.importDatabaseBinary(bytes);

    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: 'استعادة نسخة احتياطية (استبدال قاعدة البيانات)',
      module: 'SYSTEM',
      newValues: JSON.stringify({ fileName: file.name, bytes: bytes.length }),
    });
  }

  /** Creates a snapshot in the managed backups folder (no user session needed). */
  public async createLocalSnapshot(label = 'manual', actor?: { id: string; fullName: string }): Promise<{ ok: boolean; path?: string; error?: string }> {
    const api = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    if (!api?.backup) return { ok: false, error: 'النسخ التلقائي متاح داخل تطبيق سطح المكتب فقط' };

    await this.db.flush();
    const result = await api.backup(label);
    if (result?.ok) {
      this.db.run(
        `INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, backup_type, status)
         VALUES (?, ?, ?, ?, ?, 'SUCCESS')`,
        [
          `bak_${uuidv4().substring(0, 8)}`,
          result.path ? result.path.split(/[\\/]/).pop() : label,
          result.path || null,
          result.bytes || 0,
          label.toUpperCase(),
        ]
      );
      new AuditService().log({
        userId: actor?.id || 'system',
        userName: actor?.fullName || 'النظام',
        action: 'نسخة احتياطية تلقائية',
        module: 'SYSTEM',
        newValues: JSON.stringify({ path: result.path, bytes: result.bytes }),
      });
    }
    return result;
  }

  /** Runs a snapshot only when the configured interval has elapsed. */
  public async runAutoBackupIfDue(intervalHours: number): Promise<{ created: boolean; path?: string; error?: string }> {
    try {
      if (!this.isBackupDue(intervalHours)) return { created: false };
      const result = await this.createLocalSnapshot('auto');
      return { created: Boolean(result.ok), path: result.path, error: result.error };
    } catch (e) {
      return { created: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  public async openBackupFolder(): Promise<void> {
    await window.ceramisys?.app?.openFolder?.('backups');
  }

  public getBackupHistory(): any[] {
    this.require();
    return this.db.query(`SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50`);
  }

  public getLastBackup(): any | null {
    const rows = this.db.query(`SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 1`);
    return rows[0] || null;
  }

  public isBackupDue(intervalHours: number): boolean {
    const last = this.getLastBackup();
    if (!last) return true;
    const lastAt = new Date(last.createdAt || last.created_at).getTime();
    if (!Number.isFinite(lastAt)) return true;
    return Date.now() - lastAt >= Math.max(1, intervalHours) * 60 * 60 * 1000;
  }
}
