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
      <div role="alert" className="rounded-xl border border-danger bg-danger/40 p-5 text-danger">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-danger" />
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
      OPEN: 'bg-danger/15 text-danger border-danger/30',
      ACKNOWLEDGED: 'bg-warning/15 text-warning border-warning/30',
      RESOLVED: 'bg-success/15 text-success border-success/30',
      IGNORED: 'bg-line-strong/15 text-muted border-line-strong/30',
    };

    return (
      <div className="space-y-6">
        <PageHeader
          title="مركز مراقبة الأخطاء (Error Monitoring)"
          description="بلاغات الأخطاء المُبلَّغة من الأجهزة والعملاء عبر /api/v1/telemetry — مجمّعة بالبصمة مع عدّاد التكرار."
          icon={<Activity className="h-6 w-6 text-success" />}
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
                errStatusFilter === s ? 'border-success bg-success/30' : 'border-line-strong bg-primary/60 hover:border-line-strong'
              }`}
            >
              <p className="text-xs font-semibold text-muted">{statusLabel[s]}</p>
              <p className="mt-1 text-3xl font-black text-muted">{byStatus[s] ?? 0}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4">
            <p className="text-xs text-muted">إجمالي البلاغات</p>
            <p className="mt-1 text-2xl font-black text-muted">{errorSummary?.total ?? 0}</p>
            <p className="text-[11px] text-muted">{errorSummary?.occurrences ?? 0} occurrence إجمالاً</p>
          </div>
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4">
            <p className="text-xs text-muted">بلاغات آخر 24 ساعة</p>
            <p className="mt-1 text-2xl font-black text-primary">{errorSummary?.last24h ?? 0}</p>
          </div>
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4">
            <p className="text-xs text-muted">حسب الخطورة</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold">
              {(['critical', 'high', 'medium', 'low'] as const).map((sv) => (
                <span key={sv} className="rounded bg-primary px-2 py-0.5 text-muted">
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
            className="w-64 rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted placeholder:text-muted"
          />
          <select value={errStatusFilter} onChange={(e) => setErrStatusFilter(e.target.value)}
            className="rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted">
            <option value="">كل الحالات</option>
            {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={errSeverityFilter} onChange={(e) => setErrSeverityFilter(e.target.value)}
            className="rounded-lg border border-line-strong bg-primary px-3 py-2 text-xs text-muted">
            <option value="">كل الخطورات</option>
            {Object.entries(sevLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Error list */}
        <section className="rounded-xl border border-line-strong bg-primary/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-10 text-sm text-muted">
              <RefreshCw className="h-4 w-4 animate-spin text-success" /> جارٍ التحميل...
            </div>
          ) : errorReports.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm font-semibold text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span>لا توجد بلاغات أخطاء مطابقة — لا أخطاء مُبلَّغة من الأجهزة.</span>
            </div>
          ) : (
            <ul className="divide-y divide-primary/80">
              {errorReports.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black ${statusColor[r.status] ?? statusColor.OPEN}`}>
                          {statusLabel[r.status] ?? r.status}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-line-strong bg-primary/60 px-2 py-0.5 text-[10px] font-bold text-muted">
                          {sevLabel[r.severity] ?? r.severity}
                        </span>
                        <span className="text-[11px] text-muted">
                          ×{r.occurrences} occurrence · {formatDate(r.lastSeenAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-bold text-muted" title={r.title}>{r.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {r.tenantName ?? 'منصة'}{r.deviceId ? ` · جهاز ${r.deviceId}` : ''}
                        {r.appVersion ? ` · v${r.appVersion}` : ''}{r.os ? ` · ${r.os}` : ''}
                      </p>
                    </div>
                    {canUpdateHealth && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {r.status === 'OPEN' && (
                          <button onClick={() => handleErrorAction(r.id, 'acknowledge')}
                            className="rounded border border-warning/50 bg-warning/40 px-2.5 py-1 text-[11px] font-bold text-warning hover:bg-warning/50">
                            إقرار
                          </button>
                        )}
                        {r.status !== 'RESOLVED' && r.status !== 'IGNORED' && (
                          <button onClick={() => handleErrorAction(r.id, 'resolve')}
                            className="rounded border border-success/50 bg-success/40 px-2.5 py-1 text-[11px] font-bold text-success hover:bg-success/50">
                            حلّ
                          </button>
                        )}
                        {r.status !== 'IGNORED' && (
                          <button onClick={() => handleErrorAction(r.id, 'ignore')}
                            className="rounded border border-line-strong bg-primary/60 px-2.5 py-1 text-[11px] font-bold text-muted hover:bg-primary/60">
                            تجاهل
                          </button>
                        )}
                        {(r.status === 'RESOLVED' || r.status === 'IGNORED') && (
                          <button onClick={() => handleErrorAction(r.id, 'reopen')}
                            className="rounded border border-primary/50 bg-primary/40 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/50">
                            إعادة فتح
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">{r.description}</p>
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
        <div className="flex items-center gap-3 text-muted">
          <RefreshCw className="h-5 w-5 animate-spin text-success" />
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
        icon={<Activity className="h-6 w-6 text-success" />}
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
            ? 'border-success/60 bg-gradient-to-br from-ink via-ink to-success text-white'
            : isDegraded
            ? 'border-warning/60 bg-gradient-to-br from-ink via-ink to-warning text-white'
            : 'border-danger/60 bg-gradient-to-br from-ink via-ink to-danger text-white'
        }`}
      >
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  isHealthy
                    ? 'bg-success/20 text-success border border-success/30'
                    : isDegraded
                    ? 'bg-warning/20 text-warning border border-warning/30'
                    : 'bg-danger/20 text-danger border border-danger/30'
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
              <span className="text-xs text-muted">تقييم مبني على مؤشرات الخوادم والمزامنة الحية</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-5xl font-black tracking-tight">{technical.score}%</h1>
              <span className="text-sm font-semibold text-muted">مؤشر الصحة والاستقرار التقني</span>
            </div>
            <p className="text-sm text-muted max-w-xl">
              {technical.alerts.length === 0
                ? 'جميع خدمات المنصة المركزية، خوادم الـ API، محركات المزامنة والنسخ الاحتياطي تعمل بكفاءة تامة.'
                : `تم رصد ${technical.alerts.length} ملاحظة وتنبيه تقني نشط يتطلب المتابعة لضمان استمرارية الخدمة.`}
            </p>
          </div>

          {/* Quick Real-Time Metrics Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-muted">توافر الخدمات</p>
              <p className="mt-1 text-2xl font-black text-success">{technical.availabilityRate}%</p>
              <p className="text-[10px] text-muted">Service Uptime</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-muted">نجاح طلبات API</p>
              <p className="mt-1 text-2xl font-black text-primary">{technical.apiSuccessRate}%</p>
              <p className="text-[10px] text-muted">{technical.apiLatencyMs}ms استجابة</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-muted">نجاح المزامنة</p>
              <p className="mt-1 text-2xl font-black text-warning">{technical.syncSuccessRate}%</p>
              <p className="text-[10px] text-muted">{technical.syncFailedCount} فشل مزامنة</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-surface/5 p-3.5 text-center backdrop-blur-sm">
              <p className="text-[11px] font-semibold text-muted">النسخ الاحتياطي</p>
              <p
                className={`mt-1 text-lg font-black ${
                  technical.lastBackupStatus === 'SUCCESS'
                    ? 'text-success'
                    : technical.lastBackupStatus === 'FAILED'
                    ? 'text-danger'
                    : 'text-warning'
                }`}
              >
                {technical.lastBackupStatus === 'SUCCESS'
                  ? 'تم التحقق'
                  : technical.lastBackupStatus === 'FAILED'
                  ? 'فشل التحقق'
                  : 'معلق'}
              </p>
              <p className="text-[10px] text-muted">منذ {technical.lastBackupAgeHours} ساعة</p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Health Indicators Grid */}
      <div>
        <h2 className="mb-3 text-base font-bold text-muted flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          المؤشرات التقنية ومراقبة البنية التحتية
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. API Health */}
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-warning" />
                استجابة وأخطاء API
              </span>
              <span
                className={`font-bold ${
                  technical.apiErrorRate < 0.5
                    ? 'text-success'
                    : technical.apiErrorRate < 1.5
                    ? 'text-warning'
                    : 'text-danger'
                }`}
              >
                {technical.apiErrorRate}% خطأ
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-muted">{technical.apiLatencyMs} ms</span>
              <span className="text-xs text-muted">متوسط التأخير</span>
            </div>
            <div className="mt-3 border-t border-line-strong/80 pt-2 text-[11px] text-muted flex justify-between">
              <span>الحد الأقصى الموصى به</span>
              <span className="text-muted font-medium">150 ms</span>
            </div>
          </div>

          {/* 2. Sync Engine */}
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-primary" />
                محرك المزامنة السحابية
              </span>
              <span className="text-success font-bold">{technical.syncSuccessRate}% نجاح</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-muted">{technical.syncFailedCount}</span>
              <span className="text-xs text-muted">فشل في السجلات</span>
            </div>
            <div className="mt-3 border-t border-line-strong/80 pt-2 text-[11px] text-muted flex justify-between">
              <span>حالة خادم المزامنة</span>
              <span className="text-success font-medium">متصل وسريع</span>
            </div>
          </div>

          {/* 3. Devices & Heartbeats */}
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                نبضات الأجهزة (Heartbeat)
              </span>
              <span
                className={`font-bold ${
                  technical.staleDevicesCount === 0 ? 'text-success' : 'text-warning'
                }`}
              >
                {technical.staleDevicesCount} منقطع
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-black text-muted">
                {technical.totalDevicesCount - technical.staleDevicesCount} / {technical.totalDevicesCount}
              </span>
              <span className="text-xs text-muted">أجهزة ترسل نبضات</span>
            </div>
            <div className="mt-3 border-t border-line-strong/80 pt-2 text-[11px] text-muted flex justify-between">
              <span>أجهزة يشتبه باستنساخها</span>
              <span
                className={`font-bold ${
                  technical.licenseIntegrityAlerts === 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {technical.licenseIntegrityAlerts}
              </span>
            </div>
          </div>

          {/* 4. Central Backups & Operations */}
          <div className="rounded-xl border border-line-strong bg-primary/60 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-semibold flex items-center gap-1.5">
                <Archive className="h-4 w-4 text-success" />
                النسخ والعمليات
              </span>
              <span
                className={`font-bold ${
                  technical.failedOpsJobsCount === 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {technical.failedOpsJobsCount} مهام فاشلة
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span
                className={`text-2xl font-black ${
                  technical.lastBackupStatus === 'SUCCESS' ? 'text-success' : 'text-warning'
                }`}
              >
                {technical.lastBackupStatus === 'SUCCESS' ? 'سليمة' : 'تحتاج فحص'}
              </span>
              <span className="text-xs text-muted">آخر نسخة احتياطية</span>
            </div>
            <div className="mt-3 border-t border-line-strong/80 pt-2 text-[11px] text-muted flex justify-between">
              <span>حوادث مفتوحة</span>
              <span className="text-muted font-medium">
                {technical.openIncidents.critical} حرج · {technical.openIncidents.major} رئيسي
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Live Technical Alerts by Severity */}
      <section className="rounded-xl border border-line-strong bg-primary/80 shadow-sm overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-muted">تنبيهات وأعطال المنصة التقنية</h3>
              <p className="text-xs text-muted">
                {technical.alerts.length === 0
                  ? 'لا توجد تنبيهات نشطة — النظام يعمل بكامل الاستقرار.'
                  : `${technical.alerts.length} تنبيه مسجل ومصنف بحسب الخطورة.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-primary/60 p-1">
            <button
              onClick={() => setAlertFilter('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'ALL'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-muted hover:text-muted'
              }`}
            >
              الكل ({technical.alerts.length})
            </button>
            <button
              onClick={() => setAlertFilter('CRITICAL')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'CRITICAL'
                  ? 'bg-danger/60 text-danger border border-danger/50'
                  : 'text-muted hover:text-muted'
              }`}
            >
              حرج ({technical.alerts.filter((a) => a.severity === 'CRITICAL').length})
            </button>
            <button
              onClick={() => setAlertFilter('WARNING')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'WARNING'
                  ? 'bg-warning/60 text-warning border border-warning/50'
                  : 'text-muted hover:text-muted'
              }`}
            >
              تحذير ({technical.alerts.filter((a) => a.severity === 'WARNING').length})
            </button>
            <button
              onClick={() => setAlertFilter('INFO')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                alertFilter === 'INFO'
                  ? 'bg-primary/60 text-primary border border-primary/50'
                  : 'text-muted hover:text-muted'
              }`}
            >
              معلومات ({technical.alerts.filter((a) => a.severity === 'INFO').length})
            </button>
          </div>
        </header>

        {filteredAlerts.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" />
            <span>لا توجد تنبيهات مسجلة تحت هذا التصنيف — جميع المؤشرات التقنية طبيعية.</span>
          </div>
        ) : (
          <ul className="divide-y divide-primary/80">
            {filteredAlerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-danger/20 text-danger border border-danger/30'
                        : alert.severity === 'WARNING'
                        ? 'bg-warning/20 text-warning border border-warning/30'
                        : 'bg-primary/20 text-primary border border-primary/30'
                    }`}
                  >
                    {alert.severity === 'CRITICAL'
                      ? 'حرج'
                      : alert.severity === 'WARNING'
                      ? 'تحذير'
                      : 'معلومة'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-muted">{alert.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">{alert.description}</p>
                  </div>
                </div>

                {alert.link && (
                  <a
                    href={alert.link}
                    className="inline-flex items-center gap-1 text-xs font-bold text-success hover:text-success shrink-0"
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
      <section className="rounded-xl border border-line-strong bg-primary/60 p-5 shadow-sm">
        <header className="mb-4 flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-muted">مؤشرات صحة الأعمال (Commercial Health)</h3>
              <p className="text-xs text-muted">
                حالة العملاء، الاشتراكات السارية، التراخيص، والتدفق المالي للفوترة
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-muted">مفصولة عن صحة البنية التقنية</span>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. Tenants */}
          <div className="rounded-xl border border-line-strong/80 bg-primary/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Building2 className="h-4 w-4 text-primary" />
              العملاء والمستأجرين
            </p>
            <p className="mt-2 text-2xl font-black text-muted">{formatNumber(business.tenants.total)}</p>
            <p className="mt-1 text-xs text-muted">
              <span className="text-success font-semibold">{formatNumber(business.tenants.active)} نشط</span>
              {' · '}
              <span className="text-warning font-semibold">{formatNumber(business.tenants.suspended)} موقوف</span>
              {' · '}
              <span className="text-danger font-semibold">{formatNumber(business.tenants.expired)} منتهي</span>
            </p>
          </div>

          {/* 2. Licenses */}
          <div className="rounded-xl border border-line-strong/80 bg-primary/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <KeyRound className="h-4 w-4 text-success" />
              التراخيص الصادرة
            </p>
            <p className="mt-2 text-2xl font-black text-muted">{formatNumber(business.licenses.total)}</p>
            <p className="mt-1 text-xs text-muted">
              <span className="text-success font-semibold">{formatNumber(business.licenses.active)} ساري</span>
              {' · '}
              <span className="text-warning font-semibold">{formatNumber(business.licenses.expired)} منتهي</span>
              {' · '}
              <span className="text-danger font-semibold">{formatNumber(business.licenses.revoked)} ملغي</span>
            </p>
          </div>

          {/* 3. Subscriptions */}
          <div className="rounded-xl border border-line-strong/80 bg-primary/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Layers className="h-4 w-4 text-primary" />
              الاشتراكات والخطط
            </p>
            <p className="mt-2 text-2xl font-black text-muted">
              {formatNumber(business.subscriptions.total)}
            </p>
            <p className="mt-1 text-xs text-muted">
              <span className="text-success font-semibold">{formatNumber(business.subscriptions.active)} نشط</span>
              {' · '}
              <span className="text-warning font-semibold">
                {formatNumber(business.subscriptions.expiringSoon)} ينتهي قريباً
              </span>
            </p>
          </div>

          {/* 4. Billing & Revenue */}
          <div className="rounded-xl border border-line-strong/80 bg-primary/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Wallet className="h-4 w-4 text-warning" />
              الفوترة والاشتراكات
            </p>
            <p className="mt-2 text-2xl font-black text-muted">
              {formatMoney(business.billing.outstanding)}
            </p>
            <p className="mt-1 text-xs text-muted">
              <span className="text-danger font-semibold">
                {formatNumber(business.billing.overdueInvoices)} فاتورة متأخرة
              </span>
              {' · '}
              <span className="text-success font-semibold">MRR {formatMoney(business.billing.mrr)}</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlatformHealthPage;
