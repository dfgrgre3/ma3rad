import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter } from 'react-router-dom';
import { DatabaseManager } from '../database/repositories/databaseManager';
import { AuthService } from '../services/domains/auth/AuthService';
import { CentralLicenseService } from '../services/domains/licensing/CentralLicenseService';
import { CentralConfigApplier } from '../services/domains/licensing/CentralConfigApplier';
import { CentralEstablishmentService } from '../services/domains/licensing/CentralEstablishmentService';
import { SettingsService } from '../services/domains/config/SettingsService';
import { AppConfigService } from '../services/domains/config/AppConfigService';
import {
  shouldShowFirstRunSetup,
  BYPASS_FIRST_RUN_ACTIVATION,
  BYPASS_FIRST_RUN_SETUP,
} from '../config/setupLifecycle';
import { APP_VERSION } from '../config/appVersion';
import { DatabasePersistenceStatus } from '../components/shared/DatabasePersistenceStatus';
import { AppRouter } from '../router';
import { LoginPage } from '../pages/auth/login/LoginPage';
import { SetupWizard } from '../components/setup/SetupWizard';
import { ForcePasswordChangeModal } from '../components/auth/ForcePasswordChangeModal';
import { ThemeProvider } from '../contexts/ThemeProvider';
import { ToastProvider } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { UpdateNotification } from '../components/shared/UpdateNotification';
import { useAppStartup } from '../hooks/domains/auth/useAppStartup';
import { useAppSession } from '../hooks/domains/auth/useAppSession';
import { securityService, auditLogger, performanceMonitor, localCache, systemHealth, CentralTelemetryService } from '../services';

export const App: React.FC = () => {
  const {
    dbReady, initError, recoveryRequired, recoveryBusy, currentUser,
    setCurrentUser, retryInit, createFreshDatabase,
  } = useAppStartup();

  const [showSetup, setShowSetup] = useState(false);
  const [activationComplete, setActivationComplete] = useState(
    BYPASS_FIRST_RUN_ACTIVATION
  );
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const centralActive = activationComplete && !BYPASS_FIRST_RUN_ACTIVATION;
  // تم تعطيل فحص الترخيص ليظهر التطبيق دائماً بدون ع interruption (ملفات الكود محفوظة)
  const SKIP_LICENSE_CHECK = true;
  const [licenseRetrying, setLicenseRetrying] = useState(false);

  useEffect(() => {
    if (BYPASS_FIRST_RUN_ACTIVATION) return;
    let active = true;
    void CentralLicenseService.hasCompletedFirstRunActivation().then((complete) => {
      if (active) setActivationComplete(complete);
    }).catch((error: unknown) => {
      console.error('Could not read the central activation state:', error);
      if (active) setActivationComplete(false);
    });
    return () => { active = false; };
  }, []);

  const checkLicense = useCallback(async () => {
    // تم تعطيل الفحص بالكامل - الترخيص مدعوم Always
    setLicenseBlocked(false);
    return;
  }, []);

  useEffect(() => {
    if (!centralActive) return;
    // تم تعطيل فحص الترخيص الدوري
    return;
  }, [centralActive]);

  const [centralConfigTick, setCentralConfigTick] = useState(CentralLicenseService.getConfigRevision());

  useEffect(() => {
    if (!centralActive) return;
    CentralConfigApplier.apply();
  }, [centralActive]);
  useEffect(() => {
    if (!centralActive || !dbReady) return;
    const refreshConfig = async () => {
      const cfg = await CentralLicenseService.fetchConfig();
      if (cfg) {
        CentralConfigApplier.apply();
        setCentralConfigTick(CentralLicenseService.getConfigRevision());
      }
    };
    const refreshEstablishment = async () => {
      await CentralEstablishmentService.sync();
    };
    const refreshAll = async () => {
      await refreshConfig();
      await refreshEstablishment();
    };

    void refreshAll();
    const configTimer = setInterval(() => void refreshConfig(), 60 * 1000);
    const establishmentTimer = setInterval(() => void refreshEstablishment(), 60 * 60 * 1000);
    let lastRefreshAt = 0;
    const MIN_REFRESH_INTERVAL_MS = 15 * 1000;
    const onFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshAt = now;
      void refreshAll();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      clearInterval(configTimer);
      clearInterval(establishmentTimer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [centralActive, dbReady]);

  useEffect(() => {
    if (!centralActive) return;
    void CentralLicenseService.heartbeat();
    const timer = setInterval(() => void CentralLicenseService.heartbeat(), 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [centralActive]);

  // تحديثات التطبيق المركزية: عندما يصدر منشأة مركزية إصدار أحدث،
  // يُشغَّل تدفق التحديث الحقيقي (الفحص → التنزيل → التثبيت) عبر واجهة التطبيق.
  useEffect(() => {
    if (!centralActive) return;
    let active = true;
    let lastReleaseCheckAt = 0;
    const MIN_RELEASE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
    const runReleaseCheck = async () => {
      const now = Date.now();
      if (now - lastReleaseCheckAt < MIN_RELEASE_CHECK_INTERVAL_MS) return;
      lastReleaseCheckAt = now;
      try {
        const update = await CentralTelemetryService.checkForUpdates(APP_VERSION);
        if (active && update) {
          const check = window.ceramisys?.updater?.check;
          if (typeof check === 'function') {
            void check().catch((error: unknown) => {
              console.warn('[updates] Real update check could not be started:', error);
            });
          }
        }
      } catch {
        // تحديد إصدار التحديثات مركزيًا لا يُعطل تشغيل التطبيق.
      }
    };
    const onFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void runReleaseCheck();
    };
    void runReleaseCheck();
    const releaseTimer = setInterval(() => void runReleaseCheck(), MIN_RELEASE_CHECK_INTERVAL_MS);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      active = false;
      clearInterval(releaseTimer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [centralActive]);

  // Start database-backed monitoring only after migrations and persistence finish.
  useEffect(() => {
    if (!dbReady) return;
    let active = true;
    const startMonitoring = async () => {
      try {
        await securityService.initialize();
        if (active) await systemHealth.startHealthCheck();
      } catch (error) {
        console.error('Application monitoring services could not start:', error);
      }
    };
    void startMonitoring();
    localCache.set('app_initialized', true, 24 * 60 * 60 * 1000);
    return () => {
      active = false;
      performanceMonitor.stopMonitoring();
      systemHealth.stopHealthCheck();
      auditLogger.stopScheduledFlush();
    };
  }, [dbReady]);

  useAppSession(dbReady, currentUser, () => setCurrentUser(null));

  // Numbering templates are resolved by the configuration engine; installing
  // the formatter keeps every existing nextNumber() caller compatible.
  useEffect(() => {
    if (!dbReady) return;
    try {
      AppConfigService.installNumbering();
    } catch {
      // A database created before migration 101 keeps the built-in format.
    }
  }, [dbReady]);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const db = DatabaseManager.getInstance();
      const tables = new Set(db.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table'`
      ).map(({ name }) => name));
      const businessTables = [
        'products', 'customers', 'suppliers', 'sales_invoices', 'purchase_invoices',
        'purchase_orders', 'purchase_requests', 'sales_returns', 'purchase_returns',
        'sales_orders', 'quotations', 'goods_receipts', 'inventory_transactions',
        'stock_movements', 'inventory_adjustments', 'inventory_transfers', 'stock_counts',
        'customer_payments', 'supplier_payments', 'cash_transactions', 'expenses',
        'projects', 'employees', 'employee_contracts', 'employee_leave_requests',
        'deliveries', 'documents', 'contracts', 'leads', 'manufacturing_orders',
        'journal_entries',
      ];
      const hasBusinessData = businessTables.some((table) =>
        tables.has(table) && db.query(`SELECT 1 FROM "${table}" LIMIT 1`).length > 0
      ) || (tables.has('users')
        && db.query(`SELECT 1 FROM users WHERE lower(username) <> 'admin' LIMIT 1`).length > 0)
        || ['companies', 'branches', 'warehouses'].some((table) =>
          tables.has(table) && db.query(`SELECT 1 FROM "${table}" LIMIT 1 OFFSET 1`).length > 0
        );
      const legacySettings = db.query<{ key: string; value: string }>(
        `SELECT key, value FROM system_settings
         WHERE key IN ('showroomName', 'businessType', 'businessProfileConfig', 'enabledModules')`
      );
      const hasLegacyConfiguration = legacySettings.some(({ key, value }) =>
        (key === 'showroomName' && value.trim().length > 0)
        || (key !== 'showroomName' && value.trim().length > 0 && value.trim() !== '{}')
      );
      setShowSetup(BYPASS_FIRST_RUN_SETUP ? false : shouldShowFirstRunSetup({
        completed: SettingsService.getValue('setup_completed') === '1',
        hasBusinessData,
        hasLegacyConfiguration,
      }));
    } catch {
      // Fail closed: never open a mutating first-run wizard when setup state
      // cannot be determined safely.
      setShowSetup(false);
    }
  }, [currentUser?.id]);

  if (licenseBlocked) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl font-black text-rose-700">!</div>
          <h1 className="text-xl font-black text-slate-900">تعذر التحقق من الترخيص</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            انتهت فترة العمل دون اتصال أو رفض الخادم صلاحية هذا الجهاز. تحقق من الاتصال أو تواصل مع مسؤول النظام.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => void checkLicense()}
              disabled={licenseRetrying}
              className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-sky-800 disabled:opacity-60"
            >
              {licenseRetrying ? 'جارٍ التحقق...' : 'إعادة المحاولة'}
            </button>
          </div>
        </div>
        <UpdateNotification />
      </main>
    );
  }

  if (!dbReady) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-100 text-slate-800">
        <header aria-hidden="true" className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" />
        </header>
        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <aside aria-hidden="true" className="hidden w-60 shrink-0 border-l border-slate-200 bg-white p-4 lg:block">
            <div className="mb-6 h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </aside>
          <section className="min-w-0 flex-1 p-4 md:p-7">
            {initError ? (
              <div role="alert" className="mx-auto mt-10 max-w-xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
                <h1 className="text-base font-bold text-red-700">تعذر تجهيز التطبيق</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">{initError}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={retryInit} className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800">
                    إعادة المحاولة
                  </button>
                  {recoveryRequired && window.ceramisys?.db?.createFreshAfterRecovery && (
                    <button onClick={() => void createFreshDatabase()} disabled={recoveryBusy} className="rounded-lg bg-rose-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">
                      {recoveryBusy ? 'جارٍ أرشفة القاعدة...' : 'أرشفة القاعدة وبدء قاعدة جديدة'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div role="status" aria-live="polite" className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-sky-600" />
                  لحظات ونجهّز مساحة العمل...
                </div>
                <div aria-hidden="true" className="mb-6 h-7 w-48 animate-pulse rounded bg-slate-200" />
                <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
                  ))}
                </div>
                <div aria-hidden="true" className="mt-5 h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
              </>
            )}
          </section>
        </div>
        <UpdateNotification />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginPage onSuccess={setCurrentUser} />
        <UpdateNotification />
      </>
    );
  }

  return (
    <ThemeProvider ready={dbReady}>
      <ToastProvider>
        <ErrorBoundary>
          {!BYPASS_FIRST_RUN_SETUP && !showSetup && (currentUser?.mustChangePassword || currentUser?.securityKeySetupRequired) && (
            <ForcePasswordChangeModal user={currentUser} onSuccess={(u) => setCurrentUser(u)} />
          )}
          <UpdateNotification />
          {showSetup ? (
            <SetupWizard
              onComplete={(configuredAdmin) => {
                setShowSetup(false);
                setCurrentUser((current) => configuredAdmin ?? (current ? { ...current, mustChangePassword: false } : current));
              }}
            />
          ) : (
            <HashRouter>
              <AppRouter
                key={centralConfigTick}
                currentUser={currentUser}
                onLogout={() => { AuthService.logout(); setCurrentUser(null); }}
                onSwitchUser={(userId) => setCurrentUser(AuthService.switchToUser(userId))}
              />
            </HashRouter>
          )}
          {dbReady && currentUser && <DatabasePersistenceStatus />}
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
