import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import type { ExpenseCategory, PaymentType } from '../../../types';

interface Props {
  isOpen: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSubmit: (cat: string, amount: number, desc: string, recipient: string, paymentType: PaymentType) => Promise<void>;
}

export const AddExpenseModal: React.FC<Props> = ({ isOpen, categories, onClose, onSubmit }) => {
  const [category, setCategory] = useState(categories[0]?.name || '');
  const [amount, setAmount] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [description, setDescription] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900">سند صرف مصروفات</h3>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(category || categories[0]?.name || '', amount, description, recipient, paymentType);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="expense-cat" className="font-bold text-xs text-slate-700 block mb-1.5">بند المصروف *</label>
              <select
                id="expense-cat"
                required
                value={category || categories[0]?.name || ''}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-sm outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="expense-amt" className="font-bold text-xs text-slate-700 block mb-1.5">المبلغ (ج.م) *</label>
              <input
                id="expense-amt"
                type="number"
                required
                min="0"
                step="0.5"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-3 bg-slate-50 rounded-xl border border-slate-200 font-black text-sm text-red-600 outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="expense-rec" className="font-bold text-xs text-slate-700 block mb-1.5">المستلم / الجهة</label>
            <input
              id="expense-rec"
              type="text"
              placeholder="مثال: عامل النظافة / شركة الكهرباء"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none"
            />
          </div>

          <div>
            <label htmlFor="expense-desc" className="font-bold text-xs text-slate-700 block mb-1.5">البيان والشرح *</label>
            <input
              id="expense-desc"
              type="text"
              required
              placeholder="تفاصيل الغرض من الصرف..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100 mt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">
              إلغاء
            </button>
            <button type="submit" className="flex-[2] px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20">
              حفظ وصرف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
