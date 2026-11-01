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
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100 dark:bg-slate-950" dir="rtl">
      <header className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:flex-row lg:items-end lg:justify-between lg:px-7">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">مركز المبيعات</h1>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400 sm:text-sm">
              تابع مبيعات اليوم والفواتير وأداء المبيعات من مكان واحد.
            </p>
          </div>
          <nav
            className="no-scrollbar flex w-full min-w-0 items-stretch gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:gap-1.5 lg:w-auto dark:bg-slate-800/80"
            aria-label="أقسام المبيعات"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`relative inline-flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-xs font-bold transition-[background-color,color,box-shadow] duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 lg:flex-none ${
                  tab === id
                    ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200/80 dark:bg-slate-700 dark:text-emerald-300 dark:ring-emerald-800'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white'
                }`}
              >
                {tab === id && <span className="absolute inset-y-2 right-1 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />}
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-6 sm:w-6 ${
                  tab === id
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      <section className="mx-auto min-h-0 w-full max-w-[96rem] min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-600 dark:text-slate-400">جاري تحميل الصفحة...</div>}>
          <ActivePage />
        </Suspense>
      </section>
    </main>
  );
};

export default SalesHubPage;
