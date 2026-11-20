import React from 'react';
import { DataTable } from '../../../../components/ui/DataTable';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatProductQuantity } from '../../../../utils/products/productUnits';
import { fmt } from './helpers';
import type { TransferHistoryTableProps } from '../../../../types/inventory/stockTransfers';

export const TransferHistoryTable: React.FC<TransferHistoryTableProps> = ({ transfers }) => (
  <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <DataTable
        ariaLabel="سجل حركات التحويل"
        rows={transfers}
        rowKey={(t: any) => String(t.transferNumber ?? t.id)}
        dense
        tableClassName="text-xs"
        columns={[
          { key: 'num', header: 'رقم الحركة', render: (t: any) => <span className="font-mono font-bold text-ink">{t.transferNumber}</span> },
          { key: 'date', header: 'التاريخ', render: (t: any) => <span className="font-mono text-muted">{t.transferDate?.slice(0, 10)}</span> },
          {
            key: 'product', header: 'الصنف',
            render: (t: any) => (
              <span className="block">
                <span className="block font-bold text-ink">{t.productName}</span>
                <span className="block text-[10px] text-muted">{t.productSku}</span>
              </span>
            ),
          },
          {
            key: 'from', header: 'من مخزن',
            render: (t: any) => (
              <span className="flex w-fit items-center gap-1 rounded-lg bg-danger-soft px-2 py-1 text-[10px] font-bold text-danger">
                <ArrowUpRight className="h-3 w-3" />
                {t.fromWarehouse}
              </span>
            ),
          },
          {
            key: 'to', header: 'إلى مخزن',
            render: (t: any) => (
              <span className="flex w-fit items-center gap-1 rounded-lg bg-success-soft px-2 py-1 text-[10px] font-bold text-success">
                <ArrowDownRight className="h-3 w-3" />
                {t.toWarehouse}
              </span>
            ),
          },
          { key: 'qty', header: 'الكمية', align: 'center', render: (t: any) => <span className="font-black text-primary">{formatProductQuantity(Number(t.quantityM2), t)}</span> },
          { key: 'boxes', header: 'الكراتين', align: 'center', render: (t: any) => <span className="font-bold text-ink">{t.productType === 'GENERAL' ? '—' : t.boxesCount}</span> },
          { key: 'cost', header: 'التكلفة', align: 'center', render: (t: any) => <span className="font-mono font-black text-ink">{fmt(t.totalCost)} ج.م</span> },
          { key: 'by', header: 'المنفذ', render: (t: any) => <span className="text-ink-secondary">{t.performedByName || 'النظام'}</span> },
        ]}
        emptyTitle="لا توجد حركات تحويل منفذة سابقة"
      />
    </div>
  </div>
);
