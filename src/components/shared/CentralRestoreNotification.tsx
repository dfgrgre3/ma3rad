import { useEffect, useState } from 'react';
import type { CentralAppBackupInfo } from '../../types/electron';

/**
 * Global banner shown when the central platform has requested an ERP
 * application-database restore for this device. The main process polls the
 * pending-restore endpoint and pushes events through the preload bridge.
 * Applying the restore remains an explicit user action on the backup page.
 */
export function CentralRestoreNotification() {
  const [pending, setPending] = useState<CentralAppBackupInfo | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.ceramisys?.centralAppBackup;
    if (!bridge?.onPendingRestore) return;
    return bridge.onPendingRestore((next) => {
      setPending(next);
      if (!next) setDismissedId(null);
    });
  }, []);

  if (!pending || pending.id === dismissedId) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[110] w-[min(92vw,420px)]" dir="rtl">
      <section
        role="alert"
        aria-live="assertive"
        className="overflow-hidden rounded-2xl border border-amber-300 bg-white text-slate-900 shadow-2xl dark:border-amber-700 dark:bg-slate-900 dark:text-white"
      >
        <div className="bg-amber-600 px-4 py-3 text-white">
          <div className="text-sm font-black">استعادة بيانات مطلوبة من منصة الإدارة</div>
          <div className="mt-1 text-xs text-amber-100">
            {pending.name || pending.id} — بانتظار تطبيقها على هذا الجهاز
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
            طلبت الإدارة المركزية استعادة نسخة احتياطية لقاعدة بيانات هذا الجهاز.
            سيُتحقق من النسخة المشفرة وسلامتها قبل تطبيقها، ويمكنك مراجعة الطلب
            وبدء التطبيق من صفحة النسخ الاحتياطي.
          </p>
          {pending.restoreError && (
            <p className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              آخر خطأ مسجل: {pending.restoreError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { window.location.hash = '/backup'; }}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              فتح صفحة النسخ الاحتياطي
            </button>
            <button
              type="button"
              onClick={() => setDismissedId(pending.id)}
              aria-label="إخفاء الإشعار"
              className="rounded px-2 text-lg leading-5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
