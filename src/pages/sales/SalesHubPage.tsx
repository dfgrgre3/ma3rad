import React, { lazy, Suspense, useEffect } from 'react';
import { BarChart3, CalendarDays, Receipt } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

const TodaySalesPage = lazy(() => import('../daily/DailyPage').then((module) => ({ default: module.TodaySalesPage })));
const SalesView = lazy(() => import('../../components/SalesView').then((module) => ({ default: module.SalesView })));
const SalesAnalyticsPage = lazy(() => import('./SalesAnalyticsPage').then((module) => ({ default: module.SalesAnalyticsPage })));

const TABS = [
  { id: 'daily', label: 'مبيعات اليوم', icon: CalendarDays },
  { id: 'invoices', label: 'الفواتير', icon: Receipt },
  { id: 'analytics', label: 'التحليلات', icon: BarChart3 },
] as const;

type SalesTab = (typeof TABS)[number]['id'];

export const SalesHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.find((item) => item.id === requestedTab)?.id ?? 'invoices';

  useEffect(() => {
    if (!requestedTab || !TABS.some((item) => item.id === requestedTab)) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'invoices');
      setSearchParams(next, { replace: true });
    }
  }, [requestedTab, searchParams, setSearchParams]);

  const selectTab = (id: SalesTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  const ActivePage = tab === 'daily'
    ? TodaySalesPage
    : tab === 'analytics'
      ? SalesAnalyticsPage
      : SalesView;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950" dir="rtl">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pt-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">مركز المبيعات</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">تابع مبيعات اليوم والفواتير وأداء المبيعات من مكان واحد.</p>
        <nav className="mt-4 flex gap-2 overflow-x-auto" aria-label="أقسام المبيعات">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition ${
                tab === id
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <section className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">جاري تحميل الصفحة...</div>}>
          <ActivePage />
        </Suspense>
      </section>
    </main>
  );
};

export default SalesHubPage;
