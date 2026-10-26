import React from 'react';
import { DatabaseManager } from '../../../database/db';

interface InventoryHistoryProps {
  productId: string;
  unitLabel: string;
}

export const InventoryHistory: React.FC<InventoryHistoryProps> = ({ productId, unitLabel }) => {
  const rows = DatabaseManager.getInstance().query<{ date: string; type: string; qty: number; warehouseName: string; notes: string }>(
    `SELECT it.created_at AS date, it.type, it.quantity_m2 AS qty, w.name AS warehouseName, COALESCE(it.notes, '') AS notes
     FROM inventory_transactions it LEFT JOIN warehouses w ON w.id = it.warehouse_id
     WHERE it.product_id = ? ORDER BY it.created_at DESC LIMIT 50`, [productId]
  );
  if (rows.length === 0) return <div className="text-center text-slate-500 py-8 text-sm">لا توجد حركات مخزون</div>;
  return (
    <table className="w-full text-sm text-right">
      <thead className="bg-slate-50"><tr>{['التاريخ', 'النوع', 'المخزن', `الكمية (${unitLabel})`, 'ملاحظات'].map((h) => <th key={h} className="px-4 py-2 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}><td className="px-4 py-2 text-slate-500">{r.date ? new Date(r.date).toLocaleString('ar-EG') : '—'}</td><td className="px-4 py-2 font-bold text-slate-700">{r.type}</td><td className="px-4 py-2 text-slate-600">{r.warehouseName || '—'}</td><td className="px-4 py-2 font-mono">{r.qty} {unitLabel}</td><td className="px-4 py-2 text-slate-500 max-w-[240px] truncate">{r.notes}</td></tr>
        ))}
      </tbody>
    </table>
  );
};
