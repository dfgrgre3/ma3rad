import React from 'react';
import type { BackupService } from './BackupService';
import { SettingsService } from './SettingsService';

export async function maintainAutomaticBackups(backupService: BackupService, interval: number): Promise<void> {
  try {
    const result = await backupService.runAutoBackupIfDue(interval);
    if (result.error) console.warn('Auto backup failed:', result.error);
    const retention = backupService.getRetentionSettings();
    const cleanup = await backupService.cleanupOldBackups(retention.retentionDays, retention.maxBackups);
    if (cleanup.errors.length > 0) {
      console.warn('Automatic backup retention cleanup failed:', cleanup.errors.join('; '));
    }
  } catch (error) {
    console.warn('Automatic backup maintenance failed:', error);
  }
}

export function runAutomaticBackupCheck(BackupServiceClass: typeof BackupService): void {
  try {
    const interval = SettingsService.getSettings().autoBackupIntervalHours || 24;
    void maintainAutomaticBackups(new BackupServiceClass(), interval);
  } catch (error) {
    console.warn('Auto backup skipped:', error);
  }
}

export function scheduleAutomaticBackupChecks(
  backupTimer: React.MutableRefObject<ReturnType<typeof setInterval> | null>
): void {
  void import('./BackupService').then(({ BackupService: BackupServiceClass }) => {
    if (backupTimer.current) clearInterval(backupTimer.current);
    runAutomaticBackupCheck(BackupServiceClass);
    backupTimer.current = setInterval(() => runAutomaticBackupCheck(BackupServiceClass), 15 * 60 * 1000);
  });
}
