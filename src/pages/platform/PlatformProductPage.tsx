import React from 'react';
import { Boxes, Plus } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformFeatureFlag,
  PlatformFeatureOverride,
  PlatformModule,
  PlatformPlan,
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import {
  TABS,
  emptyFeature,
  emptyRelease,
  type TabId,
  type FeatureFormState,
  type ReleaseFormState,
} from './PlatformProductPage/constants';
import { ModulesTab } from './PlatformProductPage/ModulesTab';
import { PlanMatrixTab } from './PlatformProductPage/PlanMatrixTab';
import { FeaturesTab } from './PlatformProductPage/FeaturesTab';
import { ReleasesTab } from './PlatformProductPage/ReleasesTab';
import { FeatureModal } from './PlatformProductPage/FeatureModal';
import { FeatureOverridesModal } from './PlatformProductPage/FeatureOverridesModal';
import { ReleaseModal } from './PlatformProductPage/ReleaseModal';
import { ReleaseTargetsModal } from './PlatformProductPage/ReleaseTargetsModal';
import { RollbackModal } from './PlatformProductPage/RollbackModal';

// ─── Central row → local model mappers ──────────────────────────────────────
// Central endpoints return raw snake_case DB rows; the UI works with the local
// camelCase models, so map explicitly instead of `as any`.

interface CentralModuleRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  is_active?: number | boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

interface CentralFeatureFlagRow {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  is_enabled?: number | boolean;
  rollout_percentage?: number;
  target_tenants?: string | Array<string> | null;
  page_paths?: string | Array<string> | null;
  created_at?: string;
  updated_at?: string;
}

interface CentralReleaseRow {
  id: string;
  version: string;
  channel: string;
  status: string;
  rolloutStrategy?: string;
  rolloutPercent?: number;
  targetTenantIds?: string[];
  downloadUrl?: string | null;
  checksum?: string | null;
  releaseNotes?: string | null;
  minRequiredVersion?: string | null;
  isMandatory?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const parseJsonArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapCentralModule = (r: CentralModuleRow): PlatformModule => {
  const active = Boolean(r.is_active);
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    isEnabled: active,
    minPlanCode: null,
    sortOrder: Number(r.sort_order ?? 0) || 0,
    isActive: active,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
};

const mapCentralFeatureFlag = (r: CentralFeatureFlagRow): PlatformFeatureFlag => ({
  id: r.id,
  code: r.key,
  name: r.name,
  description: r.description ?? null,
  category: null,
  isEnabled: Boolean(r.is_enabled),
  rolloutPercent: Number(r.rollout_percentage ?? 0) || 0,
  isStagingOnly: false,
  minPlanTier: null,
  pagePaths: parseJsonArray(r.page_paths),
  overridesCount: 0,
  createdAt: String(r.created_at ?? ''),
  updatedAt: String(r.updated_at ?? ''),
});

const mapCentralReleaseRow = (r: CentralReleaseRow): PlatformRelease & { _central?: CentralReleaseRow } => {
  const targets = Array.isArray(r.targetTenantIds) ? r.targetTenantIds : [];
  return {
    id: r.id,
    version: r.version,
    channel: (['STABLE', 'BETA', 'ALPHA', 'HOTFIX'].includes(r.channel) ? r.channel : 'STABLE') as PlatformRelease['channel'],
    status: (r.status === 'PUBLISHED' ? 'PUBLISHED' : r.status === 'DRAFT' ? 'DRAFT' : 'DEPRECATED') as PlatformRelease['status'],
    isMandatory: Boolean(r.isMandatory),
    minVersion: r.minRequiredVersion || '',
    rolloutGroup: targets.length ? `TARGETED ${targets.length}` : r.rolloutStrategy === 'PHASED' ? `PHASED ${r.rolloutPercent ?? 0}%` : 'ALL',
    notes: r.releaseNotes || '',
    fileUrl: r.downloadUrl || '',
    fileName: '',
    checksumSha256: r.checksum || '',
    changelog: r.releaseNotes || '',
    createdAt: r.publishedAt || r.createdAt || '',
    updatedAt: r.updatedAt || '',
    _central: r,
  };
};

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const PlatformProductPage: React.FC = () => {
  const toast = useToast();
  const canManageProduct = canPlatform('product', 'platform.product.update');
  // Reactive central-source flag (polled — lives in platform settings).
  const [centralActive, setCentralActive] = React.useState<boolean>(() => getCentralDataSourceState().active);
  React.useEffect(() => {
    const refresh = () => setCentralActive(getCentralDataSourceState().active);
    refresh();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const [tab, setTab] = React.useState<TabId>('matrix');
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [features, setFeatures] = React.useState<PlatformFeatureFlag[]>([]);
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [releases, setReleases] = React.useState<PlatformRelease[]>([]);
  const [tenants, setTenants] = React.useState<PlatformTenant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Feature Modals & State
  const [featureOpen, setFeatureOpen] = React.useState(false);
  const [featureForm, setFeatureForm] = React.useState<FeatureFormState>(emptyFeature);
  const [selectedFeatureForOverrides, setSelectedFeatureForOverrides] = React.useState<PlatformFeatureFlag | null>(null);
  const [featureOverrides, setFeatureOverrides] = React.useState<PlatformFeatureOverride[]>([]);
  const [newOverrideTenantId, setNewOverrideTenantId] = React.useState('');
  const [newOverrideEnabled, setNewOverrideEnabled] = React.useState(true);

  // Release Modals & State
  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [releaseForm, setReleaseForm] = React.useState<ReleaseFormState>(emptyRelease);
  const [selectedReleaseForTargets, setSelectedReleaseForTargets] = React.useState<PlatformRelease | null>(null);
  const [releaseTargets, setReleaseTargets] = React.useState<PlatformReleaseTarget[]>([]);
  const [targetSearchTerm, setTargetSearchTerm] = React.useState('');
  const [selectedTenantIdsForRelease, setSelectedTenantIdsForRelease] = React.useState<string[]>([]);

  // Rollback Modal State
  const [rollbackOpen, setRollbackOpen] = React.useState(false);
  const [rollbackReleaseItem, setRollbackReleaseItem] = React.useState<PlatformRelease | null>(null);
  const [safeRollbackVersion, setSafeRollbackVersion] = React.useState('');

  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (centralActive) {
        const [releases, tenants, modules, features, plans] = await Promise.all([
          centralPlatformClient.listReleases(),
          centralPlatformClient.listTenants(),
          centralPlatformClient.listModules(),
          centralPlatformClient.listFeatureFlags(),
          centralPlatformClient.listPlans().catch(() => [] as PlatformPlan[]),
        ]);
        setReleases((releases as CentralReleaseRow[]).map(mapCentralReleaseRow));
        setTenants(tenants);
        setModules((modules as CentralModuleRow[]).map(mapCentralModule));
        setFeatures((features as CentralFeatureFlagRow[]).map(mapCentralFeatureFlag));
        setPlans(plans);
      } else {
        setReleases(platformAdminService.listReleases());
        setTenants(platformAdminService.listTenants());
        setModules(platformAdminService.listModules());
        setFeatures(platformAdminService.listFeatureFlags());
        setPlans(platformAdminService.listPlans());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنتج.');
    } finally {
      setLoading(false);
    }
  }, [centralActive]);

  React.useEffect(() => {
    load();
  }, [load]);

  // ─── Plan × Catalog matrix ─────────────────────────────────────────────

  const togglePlanCatalogItem = (plan: PlatformPlan, section: 'modules' | 'features', code: string, checked: boolean) => {
    if (centralActive) {
      toast.error('غير مدعوم', 'تعديل خطط الاشتراك غير متاح في الوضع المركزي بعد.');
      return;
    }
    try {
      if (section === 'modules') {
        const current = plan.includedModules ?? [];
        platformAdminService.updatePlan(plan.id, {
          name: plan.name,
          code: plan.code,
          includedModules: checked ? [...current, code] : current.filter((item) => item !== code),
        });
      } else {
        const current = plan.features ?? [];
        platformAdminService.updatePlan(plan.id, {
          name: plan.name,
          code: plan.code,
          features: checked ? [...current, code] : current.filter((item) => item !== code),
        });
      }
      toast.success(checked ? 'أُضيف العنصر للباقة' : 'أُزيل العنصر من الباقة', `${code} — ${plan.name}`);
      setPlans(platformAdminService.listPlans());
    } catch (err) {
      toast.error('تعذر تحديث الباقة', err instanceof Error ? err.message : undefined);
    }
  };

  const toggleModule = (module: PlatformModule) => {
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    if (centralActive) {
      centralPlatformClient.updateModule(module.id, { isActive: !module.isEnabled })
        .then(() => { toast.success(module.isEnabled ? 'تم تعطيل الوحدة' : 'تم تفعيل الوحدة'); load(); })
        .catch((err) => toast.error('تعذر تحديث الوحدة', err instanceof Error ? err.message : undefined));
      return;
    }
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
            pagePathsText: (flag.pagePaths ?? []).join('\n'),
          }
        : { ...emptyFeature }
    );
    setFeatureOpen(true);
  };

  const saveFeature = () => {
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    if (!featureForm.name.trim() || !featureForm.code.trim()) {
      toast.warning('اسم الميزة ورمزها مطلوبان.');
      return;
    }
    setSaving(true);
    if (centralActive) {
      // Central flag API supports: key/name/description/isEnabled/
      // rolloutPercentage/targetTenants/pagePaths — category, minPlanTier and
      // isStagingOnly have no central equivalent and are disabled in the modal.
      const payload = {
        key: featureForm.code.trim(),
        name: featureForm.name.trim(),
        description: featureForm.description || undefined,
        isEnabled: Boolean(featureForm.isEnabled),
        rolloutPercentage: Math.min(100, Math.max(0, Number(featureForm.rolloutPercent) || 0)),
        pagePaths: featureForm.pagePathsText.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean),
      };
      const request = featureForm.id
        ? centralPlatformClient.updateFeatureFlag(featureForm.id, payload)
        : centralPlatformClient.createFeatureFlag(payload);
      Promise.resolve(request)
        .then(() => { toast.success(featureForm.id ? 'تم تحديث الميزة' : 'تم إنشاء الميزة'); setFeatureOpen(false); load(); })
        .catch((err) => toast.error('تعذر حفظ الميزة', err instanceof Error ? err.message : undefined))
        .finally(() => setSaving(false));
      return;
    }
    try {
      platformAdminService.upsertFeatureFlag({
        ...featureForm,
        rolloutPercent: Number(featureForm.rolloutPercent),
        minPlanTier: featureForm.minPlanTier || undefined,
        pagePaths: featureForm.pagePathsText
          .split(/[\n,]+/)
          .map((p) => p.trim())
          .filter(Boolean),
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
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    if (centralActive) {
      centralPlatformClient.updateFeatureFlag(flag.id, { isEnabled: !flag.isEnabled })
        .then(() => { toast.success(flag.isEnabled ? 'تم تعطيل الميزة' : 'تم تفعيل الميزة'); load(); })
        .catch((err) => toast.error('تعذر تحديث الميزة', err instanceof Error ? err.message : undefined));
      return;
    }
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
    if (centralActive) {
      // No central per-tenant feature-override endpoints exist.
      setFeatureOverrides([]);
      setNewOverrideTenantId('');
      setNewOverrideEnabled(true);
      return;
    }
    try {
      const ovs = platformAdminService.listFeatureOverrides(flag.id);
      setFeatureOverrides(ovs);
      setNewOverrideTenantId('');
      setNewOverrideEnabled(true);
    } catch (err) {
      toast.error('تعذر تحميل تخصيصات الميزة', err instanceof Error ? err.message : undefined);
    }
  };

  const addOverride = () => {
    if (centralActive) {
      toast.error('غير مدعوم', 'التخصيص لكل عميل غير متاح في الوضع المركزي بعد.');
      return;
    }
    if (!selectedFeatureForOverrides || !newOverrideTenantId) return;
    try {
      platformAdminService.setFeatureOverride({
        featureId: selectedFeatureForOverrides.id,
        targetType: 'TENANT',
        targetId: newOverrideTenantId,
        isEnabled: newOverrideEnabled,
        customRolloutPercent: null,
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
    if (centralActive) {
      toast.error('غير مدعوم', 'التخصيص لكل عميل غير متاح في الوضع المركزي بعد.');
      return;
    }
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
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    if (!releaseForm.version.trim() || !SEMVER_RE.test(releaseForm.version.trim())) {
      toast.error('صيغة رقم الإصدار غير صحيحة — استخدم SemVer مثل 2.5.0.');
      return;
    }
    setSaving(true);
    if (centralActive) {
      const payload = {
        version: releaseForm.version.trim(),
        channel: releaseForm.channel === 'HOTFIX' ? 'STABLE' : releaseForm.channel,
        releaseNotes: releaseForm.changelog || releaseForm.notes || '',
        downloadUrl: releaseForm.fileUrl || '',
        checksum: releaseForm.checksumSha256 || '',
        minRequiredVersion: releaseForm.minVersion || '',
        isMandatory: Boolean(releaseForm.isMandatory),
        rolloutStrategy: 'FULL',
        rolloutPercent: 100,
        targetTenantIds: [],
      };
      const request = releaseForm.id
        ? centralPlatformClient.updateRelease(releaseForm.id, payload)
        : centralPlatformClient.createRelease(payload);
      Promise.resolve(request)
        .then(() => { toast.success(releaseForm.id ? 'تم تحديث الإصدار' : 'تم إنشاء الإصدار كمسودة'); setReleaseOpen(false); load(); })
        .catch((err) => toast.error('تعذر حفظ الإصدار', err instanceof Error ? err.message : undefined))
        .finally(() => setSaving(false));
      return;
    }
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
    setTargetSearchTerm('');
    if (centralActive) {
      // Central releases carry targetTenantIds on the release row itself.
      const central = (release as PlatformRelease & { _central?: CentralReleaseRow })._central;
      setSelectedTenantIdsForRelease(Array.isArray(central?.targetTenantIds) ? central.targetTenantIds : []);
      setReleaseTargets([]);
      return;
    }
    try {
      const targets = platformAdminService.listReleaseTargets(release.id);
      setReleaseTargets(targets);
      setSelectedTenantIdsForRelease(targets.map((t) => t.tenantId));
    } catch (err) {
      toast.error('تعذر استرجاع مستهدفي الإصدار', err instanceof Error ? err.message : undefined);
    }
  };

  const saveTargets = () => {
    if (!selectedReleaseForTargets) return;
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    setSaving(true);
    if (centralActive) {
      centralPlatformClient.updateRelease(selectedReleaseForTargets.id, {
        targetTenantIds: selectedTenantIdsForRelease,
        rolloutStrategy: selectedTenantIdsForRelease.length ? 'PHASED' : 'FULL',
        rolloutPercent: 100,
      })
        .then(() => { toast.success(`تم إسناد الإصدار إلى ${selectedTenantIdsForRelease.length} عميل.`); setSelectedReleaseForTargets(null); load(); })
        .catch((err) => toast.error('تعذر تحديث مستهدفي الإصدار', err instanceof Error ? err.message : undefined))
        .finally(() => setSaving(false));
      return;
    }
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
    if (centralActive) {
      // Per-target rollout status tracking has no central endpoint.
      toast.error('غير مدعوم', 'متابعة حالة كل عميل على حدة غير متاحة في الوضع المركزي بعد.');
      return;
    }
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
    if (!rollbackReleaseItem) return;
    if (!canManageProduct) {
      toast.warning('لا تملك صلاحية إدارة المنتج.');
      return;
    }
    if (!safeRollbackVersion.trim() || !SEMVER_RE.test(safeRollbackVersion.trim())) {
      toast.error('صيغة رقم الإصدار الآمن غير صحيحة — استخدم SemVer مثل 2.4.9.');
      return;
    }
    setSaving(true);
    if (centralActive) {
      // Central rollback reverts the release to its previous published state;
      // the safe-version input is informational only (no central param exists).
      centralPlatformClient.rollbackRelease(rollbackReleaseItem.id)
        .then(() => { toast.success(`تم التراجع عن الإصدار v${rollbackReleaseItem.version}`); setRollbackOpen(false); load(); })
        .catch((err) => toast.error('تعذر التراجع عن الإصدار', err instanceof Error ? err.message : undefined))
        .finally(() => setSaving(false));
      return;
    }
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

      <div className="inline-flex rounded-lg bg-surface-sunken p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition ${
                tab === item.id ? 'bg-surface text-ink shadow' : 'text-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface py-16 text-center text-sm font-semibold text-muted shadow-sm">
          جارٍ تحميل بيانات المنتج...
        </div>
      ) : tab === 'matrix' ? (
        <PlanMatrixTab
          plans={plans}
          modules={modules}
          features={features}
          centralActive={centralActive}
          canManageProduct={canManageProduct}
          saving={saving}
          onToggle={togglePlanCatalogItem}
        />
      ) : tab === 'modules' ? (
        <ModulesTab modules={modules} canManageProduct={canManageProduct} onToggleModule={toggleModule} />
      ) : tab === 'features' ? (
        <FeaturesTab
          features={features}
          canManageProduct={canManageProduct}
          onToggleFeature={toggleFeature}
          onOpenFeature={openFeature}
          onOpenOverrides={openOverridesModal}
        />
      ) : (
        <ReleasesTab
          releases={releases}
          onOpenTargets={openTargetsModal}
          onOpenRollback={openRollbackModal}
          onOpenRelease={openRelease}
        />
      )}

      {/* ─── Feature Modal ─── */}
      <FeatureModal
        open={featureOpen}
        onClose={() => setFeatureOpen(false)}
        form={featureForm}
        setForm={setFeatureForm}
        saving={saving}
        canManageProduct={canManageProduct}
        centralActive={centralActive}
        onSave={saveFeature}
      />

      {/* ─── Feature Overrides Modal (Tenant-specific Feature Flags) ─── */}
      <FeatureOverridesModal
        feature={selectedFeatureForOverrides}
        onClose={() => setSelectedFeatureForOverrides(null)}
        tenants={tenants}
        overrides={featureOverrides}
        newOverrideTenantId={newOverrideTenantId}
        setNewOverrideTenantId={setNewOverrideTenantId}
        newOverrideEnabled={newOverrideEnabled}
        setNewOverrideEnabled={setNewOverrideEnabled}
        canManageProduct={canManageProduct}
        centralActive={centralActive}
        onAddOverride={addOverride}
        onRemoveOverride={removeOverride}
      />

      {/* ─── Release Form Modal ─── */}
      <ReleaseModal
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        form={releaseForm}
        setForm={setReleaseForm}
        saving={saving}
        canManageProduct={canManageProduct}
        centralActive={centralActive}
        onSave={saveRelease}
      />

      {/* ─── Release Targets & Tracking Modal ─── */}
      <ReleaseTargetsModal
        release={selectedReleaseForTargets}
        onClose={() => setSelectedReleaseForTargets(null)}
        tenants={tenants}
        releaseTargets={releaseTargets}
        selectedTenantIds={selectedTenantIdsForRelease}
        setSelectedTenantIds={setSelectedTenantIdsForRelease}
        targetSearchTerm={targetSearchTerm}
        setTargetSearchTerm={setTargetSearchTerm}
        saving={saving}
        canManageProduct={canManageProduct}
        onSaveTargets={saveTargets}
        onMarkTargetStatus={centralActive ? undefined : markTargetStatus}
      />

      {/* ─── Rollback Modal ─── */}
      <RollbackModal
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        release={rollbackReleaseItem}
        safeRollbackVersion={safeRollbackVersion}
        setSafeRollbackVersion={setSafeRollbackVersion}
        saving={saving}
        canManageProduct={canManageProduct}
        onConfirm={confirmRollback}
      />
    </div>
  );
};

export default PlatformProductPage;
