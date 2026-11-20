import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
import { 
  Barcode, Plus, Search, RefreshCw, Printer, 
  Eye, Edit3, Trash2, X
} from 'lucide-react';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { useToast } from '../../../components/ui/Toast';
import { ProductPicker } from '../../../components/products/ProductPicker';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { usePermission } from '../../../hooks/domains/auth/usePermission';

export const WarehouseLocationsPage: React.FC = () => {
  const inventoryService = useMemo(() => new InventoryService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const toast = useToast();
  const canManage = usePermission()('inventory.locations.manage');

  const [locations, setLocations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal create/edit location
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    warehouseId: '',
    zone: 'A',
    aisle: '01',
    shelf: '01',
    bin: '01',
    barcode: '',
    maxCapacityM2: 500,
    notes: ''
  });

  // Modal view location items
  const [viewingLocation, setViewingLocation] = useState<any | null>(null);
  const [locationProducts, setLocationProducts] = useState<any[]>([]);

  // Assign product stock modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ productId: '', quantityM2: 0 });

  // Print barcode label modal
  const [printLocation, setPrintLocation] = useState<any | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);
      if (!selectedWarehouseId && whs.length > 0) {
        setSelectedWarehouseId(whs[0].id);
      }
      const locs = inventoryService.getWarehouseLocations(
        selectedWarehouseId || undefined,
        search || undefined
      );
      setLocations(locs);
      setAllProducts(productService.getAllProducts());
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل مواقع المستودع.');
    } finally {
      setLoading(false);
    }
  }, [inventoryService, productService, setLoading, setWarehouses, setSelectedWarehouseId, setLocations, setAllProducts, toast, selectedWarehouseId, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    if (!canManage) return;
    setEditingLocation(null);
    setFormData({
      warehouseId: selectedWarehouseId || warehouses[0]?.id || '',
      zone: 'A',
      aisle: '01',
      shelf: '01',
      bin: '01',
      barcode: '',
      maxCapacityM2: 500,
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (loc: any) => {
    if (!canManage) return;
    setEditingLocation(loc);
    setFormData({
      warehouseId: loc.warehouseId,
      zone: loc.zone,
      aisle: loc.aisle,
      shelf: loc.shelf,
      bin: loc.bin,
      barcode: loc.barcode,
      maxCapacityM2: loc.maxCapacityM2,
      notes: loc.notes || ''
    });
    setShowModal(true);
  };

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      if (editingLocation) {
        inventoryService.updateWarehouseLocation(editingLocation.id, formData);
        toast.success('تم تحديث موقع التخزين بنجاح.');
      } else {
        inventoryService.createWarehouseLocation(formData);
        toast.success('تمت إضافة موقع تخزين جديد بنجاح.');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const handleDeleteLocation = (id: string) => {
    if (!canManage) return;
    if (!confirm('هل تريد حذف موقع التخزين هذا؟')) return;
    try {
      inventoryService.deleteWarehouseLocation(id);
      toast.success('تم حذف موقع التخزين.');
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر الحذف.');
    }
  };

  const handleViewProducts = (loc: any) => {
    setViewingLocation(loc);
    try {
      const prods = inventoryService.getLocationProducts(loc.id);
      setLocationProducts(prods);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحميل أصناف الموقع.');
    }
  };

  const handleAssignStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!viewingLocation || !assignForm.productId) return;
    try {
      inventoryService.assignProductLocation(viewingLocation.id, assignForm.productId, Number(assignForm.quantityM2));
      toast.success('تم تعيين رصيد الصنف في الموقع بنجاح.');
      setShowAssignModal(false);
      setAssignForm({ productId: '', quantityM2: 0 });
      handleViewProducts(viewingLocation);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تعيين الصنف.');
    }
  };

  const handlePrint = (loc: any) => {
    setPrintLocation(loc);
  };

  const triggerBrowserPrint = () => {
    window.print();
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(Number(n) || 0);

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<Barcode className="w-5 h-5" />}
          title="مواقع الرفوف والباركود الداخلي (Warehouse Locations & Bins)"
          description="إدارة ممرات ورفوف وخانات التخزين وتوليد ملصقات الباركود الداخلية"
          actions={<>
            {canManage && (
              <ActivityGate element="new-location"><button
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                إضافة موقع تخزين
              </button></ActivityGate>
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

      {/* Filters bar */}
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-surface border-b border-line">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              placeholder="بحث بالباركود، الممر، الرف..."
              className="pr-9 pl-3 py-1.5 bg-surface-muted border border-line rounded-xl text-xs font-bold w-56 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">جميع المخازن</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <span className="text-xs text-muted font-bold">
            عدد المواقع: {locations.length}
          </span>
        </div>
      </div>

      {/* Locations Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {locations.map((loc) => {
            const occupied = Number(loc.currentOccupiedM2 || 0);
            const capacity = Number(loc.maxCapacityM2 || 1);
            const percent = Math.min(100, Math.round((occupied / capacity) * 100));

            return (
              <div 
                key={loc.id}
                className="bg-surface border border-line rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted">{loc.warehouseName}</span>
                    <button
                      onClick={() => handlePrint(loc)}
                      className="p-1 rounded-lg text-muted hover:text-primary hover:bg-accent-soft transition"
                      title="طباعة ملصق الباركود"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Hierarchical Location Code */}
                  <div className="mt-2 flex items-center gap-1.5 font-mono text-sm font-black text-ink bg-surface-muted border border-line px-3 py-2 rounded-xl">
                    <span className="text-primary">منطقة {loc.zone}</span>
                    <span className="text-muted">/</span>
                    <span>ممر {loc.aisle}</span>
                    <span className="text-muted">/</span>
                    <span>رف {loc.shelf}</span>
                    <span className="text-muted">/</span>
                    <span className="text-success">خانة {loc.bin}</span>
                  </div>

                  {/* Barcode display */}
                  <div className="mt-2 text-center py-2 bg-surface-muted/60 rounded-xl border border-dashed border-line">
                    <div className="font-mono text-xs font-black tracking-widest text-ink">{loc.barcode}</div>
                    <div className="text-[10px] text-muted font-bold mt-0.5">جاهز للمسح الضوئي (Barcode)</div>
                  </div>

                  {/* Capacity Bar */}
                  <div className="mt-4">
                    {Number(loc.generalProductsCount || 0) > 0 ? (
                      <div className="text-xs font-bold text-muted">توجد أصناف بوحدات مختلفة؛ لا يُحسب إشغالها بالمتر المربع.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted font-bold">إشغال مخزون السيراميك</span>
                          <span className="font-mono font-black text-ink">{percent}% ({fmt(occupied)} / {fmt(capacity)} م²)</span>
                        </div>
                        <div className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${percent > 90 ? 'bg-danger' : percent > 70 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {loc.notes && (
                    <div className="mt-2 text-[11px] text-muted bg-surface-muted p-2 rounded-lg">
                      {loc.notes}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  <button
                    onClick={() => handleViewProducts(loc)}
                    className="flex items-center gap-1 text-xs font-black text-primary hover:text-primary transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    عرض البضائع ({loc.productsCount || 0})
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(loc)}
                        className="p-1 rounded-lg text-muted hover:text-primary hover:bg-accent-soft transition"
                        title="تعديل الموقع"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteLocation(loc.id)}
                        className="p-1 rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition"
                        title="حذف الموقع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {locations.length === 0 && (
            <div className="col-span-full py-16 text-center text-muted">
              <Barcode className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
              <div className="font-bold text-sm">لا توجد مواقع مسجلة في هذا المستودع</div>
              <p className="text-xs text-muted mt-1">أضف مناطق وممرات لتسهيل تتبع الباركود وسرعة التجهيز</p>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Location Modal */}
      {canManage && showModal && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-md shadow-2xl border border-line animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-black text-ink text-sm">
                {editingLocation ? 'تعديل موقع التخزين' : 'إضافة موقع تخزين جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-muted hover:bg-surface-sunken">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">المستودع</label>
                <select
                  disabled={Boolean(editingLocation)}
                  value={formData.warehouseId}
                  onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                  required
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">المنطقة (Zone)</label>
                  <input
                    type="text"
                    value={formData.zone}
                    onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                    placeholder="مثال: A"
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الممر (Aisle)</label>
                  <input
                    type="text"
                    value={formData.aisle}
                    onChange={(e) => setFormData({ ...formData, aisle: e.target.value })}
                    placeholder="مثال: 01"
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الرف (Shelf)</label>
                  <input
                    type="text"
                    value={formData.shelf}
                    onChange={(e) => setFormData({ ...formData, shelf: e.target.value })}
                    placeholder="مثال: 01"
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الخانة / الباكية (Bin)</label>
                  <input
                    type="text"
                    value={formData.bin}
                    onChange={(e) => setFormData({ ...formData, bin: e.target.value })}
                    placeholder="مثال: 01"
                    className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">رمز الباركود (اختياري - يولد آلياً إذا ترك فارغاً)</label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="WH-A-01-01-01"
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">السعة القصوى الاستيعابية (م²)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxCapacityM2}
                  onChange={(e) => setFormData({ ...formData, maxCapacityM2: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">ملاحظات / وصف الموقع</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="ركن الرخام الفاخر"
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink-secondary hover:bg-surface-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20"
                >
                  حفظ الموقع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Stored Products Modal */}
      {viewingLocation && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-line animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="font-black text-ink text-sm">البضائع المخزنة في الموقع</h3>
                <p className="text-[11px] text-muted font-mono">
                  {viewingLocation.warehouseName} • {viewingLocation.barcode} (منطقة {viewingLocation.zone} - ممر {viewingLocation.aisle} - رف {viewingLocation.shelf} - خانة {viewingLocation.bin})
                </p>
              </div>
              <button onClick={() => setViewingLocation(null)} className="p-1 rounded-lg text-muted hover:bg-surface-sunken">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-4 flex justify-between items-center">
              <span className="text-xs font-bold text-ink-secondary">الأصناف الموجودة حالياً:</span>
              {canManage && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black"
                >
                  <Plus className="w-3.5 h-3.5" />
                  تسكين صنف في هذا الرف
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
              <DataTable
                  ariaLabel="أصناف موقع التخزين"
                  rows={locationProducts}
                  rowKey={(p: any) => String(p.id)}
                  dense
                  tableClassName="text-sm"
                  columns={[
                    { key: 'name', header: 'الصنف', render: (p: any) => <span className="font-bold text-ink">{p.productName}</span> },
                    { key: 'sku', header: 'الكود', render: (p: any) => <span className="font-mono text-xs text-muted">{p.sku}</span> },
                    { key: 'qty', header: 'الكمية المسكنة', align: 'center', render: (p: any) => <span className="font-mono font-black text-primary">{formatProductQuantity(p.quantityM2, p)}</span> },
                    { key: 'updated', header: 'آخر تحديث', align: 'center', render: (p: any) => <span className="text-[10px] text-muted">{p.lastMovedAt?.slice(0, 10)}</span> },
                    {
                      key: 'actions', header: 'إجراءات', align: 'center',
                      render: (p: any) => canManage ? (
                        <button
                          onClick={() => {
                            if (confirm(`هل تريد إزالة الصنف ${p.productName} من هذا الرف؟`)) {
                              inventoryService.assignProductLocation(viewingLocation.id, p.productId, 0);
                              handleViewProducts(viewingLocation);
                              loadData();
                            }
                          }}
                          className="text-xs font-bold text-danger hover:underline"
                        >
                          تفريغ
                        </button>
                      ) : null,
                    },
                  ]}
                  emptyTitle="الرف فارغ حالياً، لم يتم تسكين أي بضائع به"
                />
            </div>

            <div className="mt-4 pt-3 border-t border-line flex justify-end">
              <button
                onClick={() => setViewingLocation(null)}
                className="px-4 py-2 rounded-xl bg-surface-sunken hover:bg-surface-sunken text-xs font-bold text-ink"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Stock Modal */}
      {canManage && showAssignModal && viewingLocation && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-md shadow-2xl border border-line animate-in fade-in zoom-in duration-150">
            <h3 className="font-black text-ink text-sm mb-3">تسكين صنف في الرف</h3>
            <form onSubmit={handleAssignStock} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">اختر الصنف</label>
                <ProductPicker
                  value={assignForm.productId}
                  selectedLabel={allProducts.find((product) => product.id === assignForm.productId)?.name}
                  ariaLabel="استعراض أصناف تسكين الرف"
                  required
                  onChange={(productId) => setAssignForm({ ...assignForm, productId })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">الكمية المسكنة في هذا الرف ({allProducts.find((product) => product.id === assignForm.productId) ? getProductUnitLabel(allProducts.find((product) => product.id === assignForm.productId)!) : 'الوحدة'})</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={assignForm.quantityM2}
                  onChange={(e) => setAssignForm({ ...assignForm, quantityM2: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-surface-muted border border-line rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink-secondary hover:bg-surface-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20"
                >
                  تأكيد التسكين
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Barcode Label Modal */}
      {printLocation && (
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-line text-center">
            <h3 className="font-black text-ink text-sm mb-4">معاينة ملصق باركود الرف</h3>

            {/* Printable Label Preview Box */}
            <div id="printable-shelf-label" className="border-2 border-dashed border-line-strong p-6 rounded-2xl bg-surface mb-6">
              <div className="text-xs font-bold text-muted">{printLocation.warehouseName}</div>
              <div className="text-xl font-black text-ink mt-1">
                منطقة {printLocation.zone} - ممر {printLocation.aisle}
              </div>
              <div className="text-base font-black text-primary">
                رف {printLocation.shelf} / خانة {printLocation.bin}
              </div>

              {/* Barcode visual representation */}
              <div className="my-4 py-2 bg-surface-sunken rounded-lg">
                <div className="font-mono text-2xl tracking-[0.3em] font-black text-ink">
                  ||| | |||| | ||||| | ||
                </div>
                <div className="font-mono text-xs font-black tracking-widest text-ink mt-1">
                  {printLocation.barcode}
                </div>
              </div>

              <div className="text-[10px] text-muted">سيراميسيس • ملصق موقع الرف</div>
            </div>

            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setPrintLocation(null)}
                className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-ink-secondary hover:bg-surface-muted"
              >
                إغلاق
              </button>
              <button
                onClick={triggerBrowserPrint}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-black shadow-md shadow-primary/20"
              >
                <Printer className="w-4 h-4" />
                طباعة الملصق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
