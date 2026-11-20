import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CashShift } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';

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
    <div className="fixed inset-0 bg-surface/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-ink">تصفية وإغلاق الوردية</h3>
          <button onClick={onClose} className="text-muted hover:text-ink-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-surface-muted p-4 rounded-2xl space-y-2.5 text-xs border border-line">
          <div className="flex justify-between items-center">
            <span className="text-muted">الرصيد الافتتاحي:</span>
            <span className="font-bold text-ink">{CeramicMath.formatCurrency(activeShift.openingBalance)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">(+ ) مبيعات وتحصيلات:</span>
            <span className="font-bold text-success">{CeramicMath.formatCurrency(activeShift.totalSalesCash + activeShift.totalCustomerPayments)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">(-) مصروفات ومدفوعات:</span>
            <span className="font-bold text-danger">{CeramicMath.formatCurrency(activeShift.totalExpenses + activeShift.totalSupplierPayments + activeShift.totalRefunds)}</span>
          </div>
          <div className="border-t border-line pt-2 mt-2 flex justify-between items-center">
            <span className="font-black text-ink">المبلغ المتوقع:</span>
            <span className="font-black text-primary text-base">{CeramicMath.formatCurrency(expectedEndingCash)}</span>
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
            <p className="font-bold text-xs text-ink block mb-1.5">الرصيد الختامي المحسوب تلقائيًا</p>
            <div className="w-full px-4 py-3 bg-success-soft rounded-xl border border-success-border font-black text-lg text-success">
              {CeramicMath.formatCurrency(expectedEndingCash)}
            </div>
          </div>

          <div>
            <label htmlFor="closing-notes" className="font-bold text-xs text-ink block mb-1.5">ملاحظات الإغلاق</label>
            <textarea
              id="closing-notes"
              rows={2}
              placeholder="اكتب سبب العجز أو الزيادة إن وجد..."
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              className="w-full px-4 py-3 bg-surface-muted rounded-xl border border-line text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 bg-surface-sunken text-ink font-bold rounded-xl hover:bg-surface-sunken">
              تراجع
            </button>
            <button type="submit" className="flex-[2] px-5 py-3 bg-warning hover:bg-warning text-white font-bold rounded-xl shadow-lg shadow-warning/20">
              اعتماد الإغلاق
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
