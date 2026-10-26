import React from 'react';
import { DatabaseManager } from '../../../database/db';

interface PriceListsForProductProps {
  productId: string;
  unitLabel: string;
}

export const PriceListsForProduct: React.FC<PriceListsForProductProps> = ({ productId, unitLabel }) => {
  const rows = DatabaseManager.getInstance().query<{ id: string; name: string; priceM2: number; currency: string }>(
    `SELECT pl.id, pl.name, pli.price_m2 AS priceM2, pl.currency
     FROM price_list_items pli JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.product_id = ? ORDER BY pl.name`, [productId]
  );
  if (rows.length === 0) return <div className="text-center text-slate-500 py-8 text-sm">لا توجد قوائم أسعار مرتبطة</div>;
  return (
    <table className="w-full text-sm text-right">
      <thead className="bg-slate-50"><tr>{['قائمة الأسعار', `السعر (${unitLabel})`, 'العملة'].map((h) => <th key={h} className="px-4 py-2 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.id}><td className="px-4 py-2 font-medium">{r.name}</td><td className="px-4 py-2 font-mono text-sky-600 font-bold">{r.priceM2}</td><td className="px-4 py-2 text-slate-500">{r.currency}</td></tr>
        ))}
      </tbody>
    </table>
  );
};
