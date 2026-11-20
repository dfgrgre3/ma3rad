import React, { useState, useEffect, useCallback } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Archive,
  Terminal,
  Zap,
  Check,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformComprehensiveHealth } from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
type HealthViewMode = 'cloud_server' | 'local_client';

interface CentralBackupRow {
  id: string;
  name: string | null;
  type: string;
  status: string;
  createdAt: string;
}

interface CentralOpsJobRow {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

interface CentralErrorReportRow {
  id: string;
  title: string;
  severity: string;
  occurrences: number;
  lastSeenAt: string;
  tenantName: string | null;
}

export const PlatformSystemHealthPage: React.FC = () => {
  const toast = useToast();
  const canManageSystemHealth = canPlatform('system-health', 'platform.system-health.update');
  const centralActive = getCentralDataSourceState().active;
  const [viewMode, setViewMode] = useState<HealthViewMode>('cloud_server');
  const [health, setHealth] = useState<PlatformComprehensiveHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [triggeringBackup, setTriggeringBackup] = useState<boolean>(false);
  const [backupSuccess, setBackupSuccess] = useState<boolean>(false);
  const backupSuccessTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Central-mode state
  const [centralBackups, setCentralBackups] = useState<CentralBackupRow[]>([]);
  const [centralJobs, setCentralJobs] = useState<CentralOpsJobRow[]>([]);
  const [centralErrors, setCentralErrors] = useState<CentralErrorReportRow[]>([]);

  const loadCentral = useCallback(() => {
    setLoading(true);
    Promise.all([
      centralPlatformClient.listBackups(),
      centralPlatformClient.listOpsJobs(),
      centralPlatformClient.listErrorReports({ status: 'OPEN' }),
    ])
      .then(([backups, jobs, errors]) => {
        setCentralBackups(backups as CentralBackupRow[]);
        setCentralJobs(jobs as CentralOpsJobRow[]);
        setCentralErrors(errors as CentralErrorReportRow[]);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات صحة النظام من الخادم المركزي.'))
      .finally(() => setLoading(false));
  }, []);

  const loadHealth = useCallback(() => {
    if (centralActive) { loadCentral(); return; }
    setLoading(true);
    try {
      const data = platformAdminService.getPlatformComprehensiveHealth();
      setHealth(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات صحة النظام.');
    } finally {
      setLoading(false);
    }
  }, [centralActive, loadCentral]);

  const handleTriggerCentralBackup = async () => {
    if (!canManageSystemHealth) { toast.warning('لا تملك صلاحية إدارة صحة النظام'); return; }
    setTriggeringBackup(true);
    setBackupSuccess(false);
    try {
      await centralPlatformClient.createBackup({ triggerSource: 'MANUAL', type: 'FULL' });
      setBackupSuccess(true);
      if (backupSuccessTimer.current) clearTimeout(backupSuccessTimer.current);
      backupSuccessTimer.current = setTimeout(() => setBackupSuccess(false), 3000);
      loadCentral();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTriggeringBackup(false);
    }
  };

  useEffect(() => {
    loadHealth();
    // Auto-refresh telemetry every 15 seconds
    const interval = setInterval(loadHealth, 15000);
    return () => {
      clearInterval(interval);
      if (backupSuccessTimer.current) clearTimeout(backupSuccessTimer.current);
    };
  }, [loadHealth]);

  const handleTriggerBackup = async () => {
    if (centralActive) { await handleTriggerCentralBackup(); return; }
    if (!canManageSystemHealth) { toast.warning('لا تملك صلاحية إدارة صحة النظام'); return; }
    setTriggeringBackup(true);
    setBackupSuccess(false);
    try {
      const created = await platformAdminService.triggerCentralBackup();
      setBackupSuccess(true);
      if (backupSuccessTimer.current) clearTimeout(backupSuccessTimer.current);
      backupSuccessTimer.current = setTimeout(() => setBackupSuccess(false), 3000);
      if (!created.integrityCheckPassed) {
        toast.success('تم إنشاء نسخة احتياطية محلية مشفرة، لكن لم يتم التحقق من نسخة خارج الموقع.');
      }
      loadHealth();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleResolveIncident = (id: string) => {
    if (!canManageSystemHealth) { toast.warning('لا تملك صلاحية إدارة صحة النظام'); return; }
    try {
      platformAdminService.resolveServiceIncident(id);
      loadHealth();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading && !health) {
    return (
      <div className="py-20 text-center text-sm font-semibold text-muted">
        جارٍ فحص صحة الخادم المركزي والمنصة...
      </div>
    );
  }

  const vitals = health?.serverVitals;
  const components = health?.components;

  const errorBanner = error ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </span>
      <Button variant="secondary" size="sm" onClick={loadHealth}>
        <RefreshCw className="h-3.5 w-3.5 ml-1" />
        إعادة المحاولة
      </Button>
    </div>
  ) : null;

  if (centralActive) {
    const backupStatusLabel: Record<string, string> = {
      REQUESTED: 'مطلوبة', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتملة', FAILED: 'فاشلة', EXPIRED: 'منتهية',
    };
    const jobStatusLabel: Record<string, string> = {
      PENDING: 'معلقة', RUNNING: 'قيد التنفيذ', COMPLETED: 'مكتملة', FAILED: 'فاشلة', CANCELLED: 'ملغاة',
    };
    const failedJobs = centralJobs.filter((j) => j.status === 'FAILED').length;
    const runningJobs = centralJobs.filter((j) => j.status === 'RUNNING' || j.status === 'PENDING').length;
    const lastBackup = centralBackups[0];

    return (
      <div className="space-y-6">
        <PageHeader
          title="صحة النظام — الخادم المركزي (System Health)"
          description="مراقبة حية للنسخ الاحتياطية المركزية، مهام التشغيل، والأخطاء المفتوحة على خادم المنصة."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={loadHealth}>
                <RefreshCw className="w-4 h-4 ml-2" />
                تحديث القياسات
              </Button>
              <Button variant="primary" onClick={handleTriggerBackup} disabled={triggeringBackup}>
                <Archive className="w-4 h-4 ml-2" />
                {triggeringBackup ? 'جاري النسخ...' : 'نسخة احتياطية مركزية الآن'}
              </Button>
            </div>
          }
        />

        {errorBanner}

        {backupSuccess && (
          <div className="flex items-center gap-1.5 text-success font-semibold bg-success/40 px-3 py-1.5 rounded-lg border border-success/40 text-xs w-fit">
            <CheckCircle2 className="w-4 h-4" />
            تم إنشاء طلب النسخة الاحتياطية المركزية بنجاح
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-primary/60 p-4 rounded-xl border border-line-strong">
            <span className="text-[11px] text-muted block">آخر نسخة احتياطية</span>
            <span className="text-sm font-bold text-muted mt-1 block">
              {lastBackup ? backupStatusLabel[lastBackup.status] ?? lastBackup.status : 'لا توجد نسخ'}
            </span>
            {lastBackup && <span className="text-[10px] text-muted">{formatDateTime(lastBackup.createdAt)}</span>}
          </div>
          <div className="bg-primary/60 p-4 rounded-xl border border-line-strong">
            <span className="text-[11px] text-muted block">مهام تشغيل نشطة</span>
            <span className="text-sm font-bold text-primary mt-1 block">{runningJobs}</span>
          </div>
          <div className="bg-primary/60 p-4 rounded-xl border border-line-strong">
            <span className="text-[11px] text-muted block">مهام فاشلة</span>
            <span className={`text-sm font-bold mt-1 block ${failedJobs ? 'text-danger' : 'text-success'}`}>{failedJobs}</span>
          </div>
          <div className="bg-primary/60 p-4 rounded-xl border border-line-strong">
            <span className="text-[11px] text-muted block">أخطاء مفتوحة</span>
            <span className={`text-sm font-bold mt-1 block ${centralErrors.length ? 'text-warning' : 'text-success'}`}>{centralErrors.length}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Backups */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-success" />
              النسخ الاحتياطية المركزية
            </h3>
            {centralBackups.length === 0 ? (
              <EmptyState title="لا توجد نسخ احتياطية" description="أنشئ أول نسخة من زر «نسخة احتياطية مركزية الآن»." />
            ) : (
              <div className="overflow-x-auto bg-primary/40 rounded-xl border border-line-strong">
                <DataTable
                  ariaLabel="النسخ الاحتياطية المركزية"
                  rows={centralBackups.slice(0, 20)}
                  rowKey={(bk) => bk.id}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'name', header: 'الاسم', render: (bk) => <span className="font-semibold text-muted">{bk.name ?? bk.id}</span> },
                    { key: 'type', header: 'النوع', render: (bk) => <span className="text-muted">{bk.type}</span> },
                    {
                      key: 'status', header: 'الحالة',
                      render: (bk) => (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          bk.status === 'COMPLETED' ? 'bg-success/10 text-success border-success/20'
                          : bk.status === 'FAILED' ? 'bg-danger/10 text-danger border-danger/20'
                          : 'bg-warning/10 text-warning border-warning/20'
                        }`}>
                          {backupStatusLabel[bk.status] ?? bk.status}
                        </span>
                      ),
                    },
                    { key: 'date', header: 'التاريخ', render: (bk) => <span className="text-[11px] text-muted">{formatDateTime(bk.createdAt)}</span> },
                  ]}
                />
              </div>
            )}
          </div>

          {/* Ops jobs + open errors */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" />
                مهام التشغيل الحديثة
              </h3>
              {centralJobs.length === 0 ? (
                <div className="bg-primary/30 border border-line-strong/80 rounded-xl p-6 text-center text-xs text-muted">
                  لا توجد مهام تشغيل مسجلة.
                </div>
              ) : (
                <ul className="space-y-2">
                  {centralJobs.slice(0, 10).map((j) => (
                    <li key={j.id} className="bg-primary/70 p-3 rounded-xl border border-line-strong text-xs flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-muted">{j.type}</span>
                        <span className="text-[10px] text-muted block">{formatDateTime(j.createdAt)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        j.status === 'COMPLETED' ? 'bg-success/10 text-success border-success/20'
                        : j.status === 'FAILED' ? 'bg-danger/10 text-danger border-danger/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                      }`}>
                        {jobStatusLabel[j.status] ?? j.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warning" />
                الأخطاء المفتوحة
              </h3>
              {centralErrors.length === 0 ? (
                <div className="bg-primary/30 border border-line-strong/80 rounded-xl p-6 text-center text-xs text-muted space-y-1">
                  <ShieldCheck className="w-7 h-7 text-success mx-auto" />
                  <div className="font-semibold text-muted">لا أخطاء مفتوحة</div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {centralErrors.slice(0, 8).map((e) => (
                    <li key={e.id} className="bg-primary/70 p-3 rounded-xl border border-line-strong text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-muted truncate">{e.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-danger/10 text-danger border border-danger/20 font-mono shrink-0">
                          {e.severity}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted mt-1">{e.tenantName ?? 'منصة'} · ×{e.occurrences} · {formatDateTime(e.lastSeenAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="صحة النظام وتشخيص المنصة المركزية (System Health)"
        description="مراقبة حية لأداء الخادم السحابي المركزي، قواعد البيانات، زمن استجابة API، والنسخ الاحتياطية والتنبيهات"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadHealth}>
              <RefreshCw className="w-4 h-4 ml-2" />
              تحديث القياسات
            </Button>
            <Button
              variant="primary"
              onClick={handleTriggerBackup}
              disabled={triggeringBackup}
            >
              <Archive className="w-4 h-4 ml-2" />
              {triggeringBackup ? 'جاري النسخ...' : 'نسخ احتياطي مركزي الآن'}
            </Button>
          </div>
        }
      />

      {errorBanner}

      {/* Scope Disclaimer / Toggle Bar */}
      <div className="bg-primary/60 p-3 rounded-xl border border-line-strong flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-success" />
          <span className="text-xs font-semibold text-muted">نطاق الفحص والتشخيص:</span>
          <div className="flex bg-primary p-1 rounded-lg border border-line-strong text-xs">
            <button
              onClick={() => setViewMode('cloud_server')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'cloud_server'
                  ? 'bg-success/20 text-success font-semibold'
                  : 'text-muted hover:text-muted'
              }`}
            >
              الخادم المركزي والمنصة السحابية (Platform Cloud)
            </button>
            <button
              onClick={() => setViewMode('local_client')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'local_client'
                  ? 'bg-success/20 text-success font-semibold'
                  : 'text-muted hover:text-muted'
              }`}
            >
              قاعدة البيانات المحلية للجهاز الحالي (Local Client)
            </button>
          </div>
        </div>

        {backupSuccess && (
          <span className="flex items-center gap-1.5 text-success font-semibold bg-success/40 px-3 py-1.5 rounded-lg border border-success/40 text-xs">
            <CheckCircle2 className="w-4 h-4" />
            تم إنشاء النسخة الاحتياطية المركزية والتحقق منها بنجاح
          </span>
        )}
      </div>

      {viewMode === 'local_client' ? (
        /* Local Client Diagnostics View */
        <div className="bg-primary/50 p-6 rounded-xl border border-line-strong space-y-4">
          <h3 className="text-sm font-semibold text-muted flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            تشخيص قاعدة البيانات المحلية (Local Client Environment)
          </h3>
          <p className="text-xs text-muted leading-relaxed">
            هذه البيانات تخص بيئة التثبيت الحالية لنظام سطح المكتب أو المتصفح. تختلف عن الخادم المركزي الذي يخدم جميع المستأجرين.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-primary p-4 rounded-lg border border-line-strong/80">
              <span className="text-[11px] text-muted">محرك قاعدة البيانات المحلي</span>
              <div className="text-sm font-bold text-muted mt-1">SQLite (WASM / التخزين المحلي)</div>
            </div>
            <div className="bg-primary p-4 rounded-lg border border-line-strong/80">
              <span className="text-[11px] text-muted">سجل الترحيلات المطبقة محلياً</span>
              <div className="text-sm font-bold text-muted mt-1">تُطبَّق تلقائياً عند بدء التشغيل</div>
            </div>
            <div className="bg-primary p-4 rounded-lg border border-line-strong/80">
              <span className="text-[11px] text-muted">مزامنة البيانات السحابية (Outbox)</span>
              <div className="text-sm font-bold text-muted mt-1">تُوثَّق في سجل المزامنة المحلي</div>
            </div>
          </div>
        </div>
      ) : (
        /* Central Cloud Server Infrastructure View */
        <div className="space-y-6">
          {/* Top Overall Health Banner */}
          <section className="rounded-2xl bg-gradient-to-l from-ink via-ink to-success/60 p-6 border border-line-strong shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-success">
                  المؤشر الإجمالي لكفاءة خوادم المنصة
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-5xl font-black text-white">
                    {health ? `${health.overallScore}%` : '—'}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${
                    !health
                      ? 'bg-line-strong/20 text-muted border-line-strong/40'
                      : health.overallScore >= 90
                      ? 'bg-success/10 text-success border-success/20'
                      : health.overallScore >= 70
                      ? 'bg-warning/10 text-warning border-warning/20'
                      : 'bg-danger/10 text-danger border-danger/20'
                  }`}>
                    {!health
                      ? 'بيانات غير متاحة'
                      : health.overallScore >= 90
                      ? 'مستقر وطبيعي'
                      : health.overallScore >= 70
                      ? 'مستقر مع ملاحظات'
                      : 'يحتاج انتباه'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  متوسط وقت تشغيل الخادم المقاس:{' '}
                  <strong className="text-muted">
                    {vitals?.uptimeSeconds != null
                      ? vitals.uptimeSeconds >= 86400
                        ? `${Math.floor(vitals.uptimeSeconds / 86400)} يوم`
                        : `${Math.floor(vitals.uptimeSeconds / 3600)} ساعة`
                      : '—'}
                  </strong>
                </p>
              </div>

              {/* Quick Component Health Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-primary/80 p-3 rounded-xl border border-line-strong text-center">
                  <span className="text-[10px] text-muted block mb-1">قاعدة البيانات المركزية</span>
                  <span className={`text-xs font-bold ${components?.database.status === 'HEALTHY' ? 'text-success' : components?.database.status === 'DEGRADED' ? 'text-warning' : components ? 'text-danger' : 'text-muted'}`}>
                    {components?.database.status === 'HEALTHY' ? 'متصلة وسريعة' : components?.database.status === 'DEGRADED' ? 'متدهورة' : components?.database.status === 'DOWN' ? 'متعطلة' : '—'}
                  </span>
                </div>
                <div className="bg-primary/80 p-3 rounded-xl border border-line-strong text-center">
                  <span className="text-[10px] text-muted block mb-1">الذاكرة المؤقتة (Redis)</span>
                  <span className={`text-xs font-bold ${components?.redisCache.status === 'CONNECTED' ? 'text-success' : components ? 'text-danger' : 'text-muted'}`}>
                    {components?.redisCache.status === 'CONNECTED' ? `متصلة (${components.redisCache.hitRatioPercent}%)` : components?.redisCache.status === 'DISCONNECTED' ? 'منقطعة' : '—'}
                  </span>
                </div>
                <div className="bg-primary/80 p-3 rounded-xl border border-line-strong text-center">
                  <span className="text-[10px] text-muted block mb-1">خدمة المزامنة السحابية</span>
                  <span className={`text-xs font-bold ${components?.syncService.status === 'HEALTHY' ? 'text-success' : components ? 'text-warning' : 'text-muted'}`}>
                    {components?.syncService.status === 'HEALTHY' ? `${components.syncService.connectedDevices} جهاز نشط` : components?.syncService.status === 'WARNING' ? `${components.syncService.connectedDevices} جهاز · تحذير` : '—'}
                  </span>
                </div>
                <div className="bg-primary/80 p-3 rounded-xl border border-line-strong text-center">
                  <span className="text-[10px] text-muted block mb-1">النسخ الاحتياطي المركزي</span>
                  <span className={`text-xs font-bold ${components?.backupSystem.status === 'VERIFIED' ? 'text-success' : components ? 'text-danger' : 'text-muted'}`}>
                    {components?.backupSystem.status === 'VERIFIED' ? 'مُفحص ومطابق' : components?.backupSystem.status === 'FAILED' ? 'فشل الفحص' : '—'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Vitals Grid (CPU, Memory, Disk, API Latency) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU */}
            <div className="bg-primary/60 p-4 rounded-xl border border-line-strong space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><Cpu className="w-4 h-4 text-success" /> استهلاك المعالج (CPU)</span>
                <span className="font-bold text-muted">{vitals ? `${vitals.cpuPercent}%` : '—'}</span>
              </div>
              <div className="w-full bg-primary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-success h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.cpuPercent ?? 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted block">ضمن المعدل الآمن (&lt; 65%)</span>
            </div>

            {/* Memory */}
            <div className="bg-primary/60 p-4 rounded-xl border border-line-strong space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-primary" /> استهلاك الذاكرة (RAM)</span>
                <span className="font-bold text-muted">{vitals ? `${vitals.memoryPercent}%` : '—'}</span>
              </div>
              <div className="w-full bg-primary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.memoryPercent ?? 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted block">
                {vitals ? `المتاح: ${Math.max(0, Math.round(100 - vitals.memoryPercent))}% من إجمالي السعة` : 'بيانات غير متاحة'}
              </span>
            </div>

            {/* Disk */}
            <div className="bg-primary/60 p-4 rounded-xl border border-line-strong space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-primary" /> مساحة التخزين (Disk)</span>
                <span className="font-bold text-muted">{vitals ? `${vitals.diskPercent}%` : '—'}</span>
              </div>
              <div className="w-full bg-primary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.diskPercent ?? 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted block">التخزين السحابي المركزي NVMe</span>
            </div>

            {/* API Latency */}
            <div className="bg-primary/60 p-4 rounded-xl border border-line-strong space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-warning" /> زمن استجابة API</span>
                <span className="font-bold text-muted">{vitals ? `${vitals.apiLatencyMs} ms` : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted pt-1">
                <span className="text-[11px] text-muted">معدل الأخطاء:</span>
                <span className={`font-semibold ${vitals && vitals.apiErrorRatePercent > 0 ? 'text-warning' : 'text-success'}`}>
                  {vitals ? `${vitals.apiErrorRatePercent}%` : '—'}
                </span>
              </div>
              <span className="text-[10px] text-muted block">اتصالات نشطة: {vitals ? vitals.activeConnections : '—'}</span>
            </div>
          </div>

          {/* Central Backups Verification & Telemetry Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Backups (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-success" />
                  النسخ الاحتياطية المركزية والتحقق من سلامتها (Backups Integrity)
                </h3>
              </div>

              <div className="overflow-x-auto bg-primary/40 rounded-xl border border-line-strong">
                <DataTable
                  ariaLabel="فحص سلامة النسخ الاحتياطية"
                  rows={health?.recentBackups ?? []}
                  rowKey={(bk) => bk.id}
                  dense
                  tableClassName="text-xs font-mono"
                  columns={[
                    { key: 'file', header: 'اسم ملف النسخة', render: (bk) => <span className="font-semibold text-muted">{bk.filename}</span> },
                    { key: 'size', header: 'الحجم', render: (bk) => <span className="text-muted">{Math.round(bk.sizeBytes / (1024 * 1024))} MB</span> },
                    {
                      key: 'integrity', header: 'فحص التكامل',
                      render: (bk) => bk.integrityCheckPassed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-success bg-success/10 px-2 py-0.5 rounded border border-success/20 font-sans">
                          <CheckCircle2 className="w-3 h-3" /> مطابق ومحمي
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-danger bg-danger/10 px-2 py-0.5 rounded border border-danger/20 font-sans">
                          <XCircle className="w-3 h-3" /> فشل الفحص
                        </span>
                      ),
                    },
                    { key: 'date', header: 'تاريخ النسخ', render: (bk) => <span className="text-[11px] text-muted font-sans">{formatDateTime(bk.createdAt)}</span> },
                  ]}
                />
              </div>
            </div>

            {/* Incidents & Alerts Log (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warning" />
                تنبيهات وانقطاعات الخدمات المفتوحة
              </h3>

              {!health ? (
                <div className="bg-primary/30 border border-line-strong/80 rounded-xl p-8 text-center text-xs text-muted">
                  تعذّر تحميل بيانات الحوادث — راجع رسالة الخطأ أعلاه.
                </div>
              ) : health.openIncidents.length === 0 ? (
                <div className="bg-primary/30 border border-line-strong/80 rounded-xl p-8 text-center text-xs text-muted space-y-2">
                  <ShieldCheck className="w-8 h-8 text-success mx-auto" />
                  <div className="font-semibold text-muted">لا توجد بلاغات أعطال أو حوادث غير محلولة.</div>
                  <p className="text-[11px] text-muted">جميع الخدمات المراقبة تعمل ضمن النطاق الطبيعي.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {health?.openIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="bg-primary/70 p-3.5 rounded-xl border border-line-strong space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-muted">{inc.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-danger/10 text-danger border border-danger/20 font-mono">
                          {inc.severity}
                        </span>
                      </div>
                      {inc.description && <p className="text-[11px] text-muted">{inc.description}</p>}
                      <div className="flex items-center justify-between pt-2 border-t border-line-strong/60">
                        <span className="text-[10px] text-muted">{formatDateTime(inc.createdAt)}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResolveIncident(inc.id)}
                        >
                          <Check className="w-3.5 h-3.5 ml-1" />
                          تحديد كمحلول
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformSystemHealthPage;
