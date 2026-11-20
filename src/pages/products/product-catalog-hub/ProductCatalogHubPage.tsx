import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { Barcode, FolderTree, Package, Ruler, Tags } from 'lucide-react';
import { useRouteAccess } from '../../../hooks/domains/auth/useRouteAccess';
import { useActivityPageCopy } from '../../../hooks/domains/config/useBusinessTerm';
import { WorkspaceHub } from '../../common/workspace-hub/WorkspaceHub';
import type { WorkspaceHubTab } from '../../common/workspace-hub/WorkspaceHub';

const ProductsView = lazy(() => import('../../../components/products/ProductsView').then((module) => ({ default: module.ProductsView })));
const CategoriesView = lazy(() => import('../../../components/products/CategoriesView').then((module) => ({ default: module.CategoriesView })));
const BrandsView = lazy(() => import('../../../components/products/BrandsView').then((module) => ({ default: module.BrandsView })));
const ProductAttributesPage = lazy(() => import('../product-attributes/ProductAttributesPage').then((module) => ({ default: module.ProductAttributesPage })));
const BarcodesPrintPage = lazy(() => import('../barcodes-print/BarcodesPrintPage').then((module) => ({ default: module.BarcodesPrintPage })));

const TABS: WorkspaceHubTab[] = [
  { id: 'products', label: 'المنتجات', path: '/products', icon: Package },
  { id: 'categories', label: 'التصنيفات', path: '/categories', icon: FolderTree },
  { id: 'brands', label: 'الماركات', path: '/brands', icon: Tags },
  { id: 'attributes', label: 'الخصائص الديناميكية', path: '/products/attributes', icon: Ruler },
  { id: 'barcodes', label: 'الباركود', path: '/products/barcodes', icon: Barcode },
];

const PAGE_BY_TAB = {
  products: ProductsView,
  categories: CategoriesView,
  brands: BrandsView,
  attributes: ProductAttributesPage,
  barcodes: BarcodesPrintPage,
} as const;

export const ProductCatalogHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const canAccess = useRouteAccess();
  const pageCopy = useActivityPageCopy('products');
  // Tabs follow the exact same route rules as the MainLayout guard — no
  // per-tab permission map that can drift from ROUTE_PERMISSIONS.
  const tabs = TABS.filter((tab) => canAccess(tab.path));
  const matchedTab = TABS.find((tab) => tab.path === pathname);
  const matchedAllowed = matchedTab ? tabs.some((tab) => tab.id === matchedTab.id) : false;
  const activeTab = matchedTab ? (matchedAllowed ? matchedTab.id : null) : tabs[0]?.id ?? null;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (matchedTab && !matchedAllowed) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">لا تملك صلاحية الوصول إلى هذا القسم من كتالوج المنتجات.</div>;
  }

  if (!activeTab || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">لا تملك صلاحية الوصول إلى كتالوج المنتجات.</div>;
  }

  return (
    <WorkspaceHub
      title={pageCopy?.title || 'كتالوج المنتجات'}
      description={pageCopy?.description || 'إدارة الأصناف وتصنيفاتها وماركاتها وخصائصها وباركوداتها من مركز واحد.'}
      icon={Package}
      tabs={tabs}
      activeTab={activeTab}
      showHeading={false}
      showTabs={false}
    >
      <ActivePage />
    </WorkspaceHub>
  );
};

export default ProductCatalogHubPage;
