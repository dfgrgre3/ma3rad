import React from 'react';
import { Package } from 'lucide-react';
import type { DailyPurchaseItemRow } from '../../../services/DailyOperationsService';
import { formatProductQuantity } from '../../../utils/productUnits';
import { sumItemQuantityByUnit } from './helpers';
import { ShareBar } from './primitives';
import type { NumberFormatter } from './types';

export interface ItemsPanelProps {
  items: DailyPurchaseItemRow[];
  onDetails: (id: string) => void;
  fmt: NumberFormatter;
  plain: NumberFormatter;
}

export const ItemsPanel: React.FC<ItemsPanelProps> = ({ items, onDetails, fmt, plain }) => (
  <div role="tabpanel" aria-label="أصناف التوريد">
    {items.length === 0 ? (
      <div className="flex flex-col items-center px-4 py-14 text-center">
        <Package className="h-6 w-6 text-slate-400" />
        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا توجد أصناف مطابقة</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">جرّب تعديل البحث أو الفلاتر، أو سجّل فاتورة توريد جديدة.</p>
      </div>
    ) : (
      <>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2 text-[11px] dark:border-slate-800">
          <span className="font-bold text-slate-700 dark:text-slate-200">{plain(items.length)} سطر صنف</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 dark:text-slate-400">{sumItemQuantityByUnit(items).map(([unit, quantity]) => `${plain(quantity)} ${unit}`).join('، ') || '0'}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 dark:text-slate-400">{fmt(items.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0))}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 dark:text-slate-400">{plain(items.reduce((sum, item) => sum + (Number(item.boxesCount) || 0), 0))} كرتونة</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>{['الصنف', 'الكود', 'الفاتورة', 'المورد', 'الكمية', 'الكراتين', 'تكلفة الوحدة', 'الإجمالي', 'النسبة'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const grand = items.reduce((sum, entry) => sum + (Number(entry.totalCost) || 0), 0);
                const share = grand > 0 ? (Number(item.totalCost) / grand) * 100 : 0;
                return (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.productName}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.grade}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{item.sku || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => onDetails(item.purchaseId)} className="font-mono font-bold text-orange-700 hover:underline dark:text-orange-300">
                        {item.invoiceNumber}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{item.supplierName || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{formatProductQuantity(Number(item.quantityM2), item)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{plain(item.boxesCount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.unitCost)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmt(item.totalCost)}</td>
                    <td className="px-3 py-2.5">
                      <ShareBar share={share} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
);
