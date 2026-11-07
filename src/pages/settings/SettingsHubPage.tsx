import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { AdminSettingsTab } from '../admin/AdminSettingsTab';
import { AppConfigurationPage } from './AppConfigurationPage';
import { ConfigurationStudioPage } from './ConfigurationStudioPage';

const ADMIN_TABS = ['general', 'business', 'branding', 'customization', 'invoice', 'inventory', 'operations', 'security', 'backup'];

const EMPTY_UPDATE_STATUS: AppUpdateStatus = { status: 'unsupported', currentVersion: '' };

const UpdateSettings: React.FC = () => {
  const [status, setStatus] = useState<AppUpdateStatus>(EMPTY_UPDATE_STATUS);
  const [loading, setLoading] = useState(true);
  const receivedStatus = useRef(false);

  useEffect(() => {
    let active = true;
    const updater = window.ceramisys?.updater;
    const unsubscribe = updater?.onStatus?.((nextStatus) => {
      receivedStatus.current = true;
      if (active) setStatus(nextStatus);
    });

    if (!updater?.getStatus) {
      setLoading(false);
      return () => {
        active = false;
        unsubscribe?.();
      };
    }

    void updater.getStatus().then((initialStatus) => {
      if (active && !receivedStatus.current) setStatus(initialStatus);
    }).catch((error: unknown) => {
      if (active) {
        setStatus({
          status: 'error',
          currentVersion: '',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const checkForUpdates = async () => {
    const check = window.ceramisys?.updater?.check;
    if (!check) return;
    setStatus((current) => ({ ...current, status: 'checking', error: undefined }));
    try {
      setStatus(await check());
    } catch (error) {
      setStatus((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const installUpdate = async () => {
    const install = window.ceramisys?.updater?.install;
    if (!install) return;
    try {
      await install();
    } catch (error) {
      setStatus((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const checking = loading || status.status === 'checking';
  const busy = checking || status.status === 'downloading';
  const stateLabel: Record<AppUpdateStatus['status'], string> = {
    idle: 'جاهز للتحقق من وجود إصدار أحدث.',
    unsupported: 'التحقق من التحديثات متاح في النسخة المثبتة من تطبيق سطح المكتب فقط.',
    checking: 'جارٍ الاتصال بقناة التحديثات والتحقق من أحدث إصدار...',
    'not-available': 'أنت تستخدم أحدث إصدار متاح.',
    downloading: `يتوفر إصدار ${status.version || 'جديد'}، جارٍ تنزيله${typeof status.progress === 'number' ? ` (${Math.round(status.progress)}٪)` : '...'}`,
    downloaded: `الإصدار ${status.version || 'الجديد'} جاهز للتثبيت.`,
    error: status.error ? `تعذر التحقق من التحديثات: ${status.error}` : 'تعذر التحقق من التحديثات.',
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
            <RefreshCw className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">تحديث التطبيق</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              الإصدار الحالي: {status.currentVersion || '—'}
            </p>
            <p className={`mt-2 text-xs ${status.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {stateLabel[status.status]}
            </p>
            {status.releaseName && <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{status.releaseName}</p>}
            {status.releaseNotes && <p className="mt-1 whitespace-pre-line text-xs text-slate-500 dark:text-slate-400">{status.releaseNotes}</p>}
            {status.status === 'downloading' && (
              <div className="mt-3 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, status.progress || 0))}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={busy || status.status === 'downloaded' || status.status === 'unsupported'}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            تحقق من التحديثات
          </button>
          {status.status === 'downloaded' && (
            <button
              type="button"
              onClick={() => void installUpdate()}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700"
            >
              <Download className="h-4 w-4" />
              تثبيت وإعادة التشغيل
            </button>
          )}
        </div>
      </div>
      {status.status === 'not-available' && (
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          التطبيق محدّث
        </div>
      )}
      {status.status === 'error' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4" />
          يمكنك إعادة المحاولة بعد التحقق من اتصال الإنترنت.
        </div>
      )}
    </section>
  );
};

export const SettingsHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');

  if (requested === 'appConfig') {
    return <AppConfigurationPage />;
  }
  if (requested === 'configStudio') {
    return <ConfigurationStudioPage />;
  }

  const initial = requested && ADMIN_TABS.includes(requested) ? (requested as any) : 'general';
  const handleAdminTabChange = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-6" dir="rtl">
      <div className="w-full space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">مركز إعدادات النظام</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">الإعدادات العامة، النشاط، الهوية وتخصيص الواجهة، الفواتير، المخزون، التشغيل، الأمان، والنسخ والاستعادة</p>
          </div>
        </div>

        <UpdateSettings />

        <div className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <AdminSettingsTab initialTab={initial} onTabChange={handleAdminTabChange} />
        </div>
      </div>
    </div>
  );
};

export default SettingsHubPage;
