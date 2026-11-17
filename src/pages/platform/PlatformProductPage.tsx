import React from 'react';
import {
  Boxes,
  Plus,
  Pencil,
  Rocket,
  Sparkles,
  SlidersHorizontal,
  BadgeCheck,
  AlertTriangle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  FileCheck,
  ShieldAlert,
  Search,
  ExternalLink,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformFeatureFlag,
  PlatformFeatureOverride,
  PlatformModule,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  Field,
  StatusBadge,
  Toggle,
  formatDate,
  inputClass,
} from './components/PlatformUI';

const TABS = [
  { id: 'modules', label: 'الوحدات', icon: SlidersHorizontal },
  { id: 'features', label: 'المزايا والرايات (Feature Flags)', icon: Sparkles },
  { id: 'releases', label: 'الإصدارات وحزم التحديث', icon: Rocket },
] as const;

type TabId = (typeof TABS)[number]['id'];

const RELEASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  DEPRECATED: 'متوقف',
};

const CHANNEL_LABELS: Record<string, string> = {
  STABLE: 'مستقر',
  BETA: 'تجريبي',
  NIGHTLY: 'ليلي',
};

const TARGET_STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  SUCCESS: { label: 'تم بنجاح', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  FAILED: { label: 'فشل التحديث', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  SKIPPED: { label: 'تم التخطي', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
};

const emptyFeature = {
  id: undefined as string | undefined,
  code: '',
  name: '',
  description: '',
  category: '',
  isEnabled: true,
  rolloutPercent: 100,
  isStagingOnly: false,
  minPlanTier: '',
};

const emptyRelease = {
  id: undefined as string | undefined,
  version: '',
  channel: 'STABLE' as string,
  status: 'PUBLISHED' as string,
  targetsSummary: null as Record<string, number> | null,
  notes: '',
  rollbackVersion: '',
  isMandatory: false,
  minVersion: '',
  rolloutGroup: 'ALL',
  stagingGroup: 'PRODUCTION',
  fileUrl: '',
  fileName: '',
  fileSize: '' as string,
  checksumSha256: '',
  packageSignature: '',
  changelog: '',
  releasedAt: new Date().toISOString().slice(0, 10),
};

export const PlatformProductPage: React.FC = () => {
  const toast = useToast();
  const canManageProduct = canPlatform('product', 'platform.product.update');
  const [tab, setTab] = React.useState<TabId>('modules');
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [features, setFeatures] = React.useState<PlatformFeatureFlag[]>([]);
  const [releases, setReleases] = React.useState<PlatformRelease[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Feature Modals & State
  const [featureOpen, setFeatureOpen] = React.useState(false);
  const [featureForm, setFeatureForm] = React.useState(emptyFeature);
  const [selectedFeatureForOverrides, setSelectedFeatureForOverrides] = React.useState<PlatformFeatureFlag | null>(null);
  const [featureOverrides, setFeatureOverrides] = React.useState<PlatformFeatureOverride[]>([]);
  const [newOverrideTenantId, setNewOverrideTenantId] = React.useState('');
  const [newOverrideEnabled, setNewOverrideEnabled] = React.useState(true);
  const [newOverrideCustomRollout, setNewOverrideCustomRollout] = React.useState<number | ''>('');

  // Release Modals & State
  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [releaseForm, setReleaseForm] = React.useState(emptyRelease);
  const [selectedReleaseForTargets, setSelectedReleaseForTargets] = React.useState<PlatformRelease | null>(null);
  const [releaseTargets, setReleaseTargets] = React.useState<PlatformReleaseTarget[]>([]);
  const [targetSearchTerm, setTargetSearchTerm] = React.useState('');
  const [selectedTenantIdsForRelease, setSelectedTenantIdsForRelease] = React.useState<string[]>([]);

  // Rollback Modal State
  const [rollbackOpen, setRollbackOpen] = React.useState(false);
  const [rollbackReleaseItem, setRollbackReleaseItem] = React.useState<PlatformRelease | null>(null);
  const [safeRollbackVersion, setSafeRollbackVersion] = React.useState('');

  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setModules(platformAdminService.listModules());
      setFeatures(platformAdminService.listFeatureFlags());
      setReleases(platformAdminService.listReleases());
      setTenants(platformAdminService.listTenants());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنتج.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleModule = (module: PlatformModule) => {
    try {
      platformAdminService.setModuleEnabled(module.id, !module.isEnabled);
      toast.success(module.isEnabled ? 'تم تعطيل الوحدة' : 'تم تفعيل الوحدة');
      load();
    } catch (err) {
      toast.error('تعذر تحديث الوحدة', err instanceof Error ? err.message : undefined);
    }
  };

  // ─── Feature Flags Management ──────────────────────────────────────────

  const openFeature = (flag?: PlatformFeatureFlag) => {
    setFeatureForm(
      flag
        ? {
            id: flag.id,
            code: flag.code,
            name: flag.name,
            description: flag.description ?? '',
            category: flag.category ?? '',
            isEnabled: flag.isEnabled,
            rolloutPercent: flag.rolloutPercent,
            isStagingOnly: Boolean(flag.isStagingOnly),
            minPlanTier: flag.minPlanTier ?? '',
          }
        : { ...emptyFeature }
    );
    setFeatureOpen(true);
  };

  const saveFeature = () => {
    setSaving(true);
    try {
      platformAdminService.upsertFeatureFlag({
        ...featureForm,
        rolloutPercent: Number(featureForm.rolloutPercent),
        minPlanTier: featureForm.minPlanTier || undefined,
      });
      toast.success(featureForm.id ? 'تم تحديث الميزة' : 'تم إنشاء الميزة');
      setFeatureOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر حفظ الميزة', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (flag: PlatformFeatureFlag) => {
    try {
      platformAdminService.setFeatureEnabled(flag.id, !flag.isEnabled);
      toast.success(flag.isEnabled ? 'تم تعطيل الميزة' : 'تم تفعيل الميزة');
      load();
    } catch (err) {
      toast.error('تعذر تحديث الميزة', err instanceof Error ? err.message : undefined);
    }
  };

  const openOverridesModal = (flag: PlatformFeatureFlag) => {
    setSelectedFeatureForOverrides(flag);
    try {
      const ovs = platformAdminService.listFeatureOverrides(flag.id);
      setFeatureOverrides(ovs);
      setNewOverrideTenantId('');
      setNewOverrideEnabled(true);
      setNewOverrideCustomRollout('');
    } catch (err) {
      toast.error('تعذر تحميل تخصيصات الميزة', err instanceof Error ? err.message : undefined);
    }
  };

  const addOverride = () => {
    if (!selectedFeatureForOverrides || !newOverrideTenantId) return;
    try {
      platformAdminService.setFeatureOverride({
        featureId: selectedFeatureForOverrides.id,
        targetType: 'TENANT',
        targetId: newOverrideTenantId,
        isEnabled: newOverrideEnabled,
        customRolloutPercent: newOverrideCustomRollout !== '' ? Number(newOverrideCustomRollout) : null,
      });
      toast.success('تمت إضافة التخصيص بنجاح');
      const ovs = platformAdminService.listFeatureOverrides(selectedFeatureForOverrides.id);
      setFeatureOverrides(ovs);
      setNewOverrideTenantId('');
      load();
    } catch (err) {
      toast.error('تعذر حفظ التخصيص', err instanceof Error ? err.message : undefined);
    }
  };

  const removeOverride = (overrideId: string) => {
    if (!selectedFeatureForOverrides) return;
    try {
      platformAdminService.removeFeatureOverride(overrideId);
      toast.success('تم حذف التخصيص');
      const ovs = platformAdminService.listFeatureOverrides(selectedFeatureForOverrides.id);
      setFeatureOverrides(ovs);
      load();
    } catch (err) {
      toast.error('تعذر حذف التخصيص', err instanceof Error ? err.message : undefined);
    }
  };

  // ─── Release Management ────────────────────────────────────────────────

  const openRelease = (release?: PlatformRelease) => {
    setReleaseForm(
      release
        ? {
            id: release.id,
            version: release.version,
            channel: release.channel,
            status: release.status ?? 'PUBLISHED',
            targetsSummary: release.targetsSummary ?? null,
            isMandatory: release.isMandatory ?? false,
            minVersion: release.minVersion ?? '',
            rolloutGroup: release.rolloutGroup || 'ALL',
            stagingGroup: release.stagingGroup || 'PRODUCTION',
            fileUrl: release.fileUrl ?? '',
            fileName: release.fileName ?? '',
            fileSize: release.fileSize != null ? String(release.fileSize) : '',
            checksumSha256: release.checksumSha256 ?? '',
            packageSignature: release.packageSignature ?? '',
            changelog: release.changelog ?? '',
            rollbackVersion: release.rollbackVersion ?? '',
            notes: release.notes ?? '',
            releasedAt: (release.releasedAt ?? release.createdAt).slice(0, 10),
          }
        : { ...emptyRelease }
    );
    setReleaseOpen(true);
  };

  const saveRelease = () => {
    setSaving(true);
    try {
      platformAdminService.upsertRelease({
        ...releaseForm,
        fileSize: releaseForm.fileSize !== '' ? Number(releaseForm.fileSize) : undefined,
        releasedAt: releaseForm.releasedAt ? new Date(releaseForm.releasedAt).toISOString() : undefined,
      });
      toast.success(releaseForm.id ? 'تم تحديث الإصدار وحزمته' : 'تم إنشاء الإصدار بنجاح');
      setReleaseOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر حفظ الإصدار', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const openTargetsModal = (release: PlatformRelease) => {
    setSelectedReleaseForTargets(release);
    try {
      const targets = platformAdminService.listReleaseTargets(release.id);
      setReleaseTargets(targets);
      setSelectedTenantIdsForRelease(targets.map((t) => t.tenantId));
      setTargetSearchTerm('');
    } catch (err) {
      toast.error('تعذر استرجاع مستهدفي الإصدار', err instanceof Error ? err.message : undefined);
    }
  };

  const saveTargets = () => {
    if (!selectedReleaseForTargets) return;
    setSaving(true);
    try {
      const updated = platformAdminService.setReleaseTargets(selectedReleaseForTargets.id, selectedTenantIdsForRelease);
      setReleaseTargets(updated);
      toast.success(`تم إسناد الإصدار إلى ${selectedTenantIdsForRelease.length} عميل.`);
      load();
    } catch (err) {
      toast.error('تعذر تحديث مستهدفي الإصدار', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const markTargetStatus = (targetId: string, status: PlatformReleaseTarget['status']) => {
    if (!selectedReleaseForTargets) return;
    try {
      const target = releaseTargets.find((t) => t.id === targetId);
      if (!target) return;
      platformAdminService.updateReleaseTargetStatus(selectedReleaseForTargets.id, target.tenantId, status);
      toast.success('تم تحديث حالة العميل');
      setReleaseTargets(platformAdminService.listReleaseTargets(selectedReleaseForTargets.id));
      load();
    } catch (err) {
      toast.error('تعذر تحديث الحالة', err instanceof Error ? err.message : undefined);
    }
  };

  const openRollbackModal = (release: PlatformRelease) => {
    setRollbackReleaseItem(release);
    setSafeRollbackVersion(release.rollbackVersion || (release.minVersion ?? ''));
    setRollbackOpen(true);
  };

  const confirmRollback = () => {
    if (!rollbackReleaseItem || !safeRollbackVersion.trim()) return;
    setSaving(true);
    try {
      platformAdminService.rollbackRelease(rollbackReleaseItem.id, safeRollbackVersion.trim());
      toast.success(`تم التراجع عن الإصدار v${rollbackReleaseItem.version} وتوجيه العملاء للإصدار v${safeRollbackVersion}`);
      setRollbackOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر التراجع عن الإصدار', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="التحكم في المنتج والمزايا (Product Control)"
        description="إدارة المزايا وFeature Flags وحزم التحديثات والـ Rollout والاستهداف الآمن."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          tab === 'features' ? (
            canManageProduct ? (
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => openFeature()}>
                ميزة جديدة
              </Button>
            ) : null
          ) : tab === 'releases' ? (
            canManageProduct ? (
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => openRelease()}>
                إصدار / حزمة جديدة
              </Button>
            ) : null
          ) : undefined
        }
      />

      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                tab === item.id ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm font-semibold text-slate-500 shadow-sm">
          جارٍ تحميل بيانات المنتج...
        </div>
      ) : tab === 'modules' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {modules.length === 0 ? (
            <EmptyState icon={<Boxes className="h-5 w-5" />} title="لا توجد وحدات" />
          ) : (
            <div className="divide-y divide-slate-100">
              {modules.map((module) => (
                <div key={module.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        module.isEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <BadgeCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-slate-800">
                        {module.name}
                        <span className="font-mono text-[9.5px] font-normal text-slate-400" dir="ltr">
                          {module.code}
                        </span>
                      </p>
                      <p className="text-[10.5px] text-slate-500">{module.description || 'بدون وصف'}</p>
                      {module.minPlanCode && (
                        <p className="mt-0.5 text-[9.5px] font-semibold text-sky-600">الحد الأدنى: {module.minPlanCode}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-[10.5px] font-bold ${module.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {module.isEnabled ? 'مفعّلة' : 'معطّلة'}
                    </span>
                    <Toggle checked={module.isEnabled} onChange={() => toggleModule(module)} disabled={!canManageProduct} label={module.name} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : tab === 'features' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {features.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="لا توجد مزايا"
              description="أضف ميزة للتحكم في إتاحتها للمشتركين وتخصيص الـ Feature Flags."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right">
                <thead className="bg-slate-50">
                  <tr className="text-[10.5px] text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">الميزة والرمز</th>
                    <th className="px-4 py-2.5 font-semibold">الفئة</th>
                    <th className="px-4 py-2.5 font-semibold">نسبة الإتاحة والتجربة</th>
                    <th className="px-4 py-2.5 font-semibold">تخصيص العملاء</th>
                    <th className="px-4 py-2.5 font-semibold">الحالة</th>
                    <th className="px-4 py-2.5 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((flag) => (
                    <tr key={flag.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-bold text-slate-800">{flag.name}</p>
                          {flag.isStagingOnly && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                              بيئة اختبار (Staging)
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[9.5px] text-slate-400" dir="ltr">
                          {flag.code}
                        </p>
                        {flag.description && <p className="text-[10px] text-slate-500">{flag.description}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-600">{flag.category || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${flag.rolloutPercent}%` }} />
                          </div>
                          <span className="text-[10.5px] font-semibold text-slate-600">{flag.rolloutPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => openOverridesModal(flag)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                        >
                          <Users className="h-3 w-3 text-sky-600" />
                          <span>{flag.overridesCount || 0} عملاء مخصصين</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10.5px] font-bold ${flag.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {flag.isEnabled ? 'مفعّلة' : 'معطّلة'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Toggle checked={flag.isEnabled} onChange={() => toggleFeature(flag)} disabled={!canManageProduct} label={flag.name} />
                          <button
                            type="button"
                            onClick={() => openFeature(flag)}
                            className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {releases.length === 0 ? (
            <EmptyState icon={<Rocket className="h-5 w-5" />} title="لا توجد إصدارات" description="سجّل إصدارات المنتج لمتابعة النشر وحزم التحديثات." />
          ) : (
            <div className="divide-y divide-slate-100">
              {releases.map((release) => (
                <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50/50">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <Rocket className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-slate-900" dir="ltr">
                          v{release.version}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold text-slate-600">
                          {CHANNEL_LABELS[release.channel]}
                        </span>
                        <StatusBadge value={release.status ?? ''} label={RELEASE_STATUS_LABELS[release.status ?? '']} />
                        {release.isMandatory && (
                          <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-700">
                            تحديث إلزامي
                          </span>
                        )}
                        {release.stagingGroup && release.stagingGroup !== 'PRODUCTION' && (
                          <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">
                            {release.stagingGroup}
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 text-[11px] text-slate-600">{release.notes || 'بدون ملاحظات'}</p>

                      {/* Package and Integrity info */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                        {release.fileName && (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                            <FileCheck className="h-3 w-3 text-sky-600" /> {release.fileName}
                            {release.fileSize && <span>({(release.fileSize / (1024 * 1024)).toFixed(2)} MB)</span>}
                          </span>
                        )}
                        {release.checksumSha256 && (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-500" title={`SHA-256: ${release.checksumSha256}`}>
                            <span className="font-semibold text-slate-700">SHA256:</span> {release.checksumSha256.slice(0, 10)}...
                          </span>
                        )}
                        {release.packageSignature && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold" title="الحزمة موقّعة رقمياً">
                            ✓ موقّع
                          </span>
                        )}
                        <span>{formatDate(release.releasedAt)}</span>
                      </div>

                      {/* Targets summary badges */}
                      {release.targetsSummary && release.targetsSummary.total > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-600">متابعة التحديث:</span>
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-700">
                            الإجمالي: {release.targetsSummary.total}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                            نجح: {release.targetsSummary.success}
                          </span>
                          {release.targetsSummary.failed > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                              فشل: {release.targetsSummary.failed}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[9.5px] font-bold">
                            انتظار: {release.targetsSummary.pending}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Users className="h-3.5 w-3.5 text-sky-600" />}
                      onClick={() => openTargetsModal(release)}
                    >
                      استهداف ومتابعة العملاء
                    </Button>
                    {release.status !== 'DEPRECATED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-amber-700 hover:bg-amber-50"
                        leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                        onClick={() => openRollbackModal(release)}
                      >
                        تراجع طارئ
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => openRelease(release)}
                      className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                      title="تعديل الحزمة والبيانات"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Feature Modal ─── */}
      <Modal
        open={featureOpen}
        onClose={() => setFeatureOpen(false)}
        title={featureForm.id ? 'تعديل ميزة ومنطق التحكم' : 'ميزة جديدة'}
        size="md"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFeatureOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={saveFeature} loading={saving} disabled={!canManageProduct}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الميزة" required>
            <input className={inputClass} value={featureForm.name} onChange={(e) => setFeatureForm({ ...featureForm, name: e.target.value })} />
          </Field>
          <Field label="الرمز البرمجي (Code)" required hint={featureForm.id ? 'لا يمكن تعديل الرمز' : 'مثال: sales.quick_invoice'}>
            <input
              dir="ltr"
              className={inputClass}
              value={featureForm.code}
              disabled={Boolean(featureForm.id)}
              onChange={(e) => setFeatureForm({ ...featureForm, code: e.target.value.toLowerCase() })}
            />
          </Field>
          <Field label="الفئة (Category)">
            <input className={inputClass} value={featureForm.category} onChange={(e) => setFeatureForm({ ...featureForm, category: e.target.value })} />
          </Field>
          <Field label="نسبة الإتاحة العامة (%)">
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={featureForm.rolloutPercent}
              onChange={(e) => setFeatureForm({ ...featureForm, rolloutPercent: Number(e.target.value) })}
            />
          </Field>
          <Field label="الحد الأدنى لدرجة الخطة (Tier)">
            <input
              placeholder="مثال: PRO أو ENTERPRISE"
              className={inputClass}
              value={featureForm.minPlanTier}
              onChange={(e) => setFeatureForm({ ...featureForm, minPlanTier: e.target.value })}
            />
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
            <div>
              <p className="text-[12px] font-bold text-slate-800">بيئة اختبار فقط (Staging)</p>
              <p className="text-[10px] text-slate-500">حصر الميزة لمجموعات الاختبار قبل الإطلاق العام.</p>
            </div>
            <Toggle checked={featureForm.isStagingOnly} onChange={(val) => setFeatureForm({ ...featureForm, isStagingOnly: val })} label="Staging" />
          </div>
          <Field label="الوصف التوضيحي" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={featureForm.description} onChange={(e) => setFeatureForm({ ...featureForm, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
          <div>
            <p className="text-[12px] font-bold text-slate-800">تفعيل الميزة</p>
            <p className="text-[10.5px] text-slate-500">عند التعطيل لن تكون الميزة متاحة لأي مشترك إلا بتخصيص صريح.</p>
          </div>
          <Toggle checked={featureForm.isEnabled} onChange={(next) => setFeatureForm({ ...featureForm, isEnabled: next })} label="تفعيل الميزة" />
        </div>
      </Modal>

      {/* ─── Feature Overrides Modal (Tenant-specific Feature Flags) ─── */}
      <Modal
        open={Boolean(selectedFeatureForOverrides)}
        onClose={() => setSelectedFeatureForOverrides(null)}
        title={`تخصيص الميزة: ${selectedFeatureForOverrides?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-sky-50 p-3 text-[11px] text-sky-800">
            يمكنك هنا فرض تفعيل أو حجب الميزة لعملاء محددين بغض النظر عن نسبة الإتاحة العامة للنظام.
          </div>

          {/* Add Override Form */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-[11.5px] font-bold text-slate-800 mb-2">إضافة تخصيص لعميل جديد:</p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <select className={inputClass} value={newOverrideTenantId} onChange={(e) => setNewOverrideTenantId(e.target.value)}>
                  <option value="">اختر العميل المستهدف...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={inputClass}
                  value={newOverrideEnabled ? '1' : '0'}
                  onChange={(e) => setNewOverrideEnabled(e.target.value === '1')}
                >
                  <option value="1">تفعيل إجباري</option>
                  <option value="0">حجب إجباري</option>
                </select>
                <Button variant="primary" size="sm" onClick={addOverride} disabled={!newOverrideTenantId || !canManageProduct}>
                  إضافة
                </Button>
              </div>
            </div>
          </div>

          {/* Overrides Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {featureOverrides.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-semibold">
                لا توجد تخصيصات خاصة لهذه الميزة بعد. تنطبق عليها قواعد الإتاحة العامة.
              </div>
            ) : (
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">العميل المستهدف</th>
                    <th className="px-3 py-2">الحالة المفروضة</th>
                    <th className="px-3 py-2">تاريخ التخصيص</th>
                    <th className="px-3 py-2">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {featureOverrides.map((ov) => (
                    <tr key={ov.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-bold text-slate-800">{ov.targetName || ov.targetId}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                            ov.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {ov.isEnabled ? 'مفعّل دائماً' : 'محجوب تماماً'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(ov.createdAt)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeOverride(ov.id)}
                          className="rounded px-2 py-1 text-rose-600 hover:bg-rose-50 font-semibold"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      {/* ─── Release Form Modal ─── */}
      <Modal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        title={releaseForm.id ? `تعديل إصدار v${releaseForm.version}` : 'إصدار جديد وحزمة تحديث'}
        size="lg"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReleaseOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={saveRelease} loading={saving} disabled={!canManageProduct}>
              حفظ الإصدار
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="رقم الإصدار" required hint="مثال: 2.5.0">
            <input dir="ltr" className={inputClass} value={releaseForm.version} onChange={(e) => setReleaseForm({ ...releaseForm, version: e.target.value })} />
          </Field>
          <Field label="القناة (Channel)">
            <select className={inputClass} value={releaseForm.channel} onChange={(e) => setReleaseForm({ ...releaseForm, channel: e.target.value as PlatformRelease['channel'] })}>
              {Object.entries(CHANNEL_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الحالة (Status)">
            <select className={inputClass} value={releaseForm.status} onChange={(e) => setReleaseForm({ ...releaseForm, status: e.target.value })}>
              {Object.entries(RELEASE_STATUS_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}
                </option>
              ))}
            </select>
          </Field>

          <Field label="النسخة الدنيا المطلوبة (Min Version)" hint="تمنع التخطي إذا كانت النسخة أقدم">
            <input dir="ltr" placeholder="مثال: 2.0.0" className={inputClass} value={releaseForm.minVersion} onChange={(e) => setReleaseForm({ ...releaseForm, minVersion: e.target.value })} />
          </Field>
          <Field label="بيئة النشر (Staging Group)">
            <select className={inputClass} value={releaseForm.stagingGroup} onChange={(e) => setReleaseForm({ ...releaseForm, stagingGroup: e.target.value })}>
              <option value="PRODUCTION">الإنتاج الكامل (Production)</option>
              <option value="CANARY">إطلاق تدريجي (Canary 10%)</option>
              <option value="BETA_TESTERS">مختبرو بيتا (Beta Testers)</option>
              <option value="INTERNAL">فريق العمل الداخلي (Internal)</option>
            </select>
          </Field>
          <Field label="تاريخ الإصدار">
            <input type="date" className={inputClass} value={releaseForm.releasedAt} onChange={(e) => setReleaseForm({ ...releaseForm, releasedAt: e.target.value })} />
          </Field>

          {/* Package details */}
          <div className="sm:col-span-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3">
            <p className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
              <FileCheck className="h-4 w-4 text-sky-600" /> بيانات ملف التثبيت والتوقيع والـ Checksum
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="رابط تحميل الحزمة (URL)">
                <input dir="ltr" placeholder="https://releases.ceramisys.com/v2.5.0.exe" className={inputClass} value={releaseForm.fileUrl} onChange={(e) => setReleaseForm({ ...releaseForm, fileUrl: e.target.value })} />
              </Field>
              <Field label="اسم الملف (File Name)">
                <input dir="ltr" placeholder="Ceramisys-Setup-2.5.0.exe" className={inputClass} value={releaseForm.fileName} onChange={(e) => setReleaseForm({ ...releaseForm, fileName: e.target.value })} />
              </Field>
              <Field label="بصمة التجزئة SHA-256 Checksum" hint="للتحقق من سلامة الملف عند التنزيل">
                <input dir="ltr" placeholder="e.g. 5d41402abc4b2a76b9719d911017c592..." className={inputClass} value={releaseForm.checksumSha256} onChange={(e) => setReleaseForm({ ...releaseForm, checksumSha256: e.target.value })} />
              </Field>
              <Field label="التوقيع الرقمي للحزمة (Digital Signature)">
                <input dir="ltr" placeholder="ceramisys-signed-pkg-..." className={inputClass} value={releaseForm.packageSignature} onChange={(e) => setReleaseForm({ ...releaseForm, packageSignature: e.target.value })} />
              </Field>
              <Field label="حجم الملف بالبايت (Size in Bytes)">
                <input type="number" dir="ltr" placeholder="e.g. 85000000" className={inputClass} value={releaseForm.fileSize} onChange={(e) => setReleaseForm({ ...releaseForm, fileSize: e.target.value })} />
              </Field>
              <Field label="إصدار التراجع الآمن في الطوارئ (Rollback Target)">
                <input dir="ltr" placeholder="مثال: 2.4.9" className={inputClass} value={releaseForm.rollbackVersion} onChange={(e) => setReleaseForm({ ...releaseForm, rollbackVersion: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="sm:col-span-3 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 bg-white">
            <div>
              <p className="text-[12px] font-bold text-slate-800">تحديث إلزامي (Mandatory Enforcement)</p>
              <p className="text-[10px] text-slate-500">منع متابعة العمل على النسخ السابقة حتى إتمام ترقية العميل.</p>
            </div>
            <Toggle checked={releaseForm.isMandatory} onChange={(val) => setReleaseForm({ ...releaseForm, isMandatory: val })} label="إلزامي" />
          </div>

          <Field label="سجل التغييرات الكامل (Changelog)" className="sm:col-span-3">
            <textarea rows={3} placeholder="ما الجديد في هذا الإصدار..." className={inputClass} value={releaseForm.changelog} onChange={(e) => setReleaseForm({ ...releaseForm, changelog: e.target.value })} />
          </Field>
          <Field label="ملاحظات داخلية" className="sm:col-span-3">
            <textarea rows={2} className={inputClass} value={releaseForm.notes} onChange={(e) => setReleaseForm({ ...releaseForm, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* ─── Release Targets & Tracking Modal ─── */}
      <Modal
        open={Boolean(selectedReleaseForTargets)}
        onClose={() => setSelectedReleaseForTargets(null)}
        title={`استهداف ومتابعة تحديث الإصدار v${selectedReleaseForTargets?.version ?? ''}`}
        size="lg"
        busy={saving}
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[11px] font-semibold text-slate-500">
              تم تحديد {selectedTenantIdsForRelease.length} من أصل {tenants.length} عميل.
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelectedReleaseForTargets(null)} disabled={saving}>
                إغلاق
              </Button>
              <Button variant="primary" onClick={saveTargets} loading={saving} disabled={!canManageProduct}>
                حفظ المستهدفين
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                className={`${inputClass} pr-8 text-xs`}
                placeholder="بحث عن عميل..."
                value={targetSearchTerm}
                onChange={(e) => setTargetSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTenantIdsForRelease(tenants.map((t) => t.id))}
                className="rounded bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedTenantIdsForRelease([])}
                className="rounded bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
            {tenants
              .filter(
                (t) =>
                  !targetSearchTerm ||
                  t.name.toLowerCase().includes(targetSearchTerm.toLowerCase()) ||
                  t.code.toLowerCase().includes(targetSearchTerm.toLowerCase())
              )
              .map((tenant) => {
                const isSelected = selectedTenantIdsForRelease.includes(tenant.id);
                const targetRecord = releaseTargets.find((r) => r.tenantId === tenant.id);
                const statusMeta = targetRecord ? TARGET_STATUS_LABELS[targetRecord.status] : null;

                return (
                  <div
                    key={tenant.id}
                    className={`flex items-center justify-between p-3 transition ${
                      isSelected ? 'bg-sky-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTenantIdsForRelease([...selectedTenantIdsForRelease, tenant.id]);
                          } else {
                            setSelectedTenantIdsForRelease(selectedTenantIdsForRelease.filter((id) => id !== tenant.id));
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="text-[12px] font-bold text-slate-800">{tenant.name}</p>
                        <p className="font-mono text-[9.5px] text-slate-400" dir="ltr">
                          {tenant.code} — {tenant.businessType || 'عام'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {targetRecord && statusMeta ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${statusMeta.color}`}
                          >
                            <statusMeta.icon className="h-3 w-3" />
                            {statusMeta.label}
                          </span>
                          {targetRecord.error && (
                            <span className="text-[9.5px] text-rose-600 max-w-[150px] truncate" title={targetRecord.error}>
                              {targetRecord.error}
                            </span>
                          )}
                          <select
                            className="rounded border border-slate-200 text-[10px] p-1 bg-white"
                            value={targetRecord.status}
                            onChange={(e) => markTargetStatus(targetRecord.id, e.target.value as PlatformReleaseTarget['status'])}
                          >
                            <option value="PENDING">قيد الانتظار</option>
                            <option value="SUCCESS">نجح التحديث</option>
                            <option value="FAILED">فشل</option>
                            <option value="SKIPPED">تخطي</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">غير مدرج بالتحديث</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Modal>

      {/* ─── Rollback Modal ─── */}
      <Modal
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        title="تراجع طارئ عن الإصدار (Emergency Rollback)"
        size="md"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRollbackOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={confirmRollback} loading={saving} disabled={!canManageProduct}>
              تأكيد التراجع الآن
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="text-[11.5px] leading-relaxed">
              <p className="font-bold">تحذير أمان عالي:</p>
              سيؤدي هذا الإجراء إلى إيقاف الإصدار <span className="font-mono font-bold">v{rollbackReleaseItem?.version}</span> فوراً
              وتحويل حالته إلى متوقف (DEPRECATED)، وتوجيه أجهزة العملاء المستهدفة للرجوع للنسخة الآمنة.
            </div>
          </div>

          <Field label="رقم الإصدار الآمن المراد الرجوع إليه" required>
            <input
              dir="ltr"
              placeholder="مثال: 2.4.9"
              className={inputClass}
              value={safeRollbackVersion}
              onChange={(e) => setSafeRollbackVersion(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

export default PlatformProductPage;
