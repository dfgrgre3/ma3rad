import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import type { StockReservation } from '../../../services/domains/sales/ReservationService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { reservationStatusLabels, reservationStatusStyles } from './constants';

interface StockReservationsTableProps {
  reservations: StockReservation[];
  canAdjust?: boolean;
  onConsume: (id: string) => void;
  onRelease: (id: string) => void;
}

export const StockReservationsTable: React.FC<StockReservationsTableProps> = ({
  reservations,
  canAdjust = false,
  onConsume,
  onRelease,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable
        ariaLabel="سجلات الحجز"
        rows={reservations}
        rowKey={(r: any) => String(r.id)}
        tableClassName="text-sm"
        rowClassName={() => 'transition hover:bg-slate-50/70 dark:hover:bg-slate-700/30'}
        columns={[
          { key: 'id', header: 'رقم الحجز', render: (r: any) => <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{r.id}</span> },
          {
            key: 'product', header: 'الصنف',
            render: (r: any) => (
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{r.productName}</div>
                <div className="font-mono text-xs text-slate-400">{r.productSku}</div>
              </div>
            ),
          },
          { key: 'warehouse', header: 'المخزن', render: (r: any) => <span className="text-slate-600 dark:text-slate-300">{r.warehouseName}</span> },
          { key: 'qty', header: 'الكمية المحجوزة', render: (r: any) => <span className="font-bold text-sky-700 dark:text-sky-300">{formatProductQuantity(r.quantityM2, r)}</span> },
          {
            key: 'ref', header: 'المرجع',
            render: (r: any) => (
              <span className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{r.referenceType}</span>
                {r.referenceId && <span className="font-mono text-slate-400"> ({r.referenceId})</span>}
              </span>
            ),
          },
          { key: 'created', header: 'تاريخ الحجز', render: (r: any) => <span className="font-mono text-xs text-slate-500">{r.createdAt ? r.createdAt.substring(0, 10) : '—'}</span> },
          {
            key: 'expires', header: 'تاريخ الانتهاء',
            render: (r: any) => {
              const isExpired = r.status === 'ACTIVE' && r.expiresAt && new Date(r.expiresAt) < new Date();
              return r.expiresAt ? (
                <span className={`font-mono text-xs ${isExpired ? 'font-bold text-rose-600' : 'text-slate-600'}`}>{r.expiresAt.substring(0, 10)}</span>
              ) : (
                <span className="text-xs text-slate-400">بدون انتهاء</span>
              );
            },
          },
          {
            key: 'status', header: 'الحالة',
            render: (r: any) => (
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${reservationStatusStyles[r.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                {reservationStatusLabels[r.status] || r.status}
              </span>
            ),
          },
          {
            key: 'actions', header: 'إجراءات', align: 'center',
            render: (r: any) => (
              <div className="flex items-center justify-center gap-1.5">
                {canAdjust && r.status === 'ACTIVE' && (
                  <>
                    <button onClick={() => onConsume(r.id)} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100" title="صرف وتنفيذ الحجز">صرف</button>
                    <button onClick={() => onRelease(r.id)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100" title="فك الحجز">إلغاء الحجز</button>
                  </>
                )}
              </div>
            ),
          },
        ]}
        emptyTitle="لا توجد سجلات حجز مطابقة لخيارات البحث."
      />
      </div>
    </div>
  );
};
