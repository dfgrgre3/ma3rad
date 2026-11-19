import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Package } from 'lucide-react';
import type { DailyPurchaseItemRow } from '../../../services/domains/operations/DailyOperationsService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { sumItemQuantityByUnit } from './helpers';
import { ShareBar } from './primitives';
import type { NumberFormatter } from '../../../types/dashboard/todayPurchases';

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
          <DataTable
            ariaLabel="أصناف التوريد"
            rows={items}
            rowKey={(item: any) => String(item.id)}
            minWidth={860}
            dense
            tableClassName="text-xs"
            columns={[
              {
                key: 'product', header: 'الصنف',
                render: (item: any) => (
                  <span>
                    <span className="block font-semibold text-slate-900 dark:text-slate-100">{item.productName}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">{item.grade}</span>
                  </span>
                ),
              },
              { key: 'sku', header: 'الكود', render: (item: any) => <span className="whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">{item.sku || '—'}</span> },
              {
                key: 'invoice', header: 'الفاتورة',
                render: (item: any) => (
                  <button type="button" onClick={() => onDetails(item.purchaseId)} className="whitespace-nowrap font-mono font-bold text-orange-700 hover:underline dark:text-orange-300">
                    {item.invoiceNumber}
                  </button>
                ),
              },
              { key: 'supplier', header: 'المورد', render: (item: any) => <span className="text-slate-600 dark:text-slate-300">{item.supplierName || '—'}</span> },
              { key: 'qty', header: 'الكمية', render: (item: any) => <span className="whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">{formatProductQuantity(Number(item.quantityM2), item)}</span> },
              { key: 'boxes', header: 'الكراتين', render: (item: any) => <span className="whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">{plain(item.boxesCount)}</span> },
              { key: 'unitCost', header: 'تكلفة الوحدة', render: (item: any) => <span className="whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.unitCost)}</span> },
              { key: 'total', header: 'الإجمالي', render: (item: any) => <span className="whitespace-nowrap font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmt(item.totalCost)}</span> },
              {
                key: 'share', header: 'النسبة',
                render: (item: any) => {
                  const grand = items.reduce((sum, entry) => sum + (Number(entry.totalCost) || 0), 0);
                  const share = grand > 0 ? (Number(item.totalCost) / grand) * 100 : 0;
                  return <ShareBar share={share} />;
                },
              },
            ]}
          />
        </div>
      </>
    )}
  </div>
);
