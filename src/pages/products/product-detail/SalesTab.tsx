import React from 'react';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/productUnits';
import { money } from './format';
import { SalesRow } from './types';

interface SalesTabProps {
  product: Product;
  sales: SalesRow[];
}

export const SalesTab: React.FC<SalesTabProps> = ({ product, sales }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-bold text-slate-900">آخر المبيعات (أحدث 15 حركة)</h3></div>
      {sales.length === 0 ? <div className="text-center text-slate-500 py-12 text-sm">لا توجد مبيعات</div> : (
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50"><tr>{['التاريخ', 'العميل', `الكمية (${getProductUnitLabel(product)})`, 'الإجمالي'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {sales.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 text-slate-500">{r.date}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">{r.customer}</td>
                <td className="px-4 py-3 text-slate-700">{formatProductQuantity(r.qty, product)}</td>
                <td className="px-4 py-3 text-sky-600 font-bold">{money(r.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
