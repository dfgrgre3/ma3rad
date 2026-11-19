import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { money } from './format';
import { PurchaseRow } from '../../../types/products/productDetailPage';

interface PurchasesTabProps {
  product: Product;
  purchases: PurchaseRow[];
}

export const PurchasesTab: React.FC<PurchasesTabProps> = ({ product, purchases }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">آخر المشتريات (أحدث 15 حركة)</h3></div>
      {purchases.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مشتريات</div> : (
        <DataTable
          ariaLabel="مشتريات المنتج"
          rows={purchases.map((r: any, i: number) => ({ ...r, __i: i }))}
          rowKey={(r: any) => String(r.__i)}
          tableClassName="text-sm"
          rowClassName={() => 'transition hover:bg-slate-50/70'}
          columns={[
            { key: 'date', header: 'التاريخ', render: (r: any) => <span className="text-slate-500">{r.date}</span> },
            { key: 'supplier', header: 'المورد', render: (r: any) => <span className="font-medium text-slate-900">{r.supplier}</span> },
            { key: 'qty', header: `الكمية (${getProductUnitLabel(product)})`, render: (r: any) => <span className="text-slate-700">{formatProductQuantity(r.qty, product)}</span> },
            { key: 'cost', header: 'التكلفة', render: (r: any) => <span className="font-bold text-rose-600">{money(r.cost)}</span> },
          ]}
        />
      )}
    </div>
  );
};
