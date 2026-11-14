import React from 'react';
import { Layers3, Plus, Pencil, CheckCircle2, XCircle, Star } from 'lucide-react';
import { platformAdminService } from '../../services/domains/platform/PlatformAdminService';
import type {
  PlatformBillingCycle,
  PlatformModule,
  PlatformPlan,
  PlatformPlanInput,
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
  formatMoney,
  inputClass,
} from './components/PlatformUI';

const CYCLES: Array<{ value: PlatformBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'شهري' },
  { value: 'QUARTERLY', label: 'ربع سنوي' },
  { value: 'YEARLY', label: 'سنوي' },
  { value: 'LIFETIME', label: 'مدى الحياة' },
];

const CYCLE_LABELS = Object.fromEntries(CYCLES.map((item) => [item.value, item.label])) as Record<PlatformBillingCycle, string>;

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
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [modules, setModules] = React.useState<PlatformModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlatformPlan | null>(null);
  const [form, setForm] = React.useState<PlatformPlanInput>(emptyPlan);
  const [featuresText, setFeaturesText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    try {
      setPlans(platformAdminService.listPlans());
      setModules(platformAdminService.listModules());
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

  const openEdit = (plan: PlatformPlan) => {
    setEditing(plan);
    setForm({
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
    setSaving(true);
    try {
      const payload: PlatformPlanInput = {
        ...form,
        features: featuresText.split(',').map((item) => item.trim()).filter(Boolean),
      };
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
      <PageHeader
        title="خطط الاشتراك"
        description="أنشئ خطط التسعير وحدود الاستخدام والوحدات المتضمنة."
        icon={<Layers3 className="h-5 w-5" />}
        actions={
          <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
            خطة جديدة
          </Button>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm font-semibold text-slate-500 shadow-sm">جارٍ تحميل الخطط...</div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <EmptyState icon={<Layers3 className="h-5 w-5" />} title="لا توجد خطط" description="أضف خطة اشتراك للبدء." />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-black text-slate-900">{plan.name}</h3>
                    {plan.isDefault && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400" dir="ltr">{plan.code}</p>
                </div>
                <StatusBadge value={plan.isActive ? 'ACTIVE' : 'CANCELLED'} label={plan.isActive ? 'نشطة' : 'معطلة'} />
              </div>

              <p className="mt-2 min-h-[32px] text-[11.5px] leading-5 text-slate-500">{plan.description || 'بدون وصف'}</p>

              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-[20px] font-black leading-none text-slate-900">{formatMoney(plan.price, plan.currency)}</p>
                <p className="mt-1 text-[10.5px] font-semibold text-slate-500">{CYCLE_LABELS[plan.billingCycle]}</p>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[10.5px]">
                <div className="rounded bg-slate-50 py-1.5"><dt className="text-slate-500">مستخدمون</dt><dd className="font-bold text-slate-800">{plan.seatsLimit}</dd></div>
                <div className="rounded bg-slate-50 py-1.5"><dt className="text-slate-500">فروع</dt><dd className="font-bold text-slate-800">{plan.branchesLimit}</dd></div>
                <div className="rounded bg-slate-50 py-1.5"><dt className="text-slate-500">أجهزة</dt><dd className="font-bold text-slate-800">{plan.devicesLimit}</dd></div>
              </dl>

              <div className="mt-3 flex-1">
                <p className="mb-1 text-[10.5px] font-bold text-slate-500">الوحدات ({plan.includedModules.length})</p>
                <div className="flex flex-wrap gap-1">
                  {plan.includedModules.slice(0, 6).map((code) => (
                    <span key={code} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-700">{code}</span>
                  ))}
                  {plan.includedModules.length > 6 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-semibold text-slate-500">+{plan.includedModules.length - 6}</span>
                  )}
                  {plan.includedModules.length === 0 && <span className="text-[10px] text-slate-400">—</span>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10.5px] text-slate-500">{plan.subscriberCount ?? 0} مشترك</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(plan)} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700" title="تعديل">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(plan)}
                    className={`rounded p-1.5 ${plan.isActive ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-700' : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
                    title={plan.isActive ? 'تعطيل' : 'تفعيل'}
                  >
                    {plan.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
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
            <Button variant="primary" onClick={save} loading={saving}>{editing ? 'حفظ التعديلات' : 'إنشاء الخطة'}</Button>
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

        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold text-slate-800">الوحدات المتضمنة</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">{(form.includedModules ?? []).length} مختارة</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {modules.map((module) => (
              <label key={module.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-slate-700">{module.name}</span>
                  <span className="block truncate font-mono text-[9.5px] text-slate-400" dir="ltr">{module.code}</span>
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

        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
          <div>
            <p className="text-[12px] font-bold text-slate-800">الخطة نشطة</p>
            <p className="text-[10.5px] text-slate-500">الخطط المعطلة لا يمكن إصدار تراخيص منها.</p>
          </div>
          <Toggle checked={form.isActive !== false} onChange={(next) => setForm({ ...form, isActive: next })} label="تفعيل الخطة" />
        </div>
      </Modal>
    </div>
  );
};

export default PlatformPlansPage;
