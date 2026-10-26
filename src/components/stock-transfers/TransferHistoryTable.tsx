import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatProductQuantity } from '../../utils/productUnits';
import { fmt } from './helpers';
import type { TransferHistoryTableProps } from './types';

export const TransferHistoryTable: React.FC<TransferHistoryTableProps> = ({ transfers }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
          <tr>
            <th className="p-3.5">رقم الحركة</th>
            <th className="p-3.5">التاريخ</th>
            <th className="p-3.5">الصنف</th>
            <th className="p-3.5">من مخزن</th>
            <th className="p-3.5">إلى مخزن</th>
            <th className="p-3.5 text-center">الكمية</th>
            <th className="p-3.5 text-center">الكراتين</th>
            <th className="p-3.5 text-center">التكلفة</th>
            <th className="p-3.5">المنفذ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transfers.map((t, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="p-3.5 font-mono font-bold text-slate-900">{t.transferNumber}</td>
              <td className="p-3.5 font-mono text-slate-500">{t.transferDate?.slice(0, 10)}</td>
              <td className="p-3.5">
                <div className="font-bold text-slate-900">{t.productName}</div>
                <div className="text-[10px] text-slate-500">{t.productSku}</div>
              </td>
              <td className="p-3.5">
                <span className="px-2 py-1 bg-red-50 text-red-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                  <ArrowUpRight className="w-3 h-3" />
                  {t.fromWarehouse}
                </span>
              </td>
              <td className="p-3.5">
                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-[10px] flex items-center gap-1 w-fit">
                  <ArrowDownRight className="w-3 h-3" />
                  {t.toWarehouse}
                </span>
              </td>
              <td className="p-3.5 text-center font-black text-sky-600">{formatProductQuantity(Number(t.quantityM2), t)}</td>
              <td className="p-3.5 text-center font-bold text-slate-700">{t.productType === 'GENERAL' ? '—' : t.boxesCount}</td>
              <td className="p-3.5 text-center font-mono font-black text-slate-900">{fmt(t.totalCost)} ج.م</td>
              <td className="p-3.5 text-slate-600">{t.performedByName || 'النظام'}</td>
            </tr>
          ))}
          {transfers.length === 0 && (
            <tr>
              <td colSpan={9} className="py-12 text-center text-slate-400">
                لا توجد حركات تحويل منفذة سابقة
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);
