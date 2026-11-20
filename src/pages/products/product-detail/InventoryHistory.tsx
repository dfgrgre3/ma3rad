import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';

interface InventoryHistoryProps {
  productId: string;
  unitLabel: string;
}

export const InventoryHistory: React.FC<InventoryHistoryProps> = ({ productId, unitLabel }) => {
  const scope = new BranchAccessService().warehouseBranchScope('w', undefined, AuthService.requireAuth());
  const rows = DatabaseManager.getInstance().query<{ date: string; type: string; qty: number; warehouseName: string; notes: string }>(
    `SELECT it.created_at AS date, it.type, it.quantity_m2 AS qty, w.name AS warehouseName, COALESCE(it.notes, '') AS notes
     FROM inventory_transactions it JOIN warehouses w ON w.id = it.warehouse_id
     WHERE it.product_id = ? AND ${scope.clause} ORDER BY it.created_at DESC LIMIT 50`, [productId, ...scope.params]
  );
  if (rows.length === 0) return <div className="text-center text-muted py-8 text-sm">لا توجد حركات مخزون</div>;
  return (
    <DataTable
      ariaLabel="سجل حركة المخزون"
      rows={rows.map((r: any, i: number) => ({ ...r, __i: i }))}
      rowKey={(r: any) => String(r.__i)}
      dense
      tableClassName="text-sm"
      columns={[
        { key: 'date', header: 'التاريخ', render: (r: any) => <span className="text-muted">{r.date ? new Date(r.date).toLocaleString('ar-EG') : '—'}</span> },
        { key: 'type', header: 'النوع', render: (r: any) => <span className="font-bold text-ink">{r.type}</span> },
        { key: 'wh', header: 'المخزن', render: (r: any) => <span className="text-ink-secondary">{r.warehouseName || '—'}</span> },
        { key: 'qty', header: `الكمية (${unitLabel})`, render: (r: any) => <span className="font-mono">{r.qty} {unitLabel}</span> },
        { key: 'notes', header: 'ملاحظات', render: (r: any) => <span className="block max-w-[240px] truncate text-muted">{r.notes}</span> },
      ]}
    />
  );
};
