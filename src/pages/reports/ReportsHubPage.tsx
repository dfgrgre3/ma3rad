import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Search, Sparkles } from 'lucide-react';
import { REPORT_CATEGORIES, REPORT_DEFINITIONS } from './reportCatalog';
import type { ReportCategoryId, ReportDefinition } from './reportCatalog';
import { ReportView } from './ReportView';
import { getEffectiveBusinessType } from '../../services/BusinessTypeService';
import { getBusinessProfile, getProfileReports } from '../../config/businessProfiles';
import { PageHeader } from '../../components/ui/PageHeader';
import { NoResultsState } from '../../components/ui/StateViews';

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
    <div className="erp-page" dir="rtl">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="مركز التقارير والتحليلات"
        description={`${REPORT_DEFINITIONS.length} تقريرًا في الحركة والمبيعات والائتمان والمخزون والمالية والتوقعات — ابحث واختر التقرير المطلوب.`}
        meta={
          getProfileReports(getEffectiveBusinessType()).length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[var(--ui-font-2xs)] font-bold text-[var(--cerami-muted)]">
                موصى بها للنشاط ({getBusinessProfile(getEffectiveBusinessType()).name.ar}):
              </span>
              {getProfileReports(getEffectiveBusinessType()).map((r) => (
                <span key={r.id} className="erp-badge">{r.label.ar}</span>
              ))}
            </div>
          ) : undefined
        }
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" aria-hidden="true" />
            <label htmlFor="report-search" className="sr-only">بحث عن تقرير</label>
            <input
              id="report-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن تقرير…"
              className="win-input py-1.5 pl-3 pr-9"
              type="search"
            />
          </div>
        }
      />

      <div className="erp-toolbar">
        <span className="erp-badge erp-badge--primary">
          {category === 'all'
            ? 'جميع التقارير'
            : REPORT_CATEGORIES.find((item) => item.id === category)?.label}
        </span>
        <span className="text-[var(--ui-font-xs)] text-[var(--cerami-muted)]">
          {filtered.length} تقرير
        </span>
      </div>

      <div className="erp-stack">
        {REPORT_CATEGORIES.filter((item) => category === 'all' || item.id === category).map((item) => {
          const reports = filtered.filter((report) => report.category === item.id);
          if (!reports.length) return null;
          const CategoryIcon = item.icon;
          return (
            <section key={item.id} className="erp-stack erp-stack--tight" aria-label={item.label}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="erp-badge erp-badge--primary">
                  <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" /> {item.label}
                </span>
                <span className="text-[var(--ui-font-xs)] text-[var(--cerami-muted)]">{item.description}</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {reports.map((report) => {
                  const Icon = report.icon;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => openReport(report)}
                      className="erp-card erp-card--compact group flex min-h-[112px] flex-col items-start gap-2 text-start transition-colors hover:border-[var(--win-accent)] hover:bg-[var(--win-accent-soft)]"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="erp-card__icon h-8 w-8">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <ArrowLeft className="h-4 w-4 text-[var(--cerami-muted)] transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="erp-card__title">{report.title}</h3>
                        <p className="mt-1 line-clamp-2 text-[var(--ui-font-xs)] leading-5 text-[var(--cerami-muted)]">{report.description}</p>
                      </div>
                      <span className="mt-auto inline-flex items-center gap-1 text-[var(--ui-font-2xs)] font-bold text-[var(--win-accent-readable)]">
                        <Sparkles className="h-3 w-3" aria-hidden="true" /> فتح التقرير
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <NoResultsState
          onClear={() => { setSearch(''); setCategory('all'); }}
          clearLabel="مسح البحث"
        />
      )}
    </div>
  );
};

export default ReportsHubPage;
