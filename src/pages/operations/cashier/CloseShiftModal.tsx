import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CashShift } from '../../../types';
import { CeramicMath } from '../../../utils/ceramicMath';

interface Props {
  isOpen: boolean;
  activeShift: CashShift | null;
  expectedEndingCash: number;
  onClose: () => void;
  onSubmit: (closingNotes: string) => Promise<void>;
}

export const CloseShiftModal: React.FC<Props> = ({
  isOpen,
  activeShift,
  expectedEndingCash,
  onClose,
  onSubmit,
}) => {
  const [closingNotes, setClosingNotes] = useState('');

  if (!isOpen || !activeShift) return null;

  return (
    <div className="fixed inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">تصفية وإغلاق الوردية</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl space-y-2.5 text-xs border border-slate-100">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">الرصيد الافتتاحي:</span>
            <span className="font-bold text-slate-900">{CeramicMath.formatCurrency(activeShift.openingBalance)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">(+ ) مبيعات وتحصيلات:</span>
            <span className="font-bold text-emerald-600">{CeramicMath.formatCurrency(activeShift.totalSalesCash + activeShift.totalCustomerPayments)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">(-) مصروفات ومدفوعات:</span>
            <span className="font-bold text-red-500">{CeramicMath.formatCurrency(activeShift.totalExpenses + activeShift.totalSupplierPayments + activeShift.totalRefunds)}</span>
          </div>
          <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between items-center">
            <span className="font-black text-slate-900">المبلغ المتوقع:</span>
            <span className="font-black text-sky-600 text-base">{CeramicMath.formatCurrency(expectedEndingCash)}</span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(closingNotes);
          }}
          className="space-y-4"
        >
          <div>
            <p className="font-bold text-xs text-slate-700 block mb-1.5">الرصيد الختامي المحسوب تلقائيًا</p>
            <div className="w-full px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-200 font-black text-lg text-emerald-700">
              {CeramicMath.formatCurrency(expectedEndingCash)}
            </div>
          </div>

          <div>
            <label htmlFor="closing-notes" className="font-bold text-xs text-slate-700 block mb-1.5">ملاحظات الإغلاق</label>
            <textarea
              id="closing-notes"
              rows={2}
              placeholder="اكتب سبب العجز أو الزيادة إن وجد..."
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">
              تراجع
            </button>
            <button type="submit" className="flex-[2] px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-lg shadow-amber-600/20">
              اعتماد الإغلاق
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
