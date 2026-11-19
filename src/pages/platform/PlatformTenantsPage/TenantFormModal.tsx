import React from 'react';
import type { PlatformPlan, PlatformTenant, PlatformTenantInput, PlatformTenantStatus } from '../../../services/domains/platform/platformTypes';
import { PLATFORM_TENANT_STATUS_LABELS } from '../../../services/domains/platform/PlatformAdminService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, formatMoney, inputClass } from '../components/PlatformUI';
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
}) => (
  <>
      {/* Create / edit */}
      <Modal
        open={open}
        onClose={onClose}
        title={editing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
        description="بيانات المنشأة تحدد نشاطها وخطتها وحدود الاستخدام وتراخيصها."
        size="lg"
        busy={saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!canManageTenants}>{editing ? 'حفظ التعديلات' : 'إضافة العميل'}</Button>
          </div>
        }
      >
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
            <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PlatformTenantStatus })}>
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
      </Modal>
  </>
);
