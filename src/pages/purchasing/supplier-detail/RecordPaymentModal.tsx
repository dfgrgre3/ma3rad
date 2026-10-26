import React from 'react';
import { DollarSign } from 'lucide-react';
import { PaymentType, Supplier } from '../../../types';
import { RecordPaymentFormData } from './types';

export interface RecordPaymentModalProps {
  supplier: Supplier;
  paymentData: RecordPaymentFormData;
  paymentError: string;
  onChange: (data: RecordPaymentFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  supplier,
  paymentData,
  paymentError,
  onChange,
  onClose,
  onSubmit,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4" dir="rtl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <span>سند صرف دفعة للمورد</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>

        {paymentError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-800">
            {paymentError}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المورد المستفيد</label>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs font-bold text-slate-800">
              {supplier.name} ({supplier.code})
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المبلغ المراد سداده</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={paymentData.amount}
              onChange={(e) => onChange({ ...paymentData, amount: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">طريقة الدفع</label>
            <select
              value={paymentData.paymentType}
              onChange={(e) => onChange({ ...paymentData, paymentType: e.target.value as PaymentType })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800"
            >
              <option value="CASH">نقدي (خزينة المعرض)</option>
              <option value="BANK">تحويل بنكي</option>
              <option value="CHEQUE">شيك مصرفي</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">البيان / ملاحظات</label>
            <textarea
              rows={2}
              value={paymentData.notes}
              onChange={(e) => onChange({ ...paymentData, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
            >
              تأكيد وسداد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
