import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { AdminSettingsTab } from '../admin/AdminSettingsTab';
import { AppConfigurationPage } from './AppConfigurationPage';
import { ConfigurationStudioPage } from './ConfigurationStudioPage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';

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
    <section className="erp-card" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--win-radius)] bg-[var(--win-accent-soft)] text-[var(--win-accent-readable)]">
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          </div>
          <div className="min-w-0">
            <h2 className="erp-card__title">تحديث التطبيق</h2>
            <p className="mt-1 text-[var(--ui-font-xs)] text-[var(--cerami-muted)]">
              الإصدار الحالي: {status.currentVersion || '—'}
            </p>
            <p className={`mt-2 text-[var(--ui-font-xs)] ${status.status === 'error' ? 'text-[var(--cerami-danger-text)]' : 'text-[var(--win-text-secondary)]'}`}>
              {stateLabel[status.status]}
            </p>
            {status.releaseName && <p className="mt-1 text-[var(--ui-font-xs)] font-bold text-[var(--win-text)]">{status.releaseName}</p>}
            {status.releaseNotes && <p className="mt-1 whitespace-pre-line text-[var(--ui-font-xs)] text-[var(--cerami-muted)]">{status.releaseNotes}</p>}
            {status.status === 'downloading' && (
              <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[var(--win-surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--win-accent)] transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, status.progress || 0))}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void checkForUpdates()}
            disabled={busy || status.status === 'downloaded' || status.status === 'unsupported'}
            leadingIcon={checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          >
            تحقق من التحديثات
          </Button>
          {status.status === 'downloaded' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void installUpdate()}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              تثبيت وإعادة التشغيل
            </Button>
          )}
        </div>
      </div>
      {status.status === 'not-available' && (
        <div className="mt-3 flex items-center gap-2 text-[var(--ui-font-xs)] font-bold text-[var(--cerami-success-text)]">
          <CheckCircle2 className="h-4 w-4" />
          التطبيق محدّث
        </div>
      )}
      {status.status === 'error' && (
        <div className="mt-3 flex items-center gap-2 text-[var(--ui-font-xs)] text-[var(--cerami-danger-text)]">
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
    <div className="erp-page" dir="rtl">
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" />}
        title="مركز إعدادات النظام"
        description="الإعدادات العامة، النشاط، الهوية وتخصيص الواجهة، الفواتير، المخزون، التشغيل، الأمان، والنسخ والاستعادة."
      />

      <UpdateSettings />

      <div className="erp-card erp-card--flush p-2">
        <AdminSettingsTab initialTab={initial} onTabChange={handleAdminTabChange} />
      </div>
    </div>
  );
};

export default SettingsHubPage;
