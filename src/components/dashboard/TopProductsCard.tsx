import React from 'react';
import { CeramicMath } from '../../utils/ceramicMath';
import { formatProductQuantity } from '../../utils/productUnits';
import type { TopSellingProduct } from './types';

interface TopProductsCardProps {
  topProducts: TopSellingProduct[];
}

export const TopProductsCard: React.FC<TopProductsCardProps> = ({ topProducts }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">أكثر الأصناف طلباً</h3>
            <p className="text-[11px] text-slate-400">حسب إجمالي الكمية بوحدة كل صنف</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">أعلى 5</span>
        </div>

        <div className="space-y-1.5">
          {topProducts.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">لا توجد مبيعات مسجلة حتى الآن</div>
          ) : (
            topProducts.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-black text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400">{formatProductQuantity(p.quantityM2, p)}</div>
                  </div>
                </div>
                <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400 text-xs shrink-0 mr-2">
                  {CeramicMath.formatCurrency(p.totalRevenue)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
