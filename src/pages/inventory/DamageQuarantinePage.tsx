import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, AlertTriangle, Eye, CheckCircle2, XCircle, 
  RefreshCw, Plus, Search, Filter, FileText, Check, DollarSign,
  Package, Trash2, ArrowRightCircle, Sparkles, Building2
} from 'lucide-react';
import { InventoryService } from '../../services/InventoryService';
import { ProductService } from '../../services/ProductService';
import { useToast } from '../../components/ui/Toast';
import { formatProductQuantity, getProductUnitLabel, getStockQuantityLabel } from '../../utils/productUnits';

export const DamageQuarantinePage: React.FC = () => {
  const inventoryService = new InventoryService();
  const productService = new ProductService();
  const toast = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // New Damage / Quarantine Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    warehouseId: '',
    productId: '',
    category: 'BROKEN' as 'DAMAGED' | 'BROKEN' | 'DISPLAY_SAMPLE' | 'NON_SELLABLE_RETURN' | 'QUARANTINE_INSPECTION',
    quantityM2: 0,
    notes: ''
  });

  // Inspect Modal
  const [inspectingItem, setInspectingItem] = useState<any | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');

  // Resolution Modal
  const [resolvingItem, setResolvingItem] = useState<any | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'WRITE_OFF' | 'DOWNGRADE_SALE' | 'RESTORE_TO_STOCK'>('WRITE_OFF');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const loadData = () => {
    setLoading(true);
    try {
      const whs = inventoryService.getAllWarehouses();
      setWarehouses(whs);
      if (!selectedWarehouseId && whs.length > 0) {
        setSelectedWarehouseId(whs[0].id);
      }
      setAllProducts(productService.getAllProducts());
      const specialRows = inventoryService.getSpecialStocks({
        warehouseId: selectedWarehouseId || undefined,
        category: categoryFilter,
        status: statusFilter,
        search: search || undefined
      });
      setItems(specialRows);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل سجلات التالف والحجر.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouseId, categoryFilter, statusFilter]);

  const handleOpenCreate = () => {
    setCreateForm({
      warehouseId: selectedWarehouseId || warehouses[0]?.id || '',
      productId: allProducts[0]?.id || '',
      category: 'BROKEN',
      quantityM2: 0,
      notes: ''
    });
    setShowCreateModal(true);
  };

  const handleCreateSpecial = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(createForm.quantityM2) <= 0) {
      toast.error('الكمية يجب أن تكون أكبر من صفر.');
      return;
    }
    try {
      inventoryService.recordSpecialStock({
        warehouseId: createForm.warehouseId,
        productId: createForm.productId,
        category: createForm.category,
        quantityM2: Number(createForm.quantityM2),
        notes: createForm.notes
      });
      toast.success('تم تسجيل البضاعة وعزلها عن المخزون المتاح للبيع بنجاح.');
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية.');
    }
  };

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingItem) return;
    try {
      inventoryService.inspectSpecialStock(inspectingItem.id, inspectionNotes);
      toast.success('تم توثيق تقرير الفحص الفني والجودة.');
      setInspectingItem(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ الفحص.');
    }
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingItem) return;
    try {
      inventoryService.resolveSpecialStock(resolvingItem.id, resolutionAction, resolutionNotes);
      toast.success(
        resolutionAction === 'WRITE_OFF'
          ? 'تم الإعدام المخزني وترحيل قيد الخسائر المحاسبية للأستاذ العام بنجاح.'
          : resolutionAction === 'RESTORE_TO_STOCK'
          ? 'تمت استعادة الكمية للمخزون الصالح للبيع وبناء طبقة تكلفة FIFO جديدة.'
          : 'تم تصنيف الصنف للبيع المخفض (بواقي وفرز ثاني).'
      );
      setResolvingItem(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تنفيذ الإجراء.');
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtCur = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' ج.م';

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'BROKEN':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">كسر بلاط وسيراميك</span>;
      case 'DAMAGED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">تلف عام ورطوبة</span>;
      case 'DISPLAY_SAMPLE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-sky-100 text-sky-800 border border-sky-300">عينات عرض صالة</span>;
      case 'NON_SELLABLE_RETURN':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-300">مرتجع غير صالح للبيع</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-300">تحت الفحص والحجر</span>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'RECORDED':
        return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">مسجل وبانتظار الفحص</span>;
      case 'INSPECTED':
        return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">تم الفحص الفني</span>;
      case 'WRITTEN_OFF':
        return <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-rose-100 text-rose-700">مُعدم محاسبياً (خسارة)</span>;
      case 'RESTORED_TO_STOCK':
        return <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-100 text-emerald-700">مُستعاد للصالح للبيع</span>;
      case 'DOWNGRADED_SALE':
        return <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-purple-100 text-purple-700">معروض بسعر مخفض</span>;
      default:
        return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100">{st}</span>;
    }
  };

  const totalSpecialCost = items.reduce((sum, i) => sum + (Number(i.totalCost) || 0), 0);
  const totalSpecialQtyByUnit = items.reduce((totals: Map<string, { product: any; quantity: number }>, item) => {
    const unit = getProductUnitLabel(item);
    const current = totals.get(unit) || { product: item, quantity: 0 };
    current.quantity += Number(item.quantityM2) || 0;
    totals.set(unit, current);
    return totals;
  }, new Map());
  const selectedProduct = allProducts.find((product) => product.id === createForm.productId);
  const createUnit = selectedProduct ? getStockQuantityLabel(selectedProduct) : 'م²';
  const pendingInspectionCount = items.filter(i => i.status === 'RECORDED').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black">إدارة الكسر والتالف والحجر الصحي (Damage & Quarantine)</h1>
            <p className="text-xs text-slate-500 font-medium">عزل البضائع غير الصالحة، الفحص الفني، والإعدام المخزني المحاسبي أو التخفيض</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md shadow-rose-600/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            تسجيل كسر / تالف / حجر
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
      <div className="p-6 pb-2 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">إجمالي قيمة التالف والكسر المحجوز</div>
            <div className="text-2xl font-black text-rose-600 mt-1">{fmtCur(totalSpecialCost)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">معزولة تماماً عن كميات البيع</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">إجمالي الكميات المعزولة</div>
            <div className="text-base font-black text-slate-900 mt-1">
              {[...totalSpecialQtyByUnit.values()].map((entry) => formatProductQuantity(entry.quantity, entry.product)).join('، ') || '0'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">تشمل عينات المعرض والكسر</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">سجلات بانتظار الفحص والبت</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingInspectionCount}</div>
            <div className="text-[10px] text-amber-600 font-semibold mt-0.5">تحت الفحص الفني</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Eye className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadData()}
              placeholder="بحث بالصنف، الكود، رقم السجل..."
              className="pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold w-56 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="">جميع المخازن</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">جميع التصنيفات</option>
            <option value="BROKEN">كسر بلاط وسيراميك</option>
            <option value="DAMAGED">تلف عام ورطوبة</option>
            <option value="DISPLAY_SAMPLE">عينات عرض</option>
            <option value="NON_SELLABLE_RETURN">مرتجع غير قابل للبيع</option>
            <option value="QUARANTINE_INSPECTION">تحت الفحص والحجر</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">جميع الحالات</option>
            <option value="RECORDED">مسجل بانتظار الفحص</option>
            <option value="INSPECTED">تم الفحص</option>
            <option value="WRITTEN_OFF">مُعدم محاسبياً</option>
            <option value="RESTORED_TO_STOCK">مستعاد للصالح</option>
            <option value="DOWNGRADED_SALE">معروض للبيع المخفض</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-100/70 text-[11px] font-black text-slate-500 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-3">رقم السجل / التاريخ</th>
                <th className="px-3 py-3">الصنف / الكود</th>
                <th className="px-3 py-3">المخزن</th>
                <th className="px-3 py-3 text-center">التصنيف</th>
                <th className="px-3 py-3 text-center">الكمية</th>
                <th className="px-3 py-3 text-center">التكلفة الإجمالية</th>
                <th className="px-3 py-3 text-center">الحالة</th>
                <th className="px-3 py-3">تقرير الفحص / المعالجة</th>
                <th className="px-3 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 transition">
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-black text-slate-900">{row.specialNumber}</span>
                    <span className="block text-[10px] text-slate-400 font-bold">{row.createdAt?.slice(0, 10)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-black text-slate-900">{row.productName}</div>
                    <div className="text-[10px] font-mono text-slate-400">{row.sku} {row.grade ? `• ${row.grade}` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 font-bold">{row.warehouseName}</td>
                  <td className="px-3 py-2.5 text-center">
                    {getCategoryBadge(row.category)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="font-mono font-black text-rose-700">{formatProductQuantity(Number(row.quantityM2), row)}</div>
                    {row.productType !== 'GENERAL' && <div className="text-[10px] text-slate-400 font-bold">{row.boxesCount} كرتونة</div>}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-black text-slate-900">
                    {fmtCur(row.totalCost)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {getStatusBadge(row.status)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {row.resolutionNotes ? (
                      <span className="text-slate-700 font-bold">{row.resolutionNotes}</span>
                    ) : row.inspectionNotes ? (
                      <span className="text-blue-700 font-medium">فحص: {row.inspectionNotes}</span>
                    ) : (
                      <span className="text-slate-300 italic">بانتظار المعاينة الفنية</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {row.status === 'RECORDED' && (
                        <button
                          onClick={() => {
                            setInspectingItem(row);
                            setInspectionNotes(row.inspectionNotes || '');
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                          title="توثيق تقرير الفحص"
                        >
                          فحص
                        </button>
                      )}

                      {!['WRITTEN_OFF', 'RESTORED_TO_STOCK'].includes(row.status) && (
                        <button
                          onClick={() => {
                            setResolvingItem(row);
                            setResolutionNotes('');
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                          title="إعدام / بيع مخفض / استعادة"
                        >
                          معالجة
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30 text-rose-500" />
                    لا توجد سجلات تالف أو حجر تطابق البحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Damage / Quarantine Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-150">
            <h3 className="font-black text-slate-900 text-sm mb-3">تسجيل بضاعة تالفة / كسر / حجر صحي</h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم خصم الكمية فوراً من الرصيد الصالح للبيع لحماية طلبيات العملاء، وتسجيل حركة خروج غير قابلة للمحو.
            </p>

            <form onSubmit={handleCreateSpecial} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">المستودع المصدر</label>
                <select
                  value={createForm.warehouseId}
                  onChange={(e) => setCreateForm({ ...createForm, warehouseId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الصنف</label>
                <select
                  value={createForm.productId}
                  onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                >
                  {allProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">التصنيف والسبب</label>
                <select
                  value={createForm.category}
                  onChange={(e: any) => setCreateForm({ ...createForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                >
                  <option value="BROKEN">كسر بلاط وسيراميك (أثناء التعتيق / النقل)</option>
                  <option value="DAMAGED">تلف عام ورطوبة وسوء تخزين</option>
                  <option value="DISPLAY_SAMPLE">سحب كعينات عرض لصالة المعرض</option>
                  <option value="NON_SELLABLE_RETURN">مرتجع من عميل غير قابل للبيع</option>
                  <option value="QUARANTINE_INSPECTION">حجز صحي وتحت فحص الجودة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الكمية المراد عزلها ({createUnit})</label>
                <input
                  type="number"
                  min="0.1"
                  step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit) ? 1 : 0.01}
                  value={createForm.quantityM2}
                  onChange={(e) => setCreateForm({ ...createForm, quantityM2: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات وسبب التلف</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="سقوط طبلية أثناء التحميل بالرافعة..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md shadow-rose-600/20"
                >
                  عزل وتوثيق في الدفتر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <h3 className="font-black text-slate-900 text-sm mb-2">فحص ومعاينة البضاعة المعزولة</h3>
            <p className="text-xs text-slate-500 mb-4">{inspectingItem.productName} ({formatProductQuantity(Number(inspectingItem.quantityM2), inspectingItem)})</p>

            <form onSubmit={handleInspectSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تقرير الفحص الفني والملاحظات</label>
                <textarea
                  rows={4}
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder="تمت معاينة البلاط: الشروخ في الحواف فقط، غير صالحة للبيع كفرز أول ولكن يمكن بيعها بخصم 40%..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md shadow-blue-600/20"
                >
                  تأكيد الفحص
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      {resolvingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <h3 className="font-black text-slate-900 text-sm mb-2">معالجة واتخاذ قرار بشأن التالف</h3>
            <p className="text-xs text-slate-500 mb-4">{resolvingItem.productName} ({formatProductQuantity(Number(resolvingItem.quantityM2), resolvingItem)} - بقيمة {fmtCur(resolvingItem.totalCost)})</p>

            <form onSubmit={handleResolveSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">القرار المتخذ</label>
                <select
                  value={resolutionAction}
                  onChange={(e: any) => setResolutionAction(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="WRITE_OFF">إعدام مخزني محاسبي (تسجيل خسائر تلف في الأستاذ العام)</option>
                  <option value="RESTORE_TO_STOCK">إعادة للمخزون الصالح (تبين سلامة البضاعة بعد الفحص)</option>
                  <option value="DOWNGRADE_SALE">تصنيف للبيع المخفض (فرز ثاني / عروض بواقي)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">مبررات القرار والملاحظات</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="اعتماد محضر إعدام رقم..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setResolvingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black"
                >
                  تنفيذ القرار وترحيل القيود
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
