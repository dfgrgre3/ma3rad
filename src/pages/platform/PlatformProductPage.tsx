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
  PlatformRelease,
  PlatformReleaseTarget,
  PlatformTenant,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  TABS,
  emptyFeature,
  emptyRelease,
  type TabId,
  type FeatureFormState,
  type ReleaseFormState,
} from './PlatformProductPage/constants';
import { ModulesTab } from './PlatformProductPage/ModulesTab';
import { FeaturesTab } from './PlatformProductPage/FeaturesTab';
import { ReleasesTab } from './PlatformProductPage/ReleasesTab';
import { FeatureModal } from './PlatformProductPage/FeatureModal';
import { FeatureOverridesModal } from './PlatformProductPage/FeatureOverridesModal';
import { ReleaseModal } from './PlatformProductPage/ReleaseModal';
import { ReleaseTargetsModal } from './PlatformProductPage/ReleaseTargetsModal';
import { RollbackModal } from './PlatformProductPage/RollbackModal';

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
  const [featureForm, setFeatureForm] = React.useState<FeatureFormState>(emptyFeature);
  const [selectedFeatureForOverrides, setSelectedFeatureForOverrides] = React.useState<PlatformFeatureFlag | null>(null);
  const [featureOverrides, setFeatureOverrides] = React.useState<PlatformFeatureOverride[]>([]);
  const [newOverrideTenantId, setNewOverrideTenantId] = React.useState('');
  const [newOverrideEnabled, setNewOverrideEnabled] = React.useState(true);
  const [newOverrideCustomRollout, setNewOverrideCustomRollout] = React.useState<number | ''>('');

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
      const centralState = getCentralDataSourceState();
      if (centralState.active) {
        const [releases, tenants, modules, features] = await Promise.all([
          centralPlatformClient.listReleases(),
          centralPlatformClient.listTenants(),
          centralPlatformClient.listModules(),
          centralPlatformClient.listFeatureFlags(),
        ]);
        setReleases(releases);
        setTenants(tenants);
        setModules(modules as any);
        setFeatures(features as any);
      } else {
        setReleases(platformAdminService.listReleases());
        setTenants(platformAdminService.listTenants());
        setModules(platformAdminService.listModules());
        setFeatures(platformAdminService.listFeatureFlags());
      }
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
        onMarkTargetStatus={markTargetStatus}
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
