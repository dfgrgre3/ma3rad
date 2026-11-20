import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../../contexts/useTheme';
import { type DebtCustomer, type RecentInvoice, type TopProduct, formatCurrency, paymentStatusLabel } from '../../../types/dashboard/executive';

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
  const { isDark } = useTheme();
  const cardBg = isDark ? 'bg-primary' : 'bg-surface';
  const cardBorder = isDark ? 'border-line-strong' : 'border-line';
  const textPrimary = isDark ? 'text-white' : 'text-ink';
  const textSecondary = isDark ? 'text-muted' : 'text-muted';
  const textMuted = isDark ? 'text-muted' : 'text-ink-secondary';
  const borderColor = isDark ? 'border-line-strong' : 'border-line';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Top Products Bar Chart */}
      <div className={`min-w-0 lg:col-span-1 rounded-xl border p-3 sm:p-4 ${cardBg} ${cardBorder}`}>
        <h3 className={`text-sm font-bold mb-4 ${textPrimary}`}>أعلى المنتجات إيراداً</h3>
        {topProducts.length === 0 ? (
          <div className={`text-center ${textSecondary} text-sm py-8`}>لا توجد بيانات</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} />
              <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#94a3b8' }} width={90} />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc', 
                  border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`, 
                  borderRadius: 8,
                  color: isDark ? '#f1f5f9' : '#1e293b'
                }}
                formatter={(val: number) => [formatCurrency(val)]}
              />
              <Bar dataKey="revenue" name="الإيراد" fill="#818cf8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Invoices */}
      <div className={`min-w-0 lg:col-span-1 rounded-xl border p-3 sm:p-4 ${cardBg} ${cardBorder}`}>
        <h3 className={`text-sm font-bold mb-3 ${textPrimary}`}>آخر الفواتير</h3>
        <div className="space-y-2">
          {recentInvoices.length === 0 ? (
            <p className={`${textSecondary} text-xs text-center py-6`}>لا توجد فواتير</p>
          ) : (
            recentInvoices.map((inv) => {
              const statusInfo = paymentStatusLabel[inv.status] ?? { label: inv.status, cls: 'bg-surface-sunken text-ink' };
              return (
                <div key={inv.id} className={`flex items-center gap-2 py-1.5 border-b last:border-0 ${borderColor}`}>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold truncate ${textPrimary}`}>{inv.customer}</div>
                    <div className={`text-[10px] ${textSecondary} flex items-center gap-1`}>
                      <Clock className="w-2.5 h-2.5" />
                      {inv.date}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-primary">{formatCurrency(inv.amount)}</div>
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
      <div className={`min-w-0 lg:col-span-1 rounded-xl border p-3 sm:p-4 ${cardBg} ${cardBorder}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold ${textPrimary}`}>أعلى الديون</h3>
          <AlertTriangle className="w-4 h-4 text-danger" />
        </div>
        <div className="space-y-2.5">
          {debtCustomers.length === 0 ? (
            <p className={`${textSecondary} text-xs text-center py-6`}>✓ لا توجد ديون</p>
          ) : (
            debtCustomers.map((c, i) => {
              const maxDebt = debtCustomers[0]?.debt ?? 1;
              const pct = (c.debt / maxDebt) * 100;
              return (
                <div key={i}>
                  <div className={`flex items-center justify-between text-xs mb-1 ${textPrimary}`}>
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-danger font-bold shrink-0 mr-2">{formatCurrency(c.debt)}</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-primary' : 'bg-surface-sunken'}`}>
                    <div className="h-full bg-danger rounded-full transition-all" style={{ width: `${pct}%` }} />
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
