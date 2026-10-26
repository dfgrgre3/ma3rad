import React from 'react';
import { Truck } from 'lucide-react';
import { timeOf } from './helpers';
import { ShareBar } from './primitives';
import type { NumberFormatter, SupplierStat } from './types';

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
          <table className="w-full min-w-[900px] text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>{['المورد', 'الهاتف', 'الفواتير', 'الأصناف', 'إجمالي التوريد', 'المدفوع', 'المتبقي', 'آخر توريد', 'الحصة'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {supplierStats.map((supplier) => {
                const grand = supplierStats.reduce((sum, row) => sum + row.total, 0);
                const share = grand > 0 ? (supplier.total / grand) * 100 : 0;
                return (
                  <tr key={supplier.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => onNavigate(supplier.id ? `/suppliers/${supplier.id}` : '/suppliers')} className="font-bold text-slate-900 hover:text-orange-700 dark:text-slate-100 dark:hover:text-orange-300">{supplier.name}</button>
                      {supplier.unpaid > 0 && <div className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400">{plain(supplier.unpaid)} فاتورة غير مسددة</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400" dir="ltr">{supplier.phone || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{plain(supplier.invoices)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{plain(supplier.itemsCount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(supplier.total)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(supplier.paid)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums ${supplier.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'}`}>{fmt(supplier.remaining)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400">{timeOf(supplier.lastTime)}</td>
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
