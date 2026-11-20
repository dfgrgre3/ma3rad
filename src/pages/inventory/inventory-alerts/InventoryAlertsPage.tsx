import React, { useEffect, useState, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AlertTriangle, Bell, Search, Download, RefreshCw, CircleDollarSign, Package } from 'lucide-react';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { exportToExcel } from '../../../utils/export/export';

type ExtendedWarehouseStock = {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  productId: string;
  productName?: string;
  sku?: string;
  barcode?: string;
  quantityM2: number;
  quantityBoxes: number;
  quantityPieces: number;
  reservedM2: number;
  availableM2: number;
  locationInWarehouse?: string;
  lastUpdated: string;
  costPrice?: number;
  sellingPriceM2?: number;
};

type AlertRow = ExtendedWarehouseStock & {
  status: 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW';
  severityColor: string;
  severityLabel: string;
};

export const InventoryAlertsPage: React.FC = () => {
  const inventoryService = new InventoryService();
  const can = usePermission();
  const canView = can('inventory.view');

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadData = () => {
    setLoading(true);
    try {
      const allStock = inventoryService.getWarehouseStock() as unknown as ExtendedWarehouseStock[];
      const whList = inventoryService.getAllWarehouses();

      setWarehouses(whList.map((w) => ({ id: w.id, name: w.name })));

      const alerts: AlertRow[] = allStock.map((s) => {
        const available = s.availableM2;
        let status: AlertRow['status'] = 'LOW';
        let severityColor = 'text-warning border-warning-border';
        let severityLabel = 'منخفض';

        if (available <= 0) {
          status = 'OUT_OF_STOCK';
          severityColor = 'text-danger border-danger-border';
          severityLabel = 'نفذ المخزون';
        } else if (available < 5) {
          status = 'CRITICAL';
          severityColor = 'text-warning border-warning-border';
          severityLabel = 'ن nível ناقد';
        }

        return {
          ...s,
          status,
          severityColor,
          severityLabel,
        };
      });

      setAlerts(alerts);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل تنبيهات المخزون.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (search.trim() && !a.productName?.toLowerCase().includes(search.toLowerCase()) && !a.sku?.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (warehouseFilter && a.warehouseId !== warehouseFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      return true;
    });
  }, [alerts, search, warehouseFilter, statusFilter]);

  const summary = useMemo(() => {
    return {
      outOfStock: alerts.filter((a) => a.status === 'OUT_OF_STOCK').length,
      critical: alerts.filter((a) => a.status === 'CRITICAL').length,
      low: alerts.filter((a) => a.status === 'LOW').length,
      totalValue: alerts.reduce((sum, a) => sum + (a.availableM2 * (a.costPrice || 0)), 0),
    };
  }, [alerts]);

  const handleExport = () => {
    const columns = [
      { key: 'warehouseName', label: 'المخزن' },
      { key: 'productName', label: 'الصنف' },
      { key: 'sku', label: 'المخزون SKU' },
      { key: 'availableM2', label: 'الرصيد المتاح (م²)' },
      { key: 'reservedM2', label: 'المحجوز (م²)' },
      { key: 'severityLabel', label: 'الحالة' },
      { key: 'costPrice', label: 'السعر التكلفي' },
      { key: 'totalValue', label: 'القيمة الإجمالية' },
    ];
    const rows = filteredAlerts.map((a) => ({
      warehouseName: a.warehouseName || '—',
      productName: a.productName || '—',
      sku: a.sku || '—',
      availableM2: a.availableM2,
      reservedM2: a.reservedM2,
      severityLabel: a.severityLabel,
      costPrice: a.costPrice || 0,
      totalValue: a.availableM2 * (a.costPrice || 0),
    }));
    exportToExcel({
      title: 'تنبيهات المخزون المنخفض',
      subtitle: 'تقرير الأصناف التي وصلت إلى مستوى منخفض أو نفدت',
      columns,
      rows,
      fileName: 'تنبيهات_المخزون_منخفض',
      permission: 'inventory.export',
    });
  };

  if (!canView) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-muted">
        لا تملك صلاحية عرض تنبيهات المخزون.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<AlertTriangle className="w-5 h-5" />}
          title="تنبيهات المخزون المنخفض"
          description="مراقبة الأصناف التي وصلت إلى مستوى منخفض أو نفدت عبر جميع المخازن"
          actions={<>
            <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-xl text-xs font-semibold text-ink hover:bg-surface-muted transition">
              <RefreshCw className="w-4 h-4" /> تحديث
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary text-white rounded-xl text-xs font-semibold transition">
              <Download className="w-4 h-4" /> تصدير Excel
            </button>
          </>}
        />
      </div>

      {/* Summary Cards */}
      <div className="p-4 bg-surface border-b border-line">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-danger-soft rounded-xl p-4 border border-danger-border">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-danger font-semibold">نفذ المخزون</div>
              <div className="w-8 h-8 rounded-full bg-danger-soft flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-danger" /></div>
            </div>
            <div className="text-2xl font-black text-danger">{summary.outOfStock}</div>
          </div>
          <div className="bg-warning-soft rounded-xl p-4 border border-warning-border">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-warning font-semibold">ن المستوى ناقد</div>
              <div className="w-8 h-8 rounded-full bg-warning-soft flex items-center justify-center"><Package className="w-4 h-4 text-warning" /></div>
            </div>
            <div className="text-2xl font-black text-warning">{summary.critical}</div>
          </div>
          <div className="bg-warning-soft rounded-xl p-4 border border-warning-border">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-warning font-semibold">منخفض المخزون</div>
              <div className="w-8 h-8 rounded-full bg-warning-soft flex items-center justify-center"><CircleDollarSign className="w-4 h-4 text-warning" /></div>
            </div>
            <div className="text-2xl font-black text-warning">{summary.low}</div>
          </div>
          <div className="bg-surface-muted rounded-xl p-4 border border-line">
            <div className="text-xs text-muted font-semibold">قيمة المخزون المنخفض</div>
            <div className="text-lg font-black text-ink">{summary.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-surface border-b border-line">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الصنف أو SKU..." className="w-full pl-8 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary" />
          </div>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="w-full sm:w-48 px-3 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary">
            <option value="">جميع المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48 px-3 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-primary">
            <option value="">جميع الحالات</option>
            <option value="OUT_OF_STOCK">نفذ المخزون</option>
            <option value="CRITICAL">المستوى ناقد</option>
            <option value="LOW">منخفض المخزون</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filteredAlerts.length === 0 ? (
          <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">
            <Bell className="w-8 h-8 text-muted mx-auto mb-3" />
            <p className="text-sm font-medium">لا توجد تنبيهات مخزون منخفضة</p>
            <p className="text-xs text-muted">جميع الأصناف لديها رصيد كافٍ في المخازن المختارة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="تنبيهات المخزون"
              rows={filteredAlerts}
              rowKey={(a: any) => String(a.id)}
              tableClassName="border-collapse text-xs"
              columns={[
                { key: 'wh', header: 'المخزن', render: (a: any) => <span className="text-xs font-medium text-ink">{a.warehouseName || '—'}</span> },
                { key: 'product', header: 'الصنف', render: (a: any) => <span className="text-xs font-semibold text-ink">{a.productName || '—'}</span> },
                { key: 'sku', header: 'SKU', render: (a: any) => <span className="font-mono text-xs text-muted">{a.sku || '—'}</span> },
                { key: 'avail', header: 'المتاح (م²)', align: 'center', render: (a: any) => <span className="font-mono text-xs text-ink">{a.availableM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span> },
                { key: 'reserved', header: 'المحجوز (م²)', align: 'center', render: (a: any) => <span className="font-mono text-xs text-muted">{a.reservedM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span> },
                { key: 'cost', header: 'السعر التكلفي', align: 'center', render: (a: any) => <span className="font-mono text-xs text-ink-secondary">{Number(a.costPrice || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span> },
                { key: 'value', header: 'القيمة (م²)', align: 'center', render: (a: any) => <span className="font-mono text-xs font-bold text-primary">{Number(a.availableM2 * (a.costPrice || 0)).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</span> },
                {
                  key: 'status', header: 'الحالة',
                  render: (a: any) => <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${a.severityColor}`}>{a.severityLabel}</span>,
                },
              ]}
            />
            <div className="mt-3 flex justify-end">
              <span className="text-xs text-muted">{filteredAlerts.length} صنف من أصل {alerts.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryAlertsPage;
