import React from 'react';
import { Receipt, AlertTriangle, Loader2 } from 'lucide-react';
import { Order } from '../../../services/OrderService';
import { PaymentType } from '../../../types';
import { Modal } from './ui';
import { fmt } from './types';

interface ConvertInvoiceModalProps {
  target: Order;
  paymentType: PaymentType;
  setPaymentType: (value: PaymentType) => void;
  paid: string;
  setPaid: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ConvertInvoiceModal: React.FC<ConvertInvoiceModalProps> = ({
  target: convertTarget, paymentType: convertPaymentType, setPaymentType: setConvertPaymentType,
  paid: convertPaid, setPaid: setConvertPaid, notes: convertNotes, setNotes: setConvertNotes,
  saving, onClose, onSubmit,
}) => (
  <Modal onClose={onClose}>
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600"><Receipt className="w-5 h-5" /><h3 className="text-base font-black">إصدار فاتورة للطلب {convertTarget.orderNumber}</h3></div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
        <span className="text-slate-500">قيمة الطلب</span><span className="font-black text-emerald-700">{fmt(convertTarget.totalAmount)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
          <select value={convertPaymentType} onChange={(e) => setConvertPaymentType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
            <option value="CREDIT">آجل بالكامل</option>
            <option value="CASH">نقدي بالكامل</option>
            <option value="CARD">بطاقة</option>
            <option value="BANK_TRANSFER">تحويل بنكي</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع مقدماً</label>
          <input type="number" min={0} step="0.01" value={convertPaid} onChange={(e) => setConvertPaid(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
        <input value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="اختياري" />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم خصم الكميات من المخزن وإتمام الطلب. تأكد من توفر الرصيد الكافي.</div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إصدار الفاتورة</button>
      </div>
    </form>
  </Modal>
);
