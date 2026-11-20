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
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-danger-soft text-danger border border-danger">نفد المخزون</span>;
      case 'CRITICAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-warning-soft text-warning border border-warning">حرج (أقل من الأمان)</span>;
      case 'REORDER_NEEDED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-accent-soft text-primary border border-accent-border">بلغ نقطة الطلب</span>;
      case 'OVERSTOCKED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-accent-soft text-primary border border-accent-border">فائض عن الحد الأقصى</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-success-soft text-success border border-success-border">مثالي ومستقر</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<BarChart3 className="w-5 h-5" />}
          title="لوحة التخطيط وإعادة الطلب (Planning & Reorder)"
          description="مراقبة حدود الأمان ومعدل المبيعات اليومي واقتراح طلبيات الشراء آلياً"
          actions={<>
            {canCreatePurchaseRequest && selectedProductIds.size > 0 && (
              <button
                onClick={handleCreatePurchaseRequest}
                disabled={creatingPO}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success hover:bg-success text-white text-xs font-black shadow-md shadow-success/20 transition active:scale-95 disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" />
                إنشاء طلب شراء للمحدد ({selectedProductIds.size})
              </button>
            )}

            {canCreatePurchaseRequest && (
              <button
                onClick={selectAllCritical}
                disabled={!selectedWarehouseId}
                className="px-3 py-2 rounded-xl border border-line bg-surface hover:bg-surface-muted text-ink text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedWarehouseId ? 'تحديد الأصناف الحرجة' : 'اختر مستودعاً أولاً'}
              </button>
            )}

            <button
              onClick={loadData}
              className="p-2 rounded-xl border border-line bg-surface hover:bg-surface-muted text-ink-secondary transition"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>}
        />
      </div>

      {/* KPI Cards */}
      <div className="p-6 pb-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-danger-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-muted">أصناف نفد مخزونها</div>
            <div className="text-2xl font-black text-danger mt-1">{outOfStockCount}</div>
            <div className="text-[10px] text-danger font-semibold mt-0.5">يتطلب توريداً عاجلاً</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-danger-soft border border-danger-border flex items-center justify-center text-danger">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface border border-warning-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-muted">أصناف تحت حد الأمان</div>
            <div className="text-2xl font-black text-warning mt-1">{criticalCount}</div>
            <div className="text-[10px] text-warning font-semibold mt-0.5">معرضة للنفاذ قريباً</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warning-soft border border-warning-border flex items-center justify-center text-warning">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface border border-accent-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-muted">بلغت نقطة إعادة الطلب</div>
            <div className="text-2xl font-black text-primary mt-1">{reorderNeededCount}</div>
            <div className="text-[10px] text-primary font-semibold mt-0.5">الوقت الأمثل للطلب</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-soft border border-accent-border flex items-center justify-center text-primary">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface border border-success-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-muted">قيمة التوريد المقترحة</div>
            <div className="text-xl font-black text-success mt-1">{fmtCur(totalSuggestedValue)}</div>
            <div className="text-[10px] text-success font-semibold mt-0.5">لتغطية الحد الأقصى</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-soft border border-success-border flex items-center justify-center text-success">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-surface-muted">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              placeholder="بحث بالاسم، الكود، الباركود..."
              className="pr-9 pl-3 py-1.5 bg-surface border border-line rounded-xl text-xs font-bold w-56 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-surface border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">جميع المخازن</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-surface border border-line rounded-xl p-1 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'ALL' ? 'bg-primary text-white' : 'text-ink-secondary hover:bg-surface-sunken'}`}
            >
              الكل ({items.length})
            </button>
            <button
              onClick={() => setStatusFilter('OUT_OF_STOCK')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'OUT_OF_STOCK' ? 'bg-danger text-white' : 'text-danger hover:bg-danger-soft'}`}
            >
              نفد ({outOfStockCount})
            </button>
            <button
              onClick={() => setStatusFilter('CRITICAL')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'CRITICAL' ? 'bg-warning text-white' : 'text-warning hover:bg-warning-soft'}`}
            >
              حرج ({criticalCount})
            </button>
            <button
              onClick={() => setStatusFilter('REORDER_NEEDED')}
              className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'REORDER_NEEDED' ? 'bg-primary text-white' : 'text-primary hover:bg-accent-soft'}`}
            >
              إعادة طلب ({reorderNeededCount})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
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
                    className="rounded border-line-strong text-primary focus:ring-primary"
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
                      className="rounded border-line-strong text-primary focus:ring-primary disabled:cursor-not-allowed"
                    />
                  ) : null;
                },
              },
              {
                key: 'product', header: 'الصنف / الكود',
                render: (item: any) => (
                  <span className="block">
                    <span className="block font-black text-ink">{item.productName}</span>
                    <span className="block font-mono text-[10px] text-muted">{item.productSku} {item.categoryName ? `• ${item.categoryName}` : ''}</span>
                  </span>
                ),
              },
              { key: 'wh', header: 'المخزن', render: (item: any) => <span className="text-xs font-bold text-ink-secondary">{item.warehouseName}</span> },
              {
                key: 'stock', header: 'المتاح / المحجوز', align: 'center',
                render: (item: any) => (
                  <span className="block">
                    <span className="block font-mono font-black text-ink">{quantity(item.availableStockM2, item)}</span>
                    {item.reservedStockM2 > 0 && <span className="block text-[10px] font-bold text-warning">محجوز: {quantity(item.reservedStockM2, item)}</span>}
                  </span>
                ),
              },
              {
                key: 'onorder', header: 'قيد التوريد', align: 'center',
                render: (item: any) => item.onOrderStockM2 > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-accent-border bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-primary">
                    {quantity(item.onOrderStockM2, item)}
                  </span>
                ) : <span className="text-muted">—</span>,
              },
              { key: 'sales', header: 'سحب اليوم', align: 'center', render: (item: any) => <span className="font-mono text-xs font-bold text-ink-secondary">{quantity(item.dailySalesRate, item)} / يوم</span> },
              {
                key: 'days', header: 'أيام النفاذ', align: 'center',
                render: (item: any) => item.stockDepletionDays <= 5 ? (
                  <span className="flex items-center justify-center gap-1 font-black text-danger">
                    <Clock className="h-3.5 w-3.5" /> {item.stockDepletionDays} يوم
                  </span>
                ) : item.stockDepletionDays <= 15 ? (
                  <span className="font-bold text-warning">{item.stockDepletionDays} يوم</span>
                ) : (
                  <span className="font-mono text-muted">{item.stockDepletionDays === 999 ? 'مستقر' : `${item.stockDepletionDays} يوم`}</span>
                ),
              },
              {
                key: 'thresholds', header: 'حد الأمان / نقطة الطلب', align: 'center',
                render: (item: any) => (
                  <span className="text-xs">
                    <span className="font-bold text-muted">أمان: {quantity(item.safetyStock, item)}</span>
                    <span className="mx-1 text-muted">|</span>
                    <span className="font-black text-primary">طلب: {quantity(item.reorderPoint, item)}</span>
                  </span>
                ),
              },
              {
                key: 'suggest', header: 'اقتراح الشراء', align: 'center',
                render: (item: any) => item.suggestedOrderM2 > 0 ? (
                  <span className="block">
                    <span className="rounded-lg border border-success-border bg-success-soft px-2 py-0.5 font-mono font-black text-success">
                      +{quantity(item.suggestedOrderM2, item)}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-muted">
                      ~ {fmtCur(item.suggestedOrderValue)}
                    </span>
                  </span>
                ) : <span className="text-xs font-bold text-muted">مكتمل</span>,
              },
              { key: 'status', header: 'الحالة', align: 'center', render: (item: any) => getStatusBadge(item.stockStatus) },
              {
                key: 'actions', header: 'إجراءات', align: 'center',
                render: (item: any) => canManage ? (
                  <button onClick={() => handleEditThresholds(item)} className="rounded-lg p-1.5 text-muted transition hover:bg-accent-soft hover:text-primary" title="تعديل الحدود ونقاط الطلب">
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                ) : null,
              },
            ]}
            rowClassName={(item: any) => `transition hover:bg-surface-muted/80 ${selectedProductIds.has(item.productId) ? 'bg-accent-soft/40' : ''}`}
            emptyTitle="لا توجد أصناف تطابق الفلاتر الحالية"
          />
        </div>
      </div>

      {/* Edit Thresholds Modal */}
      {canManage && editItem && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-md shadow-2xl border border-line animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="font-black text-ink text-sm">تعديل محددات الطلب والأمان</h3>
                <p className="text-[11px] text-muted">{editItem.productName} ({editItem.productSku})</p>
              </div>
              <button onClick={() => setEditItem(null)} className="p-1 rounded-lg text-muted hover:bg-surface-sunken">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveThresholds} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">نقطة إعادة الطلب ({getStockQuantityLabel(editItem)})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.reorderPoint}
                  onChange={(e) => setEditForm({ ...editForm, reorderPoint: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">كمية الأمان الاحتياطية ({getStockQuantityLabel(editItem)})</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.safetyStock}
                  onChange={(e) => setEditForm({ ...editForm, safetyStock: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">مهلة التوريد المقدرة من المصنع (أيام - Lead Time)</label>
                <input
                  type="number"
                  min="1"
                  value={editForm.leadTimeDays}
                  onChange={(e) => setEditForm({ ...editForm, leadTimeDays: Number.parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الحد الأدنى ({getStockQuantityLabel(editItem)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.minStockLevel}
                    onChange={(e) => setEditForm({ ...editForm, minStockLevel: Number.parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الحد الأقصى ({getStockQuantityLabel(editItem)})</label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={editForm.maxStockLevel}
                    onChange={(e) => setEditForm({ ...editForm, maxStockLevel: Number.parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink-secondary hover:bg-surface-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20"
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
