import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet,
  RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { queryFinanceOverviewMetrics } from '../../../services/domains/dashboard/DashboardQueryScopeService';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';

interface Metrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalReceivables: number;
  totalPayables: number;
  cashBalance: number;
  inventoryValue: number;
}

export const FinanceOverviewPage: React.FC = () => {
  const pageCopy = useActivityPageCopy('finance');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalReceivables: 0,
    totalPayables: 0,
    cashBalance: 0,
    inventoryValue: 0,
  });
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; expenses: number }[]>([]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    const db = DatabaseManager.getInstance().getDb();
    if (!db) { setLoading(false); return; }

    try {
      const thisMonth = {
        from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      };
      const actor = AuthService.requireAuth();
      const monthMetrics = queryFinanceOverviewMetrics(db, thisMonth.from, thisMonth.to, actor);
      setMetrics(monthMetrics);

      const sixMonths: { month: string; revenue: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const from = format(startOfMonth(d), 'yyyy-MM-dd');
        const to = format(endOfMonth(d), 'yyyy-MM-dd');
        const monthly = queryFinanceOverviewMetrics(db, from, to, actor);
        sixMonths.push({
          month: format(d, 'MMM'),
          revenue: monthly.totalRevenue,
          expenses: monthly.totalExpenses,
        });
      }
      setMonthlyData(sixMonths);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المركز المالي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n) + ' ج';

  const cards = [
    { label: 'إيرادات المبيعات (الشهر)', value: fmt(metrics.totalRevenue), icon: TrendingUp, color: 'text-success', bg: 'bg-success/10 border-success/20' },
    { label: 'المصروفات والتشغيل (الشهر)', value: fmt(metrics.totalExpenses), icon: TrendingDown, color: 'text-danger', bg: 'bg-danger/10 border-danger/20' },
    { label: 'صافي أرباح المعرض', value: fmt(metrics.netProfit), icon: DollarSign, color: metrics.netProfit >= 0 ? 'text-primary' : 'text-danger', bg: 'bg-primary/10 border-primary/20' },
    { label: 'الذمم المدينة (حقوقنا لدى العملاء)', value: fmt(metrics.totalReceivables), icon: ArrowUpRight, color: 'text-warning', bg: 'bg-warning/10 border-warning/20' },
    { label: 'الذمم الدائنة (مستحقات المصانع)', value: fmt(metrics.totalPayables), icon: ArrowDownRight, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
    { label: 'رصيد الخزائن النقدية', value: fmt(metrics.cashBalance), icon: Wallet, color: 'text-success', bg: 'bg-success/10 border-success/20' },
  ];

  return (
    <div className="erp-page">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title={pageCopy?.title || 'المؤشرات المالية'}
        description={pageCopy?.description || 'إيرادات ومصروفات وأرباح وسيولة وذمم. إدارة شجرة الحسابات والقيود في الصفحات المتخصصة.'}
        actions={
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-surface-sunken text-ink hover:text-ink border border-line-strong transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {loadError && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          تعذر تحميل بعض بيانات المركز المالي: {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-2xl border p-4 ${c.bg} shadow-sm`}>
              <Icon className={`w-5 h-5 ${c.color} mb-2`} />
              <div className={`text-base font-black ${c.color}`}>{c.value}</div>
              <div className="text-[11px] text-muted mt-1">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            تحليل الإيرادات والمصروفات الشهرية (آخر 6 أشهر)
          </h3>
          <span className="text-xs text-muted">تحديث فوري من فواتير المبيعات والمصروفات</span>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
              formatter={(val: number) => [fmt(val)]}
            />
            <Bar dataKey="revenue" name="إيرادات المبيعات" fill="#10b981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" name="المصروفات" fill="#f43f5e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinanceOverviewPage;
