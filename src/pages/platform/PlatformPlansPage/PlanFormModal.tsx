import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { Field, Toggle, inputClass } from '../components/PlatformUI';
import {
  createPlan,
  updatePlan,
  previewPlanImpact,
} from './planData';
import type {
  PlatformBillingCycle,
  PlatformModule,
  PlatformPlan,
  PlatformPlanInput,
  PlatformPlanImpactPreview,
} from '../../../services/domains/platform/platformTypes';

const CYCLES: Array<{ value: PlatformBillingCycle; label: string }> = [
  { value: 'MONTHLY', label: 'شهري' },
  { value: 'QUARTERLY', label: 'ربع سنوي' },
  { value: 'YEARLY', label: 'سنوي' },
  { value: 'LIFETIME', label: 'مدى الحياة' },
];

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
  offlineGracePeriodDays: 14,
  includedModules: [],
  features: [],
  permissions: [],
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  versioned: false,
};

interface Props {
  open: boolean;
  editing: PlatformPlan | null;
  modules: PlatformModule[];
  onClose: () => void;
  onSaved: () => void;
}

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

export const PlanFormModal: React.FC<Props> = ({ open, editing, modules, onClose, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = React.useState<PlatformPlanInput>(emptyPlan);
  const [featuresText, setFeaturesText] = React.useState('');
  const [permissionsText, setPermissionsText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [impact, setImpact] = React.useState<PlatformPlanImpactPreview | null>(null);
  const [impactChecked, setImpactChecked] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(editing ? toPlanInput(editing) : emptyPlan);
    setFeaturesText((editing?.features ?? []).join(', '));
    setPermissionsText((editing?.permissions ?? []).join(', '));
    setImpact(null);
    setImpactChecked(false);
  }, [open, editing]);

  const toggleModule = (code: string) => {
    setForm((current) => {
      const list = current.includedModules ?? [];
      return {
        ...current,
        includedModules: list.includes(code) ? list.filter((item) => item !== code) : [...list, code],
      };
    });
    setImpactChecked(false);
  };

  const buildPayload = (): PlatformPlanInput => ({
    ...form,
    features: featuresText.split(',').map((item) => item.trim()).filter(Boolean),
    permissions: permissionsText.split(',').map((item) => item.trim()).filter(Boolean),
  });

  const submit = async () => {
    const payload = buildPayload();
    if (editing) {
      await updatePlan(editing.id, payload);
    } else {
      await createPlan(payload);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('اسم الخطة ورمزها مطلوبان');
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(form.code.trim())) {
      toast.error('رمز الخطة يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام و_ فقط');
      return;
    }
    if (saving) return;

    // Editing a plan can break existing subscribers when limits shrink —
    // surface the impact preview first; a CRITICAL result needs a second click.
    if (editing && !impactChecked) {
      setSaving(true);
      try {
        const preview = await previewPlanImpact(editing.id, buildPayload());
        setImpact(preview);
        setImpactChecked(true);
        if (preview.riskLevel === 'CRITICAL') return;
      } catch (err) {
        toast.error('تعذر فحص تأثير التغيير', err instanceof Error ? err.message : undefined);
        return;
      } finally {
        setSaving(false);
      }
    }

    setSaving(true);
    try {
      await submit();
      toast.success(editing ? 'تم تحديث الخطة' : 'تم إنشاء الخطة');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('تعذر حفظ الخطة', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const limitsChanged = Boolean(
    editing &&
    (form.seatsLimit !== editing.seatsLimit ||
      form.branchesLimit !== editing.branchesLimit ||
      form.devicesLimit !== editing.devicesLimit)
  );

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      busy={saving}
      size="lg"
      title={editing ? `تعديل الخطة: ${editing.name}` : 'خطة اشتراك جديدة'}
      description="حدد التسعير والحدود والوحدات المتضمنة."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            {impact && impact.riskLevel === 'CRITICAL' ? 'تأكيد الحفظ رغم التحذير' : editing ? 'حفظ التعديلات' : 'إنشاء الخطة'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {impact && impact.riskLevel === 'CRITICAL' && (
          <div role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[11.5px] font-semibold text-danger">
            <p className="font-black">تحذير: {impact.affectedTenants} عميل متأثر و{impact.limitViolations.length} تجاوز للحدود الجديدة.</p>
            <p className="mt-1">{impact.recommendation}</p>
            <ul className="mt-1.5 max-h-24 list-disc space-y-0.5 overflow-auto pr-4">
              {impact.limitViolations.slice(0, 8).map((v, i) => (
                <li key={i}>{v.tenantName}: {v.type} الحالي {v.current} والحد الجديد {v.newLimit}</li>
              ))}
            </ul>
          </div>
        )}
        {impact && impact.riskLevel !== 'CRITICAL' && impact.affectedTenants > 0 && (
          <div className="rounded-lg border border-success-border bg-success-soft px-3.5 py-2 text-[11.5px] font-semibold text-success">
            معاينة التأثير: {impact.affectedTenants} مشترك — {impact.recommendation}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الخطة" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="رمز الخطة" required hint={editing ? 'لا يمكن تغيير الرمز' : 'أحرف إنجليزية وأرقام و_ فقط'}>
            <input dir="ltr" className={inputClass} value={form.code} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="دورة الفوترة">
            <select className={inputClass} value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value as PlatformBillingCycle })}>
              {CYCLES.map((cycle) => <option key={cycle.value} value={cycle.value}>{cycle.label}</option>)}
            </select>
          </Field>
          <Field label="العملة">
            <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {['EGP', 'SAR', 'AED', 'USD', 'EUR'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </Field>
          <Field label="السعر (أساس)">
            <input type="number" min={0} className={inputClass} value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </Field>
          <Field label="السعر شهري">
            <input type="number" min={0} className={inputClass} value={form.monthlyPrice ?? 0} onChange={(e) => setForm({ ...form, monthlyPrice: Number(e.target.value) })} />
          </Field>
          <Field label="السعر سنوي">
            <input type="number" min={0} className={inputClass} value={form.yearlyPrice ?? 0} onChange={(e) => setForm({ ...form, yearlyPrice: Number(e.target.value) })} />
          </Field>
          <Field label="أيام التجربة">
            <input type="number" min={0} className={inputClass} value={form.trialDays ?? 14} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} />
          </Field>
          <Field label="حد المستخدمين">
            <input type="number" min={1} className={inputClass} value={form.seatsLimit ?? 1} onChange={(e) => setForm({ ...form, seatsLimit: Number(e.target.value) })} />
          </Field>
          <Field label="حد الفروع">
            <input type="number" min={1} className={inputClass} value={form.branchesLimit ?? 1} onChange={(e) => setForm({ ...form, branchesLimit: Number(e.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={form.devicesLimit ?? 1} onChange={(e) => setForm({ ...form, devicesLimit: Number(e.target.value) })} />
          </Field>
          <Field label="مساحة التخزين (MB)">
            <input type="number" min={0} className={inputClass} value={form.storageLimitMb ?? 500} onChange={(e) => setForm({ ...form, storageLimitMb: Number(e.target.value) })} />
          </Field>
          <Field label="حد المنتجات">
            <input type="number" min={0} className={inputClass} value={form.maxProducts ?? 1000} onChange={(e) => setForm({ ...form, maxProducts: Number(e.target.value) })} />
          </Field>
          <Field label="حد المخازن">
            <input type="number" min={0} className={inputClass} value={form.maxWarehouses ?? 2} onChange={(e) => setForm({ ...form, maxWarehouses: Number(e.target.value) })} />
          </Field>
          <Field label="فترة السماح دون اتصال (يوم)" hint="مدة صلاحية الترخيص offline قبل الحاجة للاتصال">
            <input type="number" min={0} className={inputClass} value={form.offlineGracePeriodDays ?? 14} onChange={(e) => setForm({ ...form, offlineGracePeriodDays: Number(e.target.value) })} />
          </Field>
          <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً">
            <input type="number" className={inputClass} value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </Field>
          <Field label="الوصف" className="sm:col-span-2">
            <textarea rows={2} className={inputClass} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="المزايا (مفصولة بفواصل)" className="sm:col-span-2">
            <input className={inputClass} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder="دعم أولوية, تقارير متقدمة, متعدد الفروع" />
          </Field>
          <Field label="الصلاحيات (مفصولة بفواصل)" className="sm:col-span-2">
            <input
              className={inputClass}
              dir="ltr"
              value={permissionsText}
              onChange={(e) => setPermissionsText(e.target.value)}
              placeholder="sales.view, reports.export"
            />
          </Field>
          {form.versioned && (
            <Field label="ملاحظة الإصدار الجديد" className="sm:col-span-2" hint="تُحفظ مع النسخة الجديدة في سجل إصدارات الخطة">
              <input
                className={inputClass}
                value={form.initialChangeNote ?? ''}
                onChange={(e) => setForm({ ...form, initialChangeNote: e.target.value })}
                placeholder="مثال: تحديث أسعار الربع الأول"
              />
            </Field>
          )}
        </div>

        <div className="rounded-xl border border-line p-3">
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
            {modules.length === 0 && <p className="text-[11px] text-muted">لا توجد وحدات معرّفة.</p>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <div>
              <p className="text-[12px] font-bold text-ink">الخطة الافتراضية</p>
              <p className="text-[10.5px] text-muted">تُقترح تلقائياً عند إنشاء عميل جديد — تفعيلها يلغي الافتراضية عن الخطط الأخرى.</p>
            </div>
            <Toggle checked={form.isDefault === true} onChange={(next) => setForm({ ...form, isDefault: next })} label="خطة افتراضية" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <div>
              <p className="text-[12px] font-bold text-ink">إصدارات الأسعار (Versioning)</p>
              <p className="text-[10.5px] text-muted">كل تعديل على خطة مفعّلة يُحفظ كإصدار جديد مع تاريخ سريان.</p>
            </div>
            <Toggle checked={form.versioned === true} onChange={(next) => { setForm({ ...form, versioned: next }); setImpactChecked(false); }} label="تفعيل الإصدارات" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <div>
              <p className="text-[12px] font-bold text-ink">الخطة نشطة</p>
              <p className="text-[10.5px] text-muted">الخطط المعطلة لا يمكن إصدار تراخيص منها.</p>
            </div>
            <Toggle checked={form.isActive !== false} onChange={(next) => setForm({ ...form, isActive: next })} label="تفعيل الخطة" />
          </div>
          {limitsChanged && editing && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[10.5px] font-semibold text-warning">
              تم تغيير حدود الخطة — ستظهر معاينة التأثير على المشتركين الحاليين قبل الحفظ.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PlanFormModal;
