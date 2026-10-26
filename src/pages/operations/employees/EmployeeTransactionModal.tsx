import React from 'react';
import type { FinancialTransaction, TransactionFormState } from './types';

interface EmployeeTransactionModalProps {
  open: boolean;
  employeeName: string | undefined;
  form: TransactionFormState;
  onFormChange: React.Dispatch<React.SetStateAction<TransactionFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const EmployeeTransactionModal: React.FC<EmployeeTransactionModalProps> = ({
  open,
  employeeName,
  form,
  onFormChange,
  onClose,
  onSubmit,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200" dir="rtl">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900">
            تسجيل حركة حساب مالي للعامل:{' '}
            <span className="text-orange-600">
              {employeeName}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">نوع الحركة المالية</label>
            <select
              value={form.type}
              onChange={(e) => onFormChange(prev => ({ ...prev, type: e.target.value as FinancialTransaction['type'] }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
            >
              <option value="ADVANCE">سُلفة (تُخصم من راتبه)</option>
              <option value="BONUS">مكافأة / حافز إضافي</option>
              <option value="DEDUCTION">خصم جزائي (يُطرح من المستحقات)</option>
              <option value="SALARY_PAYOUT">صرف راتب / دفعة نقدية مسلّمة باليد</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">المبلغ بالجنيه *</label>
              <input
                type="number"
                required
                min={1}
                value={form.amount}
                onChange={(e) => onFormChange(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-orange-500/50 text-xs"
                placeholder="مثال: 500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">التاريخ *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => onFormChange(prev => ({ ...prev, date: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-orange-500/50 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">البيان / ملاحظات توضيحية *</label>
            <textarea
              required
              value={form.notes}
              onChange={(e) => onFormChange(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-orange-500/50 text-xs h-20 resize-none"
              placeholder="اكتب تفاصيل المعاملة بدقة..."
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-slate-900 rounded-xl text-xs font-bold shadow-lg transition"
            >
              تسجيل الحركة المالية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
