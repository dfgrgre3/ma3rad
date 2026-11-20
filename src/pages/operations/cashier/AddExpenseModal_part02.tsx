import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import type { PaymentType } from '../../../types';
import type { Props } from './AddExpenseModal_part01';

export const AddExpenseModal: React.FC<Props> = ({ isOpen, categories, onClose, onSubmit }) => {
  const [category, setCategory] = useState(categories[0]?.name || '');
  const [amount, setAmount] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [description, setDescription] = useState('');
  const [paymentType, _setPaymentType] = useState<PaymentType>('CASH');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-extrabold text-ink">سند صرف مصروفات</h3>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(category || categories[0]?.name || '', amount, description, recipient, paymentType);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="expense-cat" className="font-bold text-xs text-ink block mb-1.5">بند المصروف *</label>
              <select
                id="expense-cat"
                required
                value={category || categories[0]?.name || ''}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-3 bg-surface-muted rounded-xl border border-line font-bold text-sm outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="expense-amt" className="font-bold text-xs text-ink block mb-1.5">المبلغ (ج.م) *</label>
              <input
                id="expense-amt"
                type="number"
                required
                min="0"
                step="0.5"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-3 bg-surface-muted rounded-xl border border-line font-black text-sm text-danger outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="expense-rec" className="font-bold text-xs text-ink block mb-1.5">المستلم / الجهة</label>
            <input
              id="expense-rec"
              type="text"
              placeholder="مثال: عامل النظافة / شركة الكهرباء"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-4 py-3 bg-surface-muted rounded-xl border border-line text-sm outline-none"
            />
          </div>

          <div>
            <label htmlFor="expense-desc" className="font-bold text-xs text-ink block mb-1.5">البيان والشرح *</label>
            <input
              id="expense-desc"
              type="text"
              required
              placeholder="تفاصيل الغرض من الصرف..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-surface-muted rounded-xl border border-line text-sm outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2 border-t border-line mt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-surface-sunken text-ink font-bold rounded-xl hover:bg-surface-sunken">
              إلغاء
            </button>
            <button type="submit" className="flex-[2] px-5 py-3 bg-danger hover:bg-danger text-white font-bold rounded-xl shadow-lg shadow-danger/20">
              حفظ وصرف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
