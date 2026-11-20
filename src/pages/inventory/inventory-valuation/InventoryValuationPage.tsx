import React, { useState, useEffect } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Scale, Download, TrendingUp, DollarSign, Layers, PieChart } from 'lucide-react';
import { InventoryValuationService, type WarehouseValuation } from '../../../services/domains/inventory/InventoryValuationService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { exportToExcel } from '../../../utils/export/export';

export const InventoryValuationPage: React.FC = () => {
  const [data, setData] = useState<WarehouseValuation[]>([]);
  const [_loading, setLoading] = useState(true);
  const loadSeq = React.useRef(0);

  useEffect(() => {
    loadValuation();
  }, []);

  const loadValuation = () => {
    const seq = ++loadSeq.current;
    void (async () => {
      try {
        setData(await new InventoryValuationService().getByWarehouse());
      } catch (e) {
        console.error('Error fetching inventory valuation:', e);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    })();
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Math.round(n)) + ' ج';

  const totalCost = data.reduce((s, w) => s + w.costValue, 0);
  const totalRetail = data.reduce((s, w) => s + w.retailValue, 0);
  const potentialProfit = totalRetail - totalCost;
  const canExport = PermissionService.can(AuthService.getCurrentUser(), 'ui.inventory.valuation.export');
  const exportReport = () => exportToExcel({
    title: 'Inventory valuation by warehouse',
    columns: [
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'items', label: 'Items' },
      { key: 'quantities', label: 'Quantities by unit' },
      { key: 'costValue', label: 'Current stock value at cost' },
      { key: 'retailValue', label: 'Current stock value at retail' },
      { key: 'potentialMargin', label: 'Potential margin' },
    ],
    rows: data.map((warehouse) => ({
      warehouse: warehouse.name,
      items: warehouse.itemsCount,
      quantities: warehouse.quantitiesByUnit.map(({ unitLabel, quantity }) => `${quantity} ${unitLabel}`).join(', '),
      costValue: warehouse.costValue,
      retailValue: warehouse.retailValue,
      potentialMargin: warehouse.retailValue - warehouse.costValue,
    })),
    fileName: 'inventory-valuation',
    permission: 'inventory.export',
  });

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<Scale className="w-5 h-5" />}
          title="تقييم المخزون (Inventory Valuation)"
          description="حساب القيمة المالية الحالية للبضائع المتاحة بسعر التكلفة وسعر البيع"
          actions={canExport && <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-sm font-semibold transition shrink-0">
            <Download className="w-4 h-4" />
            تصدير التقرير المالي في جدول بيانات
          </button>}
        />
      </div>

      {/* Summary Cards */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0 bg-surface border-b border-line">
        <div className="bg-surface border border-line rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted font-bold mb-1">إجمالي قيمة المخزون بالتكلفة</div>
            <div className="text-xl font-black text-ink">{fmt(totalCost)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary" />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted font-bold mb-1">إجمالي قيمة البيع (سعر المعرض)</div>
            <div className="text-xl font-black text-success">{fmt(totalRetail)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-success" />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted font-bold mb-1">الربح المتوقع للمخزون بالكامل</div>
            <div className="text-xl font-black text-primary">{fmt(potentialProfit)}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>

      {/* Breakdown per Warehouse */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="p-4 border-b border-line flex items-center gap-2">
            <PieChart className="w-4 h-4 text-muted" />
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">توزيع وتقييم البضاعة حسب المخازن</h3>
          </div>
          <DataTable
            ariaLabel="تقييم المخزون"
            rows={data}
            rowKey={(w: any) => String(w.id)}
            tableClassName="text-sm"
            columns={[
              { key: 'name', header: 'المخزن', render: (w: any) => <span className="font-medium text-ink">{w.name}</span> },
              { key: 'count', header: 'عدد الأصناف', render: (w: any) => <span className="font-semibold text-ink">{w.itemsCount} صنف</span> },
              {
                key: 'qty', header: 'الكميات حسب الوحدة',
                render: (w: any) => <span className="block font-bold text-primary">{w.quantitiesByUnit.map(({ unitLabel, quantity }: any) => <span key={unitLabel} className="block">{new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(quantity)} {unitLabel}</span>)}</span>,
              },
              { key: 'cost', header: 'القيمة بسعر الشراء', render: (w: any) => <span className="text-ink-secondary">{fmt(w.costValue)}</span> },
              { key: 'retail', header: 'القيمة بسعر البيع', render: (w: any) => <span className="font-bold text-success">{fmt(w.retailValue)}</span> },
              { key: 'profit', header: 'الربح المتوقع', render: (w: any) => <span className="font-bold text-primary">{fmt(w.retailValue - w.costValue)}</span> },
            ]}
          />
        </div>
      </div>
    </div>
  );
};
