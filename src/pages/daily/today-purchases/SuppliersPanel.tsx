import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Truck } from 'lucide-react';
import { timeOf } from './helpers';
import { ShareBar } from './primitives';
import type { NumberFormatter, SupplierStat } from '../../../types/dashboard/todayPurchases';

export interface SuppliersPanelProps {
  supplierStats: SupplierStat[];
  onNavigate: (path: string) => void;
  fmt: NumberFormatter;
  plain: NumberFormatter;
}

export const SuppliersPanel: React.FC<SuppliersPanelProps> = ({ supplierStats, onNavigate, fmt, plain }) => (
  <div role="tabpanel" aria-label="موردون اليوم">
    {supplierStats.length === 0 ? (
      <div className="flex flex-col items-center px-4 py-14 text-center">
        <Truck className="h-6 w-6 text-slate-400" />
        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا يوجد موردون في النطاق المحدد</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">سيظهر الموردون تلقائيًا عند تسجيل فواتير التوريد.</p>
      </div>
    ) : (
      <>
        <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-3">
          <div className="rounded-lg bg-orange-50 px-3 py-2 dark:bg-orange-950/40">
            <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-300">إجمالي مشتريات النطاق</p>
            <p className="mt-1 text-sm font-black tabular-nums text-orange-800 dark:text-orange-200">{fmt(supplierStats.reduce((sum, row) => sum + row.total, 0))}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">مسدد منهم</p>
            <p className="mt-1 text-sm font-black tabular-nums text-emerald-800 dark:text-emerald-200">{fmt(supplierStats.reduce((sum, row) => sum + row.paid, 0))}</p>
          </div>
          <div className="rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-950/40">
            <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">متبقي آجل</p>
            <p className="mt-1 text-sm font-black tabular-nums text-rose-800 dark:text-rose-200">{fmt(supplierStats.reduce((sum, row) => sum + row.remaining, 0))}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <DataTable
          ariaLabel="موردو اليوم"
          rows={supplierStats}
          rowKey={(supplier: any) => String(supplier.id)}
          minWidth={900}
          dense
          tableClassName="text-xs"
          columns={[
            {
              key: 'supplier', header: 'المورد',
              render: (supplier: any) => (
                <span>
                  <button type="button" onClick={() => onNavigate(supplier.id ? `/suppliers/${supplier.id}` : '/suppliers')} className="font-bold text-slate-900 hover:text-orange-700 dark:text-slate-100 dark:hover:text-orange-300">{supplier.name}</button>
                  {supplier.unpaid > 0 && <span className="mt-0.5 block text-[10px] text-rose-600 dark:text-rose-400">{plain(supplier.unpaid)} فاتورة غير مسددة</span>}
                </span>
              ),
            },
            { key: 'phone', header: 'الهاتف', render: (supplier: any) => <span className="whitespace-nowrap text-slate-500 dark:text-slate-400" dir="ltr">{supplier.phone || '—'}</span> },
            { key: 'invoices', header: 'الفواتير', render: (supplier: any) => <span className="tabular-nums text-slate-700 dark:text-slate-200">{plain(supplier.invoices)}</span> },
            { key: 'items', header: 'الأصناف', render: (supplier: any) => <span className="tabular-nums text-slate-600 dark:text-slate-300">{plain(supplier.itemsCount)}</span> },
            { key: 'total', header: 'إجمالي التوريد', render: (supplier: any) => <span className="whitespace-nowrap font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(supplier.total)}</span> },
            { key: 'paid', header: 'المدفوع', render: (supplier: any) => <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(supplier.paid)}</span> },
            {
              key: 'remaining', header: 'المتبقي',
              render: (supplier: any) => <span className={`whitespace-nowrap font-semibold tabular-nums ${supplier.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'}`}>{fmt(supplier.remaining)}</span>,
            },
            { key: 'last', header: 'آخر توريد', render: (supplier: any) => <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{timeOf(supplier.lastTime)}</span> },
            {
              key: 'share', header: 'الحصة',
              render: (supplier: any) => {
                const grand = supplierStats.reduce((sum, row) => sum + row.total, 0);
                const share = grand > 0 ? (supplier.total / grand) * 100 : 0;
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
