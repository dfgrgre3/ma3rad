import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { DatabaseManager } from '../../../database/repositories/databaseManager';

interface PriceListsForProductProps {
  productId: string;
  unitLabel: string;
}

export const PriceListsForProduct: React.FC<PriceListsForProductProps> = ({ productId, unitLabel }) => {
  const rows = DatabaseManager.getInstance().query<{ id: string; name: string; priceM2: number; currency: string }>(
    `SELECT pl.id, pl.name, pli.price_m2 / 100.0 AS priceM2, pl.currency
     FROM price_list_items pli JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.product_id = ? ORDER BY pl.name`, [productId]
  );
  if (rows.length === 0) return <div className="text-center text-slate-500 py-8 text-sm">لا توجد قوائم أسعار مرتبطة</div>;
  return (
    <DataTable
      ariaLabel="قوائم أسعار المنتج"
      rows={rows}
      rowKey={(r: any) => String(r.id)}
      dense
      tableClassName="text-sm"
      columns={[
        { key: 'name', header: 'قائمة الأسعار', render: (r: any) => <span className="font-medium">{r.name}</span> },
        { key: 'price', header: `السعر (${unitLabel})`, render: (r: any) => <span className="font-mono font-bold text-sky-600">{r.priceM2}</span> },
        { key: 'cur', header: 'العملة', render: (r: any) => <span className="text-slate-500">{r.currency}</span> },
      ]}
    />
  );
};
