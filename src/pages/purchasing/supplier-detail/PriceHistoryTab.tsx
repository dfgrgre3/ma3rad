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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-sky-600" />
              <span>سجل أسعار الشراء وتطور التكلفة</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تتبع أسعار توريد الأصناف ومقارنة سعر الفاتورة بالتكلفة المحملة (Landed Cost)
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
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
          rowClassName={() => 'transition hover:bg-slate-50'}
          columns={[
            { key: 'date', header: 'التاريخ', render: (row: any) => <span className="font-mono text-slate-600">{row.date}</span> },
            { key: 'inv', header: 'رقم الفاتورة', render: (row: any) => <span className="font-mono font-bold text-slate-900">{row.invoiceNumber}</span> },
            { key: 'product', header: 'اسم المنتج / الصنف', render: (row: any) => <span className="font-bold text-slate-800">{row.productName}</span> },
            { key: 'qty', header: 'الكمية (م² / قطعة)', render: (row: any) => <span className="font-mono font-bold text-slate-700">{row.quantityM2}</span> },
            { key: 'cost', header: 'سعر التوريد الفاتورة', render: (row: any) => <span className="font-bold text-slate-800">{CeramicMath.formatCurrency(row.unitCost)}</span> },
            { key: 'eff', header: 'تكلفة الوصول الفعلية', headerClassName: 'text-indigo-700', render: (row: any) => <span className="font-black text-indigo-700">{CeramicMath.formatCurrency(row.effectiveUnitCost)}</span> },
            {
              key: 'match', header: 'حالة المطابقة',
              render: (row: any) => (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.matchingStatus === 'MATCHED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : row.matchingStatus === 'DISCREPANCY' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
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
