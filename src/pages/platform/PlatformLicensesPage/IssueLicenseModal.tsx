import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, inputClass } from '../components/PlatformUI';
import type { PlatformPlan, PlatformTenant, PlatformCouplingMode } from '../../../services/domains/platform/platformTypes';
import { clampInt } from './licenseData';

export interface IssueLicenseForm {
  tenantId: string;
  planId: string;
  months: number;
  seats: number;
  branchesLimit: number;
  offlineGracePeriodDays: number;
  couplingMode: PlatformCouplingMode;
  notes: string;
}

interface IssueLicenseModalProps {
  open: boolean;
  saving: boolean;
  canManage: boolean;
  tenants: PlatformTenant[];
  plans: PlatformPlan[];
  onClose: () => void;
  onSubmit: (form: IssueLicenseForm) => void;
}

const defaultForm = (tenants: PlatformTenant[], plans: PlatformPlan[]): IssueLicenseForm => {
  const defaultPlan = plans.find((plan) => plan.isDefault) ?? plans[0];
  return {
    tenantId: tenants[0]?.id ?? '',
    planId: defaultPlan?.id ?? '',
    months: 12,
    seats: defaultPlan?.seatsLimit ?? 5,
    branchesLimit: defaultPlan?.branchesLimit ?? 1,
    offlineGracePeriodDays: defaultPlan?.offlineGracePeriodDays ?? 14,
    couplingMode: 'FULL',
    notes: '',
  };
};

export const IssueLicenseModal: React.FC<IssueLicenseModalProps> = ({ open, saving, canManage, tenants, plans, onClose, onSubmit }) => {
  const [form, setForm] = React.useState<IssueLicenseForm>(() => defaultForm(tenants, plans));

  // Reset the form each time the modal opens.
  React.useEffect(() => {
    if (open) setForm(defaultForm(tenants, plans));
  }, [open, tenants, plans]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إصدار ترخيص جديد"
      description="اختر العميل والخطة ومدة الترخيص."
      size="md"
      busy={saving}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={() => onSubmit(form)} loading={saving} disabled={!canManage}>إصدار الترخيص</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العميل" required className="sm:col-span-2">
          <select className={inputClass} value={form.tenantId} onChange={(event) => setForm({ ...form, tenantId: event.target.value })}>
            <option value="">اختر العميل</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.name} — {tenant.code}</option>
            ))}
          </select>
        </Field>
        <Field label="الخطة" required>
          <select
            className={inputClass}
            value={form.planId}
            onChange={(event) => {
              const plan = plans.find((item) => item.id === event.target.value);
              setForm({
                ...form,
                planId: event.target.value,
                seats: plan?.seatsLimit ?? form.seats,
                branchesLimit: plan?.branchesLimit ?? form.branchesLimit,
                offlineGracePeriodDays: plan?.offlineGracePeriodDays ?? form.offlineGracePeriodDays,
              });
            }}
          >
            <option value="">اختر الخطة</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
        </Field>
        <Field label="المدة (أشهر)">
          <input type="number" min={1} className={inputClass} value={form.months} onChange={(event) => setForm({ ...form, months: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="عدد المستخدمين">
          <input type="number" min={1} className={inputClass} value={form.seats} onChange={(event) => setForm({ ...form, seats: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="الفروع المسموح بها">
          <input type="number" min={1} className={inputClass} value={form.branchesLimit} onChange={(event) => setForm({ ...form, branchesLimit: clampInt(event.target.value, 1) })} />
        </Field>
        <Field label="فترة السماح أوفلاين (أيام)">
          <input type="number" min={0} className={inputClass} value={form.offlineGracePeriodDays} onChange={(event) => setForm({ ...form, offlineGracePeriodDays: clampInt(event.target.value, 0) })} />
        </Field>
        <Field label="نوع الربط بالاشتراك">
          <select className={inputClass} value={form.couplingMode} onChange={(event) => setForm({ ...form, couplingMode: event.target.value as PlatformCouplingMode })}>
            <option value="FULL">كامل (المزامنة التلقائية)</option>
            <option value="EXPIRY_ONLY">انتهاء الصلاحية فقط</option>
            <option value="NONE">مستقل تماماً</option>
          </select>
        </Field>
        <Field label="ملاحظات" className="sm:col-span-2">
          <textarea rows={2} className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
