import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { fmt } from './format';
import { StockSummary } from '../../../types/products/productDetailPage';

interface InventoryTabProps {
  product: Product;
  stock: StockSummary;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ product, stock }) => {
  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      <div className="p-4 border-b border-line"><h3 className="text-sm font-bold text-ink">توزيع المخزون بالمخازن</h3></div>
      {stock.rows.length === 0 ? <div className="text-center text-muted py-12 text-sm">لا توجد كميات مخزنة</div> : (
        <DataTable
          ariaLabel="مخزون المنتج حسب المخزن"
          rows={stock.rows}
          rowKey={(r: any) => String(r.id)}
          tableClassName="text-sm"
          rowClassName={() => 'transition hover:bg-surface-muted/70'}
          columns={[
            { key: 'wh', header: 'المخزن', render: (r: any) => <span className="font-medium text-ink">{r.warehouseName}</span> },
            {
              key: 'qty', header: product.productType === 'GENERAL' ? getProductUnitLabel(product) : 'م²',
              render: (r: any) => <span className="font-bold text-primary">{product.productType === 'GENERAL' ? formatProductQuantity(r.quantityM2, product) : fmt(r.quantityM2)}</span>,
            },
            ...(product.productType !== 'GENERAL' ? [
              { key: 'boxes', header: 'كرتونة', render: (r: any) => { const boxes = Number((r.quantityM2 / (product.metersPerBox || 1)).toFixed(2)); return <span className="text-ink">{fmt(boxes)}</span>; } },
              { key: 'pieces', header: 'قطعة', render: (r: any) => { const boxes = Number((r.quantityM2 / (product.metersPerBox || 1)).toFixed(2)); const pieces = Math.round(boxes * (product.piecesPerBox || 1)); return <span className="text-ink">{fmt(pieces)}</span>; } },
            ] : []),
            { key: 'res', header: 'محجوز', render: (r: any) => <span className="text-warning">{fmt(r.reservedM2)}</span> },
            {
              key: 'avail', header: 'متاح',
              render: (r: any) => <span className="font-bold text-success">{product.productType === 'GENERAL' ? formatProductQuantity(r.availableM2, product) : fmt(r.availableM2)}</span>,
            },
          ]}
          footer={(
            <tr className="bg-surface-muted font-bold">
              <td className="px-4 py-3 text-ink">الإجمالي</td>
              <td className="px-4 py-3 text-primary">{fmt(stock.totalM2)}</td>
              {product.productType !== 'GENERAL' && <>
                <td className="px-4 py-3 text-ink">{fmt(stock.totalBoxes)}</td>
                <td className="px-4 py-3 text-ink">{fmt(stock.totalPieces)}</td>
              </>}
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
            </tr>
          )}
        />
      )}
    </div>
  );
};
