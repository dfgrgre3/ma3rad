import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Keyboard, LayoutDashboard, ShoppingCart, X } from 'lucide-react';

interface ShortcutsHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<[string, string]>;
}

const GLOBAL_SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + K', 'البحث الشامل في الصفحات والمنتجات والعملاء والفواتير'],
  ['F1', 'عرض شاشة الاختصارات هذه'],
  ['Ctrl + B', 'طي أو توسيع القائمة الجانبية'],
  ['Alt + 1…9', 'فتح الشاشات المفضلة بالترتيب'],
  ['Esc', 'إغلاق النافذة أو القائمة الحالية'],
  ['Tab', 'الانتقال بين عناصر الشاشة'],
  ['Enter', 'تنفيذ الإجراء المحدد'],
];

const POS_SHORTCUTS: Array<[string, string]> = [
  ['F2', 'البحث السريع عن منتج أو تركيز حقل الباركود'],
  ['F3', 'البحث عن عميل واختياره'],
  ['F4', 'إدخال المبلغ المدفوع'],
  ['F5', 'تحديث قائمة المنتجات والأرصدة'],
  ['F6', 'التنقل بين طرق الدفع'],
  ['F7', 'الانتقال إلى حقل خصم الفاتورة'],
  ['F8', 'تعليق الفاتورة الحالية'],
  ['F9', 'اعتماد وحفظ الفاتورة'],
  ['F10', 'فتح أو إغلاق الفواتير المعلقة'],
  ['Delete', 'حذف المنتج المحدد من السلة'],
  ['+ / -', 'زيادة أو تقليل كمية المنتج المحدد'],
];

export function ShortcutsHelpDialog({ open, onClose }: ShortcutsHelpDialogProps) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onPosScreen = location.pathname === '/pos' || location.pathname.startsWith('/pos/');

  const groups = useMemo<ShortcutGroup[]>(() => {
    const all: ShortcutGroup[] = [
      { id: 'global', title: 'في كل البرنامج', icon: LayoutDashboard, items: GLOBAL_SHORTCUTS },
      { id: 'pos', title: 'داخل شاشة الكاشير (نقطة البيع)', icon: ShoppingCart, items: POS_SHORTCUTS },
    ];
    return onPosScreen ? all : [all[0]];
  }, [onPosScreen]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[112] flex items-start justify-center bg-slate-950/30 p-4 pt-[10vh] backdrop-blur-sm">
      <button
        type="button"
        aria-label="إغلاق نافذة الاختصارات"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full border-0 bg-transparent p-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
        tabIndex={-1}
        className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="rounded-lg bg-sky-50 p-2 text-sky-600 dark:bg-sky-950 dark:text-sky-300">
            <Keyboard className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="shortcuts-help-title" className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              اختصارات لوحة المفاتيح
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اعمل أسرع بدون استخدام الفأرة. اضغط F1 في أي وقت لفتح هذه النافذة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {groups.map((group) => (
            <section key={group.id} className="mb-4 last:mb-0" aria-label={group.title}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                <group.icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                {group.title}
              </h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                {group.items.map(([keys, description]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-2 text-xs last:border-b-0 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{description}</span>
                    <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-sky-300" dir="ltr">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {!onPosScreen && (
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              شاشة الكاشير لها اختصارات أسرع من F2 إلى F10 وتظهر تلقائياً عند فتحها.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShortcutsHelpDialog;
