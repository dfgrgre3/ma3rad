import React from 'react';
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  LayoutGrid,
  MonitorSmartphone,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { platformAdminService } from '../../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../../services/domains/platform/CentralPlatformClient';
import type {
  PlatformPlan,
  PlatformTenant,
} from '../../../services/domains/platform/platformTypes';
import { MODULE_REGISTRY } from '../../../config/moduleRegistry';
import { PLATFORM_MODULE_TO_REGISTRY_IDS } from '../../../config/platformModuleMap';
import { listScreens } from '../../../config/screenRegistry';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState, StatusBadge, Toggle } from '../components/PlatformUI';
import { useToast } from '../../../components/ui/Toast';
import type { CreatedAccountInfo } from './constants';

// ─── Normalization helpers (local rows are camelCase, central API may return snake_case) ───

const pick = (row: any, ...keys: string[]): any => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const toBool = (value: any): boolean => value === true || value === 1 || value === '1' || value === 'true';

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
  minPlanCode?: string | null;
  screens: string[];
}

interface CatalogFeature {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isEnabled: boolean;
}

interface CatalogOverride {
  id: string;
  kind: 'MODULE' | 'FEATURE';
  code: string;
  isEnabled: boolean;
}

const normalizeModule = (row: any, screens: string[]): CatalogModule => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code') ?? pick(row, 'id') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
  minPlanCode: pick(row, 'minPlanCode', 'min_plan_code') ?? null,
  screens,
});

const normalizeFeature = (row: any): CatalogFeature => ({
  id: String(pick(row, 'id') ?? ''),
  code: String(pick(row, 'code', 'key') ?? ''),
  name: String(pick(row, 'name') ?? pick(row, 'code', 'key') ?? ''),
  description: pick(row, 'description') ?? null,
  category: pick(row, 'category') ?? null,
  isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
});

const normalizeOverride = (row: any): CatalogOverride | null => {
  const kind = String(pick(row, 'kind') ?? '').toUpperCase();
  if (kind !== 'MODULE' && kind !== 'FEATURE') return null;
  const code = String(pick(row, 'code') ?? '');
  if (!code) return null;
  return {
    id: String(pick(row, 'id') ?? ''),
    kind,
    code,
    isEnabled: toBool(pick(row, 'isEnabled', 'is_enabled', 'enabled')),
  };
};

// Maps each platform module code to the business-module registry entries whose
// route paths belong to it, so the wizard can show the actual app screens
// (pages) that follow each module toggle.
const REGISTRY_IDS_BY_MODULE: Record<string, string[]> = PLATFORM_MODULE_TO_REGISTRY_IDS;

const buildScreensByModule = (): Map<string, string[]> => {
  const registryById = new Map(MODULE_REGISTRY.map((entry) => [entry.id, entry]));
  const screens = listScreens();
  const labelFor = (path: string): string =>
    screens.find((screen) => screen.pathPattern === path)?.labelAr ?? path;

  const result = new Map<string, string[]>();
  for (const [moduleCode, registryIds] of Object.entries(REGISTRY_IDS_BY_MODULE)) {
    const labels: string[] = [];
    for (const registryId of registryIds) {
      const entry = registryById.get(registryId);
      for (const path of entry?.paths ?? []) {
        const label = labelFor(path);
        if (!labels.includes(label)) labels.push(label);
      }
    }
    result.set(moduleCode, labels);
  }
  return result;
};

// ─── Step indicator ────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { key: 'pages', label: 'الصفحات والوحدات', icon: <LayoutGrid className="h-4 w-4" /> },
  { key: 'features', label: 'المميزات', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'review', label: 'المراجعة والتطبيق', icon: <BadgeCheck className="h-4 w-4" /> },
];

const StepIndicator: React.FC<{ step: number }> = ({ step }) => (
  <div className="mb-5">
    <ol className="flex items-center gap-1.5 sm:gap-2">
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
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className={`hidden text-[11px] font-semibold sm:inline ${active ? 'text-success' : done ? 'text-ink-secondary' : 'text-muted'}`}>
                {item.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
    <div className="mt-2 flex items-center justify-between sm:hidden">
      <span className="text-[12px] font-bold text-ink">الخطوة {step + 1} من {WIZARD_STEPS.length}</span>
      <span className="text-[11px] font-semibold text-success">{WIZARD_STEPS[step].label}</span>
    </div>
  </div>
);

// ─── Catalog wizard ────────────────────────────────────────────────────────────

interface TenantCatalogWizardProps {
  open: boolean;
  onClose: () => void;
  tenant: PlatformTenant | null;
  plan: PlatformPlan | null;
  centralActive: boolean;
  canManageTenants: boolean;
  onApplied?: () => void;
}

type SelectionKey = string; // `${kind}:${code}`

const keyOf = (kind: 'MODULE' | 'FEATURE', code: string): SelectionKey => `${kind}:${code}`;

export const TenantCatalogWizard: React.FC<TenantCatalogWizardProps> = ({
  open,
  onClose,
  tenant,
  plan,
  centralActive,
  canManageTenants,
  onApplied,
}) => {
  const toast = useToast();
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [modules, setModules] = React.useState<CatalogModule[]>([]);
  const [features, setFeatures] = React.useState<CatalogFeature[]>([]);
  const [overrides, setOverrides] = React.useState<CatalogOverride[]>([]);
  const [selections, setSelections] = React.useState<Record<SelectionKey, boolean>>({});

  const screensByModule = React.useMemo(() => buildScreensByModule(), []);

  const planModuleCodes = React.useMemo(() => new Set(plan?.includedModules ?? []), [plan]);
  const planFeatureCodes = React.useMemo(() => new Set(plan?.features ?? []), [plan]);

  const overrideByKey = React.useMemo(() => {
    const map = new Map<SelectionKey, CatalogOverride>();
    for (const override of overrides) map.set(keyOf(override.kind, override.code), override);
    return map;
  }, [overrides]);

  const defaultFor = React.useCallback(
    (kind: 'MODULE' | 'FEATURE', code: string, fallbackEnabled: boolean): boolean => {
      if (kind === 'MODULE') {
        return plan ? planModuleCodes.has(code) : fallbackEnabled;
      }
      return plan ? planFeatureCodes.has(code) : fallbackEnabled;
    },
    [plan, planModuleCodes, planFeatureCodes]
  );

  const load = React.useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      let moduleRows: any[] = [];
      let featureRows: any[] = [];
      let overrideRows: any[] = [];

      if (centralActive) {
        const [m, f, o] = await Promise.all([
          centralPlatformClient.listModules().catch(() => [] as any[]),
          centralPlatformClient.listFeatureFlags().catch(() => [] as any[]),
          centralPlatformClient.listTenantOverrides(tenant.id).catch(() => [] as any[]),
        ]);
        moduleRows = Array.isArray(m) ? m : [];
        featureRows = Array.isArray(f) ? f : [];
        overrideRows = Array.isArray(o) ? o : [];
      } else {
        moduleRows = platformAdminService.listModules() as unknown as any[];
        featureRows = platformAdminService.listFeatureFlags() as unknown as any[];
        overrideRows = platformAdminService.listTenantOverrides(tenant.id) as unknown as any[];
      }

      const nextModules = (Array.isArray(moduleRows) ? moduleRows : []).map((row) =>
        normalizeModule(row, screensByModule.get(String(pick(row, 'code') ?? pick(row, 'id') ?? '')) ?? [])
      );
      const nextFeatures = (Array.isArray(featureRows) ? featureRows : []).map(normalizeFeature);
      const nextOverrides = (Array.isArray(overrideRows) ? overrideRows : [])
        .map(normalizeOverride)
        .filter((row): row is CatalogOverride => Boolean(row));

      setModules(nextModules);
      setFeatures(nextFeatures);
      setOverrides(nextOverrides);

      const nextSelections: Record<SelectionKey, boolean> = {};
      const nextOverrideMap = new Map<SelectionKey, CatalogOverride>();
      for (const override of nextOverrides) nextOverrideMap.set(keyOf(override.kind, override.code), override);

      for (const module of nextModules) {
        const key = keyOf('MODULE', module.code);
        const fallback = module.isEnabled;
        const planDefault = defaultFor('MODULE', module.code, fallback);
        const existing = nextOverrideMap.get(key);
        nextSelections[key] = existing ? existing.isEnabled : planDefault;
      }
      for (const feature of nextFeatures) {
        const key = keyOf('FEATURE', feature.code);
        const fallback = feature.isEnabled;
        const planDefault = defaultFor('FEATURE', feature.code, fallback);
        const existing = nextOverrideMap.get(key);
        nextSelections[key] = existing ? existing.isEnabled : planDefault;
      }
      setSelections(nextSelections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل كتالوج الصفحات والمميزات.');
    } finally {
      setLoading(false);
    }
  }, [tenant, centralActive, defaultFor, screensByModule]);

  React.useEffect(() => {
    if (open && tenant) {
      setStep(0);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenant?.id]);

  const setSelection = (kind: 'MODULE' | 'FEATURE', code: string, value: boolean) => {
    setSelections((current) => ({ ...current, [keyOf(kind, code)]: value }));
  };

  const ensureOverride = React.useCallback(
    async (kind: 'MODULE' | 'FEATURE', code: string, desired: boolean, existing: CatalogOverride | undefined) => {
      if (centralActive) {
        const body = { kind, code, value: null, isEnabled: desired };
        try {
          await centralPlatformClient.addTenantOverride(tenant!.id, body);
        } catch {
          if (existing) await centralPlatformClient.removeTenantOverride(tenant!.id, existing.id).catch(() => undefined);
          await centralPlatformClient.addTenantOverride(tenant!.id, body);
        }
        return;
      }
      if (existing) {
        platformAdminService.setTenantOverrideEnabled(existing.id, desired);
        return;
      }
      const created = platformAdminService.addTenantOverride(tenant!.id, { kind, code, isEnabled: desired });
      platformAdminService.setTenantOverrideEnabled(created.id, desired);
    },
    [centralActive, tenant]
  );

  const removeOverride = React.useCallback(
    async (override: CatalogOverride) => {
      if (centralActive) {
        await centralPlatformClient.removeTenantOverride(tenant!.id, override.id);
      } else {
        platformAdminService.removeTenantOverride(override.id);
      }
    },
    [centralActive, tenant]
  );

  const apply = async () => {
    if (!tenant) return;
    setApplying(true);
    let succeeded = 0;
    let failed = 0;
    const jobs: Array<() => Promise<void> | void> = [];

    const collect = (kind: 'MODULE' | 'FEATURE', code: string, fallbackEnabled: boolean) => {
      const key = keyOf(kind, code);
      const desired = selections[key] ?? defaultFor(kind, code, fallbackEnabled);
      const planDefault = defaultFor(kind, code, fallbackEnabled);
      const existing = overrideByKey.get(key);
      if (desired === planDefault) {
        if (existing) jobs.push(() => removeOverride(existing));
      } else {
        jobs.push(() => ensureOverride(kind, code, desired, existing));
      }
    };

    for (const module of modules) collect('MODULE', module.code, module.isEnabled);
    for (const feature of features) collect('FEATURE', feature.code, feature.isEnabled);

    for (const job of jobs) {
      try {
        await job();
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }

    setApplying(false);
    if (failed === 0) {
      toast.success('تم تطبيق إعدادات الصفحات والمميزات', `${succeeded} تغيير على ${tenant.name}`);
      onApplied?.();
      onClose();
    } else {
      toast.error('تعذر تطبيق بعض التغييرات', `${failed} فشل من أصل ${jobs.length} — راجع السجلات`);
      load();
    }
  };

  const deviations = React.useMemo(() => {
    const rows: Array<{ kind: 'MODULE' | 'FEATURE'; code: string; name: string; desired: boolean; planDefault: boolean }> = [];
    for (const module of modules) {
      const key = keyOf('MODULE', module.code);
      const planDefault = defaultFor('MODULE', module.code, module.isEnabled);
      const desired = selections[key] ?? planDefault;
      if (desired !== planDefault) rows.push({ kind: 'MODULE', code: module.code, name: module.name, desired, planDefault });
    }
    for (const feature of features) {
      const key = keyOf('FEATURE', feature.code);
      const planDefault = defaultFor('FEATURE', feature.code, feature.isEnabled);
      const desired = selections[key] ?? planDefault;
      if (desired !== planDefault) rows.push({ kind: 'FEATURE', code: feature.code, name: feature.name, desired, planDefault });
    }
    return rows;
  }, [modules, features, selections, defaultFor]);

  const enabledCount = modules.filter((m) => selections[keyOf('MODULE', m.code)] ?? defaultFor('MODULE', m.code, m.isEnabled)).length
    + features.filter((f) => selections[keyOf('FEATURE', f.code)] ?? defaultFor('FEATURE', f.code, f.isEnabled)).length;

  const planName = plan?.name ?? tenant?.planName ?? 'بدون باقة';

  const badgeFor = (kind: 'MODULE' | 'FEATURE', code: string, fallbackEnabled: boolean) => {
    const key = keyOf(kind, code);
    const desired = selections[key] ?? defaultFor(kind, code, fallbackEnabled);
    const planDefault = defaultFor(kind, code, fallbackEnabled);
    if (desired !== planDefault) {
      return desired
        ? { label: 'إضافة خاصة', className: 'bg-accent-soft text-primary border-accent-border' }
        : { label: 'موقوفة للعميل', className: 'bg-danger-soft text-danger border-danger-border' };
    }
    return planDefault
      ? { label: 'ضمن الباقة', className: 'bg-success-soft text-success border-success-border' }
      : { label: 'خارج الباقة', className: 'bg-surface-sunken text-muted border-line' };
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tenant ? `الصفحات والمميزات — ${tenant.name}` : 'الصفحات والمميزات'}
      description={tenant
        ? `تحكم في الصفحات والوحدات والمميزات المتاحة للعميل. الافتراضي يتبع باقته (${planName})، ويمكنك التجاوز لكل عميل على حدة.`
        : 'جارٍ التحميل...'}
      size="xl"
      busy={applying}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={applying}>إغلاق</Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={applying || loading} leadingIcon={<ChevronRight className="h-4 w-4" />}>
                السابق
              </Button>
            )}
            {step < WIZARD_STEPS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={loading} leadingIcon={<ChevronLeft className="h-4 w-4" />}>
                التالي
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={apply}
                loading={applying}
                disabled={!canManageTenants || loading || Boolean(error)}
                leadingIcon={<Check className="h-4 w-4" />}
              >
                تطبيق التغييرات
              </Button>
            )}
          </div>
        </div>
      }
    >
      <StepIndicator step={step} />

      {loading ? (
        <div className="py-16 text-center text-sm font-semibold text-muted">جارٍ تحميل كتالوج الصفحات والمميزات...</div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-[12px] font-semibold text-danger">
          {error}
          <button type="button" onClick={load} className="mr-3 text-success hover:underline">إعادة المحاولة</button>
        </div>
      ) : step === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-4 py-2.5">
            <p className="text-[11.5px] font-bold text-ink-secondary">
              الصفحات تتبع الوحدات — كل وحدة تحوي شاشاتها داخل تطبيق العميل.
            </p>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-bold text-muted ring-1 ring-line-strong">
              {modules.filter((m) => selections[keyOf('MODULE', m.code)] ?? defaultFor('MODULE', m.code, m.isEnabled)).length} / {modules.length} مفعّلة
            </span>
          </div>
          {modules.length === 0 ? (
            <EmptyState icon={<LayoutGrid className="h-5 w-5" />} title="لا توجد وحدات معرفة" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {modules.map((module) => {
                const key = keyOf('MODULE', module.code);
                const checked = selections[key] ?? defaultFor('MODULE', module.code, module.isEnabled);
                const badge = badgeFor('MODULE', module.code, module.isEnabled);
                return (
                  <div
                    key={module.id || module.code}
                    className={`rounded-xl border p-3 transition ${checked ? 'border-success-border bg-success-soft/40' : 'border-line bg-surface opacity-80'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                          {module.name}
                          <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{module.code}</span>
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-muted">{module.description || 'بدون وصف'}</p>
                      </div>
                      <Toggle
                        checked={checked}
                        onChange={(value) => setSelection('MODULE', module.code, value)}
                        label={module.name}
                        disabled={!canManageTenants || applying}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${badge.className}`}>{badge.label}</span>
                      {!module.isEnabled && (
                        <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[9.5px] font-bold text-muted">معطّلة على مستوى المنصة</span>
                      )}
                      {module.minPlanCode && (
                        <span className="rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[9.5px] font-bold text-primary">حد أدنى: {module.minPlanCode}</span>
                      )}
                    </div>
                    {module.screens.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 flex items-center gap-1 text-[9.5px] font-bold text-muted">
                          <MonitorSmartphone className="h-3 w-3" /> الشاشات ({module.screens.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {module.screens.slice(0, 4).map((screen) => (
                            <span key={screen} className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">{screen}</span>
                          ))}
                          {module.screens.length > 4 && (
                            <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[9.5px] font-bold text-muted">+{module.screens.length - 4}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : step === 1 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-4 py-2.5">
            <p className="text-[11.5px] font-bold text-ink-secondary">
              المميزات تضيف قدرات داخل الوحدات (مزامنة، تقارير متقدمة، فوترة إلكترونية...).
            </p>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-bold text-muted ring-1 ring-line-strong">
              {features.filter((f) => selections[keyOf('FEATURE', f.code)] ?? defaultFor('FEATURE', f.code, f.isEnabled)).length} / {features.length} مفعّلة
            </span>
          </div>
          {features.length === 0 ? (
            <EmptyState icon={<Sparkles className="h-5 w-5" />} title="لا توجد مميزات معرفة" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {features.map((feature) => {
                const key = keyOf('FEATURE', feature.code);
                const checked = selections[key] ?? defaultFor('FEATURE', feature.code, feature.isEnabled);
                const badge = badgeFor('FEATURE', feature.code, feature.isEnabled);
                return (
                  <div
                    key={feature.id || feature.code}
                    className={`flex items-start justify-between gap-3 rounded-xl border p-3 transition ${checked ? 'border-success-border bg-success-soft/40' : 'border-line bg-surface opacity-80'}`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                        {feature.name}
                        <span className="font-mono text-[9.5px] font-normal text-muted" dir="ltr">{feature.code}</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{feature.description || 'بدون وصف'}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${badge.className}`}>{badge.label}</span>
                        {feature.category && (
                          <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[9.5px] font-bold text-muted">{feature.category}</span>
                        )}
                      </div>
                    </div>
                    <Toggle
                      checked={checked}
                      onChange={(value) => setSelection('FEATURE', feature.code, value)}
                      label={feature.name}
                      disabled={!canManageTenants || applying}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-center">
              <p className="text-[22px] font-black text-ink">{modules.length}</p>
              <p className="text-[10.5px] font-bold text-muted">وحدة / صفحة</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-center">
              <p className="text-[22px] font-black text-ink">{features.length}</p>
              <p className="text-[10.5px] font-bold text-muted">ميزة</p>
            </div>
            <div className="rounded-xl border border-success-border bg-success-soft px-4 py-3 text-center">
              <p className="text-[22px] font-black text-success">{enabledCount}</p>
              <p className="text-[10.5px] font-bold text-success">سيكون متاحاً للعميل</p>
            </div>
          </div>

          <div className="rounded-xl border border-line">
            <div className="border-b border-line bg-surface-muted px-4 py-2.5">
              <p className="text-[11.5px] font-bold text-ink-secondary">
                انحرافات عن الباقة ({planName}) — {deviations.length === 0 ? 'لا توجد' : deviations.length}
              </p>
            </div>
            {deviations.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-[11.5px] font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" /> الإعدادات الحالية تطابق الباقة تماماً — لن تُنشأ تجاوزات خاصة.
              </p>
            ) : (
              <ul className="divide-y divide-line-strong">
                {deviations.map((row) => (
                  <li key={`${row.kind}:${row.code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11.5px]">
                    <span className="font-bold text-ink">{row.name}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge value={row.planDefault ? 'EXPIRED' : 'ACTIVE'} label={row.planDefault ? 'ضمن الباقة' : 'خارج الباقة'} />
                      <ChevronLeft className="h-3.5 w-3.5 text-muted" />
                      <StatusBadge value={row.desired ? 'ACTIVE' : 'SUSPENDED'} label={row.desired ? 'مفعّل' : 'موقوف'} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-accent-border bg-accent-soft px-3 py-2.5 text-[11px] leading-5 text-primary">
            <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              عند التطبيق تُسجَّل «تجاوزات عميل» فقط للعناصر المختلفة عن الباقة — إلغاء أي تجاوز يعيد العنصر لافتراضي الخطة.
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Post-creation choice ──────────────────────────────────────────────────────

interface TenantCreatedModalProps {
  open: boolean;
  tenant: PlatformTenant | null;
  account?: CreatedAccountInfo | null;
  onClose: () => void;
  onContinue: () => void;
}

export const TenantCreatedModal: React.FC<TenantCreatedModalProps> = ({ open, tenant, account, onClose, onContinue }) => {
  const [copied, setCopied] = React.useState(false);
  const credentialsText = account
    ? [
        `بيانات دخول ${tenant?.name ?? ''}`,
        `اسم المستخدم: ${account.username}`,
        account.temporaryPassword ? `كلمة المرور المؤقتة: ${account.temporaryPassword}` : null,
        account.activationCode ? `كود التفعيل: ${account.activationCode}` : null,
        `رابط الدخول: ${account.loginUrl}`,
      ].filter(Boolean).join('\n')
    : '';
  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(credentialsText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // الحافظة غير متاحة
    }
  };
  return (
  <Modal
    open={open}
    onClose={onClose}
    title="تم إنشاء العميل بنجاح"
    description={tenant ? `«${tenant.name}» جاهز الآن.${account ? ' تم إنشاء حساب الدخول له — انسخ بيانات الدخول قبل المغادرة.' : ' هل تريد إعداد صفحاته ومميزاته فوراً أم الاكتفاء بالإنهاء؟'}` : undefined}
    size="md"
  >
    <div className="space-y-4">
      {tenant && (
        <div className="flex items-center gap-3 rounded-xl border border-success-border bg-success-soft/60 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-ink">{tenant.name}</p>
            <p className="text-[10.5px] text-muted">
              رقم العميل <span dir="ltr" className="font-mono font-bold">{tenant.code}</span>
              {tenant.planName ? ` · ${tenant.planName}` : ''}
            </p>
          </div>
        </div>
      )}

      {account && (
        <div className="rounded-xl border border-accent-border bg-accent-soft/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11.5px] font-black text-primary">
              <KeyRound className="h-3.5 w-3.5" /> تم إنشاء حساب الدخول للعميل
            </p>
            <Button variant="secondary" size="sm" leadingIcon={<Copy className="h-3 w-3" />} onClick={copyCredentials}>
              {copied ? 'تم النسخ' : 'نسخ بيانات الدخول'}
            </Button>
          </div>
          <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2.5 py-1.5">
              <span className="text-muted">اسم المستخدم</span>
              <span className="font-mono font-bold text-ink" dir="ltr">{account.username}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2.5 py-1.5">
              <span className="text-muted">كلمة المرور المؤقتة</span>
              <span className="font-mono font-bold text-success" dir="ltr">{account.temporaryPassword ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2.5 py-1.5">
              <span className="text-muted">كود التفعيل</span>
              <span className="font-mono font-bold text-ink" dir="ltr">{account.activationCode ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface/80 px-2.5 py-1.5">
              <span className="text-muted">رابط الدخول</span>
              <span className="truncate font-mono text-[10px] font-bold text-ink-secondary" dir="ltr">{account.loginUrl}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onContinue}
          className="group flex flex-col items-start gap-2 rounded-xl border-2 border-success-border bg-success-soft/50 p-4 text-right transition hover:border-success hover:bg-success-soft"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-white transition group-hover:scale-105">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="text-[12.5px] font-black text-ink">إعداد الصفحات والمميزات</span>
          <span className="text-[10.5px] leading-5 text-muted">
            الانتقال التلقائي لمعالج يتيح إظهار/إخفاء الصفحات والوحدات والمميزات حسب الباقة أو بتجاوزات خاصة.
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-success">
            متابعة <ChevronLeft className="h-3.5 w-3.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="group flex flex-col items-start gap-2 rounded-xl border-2 border-line bg-surface p-4 text-right transition hover:border-line-strong hover:bg-surface-muted"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-muted transition group-hover:scale-105">
            <X className="h-5 w-5" />
          </span>
          <span className="text-[12.5px] font-black text-ink">إنهاء</span>
          <span className="text-[10.5px] leading-5 text-muted">
            العودة لقائمة العملاء — يمكن إعداد الصفحات والمميزات لاحقاً من ملف العميل.
          </span>
        </button>
      </div>
    </div>
  </Modal>
  );
};
