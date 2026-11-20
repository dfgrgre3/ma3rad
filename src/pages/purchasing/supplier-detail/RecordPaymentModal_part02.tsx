import React from 'react';
import { DollarSign } from 'lucide-react';
import { PaymentType } from '../../../types';
import type { RecordPaymentModalProps } from './RecordPaymentModal_part01';

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  supplier,
  paymentData,
  paymentError,
  onChange,
  onClose,
  onSubmit,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="font-extrabold text-base text-ink flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-success" />
            <span>سند صرف دفعة للمورد</span>
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink-secondary font-bold"
          >
            ✕
          </button>
        </div>

        {paymentError && (
          <div className="rounded-xl bg-danger-soft border border-danger-border p-3 text-xs font-bold text-danger">
            {paymentError}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-secondary mb-1">المورد المستفيد</label>
            <div className="rounded-xl bg-surface-muted border border-line p-2.5 text-xs font-bold text-ink">
              {supplier.name} ({supplier.code})
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-secondary mb-1">المبلغ المراد سداده</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={paymentData.amount}
              onChange={(e) => onChange({ ...paymentData, amount: Number(e.target.value) })}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-black text-ink"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-secondary mb-1">طريقة الدفع</label>
            <select
              value={paymentData.paymentType}
              onChange={(e) => onChange({ ...paymentData, paymentType: e.target.value as PaymentType })}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-xs font-bold text-ink"
            >
              <option value="CASH">نقدي (خزينة المعرض)</option>
              <option value="BANK">تحويل بنكي</option>
              <option value="CHEQUE">شيك مصرفي</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-secondary mb-1">البيان / ملاحظات</label>
            <textarea
              rows={2}
              value={paymentData.notes}
              onChange={(e) => onChange({ ...paymentData, notes: e.target.value })}
              className="w-full rounded-xl border border-line px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-secondary hover:bg-surface-sunken"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-success hover:bg-success shadow-md shadow-success/20"
            >
              تأكيد وسداد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
