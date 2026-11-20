import React, { memo, useState, useEffect, useCallback } from 'react';
import { HashRouter } from 'react-router-dom';
import { DatabaseManager } from '../database/repositories/databaseManager';
import { logger } from '../utils/logger';
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
// Rare pre-auth platform flows are lazy-loaded so the platform service graph
// stays out of the entry chunk for regular users.
const PlatformStaffInviteAcceptPage = React.lazy(() => import('../pages/platform/PlatformStaffInviteAcceptPage').then(m => ({ default: m.PlatformStaffInviteAcceptPage })));
const PlatformOwnerSetupPage = React.lazy(() => import('../pages/platform/PlatformOwnerSetupPage').then(m => ({ default: m.PlatformOwnerSetupPage })));
const SetupWizard = React.lazy(() => import('../components/setup/SetupWizard').then(m => ({ default: m.SetupWizard })));
const CentralActivationGate = React.lazy(() => import('../components/setup/CentralActivationGate').then(m => ({ default: m.CentralActivationGate })));
import { ForcePasswordChangeModal } from '../components/auth/ForcePasswordChangeModal';
import { ThemeProvider } from '../contexts/ThemeProvider';
import { ToastProvider } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { UpdateNotification } from '../components/shared/UpdateNotification';
import { CentralRestoreNotification } from '../components/shared/CentralRestoreNotification';
import { useAppStartup } from '../hooks/domains/auth/useAppStartup';
import { useAppSession } from '../hooks/domains/auth/useAppSession';
import { securityService, auditLogger, performanceMonitor, localCache, systemHealth, CentralTelemetryService } from '../services';

export const App: React.FC = () => {
  const {
    dbReady, initError, recoveryRequired, recoveryBusy, currentUser,
    setCurrentUser, retryInit, createFreshDatabase,
  } = useAppStartup();

  // Add loading state for initialization
  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState(0);

  const [showSetup, setShowSetup] = useState(false);
  const [activationComplete, setActivationComplete] = useState(
    BYPASS_FIRST_RUN_ACTIVATION
  );
  // activationChecked stays false until the stored credential read settles, so
  // the gate never flashes for an already-activated device.
  const [activationChecked, setActivationChecked] = useState(
    BYPASS_FIRST_RUN_ACTIVATION
  );
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const centralActive = activationComplete && !BYPASS_FIRST_RUN_ACTIVATION;
  // تم تعطيل فحص الترخيص ليظهر التطبيق دائماً بدون ع interruption (ملفات الكود محفوظة)
  const _SKIP_LICENSE_CHECK = true;
  const [licenseRetrying, _setLicenseRetrying] = useState(false);

  useEffect(() => {
    if (BYPASS_FIRST_RUN_ACTIVATION) {
      setIsInitializing(false);
      return;
    }

    let active = true;
    const totalSteps = 6;
    void CentralLicenseService.hasCompletedFirstRunActivation().then((complete) => {
      if (active) {
        setActivationComplete(complete);
        setActivationChecked(true);
      }
    }).catch((error: unknown) => {
      logger.error('Could not read the central activation state:', error instanceof Error ? error : new Error(String(error)));
      if (active) setActivationChecked(true);
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
        logger.error('Application monitoring services could not start:', error instanceof Error ? error : new Error(String(error)));
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

  const handleSessionExpired = useCallback(() => setCurrentUser(null), [setCurrentUser]);
  const handleLogout = useCallback(() => {
    AuthService.logout();
    setCurrentUser(null);
  }, [setCurrentUser]);
  const handleSwitchUser = useCallback((userId: string) => {
    setCurrentUser(AuthService.switchToUser(userId));
  }, [setCurrentUser]);

  useAppSession(dbReady, currentUser, handleSessionExpired);

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
    let cancelled = false;
    const evaluateSetupState = async () => {
      try {
        const db = DatabaseManager.getInstance();
        const tableRows = await db.queryAsync<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table'`
        );
        const tables = new Set(tableRows.map(({ name }) => name));
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
        const hasBusinessData = (await Promise.all(businessTables.map(async (table) =>
          tables.has(table)
            ? (await db.queryAsync(`SELECT 1 FROM "${table}" LIMIT 1`)).length > 0
            : false
        ))).some(Boolean)
          || (tables.has('users')
            && (await db.queryAsync(`SELECT 1 FROM users WHERE lower(username) <> 'admin' LIMIT 1`)).length > 0)
          || (await Promise.all(['companies', 'branches', 'warehouses'].map(async (table) =>
            tables.has(table)
              ? (await db.queryAsync(`SELECT 1 FROM "${table}" LIMIT 1 OFFSET 1`)).length > 0
              : false
          ))).some(Boolean);
        const legacySettings = await db.queryAsync<{ key: string; value: string }>(
          `SELECT key, value FROM system_settings
           WHERE key IN ('showroomName', 'businessType', 'businessProfileConfig', 'enabledModules')`
        );
        if (cancelled) return;
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
        if (cancelled) return;
        // Fail closed: never open a mutating first-run wizard when setup state
        // cannot be determined safely.
        setShowSetup(false);
      }
    };
    void evaluateSetupState();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser]);

  // Pre-auth platform staff invitation: /#/accept-staff-invite/<token>
  // Declared before any conditional return so the hook order stays stable.
  const staffInviteToken = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.hash.match(/#\/accept-staff-invite\/([A-Za-z0-9]+)/);
    return match?.[1] ?? null;
  }, []);

  // Pre-auth platform owner initialization: /#/platform-owner-setup
  // The single legitimate path for minting the SUPER_ADMIN role.
  const ownerSetupRequested = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /#\/platform-owner-setup/.test(window.location.hash);
  }, []);

  if (licenseBlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-primary px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-2xl font-black text-danger">!</div>
          <h1 className="text-xl font-black text-ink">تعذر التحقق من الترخيص</h1>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            انتهت فترة العمل دون اتصال أو رفض الخادم صلاحية هذا الجهاز. تحقق من الاتصال أو تواصل مع مسؤول النظام.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => void checkLicense()}
              disabled={licenseRetrying}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-primary disabled:opacity-60"
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
      <main className="min-h-screen bg-surface-sunken text-ink">
        <header aria-hidden="true" className="flex h-14 items-center justify-between border-b border-line bg-surface px-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-sunken" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-surface-sunken" />
        </header>
        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <aside aria-hidden="true" className="hidden w-60 shrink-0 border-l border-line bg-surface p-4 lg:block">
            <div className="mb-6 h-4 w-24 animate-pulse rounded bg-surface-sunken" />
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="h-9 animate-pulse rounded-lg bg-surface-sunken" />
              ))}
            </div>
          </aside>
          <section className="min-w-0 flex-1 p-4 md:p-7">
            {initError ? (
              <div role="alert" className="mx-auto mt-10 max-w-xl rounded-xl border border-danger-border bg-surface p-6 shadow-sm">
                <h1 className="text-base font-bold text-danger">تعذر تجهيز التطبيق</h1>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{initError}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={retryInit} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary">
                    إعادة المحاولة
                  </button>
                  {recoveryRequired && window.ceramisys?.db?.createFreshAfterRecovery && (
                    <button onClick={() => void createFreshDatabase()} disabled={recoveryBusy} className="rounded-lg bg-danger px-5 py-2.5 text-sm font-bold text-white hover:bg-danger disabled:opacity-50">
                      {recoveryBusy ? 'جارٍ أرشفة القاعدة...' : 'أرشفة القاعدة وبدء قاعدة جديدة'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div role="status" aria-live="polite" className="mb-6 flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  لحظات ونجهّز مساحة العمل...
                </div>
                <div aria-hidden="true" className="mb-6 h-7 w-48 animate-pulse rounded bg-surface-sunken" />
                <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-xl border border-line bg-surface" />
                  ))}
                </div>
                <div aria-hidden="true" className="mt-5 h-72 animate-pulse rounded-xl border border-line bg-surface" />
              </>
            )}
          </section>
        </div>
        <UpdateNotification />
      </main>
    );
  }

  // Central activation gate: commercial builds require the device to be
  // activated on the platform before login and before the setup wizard. It
  // covers the fresh install (pre-login) and any stale session on a device
  // that lost its credential. Platform staff roles are exempt — they manage
  // the platform itself and use their own auth flow.
  if (!BYPASS_FIRST_RUN_ACTIVATION) {
    if (!activationChecked) {
      return (
        <main className="min-h-screen bg-surface-sunken text-ink">
          <div className="flex min-h-screen items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-bold text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              جارٍ التحقق من تفعيل الجهاز...
            </div>
          </div>
          <UpdateNotification />
        </main>
      );
    }
    const platformStaffRoles = [
      'SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER',
    ];
    const staffExempt = Boolean(currentUser) && platformStaffRoles.includes(String(currentUser!.role));
    // Pre-auth platform flows (owner bootstrap, staff invite) manage the
    // platform itself and must not be blocked by the device gate.
    const platformFlow = ownerSetupRequested || Boolean(staffInviteToken);
    if (!activationComplete && !staffExempt && !platformFlow) {
      return (
        <>
          <React.Suspense fallback={null}>
            <CentralActivationGate onComplete={() => setActivationComplete(true)} />
          </React.Suspense>
          <UpdateNotification />
        </>
      );
    }
  }

  // Pre-auth platform staff invitation: /#/accept-staff-invite/<token>
  if (!currentUser) {
    if (ownerSetupRequested) {
      return (
        <React.Suspense fallback={null}>
          <PlatformOwnerSetupPage onSuccess={setCurrentUser} />
          <UpdateNotification />
        </React.Suspense>
      );
    }
    if (staffInviteToken) {
      return (
        <React.Suspense fallback={null}>
          <PlatformStaffInviteAcceptPage
            token={staffInviteToken}
            onSuccess={(user) => {
              if (typeof window !== 'undefined') window.location.hash = '#/platform';
              setCurrentUser(user);
            }}
          />
          <UpdateNotification />
        </React.Suspense>
      );
    }
    return (
      <>
        <LoginPage onSuccess={setCurrentUser} />
        <UpdateNotification />
      </>
    );
  }

  // Platform staff have their own forced-password-change flow (PlatformLayout),
  // because the ERP ForcePasswordChangeModal targets the `users` table only.
  const isPlatformStaffRole = Boolean(currentUser) && [
    'SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS_ENGINEER', 'BILLING_SPECIALIST', 'LICENSE_MANAGER',
  ].includes(String(currentUser!.role));

  return (
    <ThemeProvider ready={dbReady}>
      <ToastProvider>
        <ErrorBoundary>
          {!BYPASS_FIRST_RUN_SETUP && !showSetup && !isPlatformStaffRole && (currentUser?.mustChangePassword || currentUser?.securityKeySetupRequired) && (
            <ForcePasswordChangeModal user={currentUser} onSuccess={(u) => setCurrentUser(u)} />
          )}
          <UpdateNotification />
          <CentralRestoreNotification />
          {showSetup ? (
            <React.Suspense fallback={null}>
            <SetupWizard
              onComplete={(configuredAdmin) => {
                setShowSetup(false);
                setCurrentUser((current) => configuredAdmin ?? (current ? { ...current, mustChangePassword: false } : current));
              }}
            />
            </React.Suspense>
          ) : (
            <HashRouter>
              <AppRouter
                key={centralConfigTick}
                currentUser={currentUser}
                onLogout={handleLogout}
                onSwitchUser={handleSwitchUser}
              />
            </HashRouter>
          )}
          {dbReady && currentUser && <DatabasePersistenceStatus />}
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default memo(App);
