import React, { useState, useEffect, useRef } from 'react';
import { DatabaseManager } from '../../database/repositories/databaseManager';
import { useToast } from '../ui/Toast';

export const DatabasePersistenceStatus: React.FC = () => {
  const database = DatabaseManager.getInstance();
  const toast = useToast();
  const [state, setState] = useState(database.getPersistenceStatus());
  const stateSignature = useRef(`${state.status}|${state.code || ''}|${state.error || ''}`);
  const [showSaved, setShowSaved] = useState(false);
  const [showUnencryptedWarning, setShowUnencryptedWarning] = useState(true);
  const previousStatus = useRef(state.status);
  const hasCompletedInitialPersistence = useRef(state.status === 'saved');
  const lastShownPersistenceError = useRef<string | null>(null);
  const savedTimeout = useRef<number | null>(null);

  useEffect(() => {
    const warningTimeout = window.setTimeout(() => setShowUnencryptedWarning(false), 3000);
    const refresh = () => {
      const next = database.getPersistenceStatus();
      if (next.status === 'saved') {
        if (previousStatus.current === 'saving' && hasCompletedInitialPersistence.current) {
          setShowSaved(true);
          if (savedTimeout.current !== null) window.clearTimeout(savedTimeout.current);
          savedTimeout.current = window.setTimeout(() => setShowSaved(false), 3000);
        }
        hasCompletedInitialPersistence.current = true;
      }
      if (next.status === 'error' || next.status === 'unavailable') {
        const failureKey = `${next.status}:${next.code || ''}:${next.error || ''}`;
        if (lastShownPersistenceError.current !== failureKey) {
          lastShownPersistenceError.current = failureKey;
          toast.error(
            next.status === 'unavailable'
              ? 'تعذر تحديد وسيط حفظ قاعدة البيانات'
              : `فشل حفظ قاعدة البيانات [${next.code || 'DATABASE_PERSIST_FAILED'}]`,
            next.error || 'تعذر تحديد سبب الخطأ. تحقق من مساحة القرص وصلاحية مجلد بيانات التطبيق.'
          );
        }
      } else if (next.status === 'saved') {
        lastShownPersistenceError.current = null;
      }
      previousStatus.current = next.status;
      const signature = `${next.status}|${next.code || ''}|${next.error || ''}`;
      if (stateSignature.current !== signature) {
        stateSignature.current = signature;
        setState(next);
      }
    };
    refresh();
    // Poll cheaply; only commit to React state when the signature changed.
    const timer = window.setInterval(refresh, 500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(warningTimeout);
      if (savedTimeout.current !== null) window.clearTimeout(savedTimeout.current);
    };
  }, [database, toast]);

  if (state.status === 'saved' && showSaved) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full border border-success-border bg-surface/95 px-3 py-1.5 text-[11px] font-bold text-success shadow-lg"
      >
        تم حفظ البيانات
      </div>
    );
  }
  if (state.status === 'saving') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full border border-warning-border bg-surface/95 px-3 py-1.5 text-[11px] font-bold text-warning shadow-lg"
      >
        جارٍ حفظ التغييرات…
      </div>
    );
  }
  if (state.status === 'unencrypted' && showUnencryptedWarning) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-xs font-bold text-warning shadow-xl"
      >
        تُحفظ البيانات في تخزين المتصفح غير المشفر. استخدم تطبيق سطح المكتب لحماية قاعدة البيانات المحلية.
      </div>
    );
  }
  return null;
};
