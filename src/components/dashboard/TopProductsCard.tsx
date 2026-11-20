import React from 'react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import type { TopSellingProduct } from '../../types/dashboard/components';

interface TopProductsCardProps {
  topProducts: TopSellingProduct[];
}

export const TopProductsCard: React.FC<TopProductsCardProps> = ({ topProducts }) => {
  return (
    <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-ink dark:text-white">أكثر الأصناف طلباً</h3>
            <p className="text-[11px] text-muted">حسب إجمالي الكمية بوحدة كل صنف</p>
          </div>
          <span className="text-[11px] font-semibold text-muted">أعلى 5</span>
        </div>

        <div className="space-y-1.5">
          {topProducts.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">لا توجد مبيعات مسجلة حتى الآن</div>
          ) : (
            topProducts.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-accent-soft text-primary font-black text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-ink truncate">{p.name}</div>
                    <div className="text-[10px] text-muted">{formatProductQuantity(p.quantityM2, p)}</div>
                  </div>
                </div>
                <span className="font-bold tabular-nums text-primary text-xs shrink-0 mr-2">
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
