import React from 'react';
import { Layers3, Plus, Pencil, CheckCircle2, XCircle, Star } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import { centralPlatformClient } from '../../services/domains/platform/CentralPlatformClient';
import { getCentralDataSourceState } from '../../hooks/platform/useCentralDataSource';
import { canPlatform } from '../../hooks/platform/usePlatformPermission';
import type {
  PlatformBillingCycle,
  PlatformModule,
  PlatformPlan,
  PlatformPlanInput,
} from '../../services/domains/platform/platformTypes';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import {
  EmptyState,
  Field,
  StatusBadge,
  Toggle,
  formatMoney,
  inputClass,
} from './components/PlatformUI';
import { CentralUnsupportedNotice } from './components/CentralUnsupportedNotice';

import { useToast } from '../../components/ui/Toast';
const CYCLES: Array<{ value: PlatformBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'شهري' },
  { value: 'QUARTERLY', label: 'ربع سنوي' },
  { value: 'YEARLY', label: 'سنوي' },
  { value: 'LIFETIME', label: 'مدى الحياة' },
];

const CYCLE_LABELS = Object.fromEntries(CYCLES.map((item) => [item.value, item.label])) as Record<PlatformBillingCycle, string>;

/** Central module rows may use snake_case; normalize to the local PlatformModule shape. */
const normalizeCentralModule = (row: any): PlatformModule => ({
  id: String(row?.id ?? row?.code ?? ''),
  code: String(row?.code ?? row?.id ?? ''),
  name: String(row?.name ?? row?.code ?? ''),
  description: row?.description ?? null,
  category: row?.category ?? null,
  isEnabled: Boolean(row?.isEnabled ?? row?.is_enabled ?? row?.isActive ?? row?.is_active ?? true),
  minPlanCode: row?.minPlanCode ?? row?.min_plan_code ?? null,
  sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? 0) || 0,
  isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
  createdAt: String(row?.createdAt ?? row?.created_at ?? ''),
  updatedAt: String(row?.updatedAt ?? row?.updated_at ?? ''),
});

const emptyPlan: PlatformPlanInput = {
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

export const PlatformPlansPage: React.FC = () => {
  const toast = useToast();
  const canManagePlans = canPlatform('plans');
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlatformPlan | null>(null);
  const [form, setForm] = React.useState<PlatformPlanInput>(emptyPlan);
  const [featuresText, setFeaturesText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const centralState = getCentralDataSourceState();
      if (centralState.misconfigured) {
        throw new Error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      }
      if (centralState.active) {
        const [planRows, moduleRows] = await Promise.all([
          centralPlatformClient.listPlans(),
          centralPlatformClient.listModules(),
        ]);
        setPlans(planRows);
        setModules((Array.isArray(moduleRows) ? moduleRows : []).map(normalizeCentralModule));
      } else {
        setPlans(platformAdminService.listPlans());
        setModules(platformAdminService.listModules());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الخطط.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPlan);
    setFeaturesText('');
    setFormOpen(true);
  };

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
    includedModules: plan.includedModules,
    features: plan.features,
    permissions: plan.permissions,
    isActive: plan.isActive,
  });

  const openEdit = (plan: PlatformPlan) => {
    setEditing(plan);
    setForm(toPlanInput(plan));
    setFeaturesText(plan.features.join(', '));
    setFormOpen(true);
  };

  const toggleModule = (code: string) => {
    setForm((current) => {
      const list = current.includedModules ?? [];
      return {
        ...current,
        includedModules: list.includes(code) ? list.filter((item) => item !== code) : [...list, code],
      };
    });
  };

  const save = () => {
    if (!canManagePlans) {
      toast.error('لا تملك صلاحية إدارة الخطط');
      return;
    }
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('اسم الخطة ورمزها مطلوبان');
      return;
    }
    setSaving(true);
    const payload: PlatformPlanInput = {
      ...form,
      features: featuresText.split(',').map((item) => item.trim()).filter(Boolean),
    };
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      setSaving(false);
      return;
    }
    if (central.active) {
      // Central mode: never fall through to local writes.
      const request = editing
        ? centralPlatformClient.updatePlan(editing.id, payload as Record<string, any>)
        : centralPlatformClient.createPlan(payload as Record<string, any>);
      request
        .then(() => {
          toast.success(editing ? 'تم تحديث الخطة' : 'تم إنشاء الخطة');
          setFormOpen(false);
          load();
        })
        .catch((err) => toast.error('تعذر حفظ الخطة', err instanceof Error ? err.message : undefined))
        .finally(() => setSaving(false));
      return;
    }
    try {
      if (editing) {
        platformAdminService.updatePlan(editing.id, payload);
        toast.success('تم تحديث الخطة');
      } else {
        platformAdminService.createPlan(payload);
        toast.success('تم إنشاء الخطة');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error('تعذر حفظ الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (plan: PlatformPlan) => {
    if (!canManagePlans) {
      toast.error('لا تملك صلاحية إدارة الخطط');
      return;
    }
    const central = getCentralDataSourceState();
    if (central.misconfigured) {
      toast.error('مصدر البيانات مضبوط على «المركزي» لكن جسر الاتصال بالسيرفر غير متاح في هذا الإصدار.');
      return;
    }
    if (central.active) {
      // No dedicated activate/deactivate endpoint — send the full plan payload.
      const payload: PlatformPlanInput = { ...toPlanInput(plan), isActive: !plan.isActive };
      centralPlatformClient.updatePlan(plan.id, payload as Record<string, any>)
        .then(() => {
          toast.success(plan.isActive ? 'تم تعطيل الخطة' : 'تم تفعيل الخطة');
          load();
        })
        .catch((err) => toast.error('تعذر تحديث الخطة', err instanceof Error ? err.message : undefined));
      return;
    }
    try {
      platformAdminService.setPlanActive(plan.id, !plan.isActive);
      toast.success(plan.isActive ? 'تم تعطيل الخطة' : 'تم تفعيل الخطة');
      load();
    } catch (err) {
      toast.error('تعذر تحديث الخطة', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <CentralUnsupportedNotice feature="إدارة وحدات ومنتج المنصة" />
      <PageHeader
        title="خطط الاشتراك"
        description="أنشئ خطط التسعير وحدود الاستخدام والوحدات المتضمنة."
        icon={<Layers3 className="h-5 w-5" />}
        actions={
          canManagePlans ? (
            <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
              خطة جديدة
            </Button>
          ) : null
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-surface py-16 text-center text-sm font-semibold text-muted shadow-sm">جارٍ تحميل الخطط...</div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface shadow-sm">
          <EmptyState icon={<Layers3 className="h-5 w-5" />} title="لا توجد خطط" description="أضف خطة اشتراك للبدء." />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-black text-ink">{plan.name}</h3>
                    {plan.isDefault && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-muted" dir="ltr">{plan.code}</p>
                </div>
                <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
              </div>

              <p className="mt-2 min-h-[32px] text-[11.5px] leading-5 text-muted">{plan.description || 'بدون وصف'}</p>

              <div className="mt-3 rounded-lg bg-surface-muted p-3">
                <p className="text-[20px] font-black leading-none text-ink">{formatMoney(plan.price, plan.currency)}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-muted">{CYCLE_LABELS[plan.billingCycle]}</p>
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
                    <span key={code} className="rounded-full bg-success-soft px-2 py-0.5 text-[9.5px] font-semibold text-success">{code}</span>
                  ))}
                  {plan.includedModules.length > 6 && (
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[9.5px] font-semibold text-muted">+{plan.includedModules.length - 6}</span>
                  )}
                  {plan.includedModules.length === 0 && <span className="text-[10px] text-muted">—</span>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[10.5px] text-muted">{plan.subscriberCount ?? 0} مشترك</span>
                <div className="flex items-center gap-1">
                  {canManagePlans && (
                    <>
                      <button type="button" onClick={() => openEdit(plan)} className="rounded p-1.5 text-muted hover:bg-accent-soft hover:text-primary" title="تعديل">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(plan)}
                        className={`rounded p-1.5 ${plan.isActive ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-success-soft hover:text-success'}`}
                        title={plan.isActive ? 'تعطيل' : 'تفعيل'}
                      >
                        {plan.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'تعديل الخطة' : 'خطة اشتراك جديدة'}
        description="حدد التسعير والحدود والوحدات المتضمنة."
        size="lg"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!canManagePlans}>{editing ? 'حفظ التعديلات' : 'إنشاء الخطة'}</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الخطة" required>
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="رمز الخطة" required hint={editing ? 'لا يمكن تغيير الرمز' : 'أحرف إنجليزية وأرقام و_ فقط'}>
            <input dir="ltr" className={inputClass} value={form.code} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
          </Field>
          <Field label="دورة الفوترة">
            <select className={inputClass} value={form.billingCycle} onChange={(event) => setForm({ ...form, billingCycle: event.target.value as PlatformBillingCycle })}>
              {CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
            </select>
          </Field>
          <Field label="السعر (أساس)">
            <input type="number" min={0} className={inputClass} value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
          </Field>
          <Field label="السعر شهري">
            <input type="number" min={0} className={inputClass} value={form.monthlyPrice ?? 0} onChange={(event) => setForm({ ...form, monthlyPrice: Number(event.target.value) })} />
          </Field>
          <Field label="السعر سنوي">
            <input type="number" min={0} className={inputClass} value={form.yearlyPrice ?? 0} onChange={(event) => setForm({ ...form, yearlyPrice: Number(event.target.value) })} />
          </Field>
          <Field label="أيام التجربة">
            <input type="number" min={0} className={inputClass} value={form.trialDays ?? 14} onChange={(event) => setForm({ ...form, trialDays: Number(event.target.value) })} />
          </Field>
          <Field label="العملة">
            <select className={inputClass} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              {['EGP', 'SAR', 'AED', 'USD', 'EUR'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="حد المستخدمين">
            <input type="number" min={1} className={inputClass} value={form.seatsLimit} onChange={(event) => setForm({ ...form, seatsLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الفروع">
            <input type="number" min={1} className={inputClass} value={form.branchesLimit} onChange={(event) => setForm({ ...form, branchesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={form.devicesLimit} onChange={(event) => setForm({ ...form, devicesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="مساحة التخزين (MB)">
            <input type="number" min={0} className={inputClass} value={form.storageLimitMb ?? 500} onChange={(event) => setForm({ ...form, storageLimitMb: Number(event.target.value) })} />
          </Field>
          <Field label="حد المنتجات">
            <input type="number" min={0} className={inputClass} value={form.maxProducts ?? 1000} onChange={(event) => setForm({ ...form, maxProducts: Number(event.target.value) })} />
          </Field>
          <Field label="حد المخازن">
            <input type="number" min={0} className={inputClass} value={form.maxWarehouses ?? 2} onChange={(event) => setForm({ ...form, maxWarehouses: Number(event.target.value) })} />
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <Field label="المزايا (مفصولة بفواصل)" className="sm:col-span-2">
            <input className={inputClass} value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} placeholder="دعم أولوية, تقارير متقدمة, متعدد الفروع" />
          </Field>
          <Field label="الصلاحيات (مفصولة بفواصل)" className="sm:col-span-2">
            <input
              className={inputClass}
              dir="ltr"
              value={(form.permissions ?? []).join(', ')}
              onChange={(event) => setForm({ ...form, permissions: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
              placeholder="sales.view, reports.export"
            />
          </Field>
        </div>

        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-ink">الوحدات المتضمنة</span>
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10.5px] font-bold text-ink-secondary">{(form.includedModules ?? []).length} مختارة</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {modules.map((module) => (
              <label key={module.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-ink">{module.name}</span>
                  <span className="block truncate font-mono text-[9.5px] text-muted" dir="ltr">{module.code}</span>
                </span>
                <Toggle
                  checked={(form.includedModules ?? []).includes(module.code)}
                  onChange={() => toggleModule(module.code)}
                  label={module.name}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <div>
            <p className="text-[12px] font-bold text-ink">الخطة نشطة</p>
            <p className="text-[10.5px] text-muted">الخطط المعطلة لا يمكن إصدار تراخيص منها.</p>
          </div>
          <Toggle checked={form.isActive !== false} onChange={(next) => setForm({ ...form, isActive: next })} label="تفعيل الخطة" />
        </div>
      </Modal>
    </div>
  );
};

export default PlatformPlansPage;
