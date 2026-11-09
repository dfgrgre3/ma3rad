import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, CircleHelp, Cpu, Database, Download,
  HardDrive, RefreshCw, ShieldCheck, Wrench, XCircle,
} from 'lucide-react';
import { AuthService } from '../../../services/auth/AuthService';
import { PermissionService } from '../../../services/auth/PermissionService';
import {
  SystemDiagnosticsService,
  type DiagnosticCheck,
  type DiagnosticStatus,
  type SystemDiagnosticsReport,
  type SystemRuntimeDiagnostics,
} from '../../../services/shared/SystemDiagnosticsService';

type ActionMessage = { type: 'success' | 'error'; text: string };

const STATUS_STYLES: Record<DiagnosticStatus, string> = {
  PASS: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  WARN: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300',
  FAIL: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300',
  NOT_RUN: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  PASS: 'سليم',
  WARN: 'تحذير',
  FAIL: 'فشل',
  NOT_RUN: 'لم يُنفذ',
};

const PERSISTENCE_LABELS: Record<SystemRuntimeDiagnostics['databasePersistence']['status'], string> = {
  saving: 'جارٍ الحفظ',
  saved: 'محفوظ',
  error: 'خطأ في الحفظ',
  unencrypted: 'تخزين غير مشفر',
  unavailable: 'غير متاح',
};

const STORAGE_BACKEND_LABELS: Record<SystemRuntimeDiagnostics['databasePersistence']['backend'], string> = {
  file: 'ملف محلي',
  indexedDB: 'تخزين المتصفح',
  localStorage: 'التخزين المحلي للمتصفح',
  none: 'بلا تخزين',
};

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'غير متاح';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} جيجابايت`;
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : new Intl.NumberFormat('ar').format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'لا توجد بيانات';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'وقت غير صالح' : date.toLocaleString('ar');
}

function getOverallStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  if (checks.length === 0) return 'NOT_RUN';
  if (checks.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.status === 'WARN' || check.status === 'NOT_RUN')) return 'WARN';
  return 'PASS';
}

function StatusBadge({ status }: { status: DiagnosticStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {status === 'PASS' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
        status === 'FAIL' ? <XCircle className="h-3.5 w-3.5" /> :
          status === 'WARN' ? <AlertTriangle className="h-3.5 w-3.5" /> : <CircleHelp className="h-3.5 w-3.5" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 break-words text-lg font-black text-slate-900 dark:text-slate-100">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </section>
  );
}

export const SystemHealthPage: React.FC = () => {
  const currentUser = AuthService.getCurrentUser();
  const canMaintain = PermissionService.can(currentUser, 'ui.settings.system_health.manage', '/system-health');
  const canBackup = PermissionService.can(currentUser, 'ui.settings.backup.backup', '/system-health');
  const [stats, setStats] = useState<SystemDiagnosticsReport | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeDiagnostics | null>(null);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runHealthAudit = useCallback(async () => {
    setIsRunningCheck(true);
    setErrorMessage(null);
    try {
      const service = new SystemDiagnosticsService();
      const report = service.runDiagnostics();
      const runtimeReport = await service.getRuntimeDiagnostics(report.timestamp);
      setStats({ ...report, history: runtimeReport.history });
      setRuntime(runtimeReport);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تنفيذ فحوص التشخيص.');
    } finally {
      setIsRunningCheck(false);
    }
  }, []);

  useEffect(() => {
    void runHealthAudit();
  }, [runHealthAudit]);

  const allChecks = useMemo(
    () => [...(stats?.checks ?? []), ...(runtime?.checks ?? [])],
    [stats, runtime],
  );
  const overall = getOverallStatus(allChecks);
  const integrityCheck = stats?.checks.find((check) => check.key === 'sqlite_integrity');
  const financialCheck = stats?.checks.find((check) => check.key === 'financial_consistency');
  const failedChecks = allChecks.filter((check) => check.status === 'FAIL').length;
  const dbBytes = runtime?.databaseFile.bytes;
  const latestBackup = runtime?.backups.latestAt;

  const performAction = async (key: string, successText: string, action: () => Promise<void>) => {
    setActionInProgress(key);
    setActionMessage(null);
    try {
      await action();
      await runHealthAudit();
      setActionMessage({ type: 'success', text: successText });
    } catch (error) {
      setActionMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر إكمال الإجراء.',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleVacuum = () => {
    if (!canMaintain) return;
    void performAction(
      'vacuum',
      'اكتملت إعادة تنظيم قاعدة البيانات وحُفظت التغييرات.',
      async () => new SystemDiagnosticsService().vacuum(),
    );
  };

  const handleReindex = () => {
    if (!canMaintain) return;
    void performAction(
      'reindex',
      'اكتملت إعادة بناء فهارس قاعدة البيانات وحُفظت التغييرات.',
      async () => new SystemDiagnosticsService().reindex(),
    );
  };

  const handleBackup = () => {
    if (!canBackup) return;
    void performAction('backup', 'تم إنشاء النسخة الاحتياطية بنجاح.', async () => {
      const createBackup = typeof window !== 'undefined' ? window.ceramisys?.db?.backup : undefined;
      if (!createBackup) throw new Error('إنشاء نسخة احتياطية يتطلب تطبيق سطح المكتب.');
      const result = await createBackup('full');
      if (!result.ok) throw new Error(result.error || 'فشل إنشاء النسخة الاحتياطية.');
    });
  };

  const exportReport = () => {
    if (!stats || typeof document === 'undefined') return;
    const report = {
      generatedAt: new Date().toISOString(),
      overallStatus: overall,
      database: stats,
      system: runtime,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
      <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <Cpu className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-black">مركز صحة النظام وتشخيصه</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              فحوص قاعدة البيانات والنسخ الاحتياطية وموارد الجهاز وعمليات الصيانة
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportReport}
            disabled={!stats}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            تصدير التقرير
          </button>
          <button
            type="button"
            onClick={() => void runHealthAudit()}
            disabled={isRunningCheck || Boolean(actionInProgress)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            <RefreshCw className={`h-4 w-4 ${isRunningCheck ? 'animate-spin' : ''}`} aria-hidden="true" />
            {isRunningCheck ? 'جارٍ الفحص...' : 'إعادة الفحص'}
          </button>
        </div>
      </header>

      <main className="space-y-4 p-3 sm:p-4">
        {errorMessage && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {actionMessage && (
          <div
            role={actionMessage.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border p-3 text-sm ${
              actionMessage.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${overall === 'PASS' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : overall === 'FAIL' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-black">الحالة العامة</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {isRunningCheck ? 'جارٍ تحديث البيانات والفحوص...' : `آخر فحص: ${formatDate(stats?.timestamp)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={overall} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {failedChecks} فحص فاشل من {allChecks.length}
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={ShieldCheck}
            title="سلامة قاعدة البيانات"
            value={integrityCheck ? STATUS_LABELS[integrityCheck.status] : '—'}
            detail={integrityCheck?.detail ?? 'لم ينفذ الفحص بعد'}
          />
          <MetricCard
            icon={HardDrive}
            title="حجم ملف قاعدة البيانات"
            value={formatBytes(dbBytes)}
            detail={stats ? `الحجم المنطقي داخل SQLite: ${formatBytes(stats.databaseSizeBytes)}` : 'بانتظار نتيجة الفحص'}
          />
          <MetricCard
            icon={Activity}
            title="زمن الاستعلام القياسي"
            value={stats?.querySpeedMs == null ? '—' : `${stats.querySpeedMs} مللي ثانية`}
            detail="وقت قياس استعلام مباشر على مخطط قاعدة البيانات"
          />
          <MetricCard
            icon={Database}
            title="حجم البيانات المسجلة"
            value={`${formatNumber(stats?.totalTables)} جدول`}
            detail={`${formatNumber(stats?.totalProducts)} صنف · ${formatNumber(stats?.totalInvoices)} فاتورة · ${formatNumber(stats?.totalTransactions)} حركة مخزون`}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black">
              <Cpu className="h-4 w-4 text-sky-600" aria-hidden="true" />
              موارد وبيئة التشغيل الفعلية
            </h2>
            {runtime?.system ? (
              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div><dt className="text-slate-500 dark:text-slate-400">إصدار التطبيق</dt><dd className="mt-1 font-bold">{runtime.system.version} {runtime.system.packaged ? '· إصدار مثبت' : '· بيئة تطوير'}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">النظام والمعمارية</dt><dd className="mt-1 font-bold" dir="ltr">{runtime.system.platform} {runtime.system.osRelease} · {runtime.system.arch}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">المعالجات المنطقية</dt><dd className="mt-1 font-bold">{formatNumber(runtime.system.cpuCount)}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">مدة تشغيل التطبيق</dt><dd className="mt-1 font-bold">{Math.floor(runtime.system.processUptimeSeconds / 3600)} ساعة و{Math.floor(runtime.system.processUptimeSeconds % 3600 / 60)} دقيقة</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">ذاكرة التطبيق (RSS)</dt><dd className="mt-1 font-bold">{formatBytes(runtime.system.processMemoryBytes)}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">ذاكرة الجهاز المتاحة</dt><dd className="mt-1 font-bold">{formatBytes(runtime.system.freeMemoryBytes)} من {formatBytes(runtime.system.totalMemoryBytes)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-slate-500 dark:text-slate-400">المساحة المتاحة على قرص البيانات</dt><dd className="mt-1 font-bold">{runtime.system.disk.available ? `${formatBytes(runtime.system.disk.freeBytes)} من ${formatBytes(runtime.system.disk.totalBytes)}` : runtime.system.disk.error}</dd></div>
              </dl>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">معلومات موارد الجهاز غير متاحة في بيئة التشغيل الحالية.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black">
              <HardDrive className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              النسخ الاحتياطية المحلية
            </h2>
            <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-500 dark:text-slate-400">عدد النسخ المشفرة على القرص</dt><dd className="mt-1 font-bold">{runtime?.backups.count == null ? 'غير متاح' : formatNumber(runtime.backups.count)}</dd></div>
              <div><dt className="text-slate-500 dark:text-slate-400">إجمالي حجم ملفات النسخ</dt><dd className="mt-1 font-bold">{formatBytes(runtime?.backups.bytes)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500 dark:text-slate-400">تاريخ أحدث نسخة</dt><dd className="mt-1 font-bold">{formatDate(latestBackup)}</dd></div>
            </dl>
            {runtime?.backups.latestName && <p className="mt-2 break-all text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">{runtime.backups.latestName}</p>}
            {runtime?.backups.error && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{runtime.backups.error}</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-black">نتائج الفحوص التفصيلية</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">كل نتيجة مرتبطة بقياس مباشر أو استعلام فعلي؛ غير المتاح لا يُعرض كنجاح.</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {allChecks.map((check) => (
              <div key={check.key} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(150px,0.8fr)_minmax(220px,2fr)_auto_auto] sm:items-center">
                <div className="text-xs font-bold">{check.label}</div>
                <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">{check.detail}</div>
                <StatusBadge status={check.status} />
                <div className="text-[11px] text-slate-500">{check.durationMs} مللي ثانية</div>
              </div>
            ))}
            {allChecks.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">ابدأ الفحص لعرض نتائج التشخيص.</p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {canMaintain && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
                <Wrench className="h-4 w-4 text-teal-600" aria-hidden="true" />
                إجراءات الصيانة
              </h2>
              <p className="mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400">تتطلب هذه الإجراءات صلاحية صيانة قاعدة البيانات. يُنصح بأخذ نسخة احتياطية قبل تنفيذها.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleVacuum}
                  disabled={Boolean(actionInProgress) || isRunningCheck}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {actionInProgress === 'vacuum' ? 'جارٍ الضغط...' : 'ضغط قاعدة البيانات'}
                </button>
                <button
                  type="button"
                  onClick={handleReindex}
                  disabled={Boolean(actionInProgress) || isRunningCheck}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {actionInProgress === 'reindex' ? 'جارٍ إعادة البناء...' : 'إعادة بناء الفهارس'}
                </button>
                {canBackup && (
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={Boolean(actionInProgress) || isRunningCheck}
                    className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-600 disabled:opacity-50"
                  >
                    {actionInProgress === 'backup' ? 'جارٍ إنشاء النسخة...' : 'إنشاء نسخة احتياطية الآن'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-black">إحصائيات قاعدة البيانات</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">الأصناف</dt><dd className="font-bold">{formatNumber(stats?.totalProducts)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">فواتير المبيعات</dt><dd className="font-bold">{formatNumber(stats?.totalInvoices)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">حركات المخزون</dt><dd className="font-bold">{formatNumber(stats?.totalTransactions)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">الاتساق المحاسبي</dt><dd className="font-bold">{financialCheck?.detail ?? 'لم يُنفذ بعد'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">حالة حفظ البيانات</dt><dd className="font-bold">{runtime ? `${PERSISTENCE_LABELS[runtime.databasePersistence.status]} · ${STORAGE_BACKEND_LABELS[runtime.databasePersistence.backend]}` : 'غير متاحة'}</dd></div>
            </dl>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-black">سجل نتائج الفحص</h2>
          <div className="space-y-2">
            {(stats?.history ?? []).slice().reverse().slice(0, 10).map((entry) => (
              <div key={entry.timestamp} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs last:border-0 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">{formatDate(entry.timestamp)}</span>
                <StatusBadge status={entry.overall} />
                <span className="text-slate-500 dark:text-slate-400">{entry.checks.filter((check) => check.status === 'FAIL').length} فحص فاشل من {entry.checks.length}</span>
              </div>
            ))}
            {(!stats?.history || stats.history.length === 0) && <p className="text-xs text-slate-500">لا توجد نتائج سابقة محفوظة.</p>}
          </div>
        </section>
      </main>
    </div>
  );
};
