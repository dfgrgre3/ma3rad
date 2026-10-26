import React from 'react';
import { CeramicMath } from '../../utils/ceramicMath';

interface TopCustomersCardProps {
  topCustomers: any[];
}

export const TopCustomersCard: React.FC<TopCustomersCardProps> = ({ topCustomers }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">أفضل العملاء</h3>
      <p className="text-[11px] text-slate-400 mb-2">حسب إجمالي المشتريات التراكمية</p>
      <div className="space-y-1.5">
        {topCustomers.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">لا توجد بيانات عملاء بعد</div>
        ) : (
          topCustomers.map((c, idx) => (
            <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center justify-center shrink-0">
                  {c.name?.charAt(0) || 'ع'}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.invoiceCount || 0} فاتورة</div>
                </div>
              </div>
              <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400 text-xs shrink-0 mr-2">
                {CeramicMath.formatCurrency(c.totalAmount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
