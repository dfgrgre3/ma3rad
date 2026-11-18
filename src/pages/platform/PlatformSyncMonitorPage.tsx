import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Search,
  Filter,
  Play,
  Smartphone,
  Building2,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource'; 
import type {
  PlatformSyncLogEntry,
  PlatformSyncStatus,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  EmptyState,
  formatDateTime,
  formatNumber,
  inputClass,
} from './components/PlatformUI';

export const PlatformSyncMonitorPage: React.FC = () => {
  const [logs, setLogs] = useState<PlatformSyncLogEntry[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tenantFilter, setTenantFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [logList, tenantList] = await Promise.all([
          centralPlatformClient.listSyncEvents({ status: statusFilter || undefined, limit: 100 }),
          centralPlatformClient.listTenants(),
        ]);
        setLogs(logList as any);
        setTenants(tenantList as any);
      } else {
        const logList = platformAdminService.listSyncStatus({
          status: statusFilter as PlatformSyncStatus || undefined,
          limit: 100,
        });
        const tenantList = platformAdminService.listTenants();
        setLogs(logList);
        setTenants(tenantList);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل سجلات المزامنة.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run a real pull through the configured sync client and log its actual result.
  const handleRunSync = async (tenantId?: string) => {
    const sync = typeof window !== 'undefined' ? window.ceramisys?.sync : undefined;
    if (!sync?.pullEvents) {
      alert('تنفيذ المزامنة يتطلب تطبيق سطح المكتب مع عميل مزامنة مهيأ.');
      return;
    }
    try {
      const status = await sync.status?.();
      if (!status?.clientConfigured) {
        alert('لا يوجد عميل مزامنة مهيأ على هذا الجهاز. أعد تهيئة المزامنة من إعدادات المزامنة أولاً.');
        return;
      }
      const result = await sync.pullEvents('all', null, 100);
      const pulledCount = result?.events?.length ?? 0;
      platformAdminService.logSyncEvent({
        tenantId: tenantId || tenants[0]?.id,
        syncType: 'MANUAL_PULL',
        status: 'SUCCESS',
        recordsSynced: pulledCount,
      });
      alert(`تم تنفيذ المزامنة وسحب ${pulledCount} حدثاً.`);
      loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'فشلت المزامنة.';
      try {
        platformAdminService.logSyncEvent({
          tenantId: tenantId || tenants[0]?.id,
          syncType: 'MANUAL_PULL',
          status: 'FAIL',
          recordsSynced: 0,
          errorDetail: message,
        });
      } catch {
        // Logging can fail when the platform console is not in an owner session.
      }
      alert(message);
      loadData();
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (tenantFilter && l.tenantId !== tenantFilter) return false;
    return true;
  });

  const successCount = filteredLogs.filter((l) => l.status === 'SUCCESS').length;
  const failedCount = filteredLogs.filter((l) => l.status === 'FAIL').length;
  const pendingCount = filteredLogs.filter((l) => l.status === 'PARTIAL').length;

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="مراقبة المزامنة المركزية (Sync Monitor & Edge Health)"
        description="مراقبة مزامنة الفروع والأجهزة دون اتصال (Offline-first)، رصد العمليات المتأخرة، النزاعات، وإعادة المحاولة."
        icon={<RefreshCw className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRunSync()}
              leadingIcon={<Play className="h-4 w-4" />}
            >
              تشغيل مزامنة الآن
            </Button>
            <Button
              size="sm"
              onClick={loadData}
              leadingIcon={<RefreshCw className="h-4 w-4" />}
            >
              تحديث السجلات
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
          <p className="text-[11px] font-semibold text-slate-400">إجمالي عمليات المزامنة الموثقة</p>
          <p className="text-xl font-black text-slate-100 mt-1">{filteredLogs.length}</p>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-emerald-400">مزامنة ناجحة</p>
          <p className="text-xl font-black text-emerald-300 mt-1">{successCount}</p>
        </div>
        <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-rose-400">فشل أو تعارض (Conflicts)</p>
          <p className="text-xl font-black text-rose-300 mt-1">{failedCount}</p>
        </div>
        <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl">
          <p className="text-[11px] font-semibold text-amber-400">معلقة أو جزئية</p>
          <p className="text-xl font-black text-amber-300 mt-1">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 shadow-sm">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputClass} max-w-[180px]`}
        >
          <option value="">جميع الحالات</option>
          <option value="SUCCESS">ناجحة (Success)</option>
          <option value="FAIL">فاشلة (Failed)</option>
          <option value="PARTIAL">مزامنة جزئية / تعارض (Partial)</option>
        </select>

        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className={`${inputClass} max-w-[220px]`}
        >
          <option value="">جميع المستأجرين / العملاء</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {/* Sync Log Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ قراءة سجلات المزامنة...</div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6 text-slate-500" />}
            title="لا توجد عمليات مزامنة مسجلة"
            description="السجل هادئ حالياً ولا توجد تعارضات أو عمليات فاشلة مسجلة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">العميل / الجهاز</th>
                  <th className="px-4 py-3">نوع المزامنة</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">السجلات المنقولة</th>
                  <th className="px-4 py-3">تفاصيل أو أخطاء</th>
                  <th className="px-4 py-3">التوقيت</th>
                  <th className="px-4 py-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLogs.map((log) => {
                  const tenantObj = tenants.find((t) => t.id === log.tenantId);
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100">
                          {tenantObj ? tenantObj.name : log.tenantId ? log.tenantId : 'عام للمنصة'}
                        </div>
                        {log.deviceId && (
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                            <Smartphone className="h-3 w-3" />
                            {log.deviceId}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                          {log.syncType}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            log.status === 'SUCCESS'
                              ? 'text-emerald-400'
                              : log.status === 'FAIL'
                              ? 'text-rose-400'
                              : log.status === 'PARTIAL'
                              ? 'text-amber-400 font-black'
                              : 'text-sky-400'
                          }`}
                        >
                          {log.status === 'SUCCESS' ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> نجاح
                            </>
                          ) : log.status === 'FAIL' ? (
                            <>
                              <XCircle className="h-3 w-3" /> فشل
                            </>
                          ) : log.status === 'PARTIAL' ? (
                            <>
                              <AlertTriangle className="h-3 w-3" /> تعارض بيانات
                            </>
                          ) : (
                            log.status
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-200">
                        {formatNumber(log.recordsSynced)} سجل
                      </td>

                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                        {log.errorDetail ? (
                          <span className="text-rose-400 font-mono text-[11px]">{log.errorDetail}</span>
                        ) : (
                          'مزامنة سليمة تماماً'
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-400">{formatDateTime(log.createdAt)}</td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => void handleRunSync(log.tenantId)}
                          className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 mx-auto"
                          title="إعادة المزامنة فوراً"
                        >
                          <RotateCcw className="h-3 w-3" />
                          إعادة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSyncMonitorPage;
