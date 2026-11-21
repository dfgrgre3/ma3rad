import React from 'react';
import { Link } from 'react-router-dom';
import {
  Layers3,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Star,
  Search,
  Eye,
  Copy,
  Trash2,
  GitBranch,
  Crown,
  Wand2,
} from 'lucide-react';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformModule,
  PlatformPlan,
  PlatformPlanInput,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/Toast';
import {
  EmptyState,
  StatusBadge,
  formatMoney,
  inputClass,
} from './components/PlatformUI';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';
import {
  listPlans,
  listModules,
  setPlanActive,
  deletePlan,
  updatePlan,
  getPlanDeactivationCheck,
} from './PlatformPlansPage/planData';
import { PlanFormModal } from './PlatformPlansPage/PlanFormModal';
import { PlanDetailModal } from './PlatformPlansPage/PlanDetailModal';
import { UpgradeRulesModal } from './PlatformPlansPage/UpgradeRulesModal';
import { CopyPlanModal } from './PlatformPlansPage/CopyPlanModal';

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: 'شهري',
  QUARTERLY: 'ربع سنوي',
  YEARLY: 'سنوي',
  LIFETIME: 'مدى الحياة',
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type SortKey = 'sortOrder' | 'name' | 'price' | 'subscribers';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'sortOrder', label: 'ترتيب العرض' },
  { value: 'name', label: 'الاسم' },
  { value: 'price', label: 'السعر' },
  { value: 'subscribers', label: 'المشتركون' },
];

const toPlanInput = (plan: PlatformPlan): PlatformPlanInput => ({
  code: plan.code,
  name: plan.name,
  description: plan.description ?? '',
  billingCycle: plan.billingCycle,
  price: plan.price,
  monthlyPrice: plan.monthlyPrice,
  yearlyPrice: plan.yearlyPrice,
  currency: plan.currency,
  seatsLimit: plan.seatsLimit,
  branchesLimit: plan.branchesLimit,
  devicesLimit: plan.devicesLimit,
  storageLimitMb: plan.storageLimitMb,
  maxProducts: plan.maxProducts,
  maxWarehouses: plan.maxWarehouses,
  trialDays: plan.trialDays,
  offlineGracePeriodDays: plan.offlineGracePeriodDays,
  includedModules: plan.includedModules,
  features: plan.features,
  permissions: plan.permissions,
  isActive: plan.isActive,
  isDefault: plan.isDefault,
  sortOrder: plan.sortOrder,
  versioned: plan.versioned,
});

export const PlatformPlansPage: React.FC = () => {
  const toast = useToast();
  const canManagePlans = canPlatform('plans');
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL');
  const [sortKey, setSortKey] = React.useState<SortKey>('sortOrder');

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlatformPlan | null>(null);
  const [detailPlan, setDetailPlan] = React.useState<PlatformPlan | null>(null);
  const [copySource, setCopySource] = React.useState<PlatformPlan | null>(null);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [planRows, moduleRows] = await Promise.all([listPlans(), listModules()]);
      setPlans(planRows);
      setModules(moduleRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الخطط.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (plan: PlatformPlan) => {
    setEditing(plan);
    setFormOpen(true);
  };

  const filteredPlans = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = plans;
    if (statusFilter === 'ACTIVE') list = list.filter((p) => p.isActive);
    else if (statusFilter === 'INACTIVE') list = list.filter((p) => !p.isActive);
    if (term) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.code.toLowerCase().includes(term) ||
          (p.description ?? '').toLowerCase().includes(term)
      );
    }
    const sorted = [...list];
    switch (sortKey) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        break;
      case 'price':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'subscribers':
        sorted.sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0));
        break;
      default:
        sorted.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'ar'));
    }
    return sorted;
  }, [plans, search, statusFilter, sortKey]);

  const handleToggleActive = async (plan: PlatformPlan) => {
    if (!canManagePlans) {
      toast.error('لا تملك صلاحية إدارة الخطط');
      return;
    }
    if (busyId) return;
    setBusyId(plan.id);
    try {
      if (plan.isActive) {
        const check = await getPlanDeactivationCheck(plan.id);
        if (!check.canDeactivate) {
          toast.warning('تعذر التعطيل', check.message);
          return;
        }
        if (!window.confirm(`تعطيل الخطة «${plan.name}»؟ لن يمكن إصدار تراخيص جديدة منها.`)) return;
      } else if (!window.confirm(`تفعيل الخطة «${plan.name}»؟`)) {
        return;
      }
      await setPlanActive(plan.id, !plan.isActive);
      toast.success(plan.isActive ? 'تم تعطيل الخطة' : 'تم تفعيل الخطة');
      await load();
    } catch (err) {
      toast.error('تعذر تحديث الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (plan: PlatformPlan) => {
    if (!canManagePlans || busyId) return;
    setBusyId(plan.id);
    try {
      await updatePlan(plan.id, { ...toPlanInput(plan), isDefault: true });
      toast.success('تم تعيين الخطة الافتراضية', plan.name);
      await load();
    } catch (err) {
      toast.error('تعذر تعيين الخطة الافتراضية', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (plan: PlatformPlan) => {
    if (!canManagePlans || busyId) return;
    if (!window.confirm(`حذف الخطة «${plan.name}» نهائياً؟ لا يمكن التراجع.\n(الخطط المرتبطة باشتراكات أو تراخيص لا يمكن حذفها — عطّلها بدلاً من ذلك.)`)) return;
    setBusyId(plan.id);
    try {
      await deletePlan(plan.id);
      toast.success('تم حذف الخطة', plan.name);
      await load();
    } catch (err) {
      toast.error('تعذر حذف الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const moduleName = (code: string) => modules.find((m) => m.code === code)?.name ?? code;

  return (
    <div className="space-y-4">
      <CentralUnsupportedNotice feature="إدارة خطط الاشتراك" />
      <PageHeader
        title="خطط الاشتراك"
        description="أنشئ خطط التسعير وحدود الاستخدام والوحدات المتضمنة — مع الإصدارات وقواعد الترقية."
        icon={<Layers3 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {canManagePlans && (
              <Button variant="secondary" size="sm" leadingIcon={<GitBranch className="h-3.5 w-3.5" />} onClick={() => setRulesOpen(true)}>
                قواعد الترقية
              </Button>
            )}
            {canManagePlans && (
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                خطة جديدة
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            className={`${inputClass} pr-9`}
            placeholder="ابحث بالاسم أو الرمز أو الوصف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={`${inputClass} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="ALL">كل الحالات</option>
          <option value="ACTIVE">نشطة</option>
          <option value="INACTIVE">معطلة</option>
        </select>
        <select className={`${inputClass} w-auto`} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>ترتيب: {opt.label}</option>)}
        </select>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[10.5px] font-bold text-ink-secondary">
          {filteredPlans.length} خطة
        </span>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface py-16 text-center text-sm font-semibold text-muted shadow-sm">جارٍ تحميل الخطط...</div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface shadow-sm">
          <EmptyState
            icon={<Layers3 className="h-5 w-5" />}
            title={plans.length === 0 ? 'لا توجد خطط' : 'لا نتائج مطابقة'}
            description={plans.length === 0 ? 'أضف خطة اشتراك للبدء.' : 'جرّب تعديل البحث أو الفلاتر.'}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPlans.map((plan) => (
            <article key={plan.id} className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-black text-ink">{plan.name}</h3>
                    {plan.isDefault && (
                      <span title="الخطة الافتراضية" className="flex items-center gap-0.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] font-black text-warning">
                        <Crown className="h-3 w-3" /> افتراضية
                      </span>
                    )}
                    {plan.isDefault && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-muted" dir="ltr">{plan.code}</p>
                </div>
                <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
              </div>

              <p className="mt-2 min-h-[32px] text-[11.5px] leading-5 text-muted">{plan.description || 'بدون وصف'}</p>

              <div className="mt-3 rounded-lg bg-surface-muted p-3">
                <p className="text-[20px] font-black leading-none text-ink">{formatMoney(plan.price, plan.currency)}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-muted">
                  {CYCLE_LABELS[plan.billingCycle] ?? plan.billingCycle}
                  {plan.versioned && <span className="mr-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-primary">v{plan.currentVersion ?? 1}</span>}
                </p>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[10.5px]">
                <div className="rounded bg-surface-muted py-1.5"><dt className="text-muted">مستخدمون</dt><dd className="font-bold text-ink">{plan.seatsLimit}</dd></div>
                <div className="rounded bg-surface-muted py-1.5"><dt className="text-muted">فروع</dt><dd className="font-bold text-ink">{plan.branchesLimit}</dd></div>
                <div className="rounded bg-surface-muted py-1.5"><dt className="text-muted">أجهزة</dt><dd className="font-bold text-ink">{plan.devicesLimit}</dd></div>
              </dl>

              <div className="mt-3 flex-1">
                <p className="mb-1 text-[10.5px] font-bold text-muted">الوحدات ({plan.includedModules.length})</p>
                <div className="flex flex-wrap gap-1">
                  {plan.includedModules.slice(0, 6).map((code) => (
                    <span key={code} className="rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-semibold text-success" title={moduleName(code)}>{code}</span>
                  ))}
                  {plan.includedModules.length > 6 && (
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[9.5px] font-semibold text-muted">+{plan.includedModules.length - 6}</span>
                  )}
                  {plan.includedModules.length === 0 && <span className="text-[10px] text-muted">—</span>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[10.5px] text-muted">{plan.subscriberCount ?? 0} مشترك</span>
                <div className="flex items-center gap-0.5">
                  <Link
                    to={`/platform/plan-catalog?plan=${encodeURIComponent(plan.id)}`}
                    className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary"
                    title="فتح في منشئ الخطط والصفحات والمميزات"
                    aria-label={`فتح ${plan.name} في المنشئ`}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </Link>
                  <button type="button" onClick={() => setDetailPlan(plan)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="التفاصيل">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  {canManagePlans && (
                    <>
                      <button type="button" onClick={() => openEdit(plan)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setCopySource(plan)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="نسخ">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {!plan.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefault(plan)}
                          disabled={busyId === plan.id}
                          className="rounded p-1.5 text-muted hover:bg-warning-soft hover:text-warning"
                          title="تعيين كافتراضية"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(plan)}
                        disabled={busyId === plan.id}
                        className={`rounded p-1.5 ${plan.isActive ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-success-soft hover:text-success'}`}
                        title={plan.isActive ? 'تعطيل' : 'تفعيل'}
                      >
                        {plan.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(plan)}
                        disabled={busyId === plan.id || (plan.subscriberCount ?? 0) > 0}
                        className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                        title={(plan.subscriberCount ?? 0) > 0 ? 'لا يمكن حذف خطة عليها مشتركون' : 'حذف'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PlanFormModal
        open={formOpen}
        editing={editing}
        modules={modules}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />
      <PlanDetailModal
        open={Boolean(detailPlan)}
        plan={detailPlan}
        plans={plans}
        onClose={() => setDetailPlan(null)}
      />
      <CopyPlanModal
        open={Boolean(copySource)}
        source={copySource}
        onClose={() => setCopySource(null)}
        onCopied={() => void load()}
      />
      <UpgradeRulesModal
        open={rulesOpen}
        plans={plans}
        onClose={() => setRulesOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
};

export default PlatformPlansPage;
