import React from 'react';
import { Receipt, DollarSign, ArrowUpRight } from 'lucide-react';
import type { Order } from '../../../services/OrderService';
import { fmtCurrency } from './helpers';
import { orderStatusBadges, orderStatusLabels } from './constants';

interface OrdersDepositsTableProps {
  orders: Order[];
  onRecordDeposit: (order: Order) => void;
  onConvertToInvoice: (order: Order) => void;
}

export const OrdersDepositsTable: React.FC<OrdersDepositsTableProps> = ({
  orders,
  onRecordDeposit,
  onConvertToInvoice,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-3.5">رقم الطلب</th>
              <th className="p-3.5">العميل</th>
              <th className="p-3.5">المخزن</th>
              <th className="p-3.5">إجمالي الطلب</th>
              <th className="p-3.5">العربون المدفوع</th>
              <th className="p-3.5">المتبقي</th>
              <th className="p-3.5">نسبة العربون</th>
              <th className="p-3.5">الحالة</th>
              <th className="p-3.5 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-slate-400">
                  لا توجد طلبات حجز مطابقة لخيارات البحث.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const percentPaid = o.totalAmount > 0 ? Math.round((o.paidAmount / o.totalAmount) * 100) : 0;
                return (
                  <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition">
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-sky-600" />
                      {o.orderNumber}
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      {o.customerName || 'عميل نقدي'}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {o.warehouseName || 'المخزن الرئيسي'}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      {fmtCurrency(o.totalAmount)}
                    </td>
                    <td className="p-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtCurrency(o.paidAmount)}
                    </td>
                    <td className="p-3.5 font-bold text-rose-600 dark:text-rose-400">
                      {fmtCurrency(o.remainingAmount)}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              percentPaid >= 100
                                ? 'bg-emerald-500'
                                : percentPaid > 0
                                ? 'bg-amber-500'
                                : 'bg-slate-300'
                            }`}
                            style={{ width: `${Math.min(100, percentPaid)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {percentPaid}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          orderStatusBadges[o.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {orderStatusLabels[o.status] || o.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                          <button
                            onClick={() => onRecordDeposit(o)}
                            className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-lg transition flex items-center gap-1"
                            title="تسجيل دفعة أو عربون"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            عربون
                          </button>
                        )}

                        {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                          <button
                            onClick={() => onConvertToInvoice(o)}
                            className="px-2.5 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 rounded-lg transition flex items-center gap-1"
                            title="إصدار فاتورة مبيعات وخصم العربون"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            فوترة
                          </button>
                        )}

                        {o.invoiceNumber && (
                          <span className="text-[11px] font-bold text-slate-500 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                            فـ: {o.invoiceNumber}
                          </span>
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
