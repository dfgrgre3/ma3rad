import React from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import type { StockReservation } from '../../../services/domains/sales/ReservationService';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import { reservationStatusLabels, reservationStatusStyles } from './constants';
import { ActivityGate } from '../../../components/ui/ActivityGate';

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
    <div className="bg-surface rounded-2xl border border-line/80 dark:border-line-strong shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable
        ariaLabel="سجلات الحجز"
        rows={reservations}
        rowKey={(r: any) => String(r.id)}
        tableClassName="text-sm"
        rowClassName={() => 'transition hover:bg-surface-muted/70 dark:hover:bg-primary/30'}
        columns={[
          { key: 'id', header: 'رقم الحجز', render: (r: any) => <span className="font-mono text-xs font-bold text-ink dark:text-white">{r.id}</span> },
          {
            key: 'product', header: 'الصنف',
            render: (r: any) => (
              <div>
                <div className="font-bold text-ink dark:text-white">{r.productName}</div>
                <div className="font-mono text-xs text-muted">{r.productSku}</div>
              </div>
            ),
          },
          { key: 'warehouse', header: 'المخزن', render: (r: any) => <span className="text-ink-secondary ">{r.warehouseName}</span> },
          { key: 'qty', header: 'الكمية المحجوزة', render: (r: any) => <span className="font-bold text-primary ">{formatProductQuantity(r.quantityM2, r)}</span> },
          {
            key: 'ref', header: 'المرجع',
            render: (r: any) => (
              <span className="text-xs text-ink-secondary ">
                <span className="font-semibold">{r.referenceType}</span>
                {r.referenceId && <span className="font-mono text-muted"> ({r.referenceId})</span>}
              </span>
            ),
          },
          { key: 'created', header: 'تاريخ الحجز', render: (r: any) => <span className="font-mono text-xs text-muted">{r.createdAt ? r.createdAt.substring(0, 10) : '—'}</span> },
          {
            key: 'expires', header: 'تاريخ الانتهاء',
            render: (r: any) => {
              const isExpired = r.status === 'ACTIVE' && r.expiresAt && new Date(r.expiresAt) < new Date();
              return r.expiresAt ? (
                <span className={`font-mono text-xs ${isExpired ? 'font-bold text-danger' : 'text-ink-secondary'}`}>{r.expiresAt.substring(0, 10)}</span>
              ) : (
                <span className="text-xs text-muted">بدون انتهاء</span>
              );
            },
          },
          {
            key: 'status', header: 'الحالة',
            render: (r: any) => (
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${reservationStatusStyles[r.status] || 'border-line bg-surface-muted text-ink-secondary'}`}>
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
                    <button onClick={() => onConsume(r.id)} className="rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-bold text-success transition hover:bg-success-soft" title="صرف وتنفيذ الحجز">صرف</button>
                    <ActivityGate element="release">
                      <button onClick={() => onRelease(r.id)} className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-bold text-danger transition hover:bg-danger-soft" title="فك الحجز">إلغاء الحجز</button>
                    </ActivityGate>
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
