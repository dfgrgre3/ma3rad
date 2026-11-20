import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Toggle, inputClass } from '../components/PlatformUI';
import type { FeatureFormState } from './constants';

interface FeatureModalProps {
  open: boolean;
  onClose: () => void;
  form: FeatureFormState;
  setForm: React.Dispatch<React.SetStateAction<FeatureFormState>>;
  saving: boolean;
  canManageProduct: boolean;
  centralActive?: boolean;
  onSave: () => void;
}

export const FeatureModal: React.FC<FeatureModalProps> = ({
  open,
  onClose,
  form,
  setForm,
  saving,
  canManageProduct,
  centralActive = false,
  onSave,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={form.id ? 'تعديل ميزة ومنطق التحكم' : 'ميزة جديدة'}
    size="md"
    busy={saving}
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!canManageProduct}>
          حفظ
        </Button>
      </div>
    }
  >
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="اسم الميزة" required>
        <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="الرمز البرمجي (Code)" required hint={form.id ? 'لا يمكن تعديل الرمز' : 'مثال: sales.quick_invoice'}>
        <input
          dir="ltr"
          className={inputClass}
          value={form.code}
          disabled={Boolean(form.id)}
          onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
        />
      </Field>
      <Field label="الفئة (Category)" hint={centralActive ? 'غير مدعومة في الوضع المركزي' : undefined}>
        <input className={inputClass} value={form.category} disabled={centralActive} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </Field>
      <Field label="نسبة الإتاحة العامة (%)">
        <input
          type="number"
          min={0}
          max={100}
          className={inputClass}
          value={form.rolloutPercent}
          onChange={(e) => setForm({ ...form, rolloutPercent: Number(e.target.value) })}
        />
      </Field>
      <Field label="الحد الأدنى لدرجة الخطة (Tier)" hint={centralActive ? 'غير مدعومة في الوضع المركزي' : undefined}>
        <input
          placeholder="مثال: PRO أو ENTERPRISE"
          className={inputClass}
          value={form.minPlanTier}
          disabled={centralActive}
          onChange={(e) => setForm({ ...form, minPlanTier: e.target.value })}
        />
      </Field>
      <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
        <div>
          <p className="text-[12px] font-bold text-ink">بيئة اختبار فقط (Staging)</p>
          <p className="text-[10px] text-muted">حصر الميزة لمجموعات الاختبار قبل الإطلاق العام.{centralActive ? ' غير مدعومة في الوضع المركزي.' : ''}</p>
        </div>
        <Toggle checked={form.isStagingOnly} onChange={(val) => setForm({ ...form, isStagingOnly: val })} disabled={centralActive} label="Staging" />
      </div>
      <Field label="مسارات الصفحات المرتبطة (سطر لكل مسار)">
        <textarea
          dir="ltr"
          rows={3}
          className={inputClass}
          placeholder={'/reports/statements\n/reports/profit-loss'}
          value={form.pagePathsText}
          onChange={(e) => setForm({ ...form, pagePathsText: e.target.value })}
        />
        <p className="mt-1 text-[10px] text-muted">
          صفحات التطبيق التي تملكها هذه الميزة — تُخفى تلقائياً عن العملاء غير المشمولين بها.
        </p>
      </Field>
      <Field label="الوصف التوضيحي" className="sm:col-span-2">
        <textarea rows={2} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
    </div>
    <div className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2">
      <div>
        <p className="text-[12px] font-bold text-ink">تفعيل الميزة</p>
        <p className="text-[10.5px] text-muted">عند التعطيل لن تكون الميزة متاحة لأي مشترك إلا بتخصيص صريح.</p>
      </div>
      <Toggle checked={form.isEnabled} onChange={(next) => setForm({ ...form, isEnabled: next })} label="تفعيل الميزة" />
    </div>
  </Modal>
);
