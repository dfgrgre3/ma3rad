import { useEffect, useState } from 'react';

interface UpdateStatus {
  status: 'idle' | 'unsupported' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error';
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

  if (!update || ['idle', 'unsupported', 'checking', 'not-available'].includes(update.status)) return null;
  const isError = update.status === 'error';
  const hasRelease = Boolean(update.version || update.releaseName);
  const optional = !update.mandatory;
  const title = update.releaseName || `الإصدار ${update.version || 'الجديد'}`;

  if (collapsed && optional) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[110] rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-xl"
      >
        تحديث {update.status === 'downloaded' ? 'جاهز' : 'جارٍ التحميل'} · v{update.version}
      </button>
    );
  }

  return (
    <div className={update.mandatory
      ? 'fixed inset-0 z-[110] flex items-center justify-center bg-primary/70 p-4'
      : 'fixed bottom-4 right-4 z-[110]'}>
      <section
        role={update.mandatory ? 'alert' : 'status'}
        aria-live={update.mandatory ? 'assertive' : 'polite'}
        className="w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-accent-border bg-surface text-ink shadow-2xl dark:text-white"
      >
        <div className="flex items-start justify-between gap-3 bg-primary px-4 py-3 text-white">
          <div>
            <div className="text-sm font-black">
              {isError
                ? 'تعذر التحقق من التحديث'
                : update.mandatory ? 'تحديث إلزامي متاح' : 'يتوفر تحديث جديد'}
              {update.version && ` · v${update.version}`}
            </div>
            {hasRelease && title !== `الإصدار ${update.version || 'الجديد'}` && (
              <div className="mt-1 text-xs text-primary">{title}</div>
            )}
          </div>
          {optional && (
            <button type="button" onClick={() => setCollapsed(true)} aria-label="تصغير إشعار التحديث" className="rounded px-2 text-lg leading-5 text-white/80 hover:bg-surface/10">
              ×
            </button>
          )}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted ">
            الإصدار الحالي {update.currentVersion} · الإصدار الأحدث {update.version}
          </p>
          {!isError && update.releaseNotes && (
            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-xs leading-5 text-ink ">
              {update.releaseNotes}
            </div>
          )}
          {update.status === 'downloading' && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-secondary ">
                <span>يتم تنزيل التحديث في الخلفية...</span>
                <span>{Math.round(update.progress || 0)}%</span>
              </div>
              <progress className="h-2 w-full accent-primary" max={100} value={update.progress || 0} />
            </div>
          )}
          {isError && (
            <div className="space-y-2" role="alert">
              <p className="text-xs text-danger ">
                تعذر فحص التحديث أو تنزيله. تحقق من اتصال الإنترنت وحاول مجدداً.
              </p>
              {installError && <p className="text-xs text-danger ">{installError}</p>}
              <button
                type="button"
                onClick={() => void window.ceramisys?.updater?.check?.()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {installError && update.status !== 'error' && (
            <p role="alert" className="text-xs text-danger ">{installError}</p>
          )}
          {update.status === 'downloaded' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-success ">
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
                className="shrink-0 rounded-lg bg-success px-3 py-2 text-xs font-bold text-white hover:bg-success"
              >
                تثبيت وإعادة التشغيل
              </button>
            </div>
          )}
          {!isError && update.mandatory && (
            <p className="text-xs font-bold text-warning ">
              هذا التحديث إلزامي؛ لا يمكن استخدام البرنامج قبل تثبيته.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
