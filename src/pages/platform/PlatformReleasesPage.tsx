import React, { useState, useEffect, useCallback } from 'react';
import { DataTable } from '../../components/ui/DataTable';
import {
  Boxes,
  Package,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Ban,
  Download,
  Users,
  Search,
  ExternalLink,
  ShieldAlert,
  Plus,
  FileCode,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  inputClass,
} from './components/PlatformUI';

import { useToast } from '../../components/ui/Toast';
const emptyRelease: PlatformRelease = {
  id: '',
  version: '',
  channel: 'STABLE',
  status: 'PUBLISHED',
  isMandatory: false,
  minVersion: '1.0.0',
  rolloutGroup: 'ALL',
  notes: '',
  fileUrl: '',
  fileName: '',
  checksumSha256: '',
  changelog: '',
  createdAt: '',
  updatedAt: '',
};

interface CentralReleaseRow {
  id: string;
  version: string;
  channel: string;
  status: string;
  rolloutStrategy: string;
  rolloutPercent: number;
  targetTenantIds: string[];
  downloadUrl: string | null;
  checksum: string | null;
  releaseNotes: string | null;
  minRequiredVersion: string | null;
  isMandatory: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapCentralRelease(r: CentralReleaseRow): PlatformRelease & { _central?: CentralReleaseRow } {
  const targets = Array.isArray(r.targetTenantIds) ? r.targetTenantIds : [];
  return {
    id: r.id,
    version: r.version,
    channel: (r.channel === 'BETA' ? 'BETA' : r.channel === 'ALPHA' ? 'ALPHA' : 'STABLE') as PlatformRelease['channel'],
    status: (r.status === 'PUBLISHED' ? 'PUBLISHED' : r.status === 'DRAFT' ? 'DRAFT' : 'DEPRECATED') as PlatformRelease['status'],
    isMandatory: r.isMandatory,
    minVersion: r.minRequiredVersion || '1.0.0',
    rolloutGroup: targets.length
      ? `TARGETED ${targets.length}`
      : r.rolloutStrategy === 'PHASED'
        ? `PHASED ${r.rolloutPercent}%`
        : 'ALL',
    notes: r.releaseNotes || '',
    fileUrl: r.downloadUrl || '',
    fileName: '',
    checksumSha256: r.checksum || '',
    changelog: r.releaseNotes || '',
    createdAt: r.publishedAt || r.createdAt,
    updatedAt: r.updatedAt,
    _central: r,
  } as PlatformRelease & { _central?: CentralReleaseRow };
}

export const PlatformReleasesPage: React.FC = () => {
  const toast = useToast();
  const [releases, setReleases] = useState<PlatformRelease[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const centralActive = getCentralDataSourceState().active;

  // Targets Modal
  const [activeReleaseForTargets, setActiveReleaseForTargets] = useState<PlatformRelease | null>(null);
  const [targets, setTargets] = useState<PlatformReleaseTarget[]>([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

  // Upsert Release Modal
  const [isUpsertOpen, setIsUpsertOpen] = useState(false);
  const [releaseForm, setReleaseForm] = useState<PlatformRelease>({ ...emptyRelease });

  const canManageReleases = canPlatform('releases');

  const loadData = useCallback(() => {
    setLoading(true);
    if (centralActive) {
      Promise.all([centralPlatformClient.listReleases(), centralPlatformClient.listTenants('', '', '')])
        .then(([rels, tens]) => {
          setReleases((rels as CentralReleaseRow[]).map(mapCentralRelease));
          setTenants(tens as PlatformTenant[]);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل إصدارات المنصة.'))
        .finally(() => setLoading(false));
      return;
    }
    try {
      const rels = platformAdminService.listReleases();
      const tens = platformAdminService.listTenants();
      setReleases(rels);
      setTenants(tens);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل إصدارات المنصة.');
    } finally {
      setLoading(false);
    }
  }, [centralActive]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenTargets = (rel: PlatformRelease) => {
    setActiveReleaseForTargets(rel);
    setTargetsLoading(true);
    if (centralActive) {
      const central = (rel as any)._central as CentralReleaseRow | undefined;
      setSelectedTenantIds(Array.isArray(central?.targetTenantIds) ? central.targetTenantIds : []);
      setTargets([]);
      setTargetsLoading(false);
      return;
    }
    try {
      const list = platformAdminService.listReleaseTargets(rel.id);
      setTargets(list);
      setSelectedTenantIds(list.map((t) => t.tenantId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل أهداف الإصدار.');
    } finally {
      setTargetsLoading(false);
    }
  };

  const handleSaveTargets = () => {
    if (!activeReleaseForTargets) return;
    if (!canManageReleases) {
      toast.warning('لا تملك صلاحية إدارة الإصدارات.');
      return;
    }
    if (centralActive) {
      const central = (activeReleaseForTargets as any)._central as CentralReleaseRow | undefined;
      centralPlatformClient.updateRelease(activeReleaseForTargets.id, {
        targetTenantIds: selectedTenantIds,
        rolloutStrategy: selectedTenantIds.length ? 'PHASED' : (central?.rolloutStrategy === 'PHASED' ? 'PHASED' : 'FULL'),
        rolloutPercent: central?.rolloutPercent ?? 100,
      })
        .then(() => { setActiveReleaseForTargets(null); loadData(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'فشل تحديث أهداف العملاء.'));
      return;
    }
    try {
      platformAdminService.setReleaseTargets(activeReleaseForTargets.id, selectedTenantIds);
      setActiveReleaseForTargets(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل تحديث أهداف العملاء.');
    }
  };

  const handleDisableRelease = (id: string) => {
    if (!canManageReleases) {
      toast.warning('لا تملك صلاحية إدارة الإصدارات.');
      return;
    }
    const rel = releases.find((r) => r.id === id);
    if (centralActive) {
      const central = (rel as any)?._central as CentralReleaseRow | undefined;
      if (central?.status === 'PUBLISHED') {
        if (!confirm('إيقاف هذا الإصدار المنشور (rollback)؟ لن يصل للعملاء الجدد.')) return;
        centralPlatformClient.rollbackRelease(id)
          .then(loadData)
          .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر إيقاف الإصدار.'));
      } else {
        if (!confirm('حذف هذا الإصدار غير المنشور؟')) return;
        centralPlatformClient.deleteRelease(id)
          .then(loadData)
          .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر حذف الإصدار.'));
      }
      return;
    }
    if (!confirm('هل أنت متأكد من تعطيل/إيقاف هذا الإصدار لمنع تحميله أو استخدامه؟')) return;
    try {
      platformAdminService.disableRelease(id);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تعطيل الإصدار.');
    }
  };

  const handleRollback = (rel: PlatformRelease) => {
    if (!canManageReleases) {
      toast.warning('لا تملك صلاحية إدارة الإصدارات.');
      return;
    }
    if (centralActive) {
      if (!confirm(`إيقاف الإصدار ${rel.version} (rollback)؟`)) return;
      centralPlatformClient.rollbackRelease(rel.id)
        .then(loadData)
        .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر تنفيذ التراجع.'));
      return;
    }
    const safeVer = prompt(`أدخل الإصدار الآمن الذي ترغب في التراجع الطارئ إليه (الإصدار الحالي: ${rel.version}):`);
    if (!safeVer || !safeVer.trim()) return;
    try {
      platformAdminService.rollbackRelease(rel.id, safeVer.trim());
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تنفيذ التراجع الطارئ.');
    }
  };

  const handlePublish = (id: string) => {
    if (!canManageReleases) {
      toast.warning('لا تملك صلاحية إدارة الإصدارات.');
      return;
    }
    centralPlatformClient.publishRelease(id)
      .then(loadData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'تعذر نشر الإصدار.'));
  };

  const handleSaveRelease = () => {
    if (!canManageReleases) {
      toast.warning('لا تملك صلاحية إدارة الإصدارات.');
      return;
    }
    if (!releaseForm.version.trim()) {
      toast.warning('رقم الإصدار مطلوب.');
      return;
    }
    if (centralActive) {
      const channel = releaseForm.channel === 'HOTFIX' ? 'BETA' : releaseForm.channel;
      const payload = {
        version: releaseForm.version.trim(),
        channel,
        releaseNotes: releaseForm.changelog || releaseForm.notes || '',
        downloadUrl: releaseForm.fileUrl || '',
        checksum: releaseForm.checksumSha256 || '',
        minRequiredVersion: releaseForm.minVersion || '',
        isMandatory: Boolean(releaseForm.isMandatory),
        rolloutStrategy: 'FULL',
        rolloutPercent: 100,
        targetTenantIds: [],
      };
      const existing = (releaseForm as any)._central as CentralReleaseRow | undefined;
      const request = existing
        ? centralPlatformClient.updateRelease(releaseForm.id, payload)
        : centralPlatformClient.createRelease(payload).then((created: any) =>
            centralPlatformClient.publishRelease(created?.id ?? created?.data?.id ?? releaseForm.id));
      Promise.resolve(request)
        .then(() => { setIsUpsertOpen(false); loadData(); })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'فشل حفظ الإصدار.'));
      return;
    }
    try {
      platformAdminService.upsertRelease(releaseForm);
      setIsUpsertOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل حفظ الإصدار.');
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة الإصدارات والتحديثات المركزية (Releases & Rollout)"
        description="إدارة حزم التحديث، التوزيع التدريجي على العملاء، التوقيعات الرقمية، والتراجع الطارئ عند حدوث أخطاء."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          canManageReleases ? (
            <Button
              size="sm"
              onClick={() => {
                setReleaseForm({ ...emptyRelease });
                setIsUpsertOpen(true);
              }}
              leadingIcon={<Plus className="h-4 w-4" />}
            >
              إضافة إصدار جديد
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {/* Releases Table */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-primary/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل الإصدارات...</div>
        ) : releases.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6 text-muted" />}
            title="لا توجد حزم أو إصدارات"
            description="أنشئ أول إصدار للنظام لتوزيعه على العملاء والتحكم في دورات التحديث."
          />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="إصدارات التطبيق"
              rows={releases}
              rowKey={(rel: any) => String(rel.id)}
              minWidth={950}
              dense
              tableClassName="text-xs"
              rowClassName={() => 'transition-colors hover:bg-primary/30'}
              columns={[
                {
                  key: 'ver', header: 'الإصدار / القناة',
                  render: (rel: any) => (
                    <span className="block">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-muted">{rel.version}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${rel.channel === 'STABLE' ? 'bg-success/20 text-success' : rel.channel === 'HOTFIX' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'}`}>
                          {rel.channel}
                        </span>
                      </span>
                      {rel.notes && <span className="mt-0.5 block text-[11px] text-muted">{rel.notes}</span>}
                    </span>
                  ),
                },
                {
                  key: 'status', header: 'الحالة',
                  render: (rel: any) => (
                    <span className="block">
                      <span className={`inline-flex items-center gap-1 font-bold ${rel.status === 'PUBLISHED' ? 'text-success' : rel.status === 'DEPRECATED' ? 'text-danger' : 'text-muted'}`}>
                        {rel.status === 'PUBLISHED' ? 'منشور (نشط)' : rel.status === 'DEPRECATED' ? 'معطّل/ملغي' : 'مسودة'}
                      </span>
                      {rel.rollbackVersion && <span className="mt-0.5 block text-[10px] text-warning">تراجع إلى: {rel.rollbackVersion}</span>}
                    </span>
                  ),
                },
                {
                  key: 'mandatory', header: 'إجباري / الحد الأدنى',
                  render: (rel: any) => (
                    <span className="block">
                      <span className="block">{rel.isMandatory ? <span className="font-bold text-danger">إجباري</span> : 'اختياري'}</span>
                      <span className="block text-[10px] text-muted">أدنى: {rel.minVersion || 'لا يوجد'}</span>
                    </span>
                  ),
                },
                {
                  key: 'group', header: 'مجموعة التوزيع',
                  render: (rel: any) => <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] text-muted">{rel.rolloutGroup}</span>,
                },
                {
                  key: 'targets', header: 'نتائج التطبيق (Targets)',
                  render: (rel: any) => {
                    const summary = rel.targetsSummary || { total: 0, pending: 0, success: 0, failed: 0 };
                    return (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-success" title="ناجح">{summary.success}✓</span>
                        <span className="font-bold text-warning" title="قيد الانتظار">{summary.pending}⌛</span>
                        {summary.failed > 0 && <span className="font-bold text-danger" title="فشل">{summary.failed}✗</span>}
                        <span className="text-[10px] text-muted">({summary.total} عميل)</span>
                      </span>
                    );
                  },
                },
                { key: 'date', header: 'تاريخ النشر', render: (rel: any) => <span className="text-muted">{formatDateTime(rel.createdAt)}</span> },
                {
                  key: 'actions', header: 'إجراءات', align: 'center',
                  render: (rel: any) => (
                    <span className="flex items-center justify-center gap-2">
                      <button onClick={() => handleOpenTargets(rel)} className="flex items-center gap-1 text-xs text-primary hover:text-primary" title="تحديد أو فحص العملاء المستهدفين">
                        <Users className="h-3.5 w-3.5" />
                        العملاء
                      </button>
                      {centralActive && rel.status === 'DRAFT' && canManageReleases && (
                        <button onClick={() => handlePublish(rel.id)} className="text-xs font-bold text-success hover:text-success" title="نشر الإصدار">
                          نشر
                        </button>
                      )}
                      {rel.status !== 'DEPRECATED' && canManageReleases && (
                        <>
                          <button onClick={() => handleDisableRelease(rel.id)} className="text-xs text-danger hover:text-danger" title="تعطيل فوري للإصدار">
                            تعطيل
                          </button>
                          <button onClick={() => handleRollback(rel)} className="flex items-center gap-1 text-xs text-warning hover:text-warning" title="تراجع طارئ">
                            <RotateCcw className="h-3 w-3" />
                            تراجع
                          </button>
                        </>
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* Modal: Release Targets */}
      <Modal
        open={Boolean(activeReleaseForTargets)}
        onClose={() => setActiveReleaseForTargets(null)}
        title={`العملاء المستهدفون للإصدار ${activeReleaseForTargets?.version || ''}`}
      >
        <div className="space-y-4 text-right">
          <p className="text-xs text-muted">
            حدد العملاء الذين سيتم طرح وتطبيق هذا الإصدار عليهم، أو راقب حالة تطبيق التحديث:
          </p>

          <div className="max-h-60 overflow-y-auto space-y-1.5 border border-line-strong p-2 rounded-lg bg-primary/40">
            {tenants.map((t) => {
              const checked = selectedTenantIds.includes(t.id);
              const targetStatus = targets.find((tgt) => tgt.tenantId === t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-primary/40 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTenantIds([...selectedTenantIds, t.id]);
                        } else {
                          setSelectedTenantIds(selectedTenantIds.filter((id) => id !== t.id));
                        }
                      }}
                      className="rounded border-line-strong text-primary focus:ring-primary"
                    />
                    <span className="font-bold text-muted">{t.name}</span>
                    <span className="font-mono text-[10px] text-muted">({t.code})</span>
                  </div>

                  {targetStatus && (
                    <span
                      className={`text-[10px] font-bold ${
                        targetStatus.status === 'SUCCESS'
                          ? 'text-success'
                          : targetStatus.status === 'FAILED'
                          ? 'text-danger'
                          : 'text-warning'
                      }`}
                    >
                      {targetStatus.status}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-line-strong">
            <span className="text-xs text-muted">
              تم تحديد {selectedTenantIds.length} من أصل {tenants.length} عميل
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setActiveReleaseForTargets(null)}>
                إغلاق
              </Button>
              <Button size="sm" onClick={handleSaveTargets} disabled={!canManageReleases}>
                حفظ التعيين والنشر
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: New / Edit Release */}
      <Modal
        open={isUpsertOpen}
        onClose={() => setIsUpsertOpen(false)}
        title="إنشاء أو تحديث حزمة إصدار"
      >
        <div className="space-y-3 text-right">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">رقم الإصدار (SemVer) *</label>
              <input
                type="text"
                value={releaseForm.version}
                onChange={(e) => setReleaseForm({ ...releaseForm, version: e.target.value })}
                placeholder="2.1.0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">قناة الإصدار</label>
              <select
                value={releaseForm.channel}
                onChange={(e) => setReleaseForm({ ...releaseForm, channel: e.target.value as any })}
                className={inputClass}
              >
                <option value="STABLE">مستقر (STABLE)</option>
                {!centralActive && <option value="HOTFIX">إصلاح طارئ (HOTFIX)</option>}
                <option value="BETA">تجريبي (BETA)</option>
                <option value="ALPHA">داخلي (ALPHA)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">رابط تحميل الحزمة (URL)</label>
              <input
                type="text"
                value={releaseForm.fileUrl ?? ''}
                onChange={(e) => setReleaseForm({ ...releaseForm, fileUrl: e.target.value })}
                placeholder="https://releases.ceramisys.com/v2.1.0.tar.gz"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">بصمة التحقق SHA256</label>
              <input
                type="text"
                value={releaseForm.checksumSha256 ?? ''}
                onChange={(e) => setReleaseForm({ ...releaseForm, checksumSha256: e.target.value })}
                placeholder="hash..."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">ملاحظات الإصدار / التغييرات</label>
            <textarea
              rows={3}
              value={releaseForm.changelog ?? ''}
              onChange={(e) => setReleaseForm({ ...releaseForm, changelog: e.target.value })}
              placeholder="تفاصيل التحديث والميزات الجديدة..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted mt-1">
              <input
                type="checkbox"
                checked={releaseForm.isMandatory ?? false}
                onChange={(e) => setReleaseForm({ ...releaseForm, isMandatory: e.target.checked })}
                className="rounded border-line-strong text-primary focus:ring-primary"
              />
              <span>تحديث إجباري (يمنع العمل على الإصدارات الأقدم)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line-strong">
            <Button variant="secondary" size="sm" onClick={() => setIsUpsertOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveRelease} disabled={!canManageReleases}>
              نشر الإصدار
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformReleasesPage;
