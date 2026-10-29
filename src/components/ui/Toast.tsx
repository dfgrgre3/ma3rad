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
  success: 'border-[#d9d9d9] border-r-[3px] border-r-[#107c10] bg-white text-[#1b1b1b] dark:border-[#3d3d3d] dark:border-r-[#6cc36c] dark:bg-[#2b2b2b] dark:text-[#f0f0f0]',
  error: 'border-[#d9d9d9] border-r-[3px] border-r-[#c42b1c] bg-white text-[#1b1b1b] dark:border-[#3d3d3d] dark:border-r-[#f1707b] dark:bg-[#2b2b2b] dark:text-[#f0f0f0]',
  warning: 'border-[#d9d9d9] border-r-[3px] border-r-[#9d5d00] bg-white text-[#1b1b1b] dark:border-[#3d3d3d] dark:border-r-[#e0a54a] dark:bg-[#2b2b2b] dark:text-[#f0f0f0]',
  info: 'border-[#d9d9d9] border-r-[3px] border-r-[#0078d4] bg-white text-[#1b1b1b] dark:border-[#3d3d3d] dark:border-r-[#4aa3e0] dark:bg-[#2b2b2b] dark:text-[#f0f0f0]',
};

const ICON_TONES: Record<ToastKind, string> = {
  success: 'text-[#107c10] dark:text-[#6cc36c]',
  error: 'text-[#c42b1c] dark:text-[#f1707b]',
  warning: 'text-[#9d5d00] dark:text-[#e0a54a]',
  info: 'text-[#0078d4] dark:text-[#4aa3e0]',
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
      window.setTimeout(() => remove(id), 3000);
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
              className={`flex items-start gap-3 rounded-[2px] border px-3 py-2.5 ${STYLES[item.kind]}`}
              role="status"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_TONES[item.kind]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">{item.title}</div>
                {item.message && <div className="mt-0.5 text-[11.5px] leading-relaxed opacity-85">{item.message}</div>}
              </div>
              <button onClick={() => remove(item.id)} className="rounded-[2px] p-0.5 opacity-60 hover:opacity-100" aria-label="إغلاق">
                <X className="h-3.5 w-3.5" />
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
