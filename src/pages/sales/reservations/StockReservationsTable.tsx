import React from 'react';
import type { StockReservation } from '../../../services/ReservationService';
import { formatProductQuantity } from '../../../utils/productUnits';
import { reservationStatusLabels, reservationStatusStyles } from './constants';

interface StockReservationsTableProps {
  reservations: StockReservation[];
  onConsume: (id: string) => void;
  onRelease: (id: string) => void;
}

export const StockReservationsTable: React.FC<StockReservationsTableProps> = ({
  reservations,
  onConsume,
  onRelease,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-3.5">رقم الحجز</th>
              <th className="p-3.5">الصنف</th>
              <th className="p-3.5">المخزن</th>
              <th className="p-3.5">الكمية المحجوزة</th>
              <th className="p-3.5">المرجع</th>
              <th className="p-3.5">تاريخ الحجز</th>
              <th className="p-3.5">تاريخ الانتهاء</th>
              <th className="p-3.5">الحالة</th>
              <th className="p-3.5 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-slate-400">
                  لا توجد سجلات حجز مطابقة لخيارات البحث.
                </td>
              </tr>
            ) : (
              reservations.map((r) => {
                const isExpired = r.status === 'ACTIVE' && r.expiresAt && new Date(r.expiresAt) < new Date();
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                    <td className="p-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {r.id}
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{r.productName}</div>
                      <div className="text-xs text-slate-400 font-mono">{r.productSku}</div>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {r.warehouseName}
                    </td>
                    <td className="p-3.5 font-bold text-sky-700 dark:text-sky-300">
                      {formatProductQuantity(r.quantityM2, r)}
                    </td>
                    <td className="p-3.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">{r.referenceType}</span>
                      {r.referenceId && <span className="font-mono text-slate-400"> ({r.referenceId})</span>}
                    </td>
                    <td className="p-3.5 text-xs text-slate-500 font-mono">
                      {r.createdAt ? r.createdAt.substring(0, 10) : '—'}
                    </td>
                    <td className="p-3.5 text-xs font-mono">
                      {r.expiresAt ? (
                        <span className={isExpired ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                          {r.expiresAt.substring(0, 10)}
                        </span>
                      ) : (
                        <span className="text-slate-400">بدون انتهاء</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          reservationStatusStyles[r.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {reservationStatusLabels[r.status] || r.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {r.status === 'ACTIVE' && (
                          <>
                            <button
                              onClick={() => onConsume(r.id)}
                              className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                              title="صرف وتنفيذ الحجز"
                            >
                              صرف
                            </button>
                            <button
                              onClick={() => onRelease(r.id)}
                              className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                              title="فك الحجز"
                            >
                              إلغاء الحجز
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
