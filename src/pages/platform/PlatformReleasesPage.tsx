import React, { useState, useEffect, useCallback } from 'react';
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

export const PlatformReleasesPage: React.FC = () => {
  const [releases, setReleases] = useState<PlatformRelease[]>([]);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Targets Modal
  const [activeReleaseForTargets, setActiveReleaseForTargets] = useState<PlatformRelease | null>(null);
  const [targets, setTargets] = useState<PlatformReleaseTarget[]>([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

  // Upsert Release Modal
  const [isUpsertOpen, setIsUpsertOpen] = useState(false);
  const [releaseForm, setReleaseForm] = useState<{
    id?: string;
    version: string;
    channel: 'STABLE' | 'BETA' | 'ALPHA' | 'HOTFIX';
    status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
    isMandatory: boolean;
    minVersion: string;
    rolloutGroup: string;
    notes: string;
    fileUrl: string;
    fileName: string;
    checksumSha256: string;
    changelog: string;
  }>({
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
  });

  const loadData = useCallback(() => {
    setLoading(true);
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenTargets = (rel: PlatformRelease) => {
    setActiveReleaseForTargets(rel);
    setTargetsLoading(true);
    try {
      const list = platformAdminService.listReleaseTargets(rel.id);
      setTargets(list);
      setSelectedTenantIds(list.map((t) => t.tenantId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تحميل أهداف الإصدار.');
    } finally {
      setTargetsLoading(false);
    }
  };

  const handleSaveTargets = () => {
    if (!activeReleaseForTargets) return;
    try {
      platformAdminService.setReleaseTargets(activeReleaseForTargets.id, selectedTenantIds);
      setActiveReleaseForTargets(null);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل تحديث أهداف العملاء.');
    }
  };

  const handleDisableRelease = (id: string) => {
    if (!confirm('هل أنت متأكد من تعطيل/إيقاف هذا الإصدار لمنع تحميله أو استخدامه؟')) return;
    try {
      platformAdminService.disableRelease(id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تعطيل الإصدار.');
    }
  };

  const handleRollback = (rel: PlatformRelease) => {
    const safeVer = prompt(`أدخل الإصدار الآمن الذي ترغب في التراجع الطارئ إليه (الإصدار الحالي: ${rel.version}):`);
    if (!safeVer || !safeVer.trim()) return;
    try {
      platformAdminService.rollbackRelease(rel.id, safeVer.trim());
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر تنفيذ التراجع الطارئ.');
    }
  };

  const handleSaveRelease = () => {
    if (!releaseForm.version.trim()) {
      alert('رقم الإصدار مطلوب.');
      return;
    }
    try {
      platformAdminService.upsertRelease(releaseForm);
      setIsUpsertOpen(false);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حفظ الإصدار.');
    }
  };

  return (
    <div className="space-y-4 text-right">
      <PageHeader
        title="إدارة الإصدارات والتحديثات المركزية (Releases & Rollout)"
        description="إدارة حزم التحديث، التوزيع التدريجي على العملاء، التوقيعات الرقمية، والتراجع الطارئ عند حدوث أخطاء."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setReleaseForm({
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
              });
              setIsUpsertOpen(true);
            }}
            leadingIcon={<Plus className="h-4 w-4" />}
          >
            إضافة إصدار جديد
          </Button>
        }
      />

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-300">
          {error}
        </div>
      )}

      {/* Releases Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">جارٍ تحميل الإصدارات...</div>
        ) : releases.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6 text-slate-500" />}
            title="لا توجد حزم أو إصدارات"
            description="أنشئ أول إصدار للنظام لتوزيعه على العملاء والتحكم في دورات التحديث."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">الإصدار / القناة</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">إجباري / الحد الأدنى</th>
                  <th className="px-4 py-3">مجموعة التوزيع</th>
                  <th className="px-4 py-3">نتائج التطبيق (Targets)</th>
                  <th className="px-4 py-3">تاريخ النشر</th>
                  <th className="px-4 py-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {releases.map((rel) => {
                  const summary = rel.targetsSummary || { total: 0, pending: 0, success: 0, failed: 0 };
                  return (
                    <tr key={rel.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 text-sm">{rel.version}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                              rel.channel === 'STABLE'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : rel.channel === 'HOTFIX'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {rel.channel}
                          </span>
                        </div>
                        {rel.notes && <p className="text-[11px] text-slate-400 mt-0.5">{rel.notes}</p>}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            rel.status === 'PUBLISHED'
                              ? 'text-emerald-400'
                              : rel.status === 'DEPRECATED'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {rel.status === 'PUBLISHED' ? 'منشور (نشط)' : rel.status === 'DEPRECATED' ? 'معطّل/ملغي' : 'مسودة'}
                        </span>
                        {rel.rollbackVersion && (
                          <div className="text-[10px] text-amber-400 mt-0.5">
                            تراجع إلى: {rel.rollbackVersion}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div>{rel.isMandatory ? <span className="text-rose-400 font-bold">إجباري</span> : 'اختياري'}</div>
                        <div className="text-[10px] text-slate-500">أدنى: {rel.minVersion || 'لا يوجد'}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                          {rel.rolloutGroup}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-emerald-400 font-bold" title="ناجح">{summary.success}✓</span>
                          <span className="text-amber-400 font-bold" title="قيد الانتظار">{summary.pending}⌛</span>
                          {summary.failed > 0 && (
                            <span className="text-rose-400 font-bold" title="فشل">{summary.failed}✗</span>
                          )}
                          <span className="text-slate-500 text-[10px]">({summary.total} عميل)</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-400">{formatDateTime(rel.createdAt)}</td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenTargets(rel)}
                            className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1"
                            title="تحديد أو فحص العملاء المستهدفين"
                          >
                            <Users className="h-3.5 w-3.5" />
                            العملاء
                          </button>

                          {rel.status !== 'DEPRECATED' && (
                            <>
                              <button
                                onClick={() => handleDisableRelease(rel.id)}
                                className="text-rose-400 hover:text-rose-300 text-xs"
                                title="تعطيل فوري للإصدار"
                              >
                                تعطيل
                              </button>
                              <button
                                onClick={() => handleRollback(rel)}
                                className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1"
                                title="تراجع طارئ"
                              >
                                <RotateCcw className="h-3 w-3" />
                                تراجع
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
          <p className="text-xs text-slate-400">
            حدد العملاء الذين سيتم طرح وتطبيق هذا الإصدار عليهم، أو راقب حالة تطبيق التحديث:
          </p>

          <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-800 p-2 rounded-lg bg-slate-950/40">
            {tenants.map((t) => {
              const checked = selectedTenantIds.includes(t.id);
              const targetStatus = targets.find((tgt) => tgt.tenantId === t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-800/40 cursor-pointer text-xs"
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
                      className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="font-bold text-slate-200">{t.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">({t.code})</span>
                  </div>

                  {targetStatus && (
                    <span
                      className={`text-[10px] font-bold ${
                        targetStatus.status === 'SUCCESS'
                          ? 'text-emerald-400'
                          : targetStatus.status === 'FAILED'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {targetStatus.status}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              تم تحديد {selectedTenantIds.length} من أصل {tenants.length} عميل
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setActiveReleaseForTargets(null)}>
                إغلاق
              </Button>
              <Button size="sm" onClick={handleSaveTargets}>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">رقم الإصدار (SemVer) *</label>
              <input
                type="text"
                value={releaseForm.version}
                onChange={(e) => setReleaseForm({ ...releaseForm, version: e.target.value })}
                placeholder="2.1.0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">قناة الإصدار</label>
              <select
                value={releaseForm.channel}
                onChange={(e) => setReleaseForm({ ...releaseForm, channel: e.target.value as any })}
                className={inputClass}
              >
                <option value="STABLE">مستقر (STABLE)</option>
                <option value="HOTFIX">إصلاح طارئ (HOTFIX)</option>
                <option value="BETA">تجريبي (BETA)</option>
                <option value="ALPHA">داخلي (ALPHA)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">رابط تحميل الحزمة (URL)</label>
              <input
                type="text"
                value={releaseForm.fileUrl}
                onChange={(e) => setReleaseForm({ ...releaseForm, fileUrl: e.target.value })}
                placeholder="https://releases.ceramisys.com/v2.1.0.tar.gz"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">بصمة التحقق SHA256</label>
              <input
                type="text"
                value={releaseForm.checksumSha256}
                onChange={(e) => setReleaseForm({ ...releaseForm, checksumSha256: e.target.value })}
                placeholder="hash..."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">ملاحظات الإصدار / التغييرات</label>
            <textarea
              rows={3}
              value={releaseForm.changelog}
              onChange={(e) => setReleaseForm({ ...releaseForm, changelog: e.target.value })}
              placeholder="تفاصيل التحديث والميزات الجديدة..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 mt-1">
              <input
                type="checkbox"
                checked={releaseForm.isMandatory}
                onChange={(e) => setReleaseForm({ ...releaseForm, isMandatory: e.target.checked })}
                className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
              />
              <span>تحديث إجباري (يمنع العمل على الإصدارات الأقدم)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setIsUpsertOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveRelease}>
              نشر الإصدار
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformReleasesPage;
