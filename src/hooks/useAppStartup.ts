import { useState, useEffect, useRef } from 'react';
import { DatabaseManager } from '../database/db';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { scheduleAutomaticBackupChecks } from '../services/BackupScheduler';
import { toAppError } from '../errors/appError';
import { ElectronSyncTransport } from '../sync/ElectronSyncTransport';
import { SyncEngine } from '../sync/SyncEngine';
import { SyncWorker } from '../sync/SyncWorker';
import { MasterDataSyncService } from '../sync/MasterDataSyncService';
import { SyncPolicyService } from '../sync/SyncPolicyService';
import type { User } from '../types';

const RUNTIME_SESSION_KEY = 'ceramisys_runtime_initialized';

function hasRuntimeSession(): boolean {
  try { return sessionStorage.getItem(RUNTIME_SESSION_KEY) === '1'; } catch { return false; }
}

function markRuntimeSession(): void {
  try { sessionStorage.setItem(RUNTIME_SESSION_KEY, '1'); } catch { /* ignore */ }
}

export function useAppStartup() {
  const backupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncWorker = useRef<SyncWorker | null>(null);
  const startupCompleted = useRef(false);
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const initDb = () => {
    setInitError(null);
    setRecoveryRequired(false);
    DatabaseManager.getInstance()
      .initialize()
      .then(() => {
        if (startupCompleted.current) return;
        startupCompleted.current = true;
        const restoreCurrentRuntimeSession = hasRuntimeSession();
        if (!restoreCurrentRuntimeSession) AuthService.clearPersistedSession();
        markRuntimeSession();

        PermissionService.seed();
        setCurrentUser(restoreCurrentRuntimeSession ? AuthService.restoreSession() : null);
        setDbReady(true);
        scheduleAutomaticBackupChecks(backupTimer);
        void import('../services/NotificationService').then(({ NotificationService }) => {
          try { new NotificationService().runScheduledChecks(); } catch { /* ignore */ }
        });
      })
      .catch((err) => {
        const failure = toAppError(err, 'DATABASE_INITIALIZATION_FAILED', 'حدث خطأ أثناء تحميل قاعدة البيانات.');
        setInitError(failure.message);
        setRecoveryRequired(failure.code === 'DATABASE_RECOVERY_REQUIRED');
      });
  };

  const createFreshDatabase = async () => {
    const confirmed = window.confirm('سيتم أرشفة ملف قاعدة البيانات الحالي وبدء قاعدة جديدة فارغة. هل تريد المتابعة؟');
    if (!confirmed) return;
    setRecoveryBusy(true);
    try {
      await DatabaseManager.getInstance().createFreshAfterRecovery();
      initDb();
    } catch (error) {
      setInitError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveryBusy(false);
    }
  };

  useEffect(() => {
    initDb();
    return () => {
      if (backupTimer.current) clearInterval(backupTimer.current);
      void syncWorker.current?.stopAndWait();
      syncWorker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    MasterDataSyncService.configure(null);
    const bridge = window.ceramisys?.sync;
    const getStatus = bridge?.status;
    const pushEvents = bridge?.pushEvents;
    const pullEvents = bridge?.pullEvents;
    if (!getStatus || !pushEvents || !pullEvents) return;

    let cancelled = false;
    void getStatus()
      .then((configuration) => {
        if (cancelled || !configuration.clientConfigured || !configuration.clientIdentity) {
          if (configuration.error) console.error('Branch synchronization configuration error:', configuration.error);
          return;
        }
        MasterDataSyncService.configure(configuration.clientIdentity);
        const engine = new SyncEngine({
          scope: configuration.clientIdentity.tenantId,
          transport: new ElectronSyncTransport({
            pushEvents: (events) => pushEvents(events),
            pullEvents: (scope, cursor, limit) => pullEvents(scope, cursor, limit),
          }),
        });
        const syncData = new MasterDataSyncService();
        syncData.registerHandlers(engine.dispatcher);
        new SyncPolicyService().publishUnmanagedPolicies();
        const worker = new SyncWorker(engine, 5000);
        syncWorker.current = worker;
        if (window.ceramisys) {
          window.ceramisys.sync = {
            ...(window.ceramisys.sync ?? {}),
            runSyncNow: async () => {
              await worker.tick();
            },
          };
        }
        worker.start();
        void worker.tick().then(() => {
          const status = engine.status();
          if (status.lastError) console.error('Automatic branch synchronization failed:', status.lastError);
        });
      })
      .catch((error) => {
        console.error('Could not initialize automatic branch synchronization:', error);
      });

    return () => {
      cancelled = true;
      void syncWorker.current?.stopAndWait();
      syncWorker.current = null;
      MasterDataSyncService.configure(null);
    };
  }, [dbReady]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.ceramisys?.app?.onBeforeClose) {
      return window.ceramisys.app.onBeforeClose(async (requestId) => {
        try {
        await syncWorker.current?.stopAndWait();
        await DatabaseManager.getInstance().flush();
        window.ceramisys?.app?.notifyCloseReady?.(requestId, { ok: true });
        } catch (err) {
          window.ceramisys?.app?.notifyCloseReady?.(requestId, { ok: false, error: String(err) });
        }
      });
    }
    const onBeforeUnload = () => { void DatabaseManager.getInstance().flush(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return {
    dbReady, initError, recoveryRequired, recoveryBusy, currentUser,
    setCurrentUser, retryInit: initDb, createFreshDatabase,
  };
}
