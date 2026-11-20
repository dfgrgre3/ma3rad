import React from 'react';
import type { FinancialEventType, FinancialPartyType } from '../../../../services/domains/finance/FinancialCalendarEventsService';
import { Modal } from './Modal';
import { typeOptions } from './constants';
import type { EventFormState, EventOptions } from './types';

type Props = {
  form: EventFormState;
  onChange: (form: EventFormState) => void;
  options: EventOptions | null;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export const EventFormModal: React.FC<Props> = ({
  form,
  onChange,
  options,
  busy,
  onSubmit,
  onClose,
}) => {
  const selectedPartyOptions = form.partyType === 'CUSTOMER'
    ? options?.customers || []
    : form.partyType === 'SUPPLIER'
      ? options?.suppliers || []
      : form.partyType === 'EMPLOYEE'
        ? options?.employees || []
        : [];
  return (
    <Modal title={form.id ? 'تعديل حدث مالي' : 'إضافة حدث مالي'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink sm:col-span-2">عنوان الحدث
            <input required maxLength={150} value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <label className="text-sm font-semibold text-ink">نوع الحدث
            <select required value={form.eventType} onChange={(event) => {
              const eventType = event.target.value as FinancialEventType;
              const partyType = eventType === 'CUSTOMER_INVOICE' ? 'CUSTOMER'
                : eventType === 'SUPPLIER_INVOICE' ? 'SUPPLIER'
                  : eventType === 'PAYROLL' ? 'EMPLOYEE' : form.partyType;
              onChange({ ...form, eventType, partyType, partyId: '', partyName: '' });
            }} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5">
              {typeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">المبلغ المالي
            <input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => onChange({ ...form, amount: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <label className="text-sm font-semibold text-ink">العملة
            <select value={form.currency} onChange={(event) => onChange({ ...form, currency: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5">
              {['EGP', 'SAR', 'AED', 'USD', 'EUR', 'KWD', 'QAR'].map((currency) => <option key={currency}>{currency}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">تاريخ الاستحقاق
            <input required type="date" value={form.dueDate} onChange={(event) => onChange({ ...form, dueDate: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <label className="text-sm font-semibold text-ink">موعد التذكير
            <input type="datetime-local" value={form.reminderAt || ''} onChange={(event) => onChange({ ...form, reminderAt: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-ink">تذكير قبل الاستحقاق</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {[7, 3, 1].map((days) => (
                <label key={days} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.reminderDays.includes(days) ? 'border-accent-border bg-accent-soft text-primary' : 'border-line'}`}>
                  <input type="checkbox" checked={form.reminderDays.includes(days)} onChange={(event) => onChange({ ...form, reminderDays: event.target.checked ? [...form.reminderDays, days] : form.reminderDays.filter((item) => item !== days) })} />
                  قبلها بـ {days} {days === 1 ? 'يوم' : 'أيام'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-semibold text-ink">نوع الطرف
            <select value={form.partyType || 'OTHER'} onChange={(event) => onChange({ ...form, partyType: event.target.value as FinancialPartyType, partyId: '', partyName: '' })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5">
              <option value="CUSTOMER">عميل</option><option value="SUPPLIER">مورد</option><option value="EMPLOYEE">موظف</option><option value="OTHER">أخرى</option>
            </select>
          </label>
          {form.partyType !== 'OTHER' ? (
            <label className="text-sm font-semibold text-ink">الطرف المرتبط
              <select value={form.partyId || ''} onChange={(event) => {
                const selected = selectedPartyOptions.find((item) => item.id === event.target.value);
                onChange({ ...form, partyId: selected?.id || '', partyName: selected?.name || '' });
              }} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5">
                <option value="">اختر الطرف</option>
                {selectedPartyOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-sm font-semibold text-ink">اسم الطرف
              <input value={form.partyName || ''} onChange={(event) => onChange({ ...form, partyName: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
            </label>
          )}
          <label className="text-sm font-semibold text-ink">الحساب المالي
            <input list="financial-calendar-accounts" value={form.financialAccount || ''} onChange={(event) => onChange({ ...form, financialAccount: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
            <datalist id="financial-calendar-accounts">{(options?.accounts || []).map((account) => <option key={account} value={account} />)}</datalist>
          </label>
          <label className="text-sm font-semibold text-ink">رقم الفاتورة أو المرجع
            <input maxLength={100} value={form.reference || ''} onChange={(event) => onChange({ ...form, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <label className="text-sm font-semibold text-ink sm:col-span-2">وصف الحدث
            <textarea rows={3} value={form.description || ''} onChange={(event) => onChange({ ...form, description: event.target.value })} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2.5" />
          </label>
          <p className="text-xs text-muted sm:col-span-2">سيُربط الحدث تلقائيًا بالنشاط/الفرع النشط: {options?.branchName || '—'}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken">إلغاء</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'حفظ الحدث'}</button>
        </div>
      </form>
    </Modal>
  );
};
