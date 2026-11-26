import React from 'react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import type { TopCustomerItem } from '../../types/dashboard/components';

interface TopCustomersCardProps {
  topCustomers: TopCustomerItem[];
}

export const TopCustomersCard: React.FC<TopCustomersCardProps> = ({ topCustomers }) => {
  return (
    <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs">
      <h3 className="text-xs font-bold text-ink dark:text-white mb-0.5">أفضل العملاء</h3>
      <p className="text-[11px] text-muted mb-2">حسب إجمالي المشتريات التراكمية — كل الفترات</p>
      <div className="space-y-1.5">
        {topCustomers.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted">لا توجد بيانات عملاء بعد</div>
        ) : (
          topCustomers.map((c, idx) => (
            <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-surface-muted dark:bg-primary/60 border border-line text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md bg-surface-sunken text-ink font-bold text-[10px] flex items-center justify-center shrink-0">
                  {c.name?.charAt(0) || 'ع'}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-ink truncate">{c.name}</div>
                  <div className="text-[10px] text-muted">{c.invoiceCount} فاتورة</div>
                </div>
              </div>
              <span className="font-bold tabular-nums text-success text-xs shrink-0 mr-2">
                {CeramicMath.formatCurrency(c.totalAmount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
