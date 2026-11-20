import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  Database,
  Download,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  RotateCcw,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformCentralBackup } from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  formatDateTime,
  formatNumber,
} from './components/PlatformUI';

import { DataTable } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface CentralBackupRow {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  name: string | null;
  type: string;
  status: string;
  sizeBytes: number | null;
  storageUri: string | null;
  triggerSource: string;
  triggeredBy: string | null;
  notes: string | null;
  error: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface CentralAppBackupRow {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  name: string | null;
  type: string;
  status: string;
  sizeBytes: number | null;
  checksum: string | null;
  restoreStatus: string;
  restoreRequestedBy: string | null;
  restoreError: string | null;
  createdAt: string;
}

export const PlatformBackupsPage: React.FC = () => {
  const toast = useToast();
  const [backups, setBackups] = useState<PlatformCentralBackup[]>([]);
  const [centralBackups, setCentralBackups] = useState<CentralBackupRow[]>([]);
  const [centralAppBackups, setCentralAppBackups] = useState<CentralAppBackupRow[]>([]);
  const [centralTenants, setCentralTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [centralTenantFilter, setCentralTenantFilter] = useState('');
  const [centralType, setCentralType] = useState<'FULL' | 'INCREMENTAL'>('FULL');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const centralActive = getCentralDataSourceState().active;

  // Confirmation modal for destructive/sensitive operations
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const requestConfirm = (title: string, description: string, onConfirm: () => void | Promise<void>) =>
    setConfirmState({ open: true, title, description, onConfirm });

  const loadData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    if (centralActive) {
      Promise.all([
        centralPlatformClient.listBackups({ tenantId: centralTenantFilter || undefined }),
        centralPlatformClient.listAppBackups({ tenantId: centralTenantFilter || undefined }),
        centralPlatformClient.listTenants(),
      ])
        .then(([rows, appRows, tenants]) => {
          setCentralBackups(rows as CentralBackupRow[]);
          setCentralAppBackups(appRows as CentralAppBackupRow[]);
          setCentralTenants(tenants.map((t) => ({ id: t.id, name: t.name ?? t.code ?? t.id })));
          setError(null);
        })
        .catch((err) => { if (!silent) setError(err instanceof Error ? err.message : 'تعذر تحميل النسخ الاحتياطية.'); })
        .finally(() => { if (!silent) setLoading(false); });
      return;
    }
    try {
      const list = platformAdminService.listCentralBackups();
      setBackups(list);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'تعذر تحميل النسخ الاحتياطية.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [centralActive, centralTenantFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll silently so REQUESTED backups surface their COMPLETED/FAILED status.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) loadData(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData]);

  const canManageBackups = canPlatform('backups');

  const handleTriggerBackup = async () => {
    if (!canManageBackups) {
      toast.warning('لا تملك صلاحية تنفيذ النسخ الاحتياطي.');
      return;
    }
    if (centralActive) {
      requestConfirm(
        'طلب نسخة احتياطية جديدة',
        `سيتم تسجيل طلب نسخة ${centralType === 'FULL' ? 'كاملة' : 'تزايدية'} من الخادم المركزي${centralTenantFilter ? ' للمنشأة المحددة' : ' (المنصة كاملة)'}. ستظهر حالتها محدثة عند اكتمال المهمة.`,
        async () => {
          setRunning(true);
          try {
            await centralPlatformClient.createBackup({
              tenantId: centralTenantFilter || null,
              type: centralType,
              triggerSource: 'MANUAL',
            });
            toast.success('تم تسجيل طلب النسخة الاحتياطية — ستظهر حالتها محدثة عند اكتمال المهمة.');
            loadData();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'فشل طلب النسخة الاحتياطية.');
          } finally {
            setRunning(false);
          }
        }
      );
      return;
    }
    requestConfirm(
      'أخذ نسخة احتياطية فورية',
      'هل ترغب في أخذ نسخة احتياطية مشفرة فورية لقاعدة بيانات المنصة؟',
      async () => {
        setRunning(true);
        try {
          const created = await platformAdminService.triggerCentralBackup();
          toast.warning(
            created.integrityCheckPassed
              ? `تم إنشاء النسخة الاحتياطية والتحقق منها: ${created.filename}`
              : `تم إنشاء نسخة احتياطية محلية مشفرة: ${created.filename}\nلم يتم التحقق من نسخة خارج الموقع، لذا لا تصنف كنسخة موثقة (VERIFIED).`
          );
          loadData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل أخذ النسخة الاحتياطية.');
        } finally {
          setRunning(false);
        }
      }
    );
  };

  const handleRestore = async (backup: CentralBackupRow) => {
    if (!canManageBackups) {
      toast.warning('لا تملك صلاحية استعادة النسخ.');
      return;
    }
    if (!backup.tenantId) {
      toast.warning('الاستعادة لكل منشأة فقط — اختر نسخة مرتبطة بعميل.');
      return;
    }
    requestConfirm(
      'استعادة نسخة احتياطية',
      `استعادة النسخة "${backup.name || backup.id}" للعميل "${backup.tenantName || backup.tenantId}"؟\nلن تتأثر بيانات المنشآت الأخرى.`,
      async () => {
        try {
          await centralPlatformClient.restoreBackup(backup.id);
          toast.success('تم تسجيل طلب الاستعادة — ستظهر نتيجتها في سجل عمليات التشغيل.');
          loadData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل طلب الاستعادة.');
        }
      }
    );
  };

  const handleAppBackupRestore = async (backup: CentralAppBackupRow) => {
    if (!canManageBackups) {
      toast.warning('لا تملك صلاحية استعادة النسخ.');
      return;
    }
    if (!backup.tenantId) {
      toast.warning('استعادة بيانات التطبيق تتطلب نسخة مرتبطة بمنشأة و جهازها.');
      return;
    }
    if (['REQUESTED', 'IN_PROGRESS'].includes(backup.restoreStatus)) {
      toast.warning('توجد استعادة قيد التنفيذ لهذه النسخة بالفعل.');
      return;
    }
    requestConfirm(
      'طلب استعادة نسخة بيانات التطبيق',
      `طلب استعادة نسخة بيانات التطبيق "${backup.name || backup.id}" على جهاز المنشأة "${backup.tenantName || backup.tenantId}"؟\nسيقوم الجهاز بتنزيل النسخة المشفرة والتحقق منها وتطبيقها تلقائيًا.`,
      async () => {
        try {
          await centralPlatformClient.requestAppBackupRestore(backup.id);
          toast.success('تم تسجيل طلب الاستعادة — سيطبّقها الجهاز عند اتصاله التالي بالمنصة.');
          loadData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل طلب الاستعادة.');
        }
      }
    );
  };

  const handleAppBackupRestoreCancel = async (backup: CentralAppBackupRow) => {
    if (!canManageBackups) {
      toast.warning('لا تملك صلاحية استعادة النسخ.');
      return;
    }
    requestConfirm(
      'إلغاء طلب الاستعادة',
      `إلغاء طلب الاستعادة المعلق للنسخة "${backup.name || backup.id}"؟`,
      async () => {
        try {
          await centralPlatformClient.cancelAppBackupRestore(backup.id);
          loadData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'فشل إلغاء الاستعادة.');
        }
      }
    );
  };

  const handleDownload = async (backup: CentralBackupRow) => {
    if (!canManageBackups) {
      toast.warning('لا تملك صلاحية تنزيل النسخ الاحتياطية.');
      return;
    }
    try {
      const artifact = await centralPlatformClient.downloadBackupArtifact(backup.id);
      const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.name || backup.id}.backup.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل تنزيل النسخة.');
    }
  };

  const confirmDialog = (
    <Modal
      open={confirmState?.open ?? false}
      onClose={() => setConfirmState(null)}
      title={confirmState?.title ?? ''}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmState(null)}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={() => {
              const fn = confirmState?.onConfirm;
              setConfirmState(null);
              if (fn) void fn();
            }}
          >
            تأكيد
          </Button>
        </div>
      }
    >
      <p className="text-xs text-ink-secondary whitespace-pre-line">{confirmState?.description}</p>
    </Modal>
  );

  const STATUS_LABELS: Record<string, string> = {
    REQUESTED: 'مطلوبة', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتملة', FAILED: 'فاشلة', EXPIRED: 'منتهية',
  };
  const TYPE_LABELS: Record<string, string> = { FULL: 'كاملة', INCREMENTAL: 'تزايدية', PRE_RESTORE: 'ما قبل الاستعادة' };
  const RESTORE_STATUS_LABELS: Record<string, string> = {
    NONE: 'بدون استعادة', REQUESTED: 'بانتظار الجهاز', IN_PROGRESS: 'قيد التطبيق', COMPLETED: 'مُستعادة', FAILED: 'فشلت',
  };

  if (centralActive) {
    const hasPendingWork =
      centralBackups.some((b) => ['REQUESTED', 'IN_PROGRESS'].includes(b.status)) ||
      centralAppBackups.some((b) => ['REQUESTED', 'IN_PROGRESS'].includes(b.restoreStatus));
    return (
      <div className="space-y-4 text-right">
        <PageHeader
          title="النسخ الاحتياطية للمنشآت (Per-Tenant Backups)"
          description="نسخ احتياطية مستقلة لكل منشأة مع إمكانية الاستعادة لمنشأة واحدة دون التأثير على غيرها."
          icon={<Database className="h-5 w-5" />}
          actions={
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-line-strong bg-primary px-2 py-1.5 text-xs"
                value={centralTenantFilter}
                onChange={(e) => setCentralTenantFilter(e.target.value)}
              >
                <option value="">كل المنشآت</option>
                {centralTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                className="rounded-lg border border-line-strong bg-primary px-2 py-1.5 text-xs"
                value={centralType}
                onChange={(e) => setCentralType(e.target.value as 'FULL' | 'INCREMENTAL')}
              >
                <option value="FULL">كاملة</option>
                <option value="INCREMENTAL">تزايدية</option>
              </select>
              <Button size="sm" variant="secondary" onClick={() => loadData()} leadingIcon={<RefreshCw className="h-4 w-4" />}>
                تحديث
              </Button>
              <Button size="sm" onClick={handleTriggerBackup} disabled={running || !canManageBackups} leadingIcon={<Play className="h-4 w-4" />}>
                {running ? 'جارٍ الطلب...' : 'طلب نسخة احتياطية'}
              </Button>
            </div>
          }
        />
        {error && <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">{error}</div>}
        {hasPendingWork && (
          <div className="p-2.5 bg-warning/10 border border-warning/30 rounded-lg text-[11px] font-semibold text-warning">
            توجد نسخ أو عمليات استعادة قيد التنفيذ — تُحدَّث القائمة تلقائياً كل 15 ثانية.
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
          {loading ? (
            <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل النسخ الاحتياطية...</div>
          ) : centralBackups.length === 0 ? (
            <EmptyState icon={<Archive className="h-6 w-6 text-muted" />} title="لا توجد نسخ احتياطية" description="اطلب أول نسخة احتياطية لمنشأة أو للمنصة." />
          ) : (
            <DataTable
                            ariaLabel="نسخ العملاء الاحتياطية"
                            rows={centralBackups}
                            rowKey={(b) => b.id}
                            minWidth={850}
                            dense
                            columns={[
                              { key: 'name', header: 'الاسم', render: (b) => <span className="font-bold text-muted">{b.name || b.id}</span> },
                              { key: 'tenant', header: 'المنشأة', render: (b) => <span className="text-muted">{b.tenantName || 'المنصة (عام)'}</span> },
                              { key: 'type', header: 'النوع', render: (b) => <span className="text-muted">{TYPE_LABELS[b.type] || b.type}</span> },
                              {
                                key: 'status', header: 'الحالة',
                                render: (b) => (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${b.status === 'COMPLETED' ? 'text-success bg-success/10 border-success/20' : b.status === 'FAILED' ? 'text-danger bg-danger/10 border-danger/20' : 'text-warning bg-warning/10 border-warning/20'}`}>
                                    {STATUS_LABELS[b.status] || b.status}
                                  </span>
                                ),
                              },
                              { key: 'size', header: 'الحجم', render: (b) => <span className="text-muted">{b.sizeBytes ? formatBytes(b.sizeBytes) : '—'}</span> },
                              { key: 'by', header: 'بواسطة', render: (b) => <span className="text-muted">{b.triggeredBy || '—'}</span> },
                              { key: 'created', header: 'تاريخ الإنشاء', render: (b) => <span className="text-muted">{formatDateTime(b.createdAt)}</span> },
                              {
                                key: 'actions', header: 'إجراءات',
                                render: (b) => (
                                  <div className="flex items-center gap-1.5">
                                    {b.status === 'COMPLETED' && (
                                      <Button size="sm" variant="ghost" onClick={() => handleDownload(b)} disabled={!canManageBackups} title="تنزيل ملف النسخة">تنزيل</Button>
                                    )}
                                    {b.status === 'COMPLETED' && b.tenantId ? (
                                      <Button size="sm" variant="secondary" onClick={() => handleRestore(b)} disabled={!canManageBackups} leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}>استعادة</Button>
                                    ) : null}
                                  </div>
                                ),
                              },
                            ]}
                          />

          )}
        </div>

        {/* Tenant application (ERP) backups — encrypted device snapshots */}
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-bold text-muted">نسخ بيانات تطبيق المنشآت (ERP) على أجهزة العملاء</h3>
          <p className="text-[11px] text-muted">
            نسخ مشفرة يرفعها كل جهاز لمنشأته؛ الخادم يخزنها دون القدرة على قراءتها.
            «طلب استعادة» يجعل الجهاز ينزّل النسخة ويتحقق منها ويطبقها عبر مسار الاستعادة المحلي المعتمد.
          </p>
          <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70">
            {centralAppBackups.length === 0 ? (
              <EmptyState icon={<HardDrive className="h-6 w-6 text-muted" />} title="لا توجد نسخ تطبيق مرفوعة" description="ترفع الأجهزة نسخ بياناتها للمنصة من صفحة النسخ الاحتياطي في تطبيق سطح المكتب." />
            ) : (
              <DataTable
                                ariaLabel="نسخ تطبيق المنشآت"
                                rows={centralAppBackups}
                                rowKey={(b) => b.id}
                                minWidth={900}
                                dense
                                columns={[
                                  { key: 'name', header: 'الاسم', render: (b) => <span className="font-bold text-muted">{b.name || b.id}</span> },
                                  { key: 'tenant', header: 'المنشأة', render: (b) => <span className="text-muted">{b.tenantName || b.tenantId || '—'}</span> },
                                  { key: 'device', header: 'الجهاز', render: (b) => <span className="text-muted">{b.deviceName || b.deviceId || '—'}</span> },
                                  { key: 'size', header: 'الحجم', render: (b) => <span className="text-muted">{b.sizeBytes ? formatBytes(b.sizeBytes) : '—'}</span> },
                                  { key: 'uploaded', header: 'تاريخ الرفع', render: (b) => <span className="text-muted">{formatDateTime(b.createdAt)}</span> },
                                  {
                                    key: 'restore', header: 'حالة الاستعادة',
                                    render: (b) => (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        b.restoreStatus === 'COMPLETED' ? 'text-success bg-success/10 border-success/20'
                                        : b.restoreStatus === 'FAILED' ? 'text-danger bg-danger/10 border-danger/20'
                                        : ['REQUESTED', 'IN_PROGRESS'].includes(b.restoreStatus) ? 'text-warning bg-warning/10 border-warning/20'
                                        : 'text-muted bg-line-strong/10 border-line-strong/20'
                                      }`} title={b.restoreError || undefined}>
                                        {RESTORE_STATUS_LABELS[b.restoreStatus] || b.restoreStatus}
                                      </span>
                                    ),
                                  },
                                  {
                                    key: 'actions', header: 'إجراءات',
                                    render: (b) => (
                                      <div className="flex items-center gap-1.5">
                                        {b.status === 'COMPLETED' && !['REQUESTED', 'IN_PROGRESS'].includes(b.restoreStatus) ? (
                                          <Button size="sm" variant="secondary" onClick={() => handleAppBackupRestore(b)} disabled={!canManageBackups} leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}>طلب استعادة على الجهاز</Button>
                                        ) : null}
                                        {b.restoreStatus === 'REQUESTED' ? (
                                          <Button size="sm" variant="ghost" onClick={() => handleAppBackupRestoreCancel(b)} disabled={!canManageBackups}>إلغاء</Button>
                                        ) : null}
                                      </div>
                                    ),
                                  },
                                ]}
                              />

            )}
          </div>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة النسخ الاحتياطي المركزي للعملاء (Central Backups & Vault)"
        description="إدارة النسخ الاحتياطي السحابي المشفر، والتحقق الدوري من سلامة التخزين، والاستعادة عند الكوارث."
        icon={<Database className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={handleTriggerBackup}
            disabled={running || !canManageBackups}
            leadingIcon={<Play className="h-4 w-4" />}
          >
            {running ? 'جارٍ الحفظ...' : 'أخذ نسخة احتياطية فورية الآن'}
          </Button>
        }
      />

      {/* Vault Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-primary/80 border border-line-strong rounded-xl">
          <p className="text-xs font-semibold text-muted">إجمالي النسخ السحابية المحفوظة</p>
          <p className="text-2xl font-black text-muted mt-1">{backups.length} أرشيف</p>
          <p className="text-[11px] text-muted mt-1">تشفير AES-256 مشدد مع بصمة SHA-256</p>
        </div>

        <div className="p-4 bg-success/20 border border-success/20 rounded-xl">
          <p className="text-xs font-semibold text-success">التحقق من السلامة (Integrity Check)</p>
          <p className="text-2xl font-black text-success mt-1">
            {backups.filter((b) => b.integrityCheckPassed).length} / {backups.length}
          </p>
          <p className="text-[11px] text-success/80 mt-1">
            النسخ التي اجتازت التحقق من نسخة خارج الموقع فقط
          </p>
        </div>

        <div className="p-4 bg-primary/20 border border-primary/20 rounded-xl">
          <p className="text-xs font-semibold text-primary">حجم التخزين التقديري المستخدم</p>
          <p className="text-2xl font-black text-primary mt-1">
            {formatBytes(backups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0))}
          </p>
          <p className="text-[11px] text-primary/80 mt-1">حجم الأرشيفات المشفرة المسجلة فعلياً</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {/* Backups Table */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ فحص النسخ الاحتياطية...</div>
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-6 w-6 text-muted" />}
            title="لا توجد نسخ احتياطية مسجلة"
            description="أنشئ أول نسخة احتياطية لحماية بيانات المنصة والعملاء."
          />
        ) : (
          <DataTable
                        ariaLabel="نسخ المنصة الاحتياطية"
                        rows={backups}
                        rowKey={(b) => b.id}
                        minWidth={850}
                        dense
                        columns={[
                          { key: 'file', header: 'اسم ملف الأرشيف', render: (b) => <span className="font-mono font-bold text-muted">{b.filename}</span> },
                          { key: 'size', header: 'الحجم', render: (b) => <span className="font-semibold text-muted">{formatBytes(b.sizeBytes)}</span> },
                          { key: 'path', header: 'مسار التخزين', render: (b) => <span className="font-mono text-[11px] text-muted">{b.storageLocation}</span> },
                          { key: 'status', header: 'الحالة', render: (b) => <span className="text-success font-bold bg-success/10 border border-success/20 px-2 py-0.5 rounded text-[10px]">{b.status}</span> },
                          {
                            key: 'integrity', header: 'فحص السلامة',
                            render: (b) => b.integrityCheckPassed ? (
                              <span className="text-success flex items-center gap-1 font-bold text-[11px]"><CheckCircle2 className="h-3.5 w-3.5" /> سليم ومطابق</span>
                            ) : (
                              <span className="text-danger flex items-center gap-1 font-bold text-[11px]"><AlertTriangle className="h-3.5 w-3.5" /> تالف</span>
                            ),
                          },
                          { key: 'created', header: 'تاريخ الإنشاء', render: (b) => <span className="text-muted">{formatDateTime(b.createdAt)}</span> },
                        ]}
                      />

        )}
      </div>
      {confirmDialog}
    </div>
  );
};

export default PlatformBackupsPage;
