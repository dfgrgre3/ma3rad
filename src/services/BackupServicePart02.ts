import { DatabaseManager } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import { AuditService } from './AuditService';
import { localDateString } from '../utils/date';
import { BackupServicePart01 } from './BackupServicePart01';

export class BackupServicePart02 extends BackupServicePart01 {
public async cleanupOldBackups(retentionDays = 90, maxCount = 50): Promise<{ deleted: number; errors: string[] }> {
    try {
      const api = typeof window !== 'undefined' ? window.ceramisys?.db : undefined;
      if (!api?.info) return { deleted: 0, errors: ['Backup cleanup requires desktop app'] };

      const dbInfo = await api.info();
      if (!dbInfo.backupDir) return { deleted: 0, errors: ['Backup directory not accessible'] };

      // Get all backup files from filesystem (requires IPC extension)
      // For now, we'll clean up from backup_history table only
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      // Delete old backup history records
      const beforeDelete = this.db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM backup_history WHERE created_at < ? AND backup_type = ?',
        [cutoffDateStr, 'AUTO']
      )[0]?.count || 0;

      this.db.run(
        `DELETE FROM backup_history WHERE created_at < ? AND backup_type = 'AUTO'`,
        [cutoffDateStr]
      );

      const afterDelete = this.db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM backup_history WHERE created_at < ? AND backup_type = ?',
        [cutoffDateStr, 'AUTO']
      )[0]?.count || 0;

      const deletedOldCount = beforeDelete - afterDelete;

      // Keep only the most recent maxCount records
      const totalBackups = this.db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM backup_history'
      )[0]?.count || 0;

      if (totalBackups > maxCount) {
        const toDelete = totalBackups - maxCount;
        this.db.run(`
          DELETE FROM backup_history
          WHERE id IN (
            SELECT id FROM backup_history
            ORDER BY created_at ASC
            LIMIT ?
          )
        `, [toDelete]);
      }

      return { deleted: deletedOldCount || 0, errors: [] };
    } catch (e) {
      return { deleted: 0, errors: [e instanceof Error ? e.message : String(e)] };
    }
  }

public getRetentionSettings(): { retentionDays: number; maxBackups: number } {
    try {
      const retentionDays = parseInt(
        this.db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='backupRetentionDays'`)[0]?.value || '90',
        10
      );
      const maxBackups = parseInt(
        this.db.query<{ value: string }>(`SELECT value FROM system_settings WHERE key='backupMaxCount'`)[0]?.value || '50',
        10
      );
      return { retentionDays, maxBackups };
    } catch {
      return { retentionDays: 90, maxBackups: 50 };
    }
  }

public setRetentionSettings(retentionDays: number, maxBackups: number): void {
    this.db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('backupRetentionDays', ?)`, [retentionDays.toString()]);
    this.db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('backupMaxCount', ?)`, [maxBackups.toString()]);
  }
}
