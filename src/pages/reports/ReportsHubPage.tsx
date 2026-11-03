import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Search, Sparkles } from 'lucide-react';
import { REPORT_CATEGORIES, REPORT_DEFINITIONS } from './reportCatalog';
import type { ReportCategoryId, ReportDefinition } from './reportCatalog';
import { ReportView } from './ReportView';

const SalesReportsPage = lazy(() =>
  import('./SalesReportsPage').then((m) => ({ default: m.SalesReportsPage })),
);
const PurchaseInventoryReportPage = lazy(() =>
  import('./PurchaseInventoryReportPage').then((m) => ({
    default: m.PurchaseInventoryReportPage,
  })),
);
const PosReportsPage = lazy(() =>
  import('./PosReportsPage').then((m) => ({ default: m.PosReportsPage })),
);
const FinancialStatementsPage = lazy(() =>
  import('./FinancialStatementsPage').then((m) => ({
    default: m.FinancialStatementsPage,
  })),
);
const TaxReportPage = lazy(() =>
  import('./TaxReportPage').then((m) => ({ default: m.TaxReportPage })),
);
const ProfitLossPage = lazy(() =>
  import('./ProfitLossPage').then((m) => ({ default: m.ProfitLossPage })),
);

const LEGACY_TABS = ['sales', 'purchases', 'pos', 'finance', 'profitLoss', 'tax'] as const;
type LegacyTab = (typeof LEGACY_TABS)[number];
const isLegacyTab = (value: string | null): value is LegacyTab =>
  value !== null && (LEGACY_TABS as readonly string[]).includes(value);

const ACCENTS: Record<string, string> = {
  teal: 'from-teal-500 to-cyan-600 shadow-teal-500/20',
  sky: 'from-sky-500 to-blue-600 shadow-sky-500/20',
  emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/20',
  amber: 'from-amber-500 to-orange-600 shadow-amber-500/20',
  violet: 'from-violet-500 to-purple-600 shadow-violet-500/20',
  rose: 'from-rose-500 to-pink-600 shadow-rose-500/20',
  indigo: 'from-indigo-500 to-blue-700 shadow-indigo-500/20',
};

const CATEGORY_COLORS: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
};

const LegacyReport: React.FC<{ tab: LegacyTab }> = ({ tab }) => (
  <Suspense
    fallback={<div className="p-10 text-center text-sm text-slate-500">جارٍ تحميل التقرير…</div>}
  >
    {tab === 'sales' && <div className="h-full overflow-auto"><SalesReportsPage /></div>}
    {tab === 'purchases' && <div className="h-full overflow-auto"><PurchaseInventoryReportPage /></div>}
    {tab === 'pos' && <div className="h-full overflow-auto"><PosReportsPage /></div>}
    {tab === 'finance' && <div className="h-full overflow-auto"><FinancialStatementsPage /></div>}
    {tab === 'profitLoss' && <div className="h-full overflow-auto"><ProfitLossPage /></div>}
    {tab === 'tax' && <div className="h-full overflow-auto"><TaxReportPage /></div>}
  </Suspense>
);

export const ReportsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ reportId?: string; categoryId?: string }>();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const urlCategory = params.categoryId || searchParams.get('category');
  const [category, setCategory] = useState<ReportCategoryId | 'all'>(() =>
    REPORT_CATEGORIES.some((item) => item.id === urlCategory)
      ? (urlCategory as ReportCategoryId)
      : 'all',
  );

  const tabParam = searchParams.get('tab');
  const reportId = params.reportId || searchParams.get('report');
  const selectedReport = useMemo(
    () => REPORT_DEFINITIONS.find((report) => report.id === reportId) || null,
    [reportId],
  );

  useEffect(() => {
    const next = REPORT_CATEGORIES.some((item) => item.id === urlCategory)
      ? (urlCategory as ReportCategoryId)
      : 'all';
    setCategory(next);
  }, [urlCategory]);

  const openReport = (report: ReportDefinition) => {
    setSearch('');
    if (report.legacyTab) {
      navigate(`/reports?tab=${report.legacyTab}`);
      return;
    }
    navigate(`/reports/${report.id}`);
  };

  const backToHub = () =>
    navigate(category === 'all' ? '/reports' : `/reports/category/${category}`);

  if (selectedReport) {
    if (selectedReport.legacyTab) {
      return (
        <div className="flex h-full flex-col bg-slate-50">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
            <button
              type="button"
              onClick={backToHub}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" /> مركز التقارير
            </button>
            <span className="text-xs font-bold text-slate-400">/ {selectedReport.title}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <LegacyReport tab={selectedReport.legacyTab} />
          </div>
        </div>
      );
    }
    return <ReportView definition={selectedReport} onBack={backToHub} />;
  }

  if (isLegacyTab(tabParam)) {
    const legacy = REPORT_DEFINITIONS.find((report) => report.legacyTab === tabParam);
    return (
      <div className="flex h-full flex-col bg-slate-50">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={backToHub}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" /> مركز التقارير
          </button>
          <span className="text-xs font-bold text-slate-400">/ {legacy?.title || tabParam}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <LegacyReport tab={tabParam} />
        </div>
      </div>
    );
  }

  const needle = search.trim().toLowerCase();
  const filtered = REPORT_DEFINITIONS.filter((report) => {
    const categoryMatch = category === 'all' || report.category === category;
    const searchMatch =
      !needle ||
      report.title.toLowerCase().includes(needle) ||
      report.description.toLowerCase().includes(needle);
    return categoryMatch && searchMatch;
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-4 lg:p-6 dark:bg-slate-950" dir="rtl">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">مركز التقارير والتحليلات</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {REPORT_DEFINITIONS.length} تقريرًا في الحركة والمبيعات والائتمان والمخزون والمالية والتوقعات
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن تقرير…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-xs font-bold dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {category === 'all'
              ? 'جميع التقارير'
              : REPORT_CATEGORIES.find((item) => item.id === category)?.label}
          </span>
        </div>

        {REPORT_CATEGORIES.filter((item) => category === 'all' || item.id === category).map((item) => {
          const reports = filtered.filter((report) => report.category === item.id);
          if (!reports.length) return null;
          const CategoryIcon = item.icon;
          return (
            <section key={item.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-black ${CATEGORY_COLORS[item.color]}`}>
                  <CategoryIcon className="h-3.5 w-3.5" /> {item.label}
                </span>
                <span className="text-[11px] font-medium text-slate-400">{item.description}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => openReport(report)}
                      className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-500/5 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-700"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr text-white shadow-md ${ACCENTS[report.accent || item.color] || ACCENTS.teal}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <ArrowLeft className="h-4 w-4 text-slate-300 transition group-hover:-translate-x-0.5 group-hover:text-teal-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{report.title}</h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{report.description}</p>
                      </div>
                      <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-bold text-teal-600">
                        <Sparkles className="h-3 w-3" /> فتح التقرير
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            لا يوجد تقرير مطابق لبحثك.
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsHubPage;
