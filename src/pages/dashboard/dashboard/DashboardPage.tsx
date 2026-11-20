import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award, Banknote, LayoutDashboard, LayoutGrid, ShoppingBag, ShoppingCart, Target, TrendingUp, Truck,
} from 'lucide-react';
import { DashboardHeader } from '../../../components/dashboard/DashboardHeader';
import { DashboardRefreshContext } from '../../../contexts/DashboardRefreshContext';
import { DashboardLoader } from '../../../components/dashboard/DashboardLoader';
import { DashboardSectionNav } from '../../../components/dashboard/DashboardSectionNav';
import { OverviewSection } from '../../../components/dashboard/OverviewSection';
import { SectionCard } from '../../../components/dashboard/SectionCard';
import { SECTIONS_CONFIG, type SectionId } from '../../../types/dashboard/components';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { ModuleRegistryService } from '../../../services/domains/config/ModuleRegistryService';
import { CentralFeaturePermissionService } from '../../../services/domains/licensing/CentralFeaturePermissionService';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { getActivityDashboardSpec, getActivityDashboardCopy } from '../../../config/activityDashboard';
import { getActivityPageCopy, type ActivityPageKey } from '../../../config/activityPageCopy';
import { isActivityPathHidden } from '../../../config/activityPageVisibility';
import { moduleLazy } from '../../../modules/moduleLazy';

// Lazy loaded integrated dashboards
const ExecutiveCommandCenter = lazy(() => import('../executive/ExecutiveCommandCenter').then(m => ({ default: m.ExecutiveCommandCenter })));
const ActivityDashboardPanel = lazy(() => import('../../../components/dashboard/activity/ActivityDashboardPanel').then(m => ({ default: m.ActivityDashboardPanel })));
const SalesAnalyticsPage = moduleLazy('sales', () => import('../../sales/sales-analytics/SalesAnalyticsPage').then(m => ({ default: m.SalesAnalyticsPage })));
const PurchaseInventoryReportPage = moduleLazy('reports', () => import('../../reports/purchase-inventory/PurchaseInventoryReportPage').then(m => ({ default: m.PurchaseInventoryReportPage })));
const DebtsDashboardPage = moduleLazy('finance', () => import('../../finance/debts-dashboard/DebtsDashboardPage').then(m => ({ default: m.DebtsDashboardPage })));
const CrmDashboardPage = moduleLazy('customers', () => import('../../crm/crm-dashboard/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const FleetDashboardPage = moduleLazy('operations', () => import('../../operations/fleet-dashboard/FleetDashboardPage').then(m => ({ default: m.FleetDashboardPage })));
const HrDashboardPage = moduleLazy('hr', () => import('../../hr/hr-dashboard/HrDashboardPage').then(m => ({ default: m.HrDashboardPage })));

/**
 * كل قسم داخل لوحة المعلومات يخضع لصلاحية مجاله ووحدته، لا لصلاحية المسار
 * الأب (dashboard.view) وحدها. القسم بلا مدخل يبقى على dashboard.view فقط.
 */
const PULSE_ACCESS = ['sales.view', 'purchases.view', 'finance.view', 'customers.view', 'inventory.view'];
const SECTION_ACCESS: Partial<Record<SectionId, { permission?: string; permissions?: string[]; scopes?: Record<string, string>; moduleId?: string; path?: string }>> = {
  executive: { permissions: ['sales.view', 'purchases.view', 'finance.view', 'inventory.view'], scopes: { 'sales.view': '/sales', 'purchases.view': '/purchases', 'finance.view': '/finance', 'inventory.view': '/inventory' }, moduleId: 'finance', path: '/finance' },
  sales: { permission: 'sales.view', moduleId: 'sales', path: '/sales' },
  purchases: { permission: 'purchases.view', moduleId: 'purchasing', path: '/purchases' },
  debts: { permission: 'finance.debts.view', moduleId: 'finance', path: '/finance' },
  crm: { permission: 'crm.view', moduleId: 'customers', path: '/crm/leads' },
  fleet: { permission: 'vehicles.view', moduleId: 'operations', path: '/deliveries' },
  hr: { permission: 'employees.view', moduleId: 'hr', path: '/employees' },
};

export const DashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
  const initialSection = requestedSection?.replace(/^sec-/, '') as SectionId | undefined;
  const [activeTab, setActiveTab] = useState<SectionId>(
    initialSection && SECTIONS_CONFIG.some((section) => section.id === initialSection) ? initialSection : 'executive'
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingOverview, setRefreshingOverview] = useState(false);

  const currentUser = AuthService.getCurrentUser();
  // النشاط الحالي يحدد محتوى لوحة المعلومات: قسم مخصص + إخفاء مسارات لا تنطبق عليه.
  const businessType = getEffectiveBusinessType();
  const activitySpec = getActivityDashboardSpec(businessType);
  const activityCopy = getActivityDashboardCopy(businessType);
  const sectionCopy = (key: ActivityPageKey) => getActivityPageCopy(key, businessType);
  // القسم مسموح فقط إذا تحققت صلاحية مجاله ووحدته الفعّالة وقواعد المنصة المركزية.
  const canViewSection = (id: SectionId) => {
    if (id === 'all') return true;
    const pulseScopes = { 'sales.view': '/sales', 'purchases.view': '/purchases', 'finance.view': '/finance', 'customers.view': '/customers', 'inventory.view': '/inventory' };
    const access: { permission?: string; permissions?: string[]; scopes?: Record<string, string>; moduleId?: string; path?: string } | undefined =
      id === 'pulse' ? { permissions: PULSE_ACCESS, scopes: pulseScopes } : SECTION_ACCESS[id];
    if (!access) return true;
    if (access.permission && !PermissionService.can(currentUser, access.permission, access.path)) return false;
    if (access.permissions?.some((permission) => !PermissionService.can(currentUser, permission, access.scopes?.[permission] ?? access.path))) return false;
    if (access.moduleId && !ModuleRegistryService.isModuleEnabled(access.moduleId)) return false;
    if (access.path && !CentralFeaturePermissionService.isPageVisible(access.path)) return false;
    // قواعد ظهور الصفحات حسب النشاط (activityPageVisibility) تمنع القسم أيضًا.
    if (access.path && isActivityPathHidden(access.path, businessType)) return false;
    return true;
  };
  const hasDomainSection = SECTIONS_CONFIG.some(
    (section) => section.id !== 'all' && section.id !== 'pulse' && canViewSection(section.id)
  );
  const visibleSections = SECTIONS_CONFIG.filter((section) => {
    if (section.id === 'pulse') return true;
    if (section.id === 'all') return hasDomainSection;
    return canViewSection(section.id);
  }).map((section) =>
    section.id === 'activity' ? { ...section, label: activitySpec.navLabel } : section
  );
  // قد يشير الرابط إلى قسم غير مسموح؛ نعود إلى ملخص اليوم.
  const fallbackSection = visibleSections.find((section) => section.id !== 'all' && canViewSection(section.id))?.id ?? 'pulse';
  const effectiveTab: SectionId = canViewSection(activeTab) ? activeTab : fallbackSection;
  // التبويب الشامل يعرض أقسامه فقط إذا كانت مسموحة، منعًا لتجاوز صلاحياتها.
  const showSection = (id: SectionId) => effectiveTab === id || (effectiveTab === 'all' && canViewSection(id));

  useEffect(() => {
    const sec = searchParams.get('sec') || searchParams.get('section') || searchParams.get('tab');
    if (!sec) return;
    const clean = sec.replace(/^sec-/, '') as SectionId;
    if (SECTIONS_CONFIG.some((section) => section.id === clean)) setActiveTab(clean);
  }, [searchParams]);

  const selectSection = (section: SectionId) => {
    setActiveTab(section);
    const next = new URLSearchParams(searchParams);
    if (section === 'executive') next.delete('sec');
    else next.set('sec', section);
    next.delete('section');
    next.delete('tab');
    setSearchParams(next, { replace: true });
    document.querySelector('main.app-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const refresh = useCallback(() => {
    setRefreshToken((key) => key + 1);
    if (effectiveTab === 'pulse' || effectiveTab === 'all') {
      setRefreshingOverview(true);
    }
  }, [effectiveTab]);

  const handleOverviewDataLoaded = useCallback(() => {
    setLastUpdated(new Date());
    setRefreshingOverview(false);
  }, []);

  // عند فتح الصفحة أو تبديل التبويب إلى قسم لا يحتوي OverviewSection، نضمن عدم بقاء حالة التحديث معلقة
  useEffect(() => {
    if (effectiveTab !== 'pulse' && effectiveTab !== 'all') {
      setRefreshingOverview(false);
    }
  }, [effectiveTab]);
  const today = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const isOverview = effectiveTab === 'all';

  // Stable context value to prevent unnecessary re-renders of consumers
  const refreshContextValue = useMemo(() => ({ refreshToken, refresh }), [refreshToken, refresh]);

  return (
    <DashboardRefreshContext.Provider value={refreshContextValue}>
      <div className="dashboard-page bg-[#f3f3f3] dark:bg-[#1f1f1f]">
        <div className="space-y-4 p-3 sm:space-y-5 sm:p-5 lg:p-6">
        <DashboardHeader
          today={today}
          currentUser={currentUser}
          lastSyncedAt={lastUpdated}
          isRefreshing={refreshingOverview}
          onRefresh={refresh}
        />

        <DashboardSectionNav activeTab={effectiveTab} onSelectSection={selectSection} sections={visibleSections} />

        {(effectiveTab === 'pulse' || isOverview) && !canViewSection('pulse') && (
          <SectionCard id="sec-pulse" title="ملخص لوحة المعلومات" subtitle="تتطلب المؤشرات صلاحيات المجالات التي تعرض بياناتها." icon={LayoutDashboard}>
            <p className="p-4 text-sm text-ink-secondary">لا توجد صلاحية كافية لعرض مؤشرات المبيعات والمشتريات والمالية والعملاء والمخزون.</p>
          </SectionCard>
        )}
        {(effectiveTab === 'pulse' || isOverview) && canViewSection('pulse') && (
          <>
            <SectionCard
              id="sec-pulse"
              title="نبض حركة اليوم"
              subtitle={`ملخص المبيعات والمشتريات والأداء • ${lastUpdated ? `آخر تحديث ${new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated)}` : 'لم يتم التحديث بعد'}`}
              icon={LayoutDashboard}
              iconBg="bg-success-soft "
              iconColor="text-success "
            >
              <OverviewSection onDataLoaded={handleOverviewDataLoaded} />
            </SectionCard>
          </>
        )}
        {showSection('activity') && (
          <SectionCard
            id="sec-activity"
            title={activityCopy.title}
            subtitle={activityCopy.description}
            icon={LayoutGrid}
            iconBg="bg-accent-soft "
            iconColor="text-primary "
          >
            <Suspense fallback={<DashboardLoader />}><ActivityDashboardPanel /></Suspense>
          </SectionCard>
        )}
        {showSection('executive') && (
          <SectionCard id="sec-executive" title="مركز القيادة التنفيذي" subtitle="مؤشرات الأداء والأرباح والسيولة — كل رقم قابل للضغط لعرض تفاصيله" icon={TrendingUp} iconBg="bg-accent-soft " iconColor="text-primary ">
            <Suspense fallback={<DashboardLoader />}><ExecutiveCommandCenter /></Suspense>
          </SectionCard>
        )}
        {showSection('sales') && (
          <SectionCard id="sec-sales" title={sectionCopy('sales')?.title ?? 'تحليلات المبيعات'} subtitle={sectionCopy('sales')?.description ?? 'أداء البيع والأصناف والعملاء'} icon={ShoppingCart} iconBg="bg-success-soft " iconColor="text-success ">
            <Suspense fallback={<DashboardLoader />}><SalesAnalyticsPage /></Suspense>
          </SectionCard>
        )}
        {showSection('purchases') && (
          <SectionCard id="sec-purchases" title={sectionCopy('purchasing')?.title ?? 'المشتريات والمخزون'} subtitle={sectionCopy('purchasing')?.description ?? 'حركة الفواتير وتقييم المخزون والموردين'} icon={ShoppingBag} iconBg="bg-warning-soft " iconColor="text-warning ">
            <Suspense fallback={<DashboardLoader />}><PurchaseInventoryReportPage /></Suspense>
          </SectionCard>
        )}
        {showSection('debts') && (
          <SectionCard id="sec-debts" title={sectionCopy('finance')?.title ?? 'الديون والذمم'} subtitle={sectionCopy('finance')?.description ?? 'متابعة مستحقات العملاء والموردين'} icon={Banknote} iconBg="bg-danger-soft " iconColor="text-danger ">
            <Suspense fallback={<DashboardLoader />}><DebtsDashboardPage /></Suspense>
          </SectionCard>
        )}
        {showSection('crm') && (
          <SectionCard id="sec-crm" title={sectionCopy('crm')?.title ?? 'إدارة العملاء والفرص'} subtitle={sectionCopy('crm')?.description ?? 'متابعة العملاء المحتملين والأنشطة'} icon={Target} iconBg="bg-accent-soft " iconColor="text-primary ">
            <Suspense fallback={<DashboardLoader />}><CrmDashboardPage /></Suspense>
          </SectionCard>
        )}
        {showSection('fleet') && (
          <SectionCard id="sec-fleet" title={sectionCopy('operations')?.title ?? 'التوصيل والأسطول'} subtitle={sectionCopy('operations')?.description ?? 'متابعة الشحنات والسائقين والمركبات'} icon={Truck} iconBg="bg-accent-soft " iconColor="text-primary ">
            <Suspense fallback={<DashboardLoader />}><FleetDashboardPage /></Suspense>
          </SectionCard>
        )}
        {showSection('hr') && (
          <SectionCard id="sec-hr" title={sectionCopy('hr')?.title ?? 'الموارد البشرية'} subtitle={sectionCopy('hr')?.description ?? 'متابعة فريق العمل والحضور والعمولات'} icon={Award} iconBg="bg-success-soft " iconColor="text-success ">
            <Suspense fallback={<DashboardLoader />}><HrDashboardPage /></Suspense>
          </SectionCard>
        )}
        <footer className="pb-1 text-center text-[10px] text-[#767676] dark:text-[#a6a6a6]">سيراميسيس</footer>
      </div>
    </div>
    </DashboardRefreshContext.Provider>
  );
};

export default DashboardPage;
