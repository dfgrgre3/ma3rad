import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { LowStockItem } from './types';
import { formatProductQuantity } from '../../../utils/productUnits';

interface Props {
  lowStock: LowStockItem[];
}

export const LowStockAlertsCard: React.FC<Props> = ({ lowStock }) => {
  if (lowStock.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-rose-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <h3 className="text-sm font-bold text-slate-900">تنبيهات المخزون</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-600">
            {lowStock.length} صنف
          </span>
        </div>
        <span className="text-[10px] text-slate-500">أصناف وصلت إلى الحد الأدنى أو نفدت</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {lowStock.map((item, i) => {
          const out = item.qty <= 0;
          const pct = item.min > 0 ? Math.min(100, (item.qty / item.min) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${out ? 'bg-rose-600' : 'bg-amber-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">{item.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{item.warehouse}</div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full transition-all ${out ? 'bg-rose-600' : 'bg-amber-500'}`}
                    style={{ width: `${out ? 100 : pct}%` }}
                  />
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className={`text-xs font-bold ${out ? 'text-rose-600' : 'text-amber-600'}`}>
                  {out ? 'نفد' : formatProductQuantity(item.qty, item)}
                </div>
                <div className="text-[10px] text-slate-500">الحد: {formatProductQuantity(item.min, item)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
