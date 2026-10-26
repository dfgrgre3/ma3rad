import React from 'react';
import { TrendingDown } from 'lucide-react';
import { CeramicMath } from '../../../utils/ceramicMath';
import { PurchasePriceHistoryRow } from './types';

export interface PriceHistoryTabProps {
  priceHistory: PurchasePriceHistoryRow[];
}

export const PriceHistoryTab: React.FC<PriceHistoryTabProps> = ({ priceHistory }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-sky-600" />
              <span>سجل أسعار الشراء وتطور التكلفة</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تتبع أسعار توريد الأصناف ومقارنة سعر الفاتورة بالتكلفة المحملة (Landed Cost)
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
            {priceHistory.length} صنف / حركة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">اسم المنتج / الصنف</th>
                <th className="p-3">الكمية (م² / قطعة)</th>
                <th className="p-3">سعر التوريد الفاتورة</th>
                <th className="p-3 text-indigo-700">تكلفة الوصول الفعلية</th>
                <th className="p-3">حالة المطابقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceHistory.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-600">{row.date}</td>
                  <td className="p-3 font-mono font-bold text-slate-900">{row.invoiceNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{row.productName}</td>
                  <td className="p-3 font-mono font-bold text-slate-700">{row.quantityM2}</td>
                  <td className="p-3 font-bold text-slate-800">
                    {CeramicMath.formatCurrency(row.unitCost)}
                  </td>
                  <td className="p-3 font-black text-indigo-700">
                    {CeramicMath.formatCurrency(row.effectiveUnitCost)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        row.matchingStatus === 'MATCHED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : row.matchingStatus === 'DISCREPANCY'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {row.matchingStatus === 'MATCHED'
                        ? 'مطابق'
                        : row.matchingStatus === 'DISCREPANCY'
                        ? 'يوجد فروق'
                        : 'مستقل'}
                    </span>
                  </td>
                </tr>
              ))}
              {priceHistory.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا يوجد سجل أسعار مسجل لهذا المورد حتى الآن.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
