import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award, Banknote, LayoutDashboard, ShoppingBag, ShoppingCart, Target, TrendingUp, Truck,
} from 'lucide-react';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardLoader } from './dashboard/DashboardLoader';
import { DashboardSectionNav } from './dashboard/DashboardSectionNav';
import { OverviewSection } from './dashboard/OverviewSection';
import { QuickActions } from './dashboard/QuickActions';
import { SectionCard } from './dashboard/SectionCard';
import { SECTIONS_CONFIG, type SectionId } from './dashboard/types';

// Lazy loaded integrated dashboards
const ExecutiveDashboard = lazy(() => import('../pages/dashboard/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
const SalesAnalyticsPage = lazy(() => import('../pages/sales/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));
const PurchaseInventoryReportPage = lazy(() => import('../pages/reports/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));
const DebtsDashboardPage = lazy(() => import('../pages/finance/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const CrmDashboardPage = lazy(() => import('../pages/crm/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const FleetDashboardPage = lazy(() => import('../pages/operations/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));
const HrDashboardPage = lazy(() => import('../pages/hr/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

export const DashboardView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
  const initialSection = requestedSection?.replace(/^sec-/, '') as SectionId | undefined;
  const [activeTab, setActiveTab] = useState<SectionId>(
    initialSection && SECTIONS_CONFIG.some((section) => section.id === initialSection) ? initialSection : 'pulse'
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const sec = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
    if (!sec) return;
    const clean = sec.replace(/^sec-/, '') as SectionId;
    if (SECTIONS_CONFIG.some((section) => section.id === clean)) setActiveTab(clean);
  }, [searchParams]);

  const selectSection = (section: SectionId) => {
    setActiveTab(section);
    const next = new URLSearchParams(searchParams);
    if (section === 'pulse') next.delete('sec');
    else next.set('sec', section);
    next.delete('section');
    next.delete('tab');
    setSearchParams(next, { replace: true });
    document.getElementById('dashboard-scroll-root')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    setLastUpdated(new Date());
  };
  const today = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const isOverview = activeTab === 'all';

  return (
    <div id="dashboard-scroll-root" className="h-full overflow-y-auto bg-[#f5f5f2] dark:bg-slate-950" dir="rtl">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        <DashboardHeader today={today} onRefresh={refresh} />

        <DashboardSectionNav activeTab={activeTab} onSelectSection={selectSection} />

        {(activeTab === 'pulse' || isOverview) && (
          <>
            <QuickActions />
            <SectionCard id="sec-pulse" title="ملخص حركة اليوم" subtitle={`نظرة مباشرة على المبيعات والمشتريات والأداء · آخر تحديث ${new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated)}`} icon={LayoutDashboard} iconBg="bg-teal-50 dark:bg-teal-950" iconColor="text-teal-700 dark:text-teal-300" badge="مباشر">
              <OverviewSection key={refreshKey} />
            </SectionCard>
          </>
        )}
        {(activeTab === 'all' || activeTab === 'executive') && <SectionCard id="sec-executive" title="الأداء التنفيذي" subtitle="مؤشرات الأداء والاتجاهات المالية والتشغيلية" icon={TrendingUp} iconBg="bg-indigo-50 dark:bg-indigo-950" iconColor="text-indigo-700 dark:text-indigo-300"><Suspense fallback={<DashboardLoader />}><ExecutiveDashboard /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'sales') && <SectionCard id="sec-sales" title="تحليلات المبيعات" subtitle="اتجاهات البيع والأصناف والعملاء" icon={ShoppingCart} iconBg="bg-emerald-50 dark:bg-emerald-950" iconColor="text-emerald-700 dark:text-emerald-300"><Suspense fallback={<DashboardLoader />}><SalesAnalyticsPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'purchases') && <SectionCard id="sec-purchases" title="المشتريات والمخزون" subtitle="حركة الفواتير وتقييم المخزون والموردين" icon={ShoppingBag} iconBg="bg-amber-50 dark:bg-amber-950" iconColor="text-amber-700 dark:text-amber-300"><Suspense fallback={<DashboardLoader />}><PurchaseInventoryReportPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'debts') && <SectionCard id="sec-debts" title="الديون والذمم" subtitle="متابعة مستحقات العملاء والموردين" icon={Banknote} iconBg="bg-rose-50 dark:bg-rose-950" iconColor="text-rose-700 dark:text-rose-300"><Suspense fallback={<DashboardLoader />}><DebtsDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'crm') && <SectionCard id="sec-crm" title="إدارة العملاء والفرص" subtitle="متابعة العملاء المحتملين والأنشطة التسويقية" icon={Target} iconBg="bg-violet-50 dark:bg-violet-950" iconColor="text-violet-700 dark:text-violet-300"><Suspense fallback={<DashboardLoader />}><CrmDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'fleet') && <SectionCard id="sec-fleet" title="التوصيل والأسطول" subtitle="متابعة الشحنات والسائقين والمركبات" icon={Truck} iconBg="bg-cyan-50 dark:bg-cyan-950" iconColor="text-cyan-700 dark:text-cyan-300"><Suspense fallback={<DashboardLoader />}><FleetDashboardPage /></Suspense></SectionCard>}
        {(activeTab === 'all' || activeTab === 'hr') && <SectionCard id="sec-hr" title="الموارد البشرية" subtitle="متابعة فريق العمل والحضور والعمولات" icon={Award} iconBg="bg-teal-50 dark:bg-teal-950" iconColor="text-teal-700 dark:text-teal-300"><Suspense fallback={<DashboardLoader />}><HrDashboardPage /></Suspense></SectionCard>}
        <footer className="pb-2 text-center text-[10px] font-medium text-slate-400">CeramiSys ERP <span className="px-1.5">·</span> إدارة أكثر وضوحاً لمعرضك</footer>
      </div>
    </div>
  );
};
