import React from 'react';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Phone,
  User,
} from 'lucide-react';
import type { PlatformPlan, PlatformTenant, PlatformTenantInput, PlatformTenantStatus } from '../../../services/domains/platform/platformTypes';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, StatusBadge, formatMoney, inputClass } from '../components/PlatformUI';
import { STATUSES } from './constants';

interface TenantFormModalProps {
  open: boolean;
  onClose: () => void;
  editing: PlatformTenant | null;
  form: PlatformTenantInput;
  setForm: React.Dispatch<React.SetStateAction<PlatformTenantInput>>;
  plans: PlatformPlan[];
  saving: boolean;
  save: () => void;
  canManageTenants: boolean;
}

const STEPS = [
  { key: 'company', label: 'بيانات المنشأة', icon: <Building2 className="h-4 w-4" /> },
  { key: 'contact', label: 'بيانات التواصل', icon: <Phone className="h-4 w-4" /> },
  { key: 'plan', label: 'الباقة والحدود', icon: <CreditCard className="h-4 w-4" /> },
  { key: 'review', label: 'المراجعة والحالة', icon: <FileText className="h-4 w-4" /> },
];

const isValidEmail = (email?: string) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const StepIndicator: React.FC<{ step: number; onSelect?: (index: number) => void }> = ({ step, onSelect }) => (
  <div className="mb-5">
    <ol className="flex items-center gap-1.5 sm:gap-2">
      {STEPS.map((item, index) => {
        const done = index < step;
        const active = index === step;
        return (
          <React.Fragment key={item.key}>
            {index > 0 && <span className={`h-px flex-1 ${index <= step ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            <li className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect && done && onSelect(index)}
                disabled={!onSelect || !done}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-black transition ${
                  done
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : active
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                } ${done && onSelect ? 'cursor-pointer hover:bg-emerald-700' : 'cursor-default'}`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </button>
              <span className={`hidden text-[11px] font-semibold sm:inline ${active ? 'text-emerald-700' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
    <div className="mt-2 flex items-center justify-between sm:hidden">
      <span className="text-[12px] font-bold text-slate-700">الخطوة {step + 1} من {STEPS.length}</span>
      <span className="text-[11px] font-semibold text-emerald-700">{STEPS[step].label}</span>
    </div>
  </div>
);

const CompanyStep: React.FC<{ form: PlatformTenantInput; setForm: React.Dispatch<React.SetStateAction<PlatformTenantInput>> }> = ({ form, setForm }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <Field label="اسم الشركة" required className="sm:col-span-2">
      <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: معرض السيراميك المصري" />
    </Field>
    <Field label="رقم العميل" hint="يُولَّد تلقائياً إذا تُرك فارغاً">
      <input className={inputClass} dir="ltr" value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} />
    </Field>
    <Field label="النشاط التجاري">
      <input className={inputClass} value={form.businessType ?? ''} onChange={(event) => setForm({ ...form, businessType: event.target.value })} placeholder="مثال: معرض سيراميك" />
    </Field>
    <Field label="الدولة">
      <input className={inputClass} value={form.country ?? ''} onChange={(event) => setForm({ ...form, country: event.target.value })} />
    </Field>
    <Field label="المدينة">
      <input className={inputClass} value={form.city ?? ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
    </Field>
    <Field label="العنوان" className="sm:col-span-2">
      <input className={inputClass} value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} />
    </Field>
  </div>
);

const ContactStep: React.FC<{ form: PlatformTenantInput; setForm: React.Dispatch<React.SetStateAction<PlatformTenantInput>> }> = ({ form, setForm }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <Field label="اسم المسؤول">
      <input className={inputClass} value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
    </Field>
    <Field label="الهاتف">
      <input className={inputClass} dir="ltr" value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
    </Field>
    <Field label="البريد الإلكتروني" className="sm:col-span-2">
      <input className={inputClass} dir="ltr" type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="admin@company.com" />
    </Field>
    <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-[11px] leading-5 text-sky-800">
      <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>ستُستخدم بيانات التواصل لإرسال كود التفعيل ورابط تسجيل الدخول إلى العميل بعد إنشاء الحساب.</span>
    </div>
  </div>
);

const PlanStep: React.FC<{ form: PlatformTenantInput; setForm: React.Dispatch<React.SetStateAction<PlatformTenantInput>>; plans: PlatformPlan[] }> = ({ form, setForm, plans }) => {
  const selectedPlan = plans.find((plan) => plan.id === form.planId);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الباقة" className="sm:col-span-2">
          <select className={inputClass} value={form.planId ?? ''} onChange={(event) => setForm({ ...form, planId: event.target.value })}>
            <option value="">بدون خطة</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)}</option>
            ))}
          </select>
        </Field>
        <Field label="حد المستخدمين">
          <input type="number" min={1} className={inputClass} value={form.seatsLimit ?? 1} onChange={(event) => setForm({ ...form, seatsLimit: Number(event.target.value) })} />
        </Field>
        <Field label="حد الفروع">
          <input type="number" min={1} className={inputClass} value={form.branchesLimit ?? 1} onChange={(event) => setForm({ ...form, branchesLimit: Number(event.target.value) })} />
        </Field>
        <Field label="حد الأجهزة">
          <input type="number" min={1} className={inputClass} value={form.devicesLimit ?? 1} onChange={(event) => setForm({ ...form, devicesLimit: Number(event.target.value) })} />
        </Field>
      </div>

      {selectedPlan && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="text-[11px] font-bold text-emerald-800">تفاصيل الباقة المختارة</p>
          <div className="mt-2 grid gap-2 text-[11.5px] text-slate-600 sm:grid-cols-3">
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-[10px] text-slate-400">السعر</p>
              <p className="font-bold text-emerald-700">{formatMoney(selectedPlan.price, selectedPlan.currency)}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-[10px] text-slate-400">المستخدمون / الفروع / الأجهزة</p>
              <p className="font-bold">{selectedPlan.seatsLimit} / {selectedPlan.branchesLimit} / {selectedPlan.devicesLimit}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-[10px] text-slate-400">المنتجات / المستودعات</p>
              <p className="font-bold">{selectedPlan.maxProducts} / {selectedPlan.maxWarehouses}</p>
            </div>
          </div>
          {(selectedPlan.features ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(selectedPlan.features ?? []).slice(0, 8).map((feature) => (
                <span key={feature} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{feature}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ReviewStep: React.FC<{ form: PlatformTenantInput; setForm: React.Dispatch<React.SetStateAction<PlatformTenantInput>>; plans: PlatformPlan[] }> = ({ form, setForm, plans }) => {
  const plan = plans.find((p) => p.id === form.planId);
  const rows: Array<[string, React.ReactNode]> = [
    ['اسم الشركة', form.name || '—'],
    ['رقم العميل', form.code || 'يُولَّد تلقائياً'],
    ['النشاط', form.businessType || '—'],
    ['الموقع', [form.city, form.country].filter(Boolean).join('، ') || '—'],
    ['المسؤول', form.contactName || '—'],
    ['التواصل', [form.phone, form.email].filter(Boolean).join(' · ') || '—'],
    ['الباقة', plan ? `${plan.name} — ${formatMoney(plan.price, plan.currency)}` : 'بدون خطة'],
    ['الحدود', `مستخدمون: ${form.seatsLimit ?? 1} · فروع: ${form.branchesLimit ?? 1} · أجهزة: ${form.devicesLimit ?? 1}`],
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {rows.map(([label, value], index) => (
          <div key={label} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] ${index % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}`}>
            <span className="font-semibold text-slate-500">{label}</span>
            <span className="text-left font-bold text-slate-800">{value}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="حالة العميل">
          <select className={inputClass} value={form.status ?? 'TRIAL'} onChange={(event) => setForm({ ...form, status: event.target.value as PlatformTenantStatus })}>
            {STATUSES.map((value) => <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>)}
          </select>
        </Field>
        <Field label="الحالة الحالية">
          <div className="flex h-[38px] items-center">
            <StatusBadge value={form.status ?? 'TRIAL'} label={PLATFORM_TENANT_STATUS_LABELS[form.status ?? 'TRIAL']} />
          </div>
        </Field>
      </div>
      <Field label="ملاحظات داخلية">
        <textarea rows={3} className={inputClass} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="ملاحظات لا تظهر للعميل..." />
      </Field>
    </div>
  );
};

const WizardFooter: React.FC<{
  step: number;
  saving: boolean;
  canManageTenants: boolean;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ step, saving, canManageTenants, onBack, onNext, onSave, onCancel }) => {
  const last = step === STEPS.length - 1;
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" onClick={onCancel} disabled={saving}>إلغاء</Button>
      <div className="flex items-center gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={onBack} disabled={saving} leadingIcon={<ChevronRight className="h-4 w-4" />}>
            السابق
          </Button>
        )}
        {last ? (
          <Button variant="primary" onClick={onSave} loading={saving} disabled={!canManageTenants} leadingIcon={<Check className="h-4 w-4" />}>
            إضافة العميل
          </Button>
        ) : (
          <Button variant="primary" onClick={onNext} leadingIcon={<ChevronLeft className="h-4 w-4" />}>
            التالي
          </Button>
        )}
      </div>
    </div>
  );
};

export const TenantFormModal: React.FC<TenantFormModalProps> = ({
  open,
  onClose,
  editing,
  form,
  setForm,
  plans,
  saving,
  save,
  canManageTenants,
}) => {
  const [step, setStep] = React.useState(0);
  const [stepError, setStepError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setStepError(null);
    }
  }, [open, editing?.id]);

  const canProceed = (index: number): boolean => {
    if (index === 0) {
      if (!form.name?.trim()) {
        setStepError('اسم الشركة مطلوب للمتابعة.');
        return false;
      }
    }
    if (index === 1 && !isValidEmail(form.email)) {
      setStepError('البريد الإلكتروني غير صالح.');
      return false;
    }
    setStepError(null);
    return true;
  };

  const goNext = () => {
    if (!canProceed(step)) return;
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const goBack = () => {
    setStepError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const goToStep = (index: number) => {
    setStepError(null);
    setStep(index);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      description={editing
        ? 'بيانات المنشأة تحدد نشاطها وخطتها وحدود الاستخدام وتراخيصها.'
        : 'أربع خطوات بسيطة: بيانات المنشأة، التواصل، الباقة والحدود، ثم المراجعة النهائية.'}
      size="lg"
      busy={saving}
      footer={editing ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canManageTenants}>{editing ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
        </div>
      ) : (
        <WizardFooter
          step={step}
          saving={saving}
          canManageTenants={canManageTenants}
          onBack={goBack}
          onNext={goNext}
          onSave={save}
          onCancel={onClose}
        />
      )}
    >
      {!editing && <StepIndicator step={step} onSelect={(index) => { if (index < step) goToStep(index); }} />}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الشركة" required>
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="رقم العميل" hint="يُولَّد تلقائياً إذا تُرك فارغاً">
            <input className={inputClass} dir="ltr" value={form.code ?? ''} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label="اسم المسؤول">
            <input className={inputClass} value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
          </Field>
          <Field label="الهاتف">
            <input className={inputClass} dir="ltr" value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={inputClass} dir="ltr" type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="النشاط التجاري">
            <input className={inputClass} value={form.businessType ?? ''} onChange={(event) => setForm({ ...form, businessType: event.target.value })} />
          </Field>
          <Field label="الدولة">
            <input className={inputClass} value={form.country ?? ''} onChange={(event) => setForm({ ...form, country: event.target.value })} />
          </Field>
          <Field label="المدينة">
            <input className={inputClass} value={form.city ?? ''} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label="العنوان" className="sm:col-span-2">
            <input className={inputClass} value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </Field>
          <Field label="الباقة">
            <select className={inputClass} value={form.planId ?? ''} onChange={(event) => setForm({ ...form, planId: event.target.value })}>
              <option value="">بدون خطة</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name} — {formatMoney(plan.price, plan.currency)}</option>
              ))}
            </select>
          </Field>
          <Field label="حالة العميل">
            <select className={inputClass} value={form.status ?? 'TRIAL'} onChange={(event) => setForm({ ...form, status: event.target.value as PlatformTenantStatus })}>
              {STATUSES.map((value) => <option key={value} value={value}>{PLATFORM_TENANT_STATUS_LABELS[value]}</option>)}
            </select>
          </Field>
          <Field label="حد المستخدمين">
            <input type="number" min={1} className={inputClass} value={form.seatsLimit ?? 1} onChange={(event) => setForm({ ...form, seatsLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الفروع">
            <input type="number" min={1} className={inputClass} value={form.branchesLimit ?? 1} onChange={(event) => setForm({ ...form, branchesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="حد الأجهزة">
            <input type="number" min={1} className={inputClass} value={form.devicesLimit ?? 1} onChange={(event) => setForm({ ...form, devicesLimit: Number(event.target.value) })} />
          </Field>
          <Field label="ملاحظات" className="sm:col-span-2">
            <textarea rows={3} className={inputClass} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </div>
      ) : (
        <>
          {step === 0 && <CompanyStep form={form} setForm={setForm} />}
          {step === 1 && <ContactStep form={form} setForm={setForm} />}
          {step === 2 && <PlanStep form={form} setForm={setForm} plans={plans} />}
          {step === 3 && <ReviewStep form={form} setForm={setForm} plans={plans} />}
          {stepError && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">{stepError}</p>
          )}
        </>
      )}
    </Modal>
  );
};
