import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../../contexts/useTheme';
import type { LowStockItem } from '../../../types/dashboard/executive';
import { formatProductQuantity } from '../../../utils/products/productUnits';

interface Props {
  lowStock: LowStockItem[];
}

export const LowStockAlertsCard: React.FC<Props> = ({ lowStock }) => {
  const { isDark } = useTheme();
  if (lowStock.length === 0) return null;

  return (
    <div className={`rounded-xl p-4 ${isDark ? 'bg-primary border-danger/30' : 'bg-surface border-danger-border'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <h3 className="text-sm font-bold text-ink dark:text-white">تنبيهات المخزون</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-danger/20 text-danger">
            {lowStock.length} صنف
          </span>
        </div>
        <span className="text-[10px] text-muted ">أصناف وصلت إلى الحد الأدنى أو نفدت</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {lowStock.map((item, i) => {
          const out = item.qty <= 0;
          const pct = item.min > 0 ? Math.min(100, (item.qty / item.min) * 100) : 0;
          return (
            <div key={i} className={`flex items-center gap-2 py-1 border-b last:border-0 ${isDark ? 'border-line-strong' : 'border-line'}`}>
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${out ? 'bg-danger' : 'bg-warning'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-ink dark:text-white truncate">{item.name}</div>
                <div className="text-[10px] text-muted truncate">{item.warehouse}</div>
                <div className={`h-1 rounded-full overflow-hidden mt-1 ${isDark ? 'bg-primary' : 'bg-surface-sunken'}`}>
                  <div
                    className={`h-full rounded-full transition-all ${out ? 'bg-danger' : 'bg-warning'}`}
                    style={{ width: `${out ? 100 : pct}%` }}
                  />
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className={`text-xs font-bold ${out ? 'text-danger' : 'text-warning'}`}>
                  {out ? 'نفد' : formatProductQuantity(item.qty, item)}
                </div>
                <div className="text-[10px] text-muted ">الحد: {formatProductQuantity(item.min, item)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
