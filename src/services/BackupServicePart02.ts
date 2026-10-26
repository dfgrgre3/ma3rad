import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import { localDateString } from '../utils/date';
import { BackupServicePart01 } from './BackupServicePart01';

export class BackupServicePart02 extends BackupServicePart01 {
  public async cleanupOldBackups(retentionDays = 90, maxCount = 50): Promise<{ deleted: number; errors: string[] }> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error('Backup retention days must be a positive integer.');
    }
    if (!Number.isInteger(maxCount) || maxCount < 1) {
      throw new Error('Maximum backup count must be a positive integer.');
    }
    const api = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
    if (!api?.info || !api.removeBackup) {
      return { deleted: 0, errors: ['Backup cleanup requires desktop file access'] };
    }

    const dbInfo = await api.info();
    if (!dbInfo.backupDir) {
      return { deleted: 0, errors: ['Backup directory not accessible'] };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    const backups = this.db.query<{
      id: string;
      fileName: string;
      createdAt: string;
    }>(`SELECT id, file_name AS fileName, created_at AS createdAt
       FROM backup_history
       WHERE backup_type = 'AUTO' AND status = 'SUCCESS'
       ORDER BY created_at DESC, id DESC`);

    let deleted = 0;
    const errors: string[] = [];
    for (const [index, backup] of backups.entries()) {
      if (backup.createdAt >= cutoffDateStr && index < maxCount) continue;
      try {
        const result = await api.removeBackup(backup.fileName);
        if (!result.ok) {
          errors.push(`${backup.fileName}: ${result.error || 'File deletion failed'}`);
          continue;
        }
        this.db.run(
          `DELETE FROM backup_history WHERE id = ? AND backup_type = 'AUTO'`,
          [backup.id]
        );
        deleted++;
      } catch (error) {
        errors.push(`${backup.fileName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { deleted, errors };
  }

public getRetentionSettings(): { retentionDays: number; maxBackups: number } {
    const retentionDays = Number(
      this.db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='backupRetentionDays'`)[0]?.value || '90'
    );
    const maxBackups = Number(
      this.db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='backupMaxCount'`)[0]?.value || '50'
    );
    if (!Number.isInteger(retentionDays) || retentionDays < 1 ||
      !Number.isInteger(maxBackups) || maxBackups < 1) {
      throw new Error('Saved backup retention settings are invalid.');
    }
    return { retentionDays, maxBackups };
  }

public setRetentionSettings(retentionDays: number, maxBackups: number): void {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 ||
      !Number.isInteger(maxBackups) || maxBackups < 1) {
      throw new Error('Backup retention settings must be positive integers.');
    }
    this.db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('backupRetentionDays', ?)`, [retentionDays.toString()]);
    this.db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('backupMaxCount', ?)`, [maxBackups.toString()]);
  }
}
