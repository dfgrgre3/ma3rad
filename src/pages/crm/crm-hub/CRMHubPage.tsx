import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, ChevronDown, ChevronUp, LayoutDashboard, Loader2, Megaphone, Users, Workflow } from 'lucide-react';
import { useRouteAccess } from '../../../hooks/domains/auth/useRouteAccess';
import { resolveHubTabs } from '../../../config/activityHubTabs';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { WorkspaceHubTab } from '../../common/workspace-hub/WorkspaceHub';

const CustomersView = lazy(() => import('../../../components/customers/CustomersView').then((module) => ({ default: module.CustomersView })));
const CrmDashboardPage = lazy(() => import('../crm-dashboard/CrmDashboardPage').then((module) => ({ default: module.CrmDashboardPage })));
const LeadsPage = lazy(() => import('../leads/LeadsPage').then((module) => ({ default: module.LeadsPage })));
const PipelinePage = lazy(() => import('../pipeline/PipelinePage').then((module) => ({ default: module.PipelinePage })));
const CrmActivitiesPage = lazy(() => import('../crm-activities/CrmActivitiesPage').then((module) => ({ default: module.CrmActivitiesPage })));
const CampaignsPage = lazy(() => import('../campaigns/CampaignsPage').then((module) => ({ default: module.CampaignsPage })));

const TABS: WorkspaceHubTab[] = [
  { id: 'dashboard', label: 'لوحة CRM', path: '/crm/dashboard', icon: LayoutDashboard },
  { id: 'customers', label: 'العملاء', path: '/customers', icon: Users },
  { id: 'leads', label: 'العملاء المحتملون', path: '/crm/leads', icon: Users },
  { id: 'pipeline', label: 'مسار المبيعات', path: '/crm/pipeline', icon: Workflow },
  { id: 'activities', label: 'الأنشطة والمتابعة', path: '/crm/activities', icon: Activity },
  { id: 'campaigns', label: 'الحملات', path: '/crm/campaigns', icon: Megaphone },
];

const PAGE_BY_TAB = {
  customers: CustomersView,
  dashboard: CrmDashboardPage,
  leads: LeadsPage,
  pipeline: PipelinePage,
  activities: CrmActivitiesPage,
  campaigns: CampaignsPage,
} as const;

const SectionFallback = () => (
  <div className="flex items-center justify-center py-10 text-muted">
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
);

export const CRMHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const canAccess = useRouteAccess();
  const pageCopy = useActivityPageCopy('crm');

  const sections = resolveHubTabs('crm', TABS.filter((tab) => canAccess(tab.path)));
  const matchedSection = TABS.find((tab) => tab.path === pathname);
  const matchedAllowed = matchedSection ? sections.some((s) => s.id === matchedSection.id) : false;

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { dashboard: true, customers: true };
    if (matchedSection && matchedAllowed) {
      initial[matchedSection.id] = true;
    }
    return initial;
  });

  useEffect(() => {
    if (matchedSection && matchedAllowed) {
      setExpandedIds((prev) => (prev[matchedSection.id] ? prev : { ...prev, [matchedSection.id]: true }));
      const el = document.getElementById(`crm-section-${matchedSection.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [matchedSection, matchedAllowed]);

  if (matchedSection && !matchedAllowed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">
        لا تملك صلاحية الوصول إلى هذا القسم من مركز CRM.
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">
        لا تملك صلاحية الوصول إلى مركز CRM.
      </div>
    );
  }

  const toggleSection = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={pageCopy?.title || 'مركز علاقات العملاء'}
        description={pageCopy?.description || 'تابع العملاء المحتملين ومسار البيع والأنشطة والحملات في صفحة واحدة.'}
        icon={<Users className="h-5 w-5" />}
      />

      <div className="space-y-4">
        {sections.map((section) => {
          const SectionComponent = PAGE_BY_TAB[section.id as keyof typeof PAGE_BY_TAB];
          const Icon = section.icon;
          const isExpanded = Boolean(expandedIds[section.id]);

          return (
            <section
              key={section.id}
              id={`crm-section-${section.id}`}
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-right transition-colors hover:bg-surface-hover"
              >
                <div className="flex items-center gap-2.5">
                  {Icon && <Icon className="h-5 w-5 text-primary" />}
                  <h2 className="text-base font-bold text-foreground">{section.label}</h2>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border p-4">
                  <Suspense fallback={<SectionFallback />}>
                    <SectionComponent />
                  </Suspense>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default CRMHubPage;
