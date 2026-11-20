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
    <div className="fixed bottom-4 right-4 z-[110] w-[min(92vw,420px)]">
      <section
        role="alert"
        aria-live="assertive"
        className="overflow-hidden rounded-2xl border border-warning bg-surface text-ink shadow-2xl dark:text-white"
      >
        <div className="bg-warning px-4 py-3 text-white">
          <div className="text-sm font-black">استعادة بيانات مطلوبة من منصة الإدارة</div>
          <div className="mt-1 text-xs text-warning">
            {pending.name || pending.id} — بانتظار تطبيقها على هذا الجهاز
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs leading-5 text-ink-secondary ">
            طلبت الإدارة المركزية استعادة نسخة احتياطية لقاعدة بيانات هذا الجهاز.
            سيُتحقق من النسخة المشفرة وسلامتها قبل تطبيقها، ويمكنك مراجعة الطلب
            وبدء التطبيق من صفحة النسخ الاحتياطي.
          </p>
          {pending.restoreError && (
            <p className="rounded-lg bg-danger-soft p-2 text-[11px] text-danger dark:bg-danger/40 ">
              آخر خطأ مسجل: {pending.restoreError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { window.location.hash = '/backup'; }}
              className="rounded-lg bg-warning px-3 py-2 text-xs font-bold text-white hover:bg-warning"
            >
              فتح صفحة النسخ الاحتياطي
            </button>
            <button
              type="button"
              onClick={() => setDismissedId(pending.id)}
              aria-label="إخفاء الإشعار"
              className="rounded px-2 text-lg leading-5 text-muted hover:bg-surface-sunken dark:hover:bg-primary"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
