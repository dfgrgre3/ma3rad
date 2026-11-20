import React, { useCallback, useEffect, useState } from 'react';
import { Package, Download, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MODULE_REGISTRY } from '../../../config/moduleRegistry';

type ModuleStatus = {
  configured: boolean;
  trustConfigured: boolean;
  buildId: string;
  installed: Array<{ moduleId: string; version: string }>;
};

type AvailableModule = {
  moduleId: string;
  version: string;
  sizeBytes: number;
  installed: boolean;
};

type ModulesApi = {
  status: () => Promise<ModuleStatus>;
  available: () => Promise<AvailableModule[]>;
  install: (moduleId: string) => Promise<unknown>;
  remove: (moduleId: string) => Promise<unknown>;
};

function getModulesApi(): ModulesApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ceramisys?: { modules?: ModulesApi } }).ceramisys?.modules;
}

const MODULE_LABELS = new Map(MODULE_REGISTRY.map((module) => [module.id, module.label]));

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ModulePackagesCard: React.FC = () => {
  const api = getModulesApi();
  const [status, setStatus] = useState<ModuleStatus | null>(null);
  const [available, setAvailable] = useState<AvailableModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
      // The catalog requires central activation; a failure here only means
      // "nothing to offer", not a broken status read.
      try {
        setAvailable(await api.available());
      } catch {
        setAvailable([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل حالة الوحدات.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Not a downloadable-modules desktop build (or plain browser): hide entirely.
  if (!api) return null;
  // buildId is empty unless the app was built with CERAMISYS_MODULE_PACKAGES=1.
  if (status && !status.buildId) return null;

  const run = async (moduleId: string, action: 'install' | 'remove') => {
    if (!api || busyId) return;
    setBusyId(moduleId);
    setError(null);
    try {
      if (action === 'install') await api.install(moduleId);
      else await api.remove(moduleId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ العملية.');
    } finally {
      setBusyId(null);
    }
  };

  const installedIds = new Set((status?.installed || []).map((item) => item.moduleId));
  const rows = [...available];
  for (const item of status?.installed || []) {
    if (!rows.some((row) => row.moduleId === item.moduleId)) {
      rows.push({ moduleId: item.moduleId, version: item.version, sizeBytes: 0, installed: true });
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
      <div className="p-4 border-b border-line flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <span>الوحدات القابلة للتنزيل</span>
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-ink-secondary">
          بعض وحدات النشاط تُنزَّل إلى هذا الجهاز عند الحاجة بعد التحقق من اشتراكك في
          المنصة المركزية. تُوقَّع الحزم وتُتحقق قبل تثبيتها.
        </p>

        {loading && !status && (
          <p className="text-sm text-muted flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            جارٍ تحميل حالة الوحدات...
          </p>
        )}
        {status && !status.configured && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-soft border border-warning-border text-warning text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>رابط المنصة المركزية غير مهيأ في هذه النسخة؛ لا يمكن تنزيل الوحدات.</span>
          </div>
        )}
        {status && status.configured && !status.trustConfigured && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-soft border border-warning-border text-warning text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>مفتاح توقيع الوحدات غير مثبّت في هذه النسخة؛ سيتم رفض أي حزمة منزّلة.</span>
          </div>
        )}
        {status?.configured && !status.installed.length && !available.length && !loading && (
          <p className="text-sm text-muted">لا توجد وحدات متاحة لهذا الجهاز أو إصدار التطبيق حاليًا.</p>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-soft border border-danger-border text-danger text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
            {rows.map((row) => {
              const isInstalled = installedIds.has(row.moduleId) || row.installed;
              const label = MODULE_LABELS.get(row.moduleId) || row.moduleId;
              return (
                <li key={row.moduleId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">{label}</span>
                      <span className="text-[11px] font-mono text-muted" dir="ltr">{row.moduleId}</span>
                      {isInstalled && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          مثبت {row.version ? `(${row.version})` : ''}
                        </span>
                      )}
                    </div>
                    {!isInstalled && row.sizeBytes > 0 && (
                      <p className="text-xs text-muted mt-0.5">الحجم: {formatBytes(row.sizeBytes)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isInstalled ? (
                      <button
                        type="button"
                        disabled={busyId !== null || !status?.configured || !status?.trustConfigured}
                        onClick={() => void run(row.moduleId, 'install')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {busyId === row.moduleId ? 'جارٍ التنزيل...' : 'تنزيل وتثبيت'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void run(row.moduleId, 'remove')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-line-strong text-ink hover:bg-surface-sunken disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {busyId === row.moduleId ? 'جارٍ الحذف...' : 'إزالة'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted">
          قد تتطلب الوحدات المُزالة أو المثبتة حديثًا إعادة تشغيل التطبيق لتظهر صفحاتها بشكل صحيح.
        </p>
      </div>
    </div>
  );
};

export default ModulePackagesCard;
