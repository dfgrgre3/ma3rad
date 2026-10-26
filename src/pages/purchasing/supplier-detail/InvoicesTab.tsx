import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/ceramicMath';
import { SupplierInvoiceRow, PAY_STATUS_BADGES } from './types';

export interface InvoicesTabProps {
  invoices: SupplierInvoiceRow[];
}

export const InvoicesTab: React.FC<InvoicesTabProps> = ({ invoices }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">سجل فواتير التوريد والشراء</h3>
          <p className="text-xs text-slate-500">كل الفواتير الصادرة من هذا المورد مع حالة السداد والمتبقي</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/purchases"
            className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>فاتورة شراء جديدة</span>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-right min-w-[700px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="p-3">رقم الفاتورة</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">الإجمالي</th>
              <th className="p-3">المدفوع</th>
              <th className="p-3">المتبقي</th>
              <th className="p-3">حالة السداد</th>
              <th className="p-3">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                <td className="p-3 text-slate-600">{inv.date}</td>
                <td className="p-3 font-black text-slate-900">
                  {CeramicMath.formatCurrency(inv.total_amount)}
                </td>
                <td className="p-3 font-bold text-emerald-700">
                  {CeramicMath.formatCurrency(inv.paid_amount)}
                </td>
                <td className="p-3 font-bold text-rose-700">
                  {CeramicMath.formatCurrency(inv.remaining_amount)}
                </td>
                <td className="p-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      PAY_STATUS_BADGES[inv.payment_status]?.className ||
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {PAY_STATUS_BADGES[inv.payment_status]?.label || inv.payment_status}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{inv.notes || '—'}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-slate-400">
                  لا توجد فواتير مسجلة لهذا المورد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
