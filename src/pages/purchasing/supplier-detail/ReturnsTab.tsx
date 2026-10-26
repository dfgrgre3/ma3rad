import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { CeramicMath } from '../../../utils/ceramicMath';
import { SupplierReturnRow } from './types';

export interface ReturnsTabProps {
  returns: SupplierReturnRow[];
}

export const ReturnsTab: React.FC<ReturnsTabProps> = ({ returns }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">مرتجعات الشراء للمورد</h3>
          <p className="text-xs text-slate-500">حركات إرجاع البضاعة والتسويات المدينة على المورد</p>
        </div>
        <Link
          to="/purchases/returns"
          className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>تسجيل مرتجع شراء</span>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-right min-w-[700px]">
          <thead className="bg-slate-50 text-slate-500 font-bold">
            <tr>
              <th className="p-3">رقم المرتجع</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">قيمة المرتجع</th>
              <th className="p-3">سبب الإرجاع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {returns.map((ret) => (
              <tr key={ret.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold text-slate-900">{ret.return_number}</td>
                <td className="p-3 text-slate-600">{ret.date}</td>
                <td className="p-3 font-black text-rose-700">
                  {CeramicMath.formatCurrency(ret.total_amount)}
                </td>
                <td className="p-3 text-slate-700">{ret.reason || '—'}</td>
              </tr>
            ))}
            {returns.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-400">
                  لا توجد مرتجعات شراء مسجلة لهذا المورد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
