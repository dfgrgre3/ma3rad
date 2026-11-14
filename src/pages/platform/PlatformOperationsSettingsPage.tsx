import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Play,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Server,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  Plus,
  ArrowRight,
  Database,
  Smartphone,
  Cpu,
  Layers,
  Terminal,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformOpsJob,
  PlatformOpsJobStatus,
  PlatformMaintenanceWindow,
  PlatformMaintenanceStatus,
  PlatformOpApproval,
  PlatformOpApprovalStatus,
  PlatformSyncLogEntry,
  PlatformSyncStatus,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, formatDateTime, inputClass } from './components/PlatformUI';

type OperationsTab = 'jobs' | 'scheduled' | 'sync' | 'approvals' | 'maintenance' | 'errors';

export const PlatformOperationsSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<OperationsTab>('jobs');
  const [loading, setLoading] = useState<boolean>(true);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);

  // Jobs state
  const [jobs, setJobs] = useState<PlatformOpsJob[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('');
  const [jobTenantFilter, setJobTenantFilter] = useState<string>('');
  const [jobSearch, setJobSearch] = useState<string>('');
  const [newJobModalOpen, setNewJobModalOpen] = useState<boolean>(false);
  const [newJobType, setNewJobType] = useState<string>('SCHEMA_MIGRATE');
  const [newJobTenantId, setNewJobTenantId] = useState<string>('');
  const [newJobPriority, setNewJobPriority] = useState<number>(5);

  // Maintenance state
  const [maintenanceWindows, setMaintenanceWindows] = useState<PlatformMaintenanceWindow[]>([]);
  const [newMaintModalOpen, setNewMaintModalOpen] = useState<boolean>(false);
  const [newMaintTitle, setNewMaintTitle] = useState<string>('');
  const [newMaintDesc, setNewMaintDesc] = useState<string>('');
  const [newMaintStart, setNewMaintStart] = useState<string>('');
  const [newMaintEnd, setNewMaintEnd] = useState<string>('');
  const [newMaintServices, setNewMaintServices] = useState<string>('api,web,sync');

  // Approvals state
  const [approvals, setApprovals] = useState<PlatformOpApproval[]>([]);
  const [approvalActionModal, setApprovalActionModal] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null);
  const [approvalNotes, setApprovalNotes] = useState<string>('');

  // Sync state
  const [syncLogs, setSyncLogs] = useState<PlatformSyncLogEntry[]>([]);
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('');

  // Load Tenants
  const loadTenants = useCallback(() => {
    try {
      const list = platformAdminService.listTenants();
      setTenants(list);
    } catch {
      // Fallback
      setTenants([]);
    }
  }, []);

  // Load Data based on active tab
  const loadData = useCallback(() => {
    setLoading(true);
    try {
      if (activeTab === 'jobs' || activeTab === 'scheduled' || activeTab === 'errors') {
        const res = platformAdminService.listOpsJobs({
          status: activeTab === 'errors' ? 'FAILED' : jobStatusFilter || undefined,
          tenantId: jobTenantFilter || undefined,
        });
        setJobs(res.jobs);
      }
      if (activeTab === 'maintenance') {
        const mw = platformAdminService.listMaintenanceWindows();
        setMaintenanceWindows(mw);
      }
      if (activeTab === 'approvals') {
        const apprs = platformAdminService.listOpApprovals();
        setApprovals(apprs);
      }
      if (activeTab === 'sync') {
        const logs = platformAdminService.listSyncStatus({
          status: syncStatusFilter || undefined,
        });
        setSyncLogs(logs);
      }
    } catch (err) {
      console.error('Failed to load operations data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, jobStatusFilter, jobTenantFilter, syncStatusFilter]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const handleRetryJob = (id: string) => {
    try {
      platformAdminService.retryOpsJob(id);
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCancelJob = (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه العملية؟')) return;
    try {
      platformAdminService.cancelOpsJob(id);
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      platformAdminService.createOpsJob({
        type: newJobType,
        tenantId: newJobTenantId || undefined,
        priority: Number(newJobPriority),
      });
      setNewJobModalOpen(false);
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCreateMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaintTitle || !newMaintStart || !newMaintEnd) return;
    try {
      platformAdminService.createMaintenanceWindow({
        title: newMaintTitle,
        description: newMaintDesc || undefined,
        startsAt: newMaintStart,
        endsAt: newMaintEnd,
        affectedServices: newMaintServices.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setNewMaintModalOpen(false);
      setNewMaintTitle('');
      setNewMaintDesc('');
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCancelMaintenance = (id: string) => {
    if (!confirm('هل أنت متأكد من إلغاء نافذة الصيانة؟')) return;
    try {
      platformAdminService.cancelMaintenanceWindow(id);
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleConfirmApprovalAction = () => {
    if (!approvalActionModal) return;
    try {
      if (approvalActionModal.type === 'approve') {
        platformAdminService.approveOp(approvalActionModal.id, approvalNotes);
      } else {
        platformAdminService.rejectOp(approvalActionModal.id, approvalNotes);
      }
      setApprovalActionModal(null);
      setApprovalNotes('');
      loadData();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // Helper labels & styling
  const getJobStatusBadge = (status: PlatformOpsJobStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3" /> قيد الانتظار</span>;
      case 'RUNNING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><RefreshCw className="w-3 h-3 animate-spin" /> قيد التشغيل</span>;
      case 'DONE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> مكتملة</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertTriangle className="w-3 h-3" /> فشلت</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"><XCircle className="w-3 h-3" /> ملغاة</span>;
    }
  };

  const getMaintStatusBadge = (status: PlatformMaintenanceStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">مجدولة</span>;
      case 'ACTIVE':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">جارية حالياً</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">مكتملة</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">ملغاة</span>;
    }
  };

  const getApprovalStatusBadge = (status: PlatformOpApprovalStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">في انتظار الموافقة</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">تمت الموافقة</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">مرفوضة</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">ملغاة</span>;
    }
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (jobSearch) {
        const q = jobSearch.toLowerCase();
        const matchesId = j.id.toLowerCase().includes(q);
        const matchesType = j.type.toLowerCase().includes(q);
        const matchesTenant = j.tenantId?.toLowerCase().includes(q);
        if (!matchesId && !matchesType && !matchesTenant) return false;
      }
      if (activeTab === 'scheduled' && !j.scheduledAt) return false;
      return true;
    });
  }, [jobs, jobSearch, activeTab]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <PageHeader
        title="مركز التشغيل والموافقات"
        description="إدارة طوابير العمليات، المهام المجدولة، حالات المزامنة، نوافذ الصيانة، وموافقات العمليات الحساسة"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadData}>
              <RefreshCw className="w-4 h-4 ml-2" />
              تحديث
            </Button>
            {activeTab === 'jobs' && (
              <Button variant="primary" onClick={() => setNewJobModalOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />
                إنشاء مهمة تشغيل
              </Button>
            )}
            {activeTab === 'maintenance' && (
              <Button variant="primary" onClick={() => setNewMaintModalOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />
                جدولة صيانة
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 space-x-1 space-x-reverse overflow-x-auto">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'jobs'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          طابور العمليات (Queue)
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'scheduled'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          المهام المجدولة
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sync'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          حالة المزامنة والأجهزة
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'approvals'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          موافقات العمليات الحساسة
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'maintenance'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          أعمال الصيانة المجدولة
        </button>
        <button
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'errors'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          سجل الأخطاء والمعالجات
        </button>
      </div>

      {/* Main Tab Views */}
      {/* ─── TAB 1 & 2 & 6: Jobs, Scheduled, Errors ───────────────────────────────── */}
      {(activeTab === 'jobs' || activeTab === 'scheduled' || activeTab === 'errors') && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  placeholder="بحث بنوع المهمة أو المعرف..."
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  className={`${inputClass} pr-9`}
                />
              </div>
              {activeTab === 'jobs' && (
                <select
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  className={inputClass}
                >
                  <option value="">جميع الحالات</option>
                  <option value="PENDING">قيد الانتظار</option>
                  <option value="RUNNING">قيد التشغيل</option>
                  <option value="DONE">مكتملة</option>
                  <option value="FAILED">فاشلة</option>
                  <option value="CANCELLED">ملغاة</option>
                </select>
              )}
              <select
                value={jobTenantFilter}
                onChange={(e) => setJobTenantFilter(e.target.value)}
                className={inputClass}
              >
                <option value="">جميع العملاء</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-zinc-400">
              إجمالي النتائج: <span className="font-semibold text-zinc-200">{filteredJobs.length}</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <table className="w-full text-right text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">نوع العملية</th>
                  <th className="py-3 px-4">العميل المرتبط</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">الأولوية</th>
                  <th className="py-3 px-4">المحاولات</th>
                  <th className="py-3 px-4">التاريخ والجدولة</th>
                  <th className="py-3 px-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <EmptyState title="لا توجد مهام تشغيل تطابق الفلاتر المحددة" />
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-200">{job.type}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5">{job.id.substring(0, 8)}...</div>
                        {job.errorMessage && (
                          <div className="text-xs text-rose-400 mt-1 max-w-md truncate" title={job.errorMessage}>
                            خطأ: {job.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {job.tenantId ? (
                          <span className="text-zinc-300">
                            {tenants.find((t) => t.id === job.tenantId)?.name || job.tenantId}
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-xs">نظام عام</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{getJobStatusBadge(job.status)}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {job.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs ${job.retries > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>
                          {job.retries} / {job.maxRetries}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-400">
                        <div>أنشئت: {formatDateTime(job.createdAt)}</div>
                        {job.scheduledAt && <div className="text-blue-400">مجدولة: {formatDateTime(job.scheduledAt)}</div>}
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRetryJob(job.id)}
                              title="إعادة المحاولة فوراً"
                            >
                              <RotateCcw className="w-3.5 h-3.5 ml-1 text-amber-400" />
                              إعادة
                            </Button>
                          )}
                          {(job.status === 'PENDING' || job.status === 'RUNNING') && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleCancelJob(job.id)}
                              title="إلغاء العملية"
                            >
                              <X className="w-3.5 h-3.5 ml-1" />
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: Sync & Devices ────────────────────────────────────────────────── */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-3">
              <select
                value={syncStatusFilter}
                onChange={(e) => setSyncStatusFilter(e.target.value)}
                className={inputClass}
              >
                <option value="">جميع حالات المزامنة</option>
                <option value="SUCCESS">نجحت (SUCCESS)</option>
                <option value="PARTIAL">جزئية (PARTIAL)</option>
                <option value="FAIL">فشلت (FAIL)</option>
              </select>
            </div>
            <div className="text-xs text-zinc-400">
              سجلات المزامنة الأخيرة: <span className="font-semibold text-zinc-200">{syncLogs.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <table className="w-full text-right text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">نوع المزامنة</th>
                  <th className="py-3 px-4">العميل</th>
                  <th className="py-3 px-4">الجهاز</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">السجلات المتزامنة</th>
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {syncLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <EmptyState title="لا توجد سجلات مزامنة حالياً" />
                    </td>
                  </tr>
                ) : (
                  syncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-200">{log.syncType}</td>
                      <td className="py-3 px-4">
                        {log.tenantId ? (
                          <span className="text-zinc-300">
                            {tenants.find((t) => t.id === log.tenantId)?.name || log.tenantId}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-400">
                        {log.deviceId ? log.deviceId.substring(0, 10) + '...' : 'الرئيسي'}
                      </td>
                      <td className="py-3 px-4">
                        {log.status === 'SUCCESS' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ناجحة</span>
                        )}
                        {log.status === 'PARTIAL' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">جزئية</span>
                        )}
                        {log.status === 'FAIL' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">فشلت</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-200 font-semibold">{log.recordsSynced}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400">{formatDateTime(log.createdAt)}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400 max-w-xs truncate" title={log.errorDetail || ''}>
                        {log.errorDetail || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 4: Sensitive Operations Approvals ─────────────────────────────────── */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="bg-amber-950/20 border border-amber-800/30 p-4 rounded-lg flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-300">نظام الموافقة الثنائية على العمليات الحساسة</div>
              <div className="text-amber-200/70 text-xs mt-0.5">
                العمليات مثل حذف بيانات العملاء، ترحيل المخططات، والعمليات المالية تتطلب موافقة صريحة من مسؤول المنصة قبل التنفيذ.
              </div>
            </div>
          </div>

          <div className="overflow-x-auto bg-zinc-900/40 rounded-lg border border-zinc-800">
            <table className="w-full text-right text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">نوع العملية</th>
                  <th className="py-3 px-4">طالب العملية</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">تاريخ الطلب</th>
                  <th className="py-3 px-4">المسؤول / المعتمد</th>
                  <th className="py-3 px-4">ملاحظات</th>
                  <th className="py-3 px-4 text-left">القرار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {approvals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <EmptyState title="لا توجد طلبات موافقة معلقة أو مسجلة" />
                    </td>
                  </tr>
                ) : (
                  approvals.map((appr) => (
                    <tr key={appr.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-200">{appr.opType}</td>
                      <td className="py-3 px-4 text-xs font-mono text-zinc-400">{appr.requestedBy}</td>
                      <td className="py-3 px-4">{getApprovalStatusBadge(appr.status)}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400">{formatDateTime(appr.createdAt)}</td>
                      <td className="py-3 px-4 text-xs font-mono text-zinc-400">{appr.approvedBy || '—'}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400 max-w-xs truncate">{appr.notes || '—'}</td>
                      <td className="py-3 px-4 text-left">
                        {appr.status === 'PENDING' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => setApprovalActionModal({ id: appr.id, type: 'approve' })}
                            >
                              <Check className="w-3.5 h-3.5 ml-1" />
                              موافقة
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setApprovalActionModal({ id: appr.id, type: 'reject' })}
                            >
                              <X className="w-3.5 h-3.5 ml-1" />
                              رفض
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 5: Maintenance Windows ───────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {maintenanceWindows.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-zinc-900/30 rounded-lg border border-zinc-800">
                <EmptyState title="لا توجد نوافذ صيانة مجدولة حالياً" />
              </div>
            ) : (
              maintenanceWindows.map((mw) => (
                <div key={mw.id} className="bg-zinc-900/60 p-4 rounded-lg border border-zinc-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-zinc-100">{mw.title}</h4>
                      <div className="text-xs text-zinc-500 mt-0.5">أنشئت بواسطة: {mw.createdBy}</div>
                    </div>
                    {getMaintStatusBadge(mw.status)}
                  </div>
                  {mw.description && <p className="text-xs text-zinc-400 leading-relaxed">{mw.description}</p>}
                  <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800/80 text-xs space-y-1 text-zinc-300">
                    <div>من: <span className="font-semibold text-zinc-100">{formatDateTime(mw.startsAt)}</span></div>
                    <div>إلى: <span className="font-semibold text-zinc-100">{formatDateTime(mw.endsAt)}</span></div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">الخدمات المتأثرة:</div>
                    <div className="flex flex-wrap gap-1">
                      {mw.affectedServices.map((srv, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 font-mono">
                          {srv}
                        </span>
                      ))}
                    </div>
                  </div>
                  {mw.status === 'SCHEDULED' && (
                    <div className="pt-2 border-t border-zinc-800/60 flex justify-end">
                      <Button variant="danger" size="sm" onClick={() => handleCancelMaintenance(mw.id)}>
                        <X className="w-3.5 h-3.5 ml-1" />
                        إلغاء نافذة الصيانة
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── Modals ───────────────────────────────────────────────────────────────── */}
      {/* Create Job Modal */}
      {newJobModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-100">إنشاء مهمة تشغيل جديدة</h3>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">نوع العملية</label>
                <select
                  value={newJobType}
                  onChange={(e) => setNewJobType(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  <option value="SCHEMA_MIGRATE">ترحيل مخطط قاعدة البيانات (SCHEMA_MIGRATE)</option>
                  <option value="BACKUP">نسخ احتياطي شامل (BACKUP)</option>
                  <option value="RESTORE">استرجاع نسخة احتياطية (RESTORE)</option>
                  <option value="DEVICE_SYNC">إعادة مزامنة الأجهزة (DEVICE_SYNC)</option>
                  <option value="DATA_EXPORT">تصدير بيانات (DATA_EXPORT)</option>
                  <option value="BILLING_CHARGE">دورة فوترة واشتراكات (BILLING_CHARGE)</option>
                  <option value="NOTIFICATION_BLAST">إرسال إشعارات جماعية (NOTIFICATION_BLAST)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">العميل المستهدف (اختياري)</label>
                <select
                  value={newJobTenantId}
                  onChange={(e) => setNewJobTenantId(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  <option value="">جميع العملاء / مستوى المنصة العام</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">الأولوية (1 الأعلى - 10 الأقل)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newJobPriority}
                  onChange={(e) => setNewJobPriority(Number(e.target.value))}
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <Button variant="secondary" type="button" onClick={() => setNewJobModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit">
                  إدراج في الطابور
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Maintenance Window Modal */}
      {newMaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-100">جدولة أعمال صيانة جديدة</h3>
            <form onSubmit={handleCreateMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">عنوان الصيانة</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ترقية خوادم قواعد البيانات المركزية"
                  value={newMaintTitle}
                  onChange={(e) => setNewMaintTitle(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">وصف الصيانة</label>
                <textarea
                  rows={3}
                  placeholder="تفاصيل التحديث والأثر المتوقع على الخدمة..."
                  value={newMaintDesc}
                  onChange={(e) => setNewMaintDesc(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">تاريخ ووقت البدء</label>
                  <input
                    type="datetime-local"
                    required
                    value={newMaintStart}
                    onChange={(e) => setNewMaintStart(e.target.value)}
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">تاريخ ووقت الانتهاء</label>
                  <input
                    type="datetime-local"
                    required
                    value={newMaintEnd}
                    onChange={(e) => setNewMaintEnd(e.target.value)}
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">الخدمات المتأثرة (مفصولة بفاصلة)</label>
                <input
                  type="text"
                  value={newMaintServices}
                  onChange={(e) => setNewMaintServices(e.target.value)}
                  placeholder="api, payments, sync, web"
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <Button variant="secondary" type="button" onClick={() => setNewMaintModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit">
                  تأكيد الجدولة
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approval Confirm Modal */}
      {approvalActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-zinc-100">
              {approvalActionModal.type === 'approve' ? 'الموافقة على العملية' : 'رفض العملية'}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {approvalActionModal.type === 'approve'
                ? 'بتأكيد الموافقة، سيتم السماح بتنفيذ العملية الحساسة واعتمادها في سجل العمليات.'
                : 'برفض العملية، سيتم إلغاؤها نهائياً وإخطار الطالب بالرفض.'}
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">ملاحظات القرار (اختياري)</label>
              <textarea
                rows={3}
                placeholder="أدخل سبب القرار أو أية تعليمات..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className={`w-full ${inputClass}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button variant="secondary" type="button" onClick={() => setApprovalActionModal(null)}>
                إلغاء
              </Button>
              <Button
                variant={approvalActionModal.type === 'approve' ? 'success' : 'danger'}
                type="button"
                onClick={handleConfirmApprovalAction}
              >
                {approvalActionModal.type === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformOperationsSettingsPage;
