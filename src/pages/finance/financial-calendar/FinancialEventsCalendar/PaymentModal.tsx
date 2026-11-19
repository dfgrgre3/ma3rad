import React from 'react';
import { Modal } from './Modal';
import { amountText, isIncome } from './constants';
import type { EventOptions, FinancialCalendarEvent, PaymentFormState } from './types';

type Props = {
  target: FinancialCalendarEvent;
  form: PaymentFormState;
  options: EventOptions | null;
  busy: boolean;
  onChange: (form: PaymentFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
};

export const PaymentModal: React.FC<Props> = ({
  target,
  form,
  options,
  busy,
  onChange,
  onSubmit,
  onClose,
}) => (
  <Modal title={isIncome(target) ? 'تسجيل تحصيل' : 'تسجيل دفعة'} onClose={onClose}>
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="rounded-lg bg-slate-50 p-3 text-sm">الرصيد المتبقي: <strong>{amountText(target.amount - target.paidAmount, target.currency)}</strong></p>
      <label className="block text-sm font-semibold">المبلغ
        <input required type="number" min="0.01" max={target.amount - target.paidAmount} step="0.01" value={form.amount} onChange={(event) => onChange({ ...form, amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      {target.sourceType && (
        <>
          <label className="block text-sm font-semibold">طريقة الدفع
            <select value={form.paymentType} onChange={(event) => onChange({ ...form, paymentType: event.target.value as typeof form.paymentType })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
              <option value="CASH">نقدًا</option>
              {target.sourceType !== 'INSTALLMENT' && <><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CHEQUE">شيك</option></>}
            </select>
          </label>
          <label className="block text-sm font-semibold">الخزينة
            <select required value={form.registerId} onChange={(event) => onChange({ ...form, registerId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
              {options?.registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="block text-sm font-semibold">تاريخ العملية
        <input required type="date" value={form.paymentDate} onChange={(event) => onChange({ ...form, paymentDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <label className="block text-sm font-semibold">مرجع العملية
        <input value={form.reference} onChange={(event) => onChange({ ...form, reference: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <label className="block text-sm font-semibold">ملاحظات
        <textarea rows={2} value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">إلغاء</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التسجيل...' : 'تأكيد العملية'}</button>
      </div>
    </form>
  </Modal>
);
