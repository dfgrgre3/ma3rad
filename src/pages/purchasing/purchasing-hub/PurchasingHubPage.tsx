import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ClipboardList, FileText, Package2, PackageCheck, Receipt, RotateCcw, ShieldCheck, ShoppingBag, Wallet,
} from 'lucide-react';
import { useRouteAccess } from '../../../hooks/domains/auth/useRouteAccess';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { resolveHubTabs } from '../../../config/activityHubTabs';
import { ActivityHubSummary } from '../../../components/dashboard/activity/ActivityHubSummary';
import { WorkspaceHub } from '../../common/workspace-hub/WorkspaceHub';
import type { WorkspaceHubTab } from '../../common/workspace-hub/WorkspaceHub';

const PurchasesView = lazy(() => import('../../../components/purchases/PurchasesView').then((module) => ({ default: module.PurchasesView })));
const PurchaseRequestsPage = lazy(() => import('../purchase-requests/PurchaseRequestsPage').then((module) => ({ default: module.PurchaseRequestsPage })));
const SupplierQuotationsPage = lazy(() => import('../supplier-quotations/SupplierQuotationsPage').then((module) => ({ default: module.SupplierQuotationsPage })));
const PurchaseOrdersPage = lazy(() => import('../purchase-orders/PurchaseOrdersPage').then((module) => ({ default: module.PurchaseOrdersPage })));
const GoodsReceiptsPage = lazy(() => import('../goods-receipts/GoodsReceiptsPage').then((module) => ({ default: module.GoodsReceiptsPage })));
const IncomingProductsPage = lazy(() => import('../incoming-products/IncomingProductsPage').then((module) => ({ default: module.IncomingProductsPage })));
const PurchaseReturnsPage = lazy(() => import('../purchase-returns/PurchaseReturnsPage').then((module) => ({ default: module.PurchaseReturnsPage })));
const SupplierClaimsPage = lazy(() => import('../supplier-claims/SupplierClaimsPage').then((module) => ({ default: module.SupplierClaimsPage })));
const SupplierStatementPage = lazy(() => import('../supplier-statement/SupplierStatementPage').then((module) => ({ default: module.SupplierStatementPage })));

const TABS: WorkspaceHubTab[] = [
  { id: 'invoices', label: 'فواتير المشتريات', path: '/purchases', icon: Receipt },
  { id: 'requests', label: 'طلبات الشراء', path: '/purchases/requests', icon: ClipboardList },
  { id: 'quotations', label: 'عروض الموردين', path: '/purchases/quotations', icon: FileText },
  { id: 'orders', label: 'أوامر الشراء', path: '/purchases/orders', icon: ShoppingBag },
  { id: 'receipts', label: 'الاستلامات', path: '/purchases/receipts', icon: PackageCheck },
  { id: 'incoming', label: 'الواردات', path: '/purchases/incoming', icon: Package2 },
  { id: 'returns', label: 'مرتجعات المشتريات', path: '/purchases/returns', icon: RotateCcw },
  { id: 'claims', label: 'مطالبات الموردين', path: '/purchases/claims', icon: ShieldCheck },
  { id: 'statement', label: 'كشف حساب المورد', path: '/purchases/statement', icon: Wallet },
];

const PAGE_BY_TAB = {
  invoices: PurchasesView,
  requests: PurchaseRequestsPage,
  quotations: SupplierQuotationsPage,
  orders: PurchaseOrdersPage,
  receipts: GoodsReceiptsPage,
  incoming: IncomingProductsPage,
  returns: PurchaseReturnsPage,
  claims: SupplierClaimsPage,
  statement: SupplierStatementPage,
} as const;

export const PurchasingHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const canAccess = useRouteAccess();
  const pageCopy = useActivityPageCopy('purchasing');
  // نفس قاعدة مركز المبيعات: ترشيح ظهور المسار حسب النشاط ثم الصلاحيات.
  const tabs = resolveHubTabs('purchasing', TABS).filter((tab) => canAccess(tab.path));
  const matchedTab = TABS.find((tab) => tab.path === pathname);
  const matchedAllowed = matchedTab ? tabs.some((tab) => tab.id === matchedTab.id) : false;
  const activeTab = matchedTab ? (matchedAllowed ? matchedTab.id : null) : tabs[0]?.id ?? null;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (matchedTab && !matchedAllowed) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">لا تملك صلاحية الوصول إلى هذا القسم من مركز المشتريات.</div>;
  }

  if (!activeTab || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">لا توجد صلاحيات للوصول إلى مركز المشتريات.</div>;
  }

  return (
    <WorkspaceHub
      title={pageCopy?.title || 'مركز المشتريات'}
      description={pageCopy?.description || 'إدارة فواتير الشراء وأوامر التوريد والاستلامات والموردين من مكان واحد.'}
      icon={ShoppingBag}
      tabs={tabs}
      activeTab={activeTab}
    >
      {activeTab === 'invoices' && <ActivityHubSummary />}
      <ActivePage />
    </WorkspaceHub>
  );
};

export default PurchasingHubPage;
