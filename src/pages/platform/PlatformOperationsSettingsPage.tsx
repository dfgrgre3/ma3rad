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
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
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
import { EmptyState, formatDateTime, formatNumber, inputClass } from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
import { DataTable } from '../../components/ui/DataTable';
type OperationsTab = 'jobs' | 'scheduled' | 'sync' | 'approvals' | 'maintenance' | 'errors' | 'usage';

const CENTRAL_JOB_TYPE_MAP: Record<string, string> = {
  SCHEMA_MIGRATE: 'MIGRATION',
  BACKUP: 'BACKUP_CREATE',
  RESTORE: 'BACKUP_RESTORE',
  DEVICE_SYNC: 'REMOTE_SYNC',
  DATA_EXPORT: 'CUSTOM',
  BILLING_CHARGE: 'CUSTOM',
  NOTIFICATION_BLAST: 'CUSTOM',
};

function mapCentralJob(row: any): PlatformOpsJob {
  return {
    id: row.id,
    type: row.type,
    tenantId: row.tenantId ?? undefined,
    payload: row.payload ?? {},
    status: row.status === 'COMPLETED' ? 'DONE' : row.status,
    priority: row.payload?.priority ?? 5,
    retries: row.attempts ?? 0,
    maxRetries: 3,
    errorMessage: row.error ?? undefined,
    scheduledAt: row.runAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.finishedAt ?? undefined,
    createdBy: '',
    createdAt: row.createdAt,
  };
}

export const PlatformOperationsSettingsPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<OperationsTab>('jobs');
  const centralActive = getCentralDataSourceState().active;
  const canManageOperations = canPlatform('operations');
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

  // Central usage state
  const [usageRows, setUsageRows] = useState<any[]>([]);

  // Load Tenants
  const loadTenants = useCallback(() => {
    if (centralActive) {
      centralPlatformClient.listTenants('', '', '')
        .then((list) => setTenants(list as PlatformTenant[]))
        .catch(() => setTenants([]));
      return;
    }
    try {
      const list = platformAdminService.listTenants();
      setTenants(list);
    } catch {
      // Fallback
      setTenants([]);
    }
  }, [centralActive]);

  // Load Data based on active tab
  const loadData = useCallback(() => {
    setLoading(true);
    if (centralActive) {
      if (activeTab === 'usage') {
        centralPlatformClient.listTenantUsage()
          .then((rows) => setUsageRows(rows))
          .catch((e) => console.error('Failed to load usage:', e))
          .finally(() => setLoading(false));
        return;
      }
      if (activeTab === 'jobs' || activeTab === 'scheduled' || activeTab === 'errors') {
        const status = activeTab === 'errors' ? 'FAILED' : jobStatusFilter === 'DONE' ? 'COMPLETED' : (jobStatusFilter || undefined);
        centralPlatformClient.listOpsJobs({
          status,
          type: undefined,
          tenantId: jobTenantFilter || undefined,
        })
          .then((rows) => setJobs(rows.map(mapCentralJob)))
          .catch((e) => console.error('Failed to load central jobs:', e))
          .finally(() => setLoading(false));
        return;
      }
      setMaintenanceWindows([]);
      setApprovals([]);
      setSyncLogs([]);
      setLoading(false);
      return;
    }
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
  }, [activeTab, jobStatusFilter, jobTenantFilter, syncStatusFilter, centralActive]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const handleRetryJob = (id: string) => {
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
    if (centralActive) {
      centralPlatformClient.retryOpsJob(id)
        .then(loadData)
        .catch((e) => toast.error((e as Error).message));
      return;
    }
    try {
      platformAdminService.retryOpsJob(id);
      loadData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCancelJob = (id: string) => {
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
    if (!confirm('هل أنت متأكد من إلغاء هذه العملية؟')) return;
    if (centralActive) {
      centralPlatformClient.cancelOpsJob(id)
        .then(loadData)
        .catch((e) => toast.error((e as Error).message));
      return;
    }
    try {
      platformAdminService.cancelOpsJob(id);
      loadData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
    if (centralActive) {
      centralPlatformClient.createOpsJob({
        type: CENTRAL_JOB_TYPE_MAP[newJobType] ?? 'CUSTOM',
        tenantId: newJobTenantId || null,
        payload: { originalType: newJobType, priority: Number(newJobPriority) },
      })
        .then(() => { setNewJobModalOpen(false); loadData(); })
        .catch((e) => toast.error((e as Error).message));
      return;
    }
    try {
      platformAdminService.createOpsJob({
        type: newJobType,
        tenantId: newJobTenantId || undefined,
        priority: Number(newJobPriority),
      });
      setNewJobModalOpen(false);
      loadData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCreateMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
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
      toast.error((e as Error).message);
    }
  };

  const handleCancelMaintenance = (id: string) => {
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
    if (!confirm('هل أنت متأكد من إلغاء نافذة الصيانة؟')) return;
    try {
      platformAdminService.cancelMaintenanceWindow(id);
      loadData();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleConfirmApprovalAction = () => {
    if (!approvalActionModal) return;
    if (!canManageOperations) {
      toast.warning('لا تملك صلاحية إدارة العمليات.');
      return;
    }
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
      toast.error((e as Error).message);
    }
  };

  // Helper labels & styling
  const getJobStatusBadge = (status: PlatformOpsJobStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20"><Clock className="w-3 h-3" /> قيد الانتظار</span>;
      case 'RUNNING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"><RefreshCw className="w-3 h-3 animate-spin" /> قيد التشغيل</span>;
      case 'DONE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20"><CheckCircle2 className="w-3 h-3" /> مكتملة</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/20"><AlertTriangle className="w-3 h-3" /> فشلت</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-line-strong/10 text-muted border border-line-strong/20"><XCircle className="w-3 h-3" /> ملغاة</span>;
    }
  };

  const getMaintStatusBadge = (status: PlatformMaintenanceStatus) => {
    switch (status) {
      case 'SCHEDULED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">مجدولة</span>;
      case 'ACTIVE':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20 animate-pulse">جارية حالياً</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">مكتملة</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-line-strong/10 text-muted border border-line-strong/20">ملغاة</span>;
    }
  };

  const getApprovalStatusBadge = (status: PlatformOpApprovalStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">في انتظار الموافقة</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">تمت الموافقة</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/20">مرفوضة</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-line-strong/10 text-muted border border-line-strong/20">ملغاة</span>;
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
    <div className="space-y-6">
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
            {activeTab === 'jobs' && canManageOperations && (
              <Button variant="primary" onClick={() => setNewJobModalOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />
                إنشاء مهمة تشغيل
              </Button>
            )}
            {activeTab === 'maintenance' && canManageOperations && (
              <Button variant="primary" onClick={() => setNewMaintModalOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />
                جدولة صيانة
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-line-strong space-x-1 space-x-reverse overflow-x-auto">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'jobs'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Activity className="w-4 h-4" />
          طابور العمليات (Queue)
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'scheduled'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Clock className="w-4 h-4" />
          المهام المجدولة
        </button>
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sync'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Cpu className="w-4 h-4" />
          حالة المزامنة والأجهزة
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'approvals'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          موافقات العمليات الحساسة
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'maintenance'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Calendar className="w-4 h-4" />
          أعمال الصيانة المجدولة
        </button>
        <button
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'errors'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          سجل الأخطاء والمعالجات
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'usage'
              ? 'border-success text-success'
              : 'border-transparent text-muted hover:text-muted'
          }`}
        >
          <Layers className="w-4 h-4" />
          مراقبة استهلاك المنشآت
        </button>
      </div>

      {centralActive && (activeTab === 'sync' || activeTab === 'approvals' || activeTab === 'maintenance') && (
        <div className="rounded-lg border border-warning/50 bg-warning/20 px-4 py-3 text-xs font-semibold text-warning">
          هذا القسم غير متاح في الوضع المركزي بعد — بياناته تُدار على المصدر المحلي فقط.
        </div>
      )}

      {/* Main Tab Views */}
      {/* ─── TAB 1 & 2 & 6: Jobs, Scheduled, Errors ───────────────────────────────── */}
      {(activeTab === 'jobs' || activeTab === 'scheduled' || activeTab === 'errors') && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/50 p-3 rounded-lg border border-line-strong">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-3 text-muted" />
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
            <div className="text-xs text-muted">
              إجمالي النتائج: <span className="font-semibold text-muted">{filteredJobs.length}</span>
            </div>
          </div>

          {/* Table */}
          <DataTable
                      ariaLabel="مهام التشغيل"
                      rows={filteredJobs}
                      rowKey={(job) => job.id}
                      emptyTitle="لا توجد مهام تشغيل تطابق الفلاتر المحددة"
                      columns={[
                        {
                          key: 'type', header: 'نوع العملية',
                          render: (job) => (
                            <div>
                              <div className="font-medium text-muted">{job.type}</div>
                              <div className="text-xs text-muted font-mono mt-0.5">{job.id.substring(0, 8)}...</div>
                              {job.errorMessage && (
                                <div className="text-xs text-danger mt-1 max-w-md truncate" title={job.errorMessage}>
                                  خطأ: {job.errorMessage}
                                </div>
                              )}
                            </div>
                          ),
                        },
                        {
                          key: 'tenant', header: 'العميل المرتبط',
                          render: (job) => job.tenantId ? (
                            <span className="text-muted">{tenants.find((t) => t.id === job.tenantId)?.name || job.tenantId}</span>
                          ) : <span className="text-muted text-xs">نظام عام</span>,
                        },
                        { key: 'status', header: 'الحالة', render: (job) => getJobStatusBadge(job.status) },
                        { key: 'priority', header: 'الأولوية', render: (job) => <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary text-muted">{job.priority}</span> },
                        { key: 'retries', header: 'المحاولات', render: (job) => <span className={`text-xs ${job.retries > 0 ? 'text-warning font-semibold' : 'text-muted'}`}>{job.retries} / {job.maxRetries}</span> },
                        {
                          key: 'date', header: 'التاريخ والجدولة',
                          render: (job) => (
                            <div className="text-xs text-muted">
                              <div>أنشئت: {formatDateTime(job.createdAt)}</div>
                              {job.scheduledAt && <div className="text-primary">مجدولة: {formatDateTime(job.scheduledAt)}</div>}
                            </div>
                          ),
                        },
                        {
                          key: 'actions', header: 'إجراءات', align: 'end',
                          render: (job) => (
                            <div className="flex items-center justify-end gap-1.5">
                              {canManageOperations && (job.status === 'FAILED' || job.status === 'CANCELLED') && (
                                <Button variant="secondary" size="sm" onClick={() => handleRetryJob(job.id)} title="إعادة المحاولة فوراً">
                                  <RotateCcw className="w-3.5 h-3.5 ml-1 text-warning" />
                                  إعادة
                                </Button>
                              )}
                              {canManageOperations && (job.status === 'PENDING' || job.status === 'RUNNING') && (
                                <Button variant="danger" size="sm" onClick={() => handleCancelJob(job.id)} title="إلغاء العملية">
                                  <X className="w-3.5 h-3.5 ml-1" />
                                  إلغاء
                                </Button>
                              )}
                            </div>
                          ),
                        },
                      ]}
                    />

        </div>
      )}

      {/* ─── TAB 3: Sync & Devices ────────────────────────────────────────────────── */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-primary/50 p-3 rounded-lg border border-line-strong">
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
            <div className="text-xs text-muted">
              سجلات المزامنة الأخيرة: <span className="font-semibold text-muted">{syncLogs.length}</span>
            </div>
          </div>

          <DataTable
                      ariaLabel="سجلات المزامنة"
                      rows={syncLogs}
                      rowKey={(log) => log.id}
                      emptyTitle="لا توجد سجلات مزامنة حالياً"
                      columns={[
                        { key: 'type', header: 'نوع المزامنة', render: (log) => <span className="font-medium text-muted">{log.syncType}</span> },
                        {
                          key: 'tenant', header: 'العميل',
                          render: (log) => log.tenantId ? (
                            <span className="text-muted">{tenants.find((t) => t.id === log.tenantId)?.name || log.tenantId}</span>
                          ) : <span className="text-muted">—</span>,
                        },
                        { key: 'device', header: 'الجهاز', render: (log) => <span className="font-mono text-xs text-muted">{log.deviceId ? log.deviceId.substring(0, 10) + '...' : 'الرئيسي'}</span> },
                        {
                          key: 'status', header: 'الحالة',
                          render: (log) => (
                            <>
                              {log.status === 'SUCCESS' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-success/10 text-success border border-success/20">ناجحة</span>
                              )}
                              {log.status === 'PARTIAL' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-warning/10 text-warning border border-warning/20">جزئية</span>
                              )}
                              {log.status === 'FAIL' && (
                                <span className="px-2 py-0.5 rounded text-xs bg-danger/10 text-danger border border-danger/20">فشلت</span>
                              )}
                            </>
                          ),
                        },
                        { key: 'records', header: 'السجلات المتزامنة', render: (log) => <span className="text-muted font-semibold">{log.recordsSynced}</span> },
                        { key: 'date', header: 'التاريخ والوقت', render: (log) => <span className="text-xs text-muted">{formatDateTime(log.createdAt)}</span> },
                        { key: 'details', header: 'التفاصيل', render: (log) => <span className="text-xs text-muted max-w-xs truncate block" title={log.errorDetail || ''}>{log.errorDetail || '—'}</span> },
                      ]}
                    />

        </div>
      )}

      {/* ─── TAB 4: Sensitive Operations Approvals ─────────────────────────────────── */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="bg-warning/20 border border-warning/30 p-4 rounded-lg flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-warning">نظام الموافقة الثنائية على العمليات الحساسة</div>
              <div className="text-warning/70 text-xs mt-0.5">
                العمليات مثل حذف بيانات العملاء، ترحيل المخططات، والعمليات المالية تتطلب موافقة صريحة من مسؤول المنصة قبل التنفيذ.
              </div>
            </div>
          </div>

          <DataTable
                      ariaLabel="طلبات الموافقة"
                      rows={approvals}
                      rowKey={(appr) => appr.id}
                      emptyTitle="لا توجد طلبات موافقة معلقة أو مسجلة"
                      columns={[
                        { key: 'type', header: 'نوع العملية', render: (appr) => <span className="font-medium text-muted">{appr.opType}</span> },
                        { key: 'requester', header: 'طالب العملية', render: (appr) => <span className="text-xs font-mono text-muted">{appr.requestedBy}</span> },
                        { key: 'status', header: 'الحالة', render: (appr) => getApprovalStatusBadge(appr.status) },
                        { key: 'date', header: 'تاريخ الطلب', render: (appr) => <span className="text-xs text-muted">{formatDateTime(appr.createdAt)}</span> },
                        { key: 'approver', header: 'المسؤول / المعتمد', render: (appr) => <span className="text-xs font-mono text-muted">{appr.approvedBy || '—'}</span> },
                        { key: 'notes', header: 'ملاحظات', render: (appr) => <span className="text-xs text-muted max-w-xs truncate block">{appr.notes || '—'}</span> },
                        {
                          key: 'decision', header: 'القرار', align: 'end',
                          render: (appr) => appr.status === 'PENDING' && canManageOperations ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="success" size="sm" onClick={() => setApprovalActionModal({ id: appr.id, type: 'approve' })}>
                                <Check className="w-3.5 h-3.5 ml-1" />
                                موافقة
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => setApprovalActionModal({ id: appr.id, type: 'reject' })}>
                                <X className="w-3.5 h-3.5 ml-1" />
                                رفض
                              </Button>
                            </div>
                          ) : null,
                        },
                      ]}
                    />

        </div>
      )}

      {/* ─── TAB 5: Maintenance Windows ───────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {maintenanceWindows.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-primary/30 rounded-lg border border-line-strong">
                <EmptyState title="لا توجد نوافذ صيانة مجدولة حالياً" />
              </div>
            ) : (
              maintenanceWindows.map((mw) => (
                <div key={mw.id} className="bg-primary/60 p-4 rounded-lg border border-line-strong space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-muted">{mw.title}</h4>
                      <div className="text-xs text-muted mt-0.5">أنشئت بواسطة: {mw.createdBy}</div>
                    </div>
                    {getMaintStatusBadge(mw.status)}
                  </div>
                  {mw.description && <p className="text-xs text-muted leading-relaxed">{mw.description}</p>}
                  <div className="bg-primary p-2.5 rounded border border-line-strong/80 text-xs space-y-1 text-muted">
                    <div>من: <span className="font-semibold text-muted">{formatDateTime(mw.startsAt)}</span></div>
                    <div>إلى: <span className="font-semibold text-muted">{formatDateTime(mw.endsAt)}</span></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted mb-1">الخدمات المتأثرة:</div>
                    <div className="flex flex-wrap gap-1">
                      {mw.affectedServices.map((srv, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[11px] bg-primary text-muted font-mono">
                          {srv}
                        </span>
                      ))}
                    </div>
                  </div>
                  {mw.status === 'SCHEDULED' && canManageOperations && (
                    <div className="pt-2 border-t border-line-strong/60 flex justify-end">
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
          <div className="bg-primary border border-line-strong rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-muted">إنشاء مهمة تشغيل جديدة</h3>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">نوع العملية</label>
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
                <label className="block text-xs font-medium text-muted mb-1">العميل المستهدف (اختياري)</label>
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
                <label className="block text-xs font-medium text-muted mb-1">الأولوية (1 الأعلى - 10 الأقل)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newJobPriority}
                  onChange={(e) => setNewJobPriority(Number(e.target.value))}
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
                <Button variant="secondary" type="button" onClick={() => setNewJobModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit" disabled={!canManageOperations}>
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
          <div className="bg-primary border border-line-strong rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-muted">جدولة أعمال صيانة جديدة</h3>
            <form onSubmit={handleCreateMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">عنوان الصيانة</label>
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
                <label className="block text-xs font-medium text-muted mb-1">وصف الصيانة</label>
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
                  <label className="block text-xs font-medium text-muted mb-1">تاريخ ووقت البدء</label>
                  <input
                    type="datetime-local"
                    required
                    value={newMaintStart}
                    onChange={(e) => setNewMaintStart(e.target.value)}
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">تاريخ ووقت الانتهاء</label>
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
                <label className="block text-xs font-medium text-muted mb-1">الخدمات المتأثرة (مفصولة بفاصلة)</label>
                <input
                  type="text"
                  value={newMaintServices}
                  onChange={(e) => setNewMaintServices(e.target.value)}
                  placeholder="api, payments, sync, web"
                  className={`w-full ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
                <Button variant="secondary" type="button" onClick={() => setNewMaintModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit" disabled={!canManageOperations}>
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
          <div className="bg-primary border border-line-strong rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-muted">
              {approvalActionModal.type === 'approve' ? 'الموافقة على العملية' : 'رفض العملية'}
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              {approvalActionModal.type === 'approve'
                ? 'بتأكيد الموافقة، سيتم السماح بتنفيذ العملية الحساسة واعتمادها في سجل العمليات.'
                : 'برفض العملية، سيتم إلغاؤها نهائياً وإخطار الطالب بالرفض.'}
            </p>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">ملاحظات القرار (اختياري)</label>
              <textarea
                rows={3}
                placeholder="أدخل سبب القرار أو أية تعليمات..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className={`w-full ${inputClass}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
              <Button variant="secondary" type="button" onClick={() => setApprovalActionModal(null)}>
                إلغاء
              </Button>
              <Button
                variant={approvalActionModal.type === 'approve' ? 'success' : 'danger'}
                type="button"
                onClick={handleConfirmApprovalAction}
                disabled={!canManageOperations}
              >
                {approvalActionModal.type === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: Usage monitoring (central) ─────────────────────────────────── */}
      {activeTab === 'usage' && (
        <div className="space-y-4">
          {!centralActive ? (
            <EmptyState
              icon={<Layers className="w-6 h-6" />}
              title="مراقبة الاستهلاك متاحة في الوضع المركزي"
              description="فعّل مصدر البيانات المركزي من إعدادات المنصة لعرض استهلاك كل منشأة."
            />
          ) : usageRows.length === 0 ? (
            <EmptyState
              icon={<Layers className="w-6 h-6" />}
              title="لا توجد بيانات استهلاك"
              description="ستظهر هنا أجهزة المستخدمين والفواتير والمدفوعات والتذاكر المفتوحة لكل منشأة."
            />
          ) : (
            <DataTable
                          ariaLabel="استهلاك المنشآت"
                          rows={usageRows}
                          rowKey={(u) => u.id}
                          minWidth={900}
                          dense
                          columns={[
                            {
                              key: 'tenant', header: 'المنشأة',
                              render: (u) => (
                                <div>
                                  <div className="font-semibold text-muted">{u.name}</div>
                                  <div className="text-[10px] text-muted font-mono">{u.code}</div>
                                </div>
                              ),
                            },
                            { key: 'plan', header: 'الخطة', render: (u) => <span className="text-muted">{u.plan_name ?? '—'}</span> },
                            { key: 'devices', header: 'الأجهزة', render: (u) => <span className="text-muted">{u.devices_active}/{u.devices_total}</span> },
                            { key: 'users', header: 'المستخدمون', render: (u) => <span className="text-muted">{u.users_active}/{u.users_total}</span> },
                            { key: 'invoices', header: 'الفواتير', render: (u) => <span className="text-muted">{u.invoices_count}</span> },
                            { key: 'payments', header: 'المدفوعات', render: (u) => <span className="text-muted">{formatNumber(u.payments_total ?? 0)}</span> },
                            {
                              key: 'tickets', header: 'تذاكر مفتوحة',
                              render: (u) => <span className={u.open_tickets > 0 ? 'text-warning font-bold' : 'text-muted'}>{u.open_tickets}</span>,
                            },
                            { key: 'last', header: 'آخر نشاط', render: (u) => <span className="text-[11px] text-muted">{u.last_activity_at ? formatDateTime(u.last_activity_at) : '—'}</span> },
                          ]}
                        />

          )}
        </div>
      )}
    </div>
  );
};

export default PlatformOperationsSettingsPage;
