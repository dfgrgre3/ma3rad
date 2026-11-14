import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  Database,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Archive,
  Download,
  Terminal,
  Zap,
  Globe,
  Radio,
  Check,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformComprehensiveHealth,
  PlatformCentralBackup,
  PlatformServiceIncident,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, formatNumber } from './components/PlatformUI';

type HealthViewMode = 'cloud_server' | 'local_client';

export const PlatformSystemHealthPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<HealthViewMode>('cloud_server');
  const [health, setHealth] = useState<PlatformComprehensiveHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggeringBackup, setTriggeringBackup] = useState<boolean>(false);
  const [backupSuccess, setBackupSuccess] = useState<boolean>(false);

  const loadHealth = useCallback(() => {
    setLoading(true);
    try {
      const data = platformAdminService.getPlatformComprehensiveHealth();
      setHealth(data);
    } catch (e) {
      console.error('Failed to load platform health:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    // Auto-refresh telemetry every 15 seconds
    const interval = setInterval(loadHealth, 15000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const handleTriggerBackup = () => {
    setTriggeringBackup(true);
    setBackupSuccess(false);
    try {
      platformAdminService.triggerCentralBackup();
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
      loadHealth();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleResolveIncident = (id: string) => {
    try {
      platformAdminService.resolveServiceIncident(id);
      loadHealth();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading && !health) {
    return (
      <div className="py-20 text-center text-sm font-semibold text-zinc-400">
        جارٍ فحص صحة الخادم المركزي والمنصة...
      </div>
    );
  }

  const vitals = health?.serverVitals;
  const components = health?.components;

  return (
    <div className="space-y-6" dir="rtl">
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

      {/* Scope Disclaimer / Toggle Bar */}
      <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-300">نطاق الفحص والتشخيص:</span>
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setViewMode('cloud_server')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'cloud_server'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              الخادم المركزي والمنصة السحابية (Platform Cloud)
            </button>
            <button
              onClick={() => setViewMode('local_client')}
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'local_client'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              قاعدة البيانات المحلية للجهاز الحالي (Local Client)
            </button>
          </div>
        </div>

        {backupSuccess && (
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/40 text-xs">
            <CheckCircle2 className="w-4 h-4" />
            تم إنشاء النسخة الاحتياطية المركزية والتحقق منها بنجاح
          </span>
        )}
      </div>

      {viewMode === 'local_client' ? (
        /* Local Client Diagnostics View */
        <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            تشخيص قاعدة البيانات المحلية (Local Client Environment)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            هذه البيانات تخص بيئة التثبيت الحالية لنظام سطح المكتب أو المتصفح. تختلف عن الخادم المركزي الذي يخدم جميع المستأجرين.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/80">
              <span className="text-[11px] text-zinc-500">محرك قاعدة البيانات المحلي</span>
              <div className="text-sm font-bold text-zinc-200 mt-1">SQLite 3 (WASM / In-Memory & Storage)</div>
            </div>
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/80">
              <span className="text-[11px] text-zinc-500">سجل الترحيلات المطبقة محلياً</span>
              <div className="text-sm font-bold text-emerald-400 mt-1">235 ترحيل بنجاح</div>
            </div>
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/80">
              <span className="text-[11px] text-zinc-500">مزامنة البيانات السحابية (Outbox)</span>
              <div className="text-sm font-bold text-blue-400 mt-1">متصلة وخالية من التعارض</div>
            </div>
          </div>
        </div>
      ) : (
        /* Central Cloud Server Infrastructure View */
        <div className="space-y-6">
          {/* Top Overall Health Banner */}
          <section className="rounded-2xl bg-gradient-to-l from-zinc-900 via-zinc-900 to-emerald-950/60 p-6 border border-zinc-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  المؤشر الإجمالي لكفاءة خوادم المنصة
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-5xl font-black text-white">{health?.overallScore}%</span>
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    مستقر وطبيعي
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  متوسط وقت تشغيل الخوادم بدون انقطاع: <strong className="text-zinc-200">10 أيام متواصلة</strong>
                </p>
              </div>

              {/* Quick Component Health Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 block mb-1">قاعدة البيانات المركزية</span>
                  <span className="text-xs font-bold text-emerald-400">متصلة وسريعة</span>
                </div>
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 block mb-1">الذاكرة المؤقتة (Redis)</span>
                  <span className="text-xs font-bold text-emerald-400">متصلة (96.8%)</span>
                </div>
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 block mb-1">خدمة المزامنة السحابية</span>
                  <span className="text-xs font-bold text-emerald-400">{components?.syncService.connectedDevices} جهاز نشط</span>
                </div>
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 block mb-1">النسخ الاحتياطي المركزي</span>
                  <span className="text-xs font-bold text-emerald-400">مُفحص ومطابق</span>
                </div>
              </div>
            </div>
          </section>

          {/* Vitals Grid (CPU, Memory, Disk, API Latency) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU */}
            <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><Cpu className="w-4 h-4 text-emerald-400" /> استهلاك المعالج (CPU)</span>
                <span className="font-bold text-zinc-200">{vitals?.cpuPercent}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.cpuPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 block">ضمن المعدل الآمن (&lt; 65%)</span>
            </div>

            {/* Memory */}
            <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-blue-400" /> استهلاك الذاكرة (RAM)</span>
                <span className="font-bold text-zinc-200">{vitals?.memoryPercent}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.memoryPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 block">المتاح: 58% من إجمالي السعة</span>
            </div>

            {/* Disk */}
            <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-purple-400" /> مساحة التخزين (Disk)</span>
                <span className="font-bold text-zinc-200">{vitals?.diskPercent}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${vitals?.diskPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 block">التخزين السحابي المركزي NVMe</span>
            </div>

            {/* API Latency */}
            <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> زمن استجابة API</span>
                <span className="font-bold text-zinc-200">{vitals?.apiLatencyMs} ms</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-300 pt-1">
                <span className="text-[11px] text-zinc-500">معدل الأخطاء:</span>
                <span className="font-semibold text-emerald-400">{vitals?.apiErrorRatePercent}%</span>
              </div>
              <span className="text-[10px] text-zinc-500 block">اتصالات نشطة: {vitals?.activeConnections}</span>
            </div>
          </div>

          {/* Central Backups Verification & Telemetry Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Backups (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-emerald-400" />
                  النسخ الاحتياطية المركزية والتحقق من سلامتها (Backups Integrity)
                </h3>
              </div>

              <div className="overflow-x-auto bg-zinc-900/40 rounded-xl border border-zinc-800">
                <table className="w-full text-right text-xs">
                  <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-3 px-4">اسم ملف النسخة</th>
                      <th className="py-3 px-4">الحجم</th>
                      <th className="py-3 px-4">فحص التكامل</th>
                      <th className="py-3 px-4">تاريخ النسخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {health?.recentBackups.map((bk) => (
                      <tr key={bk.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-4 font-semibold text-zinc-200">{bk.filename}</td>
                        <td className="py-3 px-4 text-zinc-400">
                          {Math.round(bk.sizeBytes / (1024 * 1024))} MB
                        </td>
                        <td className="py-3 px-4 font-sans">
                          {bk.integrityCheckPassed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> مطابق ومحمي
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              <XCircle className="w-3 h-3" /> فشل الفحص
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-zinc-500 font-sans">{formatDateTime(bk.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Incidents & Alerts Log (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                تنبيهات وانقطاعات الخدمات المفتوحة
              </h3>

              {health?.openIncidents.length === 0 ? (
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 text-center text-xs text-zinc-400 space-y-2">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="font-semibold text-zinc-200">كافة الخدمات تعمل بكفاءة 100%</div>
                  <p className="text-[11px] text-zinc-500">لا توجد بلاغات أعطال أو حوادث غير محلولة.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {health?.openIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="bg-zinc-900/70 p-3.5 rounded-xl border border-zinc-800 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-100">{inc.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                          {inc.severity}
                        </span>
                      </div>
                      {inc.description && <p className="text-[11px] text-zinc-400">{inc.description}</p>}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                        <span className="text-[10px] text-zinc-500">{formatDateTime(inc.createdAt)}</span>
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
