import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, LayoutDashboard, Megaphone, Users, Workflow } from 'lucide-react';
import { usePermission } from '../../../hooks/auth/usePermission';
import { WorkspaceHub } from '../../common/workspace-hub/WorkspaceHub';
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

const REQUIRED_PERMISSION: Record<string, string> = {
  customers: 'customers.view',
  dashboard: 'crm.view',
  leads: 'crm.view',
  pipeline: 'crm.view',
  activities: 'crm.view',
  campaigns: 'crm.view',
};

const PAGE_BY_TAB = {
  customers: CustomersView,
  dashboard: CrmDashboardPage,
  leads: LeadsPage,
  pipeline: PipelinePage,
  activities: CrmActivitiesPage,
  campaigns: CampaignsPage,
} as const;

export const CRMHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const can = usePermission();
  const tabs = TABS.filter((tab) => can(REQUIRED_PERMISSION[tab.id]));
  const activeTab = tabs.find((tab) => tab.path === pathname)?.id ?? tabs[0]?.id;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (!tabs.length || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">لا تملك صلاحية الوصول إلى مركز CRM.</div>;
  }

  return (
    <WorkspaceHub
      title="مركز علاقات العملاء"
      description="تابع العملاء المحتملين ومسار البيع والأنشطة والحملات من مساحة عمل موحدة."
      icon={Users}
      tabs={tabs}
      activeTab={activeTab}
    >
      <ActivePage />
    </WorkspaceHub>
  );
};

export default CRMHubPage;
