import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { money } from './format';
import { SalesRow } from '../../../types/products/productDetailPage';

interface SalesTabProps {
  product: Product;
  sales: SalesRow[];
}

export const SalesTab: React.FC<SalesTabProps> = ({ product, sales }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">آخر المبيعات (أحدث 15 حركة)</h3></div>
      {sales.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مبيعات</div> : (
        <DataTable
          ariaLabel="مبيعات المنتج"
          rows={sales.map((r: any, i: number) => ({ ...r, __i: i }))}
          rowKey={(r: any) => String(r.__i)}
          tableClassName="text-sm"
          rowClassName={() => 'transition hover:bg-slate-50/70'}
          columns={[
            { key: 'date', header: 'التاريخ', render: (r: any) => <span className="text-slate-500">{r.date}</span> },
            { key: 'customer', header: 'العميل', render: (r: any) => <span className="font-medium text-slate-900">{r.customer}</span> },
            { key: 'qty', header: `الكمية (${getProductUnitLabel(product)})`, render: (r: any) => <span className="text-slate-700">{formatProductQuantity(r.qty, product)}</span> },
            { key: 'price', header: 'الإجمالي', render: (r: any) => <span className="font-bold text-sky-600">{money(r.price)}</span> },
          ]}
        />
      )}
    </div>
  );
};
