import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { Barcode, FolderTree, Package, Ruler, Tags } from 'lucide-react';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
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

const REQUIRED_PERMISSION: Record<string, string> = {
  products: 'products.view',
  categories: 'categories.view',
  brands: 'brands.view',
  attributes: 'products.view',
  barcodes: 'products.view',
};

const PAGE_BY_TAB = {
  products: ProductsView,
  categories: CategoriesView,
  brands: BrandsView,
  attributes: ProductAttributesPage,
  barcodes: BarcodesPrintPage,
} as const;

export const ProductCatalogHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const can = usePermission();
  const tabs = TABS.filter((tab) => can(REQUIRED_PERMISSION[tab.id]));
  const activeTab = tabs.find((tab) => tab.path === pathname)?.id ?? tabs[0]?.id;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (!tabs.length || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">لا تملك صلاحية الوصول إلى كتالوج المنتجات.</div>;
  }

  return (
    <WorkspaceHub
      title="كتالوج المنتجات"
      description="إدارة الأصناف وتصنيفاتها وماركاتها وخصائصها وباركوداتها من مركز واحد."
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
