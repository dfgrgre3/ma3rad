import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import { localDateString } from '../utils/date';

export class BackupServicePart01 {
protected db = DatabaseManager.getInstance();

private require(): { id: string; fullName: string } {
    const user = AuthService.requireAuth();
    PermissionService.require(user, 'settings.backup');
    return user;
  }

public async exportBackupFile(): Promise<void> {
    const user = this.require();
    await this.db.flush();
    const binary = this.db.exportDatabaseBinary();
    const inspection = this.verifyBackupFile(binary);
    if (!inspection.valid) throw new Error(`تعذر التحقق من النسخة الحالية: ${inspection.error || inspection.integrity}`);
    const blob = new Blob([binary as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `ceramics_erp_backup_${localDateString()}_${Date.now().toString().slice(-4)}.sqlite`;
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

public verifyBackupFile(bytes: Uint8Array) {
    return this.db.inspectDatabaseBinary(bytes);
  }

public async restoreBackupFromFile(file: File): Promise<{
    productsCount: number;
    invoicesCount: number;
    customersCount: number;
    journalEntriesCount: number;
  }> {
    const user = this.require();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Validate integrity and inspect contents before replacing live database
    const inspection = this.verifyBackupFile(bytes);
    if (!inspection.valid) {
      throw new Error(`الملف تالف أو غير صالح للاستعادة: ${inspection.error || inspection.integrity}`);
    }

    // Preserve the current, fully flushed database before replacing it.
    await this.db.flush();
    const currentSnapshot = this.db.exportDatabaseBinary();
    const preRestore = await this.createLocalSnapshot('pre_restore', user);
    if (!preRestore.ok) {
      throw new Error(`لم يتم الاستعادة لأن إنشاء نسخة ما قبل الاستعادة فشل: ${preRestore.error || 'unknown error'}`);
    }

    // Import and replace active database
    try {
      this.db.importDatabaseBinary(bytes);
      await this.db.flush();
    } catch (restoreError) {
      try {
        this.db.importDatabaseBinary(currentSnapshot);
        await this.db.flush();
      } catch (rollbackError) {
        throw new Error(`Restore failed (${restoreError instanceof Error ? restoreError.message : String(restoreError)}); rollback also failed (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}). The pre-restore snapshot remains at ${preRestore.path || 'the configured backup location'}.`);
      }
      throw restoreError;
    }
    const restored = this.verifyBackupFile(this.db.exportDatabaseBinary());
    if (!restored.valid) {
      this.db.importDatabaseBinary(currentSnapshot);
      await this.db.flush();
      throw new Error(`فشل التحقق بعد الاستعادة، وتمت إعادة قاعدة البيانات السابقة: ${restored.error || restored.integrity}`);
    }

    new AuditService().log({
      userId: user.id,
      userName: user.fullName,
      action: 'استعادة نسخة احتياطية (استبدال قاعدة البيانات)',
      module: 'SYSTEM',
      newValues: JSON.stringify({
        fileName: file.name,
        bytes: bytes.length,
        invoices: inspection.invoicesCount,
        products: inspection.productsCount,
      }),
    });

    return {
      productsCount: inspection.productsCount,
      invoicesCount: inspection.invoicesCount,
      customersCount: inspection.customersCount,
      journalEntriesCount: inspection.journalEntriesCount,
    };
  }

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
    } else {
      this.db.run(
        `INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, backup_type, status)
         VALUES (?, ?, ?, 0, ?, 'FAILED')`,
        [`bak_${uuidv4().substring(0, 8)}`, label, 'N/A', label.toUpperCase()]
      );
    }
    return result;
  }

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
    const rows = this.db.query(
      `SELECT * FROM backup_history WHERE backup_type = 'AUTO' AND status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1`
    );
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
