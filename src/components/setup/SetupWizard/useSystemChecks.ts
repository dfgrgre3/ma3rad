import { useEffect, useState } from 'react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { CHECKING_RESULT } from './setupConstants';
import type { SetupSystemChecks } from './setupTypes';

export function useSystemChecks(systemCheckAttempt: number): SetupSystemChecks {
  const [systemChecks, setSystemChecks] = useState<SetupSystemChecks>({
    database: CHECKING_RESULT,
    storage: CHECKING_RESULT,
    backup: CHECKING_RESULT,
    version: 'غير متاح',
  });

  useEffect(() => {
    let active = true;
    const loadSystemChecks = async () => {
      const db = DatabaseManager.getInstance();
      const next: SetupSystemChecks = {
        database: CHECKING_RESULT,
        storage: CHECKING_RESULT,
        backup: CHECKING_RESULT,
        version: 'غير متاح',
      };
      setSystemChecks(next);

      try {
        const integrity = db.query<{ quick_check: string }>('PRAGMA quick_check');
        if (integrity.length === 1 && integrity[0].quick_check === 'ok') {
          next.database = { state: 'ready', detail: 'فحص SQLite سليم.' };
        } else {
          next.database = { state: 'error', detail: 'أعاد فحص SQLite نتيجة غير سليمة.' };
        }
      } catch (error) {
        next.database = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const [fileInfo, appInfo] = await Promise.all([
          window.ceramisys?.db?.info?.(),
          window.ceramisys?.app?.info?.(),
        ]);
        if (appInfo?.version) next.version = appInfo.version;
        if (!fileInfo) {
          next.storage = { state: 'warning', detail: 'تعذر التحقق من ملف قاعدة البيانات عبر تطبيق سطح المكتب.' };
        } else if (fileInfo.error) {
          next.storage = { state: 'error', detail: fileInfo.error };
        } else if (fileInfo.exists && fileInfo.bytes > 0) {
          next.storage = {
            state: 'ready',
            detail: `ملف محلي موجود (${(fileInfo.bytes / (1024 * 1024)).toFixed(2)} ميجابايت).`,
          };
        } else {
          next.storage = { state: 'warning', detail: 'لم يُعثر على ملف قاعدة بيانات محفوظ بعد.' };
        }
      } catch (error) {
        next.storage = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const backup = db.query<{ fileName: string; createdAt: string }>(
          `SELECT file_name AS fileName, created_at AS createdAt
           FROM backup_history WHERE status = 'SUCCESS'
           ORDER BY created_at DESC LIMIT 1`
        )[0];
        next.backup = backup
          ? {
            state: 'warning',
            detail: `آخر نسخة ناجحة مسجلة: ${backup.createdAt}. لم يتم التحقق من وجود ملف النسخة.`,
          }
          : { state: 'warning', detail: 'لم تُسجل نسخة احتياطية ناجحة بعد.' };
      } catch (error) {
        next.backup = {
          state: 'error',
          detail: error instanceof Error ? error.message : String(error),
        };
      }

      if (active) setSystemChecks(next);
    };

    void loadSystemChecks();
    return () => { active = false; };
  }, [systemCheckAttempt]);

  return systemChecks;
}
