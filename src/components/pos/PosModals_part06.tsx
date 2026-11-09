import React from 'react';
import { Lock, Printer } from 'lucide-react';
import type { CashShift } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { Field, Modal, inputCls } from './PosShared';

export const CloseShiftModal: React.FC<{
  shift: CashShift;
  expectedClosingCash: number;
  actualClosingCash: number;
  notes: string;
  hideExpected?: boolean;
  onActualClosingCashChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  onPrintZReport?: () => void;
}> = ({
  shift,
  expectedClosingCash,
  actualClosingCash,
  notes,
  hideExpected,
  onActualClosingCashChange,
  onNotesChange,
  onConfirm,
  onClose,
  onPrintZReport,
}) => {
  const cashDifference = Number((actualClosingCash - expectedClosingCash).toFixed(2));
  const cashDifferenceTone = cashDifference === 0 ? 'text-emerald-700' : cashDifference > 0 ? 'text-sky-700' : 'text-rose-700';

  return (
    <Modal title="إقفال الوردية ومطابقة الصندوق" icon={<Lock className="w-5 h-5" />} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">رقم الوردية</span><strong>{shift.shiftNumber}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">الرصيد الافتتاحي</span><strong>{CeramicMath.formatCurrency(shift.openingBalance)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">مبيعات نقدية</span><strong>{CeramicMath.formatCurrency(shift.totalSalesCash)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">تحصيلات العملاء</span><strong>{CeramicMath.formatCurrency(shift.totalCustomerPayments)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">مصروفات / مرتجعات</span><strong>{CeramicMath.formatCurrency((shift.totalExpenses || 0) + (shift.totalRefunds || 0))}</strong></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-bold">النقد المتوقع بالصندوق</span><strong className="text-emerald-700">{hideExpected ? '—' : CeramicMath.formatCurrency(expectedClosingCash)}</strong></div>
        </div>
        <Field label="النقد الفعلي بعد العد" id="close-shift-actual-cash">
          <input
            type="number"
            min="0"
            step="0.01"
            value={actualClosingCash || ''}
            onChange={(e) => onActualClosingCashChange(Number.parseFloat(e.target.value) || 0)}
            placeholder="0"
            className={inputCls}
          />
        </Field>
        {!hideExpected && <div className={`rounded-xl px-3 py-2 text-sm font-bold ${cashDifferenceTone} bg-emerald-50`}>فرق الصندوق المحسوب: {CeramicMath.formatCurrency(cashDifference)}</div>}
        <Field label="ملاحظات الإقفال" id="close-shift-notes">
          <textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="سبب العجز أو الزيادة، إن وجد..." className={inputCls} />
        </Field>
        <button onClick={onConfirm} className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl">تأكيد الرصيد المحسوب وإغلاق الوردية</button>
        {onPrintZReport && (
          <button onClick={onPrintZReport} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5">
            <Printer className="w-4 h-4" /> طباعة تقرير Z (ملخص الوردية)
          </button>
        )}
      </div>
    </Modal>
  );
};
