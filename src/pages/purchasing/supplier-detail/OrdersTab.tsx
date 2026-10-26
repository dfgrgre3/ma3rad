import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/ceramicMath';
import { SupplierOrderRow, ORDER_STATUS_BADGES } from './types';

export interface OrdersTabProps {
  orders: SupplierOrderRow[];
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ orders }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">أوامر الشراء والتوريد</h3>
          <p className="text-xs text-slate-500">أوامر التوريد الصادرة ومتابعة حالة الاستلام</p>
        </div>
        <Link
          to="/purchases/orders"
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إنشاء أمر شراء جديد</span>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-right min-w-[700px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="p-3">رقم الأمر</th>
              <th className="p-3">تاريخ الأمر</th>
              <th className="p-3">تاريخ التسليم المتوقع</th>
              <th className="p-3">الإجمالي التقديري</th>
              <th className="p-3">حالة الأمر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((ord) => (
              <tr key={ord.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold text-slate-900">{ord.order_number}</td>
                <td className="p-3 text-slate-600">{ord.date}</td>
                <td className="p-3 text-slate-600">{ord.expected_delivery_date || '—'}</td>
                <td className="p-3 font-bold text-slate-900">
                  {CeramicMath.formatCurrency(ord.total_amount)}
                </td>
                <td className="p-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      ORDER_STATUS_BADGES[ord.status]?.className ||
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {ORDER_STATUS_BADGES[ord.status]?.label || ord.status}
                  </span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-400">
                  لا توجد أوامر شراء مسجلة لهذا المورد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
