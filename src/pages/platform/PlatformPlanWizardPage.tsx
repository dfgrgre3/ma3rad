import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers3,
  LayoutGrid,
  MonitorSmartphone,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type { PlatformPlanInput } from '../../services/domains/platform/platformTypes';

import { PLATFORM_MODULE_TO_REGISTRY_IDS } from '../../config/platformModuleMap';
import { listTenantPageGroups, listTenantPages, type TenantPage, type TenantPageGroup } from '../../config/tenantPageCatalog';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, Field, StatusBadge, Toggle, formatMoney, inputClass } from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';
import {
  emptyFeatureForm,
  normalizeFeature,
  normalizeModule,
  normalizePlan,
  numericInput,
  type CatalogFeature,
  type CatalogModule,
  type CatalogPlan,
  type FeatureFormState,
} from './PlatformPlanWizardPage/shared';
import {
  expandPermissionCodes,
  featureHiddenPathsForPlan,
  permissionsForPagePath,
} from './components/access/pageAccessRules';
import {
  emptyFeatureConfigDraft,
  featureConfigSignature,
  serializeFeatureConfig,
  splitFeatureConfig,
  type TenantFeatureConfigDraft,
} from './components/access/featureConfigDraft';
import { PlanDetailsModal } from './PlatformPlanWizardPage/PlanDetailsModal';
import { PagePermissionsModal, type PagePermissionDraft } from './components/access/PagePermissionsModal';
import { PlanPreviewPanel } from './PlatformPlanWizardPage/PlanPreviewPanel';
import { CopyFromPlanModal } from './PlatformPlanWizardPage/CopyFromPlanModal';

// ─── Step indicator ────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { key: 'plan', label: 'الخطة', icon: <Layers3 className="h-4 w-4" /> },
  { key: 'modules', label: 'الوحدات والصفحات', icon: <LayoutGrid className="h-4 w-4" /> },
  { key: 'features', label: 'المميزات', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'pages', label: 'إظهار وإخفاء الصفحات', icon: <MonitorSmartphone className="h-4 w-4" /> },
  { key: 'review', label: 'المراجعة والتطبيق', icon: <BadgeCheck className="h-4 w-4" /> },
];

const StepIndicator: React.FC<{ step: number }> = ({ step }) => (
  <div className="mb-5">
    <ol className="flex items-center gap-1 sm:gap-2">
      {WIZARD_STEPS.map((item, index) => {
        const done = index < step;
        const active = index === step;
        return (
          <React.Fragment key={item.key}>
            {index > 0 && <span className={`h-px flex-1 ${index <= step ? 'bg-success' : 'bg-surface-sunken'}`} />}
            <li className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition ${
                  done
                    ? 'border-success bg-success text-white'
                    : active
                      ? 'border-success bg-success-soft text-success'
                      : 'border-line bg-surface-muted text-muted'
                }`}
                title={item.label}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className={`hidden text-[11px] font-semibold lg:inline ${active ? 'text-success' : done ? 'text-ink-secondary' : 'text-muted'}`}>
                {item.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
    <div className="mt-2 flex items-center justify-between lg:hidden">
      <span className="text-[12px] font-bold text-ink">الخطوة {step + 1} من {WIZARD_STEPS.length}</span>
      <span className="text-[11px] font-semibold text-success">{WIZARD_STEPS[step].label}</span>
    </div>
  </div>
);

// ─── Page picker modal ────────────────────────────────────────────────────────

interface PagePickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

const PagePickerModal: React.FC<PagePickerModalProps> = ({ open, onClose, title, selected, onChange }) => {
  const [search, setSearch] = React.useState('');
  const groups = React.useMemo(() => listTenantPageGroups(), []);
  const term = search.trim().toLowerCase();

  const filteredGroups = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          pages: group.pages.filter(
            (page) => !term || page.label.toLowerCase().includes(term) || page.path.toLowerCase().includes(term)
          ),
        }))
        .filter((group) => group.pages.length > 0),
    [groups, term]
  );

  const toggle = (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange(next);
  };

  const toggleGroup = (group: TenantPageGroup) => {
    const next = new Set(selected);
    const allSelected = group.pages.every((page) => next.has(page.path));
    for (const page of group.pages) {
      if (allSelected) next.delete(page.path);
      else next.add(page.path);
    }
    onChange(next);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description="اختر صفحات موقع المستخدمين التي تملكها هذه الميزة — تُخفى عن الباقات التي لا تشملها." size="xl">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            className={`${inputClass} pr-9`}
            placeholder="ابحث عن صفحة بالاسم أو المسار..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-bold text-success">
          {selected.size} صفحة مختارة
        </span>
      </div>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pl-1">
        {filteredGroups.length === 0 && (
          <EmptyState icon={<MonitorSmartphone className="h-5 w-5" />} title="لا توجد صفحات مطابقة" />
        )}
        {filteredGroups.map((group) => {
          const selectedInGroup = group.pages.filter((page) => selected.has(page.path)).length;
          return (
            <div key={group.id} className="rounded-xl border border-line">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-2 text-right"
              >
                <span className="text-[12px] font-black text-ink">
                  {group.label}
                  <span className="mr-2 text-[10px] font-semibold text-muted">
                    {selectedInGroup}/{group.pages.length}
                  </span>
                </span>
                <span className="text-[10px] font-bold text-success">{selectedInGroup === group.pages.length ? 'إلغاء الكل' : 'تحديد الكل'}</span>
              </button>
              <div className="grid gap-1 p-2 sm:grid-cols-2">
                {group.pages.map((page) => (
                  <label
                    key={page.path}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                      selected.has(page.path) ? 'border-success-border bg-success-soft/50' : 'border-line hover:bg-surface-muted'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold text-ink">{page.label}</span>
                      <span className="block truncate font-mono text-[9.5px] text-muted" dir="ltr">{page.path}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={selected.has(page.path)}
                      onChange={() => toggle(page.path)}
                      className="h-3.5 w-3.5 shrink-0 accent-success"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2">
        <p className="text-[10.5px] text-muted">يمكنك إسناد نفس الصفحة لأكثر من ميزة — الإخفاء يجري إذا لم تكن أي ميزة مالكة مفعّلة.</p>
        <Button variant="primary" size="sm" onClick={onClose}>تم</Button>
      </div>
    </Modal>
  );
};

// ─── Main wizard page ─────────────────────────────────────────────────────────

export const PlatformPlanWizardPage: React.FC = () => {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const canManage = canPlatform('product', 'platform.product.update') || canPlatform('plans');
  const canManagePlans = canPlatform('plans');

  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [centralActive, setCentralActive] = React.useState(false);

  const [plans, setPlans] = React.useState<CatalogPlan[]>([]);
  const [modules, setModules] = React.useState<CatalogModule[]>([]);
  const [features, setFeatures] = React.useState<CatalogFeature[]>([]);
  const [pageGroups, setPageGroups] = React.useState<TenantPageGroup[]>([]);

  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const [moduleDraft, setModuleDraft] = React.useState<Set<string>>(new Set());
  const [featureDraft, setFeatureDraft] = React.useState<Set<string>>(new Set());
  const [featureConfig, setFeatureConfig] = React.useState<TenantFeatureConfigDraft>(emptyFeatureConfigDraft);
  const [draftLoaded, setDraftLoaded] = React.useState(false);
  // Serialized snapshot of the last loaded/applied page config — drives the
  // "unapplied changes" badge for page-permission edits.
  const featureConfigBaselineRef = React.useRef<string>('');

  // Plan details modal (create + edit)
  const [planFormOpen, setPlanFormOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<CatalogPlan | null>(null);
  const [planSaving, setPlanSaving] = React.useState(false);

  // Feature modal / picker / delete
  const [featureFormOpen, setFeatureFormOpen] = React.useState(false);
  const [featureForm, setFeatureForm] = React.useState<FeatureFormState>(emptyFeatureForm);
  const [pagePickerOpen, setPagePickerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogFeature | null>(null);
  const [featureSaving, setFeatureSaving] = React.useState(false);
  const [featureSearch, setFeatureSearch] = React.useState('');

  // Copy-from-plan modal
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  // Per-page permissions modal
  const [pagePermTarget, setPagePermTarget] = React.useState<TenantPage | null>(null);

  // Memoized so the modal's seed effect does not reset in-progress edits on
  // every parent re-render.
  const pagePermInitialDisabled = React.useMemo(
    () =>
      pagePermTarget
        ? permissionsForPagePath(pagePermTarget.path)
            .filter((perm) => expandPermissionCodes(perm.code).some((code) => featureConfig.disabledPermissions.has(code)))
            .map((perm) => perm.code)
        : [],
    [pagePermTarget, featureConfig.disabledPermissions]
  );

  const selectedPlan = React.useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const allPages = React.useMemo(() => listTenantPages(), []);
  const catalogPaths = React.useMemo(() => new Set(allPages.map((page) => page.path)), [allPages]);

  // Pages owned by each platform module code (via the platform→registry map).
  const pagesByModuleCode = React.useMemo(() => {
    const map = new Map<string, TenantPage[]>();
    for (const [code, registryIds] of Object.entries(PLATFORM_MODULE_TO_REGISTRY_IDS)) {
      const ownerIds = new Set(registryIds);
      map.set(code, allPages.filter((page) => page.moduleId !== null && ownerIds.has(page.moduleId)));
    }
    return map;
  }, [allPages]);

  // registry module id → platform module codes that own it (inverted map, for preview).
  const registryToPlatformCodes = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [code, registryIds] of Object.entries(PLATFORM_MODULE_TO_REGISTRY_IDS)) {
      for (const registryId of registryIds) {
        const list = map.get(registryId) ?? [];
        list.push(code);
        map.set(registryId, list);
      }
    }
    return map;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      const central = centralState.active;
      setCentralActive(central);
      if (central) {
        // Let failures surface in the error state — an empty catalog is not a
        // successful load.
        const [pl, md, fl] = await Promise.all([
          centralPlatformClient.listPlans(),
          centralPlatformClient.listModules(),
          centralPlatformClient.listFeatureFlags(),
        ]);
        setPlans((Array.isArray(pl) ? pl : []).map(normalizePlan));
        setModules((Array.isArray(md) ? md : []).map(normalizeModule));
        setFeatures((Array.isArray(fl) ? fl : []).map(normalizeFeature));
      } else {
        setPlans(platformAdminService.listPlans().map(normalizePlan));
        setModules(platformAdminService.listModules().map(normalizeModule));
        setFeatures(platformAdminService.listFeatureFlags().map(normalizeFeature));
      }
      setPageGroups(listTenantPageGroups());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الكتالوج.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // ─── Plan feature-config (hiddenMenus + featurePermissions + disabledPermissions) ───

  const loadPlanFeatureConfig = React.useCallback(
    async (planId: string): Promise<TenantFeatureConfigDraft> => {
      if (centralActive) {
        try {
          const data = await centralPlatformClient.getFeaturePermissions({ tenantId: null, planId });
          return splitFeatureConfig(data, catalogPaths);
        } catch {
          return emptyFeatureConfigDraft();
        }
      }
      try {
        const settings = platformAdminService.getSettings();
        const read = (key: string): unknown => {
          const raw = settings[key];
          if (raw == null) return undefined;
          if (typeof raw === 'string') {
            try { return JSON.parse(raw); } catch { return undefined; }
          }
          return raw;
        };
        return splitFeatureConfig(
          {
            hiddenMenus: (read(`planCatalog.hiddenPages.${planId}`) as string[] | undefined) ?? [],
            disabledPermissions: (read(`planCatalog.disabledPermissions.${planId}`) as string[] | undefined) ?? [],
            featurePermissions: (read(`planCatalog.featurePermissions.${planId}`) as Array<Record<string, unknown>> | undefined) ?? [],
          },
          catalogPaths
        );
      } catch {
        return emptyFeatureConfigDraft();
      }
    },
    [centralActive, catalogPaths]
  );

  // Guards against a slower earlier selection overwriting a newer one.
  const selectSeqRef = React.useRef(0);
  const selectPlan = React.useCallback(
    async (plan: CatalogPlan) => {
      const seq = ++selectSeqRef.current;
      setSelectedPlanId(plan.id);
      setModuleDraft(new Set(plan.includedModules));
      setFeatureDraft(new Set(plan.features));
      setDraftLoaded(false);
      const config = await loadPlanFeatureConfig(plan.id);
      if (seq !== selectSeqRef.current) return; // superseded by a newer selection
      setFeatureConfig(config);
      featureConfigBaselineRef.current = featureConfigSignature(config);
      setDraftLoaded(true);
    },
    [loadPlanFeatureConfig]
  );

  React.useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      // Deep-link support: /platform/plan-catalog?plan=<id> preselects a plan.
      const wanted = searchParams.get('plan');
      const def =
        (wanted ? plans.find((plan) => plan.id === wanted) : undefined) ??
        plans.find((plan) => plan.isDefault && plan.isActive) ??
        plans.find((plan) => plan.isActive) ??
        plans[0];
      if (def) void selectPlan(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const resetDrafts = () => {
    if (!selectedPlan) return;
    setModuleDraft(new Set(selectedPlan.includedModules));
    setFeatureDraft(new Set(selectedPlan.features));
    void loadPlanFeatureConfig(selectedPlan.id).then((config) => {
      setFeatureConfig(config);
      featureConfigBaselineRef.current = featureConfigSignature(config);
    });
  };

  // ─── Plan details (create + edit) ─────────────────────────────────────────

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanFormOpen(true);
  };

  const openEditPlan = (plan: CatalogPlan) => {
    if (!canManagePlans) {
      toast.warning('لا تملك صلاحية إدارة الخطط');
      return;
    }
    setEditingPlan(plan);
    setPlanFormOpen(true);
  };

  const savePlanDetails = async (input: PlatformPlanInput) => {
    if (!canManagePlans) {
      toast.error('لا تملك صلاحية إدارة الخطط');
      return;
    }
    const name = input.name?.trim() ?? '';
    const code = input.code?.trim() ?? '';
    if (!name || !code) {
      toast.error('اسم الخطة ورمزها مطلوبان');
      return;
    }
    if (!editingPlan && !/^[A-Z0-9_]+$/.test(code)) {
      toast.error('رمز الخطة يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و_ فقط');
      return;
    }
    setPlanSaving(true);
    try {
      const payload: PlatformPlanInput = {
        ...input,
        name,
        code,
        price: numericInput(input.price),
        monthlyPrice: input.monthlyPrice == null ? undefined : numericInput(input.monthlyPrice),
        yearlyPrice: input.yearlyPrice == null ? undefined : numericInput(input.yearlyPrice),
        trialDays: input.trialDays == null ? undefined : numericInput(input.trialDays),
        seatsLimit: numericInput(input.seatsLimit, 1),
        branchesLimit: numericInput(input.branchesLimit, 1),
        devicesLimit: numericInput(input.devicesLimit, 1),
      };
      const saved = editingPlan
        ? centralActive
          ? await centralPlatformClient.updatePlan(editingPlan.id, payload as Record<string, any>)
          : platformAdminService.updatePlan(editingPlan.id, payload)
        : centralActive
          ? await centralPlatformClient.createPlan(payload as Record<string, any>)
          : platformAdminService.createPlan(payload);
      toast.success(editingPlan ? 'تم تحديث بيانات الخطة' : 'تم إنشاء الخطة', name);
      setPlanFormOpen(false);
      setEditingPlan(null);
      await load();
      const savedPlan = normalizePlan(saved);
      if (savedPlan.id) void selectPlan(savedPlan);
    } catch (err) {
      toast.error(editingPlan ? 'تعذر تحديث الخطة' : 'تعذر إنشاء الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setPlanSaving(false);
    }
  };

  // ─── Feature flag operations ──────────────────────────────────────────────

  const openFeatureForm = (feature?: CatalogFeature) => {
    setFeatureForm(
      feature
        ? {
            id: feature.id,
            code: feature.code,
            name: feature.name,
            description: feature.description ?? '',
            category: feature.category ?? '',
            isEnabled: feature.isEnabled,
            rolloutPercent: feature.rolloutPercent,
            isStagingOnly: feature.isStagingOnly,
            minPlanTier: feature.minPlanTier ?? '',
            pagePaths: [...feature.pagePaths],
          }
        : { ...emptyFeatureForm }
    );
    setFeatureFormOpen(true);
  };

  const saveFeature = async () => {
    if (!featureForm.code.trim() || !featureForm.name.trim()) {
      toast.error('رمز الميزة واسمها مطلوبان');
      return;
    }
    setFeatureSaving(true);
    try {
      const rollout = Number(featureForm.rolloutPercent);
      const safeRollout = Number.isFinite(rollout) ? Math.min(100, Math.max(0, Math.round(rollout))) : 100;
      const payload = {
        id: featureForm.id,
        code: featureForm.code.trim(),
        name: featureForm.name.trim(),
        description: featureForm.description || undefined,
        category: featureForm.category || undefined,
        isEnabled: featureForm.isEnabled,
        rolloutPercent: safeRollout,
        isStagingOnly: featureForm.isStagingOnly,
        minPlanTier: featureForm.minPlanTier || null,
        pagePaths: featureForm.pagePaths,
      };
      if (centralActive) {
        if (featureForm.id) {
          await centralPlatformClient.updateFeatureFlag(featureForm.id, {
            name: payload.name,
            description: payload.description,
            isEnabled: payload.isEnabled,
            rolloutPercentage: payload.rolloutPercent,
            pagePaths: payload.pagePaths,
          });
        } else {
          await centralPlatformClient.createFeatureFlag({
            key: payload.code,
            name: payload.name,
            description: payload.description,
            isEnabled: payload.isEnabled,
            rolloutPercentage: payload.rolloutPercent,
            pagePaths: payload.pagePaths,
          });
        }
      } else {
        platformAdminService.upsertFeatureFlag(payload);
      }
      toast.success(featureForm.id ? 'تم تحديث الميزة' : 'تم إنشاء الميزة');
      setFeatureFormOpen(false);
      await load();
    } catch (err) {
      toast.error('تعذر حفظ الميزة', err instanceof Error ? err.message : undefined);
    } finally {
      setFeatureSaving(false);
    }
  };

  const toggleFeatureEnabled = async (feature: CatalogFeature) => {
    try {
      if (centralActive) {
        await centralPlatformClient.updateFeatureFlag(feature.id, { isEnabled: !feature.isEnabled });
      } else {
        platformAdminService.setFeatureEnabled(feature.id, !feature.isEnabled);
      }
      toast.success(feature.isEnabled ? 'تم تعطيل الميزة' : 'تم تفعيل الميزة');
      await load();
    } catch (err) {
      toast.error('تعذر تحديث الميزة', err instanceof Error ? err.message : undefined);
    }
  };

  const confirmDeleteFeature = async () => {
    if (!deleteTarget) return;
    setFeatureSaving(true);
    try {
      if (centralActive) {
        await centralPlatformClient.deleteFeatureFlag(deleteTarget.id);
      } else {
        platformAdminService.deleteFeatureFlag(deleteTarget.id);
        // Strip the deleted code from every plan's feature list, reporting any
        // plan that could not be updated instead of failing silently.
        let stripFailures = 0;
        for (const plan of plans) {
          if (plan.features.includes(deleteTarget.code)) {
            try {
              platformAdminService.updatePlan(plan.id, {
                name: plan.name,
                code: plan.code,
                features: plan.features.filter((code) => code !== deleteTarget.code),
              });
            } catch {
              stripFailures += 1;
            }
          }
        }
        if (stripFailures > 0) {
          toast.warning('حُذفت الميزة لكن تعذر تحديث بعض الخطط', `${stripFailures} خطة ما زالت تشير إليها — راجع صفحة الخطط.`);
        }
      }
      if (selectedPlanId && featureDraft.has(deleteTarget.code)) {
        setFeatureDraft((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.code);
          return next;
        });
      }
      toast.success('تم حذف الميزة', deleteTarget.name);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error('تعذر حذف الميزة', err instanceof Error ? err.message : undefined);
    } finally {
      setFeatureSaving(false);
    }
  };

  // ─── Per-page permissions draft ───────────────────────────────────────────

  const pagePermCodes = React.useCallback(
    (path: string) => new Set(permissionsForPagePath(path).map((perm) => perm.code)),
    []
  );

  const savePagePermissions = (page: TenantPage, draft: PagePermissionDraft) => {
    setFeatureConfig((current) => {
      const hiddenMenus = new Set(current.hiddenMenus);
      if (draft.hidden) hiddenMenus.add(page.path);
      else hiddenMenus.delete(page.path);

      const featurePerms = new Map(current.featurePerms);
      if (draft.featurePerm) featurePerms.set(page.path, draft.featurePerm);
      else featurePerms.delete(page.path);

      const disabledPermissions = new Set(current.disabledPermissions);
      // Clear the whole code family (canonical + legacy aliases) so re-enabling
      // a permission does not leave stale expanded codes behind.
      for (const code of pagePermCodes(page.path)) {
        for (const expanded of expandPermissionCodes(code)) disabledPermissions.delete(expanded);
      }
      for (const code of draft.disabledCodes) disabledPermissions.add(code);

      return { ...current, hiddenMenus, featurePerms, disabledPermissions };
    });
    toast.success('حُفظت صلاحيات الصفحة في المسودة', page.label);
  };

  // ─── Copy settings from another plan ──────────────────────────────────────

  const copyFromPlan = async (source: CatalogPlan) => {
    if (!selectedPlan) return;
    setCopying(true);
    try {
      setModuleDraft(new Set(source.includedModules));
      setFeatureDraft(new Set(source.features));
      const config = await loadPlanFeatureConfig(source.id);
      setFeatureConfig(config);
      setCopyOpen(false);
      toast.success('نُسخت إعدادات الباقة المصدر إلى المسودة', `${source.name} → ${selectedPlan.name} — راجع ثم اضغط «تطبيق على الباقة»`);
    } catch (err) {
      toast.error('تعذر نسخ الإعدادات', err instanceof Error ? err.message : undefined);
    } finally {
      setCopying(false);
    }
  };

  // ─── Apply (plan catalog + full feature config) ───────────────────────────

  const apply = async () => {
    if (!selectedPlan) {
      toast.error('اختر خطة أولاً');
      return;
    }
    setApplying(true);
    try {
      if (centralActive) {
        await centralPlatformClient.updatePlan(selectedPlan.id, {
          includedModules: [...moduleDraft],
          features: [...featureDraft],
        });
      } else {
        platformAdminService.updatePlan(selectedPlan.id, {
          name: selectedPlan.name,
          code: selectedPlan.code,
          includedModules: [...moduleDraft],
          features: [...featureDraft],
        });
      }

      const serialized = serializeFeatureConfig(featureConfig);
      const hiddenPaths = serialized.hiddenMenus;
      const featurePermissions = serialized.featurePermissions;
      const disabledPermissions = [
        ...new Set(serialized.disabledPermissions.flatMap(expandPermissionCodes)),
      ];

      if (centralActive) {
        // The PUT upserts only the (tenant_id NULL, plan_id) row server-side,
        // so global/tenant-scoped configs are untouched.
        await centralPlatformClient.setFeaturePermissions({
          planId: selectedPlan.id,
          hiddenMenus: hiddenPaths,
          disabledPermissions,
          featurePermissions,
        });
      } else {
        const settings = platformAdminService.getSettings();
        platformAdminService.updateSettings({
          ...settings,
          [`planCatalog.hiddenPages.${selectedPlan.id}`]: JSON.stringify(hiddenPaths),
          [`planCatalog.disabledPermissions.${selectedPlan.id}`]: JSON.stringify(disabledPermissions),
          [`planCatalog.featurePermissions.${selectedPlan.id}`]: JSON.stringify(featurePermissions),
        });
      }

      toast.success(
        'تم تطبيق إعدادات الخطة',
        `${selectedPlan.name} — ${moduleDraft.size} وحدة، ${featureDraft.size} ميزة، ${hiddenPaths.length} صفحة مخفية، ${disabledPermissions.length} صلاحية معطلة`
      );
      featureConfigBaselineRef.current = featureConfigSignature(featureConfig);
      await load();
      await selectPlan({ ...selectedPlan, includedModules: [...moduleDraft], features: [...featureDraft] });
    } catch (err) {
      toast.error('تعذر تطبيق الإعدادات', err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  // ─── Derived counts ───────────────────────────────────────────────────────

  const hiddenCount = featureConfig.hiddenMenus.size;
  const visiblePageCount = allPages.length - hiddenCount;
  const filteredFeatures = React.useMemo(() => {
    const term = featureSearch.trim().toLowerCase();
    if (!term) return features;
    return features.filter(
      (feature) => feature.name.toLowerCase().includes(term) || feature.code.toLowerCase().includes(term) || (feature.category ?? '').toLowerCase().includes(term)
    );
  }, [features, featureSearch]);

  const planChanged =
    selectedPlan &&
    (moduleDraft.size !== selectedPlan.includedModules.length ||
      featureDraft.size !== selectedPlan.features.length ||
      [...moduleDraft].some((code) => !selectedPlan.includedModules.includes(code)) ||
      [...featureDraft].some((code) => !selectedPlan.features.includes(code)));

  const featureConfigKey = React.useMemo(() => featureConfigSignature(featureConfig), [featureConfig]);
  const configChanged = draftLoaded && featureConfigKey !== featureConfigBaselineRef.current;

  // Preview: pages hidden because their owning feature is not in the plan.
  const featureHiddenPaths = React.useMemo(
    () => new Set(featureHiddenPathsForPlan(features, featureDraft)),
    [features, featureDraft]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="منشئ الخطط والصفحات والمميزات"
        description="معالج بخطوات متتابعة: اختر الباقة، عدّل بياناتها، حدد الوحدات والمميزات، وتحكم في إظهار وإخفاء كل صفحات موقع المستخدمين وصلاحياتها الدقيقة — ثم راجع المعاينة وطبق."
        icon={<Package className="h-5 w-5" />}
      />

      <StepIndicator step={step} />

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface py-16 text-center text-sm font-semibold text-muted shadow-sm">
          جارٍ تحميل كتالوج الخطط والصفحات...
        </div>
      ) : (
        <>
          {/* ─── Step 0: Plan selection ─── */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  اختر الباقة التي تريد بناء صفحاتها ومميزاتها — الخطوات التالية تعدّل محتواها فقط، لا أسعارها.
                </p>
                <div className="flex items-center gap-2">
                  {canManage && selectedPlan && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Copy className="h-3.5 w-3.5" />}
                      onClick={() => setCopyOpen(true)}
                    >
                      نسخ من باقة أخرى
                    </Button>
                  )}
                  {canManagePlans && (
                    <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreatePlan}>
                      خطة جديدة
                    </Button>
                  )}
                </div>
              </div>

              {plans.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface shadow-sm">
                  <EmptyState icon={<Layers3 className="h-5 w-5" />} title="لا توجد خطط" description="أنشئ خطة اشتراك أولاً من زر «خطة جديدة»." />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {plans.map((plan) => {
                    const active = plan.id === selectedPlanId;
                    return (
                      <div
                        key={plan.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void selectPlan(plan)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void selectPlan(plan);
                          }
                        }}
                        className={`cursor-pointer rounded-xl border p-4 text-right shadow-sm transition ${
                          active ? 'border-success bg-success-soft/50 ring-1 ring-success' : 'border-line bg-surface hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-[13px] font-black text-ink">
                              {plan.name}
                              {plan.isDefault && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-muted" dir="ltr">{plan.code}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
                            {canManagePlans && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditPlan(plan);
                                }}
                                className="rounded p-1 text-muted hover:bg-accent-soft hover:text-primary"
                                title="تعديل بيانات الخطة"
                                aria-label={`تعديل ${plan.name}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-[16px] font-black text-ink">{formatMoney(plan.price, plan.currency)}</p>
                        <p className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-muted">
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.includedModules.length} وحدة</span>
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.features.length} ميزة</span>
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.subscriberCount} مشترك</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 1: Modules & their pages ─── */}
          {step === 1 && selectedPlan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  الباقة الحالية: <span className="font-black text-ink">{selectedPlan.name}</span> — فعّل الوحدات التي تشملها الباقة، وكل وحدة تعرض صفحاتها داخل تطبيق العميل.
                </p>
                <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-bold text-success">
                  {moduleDraft.size}/{modules.length} وحدة مفعّلة
                </span>
              </div>
              {modules.length === 0 ? (
                <EmptyState icon={<LayoutGrid className="h-5 w-5" />} title="لا توجد وحدات معرفة" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {modules.map((module) => {
                    const checked = moduleDraft.has(module.code);
                    const ownedPages = pagesByModuleCode.get(module.code) ?? [];
                    return (
                      <details
                        key={module.id || module.code}
                        className={`group rounded-xl border transition ${checked ? 'border-success-border bg-success-soft/30' : 'border-line bg-surface opacity-80'}`}
                      >
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                              {module.name}
                              <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{module.code}</span>
                              {!module.isEnabled && <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-danger">الوحدة معطلة globally</span>}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted">{module.description || 'بدون وصف'}</p>
                            <p className="mt-1 text-[10px] font-semibold text-muted">
                              {ownedPages.length > 0 ? `${ownedPages.length} صفحة في التطبيق` : 'لا صفحات مرتبطة'}
                            </p>
                          </div>
                          <span onClick={(event) => event.stopPropagation()}>
                            <Toggle
                              checked={checked}
                              onChange={(next) =>
                                setModuleDraft((current) => {
                                  const draft = new Set(current);
                                  if (next) draft.add(module.code);
                                  else draft.delete(module.code);
                                  return draft;
                                })
                              }
                              label={module.name}
                            />
                          </span>
                        </summary>
                        {ownedPages.length > 0 && (
                          <div className="border-t border-line px-3 py-2">
                            <p className="mb-1.5 text-[10px] font-bold text-muted">صفحات هذه الوحدة في موقع المستخدمين:</p>
                            <div className="flex flex-wrap gap-1">
                              {ownedPages.map((page) => (
                                <span
                                  key={page.path}
                                  title={page.path}
                                  className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                                    featureConfig.hiddenMenus.has(page.path) ? 'bg-danger-soft text-danger line-through' : 'bg-surface-sunken text-ink-secondary'
                                  }`}
                                >
                                  {page.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Features ─── */}
          {step === 2 && selectedPlan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  أضف مميزات جديدة أو عدّل صفحاتها، وفعّل ما تشمله باقة <span className="font-black text-ink">{selectedPlan.name}</span>.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      className={`${inputClass} w-44 py-1.5 pr-8 text-[11.5px]`}
                      placeholder="بحث في المميزات..."
                      value={featureSearch}
                      onChange={(event) => setFeatureSearch(event.target.value)}
                    />
                  </div>
                  {canManage && (
                    <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => openFeatureForm()}>
                      ميزة جديدة
                    </Button>
                  )}
                </div>
              </div>

              {filteredFeatures.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface shadow-sm">
                  <EmptyState icon={<Sparkles className="h-5 w-5" />} title="لا توجد مميزات" description="أنشئ ميزة جديدة لربطها بصفحات محددة من موقع المستخدمين." />
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFeatures.map((feature) => {
                    const inPlan = featureDraft.has(feature.code);
                    return (
                      <article
                        key={feature.id}
                        className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-sm transition ${
                          inPlan ? 'border-success-border bg-success-soft/30' : 'border-line bg-surface'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                            {feature.name}
                            <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{feature.code}</span>
                            {feature.category && (
                              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[9.5px] font-semibold text-muted">{feature.category}</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-muted">
                            {feature.description || 'بدون وصف'} — تملك {feature.pagePaths.length} صفحة
                            {feature.minPlanTier ? ` — حد أدنى: ${feature.minPlanTier}` : ''}
                          </p>
                          {feature.pagePaths.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {feature.pagePaths.slice(0, 5).map((path) => (
                                <span key={path} className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[9px] text-primary" dir="ltr">{path}</span>
                              ))}
                              {feature.pagePaths.length > 5 && (
                                <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[9px] font-semibold text-muted">+{feature.pagePaths.length - 5}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-[10.5px] font-bold text-ink-secondary">
                            <input
                              type="checkbox"
                              checked={inPlan}
                              disabled={!canManage}
                              onChange={(event) =>
                                setFeatureDraft((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(feature.code);
                                  else next.delete(feature.code);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-success disabled:opacity-40"
                            />
                            ضمن الخطة
                          </label>
                          <Toggle
                            checked={feature.isEnabled}
                            disabled={!canManage}
                            onChange={() => void toggleFeatureEnabled(feature)}
                            label="مفعّلة"
                          />
                          {canManage && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openFeatureForm(feature)}
                                className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary"
                                title="تعديل الميزة وصفحاتها"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(feature)}
                                className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                                title="حذف الميزة"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 3: Page visibility + granular permissions per plan ─── */}
          {step === 3 && selectedPlan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  كل صفحات موقع المستخدمين ({allPages.length}) — بدّل أي صفحة لإخفائها عن مشتركي باقة{' '}
                  <span className="font-black text-ink">{selectedPlan.name}</span>، أي صفحة لضبط صلاحياتها الدقيقة.
                </p>
                <div className="flex items-center gap-2 text-[10.5px] font-bold">
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{visiblePageCount} ظاهرة</span>
                  <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{hiddenCount} مخفية</span>
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFeatureConfig((current) => ({ ...current, hiddenMenus: new Set() }))}
                      className="rounded-full bg-surface-sunken px-2.5 py-1 text-ink-secondary hover:bg-surface-sunken"
                    >
                      إظهار الكل
                    </button>
                  )}
                </div>
              </div>

              {!draftLoaded ? (
                <div className="rounded-xl border border-line bg-surface py-10 text-center text-sm font-semibold text-muted">جارٍ تحميل إعدادات الصفحات...</div>
              ) : (
                pageGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-line bg-surface shadow-sm">
                    <div className="flex items-center justify-between border-b border-line bg-surface-muted px-4 py-2">
                      <p className="text-[12px] font-black text-ink">{group.label}</p>
                      <span className="text-[10px] font-semibold text-muted">
                        {group.pages.filter((page) => featureConfig.hiddenMenus.has(page.path)).length}/{group.pages.length} مخفية
                      </span>
                    </div>
                    <div className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.pages.map((page: TenantPage) => {
                        const hidden = featureConfig.hiddenMenus.has(page.path);
                        const hasPerms =
                          featureConfig.featurePerms.has(page.path) ||
                          permissionsForPagePath(page.path).some((perm) =>
                            expandPermissionCodes(perm.code).some((code) => featureConfig.disabledPermissions.has(code))
                          );
                        return (
                          <div
                            key={page.path}
                            className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 transition ${
                              hidden ? 'border-danger-border bg-danger-soft/40' : 'border-line hover:bg-surface-muted'
                            }`}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2">
                              <span className="min-w-0">
                                <span className={`block truncate text-[11.5px] font-semibold ${hidden ? 'text-danger line-through' : 'text-ink'}`}>
                                  {page.label}
                                </span>
                                <span className="block truncate font-mono text-[9.5px] text-muted" dir="ltr">{page.path}</span>
                              </span>
                              <input
                                type="checkbox"
                                checked={!hidden}
                                disabled={!canManage}
                                onChange={(event) =>
                                  setFeatureConfig((current) => {
                                    const hiddenMenus = new Set(current.hiddenMenus);
                                    if (event.target.checked) hiddenMenus.delete(page.path);
                                    else hiddenMenus.add(page.path);
                                    return { ...current, hiddenMenus };
                                  })
                                }
                                className="h-3.5 w-3.5 shrink-0 accent-success disabled:opacity-40"
                                aria-label={`إظهار ${page.label}`}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setPagePermTarget(page)}
                              disabled={!canManage}
                              className={`shrink-0 rounded p-1 transition disabled:opacity-40 ${
                                hasPerms ? 'bg-accent-soft text-primary' : 'text-muted hover:bg-accent-soft hover:text-primary'
                              }`}
                              title="صلاحيات الصفحة الدقيقة"
                              aria-label={`صلاحيات ${page.label}`}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <p className="text-[11px] font-semibold text-muted">
                ملاحظة: إخفاء الصفحات يُطبَّق عبر إعدادات الخطة في التكوين الموقّع الذي تستهلكه تطبيقات العملاء — الصفحات المخفية لا تظهر في القوائم ولا يمكن فتحها مباشرة. زر الترس يفتح صلاحيات الصفحة الدقيقة (عرض فقط / تعديل / حذف / تصدير / صلاحيات معطلة).{' '}
                {!centralActive && 'في الوضع المحلي تُحفظ الإعدادات محلياً ولا تُفرض على تطبيقات العملاء — الإلزام الفعلي يتم عبر السيرفر المركزي.'}
              </p>
            </div>
          )}

          {/* ─── Step 4: Review, preview & apply ─── */}
          {step === 4 && selectedPlan && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className="text-[10.5px] font-bold text-muted">الباقة</p>
                  <p className="mt-1 text-[14px] font-black text-ink">{selectedPlan.name}</p>
                  <p className="font-mono text-[10px] text-muted" dir="ltr">{selectedPlan.code}</p>
                  {canManagePlans && (
                    <button
                      type="button"
                      onClick={() => openEditPlan(selectedPlan)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> تعديل بيانات الخطة
                    </button>
                  )}
                </div>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className="text-[10.5px] font-bold text-muted">الوحدات المشمولة</p>
                  <p className="mt-1 text-[20px] font-black text-success">{moduleDraft.size}</p>
                  <p className="text-[10px] text-muted">من أصل {modules.length} وحدة</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className="text-[10.5px] font-bold text-muted">المميزات المشمولة</p>
                  <p className="mt-1 text-[20px] font-black text-primary">{featureDraft.size}</p>
                  <p className="text-[10px] text-muted">من أصل {features.length} ميزة</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className="text-[10.5px] font-bold text-muted">صفحات موقع المستخدمين</p>
                  <p className="mt-1 text-[20px] font-black text-ink">{visiblePageCount}<span className="text-[12px] font-bold text-muted"> / {allPages.length}</span></p>
                  <p className="text-[10px] text-danger">{hiddenCount} مخفية عن الباقة</p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                <p className="mb-2 text-[12px] font-black text-ink">الصفحات المخفية عن هذه الباقة ({hiddenCount})</p>
                {hiddenCount === 0 ? (
                  <p className="text-[11.5px] text-muted">لا توجد صفحات مخفية يدويًا — لكن المعاينة أدناه تشمل صفحات المميزات والوحدات غير المشمولة.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {[...featureConfig.hiddenMenus].slice(0, 12).map((path) => (
                      <span key={path} className="rounded-full bg-danger-soft px-2.5 py-1 font-mono text-[10px] text-danger" dir="ltr">
                        {path}
                      </span>
                    ))}
                    {hiddenCount > 12 && (
                      <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[10px] font-bold text-muted">+{hiddenCount - 12}</span>
                    )}
                  </div>
                )}
                {(featureConfig.disabledPermissions.size > 0 || featureConfig.featurePerms.size > 0) && (
                  <p className="mt-2 text-[11px] font-semibold text-muted">
                    قيود صلاحيات دقيقة: {featureConfig.disabledPermissions.size} صلاحية معطلة، {featureConfig.featurePerms.size} صفحة بقيود قدرات.
                  </p>
                )}
              </div>

              <PlanPreviewPanel
                pageGroups={pageGroups}
                hiddenDraft={featureConfig.hiddenMenus}
                featureHiddenPaths={featureHiddenPaths}
                registryToPlatformCodes={registryToPlatformCodes}
                moduleDraft={moduleDraft}
                featurePermsDraft={featureConfig.featurePerms}
                disabledPermsDraft={featureConfig.disabledPermissions}
              />
            </div>
          )}
        </>
      )}

      {/* ─── Footer navigation ─── */}
      {!loading && selectedPlan && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetDrafts} disabled={applying} leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}>
              استعادة افتراضيات الباقة
            </Button>
            {(planChanged || configChanged) && step < 4 && (
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning">توجد تغييرات غير مطبقة</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)} disabled={applying} leadingIcon={<ChevronRight className="h-4 w-4" />}>
                السابق
              </Button>
            )}
            {step < WIZARD_STEPS.length - 1 ? (
              <Button variant="primary" size="sm" onClick={() => setStep((s) => s + 1)} disabled={!draftLoaded} leadingIcon={<ChevronLeft className="h-4 w-4" />}>
                التالي
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void apply()}
                loading={applying}
                disabled={!canManage || !draftLoaded}
                leadingIcon={<Check className="h-4 w-4" />}
              >
                تطبيق على الباقة
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Plan details modal (create + edit) ─── */}
      <PlanDetailsModal
        open={planFormOpen}
        onClose={() => {
          setPlanFormOpen(false);
          setEditingPlan(null);
        }}
        editing={editingPlan}
        modules={modules}
        saving={planSaving}
        canManagePlans={canManagePlans}
        onSubmit={(input) => void savePlanDetails(input)}
      />

      {/* ─── Feature form modal ─── */}
      <Modal
        open={featureFormOpen}
        onClose={() => setFeatureFormOpen(false)}
        title={featureForm.id ? 'تعديل الميزة' : 'ميزة جديدة'}
        description="عرّف الميزة ثم اختر الصفحات التي تملكها — الصفحات المختارة تُخفى عن الباقات التي لا تشمل الميزة."
        size="lg"
        busy={featureSaving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFeatureFormOpen(false)} disabled={featureSaving}>إلغاء</Button>
            <Button variant="primary" onClick={() => void saveFeature()} loading={featureSaving} disabled={!canManage}>حفظ الميزة</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الميزة" required>
            <input className={inputClass} value={featureForm.name} onChange={(event) => setFeatureForm({ ...featureForm, name: event.target.value })} />
          </Field>
          <Field label="الرمز البرمجي" required hint={featureForm.id ? 'لا يمكن تعديل الرمز' : 'مثال: sales.quick_invoice'}>
            <input
              dir="ltr"
              className={inputClass}
              value={featureForm.code}
              disabled={Boolean(featureForm.id)}
              onChange={(event) => setFeatureForm({ ...featureForm, code: event.target.value.toLowerCase() })}
            />
          </Field>
          <Field label="الفئة">
            <input className={inputClass} value={featureForm.category} onChange={(event) => setFeatureForm({ ...featureForm, category: event.target.value })} placeholder="مثال: مبيعات، تقارير" />
          </Field>
          <Field label="نسبة الإتاحة (%)">
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={featureForm.rolloutPercent}
              onChange={(event) => {
                const next = Number(event.target.value);
                setFeatureForm({ ...featureForm, rolloutPercent: Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0 });
              }}
            />
          </Field>
          <Field label="الحد الأدنى لدرجة الخطة">
            <input className={inputClass} value={featureForm.minPlanTier} onChange={(event) => setFeatureForm({ ...featureForm, minPlanTier: event.target.value })} placeholder="PRO" />
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={featureForm.description} onChange={(event) => setFeatureForm({ ...featureForm, description: event.target.value })} />
          </Field>
        </div>

        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold text-ink">الصفحات التي تملكها الميزة</p>
            <Button variant="secondary" size="sm" onClick={() => setPagePickerOpen(true)} leadingIcon={<MonitorSmartphone className="h-3.5 w-3.5" />}>
              اختيار الصفحات ({featureForm.pagePaths.length})
            </Button>
          </div>
          {featureForm.pagePaths.length === 0 ? (
            <p className="text-[11px] text-muted">لم تُسنَد صفحات بعد — الميزة سارية على مستوى القدرات فقط.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {featureForm.pagePaths.map((path) => (
                <span key={path} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-primary" dir="ltr">
                  {path}
                  <button
                    type="button"
                    onClick={() => setFeatureForm({ ...featureForm, pagePaths: featureForm.pagePaths.filter((item) => item !== path) })}
                    className="text-primary hover:text-danger"
                    aria-label={`إزالة ${path}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <div>
            <p className="text-[12px] font-bold text-ink">حالات الميزة</p>
            <p className="text-[10.5px] text-muted">بيئة الاختبار تحصرها على مجموعات التجربة قبل الإطلاق.</p>
          </div>
          <div className="flex items-center gap-4">
            <Toggle checked={featureForm.isStagingOnly} onChange={(val) => setFeatureForm({ ...featureForm, isStagingOnly: val })} label="Staging" />
            <Toggle checked={featureForm.isEnabled} onChange={(val) => setFeatureForm({ ...featureForm, isEnabled: val })} label="مفعّلة" />
          </div>
        </div>
      </Modal>

      {/* ─── Page picker (shared) ─── */}
      <PagePickerModal
        open={pagePickerOpen}
        onClose={() => setPagePickerOpen(false)}
        title={featureForm.id ? `صفحات الميزة — ${featureForm.name}` : 'صفحات الميزة الجديدة'}
        selected={new Set(featureForm.pagePaths)}
        onChange={(next) => setFeatureForm({ ...featureForm, pagePaths: [...next] })}
      />

      {/* ─── Per-page permissions modal ─── */}
      <PagePermissionsModal
        open={Boolean(pagePermTarget)}
        onClose={() => setPagePermTarget(null)}
        page={pagePermTarget}
        initiallyHidden={pagePermTarget ? featureConfig.hiddenMenus.has(pagePermTarget.path) : false}
        initialFeaturePerm={pagePermTarget ? featureConfig.featurePerms.get(pagePermTarget.path) : undefined}
        initialDisabledCodes={pagePermInitialDisabled}
        canManage={canManage}
        onSave={(draft) => {
          if (pagePermTarget) savePagePermissions(pagePermTarget, draft);
        }}
      />

      {/* ─── Copy from plan modal ─── */}
      <CopyFromPlanModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        plans={plans}
        excludePlanId={selectedPlanId}
        loading={copying}
        onCopy={(source) => void copyFromPlan(source)}
      />

      {/* ─── Delete feature confirm ─── */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="حذف الميزة"
        description={deleteTarget ? `سيتم حذف «${deleteTarget.name}» (${deleteTarget.code}) نهائياً مع تجاوزاتها، وإزالتها من كل الباقات التي تشملها.` : ''}
        size="sm"
        busy={featureSaving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={featureSaving}>إلغاء</Button>
            <Button variant="danger" onClick={() => void confirmDeleteFeature()} loading={featureSaving}>حذف نهائي</Button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="rounded-xl border border-danger-border bg-danger-soft p-3 text-[12px] font-semibold text-danger">
            تحذير: لا يمكن التراجع عن هذا الإجراء. الصفحات التي كانت مملوكة لهذه الميزة ستصبح متاحة حسب قواعد الإخفاء الأخرى.
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PlatformPlanWizardPage;
