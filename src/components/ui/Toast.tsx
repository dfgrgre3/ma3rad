import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  show: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
};

const ICONS: Record<ToastKind, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++counter.current;
      setItems((prev) => [...prev.slice(-4), { id, kind, title, message }]);
      window.setTimeout(() => remove(id), kind === 'error' ? 7000 : 4500);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, message) => show('success', title, message),
      error: (title, message) => show('error', title, message),
      warning: (title, message) => show('warning', title, message),
      info: (title, message) => show('info', title, message),
    }),
    [show]
  );

  // Route legacy window.alert() calls through the in-app toast system so no
  // native blocking dialogs remain across the application.
  useEffect(() => {
    const nativeAlert = window.alert;
    const detectKind = (text: string): ToastKind => {
      if (/(خطأ|تعذر|فشل|غير صحيح|لا يمكن|يجب|مطلوب|مسموح)/.test(text)) return 'error';
      if (/(تم |نجاح|بنجاح|حُفظ|حفظ)/.test(text)) return 'success';
      if (/(تحذير|تنبيه|متأخر|منخفض|نفد)/.test(text)) return 'warning';
      return 'info';
    };
    window.alert = (message?: unknown) => {
      const text = message == null ? '' : String(message);
      if (!text) return;
      show(detectKind(text), text);
    };
    return () => { window.alert = nativeAlert; };
  }, [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" dir="rtl">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${STYLES[item.kind]}`}
              role="status"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold">{item.title}</div>
                {item.message && <div className="mt-0.5 text-xs opacity-90 leading-relaxed">{item.message}</div>}
              </div>
              <button onClick={() => remove(item.id)} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
