import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ManufacturingService } from '../../../services/domains/manufacturing/ManufacturingService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { BranchService } from '../../../services/domains/organization/BranchService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { SupplierService } from '../../../services/domains/suppliers/SupplierService';
import { ProcurementService } from '../../../services/domains/procurement/ProcurementService';
import { PurchaseService } from '../../../services/domains/purchases/PurchaseService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { getProfileWorkflows } from '../../../config/businessProfiles';
import { OverviewTab } from './tabs/OverviewTab';
import { WorkCentersTab } from './tabs/WorkCentersTab';
import { BomsTab } from './tabs/BomsTab';
import { OrdersTab } from './tabs/OrdersTab';
import { FloorTab } from './tabs/FloorTab';
import { SalesCandidatesTab } from './tabs/SalesCandidatesTab';
import { MrpTab } from './tabs/MrpTab';
import { QualityTab } from './tabs/QualityTab';
import { MaintenanceTab } from './tabs/MaintenanceTab';
import { CostingTab } from './tabs/CostingTab';
import { HseTab } from './tabs/HseTab';
import { TraceabilityTab } from './tabs/TraceabilityTab';

export interface ManufacturingData {
  workCenters: any[];
  boms: any[];
  orders: any[];
  products: any[];
  branches: any[];
  warehouses: any[];
  qualityChecks: any[];
  maintenance: any[];
  wip: { orders: any[]; totalMaterialCost: number; totalQuantity: number };
  costReport: { orders: any[]; totalMaterialCost: number; totalLaborCost: number; totalCost: number; totalQuantity: number; maintenanceCost?: number; maintenanceByWorkCenter?: any[] };
  capacityPlan: any[];
  salesCandidates: any[];
  analytics: { workCenterEfficiency: any[]; orderVariance: any[]; monthlyOutput: any[] };
  maintenanceAlerts: { overdue: any[]; dueSoon: any[] };
  materialShortages: any[];
  purchaseSuggestions: any[];
  productionFloor: any[];
  bomStockAlerts: any[];
  productionSchedule: any[];
  mrp: { plannedProduction: any[]; materialNeeds: any[] };
  mpsEntries: any[];
  timePhasedMrp: { weeks: number; buckets: any[]; mpsEntries: any[] };
  downtime: any[];
  employees: any[];
  defectCodes: any[];
  oee: { centers: any[]; periodNote: string };
  operatorLabor: any[];
  operatorLaborDaily: any[];
  suppliers: any[];
  goodsReceipts: any[];
  purchases: any[];
  hseIncidents: any[];
  hsePermits: any[];
  hseInspections: any[];
  hseTrainings: any[];
  hsePermitAlerts: { expiring: any[]; expired: any[] };
  productionLines: any[];
}

const EMPTY_DATA: ManufacturingData = {
  workCenters: [], boms: [], orders: [], products: [], branches: [], warehouses: [],
  qualityChecks: [], maintenance: [],
  wip: { orders: [], totalMaterialCost: 0, totalQuantity: 0 },
  costReport: { orders: [], totalMaterialCost: 0, totalLaborCost: 0, totalCost: 0, totalQuantity: 0 },
  capacityPlan: [], salesCandidates: [],
  analytics: { workCenterEfficiency: [], orderVariance: [], monthlyOutput: [] },
  maintenanceAlerts: { overdue: [], dueSoon: [] },
  materialShortages: [],
  purchaseSuggestions: [],
  productionFloor: [],
  bomStockAlerts: [],
  productionSchedule: [],
  mrp: { plannedProduction: [], materialNeeds: [] },
  mpsEntries: [],
  timePhasedMrp: { weeks: 8, buckets: [], mpsEntries: [] },
  downtime: [],
  employees: [],
  defectCodes: [],
  oee: { centers: [], periodNote: '' },
  operatorLabor: [],
  operatorLaborDaily: [],
  suppliers: [],
  goodsReceipts: [],
  purchases: [],
  hseIncidents: [],
  hsePermits: [],
  hseInspections: [],
  hseTrainings: [],
  hsePermitAlerts: { expiring: [], expired: [] },
  productionLines: [],
};

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'orders', label: 'أوامر الإنتاج' },
  { key: 'floor', label: 'أرضية الإنتاج' },
  { key: 'sales', label: 'من أوامر البيع' },
  { key: 'mrp', label: 'تخطيط المواد' },
  { key: 'workCenters', label: 'مراكز العمل' },
  { key: 'boms', label: 'قوائم المواد' },
  { key: 'traceability', label: 'سلسلة التتبع' },
  { key: 'quality', label: 'الجودة' },
  { key: 'maintenance', label: 'الصيانة' },
  { key: 'hse', label: 'السلامة' },
  { key: 'costing', label: 'التكاليف والسعة' },
] as const;

export type ManufacturingTab = typeof TABS[number]['key'];

export const ManufacturingPage: React.FC = () => {
  const service = useMemo(() => new ManufacturingService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('manufacturing.manage');

  const [tab, setTab] = useState<ManufacturingTab>('overview');
  const [data, setData] = useState<ManufacturingData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setData({
        workCenters: service.getWorkCenters(),
        boms: service.getBoms(),
        orders: service.getProductionOrders(),
        products: new ProductService().getAllProducts(),
        branches: new BranchService().getAllBranches(),
        warehouses: new InventoryService().getAllWarehouses(),
        qualityChecks: service.getQualityChecks(),
        maintenance: service.getMaintenanceRecords(),
        wip: service.getWipValuation(),
        costReport: service.getProductionCostReport(),
        capacityPlan: service.getCapacityPlan(),
        salesCandidates: service.getSalesOrderProductionCandidates(),
        analytics: service.getManufacturingAnalytics(),
        maintenanceAlerts: service.getMaintenanceAlerts(),
        materialShortages: service.getMaterialShortages(),
        purchaseSuggestions: service.getPurchaseSuggestions(),
        productionFloor: service.getProductionFloor(),
        bomStockAlerts: service.getBomStockAlerts(),
        productionSchedule: service.getProductionSchedule(),
        mrp: service.getMrpPlan(),
        mpsEntries: service.getMpsEntries(),
        timePhasedMrp: service.getTimePhasedMrp(8),
        downtime: service.getDowntimeRecords(),
        employees: (() => { try { return EmployeeService.getAll(); } catch { return []; } })(),
        defectCodes: service.getDefectCodes(true),
        oee: service.getOeeAnalytics(),
        operatorLabor: service.getOperatorLaborSummary(),
        operatorLaborDaily: service.getOperatorLaborDaily(),
        suppliers: (() => { try { return new SupplierService().getAllSuppliers(); } catch { return []; } })(),
        goodsReceipts: (() => { try { return new ProcurementService().getAllGoodsReceipts(); } catch { return []; } })(),
        purchases: (() => { try { return new PurchaseService().getAllPurchases(); } catch { return []; } })(),
        hseIncidents: service.getHseIncidents(),
        hsePermits: service.getHsePermits(),
        hseInspections: service.getHseInspections(),
        hseTrainings: service.getHseTrainings(),
        hsePermitAlerts: service.getHsePermitAlerts(7),
        productionLines: service.getProductionLines(),
      });
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل بيانات التصنيع.');
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => { load(); }, [load]);

  const shared = { service, data, reload: load, canManage, toast };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Factory className="h-5 w-5" />}
        title="التصنيع"
        description="إدارة متكاملة: أوامر إنتاج، قوائم مواد، جودة، صيانة، تكاليف وقدرة إنتاجية."
        actions={
          <button className="rounded-lg border border-line bg-surface p-2 text-ink-secondary" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      {getProfileWorkflows(getEffectiveBusinessType()).length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3 text-xs ">
          <span className="font-bold text-muted">سير عمل النشاط: </span>
          {getProfileWorkflows(getEffectiveBusinessType()).map((w) => (
            <span key={w.id} className="ml-2 inline-block rounded-full bg-surface-sunken px-2 py-0.5 " title={w.steps.join(' → ')}>{w.label.ar}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition ${tab === item.key ? 'bg-surface border border-line border-b-white text-primary -mb-px' : 'text-muted hover:text-ink'}`}
          >
            {item.label}
            {item.key === 'sales' && data.salesCandidates.length > 0 && (
              <span className="mr-1 rounded-full bg-accent-soft px-1.5 text-[10px] text-primary">{data.salesCandidates.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-line bg-surface p-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab {...shared} />}
          {tab === 'orders' && <OrdersTab {...shared} />}
          {tab === 'floor' && <FloorTab {...shared} />}
          {tab === 'sales' && <SalesCandidatesTab {...shared} />}
          {tab === 'mrp' && <MrpTab {...shared} />}
          {tab === 'workCenters' && <WorkCentersTab {...shared} />}
          {tab === 'boms' && <BomsTab {...shared} />}
          {tab === 'traceability' && <TraceabilityTab {...shared} />}
          {tab === 'quality' && <QualityTab {...shared} />}
          {tab === 'maintenance' && <MaintenanceTab {...shared} />}
          {tab === 'hse' && <HseTab {...shared} />}
          {tab === 'costing' && <CostingTab {...shared} />}
        </>
      )}
    </div>
  );
};
