import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  AlertTriangle,
  Building2,
  KeyRound,
  Wallet,
  CheckCircle2,
  RefreshCw,
  Server,
  Radio,
  Archive,
  Zap,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  Layers,
  Check,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformHealthDashboardData,
  PlatformTechnicalHealthMetrics,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { StatusBadge, formatDate, formatMoney, formatNumber } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
export const PlatformHealthPage: React.FC = () => {
  const toast = useToast();
  const centralActive = getCentralDataSourceState().active;
  const canUpdateHealth = canPlatform('platform-health', 'platform.platform-health.update')
    || canPlatform('operations', 'platform.operations.update')
    || canPlatform('system-health', 'platform.system-health.update');
  const [data, setData] = useState<PlatformHealthDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');

  // Central error-monitoring state
  const [errorReports, setErrorReports] = useState<any[]>([]);
  const [errorSummary, setErrorSummary] = useState<any>(null);
  const [errStatusFilter, setErrStatusFilter] = useState('OPEN');
  const [errSeverityFilter, setErrSeverityFilter] = useState('');
  const [errSearch, setErrSearch] = useState('');

  const loadCentral = useCallback(() => {
    setLoading(true);
    Promise.all([
      centralPlatformClient.getErrorReportsSummary(),
      centralPlatformClient.listErrorReports({
        status: errStatusFilter || undefined,
        severity: errSeverityFilter || undefined,
        q: errSearch || undefined,
      }),
    ])
      .then(([summary, rows]) => {
        setErrorSummary(summary);
        setErrorReports(rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل مركز مراقبة الأخطاء.'))
      .finally(() => setLoading(false));
  }, [errStatusFilter, errSeverityFilter, errSearch]);

  const handleErrorAction = useCallback((id: string, action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') => {
    centralPlatformClient.setErrorReportStatus(id, action)
      .then(loadCentral)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تحديث حالة البلاغ.'));
  }, [loadCentral]);

  const load = useCallback(() => {
    if (centralActive) { loadCentral(); return; }
    setLoading(true);
    try {
      const dashboard = platformAdminService.getPlatformHealthDashboard();
      setData(dashboard);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات صحة ومراقبة المنصة.');
    } finally {
      setLoading(false);
    }
  }, [centralActive, loadCentral]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-5 text-rose-200">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <span className="font-bold">{error}</span>
        </div>
      </div>
    );
  }

  if (centralActive) {
    const byStatus: Record<string, number> = errorSummary?.byStatus ?? {};
    const bySeverity: Record<string, { count: number; occurrences: number }> = errorSummary?.bySeverity ?? {};
    const sevLabel: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
    const statusLabel: Record<string, string> = { OPEN: 'مفتوح', ACKNOWLEDGED: 'تم الإقرار', RESOLVED: 'محلول', IGNORED: 'متجاهل' };
    const statusColor: Record<string, string> = {
      OPEN: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      ACKNOWLEDGED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      IGNORED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    };

    return (
      <div className="space-y-6">
        <PageHeader
          title="مركز مراقبة الأخطاء (Error Monitoring)"
          description="بلاغات الأخطاء المُبلَّغة من الأجهزة والعملاء عبر /api/v1/telemetry — مجمّعة بالبصمة مع عدّاد التكرار."
          icon={<Activity className="h-6 w-6 text-emerald-400" />}
          actions={
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}
              leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
              تحديث
            </Button>
          }
        />

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setErrStatusFilter(errStatusFilter === s ? '' : s)}
              className={`rounded-xl border p-4 text-right transition-colors ${
                errStatusFilter === s ? 'border-emerald-600 bg-emerald-950/30' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <p className="text-xs font-semibold text-slate-400">{statusLabel[s]}</p>
              <p className="mt-1 text-3xl font-black text-slate-100">{byStatus[s] ?? 0}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">إجمالي البلاغات</p>
            <p className="mt-1 text-2xl font-black text-slate-100">{errorSummary?.total ?? 0}</p>
            <p className="text-[11px] text-slate-500">{errorSummary?.occurrences ?? 0} occurrence إجمالاً</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">بلاغات آخر 24 ساعة</p>
            <p className="mt-1 text-2xl font-black text-sky-400">{errorSummary?.last24h ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">حسب الخطورة</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold">
              {(['critical', 'high', 'medium', 'low'] as const).map((sv) => (
                <span key={sv} className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                  {sevLabel[sv]}: {bySeverity[sv]?.count ?? 0}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={errSearch}
            onChange={(e) => setErrSearch(e.target.value)}
            placeholder="بحث بالعنوان أو الجهاز..."
            className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
          />
          <select value={errStatusFilter} onChange={(e) => setErrStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
            <option value="">كل الحالات</option>
            {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={errSeverityFilter} onChange={(e) => setErrSeverityFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
            <option value="">كل الخطورات</option>
            {Object.entries(sevLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Error list */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-10 text-sm text-slate-400">
              <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" /> جارٍ التحميل...
            </div>
          ) : errorReports.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm font-semibold text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span>لا توجد بلاغات أخطاء مطابقة — لا أخطاء مُبلَّغة من الأجهزة.</span>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/80">
              {errorReports.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black ${statusColor[r.status] ?? statusColor.OPEN}`}>
                          {statusLabel[r.status] ?? r.status}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                          {sevLabel[r.severity] ?? r.severity}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ×{r.occurrences} occurrence · {formatDate(r.lastSeenAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-bold text-slate-100" title={r.title}>{r.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {r.tenantName ?? 'منصة'}{r.deviceId ? ` · جهاز ${r.deviceId}` : ''}
                        {r.appVersion ? ` · v${r.appVersion}` : ''}{r.os ? ` · ${r.os}` : ''}
                      </p>
                    </div>
                    {canUpdateHealth && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {r.status === 'OPEN' && (
                          <button onClick={() => handleErrorAction(r.id, 'acknowledge')}
                            className="rounded border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-900/50">
                            إقرار
                          </button>
                        )}
                        {r.status !== 'RESOLVED' && r.status !== 'IGNORED' && (
                          <button onClick={() => handleErrorAction(r.id, 'resolve')}
                            className="rounded border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-900/50">
                            حلّ
                          </button>
                        )}
                        {r.status !== 'IGNORED' && (
                          <button onClick={() => handleErrorAction(r.id, 'ignore')}
                            className="rounded border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700/60">
                            تجاهل
                          </button>
                        )}
                        {(r.status === 'RESOLVED' || r.status === 'IGNORED') && (
                          <button onClick={() => handleErrorAction(r.id, 'reopen')}
                            className="rounded border border-sky-700/50 bg-sky-950/40 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-900/50">
                            إعادة فتح
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] text-slate-400">{r.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (!data || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />
          <span>جارٍ فحص مؤشرات صحة المنصة والبنية التقنية...</span>
        </div>
      </div>
    );
  }

  const { technical, business } = data;
  const isHealthy = technical.status === 'HEALTHY';
  const isDegraded = technical.status === 'DEGRADED';
  const isCritical = technical.status === 'CRITICAL';

  const filteredAlerts = technical.alerts.filter((alert) => {
    if (alertFilter === 'ALL') return true;
    return alert.severity === alertFilter;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="صحة المنصة والمراقبة التقنية"
        description="مراقبة حية لتوافر الخدمات، أداء خوادم API، نبضات الأجهزة والمزامنة، وصحة الأعمال."
        icon={<Activity className="h-6 w-6 text-emerald-400" />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={load}
            disabled={loading}
            leadingIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            تحديث المؤشرات
          </Button>
        }
      />

      {/* Hero: Technical Infrastructure Health Score */}
      <section
        className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl transition-all ${
          isHealthy
            ? 'border-emerald-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white'
            : isDegraded
            ? 'border-amber-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950 text-white'
            : 'border-rose-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 text-white'
        }`}
      >
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  isHealthy
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isDegraded
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {isHealthy ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : isDegraded ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                {isHealthy ? 'البنية التقنية مستقرة' : isDegraded ? 'أداء منخفض جزئياً' : 'تنبيه أداء حرج'}
              </span>
              <span className="text-xs text-slate-400">تقييم مبني على مؤشرات الخوادم والمزامنة الحية</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-5xl font-black tracking-tight">{technical.score}%</h1>
              <span className="text-sm font-semibold text-slate-300">مؤشر الصحة والاستقرار التقني</span>
            </div>
            <p className="text-sm text-slate-300 max-w-xl">
              {technical.alerts.length === 0
                ? 'جميع خدمات المنصة المركزية، خوادم الـ API، محركات المزامنة والنسخ الاحتياطي تعمل بكفاءة تامة.'
                : `تم رصد ${technical.alerts.length} ملاحظة وتنبيه تقني نشط يتطلب المتابعة لضمان استمرارية الخدمة.`}
            </p>
          </div>

          {/* Quick Real-Time Metrics Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">توافر الخدمات</p>
              <p className="mt-1 text-2xl font-black text-emerald-400">{technical.availabilityRate}%</p>
              <p className="text-[10px] text-slate-400">Service Uptime</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">نجاح طلبات API</p>
              <p className="mt-1 text-2xl font-black text-sky-400">{technical.apiSuccessRate}%</p>
              <p className="text-[10px] text-slate-400">{technical.apiLatencyMs}ms استجابة</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">نجاح المزامنة</p>
              <p className="mt-1 text-2xl font-black text-amber-400">{technical.syncSuccessRate}%</p>
              <p className="text-[10px] text-slate-400">{technical.syncFailedCount} فشل مزامنة</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-slate-400">النسخ الاحتياطي</p>
              <p
                className={`mt-1 text-lg font-black ${
                  technical.lastBackupStatus === 'SUCCESS'
                    ? 'text-emerald-400'
                    : technical.lastBackupStatus === 'FAILED'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {technical.lastBackupStatus === 'SUCCESS'
                  ? 'تم التحقق'
                  : technical.lastBackupStatus === 'FAILED'
                  ? 'فشل التحقق'
                  : 'معلق'}
              </p>
              <p className="text-[10px] text-slate-400">منذ {technical.lastBackupAgeHours} ساعة</p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Health Indicators Grid */}
      <div>
        <h2 className="mb-3 text-base font-bold text-slate-200 flex items-center gap-2">
          <Server className="h-5 w-5 text-indigo-400" />
          المؤشرات التقنية ومراقبة البنية التحتية
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. API Health */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" />
                استجابة وأخطاء API
              </span>
              <span
                className={`font-bold ${
                  technical.apiErrorRate < 0.5
                    ? 'text-emerald-400'
                    : technical.apiErrorRate < 1.5
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {technical.apiErrorRate}% خطأ
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-100">{technical.apiLatencyMs} ms</span>
              <span className="text-xs text-slate-400">متوسط التأخير</span>
            </div>
            <div className="mt-3 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 flex justify-between">
              <span>الحد الأقصى الموصى به</span>
              <span className="text-slate-300 font-medium">150 ms</span>
            </div>
          </div>

          {/* 2. Sync Engine */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-sky-400" />
                محرك المزامنة السحابية
              </span>
              <span className="text-emerald-400 font-bold">{technical.syncSuccessRate}% نجاح</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-100">{technical.syncFailedCount}</span>
              <span className="text-xs text-slate-400">فشل في السجلات</span>
            </div>
            <div className="mt-3 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 flex justify-between">
              <span>حالة خادم المزامنة</span>
              <span className="text-emerald-400 font-medium">متصل وسريع</span>
            </div>
          </div>

          {/* 3. Devices & Heartbeats */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-purple-400" />
                نبضات الأجهزة (Heartbeat)
              </span>
              <span
                className={`font-bold ${
                  technical.staleDevicesCount === 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {technical.staleDevicesCount} منقطع
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-100">
                {technical.totalDevicesCount - technical.staleDevicesCount} / {technical.totalDevicesCount}
              </span>
              <span className="text-xs text-slate-400">أجهزة ترسل نبضات</span>
            </div>
            <div className="mt-3 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 flex justify-between">
              <span>أجهزة يشتبه باستنساخها</span>
              <span
                className={`font-bold ${
                  technical.licenseIntegrityAlerts === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {technical.licenseIntegrityAlerts}
              </span>
            </div>
          </div>

          {/* 4. Central Backups & Operations */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Archive className="h-4 w-4 text-emerald-400" />
                النسخ والعمليات
              </span>
              <span
                className={`font-bold ${
                  technical.failedOpsJobsCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {technical.failedOpsJobsCount} مهام فاشلة
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span
                className={`text-2xl font-black ${
                  technical.lastBackupStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {technical.lastBackupStatus === 'SUCCESS' ? 'سليمة' : 'تحتاج فحص'}
              </span>
              <span className="text-xs text-slate-400">آخر نسخة احتياطية</span>
            </div>
            <div className="mt-3 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 flex justify-between">
              <span>حوادث مفتوحة</span>
              <span className="text-slate-300 font-medium">
                {technical.openIncidents.critical} حرج · {technical.openIncidents.major} رئيسي
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Live Technical Alerts by Severity */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">تنبيهات وأعطال المنصة التقنية</h3>
              <p className="text-xs text-slate-400">
                {technical.alerts.length === 0
                  ? 'لا توجد تنبيهات نشطة — النظام يعمل بكامل الاستقرار.'
                  : `${technical.alerts.length} تنبيه مسجل ومصنف بحسب الخطورة.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
            <button
              onClick={() => setAlertFilter('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'ALL'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({technical.alerts.length})
            </button>
            <button
              onClick={() => setAlertFilter('CRITICAL')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'CRITICAL'
                  ? 'bg-rose-900/60 text-rose-200 border border-rose-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              حرج ({technical.alerts.filter((a) => a.severity === 'CRITICAL').length})
            </button>
            <button
              onClick={() => setAlertFilter('WARNING')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'WARNING'
                  ? 'bg-amber-900/60 text-amber-200 border border-amber-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تحذير ({technical.alerts.filter((a) => a.severity === 'WARNING').length})
            </button>
            <button
              onClick={() => setAlertFilter('INFO')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'INFO'
                  ? 'bg-sky-900/60 text-sky-200 border border-sky-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              معلومات ({technical.alerts.filter((a) => a.severity === 'INFO').length})
            </button>
          </div>
        </header>

        {filteredAlerts.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm font-semibold text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>لا توجد تنبيهات مسجلة تحت هذا التصنيف — جميع المؤشرات التقنية طبيعية.</span>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {filteredAlerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : alert.severity === 'WARNING'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    }`}
                  >
                    {alert.severity === 'CRITICAL'
                      ? 'حرج'
                      : alert.severity === 'WARNING'
                      ? 'تحذير'
                      : 'معلومة'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-100">{alert.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{alert.description}</p>
                  </div>
                </div>

                {alert.link && (
                  <a
                    href={alert.link}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 shrink-0"
                  >
                    <span>معالجة</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section: Dedicated Business Health (مؤشرات صحة الأعمال والعملاء) */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <header className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">مؤشرات صحة الأعمال (Commercial Health)</h3>
              <p className="text-xs text-slate-400">
                حالة العملاء، الاشتراكات السارية، التراخيص، والتدفق المالي للفوترة
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">مفصولة عن صحة البنية التقنية</span>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. Tenants */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Building2 className="h-4 w-4 text-sky-400" />
              العملاء والمستأجرين
            </p>
            <p className="mt-2 text-2xl font-black text-slate-100">{formatNumber(business.tenants.total)}</p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold">{formatNumber(business.tenants.active)} نشط</span>
              {' · '}
              <span className="text-amber-400 font-semibold">{formatNumber(business.tenants.suspended)} موقوف</span>
              {' · '}
              <span className="text-rose-400 font-semibold">{formatNumber(business.tenants.expired)} منتهي</span>
            </p>
          </div>

          {/* 2. Licenses */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              التراخيص الصادرة
            </p>
            <p className="mt-2 text-2xl font-black text-slate-100">{formatNumber(business.licenses.total)}</p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold">{formatNumber(business.licenses.active)} ساري</span>
              {' · '}
              <span className="text-amber-400 font-semibold">{formatNumber(business.licenses.expired)} منتهي</span>
              {' · '}
              <span className="text-rose-400 font-semibold">{formatNumber(business.licenses.revoked)} ملغي</span>
            </p>
          </div>

          {/* 3. Subscriptions */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Layers className="h-4 w-4 text-purple-400" />
              الاشتراكات والخطط
            </p>
            <p className="mt-2 text-2xl font-black text-slate-100">
              {formatNumber(business.subscriptions.total)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold">{formatNumber(business.subscriptions.active)} نشط</span>
              {' · '}
              <span className="text-amber-400 font-semibold">
                {formatNumber(business.subscriptions.expiringSoon)} ينتهي قريباً
              </span>
            </p>
          </div>

          {/* 4. Billing & Revenue */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Wallet className="h-4 w-4 text-amber-400" />
              الفوترة والاشتراكات
            </p>
            <p className="mt-2 text-2xl font-black text-slate-100">
              {formatMoney(business.billing.outstanding)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-rose-400 font-semibold">
                {formatNumber(business.billing.overdueInvoices)} فاتورة متأخرة
              </span>
              {' · '}
              <span className="text-emerald-400 font-semibold">MRR {formatMoney(business.billing.mrr)}</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlatformHealthPage;
