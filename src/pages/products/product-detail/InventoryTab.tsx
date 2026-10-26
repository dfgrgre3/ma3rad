import React from 'react';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import { fmt } from './format';
import { StockSummary } from './types';

interface InventoryTabProps {
  product: Product;
  stock: StockSummary;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ product, stock }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">توزيع المخزون بالمخازن</h3></div>
      {stock.rows.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد كميات مخزنة</div> : (
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50"><tr>{(product.productType === 'GENERAL'
            ? ['المخزن', getProductUnitLabel(product), 'محجوز', 'متاح']
            : ['المخزن', 'م²', 'كرتونة', 'قطعة', 'محجوز', 'متاح']).map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {stock.rows.map((r) => {
              const boxes = product.productType === 'GENERAL' ? 0 : Number((r.quantityM2 / (product.metersPerBox || 1)).toFixed(2));
              const pieces = product.productType === 'GENERAL' ? 0 : Math.round(boxes * (product.piecesPerBox || 1));
              return (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.warehouseName}</td>
                  <td className="px-4 py-3 text-sky-600 font-bold">{product.productType === 'GENERAL' ? formatProductQuantity(r.quantityM2, product) : fmt(r.quantityM2)}</td>
                  {product.productType !== 'GENERAL' && <>
                    <td className="px-4 py-3 text-slate-700">{fmt(boxes)}</td>
                    <td className="px-4 py-3 text-slate-700">{fmt(pieces)}</td>
                  </>}
                  <td className="px-4 py-3 text-amber-600">{fmt(r.reservedM2)}</td>
                  <td className="px-4 py-3 text-emerald-600 font-bold">{product.productType === 'GENERAL' ? formatProductQuantity(r.availableM2, product) : fmt(r.availableM2)}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-bold">
              <td className="px-4 py-3 text-slate-900">الإجمالي</td>
              <td className="px-4 py-3 text-sky-600">{fmt(stock.totalM2)}</td>
              {product.productType !== 'GENERAL' && <>
                <td className="px-4 py-3 text-slate-700">{fmt(stock.totalBoxes)}</td>
                <td className="px-4 py-3 text-slate-700">{fmt(stock.totalPieces)}</td>
              </>}
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};
