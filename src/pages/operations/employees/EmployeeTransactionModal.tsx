import React from 'react';
import type { FinancialTransaction, TransactionFormState } from '../../../types/hr/employeesPage';

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
    <div className="fixed inset-0 z-50 bg-surface backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-surface-muted px-6 py-4 border-b border-line flex justify-between items-center">
          <h2 className="text-sm font-black text-ink">
            تسجيل حركة حساب مالي للعامل:{' '}
            <span className="text-warning">
              {employeeName}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">نوع الحركة المالية</label>
            <select
              value={form.type}
              onChange={(e) => onFormChange(prev => ({ ...prev, type: e.target.value as FinancialTransaction['type'] }))}
              className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink focus:outline-none focus:border-warning/50 text-xs"
            >
              <option value="ADVANCE">سُلفة (تُخصم من راتبه)</option>
              <option value="BONUS">مكافأة / حافز إضافي</option>
              <option value="DEDUCTION">خصم جزائي (يُطرح من المستحقات)</option>
              <option value="SALARY_PAYOUT">صرف راتب / دفعة نقدية مسلّمة باليد</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5">المبلغ بالجنيه *</label>
              <input
                type="number"
                required
                min={1}
                value={form.amount}
                onChange={(e) => onFormChange(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink font-bold focus:outline-none focus:border-warning/50 text-xs"
                placeholder="مثال: 500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-1.5">التاريخ *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => onFormChange(prev => ({ ...prev, date: e.target.value }))}
                className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink focus:outline-none focus:border-warning/50 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">البيان / ملاحظات توضيحية *</label>
            <textarea
              required
              value={form.notes}
              onChange={(e) => onFormChange(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink placeholder-muted focus:outline-none focus:border-warning/50 text-xs h-20 resize-none"
              placeholder="اكتب تفاصيل المعاملة بدقة..."
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-muted hover:bg-surface-sunken text-muted hover:text-ink border border-line rounded-xl text-xs font-bold transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-warning hover:bg-warning text-ink rounded-xl text-xs font-bold shadow-lg transition"
            >
              تسجيل الحركة المالية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
