import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Factory, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ManufacturingService } from '../../../services/domains/manufacturing/ManufacturingService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { BranchService } from '../../../services/domains/organization/BranchService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { useToast } from '../../../components/ui/Toast';
import { getEffectiveBusinessType } from '../../../services/domains/config/BusinessTypeService';
import { getProfileWorkflows } from '../../../config/businessProfiles';
import { OverviewTab } from './tabs/OverviewTab';
import { WorkCentersTab } from './tabs/WorkCentersTab';
import { BomsTab } from './tabs/BomsTab';
import { OrdersTab } from './tabs/OrdersTab';
import { SalesCandidatesTab } from './tabs/SalesCandidatesTab';
import { QualityTab } from './tabs/QualityTab';
import { MaintenanceTab } from './tabs/MaintenanceTab';
import { CostingTab } from './tabs/CostingTab';

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
  costReport: { orders: any[]; totalMaterialCost: number; totalLaborCost: number; totalCost: number; totalQuantity: number };
  capacityPlan: any[];
  salesCandidates: any[];
  analytics: { workCenterEfficiency: any[]; orderVariance: any[]; monthlyOutput: any[] };
}

const EMPTY_DATA: ManufacturingData = {
  workCenters: [], boms: [], orders: [], products: [], branches: [], warehouses: [],
  qualityChecks: [], maintenance: [],
  wip: { orders: [], totalMaterialCost: 0, totalQuantity: 0 },
  costReport: { orders: [], totalMaterialCost: 0, totalLaborCost: 0, totalCost: 0, totalQuantity: 0 },
  capacityPlan: [], salesCandidates: [],
  analytics: { workCenterEfficiency: [], orderVariance: [], monthlyOutput: [] },
};

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'orders', label: 'أوامر الإنتاج' },
  { key: 'sales', label: 'من أوامر البيع' },
  { key: 'workCenters', label: 'مراكز العمل' },
  { key: 'boms', label: 'قوائم المواد' },
  { key: 'quality', label: 'الجودة' },
  { key: 'maintenance', label: 'الصيانة' },
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
          <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600" onClick={load} title="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      {getProfileWorkflows(getEffectiveBusinessType()).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
          <span className="font-bold text-slate-500">سير عمل النشاط: </span>
          {getProfileWorkflows(getEffectiveBusinessType()).map((w) => (
            <span key={w.id} className="ml-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800" title={w.steps.join(' → ')}>{w.label.ar}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition ${tab === item.key ? 'bg-white border border-slate-200 border-b-white text-sky-600 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {item.label}
            {item.key === 'sales' && data.salesCandidates.length > 0 && (
              <span className="mr-1 rounded-full bg-sky-100 px-1.5 text-[10px] text-sky-700">{data.salesCandidates.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab {...shared} />}
          {tab === 'orders' && <OrdersTab {...shared} />}
          {tab === 'sales' && <SalesCandidatesTab {...shared} />}
          {tab === 'workCenters' && <WorkCentersTab {...shared} />}
          {tab === 'boms' && <BomsTab {...shared} />}
          {tab === 'quality' && <QualityTab {...shared} />}
          {tab === 'maintenance' && <MaintenanceTab {...shared} />}
          {tab === 'costing' && <CostingTab {...shared} />}
        </>
      )}
    </div>
  );
};
