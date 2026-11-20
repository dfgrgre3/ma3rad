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
        <Truck className="h-6 w-6 text-muted" />
        <p className="mt-3 text-sm font-bold text-ink ">لا يوجد موردون في النطاق المحدد</p>
        <p className="mt-1 text-xs text-muted ">سيظهر الموردون تلقائيًا عند تسجيل فواتير التوريد.</p>
      </div>
    ) : (
      <>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-warning-soft px-3 py-2 dark:bg-warning/40">
            <p className="text-[10px] font-semibold text-warning ">إجمالي مشتريات النطاق</p>
            <p className="mt-1 text-sm font-black tabular-nums text-warning ">{fmt(supplierStats.reduce((sum, row) => sum + row.total, 0))}</p>
          </div>
          <div className="rounded-lg bg-success-soft px-3 py-2 dark:bg-success/40">
            <p className="text-[10px] font-semibold text-success ">مسدد منهم</p>
            <p className="mt-1 text-sm font-black tabular-nums text-success ">{fmt(supplierStats.reduce((sum, row) => sum + row.paid, 0))}</p>
          </div>
          <div className="rounded-lg bg-danger-soft px-3 py-2 dark:bg-danger/40">
            <p className="text-[10px] font-semibold text-danger ">متبقي آجل</p>
            <p className="mt-1 text-sm font-black tabular-nums text-danger ">{fmt(supplierStats.reduce((sum, row) => sum + row.remaining, 0))}</p>
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
                  <button type="button" onClick={() => onNavigate(supplier.id ? `/suppliers/${supplier.id}` : '/suppliers')} className="font-bold text-ink hover:text-warning dark:hover:text-warning">{supplier.name}</button>
                  {supplier.unpaid > 0 && <span className="mt-0.5 block text-[10px] text-danger ">{plain(supplier.unpaid)} فاتورة غير مسددة</span>}
                </span>
              ),
            },
            { key: 'phone', header: 'الهاتف', render: (supplier: any) => <span className="whitespace-nowrap text-muted " dir="ltr">{supplier.phone || '—'}</span> },
            { key: 'invoices', header: 'الفواتير', render: (supplier: any) => <span className="tabular-nums text-ink ">{plain(supplier.invoices)}</span> },
            { key: 'items', header: 'الأصناف', render: (supplier: any) => <span className="tabular-nums text-ink-secondary ">{plain(supplier.itemsCount)}</span> },
            { key: 'total', header: 'إجمالي التوريد', render: (supplier: any) => <span className="whitespace-nowrap font-black tabular-nums text-ink ">{fmt(supplier.total)}</span> },
            { key: 'paid', header: 'المدفوع', render: (supplier: any) => <span className="whitespace-nowrap font-semibold tabular-nums text-success ">{fmt(supplier.paid)}</span> },
            {
              key: 'remaining', header: 'المتبقي',
              render: (supplier: any) => <span className={`whitespace-nowrap font-semibold tabular-nums ${supplier.remaining > 0 ? 'text-danger dark:text-danger' : 'text-muted'}`}>{fmt(supplier.remaining)}</span>,
            },
            { key: 'last', header: 'آخر توريد', render: (supplier: any) => <span className="whitespace-nowrap text-muted ">{timeOf(supplier.lastTime)}</span> },
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
