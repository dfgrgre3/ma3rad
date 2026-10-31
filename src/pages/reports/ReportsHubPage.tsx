import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, ShoppingCart, Truck, CreditCard, PieChart, FileText, TrendingUp } from 'lucide-react';
import { ReportsView } from '../../components/ReportsView';
import { SalesReportsPage } from './SalesReportsPage';
import { PurchaseInventoryReportPage } from './PurchaseInventoryReportPage';
import { PosReportsPage } from './PosReportsPage';
import { FinancialStatementsPage } from './FinancialStatementsPage';
import { TaxReportPage } from './TaxReportPage';
import { ProfitLossPage } from './ProfitLossPage';

type TabId = 'overview' | 'sales' | 'purchases' | 'pos' | 'finance' | 'profitLoss' | 'tax';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'نظرة عامة', icon: BarChart3 },
  { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { id: 'purchases', label: 'المشتريات والمخزون', icon: Truck },
  { id: 'pos', label: 'نقطة البيع', icon: CreditCard },
  { id: 'finance', label: 'المالية', icon: PieChart },
  { id: 'profitLoss', label: 'الأرباح والخسائر', icon: TrendingUp },
  { id: 'tax', label: 'الضرائب', icon: FileText },
];

const isValidTab = (value: string | null): value is TabId =>
  value !== null && TABS.some((item) => item.id === value);

export const ReportsHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: TabId = isValidTab(requested) ? requested : 'overview';

  React.useEffect(() => {
    if (!isValidTab(requested)) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'overview');
      setSearchParams(next, { replace: true });
    }
  }, [requested, searchParams, setSearchParams]);

  const selectTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">مركز التقارير والتحليلات</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">المبيعات، المشتريات، المخزون، نقطة البيع، المالية، والضرائب</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          {tab === 'overview' && <ReportsView />}
          {tab === 'sales' && <SalesReportsPage />}
          {tab === 'purchases' && <PurchaseInventoryReportPage />}
          {tab === 'pos' && <PosReportsPage />}
          {tab === 'finance' && <FinancialStatementsPage />}
          {tab === 'profitLoss' && <ProfitLossPage />}
          {tab === 'tax' && <TaxReportPage />}
        </div>
      </div>
    </div>
  );
};

export default ReportsHubPage;
