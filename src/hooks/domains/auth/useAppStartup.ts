import { useState, useEffect, useRef } from 'react';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { initializeDatabaseAsync } from '../database/useDatabaseAsync';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { CentralLicenseService } from '../../../services/domains/licensing/CentralLicenseService';
import { toAppError } from '../../../errors/appError';
import type { SyncWorker } from '../../../sync/SyncWorker';
import type { User } from '../../../types';

const RUNTIME_SESSION_KEY = 'ceramisys_runtime_initialized';

function hasRuntimeSession(): boolean {
  try { return sessionStorage.getItem(RUNTIME_SESSION_KEY) === '1'; } catch { return false; }
}

function markRuntimeSession(): void {
  try { sessionStorage.setItem(RUNTIME_SESSION_KEY, '1'); } catch { /* ignore */ }
}

export function useAppStartup() {
  const backupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupMaintenanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

        // Inizializza il Web Worker per le operazioni asincrone sul database
        // (evita il congelamento dell'interfaccia quando si premono pulsanti).
        void initializeDatabaseAsync().catch((err) => {
          console.error('Database worker initialization failed:', err);
        });
        startupMaintenanceTimer.current = setTimeout(() => {
          startupMaintenanceTimer.current = null;
          // Heavy maintenance services are loaded on demand so they stay out
          // of the startup bundle and don't compete with first paint.
          void import('../../../services/infrastructure/backup/BackupScheduler')
            .then(({ scheduleAutomaticBackupChecks }) => scheduleAutomaticBackupChecks(backupTimer))
            .catch((error) => console.error('Automatic backup scheduling could not start:', error));
          void Promise.all([
            import('../../../services/domains/notifications/NotificationService'),
            import('../../../services/domains/finance/ConsistencyAuditService'),
            import('../../../services/domains/notifications/LicenseNotificationService'),
          ]).then(([{ NotificationService }, { ConsistencyAuditService }, { LicenseNotificationService }]) => {
            try {
              new NotificationService().runScheduledChecks();
            } catch (error) {
              console.error('Scheduled notifications could not be refreshed:', error);
            }
            // Run the financial/inventory consistency audit once per day
            try {
              new ConsistencyAuditService().runDailyCheck();
            } catch (error) {
              console.error('Daily consistency audit could not run:', error);
            }

            // Run license/subscription expiry check daily
            try {
              const licenseNotificationService = LicenseNotificationService.getInstance();
              licenseNotificationService.runDailyExpiryCheck().catch(err => {
                console.error('Daily license expiry check failed:', err);
              });
            } catch (error) {
              console.error('License notification service could not start:', error);
            }
          }).catch((error) => {
            console.error('Startup maintenance services could not be loaded:', error);
          });
        }, 1000);
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
    void CentralLicenseService.initHardwareBinding();
    initDb();
    const backupTimerCurrent = backupTimer.current;
    return () => {
      if (startupMaintenanceTimer.current) clearTimeout(startupMaintenanceTimer.current);
      if (backupTimerCurrent) clearInterval(backupTimerCurrent);
      void syncWorker.current?.stopAndWait();
      syncWorker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    const bridge = window.ceramisys?.sync;
    const getStatus = bridge?.status;
    const pushEvents = bridge?.pushEvents;
    const pullEvents = bridge?.pullEvents;
    if (!getStatus || !pushEvents || !pullEvents) return;

    let cancelled = false;
    // Sync engine modules are heavy; load them only when the bridge exists.
    void Promise.all([
      import('../../../sync/ElectronSyncTransport'),
      import('../../../sync/SyncEngine'),
      import('../../../sync/SyncWorker'),
      import('../../../sync/MasterDataSyncService'),
      import('../../../sync/SyncPolicyService'),
    ]).then(([{ ElectronSyncTransport }, { SyncEngine }, { SyncWorker }, { MasterDataSyncService }, { SyncPolicyService }]) => {
      if (cancelled) return;
      MasterDataSyncService.configure(null);
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
    }).catch((error) => {
      console.error('Could not load branch synchronization modules:', error);
    });

    return () => {
      cancelled = true;
      void syncWorker.current?.stopAndWait();
      syncWorker.current = null;
      void import('../../../sync/MasterDataSyncService')
        .then(({ MasterDataSyncService }) => MasterDataSyncService.configure(null))
        .catch(() => { /* module unavailable during teardown */ });
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
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void DatabaseManager.getInstance().flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    let reservations: import('../../../services/domains/sales/ReservationService').ReservationService | null = null;
    let cancelled = false;
    const releaseExpired = () => {
      try {
        const result = reservations?.expireOverdue();
        if (result && result.failed > 0) {
          console.warn(`Automatic reservation expiry failed for ${result.failed} reservation(s).`);
        }
      } catch (error) {
        console.error('Automatic reservation expiry could not run:', error);
      }
    };

    // Load the service lazily, then run the expiry on idle/interval.
    void import('../../../services/domains/sales/ReservationService')
      .then(({ ReservationService }) => {
        if (cancelled) return;
        reservations = new ReservationService();
        releaseExpired();
      })
      .catch((error) => console.error('Reservation service could not be loaded:', error));

    // Use requestIdleCallback for non-urgent reservation expiry if available
    const idleCallback = typeof window.requestIdleCallback !== 'undefined'
      ? window.requestIdleCallback
      : null;
    let idleTimer: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (idleCallback) {
      idleTimer = idleCallback(releaseExpired, { timeout: 60000 }); // 60 seconds
    } else {
      timer = setInterval(releaseExpired, 60_000);
    }
    return () => {
      cancelled = true;
      if (idleTimer !== undefined) window.cancelIdleCallback(idleTimer);
      if (timer !== undefined) clearInterval(timer);
    };
  }, [dbReady]);

  return {
    dbReady, initError, recoveryRequired, recoveryBusy, currentUser,
    setCurrentUser, retryInit: initDb, createFreshDatabase,
  };
}
