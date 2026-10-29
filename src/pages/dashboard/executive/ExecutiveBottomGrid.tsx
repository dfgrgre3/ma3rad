import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type DebtCustomer, type RecentInvoice, type TopProduct, formatCurrency, paymentStatusLabel } from './types';

interface Props {
  topProducts: TopProduct[];
  recentInvoices: RecentInvoice[];
  debtCustomers: DebtCustomer[];
}

export const ExecutiveBottomGrid: React.FC<Props> = ({
  topProducts,
  recentInvoices,
  debtCustomers,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Top Products Bar Chart */}
      <div className="min-w-0 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-4">أكثر المنتجات مبيعاً</h3>
        {topProducts.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">لا توجد بيانات</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                formatter={(val: number) => [formatCurrency(val)]}
              />
              <Bar dataKey="revenue" name="الإيراد" fill="#818cf8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Invoices */}
      <div className="min-w-0 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">آخر الفواتير</h3>
        <div className="space-y-2">
          {recentInvoices.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-6">لا توجد فواتير</p>
          ) : (
            recentInvoices.map((inv) => {
              const statusInfo = paymentStatusLabel[inv.status] ?? { label: inv.status, cls: 'bg-slate-200 text-slate-700' };
              return (
                <div key={inv.id} className="flex items-center gap-2 py-1.5 border-b border-slate-200 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{inv.customer}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {inv.date}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-sky-600">{formatCurrency(inv.amount)}</div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Top Debt Customers */}
      <div className="min-w-0 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">أعلى الديون</h3>
          <AlertTriangle className="w-4 h-4 text-rose-600" />
        </div>
        <div className="space-y-2.5">
          {debtCustomers.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-6">✓ لا توجد ديون</p>
          ) : (
            debtCustomers.map((c, i) => {
              const maxDebt = debtCustomers[0]?.debt ?? 1;
              const pct = (c.debt / maxDebt) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-700 font-medium truncate">{c.name}</span>
                    <span className="text-rose-600 font-bold shrink-0 mr-2">{formatCurrency(c.debt)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
