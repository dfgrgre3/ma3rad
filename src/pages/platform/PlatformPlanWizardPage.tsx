import React from 'react';
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  LayoutGrid,
  MonitorSmartphone,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformBillingCycle,
  PlatformPlanInput,
} from '../../services/domains/platform/platformTypes';
import { PLATFORM_MODULE_TO_REGISTRY_IDS } from '../../config/platformModuleMap';
import { listTenantPageGroups, listTenantPages, type TenantPage, type TenantPageGroup } from '../../config/tenantPageCatalog';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, Field, StatusBadge, Toggle, formatMoney, inputClass } from './components/PlatformUI';
import { useToast } from '../../components/ui/Toast';

// ─── Normalization (local rows are camelCase, central API may return snake_case) ───

const pick = (row: any, ...keys: string[]): any => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const toBool = (value: any): boolean => value === true || value === 1 || value === '1' || value === 'true';

const jsonArray = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

/** Central plan prices arrive in minor units (cents); local plans are already major units. */
const fromMinor = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : 0;
};
const major = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** NaN-safe numeric parsing clamped to a minimum. */
const numericInput = (value: string | number | null | undefined, min = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, n) : min;
};

interface CatalogPlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  billingCycle: PlatformBillingCycle;
  price: number;
  currency: string;
  seatsLimit: number;
  trialDays: number;
  includedModules: string[];
  features: string[];
  isActive: boolean;
  isDefault: boolean;
  subscriberCount: number;
  raw: any;
}

const normalizePlan = (row: any, minorUnits = false): CatalogPlan => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code') ?? ''),
  description: pick(row, 'description') ?? null,
  billingCycle: (pick(row, 'billingCycle', 'billing_cycle') ?? 'MONTHLY') as PlatformBillingCycle,
  price: minorUnits ? fromMinor(pick(row, 'price')) : major(pick(row, 'price')),
  currency: String(pick(row, 'currency') ?? 'EGP'),
  seatsLimit: Number(pick(row, 'seatsLimit', 'seats_limit') ?? 1) || 1,
  trialDays: Number(pick(row, 'trialDays', 'trial_days') ?? 14) || 14,
  includedModules: jsonArray(pick(row, 'includedModules', 'included_modules')),
  features: jsonArray(pick(row, 'features')),
  isActive: toBool(pick(row, 'isActive', 'is_active')),
  isDefault: toBool(pick(row, 'isDefault', 'is_default')),
  subscriberCount: Number(pick(row, 'subscriberCount', 'subscriber_count') ?? 0) || 0,
  raw: row,
});

interface CatalogFeature {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly: boolean;
  minPlanTier?: string | null;
  pagePaths: string[];
}

const normalizeFeature = (row: any): CatalogFeature => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code', 'key') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code', 'key') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
  rolloutPercent: Number(pick(row, 'rolloutPercent', 'rollout_percentage', 'rolloutPercentage') ?? 100) || 0,
  isStagingOnly: toBool(pick(row, 'isStagingOnly', 'is_staging_only')),
  minPlanTier: pick(row, 'minPlanTier', 'min_plan_tier') ?? null,
  pagePaths: jsonArray(pick(row, 'pagePaths', 'page_paths')),
});

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
}

const normalizeModule = (row: any): CatalogModule => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code') ?? pick(row, 'id') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
});

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

// ─── Plan create form ──────────────────────────────────────────────────────────

const CYCLES: Array<{ value: PlatformBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'شهري' },
  { value: 'QUARTERLY', label: 'ربع سنوي' },
  { value: 'YEARLY', label: 'سنوي' },
  { value: 'LIFETIME', label: 'مدى الحياة' },
];

const emptyPlanForm: PlatformPlanInput = {
  code: '',
  name: '',
  description: '',
  billingCycle: 'YEARLY',
  price: 0,
  monthlyPrice: 0,
  yearlyPrice: 0,
  currency: 'EGP',
  seatsLimit: 3,
  branchesLimit: 1,
  devicesLimit: 2,
  storageLimitMb: 500,
  maxProducts: 1000,
  maxWarehouses: 2,
  trialDays: 14,
  includedModules: [],
  features: [],
  permissions: [],
  isActive: true,
};

// ─── Feature form ─────────────────────────────────────────────────────────────

interface FeatureFormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  rolloutPercent: number;
  isStagingOnly: boolean;
  minPlanTier: string;
  pagePaths: string[];
}

const emptyFeatureForm: FeatureFormState = {
  code: '',
  name: '',
  description: '',
  category: '',
  isEnabled: true,
  rolloutPercent: 100,
  isStagingOnly: false,
  minPlanTier: '',
  pagePaths: [],
};

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
  const [hiddenDraft, setHiddenDraft] = React.useState<Set<string>>(new Set());
  const [draftLoaded, setDraftLoaded] = React.useState(false);

  // Plan create modal
  const [planFormOpen, setPlanFormOpen] = React.useState(false);
  const [planForm, setPlanForm] = React.useState<PlatformPlanInput>(emptyPlanForm);
  const [planSaving, setPlanSaving] = React.useState(false);

  // Feature modal / picker / delete
  const [featureFormOpen, setFeatureFormOpen] = React.useState(false);
  const [featureForm, setFeatureForm] = React.useState<FeatureFormState>(emptyFeatureForm);
  const [pagePickerOpen, setPagePickerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogFeature | null>(null);
  const [featureSaving, setFeatureSaving] = React.useState(false);
  const [featureSearch, setFeatureSearch] = React.useState('');

  const selectedPlan = React.useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const allPages = React.useMemo(() => listTenantPages(), []);

  // Pages owned by each platform module code (via the platform→registry map).
  const pagesByModuleCode = React.useMemo(() => {
    const map = new Map<string, TenantPage[]>();
    for (const [code, registryIds] of Object.entries(PLATFORM_MODULE_TO_REGISTRY_IDS)) {
      const ownerIds = new Set(registryIds);
      map.set(code, allPages.filter((page) => page.moduleId !== null && ownerIds.has(page.moduleId)));
    }
    return map;
  }, [allPages]);

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
        setPlans((Array.isArray(pl) ? pl : []).map((row) => normalizePlan(row, true)));
        setModules((Array.isArray(md) ? md : []).map(normalizeModule));
        setFeatures((Array.isArray(fl) ? fl : []).map(normalizeFeature));
      } else {
        setPlans(platformAdminService.listPlans().map((row) => normalizePlan(row, false)));
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

  // ─── Draft init per selected plan ─────────────────────────────────────────

  const loadPlanHiddenPages = React.useCallback(
    async (planId: string): Promise<Set<string>> => {
      if (centralActive) {
        try {
          const data = await centralPlatformClient.getFeaturePermissions({ tenantId: null, planId });
          return new Set(data.hiddenMenus ?? []);
        } catch {
          return new Set();
        }
      }
      try {
        const settings = platformAdminService.getSettings();
        const raw = settings[`planCatalog.hiddenPages.${planId}`];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
      } catch {
        return new Set();
      }
    },
    [centralActive]
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
      const hidden = await loadPlanHiddenPages(plan.id);
      if (seq !== selectSeqRef.current) return; // superseded by a newer selection
      setHiddenDraft(hidden);
      setDraftLoaded(true);
    },
    [loadPlanHiddenPages]
  );

  React.useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      const def = plans.find((plan) => plan.isDefault && plan.isActive) ?? plans.find((plan) => plan.isActive) ?? plans[0];
      if (def) void selectPlan(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  const resetDrafts = () => {
    if (!selectedPlan) return;
    setModuleDraft(new Set(selectedPlan.includedModules));
    setFeatureDraft(new Set(selectedPlan.features));
    void loadPlanHiddenPages(selectedPlan.id).then(setHiddenDraft);
  };

  // ─── Plan creation ────────────────────────────────────────────────────────

  const createPlan = async () => {
    if (!canManagePlans) {
      toast.error('لا تملك صلاحية إدارة الخطط');
      return;
    }
    const name = planForm.name.trim();
    const code = planForm.code.trim();
    if (!name || !code) {
      toast.error('اسم الخطة ورمزها مطلوبان');
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(code)) {
      toast.error('رمز الخطة يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و_ فقط');
      return;
    }
    setPlanSaving(true);
    try {
      const input: PlatformPlanInput = {
        ...planForm,
        name,
        code,
        price: numericInput(planForm.price),
        monthlyPrice: planForm.monthlyPrice == null ? undefined : numericInput(planForm.monthlyPrice),
        yearlyPrice: planForm.yearlyPrice == null ? undefined : numericInput(planForm.yearlyPrice),
        trialDays: planForm.trialDays == null ? undefined : numericInput(planForm.trialDays),
        seatsLimit: numericInput(planForm.seatsLimit, 1),
      };
      const created = centralActive
        ? normalizePlan(await centralPlatformClient.createPlan({ ...input }), true)
        : normalizePlan(platformAdminService.createPlan(input), false);
      toast.success('تم إنشاء الخطة', created.name);
      setPlanFormOpen(false);
      setPlanForm(emptyPlanForm);
      await load();
      void selectPlan(created);
    } catch (err) {
      toast.error('تعذر إنشاء الخطة', err instanceof Error ? err.message : undefined);
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

  // ─── Apply (plan catalog + hidden pages) ──────────────────────────────────

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

      const hiddenPaths = [...hiddenDraft];
      if (centralActive) {
        // Fetch current permissions first — a failure must abort the apply so we
        // never overwrite disabledPermissions/featurePermissions with empty lists.
        const current = await centralPlatformClient.getFeaturePermissions({ tenantId: null, planId: selectedPlan.id });
        await centralPlatformClient.setFeaturePermissions({
          planId: selectedPlan.id,
          hiddenMenus: hiddenPaths,
          disabledPermissions: current.disabledPermissions ?? [],
          featurePermissions: (current.featurePermissions ?? []) as Array<Record<string, unknown>>,
        });
      } else {
        const settings = platformAdminService.getSettings();
        platformAdminService.updateSettings({
          ...settings,
          [`planCatalog.hiddenPages.${selectedPlan.id}`]: JSON.stringify(hiddenPaths),
        });
      }

      toast.success('تم تطبيق إعدادات الخطة', `${selectedPlan.name} — ${moduleDraft.size} وحدة، ${featureDraft.size} ميزة، ${hiddenPaths.length} صفحة مخفية`);
      await load();
      await selectPlan({ ...selectedPlan, includedModules: [...moduleDraft], features: [...featureDraft] });
    } catch (err) {
      toast.error('تعذر تطبيق الإعدادات', err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  // ─── Derived counts ───────────────────────────────────────────────────────

  const visiblePageCount = allPages.length - hiddenDraft.size;
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="منشئ الخطط والصفحات والمميزات"
        description="معالج بخطوات متتابعة: اختر الباقة، حدد الوحدات والمميزات، ثم تحكم في إظهار وإخفاء كل صفحات موقع المستخدمين — وأضف أو احذف المميزات بحرية."
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
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  اختر الباقة التي تريد بناء صفحاتها ومميزاتها — الخطوات التالية تعدّل محتواها فقط، لا أسعارها.
                </p>
                {canManagePlans && (
                  <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPlanFormOpen(true)}>
                    خطة جديدة
                  </Button>
                )}
              </div>

              {plans.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface shadow-sm">
                  <EmptyState icon={<Layers3 className="h-5 w-5" />} title="لا توجد خطط" description="أنشئ خطة اشتراك أولاً من صفحة خطط الاشتراك." />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {plans.map((plan) => {
                    const active = plan.id === selectedPlanId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => void selectPlan(plan)}
                        className={`rounded-xl border p-4 text-right shadow-sm transition ${
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
                          <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
                        </div>
                        <p className="mt-2 text-[16px] font-black text-ink">{formatMoney(plan.price, plan.currency)}</p>
                        <p className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-muted">
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.includedModules.length} وحدة</span>
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.features.length} ميزة</span>
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5">{plan.subscriberCount} مشترك</span>
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 1: Modules & their pages ─── */}
          {step === 1 && selectedPlan && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
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
                                    hiddenDraft.has(page.path) ? 'bg-danger-soft text-danger line-through' : 'bg-surface-sunken text-ink-secondary'
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

          {/* ─── Step 3: Page visibility per plan ─── */}
          {step === 3 && selectedPlan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <p className="text-[12px] font-semibold text-ink-secondary">
                  كل صفحات موقع المستخدمين ({allPages.length}) — بدّل أي صفحة لإخفائها عن مشتركي باقة{' '}
                  <span className="font-black text-ink">{selectedPlan.name}</span>.
                </p>
                <div className="flex items-center gap-2 text-[10.5px] font-bold">
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{visiblePageCount} ظاهرة</span>
                  <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{hiddenDraft.size} مخفية</span>
                  {hiddenDraft.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setHiddenDraft(new Set())}
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
                        {group.pages.filter((page) => hiddenDraft.has(page.path)).length}/{group.pages.length} مخفية
                      </span>
                    </div>
                    <div className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.pages.map((page: TenantPage) => {
                        const hidden = hiddenDraft.has(page.path);
                        return (
                          <label
                            key={page.path}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                              hidden ? 'border-danger-border bg-danger-soft/40' : 'border-line hover:bg-surface-muted'
                            }`}
                          >
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
                                setHiddenDraft((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.delete(page.path);
                                  else next.add(page.path);
                                  return next;
                                })
                              }
                              className="h-3.5 w-3.5 shrink-0 accent-success disabled:opacity-40"
                              aria-label={`إظهار ${page.label}`}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <p className="text-[11px] font-semibold text-muted">
                ملاحظة: إخفاء الصفحات يُطبَّق عبر إعدادات الخطة في التكوين الموقّع الذي تستهلكه تطبيقات العملاء — الصفحات المخفية لا تظهر في القوائم ولا يمكن فتحها مباشرة.
              </p>
            </div>
          )}

          {/* ─── Step 4: Review & apply ─── */}
          {step === 4 && selectedPlan && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className="text-[10.5px] font-bold text-muted">الباقة</p>
                  <p className="mt-1 text-[14px] font-black text-ink">{selectedPlan.name}</p>
                  <p className="font-mono text-[10px] text-muted" dir="ltr">{selectedPlan.code}</p>
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
                  <p className="text-[10px] text-danger">{hiddenDraft.size} مخفية عن الباقة</p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                <p className="mb-2 text-[12px] font-black text-ink">الصفحات المخفية عن هذه الباقة ({hiddenDraft.size})</p>
                {hiddenDraft.size === 0 ? (
                  <p className="text-[11.5px] text-muted">لا توجد صفحات مخفية — كل صفحات الموقع متاحة لمشتركي الباقة (ضمن حدود الوحدات المفعّلة).</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {[...hiddenDraft].slice(0, 12).map((path) => (
                      <span key={path} className="rounded-full bg-danger-soft px-2.5 py-1 font-mono text-[10px] text-danger" dir="ltr">
                        {path}
                      </span>
                    ))}
                    {hiddenDraft.size > 12 && (
                      <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[10px] font-bold text-muted">+{hiddenDraft.size - 12}</span>
                    )}
                  </div>
                )}
              </div>

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
            {planChanged && step < 4 && (
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

      {/* ─── Create plan modal ─── */}
      <Modal
        open={planFormOpen}
        onClose={() => setPlanFormOpen(false)}
        title="خطة اشتراك جديدة"
        description="أنشئ الباقة أولاً ثم انتقل للخطوات التالية لبناء صفحاتها ومميزاتها."
        size="lg"
        busy={planSaving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPlanFormOpen(false)} disabled={planSaving}>إلغاء</Button>
            <Button variant="primary" onClick={() => void createPlan()} loading={planSaving} disabled={!canManagePlans}>إنشاء الخطة</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الخطة" required>
            <input className={inputClass} value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} />
          </Field>
          <Field label="رمز الخطة" required hint="أحرف إنجليزية وأرقام و_ فقط">
            <input dir="ltr" className={inputClass} value={planForm.code} onChange={(event) => setPlanForm({ ...planForm, code: event.target.value.toUpperCase() })} />
          </Field>
          <Field label="دورة الفوترة">
            <select className={inputClass} value={planForm.billingCycle} onChange={(event) => setPlanForm({ ...planForm, billingCycle: event.target.value as PlatformBillingCycle })}>
              {CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
            </select>
          </Field>
          <Field label="السعر">
            <input type="number" min={0} className={inputClass} value={planForm.price ?? 0} onChange={(event) => setPlanForm({ ...planForm, price: numericInput(event.target.value) })} />
          </Field>
          <Field label="السعر شهري">
            <input type="number" min={0} className={inputClass} value={planForm.monthlyPrice ?? 0} onChange={(event) => setPlanForm({ ...planForm, monthlyPrice: numericInput(event.target.value) })} />
          </Field>
          <Field label="السعر سنوي">
            <input type="number" min={0} className={inputClass} value={planForm.yearlyPrice ?? 0} onChange={(event) => setPlanForm({ ...planForm, yearlyPrice: numericInput(event.target.value) })} />
          </Field>
          <Field label="أيام التجربة">
            <input type="number" min={0} className={inputClass} value={planForm.trialDays ?? 14} onChange={(event) => setPlanForm({ ...planForm, trialDays: numericInput(event.target.value) })} />
          </Field>
          <Field label="حد المستخدمين">
            <input type="number" min={1} className={inputClass} value={planForm.seatsLimit ?? 3} onChange={(event) => setPlanForm({ ...planForm, seatsLimit: numericInput(event.target.value, 1) })} />
          </Field>
          <Field label="العملة">
            <select className={inputClass} value={planForm.currency} onChange={(event) => setPlanForm({ ...planForm, currency: event.target.value })}>
              {['EGP', 'SAR', 'AED', 'USD', 'EUR'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={planForm.description ?? ''} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} />
          </Field>
        </div>
      </Modal>

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
