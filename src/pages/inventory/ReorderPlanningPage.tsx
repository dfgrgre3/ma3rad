import React, { useState, useEffect } from 'react';
import { 
  TrendingDown, AlertTriangle, CheckCircle2, Package, RefreshCw, 
  Search, SlidersHorizontal, ShoppingCart, ArrowUpDown, ChevronRight,
  ShieldAlert, Clock, BarChart3, Building2, Edit3, X, Check
} from 'lucide-react';
import { InventoryService } from '../../services/InventoryService';
import { PurchaseRequestService } from '../../services/PurchaseRequestService';
import { useToast } from '../../components/ui/Toast';
import { getStockQuantityLabel } from '../../utils/productUnits';

export const ReorderPlanningPage: React.FC = () => {
  const inventoryService = new InventoryService();
  const toast = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Edit threshold modal
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    reorderPoint: 20,
    safetyStock: 10,
    leadTimeDays: 7,
    minStockLevel: 10,
    maxStockLevel: 100
  });

  // Selected items for purchase request creation
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [creatingPO, setCreatingPO] = useState(false);

  const loadData = () => {
    setLoading(true);
    try {
      const whList = inventoryService.getAllWarehouses();
      setWarehouses(whList);
      const planItems = inventoryService.getReorderPlanning(
        selectedWarehouseId || undefined,
        search || undefined
      );
      setItems(planItems);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل بيانات التخطيط وإعادة الطلب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouseId]);

  const filteredItems = items.filter(item => {
    if (statusFilter === 'ALL') return true;
    return item.stockStatus === statusFilter;
  });

  // Summary statistics
  const outOfStockCount = items.filter(i => i.stockStatus === 'OUT_OF_STOCK').length;
  const criticalCount = items.filter(i => i.stockStatus === 'CRITICAL').length;
  const reorderNeededCount = items.filter(i => i.stockStatus === 'REORDER_NEEDED').length;
  const totalSuggestedValue = items.reduce((sum, i) => sum + (i.suggestedOrderValue || 0), 0);

  const toggleSelect = (productId: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    setSelectedProductIds(next);
  };

  const selectAllCritical = () => {
    const criticalIds = items
      .filter(i => i.stockStatus === 'OUT_OF_STOCK' || i.stockStatus === 'CRITICAL' || i.stockStatus === 'REORDER_NEEDED')
      .map(i => i.productId);
    setSelectedProductIds(new Set(criticalIds));
  };

  const handleEditThresholds = (item: any) => {
    setEditItem(item);
    setEditForm({
      reorderPoint: item.reorderPoint,
      safetyStock: item.safetyStock,
      leadTimeDays: item.leadTimeDays,
      minStockLevel: item.minStockLevel,
      maxStockLevel: item.maxStockLevel
    });
  };

  const handleSaveThresholds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    try {
      inventoryService.updateProductPlanningParameters(editItem.productId, editForm);
      toast.success('تم تحديث محددات التخطيط وإعادة الطلب بنجاح.');
      setEditItem(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشل التحديث.');
    }
  };

  const handleCreatePurchaseRequest = () => {
    const selectedItemsList = items.filter(i => selectedProductIds.has(i.productId) && i.suggestedOrderM2 > 0);
    if (selectedItemsList.length === 0) {
      toast.warning('اختر أصنافاً بها كميات إعادة طلب مقترحة.');
      return;
    }

    setCreatingPO(true);
    try {
      const prService = new PurchaseRequestService();
      const firstWh = selectedItemsList[0].warehouseId;
      const reqId = prService.createRequest({
        warehouseId: firstWh,
        priority: 'HIGH',
        notes: `طلب شراء آلي ناتج عن لوحة التخطيط وإعادة الطلب لعدد ${selectedItemsList.length} صنف`,
        items: selectedItemsList.map(item => ({
          productId: item.productId,
          quantityM2: item.suggestedOrderM2,
          estimatedUnitCost: item.unitCost,
          notes: `المخزون الحالي: ${quantity(item.availableStockM2, item)}، نقطة إعادة الطلب: ${quantity(item.reorderPoint, item)}`
        }))
      });

      toast.success(`تم إنشاء طلب الشراء بنجاح برقم (${reqId})`);
      setSelectedProductIds(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء طلب الشراء.');
    } finally {
      setCreatingPO(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtCur = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' ج.م';
  const quantity = (value: number, item: any) => `${fmt(value)} ${getStockQuantityLabel(item)}`;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OUT_OF_STOCK':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-700 border border-rose-300">نفد المخزون</span>;
      case 'CRITICAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">حرج (أقل من الأمان)</span>;
      case 'REORDER_NEEDED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-sky-100 text-sky-800 border border-sky-300">بلغ نقطة الطلب</span>;
      case 'OVERSTOCKED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-700 border border-purple-200">فائض عن الحد الأقصى</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">مثالي ومستقر</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black">لوحة التخطيط وإعادة الطلب (Planning & Reorder)</h1>
            <p className="text-xs text-slate-500 font-medium">مراقبة حدود الأمان ومعدل المبيعات اليومي واقتراح طلبيات الشراء آلياً</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedProductIds.size > 0 && (
            <button
              onClick={handleCreatePurchaseRequest}
              disabled={creatingPO}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50"
            >
              <ShoppingCart className="w-4 h-4" />
              إنشاء طلب شراء للمحدد ({selectedProductIds.size})
            </button>
          )}

          <button
            onClick={selectAllCritical}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
          >
            تحديد الأصناف الحرجة
          </button>

          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="p-6 pb-2 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">أصناف نفد مخزونها</div>
            <div className="text-2xl font-black text-rose-600 mt-1">{outOfStockCount}</div>
            <div className="text-[10px] text-rose-500 font-semibold mt-0.5">يتطلب توريداً عاجلاً</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">أصناف تحت حد الأمان</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{criticalCount}</div>
            <div className="text-[10px] text-amber-600 font-semibold mt-0.5">معرضة للنفاذ قريباً</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">بلغت نقطة إعادة الطلب</div>
            <div className="text-2xl font-black text-sky-600 mt-1">{reorderNeededCount}</div>
            <div className="text-[10px] text-sky-600 font-semibold mt-0.5">الوقت الأمثل للطلب</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">قيمة التوريد المقترحة</div>
            <div className="text-xl font-black text-emerald-600 mt-1">{fmtCur(totalSuggestedValue)}</div>
            <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">لتغطية الحد الأقصى</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              placeholder="بحث بالاسم، الكود، الباركود..."
              className="pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold w-56 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">جميع المخازن</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              الكل ({items.length})
            </button>
            <button
              onClick={() => setStatusFilter('OUT_OF_STOCK')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'OUT_OF_STOCK' ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'}`}
            >
              نفد ({outOfStockCount})
            </button>
            <button
              onClick={() => setStatusFilter('CRITICAL')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'CRITICAL' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'}`}
            >
              حرج ({criticalCount})
            </button>
            <button
              onClick={() => setStatusFilter('REORDER_NEEDED')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'REORDER_NEEDED' ? 'bg-sky-600 text-white' : 'text-sky-700 hover:bg-sky-50'}`}
            >
              إعادة طلب ({reorderNeededCount})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-100/70 text-[11px] font-black text-slate-500 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedProductIds.size > 0 && selectedProductIds.size === filteredItems.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedProductIds(new Set(filteredItems.map(i => i.productId)));
                      else setSelectedProductIds(new Set());
                    }}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </th>
                <th className="px-3 py-3">الصنف / الكود</th>
                <th className="px-3 py-3">المخزن</th>
                <th className="px-3 py-3 text-center">المتاح / المحجوز</th>
                <th className="px-3 py-3 text-center">قيد التوريد</th>
                <th className="px-3 py-3 text-center">سحب اليوم</th>
                <th className="px-3 py-3 text-center">أيام النفاذ</th>
                <th className="px-3 py-3 text-center">حد الأمان / نقطة الطلب</th>
                <th className="px-3 py-3 text-center">اقتراح الشراء</th>
                <th className="px-3 py-3 text-center">الحالة</th>
                <th className="px-3 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const isSelected = selectedProductIds.has(item.productId);
                return (
                  <tr key={`${item.productId}-${item.warehouseId}`} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-sky-50/40' : ''}`}>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.productId)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-black text-slate-900">{item.productName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{item.productSku} {item.categoryName ? `• ${item.categoryName}` : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 font-bold">{item.warehouseName}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="font-mono font-black text-slate-900">{quantity(item.availableStockM2, item)}</div>
                      {item.reservedStockM2 > 0 && (
                        <div className="text-[10px] text-amber-600 font-bold">محجوز: {quantity(item.reservedStockM2, item)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.onOrderStockM2 > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                          {quantity(item.onOrderStockM2, item)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-slate-600">
                      {quantity(item.dailySalesRate, item)} / يوم
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {item.stockDepletionDays <= 5 ? (
                        <span className="text-rose-600 font-black flex items-center justify-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {item.stockDepletionDays} يوم
                        </span>
                      ) : item.stockDepletionDays <= 15 ? (
                        <span className="text-amber-600 font-bold">{item.stockDepletionDays} يوم</span>
                      ) : (
                        <span className="text-slate-500">{item.stockDepletionDays === 999 ? 'مستقر' : `${item.stockDepletionDays} يوم`}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      <span className="text-slate-500 font-bold">أمان: {quantity(item.safetyStock, item)}</span>
                      <span className="text-slate-300 mx-1">|</span>
                      <span className="text-sky-600 font-black">طلب: {quantity(item.reorderPoint, item)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.suggestedOrderM2 > 0 ? (
                        <div>
                          <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            +{quantity(item.suggestedOrderM2, item)}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                            ~ {fmtCur(item.suggestedOrderValue)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs font-bold">مكتمل</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {getStatusBadge(item.stockStatus)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleEditThresholds(item)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition"
                        title="تعديل الحدود ونقاط الطلب"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    لا توجد أصناف تطابق الفلاتر الحالية
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Thresholds Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm">تعديل محددات الطلب والأمان</h3>
                <p className="text-[11px] text-slate-400">{editItem.productName} ({editItem.productSku})</p>
              </div>
              <button onClick={() => setEditItem(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveThresholds} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">نقطة إعادة الطلب ({getStockQuantityLabel(editItem)})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.reorderPoint}
                  onChange={(e) => setEditForm({ ...editForm, reorderPoint: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">كمية الأمان الاحتياطية ({getStockQuantityLabel(editItem)})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.safetyStock}
                  onChange={(e) => setEditForm({ ...editForm, safetyStock: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">مهلة التوريد المقدرة من المصنع (أيام - Lead Time)</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.leadTimeDays}
                  onChange={(e) => setEditForm({ ...editForm, leadTimeDays: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأدنى ({getStockQuantityLabel(editItem)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.minStockLevel}
                    onChange={(e) => setEditForm({ ...editForm, minStockLevel: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأقصى ({getStockQuantityLabel(editItem)})</label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={editForm.maxStockLevel}
                    onChange={(e) => setEditForm({ ...editForm, maxStockLevel: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-md shadow-sky-600/20"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
