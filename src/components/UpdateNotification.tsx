import { useEffect, useState } from 'react';

interface UpdateStatus {
  status: 'idle' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  version?: string;
  releaseName?: string;
  releaseNotes?: string;
  mandatory?: boolean;
  progress?: number;
  error?: string;
}

export function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [installError, setInstallError] = useState('');

  useEffect(() => {
    const updater = window.ceramisys?.updater;
    if (!updater?.getStatus || !updater.onStatus) return;
    let active = true;
    const unsubscribe = updater.onStatus((status) => {
      if (active) {
        setUpdate(status);
        setInstallError('');
      }
    });
    void updater.getStatus().then((status) => {
      if (active) setUpdate(status);
    }).catch((error: unknown) => {
      console.error('[updater] Could not read update status:', error);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!update || ['idle', 'checking', 'not-available'].includes(update.status)) return null;
  const optional = !update.mandatory;
  const title = update.releaseName || `الإصدار ${update.version || 'الجديد'}`;

  if (collapsed && optional) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[110] rounded-full bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-xl"
        dir="rtl"
      >
        تحديث {update.status === 'downloaded' ? 'جاهز' : 'جارٍ التحميل'} · v{update.version}
      </button>
    );
  }

  return (
    <div className={update.mandatory
      ? 'fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4'
      : 'fixed bottom-4 right-4 z-[110]'}>
      <section
        role={update.mandatory ? 'alert' : 'status'}
        aria-live={update.mandatory ? 'assertive' : 'polite'}
        dir="rtl"
        className="w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-sky-200 bg-white text-slate-900 shadow-2xl dark:border-sky-800 dark:bg-slate-900 dark:text-white"
      >
        <div className="flex items-start justify-between gap-3 bg-sky-700 px-4 py-3 text-white">
          <div>
            <div className="text-sm font-black">
              {update.mandatory ? 'تحديث إلزامي متاح' : 'يتوفر تحديث جديد'} · v{update.version}
            </div>
            {title !== `الإصدار ${update.version || 'الجديد'}` && (
              <div className="mt-1 text-xs text-sky-100">{title}</div>
            )}
          </div>
          {optional && (
            <button type="button" onClick={() => setCollapsed(true)} aria-label="تصغير إشعار التحديث" className="rounded px-2 text-lg leading-5 text-white/80 hover:bg-white/10">
              ×
            </button>
          )}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            الإصدار الحالي {update.currentVersion} · الإصدار الأحدث {update.version}
          </p>
          {update.releaseNotes && (
            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {update.releaseNotes}
            </div>
          )}
          {update.status === 'downloading' && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>يتم تنزيل التحديث في الخلفية...</span>
                <span>{Math.round(update.progress || 0)}%</span>
              </div>
              <progress className="h-2 w-full accent-sky-600" max={100} value={update.progress || 0} />
            </div>
          )}
          {update.status === 'error' && (
            <div className="space-y-2" role="alert">
              <p className="text-xs text-rose-700 dark:text-rose-300">
                تعذر فحص التحديث أو تنزيله. تحقق من اتصال الإنترنت وحاول مجدداً.
              </p>
              {installError && <p className="text-xs text-rose-700 dark:text-rose-300">{installError}</p>}
              <button
                type="button"
                onClick={() => void window.ceramisys?.updater?.check?.()}
                className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {installError && update.status !== 'error' && (
            <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{installError}</p>
          )}
          {update.status === 'downloaded' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                اكتمل التنزيل والتحقق من سلامة التحديث.
              </p>
              <button
                type="button"
                onClick={() => {
                  setInstallError('');
                  const install = window.ceramisys?.updater?.install?.();
                  if (install) {
                    void install.catch((error: unknown) => {
                      setInstallError(error instanceof Error ? error.message : String(error));
                    });
                  }
                }}
                className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
              >
                تثبيت وإعادة التشغيل
              </button>
            </div>
          )}
          {update.mandatory && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
              هذا التحديث إلزامي؛ لا يمكن استخدام البرنامج قبل تثبيته.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
