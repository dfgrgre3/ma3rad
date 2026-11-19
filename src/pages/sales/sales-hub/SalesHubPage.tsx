import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { Receipt, BarChart3, Workflow, UserRound, BookmarkPlus, ShieldCheck, FileText, Package2, RotateCcw, FileWarning } from 'lucide-react';
import { useRouteAccess } from '../../../hooks/domains/auth/useRouteAccess';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { WorkspaceHub } from '../../common/workspace-hub/WorkspaceHub';
import type { WorkspaceHubTab } from '../../common/workspace-hub/WorkspaceHub';

const SalesView = lazy(() => import('../../../components/sales/SalesView').then((module) => ({ default: module.SalesView })));
const SalesAnalyticsPage = lazy(() => import('../sales-analytics/SalesAnalyticsPage').then((module) => ({ default: module.SalesAnalyticsPage })));
const InvoiceCyclePage = lazy(() => import('../invoice-cycle/InvoiceCyclePage').then((module) => ({ default: module.InvoiceCyclePage })));
const CustomerStatementPage = lazy(() => import('../customer-statement/CustomerStatementPage').then((module) => ({ default: module.CustomerStatementPage })));
const SalesOrdersDepositsPage = lazy(() => import('../sales-orders-deposits/SalesOrdersDepositsPage').then((module) => ({ default: module.SalesOrdersDepositsPage })));
const AfterSalesPage = lazy(() => import('../after-sales/AfterSalesPage').then((module) => ({ default: module.AfterSalesPage })));
const QuotationsPage = lazy(() => import('../quotations/QuotationsPage').then((module) => ({ default: module.QuotationsPage })));
const OrdersPage = lazy(() => import('../orders/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const ReturnsPage = lazy(() => import('../returns/ReturnsPage').then((module) => ({ default: module.ReturnsPage })));
const ElectronicInvoiceReadinessPage = lazy(() => import('../electronic-invoicing/ElectronicInvoiceReadinessPage').then((module) => ({ default: module.ElectronicInvoiceReadinessPage })));

const TABS: WorkspaceHubTab[] = [
  { id: 'invoices', label: 'فواتير المبيعات', path: '/sales', icon: Receipt },
  { id: 'analytics', label: 'تحليلات المبيعات', path: '/sales/analytics', icon: BarChart3 },
  { id: 'cycle', label: 'دورة الفاتورة', path: '/sales/cycle', icon: Workflow },
  { id: 'statement', label: 'كشف حساب عميل', path: '/sales/statement', icon: UserRound },
  { id: 'orders-deposits', label: 'الطلبات والعربون', path: '/sales/orders-deposits', icon: BookmarkPlus },
  { id: 'after-sales', label: 'خدمة ما بعد البيع', path: '/sales/after-sales', icon: ShieldCheck },
  { id: 'quotations', label: 'عروض الأسعار', path: '/quotations', icon: FileText },
  { id: 'orders', label: 'الطلبات', path: '/orders', icon: Package2 },
  { id: 'returns', label: 'المرتجعات', path: '/returns', icon: RotateCcw },
  { id: 'electronic-invoicing', label: 'الفاتورة الإلكترونية', path: '/sales/e-invoicing', icon: FileWarning },
];

const PAGE_BY_TAB = {
  invoices: SalesView,
  analytics: SalesAnalyticsPage,
  cycle: InvoiceCyclePage,
  statement: CustomerStatementPage,
  'orders-deposits': SalesOrdersDepositsPage,
  'after-sales': AfterSalesPage,
  quotations: QuotationsPage,
  orders: OrdersPage,
  returns: ReturnsPage,
  'electronic-invoicing': ElectronicInvoiceReadinessPage,
} as const;

export const SalesHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const canAccess = useRouteAccess();
  const pageCopy = useActivityPageCopy('sales');
  // Tabs follow the exact same route rules as the MainLayout guard — no
  // per-tab permission map that can drift from ROUTE_PERMISSIONS.
  const tabs = TABS.filter((tab) => canAccess(tab.path));
  const matchedTab = TABS.find((tab) => tab.path === pathname);
  const matchedAllowed = matchedTab ? tabs.some((tab) => tab.id === matchedTab.id) : false;
  // Hub base paths without a dedicated tab (none today) land on the first
  // permitted tab; a matched-but-denied tab shows an explicit denial instead
  // of silently rendering a different section.
  const activeTab = matchedTab ? (matchedAllowed ? matchedTab.id : null) : tabs[0]?.id ?? null;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (matchedTab && !matchedAllowed) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">لا تملك صلاحية الوصول إلى هذا القسم من مركز المبيعات.</div>;
  }

  if (!activeTab || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">لا توجد صلاحيات للوصول إلى مركز المبيعات.</div>;
  }

  return (
    <WorkspaceHub
      title={pageCopy?.title || 'مركز المبيعات'}
      description={pageCopy?.description || 'إدارة فواتير المبيعات والطلبات والمرتجعات والتحليلات من مكان واحد.'}
      icon={Receipt}
      tabs={tabs}
      activeTab={activeTab}
    >
      <ActivePage />
    </WorkspaceHub>
  );
};

export default SalesHubPage;
