import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { 
  TrendingDown, AlertTriangle, Package, RefreshCw, 
  Search, SlidersHorizontal, ShoppingCart, ShieldAlert, Clock, BarChart3, X
} from 'lucide-react';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { PurchaseRequestService } from '../../../services/domains/purchases/PurchaseRequestService';
import { useToast } from '../../../components/ui/Toast';
import { getStockQuantityLabel } from '../../../utils/products/productUnits';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

export const ReorderPlanningPage: React.FC = () => {
  const inventoryService = useMemo(() => new InventoryService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('inventory.reorder.manage');
  const canCreatePurchaseRequest = can('purchases.create') || canManage;

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

  const loadData = useCallback(() => {
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
  }, [inventoryService, setLoading, setWarehouses, setItems, selectedWarehouseId, search, toast]);

  useEffect(() => {
    setSelectedProductIds(new Set());
    loadData();
  }, [loadData]);

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
    if (!canCreatePurchaseRequest) return;
    if (!selectedWarehouseId) {
      toast.warning('اختر مستودعاً واحداً قبل تحديد أصناف طلب الشراء.');
      return;
    }
    const next = new Set(selectedProductIds);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    setSelectedProductIds(next);
  };

  const selectAllCritical = () => {
    if (!canCreatePurchaseRequest) return;
    if (!selectedWarehouseId) {
      toast.warning('اختر مستودعاً واحداً قبل تحديد الأصناف الحرجة.');
      return;
    }
    const criticalIds = items
      .filter(i => i.stockStatus === 'OUT_OF_STOCK' || i.stockStatus === 'CRITICAL' || i.stockStatus === 'REORDER_NEEDED')
      .map(i => i.productId);
    setSelectedProductIds(new Set(criticalIds));
  };

  const handleEditThresholds = (item: any) => {
    if (!canManage) return;
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
    if (!canManage || !editItem) return;
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
    if (!canCreatePurchaseRequest) return;
    if (!selectedWarehouseId) {
      toast.warning('اختر مستودعاً واحداً قبل إنشاء طلب الشراء.');
      return;
    }
    const selectedItemsList = items.filter(i =>
      i.warehouseId === selectedWarehouseId
      && selectedProductIds.has(i.productId)
      && i.suggestedOrderM2 > 0
    );
    if (selectedItemsList.length === 0) {
      toast.warning('اختر أصنافاً بها كميات إعادة طلب مقترحة.');
      return;
    }

    setCreatingPO(true);
    try {
      const prService = new PurchaseRequestService();
      const reqId = prService.createRequest({
        warehouseId: selectedWarehouseId,
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
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 pt-4">
        <PageHeader
          icon={<BarChart3 className="w-5 h-5" />}
          title="لوحة التخطيط وإعادة الطلب (Planning & Reorder)"
          description="مراقبة حدود الأمان ومعدل المبيعات اليومي واقتراح طلبيات الشراء آلياً"
          actions={<>
            {canCreatePurchaseRequest && selectedProductIds.size > 0 && (
              <button
                onClick={handleCreatePurchaseRequest}
                disabled={creatingPO}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" />
                إنشاء طلب شراء للمحدد ({selectedProductIds.size})
              </button>
            )}

            {canCreatePurchaseRequest && (
              <button
                onClick={selectAllCritical}
                disabled={!selectedWarehouseId}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedWarehouseId ? 'تحديد الأصناف الحرجة' : 'اختر مستودعاً أولاً'}
              </button>
            )}

            <button
              onClick={loadData}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>

      {/* KPI Cards */}
      <div className="p-6 pb-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
          <DataTable
            ariaLabel="تخطيط إعادة الطلب"
            rows={filteredItems}
            rowKey={(item: any) => `${item.productId}-${item.warehouseId}`}
            tableClassName="text-sm"
            stickyHeader
            columns={[
              {
                key: 'select',
                header: canCreatePurchaseRequest ? (
                  <input
                    type="checkbox"
                    checked={selectedProductIds.size > 0 && selectedProductIds.size === filteredItems.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedProductIds(new Set(filteredItems.map(i => i.productId)));
                      else setSelectedProductIds(new Set());
                    }}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    aria-label="تحديد الكل"
                  />
                ) : '',
                align: 'center', width: 40,
                headerClassName: 'text-center',
                render: (item: any) => {
                  const isSelected = selectedProductIds.has(item.productId);
                  return canCreatePurchaseRequest ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.productId)}
                      disabled={!selectedWarehouseId}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed"
                    />
                  ) : null;
                },
              },
              {
                key: 'product', header: 'الصنف / الكود',
                render: (item: any) => (
                  <span className="block">
                    <span className="block font-black text-slate-900">{item.productName}</span>
                    <span className="block font-mono text-[10px] text-slate-400">{item.productSku} {item.categoryName ? `• ${item.categoryName}` : ''}</span>
                  </span>
                ),
              },
              { key: 'wh', header: 'المخزن', render: (item: any) => <span className="text-xs font-bold text-slate-600">{item.warehouseName}</span> },
              {
                key: 'stock', header: 'المتاح / المحجوز', align: 'center',
                render: (item: any) => (
                  <span className="block">
                    <span className="block font-mono font-black text-slate-900">{quantity(item.availableStockM2, item)}</span>
                    {item.reservedStockM2 > 0 && <span className="block text-[10px] font-bold text-amber-600">محجوز: {quantity(item.reservedStockM2, item)}</span>}
                  </span>
                ),
              },
              {
                key: 'onorder', header: 'قيد التوريد', align: 'center',
                render: (item: any) => item.onOrderStockM2 > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-600">
                    {quantity(item.onOrderStockM2, item)}
                  </span>
                ) : <span className="text-slate-300">—</span>,
              },
              { key: 'sales', header: 'سحب اليوم', align: 'center', render: (item: any) => <span className="font-mono text-xs font-bold text-slate-600">{quantity(item.dailySalesRate, item)} / يوم</span> },
              {
                key: 'days', header: 'أيام النفاذ', align: 'center',
                render: (item: any) => item.stockDepletionDays <= 5 ? (
                  <span className="flex items-center justify-center gap-1 font-black text-rose-600">
                    <Clock className="h-3.5 w-3.5" /> {item.stockDepletionDays} يوم
                  </span>
                ) : item.stockDepletionDays <= 15 ? (
                  <span className="font-bold text-amber-600">{item.stockDepletionDays} يوم</span>
                ) : (
                  <span className="font-mono text-slate-500">{item.stockDepletionDays === 999 ? 'مستقر' : `${item.stockDepletionDays} يوم`}</span>
                ),
              },
              {
                key: 'thresholds', header: 'حد الأمان / نقطة الطلب', align: 'center',
                render: (item: any) => (
                  <span className="text-xs">
                    <span className="font-bold text-slate-500">أمان: {quantity(item.safetyStock, item)}</span>
                    <span className="mx-1 text-slate-300">|</span>
                    <span className="font-black text-sky-600">طلب: {quantity(item.reorderPoint, item)}</span>
                  </span>
                ),
              },
              {
                key: 'suggest', header: 'اقتراح الشراء', align: 'center',
                render: (item: any) => item.suggestedOrderM2 > 0 ? (
                  <span className="block">
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono font-black text-emerald-700">
                      +{quantity(item.suggestedOrderM2, item)}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
                      ~ {fmtCur(item.suggestedOrderValue)}
                    </span>
                  </span>
                ) : <span className="text-xs font-bold text-slate-300">مكتمل</span>,
              },
              { key: 'status', header: 'الحالة', align: 'center', render: (item: any) => getStatusBadge(item.stockStatus) },
              {
                key: 'actions', header: 'إجراءات', align: 'center',
                render: (item: any) => canManage ? (
                  <button onClick={() => handleEditThresholds(item)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-sky-50 hover:text-sky-600" title="تعديل الحدود ونقاط الطلب">
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                ) : null,
              },
            ]}
            rowClassName={(item: any) => `transition hover:bg-slate-50/80 ${selectedProductIds.has(item.productId) ? 'bg-sky-50/40' : ''}`}
            emptyTitle="لا توجد أصناف تطابق الفلاتر الحالية"
          />
        </div>
      </div>

      {/* Edit Thresholds Modal */}
      {canManage && editItem && (
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
                  onChange={(e) => setEditForm({ ...editForm, reorderPoint: Number.parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => setEditForm({ ...editForm, safetyStock: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">مهلة التوريد المقدرة من المصنع (أيام - Lead Time)</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.leadTimeDays}
                  onChange={(e) => setEditForm({ ...editForm, leadTimeDays: Number.parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأدنى ({getStockQuantityLabel(editItem)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.minStockLevel}
                    onChange={(e) => setEditForm({ ...editForm, minStockLevel: Number.parseFloat(e.target.value) || 0 })}
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
                    onChange={(e) => setEditForm({ ...editForm, maxStockLevel: Number.parseFloat(e.target.value) || 1 })}
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
