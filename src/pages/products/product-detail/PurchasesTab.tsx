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
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      <div className="p-4 border-b border-line"><h3 className="text-sm font-bold text-ink">آخر المشتريات (أحدث 15 حركة)</h3></div>
      {purchases.length === 0 ? <div className="text-center text-muted py-12 text-sm">لا توجد مشتريات</div> : (
        <DataTable
          ariaLabel="مشتريات المنتج"
          rows={purchases.map((r: any, i: number) => ({ ...r, __i: i }))}
          rowKey={(r: any) => String(r.__i)}
          tableClassName="text-sm"
          rowClassName={() => 'transition hover:bg-surface-muted/70'}
          columns={[
            { key: 'date', header: 'التاريخ', render: (r: any) => <span className="text-muted">{r.date}</span> },
            { key: 'supplier', header: 'المورد', render: (r: any) => <span className="font-medium text-ink">{r.supplier}</span> },
            { key: 'qty', header: `الكمية (${getProductUnitLabel(product)})`, render: (r: any) => <span className="text-ink">{formatProductQuantity(r.qty, product)}</span> },
            { key: 'cost', header: 'التكلفة', render: (r: any) => <span className="font-bold text-danger">{money(r.cost)}</span> },
          ]}
        />
      )}
    </div>
  );
};
