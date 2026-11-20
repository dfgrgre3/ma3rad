import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { TrendingDown } from 'lucide-react';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { PurchasePriceHistoryRow } from '../../../types/purchasing/supplierDetailPage';

export interface PriceHistoryTabProps {
  priceHistory: PurchasePriceHistoryRow[];
}

export const PriceHistoryTab: React.FC<PriceHistoryTabProps> = ({ priceHistory }) => {
  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-primary" />
              <span>سجل أسعار الشراء وتطور التكلفة</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              تتبع أسعار توريد الأصناف ومقارنة سعر الفاتورة بالتكلفة المحملة (Landed Cost)
            </p>
          </div>
          <span className="text-xs font-bold text-ink-secondary bg-surface-sunken px-3 py-1 rounded-xl">
            {priceHistory.length} صنف / حركة
          </span>
        </div>

        <div className="overflow-x-auto">
          <DataTable
          ariaLabel="سجل أسعار التوريد"
          rows={priceHistory.map((row: any, idx: number) => ({ ...row, __i: idx }))}
          rowKey={(row: any) => String(row.__i)}
          dense
          tableClassName="text-xs"
          rowClassName={() => 'transition hover:bg-surface-muted'}
          columns={[
            { key: 'date', header: 'التاريخ', render: (row: any) => <span className="font-mono text-ink-secondary">{row.date}</span> },
            { key: 'inv', header: 'رقم الفاتورة', render: (row: any) => <span className="font-mono font-bold text-ink">{row.invoiceNumber}</span> },
            { key: 'product', header: 'اسم المنتج / الصنف', render: (row: any) => <span className="font-bold text-ink">{row.productName}</span> },
            { key: 'qty', header: 'الكمية (م² / قطعة)', render: (row: any) => <span className="font-mono font-bold text-ink">{row.quantityM2}</span> },
            { key: 'cost', header: 'سعر التوريد الفاتورة', render: (row: any) => <span className="font-bold text-ink">{CeramicMath.formatCurrency(row.unitCost)}</span> },
            { key: 'eff', header: 'تكلفة الوصول الفعلية', headerClassName: 'text-primary', render: (row: any) => <span className="font-black text-primary">{CeramicMath.formatCurrency(row.effectiveUnitCost)}</span> },
            {
              key: 'match', header: 'حالة المطابقة',
              render: (row: any) => (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.matchingStatus === 'MATCHED' ? 'border-success-border bg-success-soft text-success' : row.matchingStatus === 'DISCREPANCY' ? 'border-danger-border bg-danger-soft text-danger' : 'border-line bg-surface-muted text-ink-secondary'}`}>
                  {row.matchingStatus === 'MATCHED' ? 'مطابق' : row.matchingStatus === 'DISCREPANCY' ? 'يوجد فروق' : 'مستقل'}
                </span>
              ),
            },
          ]}
          emptyTitle="لا يوجد سجل أسعار مسجل لهذا المورد حتى الآن."
        />
        </div>
      </div>
    </div>
  );
};
