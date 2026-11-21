import React from 'react';
import type { PlatformBillingCycle, PlatformPlanInput } from '../../../services/domains/platform/platformTypes';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Toggle, inputClass } from '../components/PlatformUI';
import { CURRENCIES, CYCLES, emptyPlanForm, numericInput, type CatalogModule, type CatalogPlan } from './shared';

export interface PlanDetailsModalProps {
  open: boolean;
  onClose: () => void;
  /** null → create mode; a plan → edit mode (code becomes read-only). */
  editing: CatalogPlan | null;
  modules: CatalogModule[];
  saving: boolean;
  canManagePlans: boolean;
  onSubmit: (input: PlatformPlanInput) => void;
}

const toForm = (plan: CatalogPlan | null): PlatformPlanInput =>
  plan
    ? {
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
        includedModules: [...plan.includedModules],
        features: [...plan.features],
        permissions: [...plan.permissions],
        isActive: plan.isActive,
        isDefault: plan.isDefault,
        sortOrder: plan.sortOrder,
        offlineGracePeriodDays: plan.offlineGracePeriodDays,
      }
    : { ...emptyPlanForm };

export const PlanDetailsModal: React.FC<PlanDetailsModalProps> = ({
  open,
  onClose,
  editing,
  modules,
  saving,
  canManagePlans,
  onSubmit,
}) => {
  const [form, setForm] = React.useState<PlatformPlanInput>(() => toForm(editing));

  // Re-seed the form whenever a different plan (or create mode) is opened.
  React.useEffect(() => {
    if (open) setForm(toForm(editing));
  }, [open, editing]);

  const set = <K extends keyof PlatformPlanInput>(key: K, value: PlatformPlanInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleModule = (code: string) => {
    const list = form.includedModules ?? [];
    set('includedModules', list.includes(code) ? list.filter((item) => item !== code) : [...list, code]);
  };

  const submit = () => {
    const payload: PlatformPlanInput = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      price: numericInput(form.price),
      monthlyPrice: form.monthlyPrice == null ? undefined : numericInput(form.monthlyPrice),
      yearlyPrice: form.yearlyPrice == null ? undefined : numericInput(form.yearlyPrice),
      trialDays: form.trialDays == null ? undefined : numericInput(form.trialDays),
      seatsLimit: numericInput(form.seatsLimit, 1),
      branchesLimit: numericInput(form.branchesLimit, 1),
      devicesLimit: numericInput(form.devicesLimit, 1),
      permissions: (form.permissions ?? []).filter(Boolean),
      // `features` holds feature-flag CODES managed by wizard step 2 — the
      // details form never edits it (the plans page's marketing-text field
      // shares the same column; editing it here would corrupt gating).
    };
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `تعديل الخطة — ${editing.name}` : 'خطة اشتراك جديدة'}
      description={
        editing
          ? 'عدّل التسعير والحدود والوحدات والمميزات — الوحدات والمميزات هنا هي الحالة المحفوظة، بينما الخطوات اللاحقة تبني المسودات.'
          : 'أنشئ الباقة بكل بياناتها ثم انتقل للخطوات التالية لبناء صفحاتها ومميزاتها.'
      }
      size="xl"
      busy={saving}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!canManagePlans}>
            {editing ? 'حفظ التعديلات' : 'إنشاء الخطة'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم الخطة" required>
          <input className={inputClass} value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label="رمز الخطة" required hint={editing ? 'لا يمكن تغيير الرمز' : 'أحرف إنجليزية كبيرة وأرقام و_ فقط'}>
          <input
            dir="ltr"
            className={inputClass}
            value={form.code}
            disabled={Boolean(editing)}
            onChange={(event) => set('code', event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="دورة الفوترة">
          <select
            className={inputClass}
            value={form.billingCycle ?? 'MONTHLY'}
            onChange={(event) => set('billingCycle', event.target.value as PlatformBillingCycle)}
          >
            {CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
          </select>
        </Field>
        <Field label="العملة">
          <select className={inputClass} value={form.currency ?? 'EGP'} onChange={(event) => set('currency', event.target.value)}>
            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </Field>
        <Field label="السعر">
          <input type="number" min={0} className={inputClass} value={form.price ?? 0} onChange={(event) => set('price', Number(event.target.value))} />
        </Field>
        <Field label="السعر شهري">
          <input type="number" min={0} className={inputClass} value={form.monthlyPrice ?? 0} onChange={(event) => set('monthlyPrice', Number(event.target.value))} />
        </Field>
        <Field label="السعر سنوي">
          <input type="number" min={0} className={inputClass} value={form.yearlyPrice ?? 0} onChange={(event) => set('yearlyPrice', Number(event.target.value))} />
        </Field>
        <Field label="أيام التجربة">
          <input type="number" min={0} className={inputClass} value={form.trialDays ?? 14} onChange={(event) => set('trialDays', Number(event.target.value))} />
        </Field>
        <Field label="حد المستخدمين">
          <input type="number" min={1} className={inputClass} value={form.seatsLimit ?? 3} onChange={(event) => set('seatsLimit', Number(event.target.value))} />
        </Field>
        <Field label="حد الفروع">
          <input type="number" min={1} className={inputClass} value={form.branchesLimit ?? 1} onChange={(event) => set('branchesLimit', Number(event.target.value))} />
        </Field>
        <Field label="حد الأجهزة">
          <input type="number" min={1} className={inputClass} value={form.devicesLimit ?? 2} onChange={(event) => set('devicesLimit', Number(event.target.value))} />
        </Field>
        <Field label="مساحة التخزين (MB)">
          <input type="number" min={0} className={inputClass} value={form.storageLimitMb ?? 500} onChange={(event) => set('storageLimitMb', Number(event.target.value))} />
        </Field>
        <Field label="حد المنتجات">
          <input type="number" min={0} className={inputClass} value={form.maxProducts ?? 1000} onChange={(event) => set('maxProducts', Number(event.target.value))} />
        </Field>
        <Field label="حد المخازن">
          <input type="number" min={0} className={inputClass} value={form.maxWarehouses ?? 2} onChange={(event) => set('maxWarehouses', Number(event.target.value))} />
        </Field>
        <Field label="فترة السماح دون اتصال (يوم)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.offlineGracePeriodDays ?? 14}
            onChange={(event) => set('offlineGracePeriodDays', Number(event.target.value))}
          />
        </Field>
        <Field label="ترتيب العرض">
          <input type="number" className={inputClass} value={form.sortOrder ?? 0} onChange={(event) => set('sortOrder', Number(event.target.value))} />
        </Field>
        <Field label="الوصف" className="sm:col-span-2">
          <textarea rows={2} className={inputClass} value={form.description ?? ''} onChange={(event) => set('description', event.target.value)} />
        </Field>
        <Field label="الصلاحيات (مفصولة بفواصل)" className="sm:col-span-2" hint="أكواد صلاحيات خام مثل sales.view — نادراً ما تُستخدم مباشرة.">
          <input
            dir="ltr"
            className={inputClass}
            value={(form.permissions ?? []).join(', ')}
            onChange={(event) => set('permissions', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
            placeholder="sales.view, reports.export"
          />
        </Field>
      </div>

      <div className="mt-3 rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-bold text-ink">الوحدات المتضمنة في الخطة</span>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10.5px] font-bold text-ink-secondary">
            {(form.includedModules ?? []).length} مختارة
          </span>
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
          {modules.length === 0 && <p className="text-[11px] text-muted">لا توجد وحدات معرفة في الكتالوج.</p>}
        </div>
        <p className="mt-2 text-[10.5px] text-muted">
          ملاحظة: الوحدات والمميزات المحددة هنا تُحفظ مباشرة مع الخطة. الخطوات 2–4 في المعالج تبني مسودات منفصلة تُطبق في النهاية.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-line px-3 py-2">
        <Toggle checked={Boolean(form.isActive)} onChange={(val) => set('isActive', val)} label="الخطة نشطة" />
        <Toggle checked={Boolean(form.isDefault)} onChange={(val) => set('isDefault', val)} label="الخطة الافتراضية" />
      </div>
    </Modal>
  );
};

export default PlanDetailsModal;
