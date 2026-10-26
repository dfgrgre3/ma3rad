import React from 'react';
import { DollarSign } from 'lucide-react';
import { CeramicMath } from '../../../utils/ceramicMath';
import { SupplierPaymentRow } from './types';

export interface PaymentsTabProps {
  payments: SupplierPaymentRow[];
  canPay: boolean;
  onOpenPaymentModal: () => void;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({ payments, canPay, onOpenPaymentModal }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">سندات الصرف والمدفوعات</h3>
          <p className="text-xs text-slate-500">سجل الدفعات المسددة للمورد وتأثيرها على رصيد الحساب</p>
        </div>
        {canPay && (
          <button
            onClick={onOpenPaymentModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>تسجيل سند صرف جديد</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-right min-w-[700px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="p-3">رقم السند</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">المبلغ المسدد</th>
              <th className="p-3">طريقة الدفع</th>
              <th className="p-3">الخزينة / المصدر</th>
              <th className="p-3">البيان / ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold text-slate-900">{p.receipt_number}</td>
                <td className="p-3 text-slate-600">{p.date}</td>
                <td className="p-3 font-black text-emerald-700 text-sm">
                  {CeramicMath.formatCurrency(p.amount)}
                </td>
                <td className="p-3 font-bold text-slate-800">
                  {p.payment_type === 'CASH'
                    ? 'نقدي'
                    : p.payment_type === 'BANK'
                    ? 'تحويل بنكي'
                    : p.payment_type === 'CHEQUE'
                    ? 'شيك'
                    : p.payment_type}
                </td>
                <td className="p-3 font-mono text-slate-500">{p.register_id || 'cr_main'}</td>
                <td className="p-3 text-slate-600">{p.notes || '—'}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-400">
                  لا توجد سندات صرف مسجلة لهذا المورد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
