import React, { useEffect, useState, useMemo } from 'react';
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
        let severityColor = 'text-amber-600 border-amber-200';
        let severityLabel = 'منخفض';

        if (available <= 0) {
          status = 'OUT_OF_STOCK';
          severityColor = 'text-rose-600 border-rose-200';
          severityLabel = 'نفذ المخزون';
        } else if (available < 5) {
          status = 'CRITICAL';
          severityColor = 'text-orange-600 border-orange-200';
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
      <div className="flex h-full items-center justify-center p-6 text-sm font-bold text-slate-500">
        لا تملك صلاحية عرض تنبيهات المخزون.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-rose-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">تنبيهات المخزون المنخفض</h1>
            <p className="text-xs text-slate-500 font-medium">مراقبة الأصناف التي وصلت إلى مستوى منخفض أو نفدت عبر جميع المخازن</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition">
            <Download className="w-4 h-4" /> تصدير Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 bg-white border-b border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-rose-50 rounded-xl p-4 border border-rose-200">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-rose-600 font-semibold">نفذ المخزون</div>
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-rose-600" /></div>
            </div>
            <div className="text-2xl font-black text-rose-600">{summary.outOfStock}</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-orange-600 font-semibold">ن المستوى ناقد</div>
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center"><Package className="w-4 h-4 text-orange-600" /></div>
            </div>
            <div className="text-2xl font-black text-orange-600">{summary.critical}</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-amber-600 font-semibold">منخفض المخزون</div>
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><CircleDollarSign className="w-4 h-4 text-amber-600" /></div>
            </div>
            <div className="text-2xl font-black text-amber-600">{summary.low}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-xs text-slate-500 font-semibold">قيمة المخزون المنخفض</div>
            <div className="text-lg font-black text-slate-900">{summary.totalValue.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الصنف أو SKU..." className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400" />
          </div>
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="w-full sm:w-48 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400">
            <option value="">جميع المخازن</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-48 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400">
            <option value="">جميع الحالات</option>
            <option value="OUT_OF_STOCK">نفذ المخزون</option>
            <option value="CRITICAL">المستوى ناقد</option>
            <option value="LOW">منخفض المخزون</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-violet-500" /></div>
        ) : filteredAlerts.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium">لا توجد تنبيهات مخزون منخفضة</p>
            <p className="text-xs text-slate-400">جميع الأصناف لديها رصيد كافٍ في المخازن المختارة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">المخزن</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">الصنف</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">المتاح (م²)</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">المحجوز (م²)</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">السعر التكلفي</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-center">القيمة (م²)</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition group">
                    <td className="px-4 py-3 text-xs font-medium text-slate-900">{a.warehouseName || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900">{a.productName || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{a.sku || '—'}</td>
                    <td className="px-4 py-3 text-xs text-center font-mono text-slate-900">{a.availableM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs text-center font-mono text-slate-500">{a.reservedM2.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs text-center font-mono text-slate-600">{Number(a.costPrice || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs text-center font-mono text-violet-600 font-bold">{Number(a.availableM2 * (a.costPrice || 0)).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-bold border ${a.severityColor}`}>
                        {a.severityLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end">
              <span className="text-xs text-slate-500">{filteredAlerts.length} صنف من أصل {alerts.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryAlertsPage;
