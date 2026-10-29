import React, { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { DatabaseManager } from './database/db';
import { AuthService } from './services/AuthService';
import { SettingsService } from './services/SettingsService';
import { DatabasePersistenceStatus } from './components/DatabasePersistenceStatus';
import { AppRouter } from './router';
import { LoginPage } from './pages/auth/LoginPage';
import { SetupWizard } from './components/SetupWizard';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { useAppStartup } from './hooks/useAppStartup';
import { useAppSession } from './hooks/useAppSession';
import { securityService, auditLogger, performanceMonitor, localCache, systemHealth } from './services';

export const App: React.FC = () => {
  const {
    dbReady, initError, recoveryRequired, recoveryBusy, currentUser,
    setCurrentUser, retryInit, createFreshDatabase,
  } = useAppStartup();

  const [showSetup, setShowSetup] = useState(false);

  // تهيئة الخدمات الأمنية ومؤقتات المراقبة
  useEffect(() => {
    // تفعيل الخدمات الأمنية
    securityService.initialize();
    auditLogger.initialize();
    performanceMonitor.startMonitoring();
    systemHealth.startHealthCheck();
    // نظام الذاكرة السريعة
    localCache.set('app_initialized', true, 24 * 60 * 60 * 1000);
  }, []);

  useAppSession(dbReady, currentUser, () => setCurrentUser(null));

  useEffect(() => {
    if (!currentUser) return;
    try {
      const completed = SettingsService.getValue('setup_completed') === '1';
      const db = DatabaseManager.getInstance();
      const products = db.query<{ count: number }>('SELECT COUNT(*) AS count FROM products')[0]?.count || 0;
      const invoices = db.query<{ count: number }>('SELECT COUNT(*) AS count FROM sales_invoices')[0]?.count || 0;
      setShowSetup(!completed && products === 0 && invoices === 0);
    } catch {
      setShowSetup(false);
    }
  }, [currentUser?.id]);

  if (!dbReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-100 text-slate-900 select-none px-4">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-sky-500/30 text-3xl font-black">
            C
          </div>
          {!initError && <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 animate-ping opacity-20" />}
        </div>
        <h1 className="text-xl font-black tracking-wide text-slate-900 mb-1">CeramiSys ERP</h1>
        <p className="text-sm text-slate-600 mb-4">نظام إدارة معارض السيراميك ومواد التشطيب</p>
        {initError ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-5 py-3 rounded-xl text-center max-w-sm">{initError}</div>
            <button onClick={retryInit} className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg">إعادة المحاولة</button>
            {recoveryRequired && window.ceramisys?.db?.createFreshAfterRecovery && (
              <button onClick={() => void createFreshDatabase()} disabled={recoveryBusy} className="px-6 py-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg disabled:opacity-50">
                {recoveryBusy ? 'جارٍ أرشفة القاعدة...' : 'أرشفة القاعدة وبدء قاعدة جديدة'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-sky-600 font-medium animate-pulse">جاري تهيئة قاعدة بيانات SQLite...</p>
        )}
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onSuccess={setCurrentUser} />;
  }

  return (
    <ThemeProvider ready={dbReady}>
      <ToastProvider>
        <ErrorBoundary>
          {!showSetup && currentUser?.mustChangePassword && (
            <ForcePasswordChangeModal user={currentUser} onSuccess={(u) => setCurrentUser(u)} />
          )}
          {showSetup ? (
            <SetupWizard
              onComplete={() => {
                setShowSetup(false);
                setCurrentUser((c) => (c ? { ...c, mustChangePassword: false } : c));
              }}
            />
          ) : (
            <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRouter currentUser={currentUser} onLogout={() => { AuthService.logout(); setCurrentUser(null); }} />
            </HashRouter>
          )}
          {dbReady && currentUser && <DatabasePersistenceStatus />}
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
