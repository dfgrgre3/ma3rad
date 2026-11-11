import React, { lazy } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeftRight, Barcode, BookmarkPlus, Building2, ClipboardList, Layers,
  PackageSearch, Scale, ShieldAlert, Warehouse, Wrench,
} from 'lucide-react';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { WorkspaceHub } from '../../common/workspace-hub/WorkspaceHub';
import type { WorkspaceHubTab } from '../../common/workspace-hub/WorkspaceHub';

const InventoryView = lazy(() => import('../../../components/inventory/InventoryView').then((module) => ({ default: module.InventoryView })));
const LocationStockPage = lazy(() => import('../location-stock/LocationStockPage').then((module) => ({ default: module.LocationStockPage })));
const StockLedgerPage = lazy(() => import('../stock-ledger/StockLedgerPage').then((module) => ({ default: module.StockLedgerPage })));
const StockTransfersView = lazy(() => import('../stock-transfers/StockTransfersPage').then((module) => ({ default: module.StockTransfersPage })));
const InventoryCountPage = lazy(() => import('../inventory-count/InventoryCountPage').then((module) => ({ default: module.InventoryCountPage })));
const InventoryValuationPage = lazy(() => import('../inventory-valuation/InventoryValuationPage').then((module) => ({ default: module.InventoryValuationPage })));
const InventoryAdjustmentsPage = lazy(() => import('../inventory-adjustments/InventoryAdjustmentsPage').then((module) => ({ default: module.InventoryAdjustmentsPage })));
const StockReservationsPage = lazy(() => import('../stock-reservations/StockReservationsPage').then((module) => ({ default: module.StockReservationsPage })));
const ReorderPlanningPage = lazy(() => import('../reorder-planning/ReorderPlanningPage').then((module) => ({ default: module.ReorderPlanningPage })));
const WarehouseLocationsPage = lazy(() => import('../warehouse-locations/WarehouseLocationsPage').then((module) => ({ default: module.WarehouseLocationsPage })));
const DamageQuarantinePage = lazy(() => import('../damage-quarantine/DamageQuarantinePage').then((module) => ({ default: module.DamageQuarantinePage })));
const InventoryReconciliationPage = lazy(() => import('../inventory-reconciliation/InventoryReconciliationPage').then((module) => ({ default: module.InventoryReconciliationPage })));
const InventoryAlertsPage = lazy(() => import('../inventory-alerts/InventoryAlertsPage').then((module) => ({ default: module.InventoryAlertsPage })));

const TABS: WorkspaceHubTab[] = [
  { id: 'overview', label: 'نظرة عامة', path: '/inventory', icon: Layers },
  { id: 'warehouse-stock', label: 'أرصدة المخازن', path: '/inventory/warehouse-stock', icon: Warehouse },
  { id: 'showroom-stock', label: 'أرصدة المعارض', path: '/inventory/showroom-stock', icon: Building2 },
  { id: 'alerts', label: 'تنبيهات المخزون', path: '/inventory/alerts', icon: AlertTriangle },
  { id: 'ledger', label: 'سجل الحركة', path: '/inventory/ledger', icon: Activity },
  { id: 'transfers', label: 'التحويلات', path: '/inventory/transfers', icon: ArrowLeftRight },
  { id: 'counts', label: 'الجرد', path: '/inventory/counts', icon: ClipboardList },
  { id: 'valuation', label: 'التقييم', path: '/inventory/valuation', icon: Scale },
  { id: 'adjustments', label: 'التسويات', path: '/inventory/adjustments', icon: Wrench },
  { id: 'stock-reservations', label: 'حجوزات المخزون', path: '/inventory/stock-reservations', icon: BookmarkPlus },
  { id: 'reorder-planning', label: 'إعادة الطلب', path: '/inventory/reorder-planning', icon: PackageSearch },
  { id: 'locations', label: 'مواقع الرفوف', path: '/inventory/locations', icon: Barcode },
  { id: 'damage-quarantine', label: 'التالف والحجر', path: '/inventory/damage-quarantine', icon: ShieldAlert },
  { id: 'reconciliation', label: 'المطابقة', path: '/inventory/reconciliation', icon: Scale },
];

const REQUIRED_PERMISSION: Record<string, string> = {
  overview: 'inventory.view',
  'warehouse-stock': 'inventory.view',
  'showroom-stock': 'inventory.view',
  alerts: 'inventory.view',
  ledger: 'inventory.view',
  transfers: 'inventory.transfer',
  counts: 'inventory.count',
  valuation: 'inventory.view',
  adjustments: 'inventory.adjust',
  'stock-reservations': 'inventory.view',
  'reorder-planning': 'inventory.view',
  locations: 'inventory.view',
  'damage-quarantine': 'inventory.adjust',
  reconciliation: 'inventory.view',
};

const PAGE_BY_TAB = {
  overview: InventoryView,
  'warehouse-stock': () => <LocationStockPage mode="warehouse" />,
  'showroom-stock': () => <LocationStockPage mode="showroom" />,
  alerts: InventoryAlertsPage,
  ledger: StockLedgerPage,
  transfers: StockTransfersView,
  counts: InventoryCountPage,
  valuation: InventoryValuationPage,
  adjustments: InventoryAdjustmentsPage,
  'stock-reservations': StockReservationsPage,
  'reorder-planning': ReorderPlanningPage,
  locations: WarehouseLocationsPage,
  'damage-quarantine': DamageQuarantinePage,
  reconciliation: InventoryReconciliationPage,
} as const;

export const InventoryHubPage: React.FC = () => {
  const { pathname } = useLocation();
  const can = usePermission();
  const tabs = TABS.filter((tab) => can(REQUIRED_PERMISSION[tab.id]));
  const activeTab = tabs.find((tab) => tab.path === pathname)?.id ?? tabs[0]?.id;
  const ActivePage = activeTab ? PAGE_BY_TAB[activeTab as keyof typeof PAGE_BY_TAB] : null;

  if (!tabs.length || !ActivePage) {
    return <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">لا تملك صلاحية الوصول إلى مركز المخزون.</div>;
  }

  return (
    <WorkspaceHub
      title="مركز المخزون"
      description="نظرة موحدة على الأرصدة والتنبيهات، مع بقاء عمليات المخزون المتخصصة مستقلة."
      icon={Layers}
      tabs={tabs}
      activeTab={activeTab}
      showHeading={false}
      showTabs={false}
    >
      <ActivePage />
    </WorkspaceHub>
  );
};

export default InventoryHubPage;
