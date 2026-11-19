import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ClipboardList, Plus, Search, FileText, Loader2, X, Trash2,
  XCircle, Truck, FileSpreadsheet, Sparkles, CheckCircle2
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PurchaseRequestService, PurchaseRequest, PurchaseRequestStatus, RequestPriority } from '../../../services/domains/purchases/PurchaseRequestService';
import { ProcurementService, ReorderSuggestion } from '../../../services/domains/procurement/ProcurementService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { ProductPicker } from '../../../components/products/ProductPicker';
import { OperationsService } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useNavigate } from 'react-router-dom';
import { Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';

import { useToast } from '../../../components/ui/Toast';
import { DataTable } from '../../../components/ui/DataTable';
const STATUS_LABELS: Record<PurchaseRequestStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الاعتماد', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  APPROVED: { label: 'تمت الموافقة', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  REJECTED: { label: 'مرفوض', color: 'bg-rose-50 text-rose-600 border-rose-200' },
  ORDERED: { label: 'تم عمل أمر الشراء', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-slate-100 text-slate-400 border-slate-200' },
};

const PRIORITY_LABELS: Record<RequestPriority, { label: string; color: string }> = {
  LOW: { label: 'منخفضة', color: 'text-slate-500' },
  NORMAL: { label: 'عادية', color: 'text-sky-600' },
  HIGH: { label: 'عالية', color: 'text-amber-600' },
  URGENT: { label: 'عاجلة', color: 'text-rose-600' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n) + ' ج.م';

type Line = { productId: string; quantityM2: number; estimatedUnitCost: number; notes: string };

export const PurchaseRequestsPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new PurchaseRequestService(), []);
  const procurementService = new ProcurementService();
  const navigate = useNavigate();

  const currentUser = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(currentUser, 'ui.purchases.requests.create');
  const canApprove = PermissionService.can(currentUser, 'ui.purchases.requests.approve');
  const canReject = PermissionService.can(currentUser, 'ui.purchases.requests.reject');
  const canCancelRequest = PermissionService.can(currentUser, 'ui.purchases.requests.cancel_request');

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseRequestStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // New Request Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantityM2: 0, estimatedUnitCost: 0, notes: '' }]);

  // Reorder Suggestions Modal
  const [suggestionsModal, setSuggestionsModal] = useState(false);
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    (async () => {
      try {
        setRequests(await service.getRequestsAsync(search, statusFilter));
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'تعذر تحميل طلبات الشراء.');
      } finally {
        setLoading(false);
      }
    })();
  }, [service, setLoading, setRequests, setError, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetails = async (r: PurchaseRequest) => {
    if (expanded === r.id) {
      setExpanded(null);
      return;
    }
    setExpanded(r.id);
    setItemsLoading(true);
    try {
      setItems(await service.getItemsAsync(r.id));
    } catch (e: any) {
      toast.warning(e?.message);
    } finally {
      setItemsLoading(false);
    }
  };

  const openModal = () => {
    (async () => {
      try {
        setProducts(await new ProductService().getAllProductsAsync());
        setWarehouses(new OperationsService().getWarehouses().map((w) => ({ id: w.id, name: w.name })));
        setWarehouseId('');
        setNeededBy('');
        setPriority('NORMAL');
        setNotes('');
        setLines([{ productId: '', quantityM2: 0, estimatedUnitCost: 0, notes: '' }]);
        setModalOpen(true);
      } catch (e: any) {
        toast.warning(e?.message);
      }
    })();
  };

  const openReorderSuggestions = () => {
    try {
      const list = procurementService.getReorderSuggestions();
      setSuggestions(list);
      setSuggestionsModal(true);
    } catch (e: any) {
      toast.warning(e?.message);
    }
  };

  const importReorderSuggestions = (selectedItems: ReorderSuggestion[]) => {
    try {
      setProducts(new ProductService().getAllProducts());
      setWarehouses(new OperationsService().getWarehouses().map((w) => ({ id: w.id, name: w.name })));
      setWarehouseId('');
      setNeededBy('');
      setPriority('HIGH');
      setNotes('طلب توريد تلقائي بناءً على الوصول لحد إعادة الطلب / نقص المخزون');
      setLines(
        selectedItems.map((s) => ({
          productId: s.productId,
          quantityM2: s.suggestedQuantity,
          estimatedUnitCost: s.unitCost,
          notes: `رصيد حالي: ${s.currentStock} ${s.unit} - حد أدنى: ${s.minStockLevel} ${s.unit}`,
        }))
      );
      setSuggestionsModal(false);
      setModalOpen(true);
    } catch (e: any) {
      toast.warning(e?.message);
    }
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(idx, { productId, estimatedUnitCost: p ? p.costPrice : 0 });
  };

  const estimated = lines.reduce((s, l) => s + l.quantityM2 * l.estimatedUnitCost, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = lines.filter((l) => l.productId && l.quantityM2 > 0);
    if (payload.length === 0) return toast.warning('أضف صنفاً واحداً على الأقل.');
    setSaving(true);
    try {
      service.createRequest({
        warehouseId: warehouseId || undefined,
        neededBy: neededBy || undefined,
        priority,
        notes: notes || undefined,
        items: payload,
      });
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تقديم الطلب.');
    } finally {
      setSaving(false);
    }
  };

  const decide = (r: PurchaseRequest, status: 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED') => {
    const isLevel2 = (r.estimatedTotal || 0) >= 25000;
    const text =
      status === 'REJECTED'
        ? 'رفض'
        : status === 'ORDERED'
          ? 'تحويل لأمر شراء'
          : status === 'CANCELLED'
            ? 'إلغاء'
            : isLevel2
              ? 'اعتماد (مستوى 2 - إدارة عليا)'
              : 'اعتماد (مستوى 1)';

    if (!confirm(`${text} الطلب ${r.requestNumber}؟ (القيمة التقديرية: ${fmt(r.estimatedTotal || 0)})`)) return;
    try {
      service.decide(r.id, status);
      load();
    } catch (e: any) {
      toast.warning(e?.message);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 pt-4">
        <PageHeader
          icon={<ClipboardList className="w-5 h-5" />}
          title="طلبات الشراء والتوريد الداخلي"
          description="اقتراحات حد إعادة الطلب، طلبات التوريد، والاعتماد المتدرج حسب القيمة المالية"
          actions={<>
            {canCreate && (
              <button
                onClick={openReorderSuggestions}
                className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition"
              >
                <Sparkles className="w-4 h-4 text-amber-600" /> اقتراحات حد إعادة الطلب
              </button>
            )}
            {canCreate && (
              <button
                onClick={openModal}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition shrink-0"
              >
                <Plus className="w-4 h-4" /> طلب توريد جديد
              </button>
            )}
          </>}
        />
      </div>

      {/* Filter bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو مقدم الطلب ثم اضغط إدخال..."
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400"
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Requests Table */}
      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <>
                        <DataTable
                          ariaLabel="طلبات الشراء"
                          rows={requests}
                          rowKey={(req) => req.id}
                          minWidth={900}
                          columns={[
                            { key: 'code', header: 'كود الطلب', render: (req) => <span className="font-mono text-orange-600 font-bold">{req.requestNumber}</span> },
                            { key: 'date', header: 'تاريخ الطلب', render: (req) => <span className="text-slate-500">{req.date}</span> },
                            { key: 'requester', header: 'مقدم الطلب', render: (req) => <span className="text-slate-900 font-medium">{req.requesterName || '—'}</span> },
                            { key: 'warehouse', header: 'المخزن', render: (req) => <span className="text-slate-600">{req.warehouseName || '—'}</span> },
                            { key: 'items', header: 'الأصناف', render: (req) => <span className="text-slate-700 font-bold">{req.itemsCount || 0} أصناف</span> },
                            { key: 'total', header: 'القيمة التقديرية', render: (req) => <span className="font-mono font-bold text-slate-800">{fmt(Number(req.estimatedTotal || 0))}</span> },
                            {
                              key: 'level', header: 'مستوى الاعتماد',
                              render: (req) => {
                                const isLevel2 = (req.estimatedTotal || 0) >= 25000;
                                return (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${isLevel2 ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                    {isLevel2 ? 'مستوى 2 (إدارة مالية)' : 'مستوى 1 (مباشر)'}
                                  </span>
                                );
                              },
                            },
                            {
                              key: 'priority', header: 'الأولوية',
                              render: (req) => {
                                const pr = PRIORITY_LABELS[req.priority] || { label: req.priority, color: 'text-slate-500' };
                                return <span className={`font-bold ${pr.color}`}>{pr.label}</span>;
                              },
                            },
                            {
                              key: 'status', header: 'الحالة',
                              render: (req) => {
                                const st = STATUS_LABELS[req.status] || { label: req.status, color: 'bg-slate-50' };
                                return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>{st.label}</span>;
                              },
                            },
                            {
                              key: 'actions', header: 'الخيارات',
                              render: (req) => {
                                const st = STATUS_LABELS[req.status] || { label: req.status, color: 'bg-slate-50' };
                                void st;
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button onClick={() => openDetails(req)} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-bold">
                                      <FileText className="w-3.5 h-3.5" /> البنود
                                    </button>
                                    {req.status === 'PENDING' && (canApprove || canReject || canCancelRequest) && (
                                      <div className="flex gap-1">
                                        {canApprove && <button onClick={() => decide(req, 'APPROVED')} className="p-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100" title="اعتماد الطلب"><CheckCircle2 className="w-3.5 h-3.5" /></button>}
                                        {canReject && <button onClick={() => decide(req, 'REJECTED')} className="p-1 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100" title="رفض"><XCircle className="w-3.5 h-3.5" /></button>}
                                        {canCancelRequest && <button onClick={() => decide(req, 'CANCELLED')} className="p-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200" title="إلغاء الطلب"><X className="w-3.5 h-3.5" /></button>}
                                      </div>
                                    )}
                                    {req.status === 'APPROVED' && (
                                      <div className="flex gap-1">
                                        <button onClick={() => navigate('/purchases/quotations')} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold hover:bg-orange-100" title="طرح عروض أسعار">
                                          <FileSpreadsheet className="w-3 h-3" /> RFQ
                                        </button>
                                        {canApprove && (
                                          <button onClick={() => decide(req, 'ORDERED')} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100" title="أمر شراء مباشر">
                                            <Truck className="w-3 h-3" /> أمر شراء
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            },
                          ]}
                          emptyTitle="لا توجد طلبات شراء مسجلة"
                        />
                        {expanded && (() => {
                          const req = requests.find((r) => r.id === expanded);
                          if (!req) return null;
                          return (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                              {itemsLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                              ) : (
                                <DataTable
                                  ariaLabel="بنود طلب الشراء"
                                  rows={items}
                                  rowKey={(it: any) => it.id}
                                  dense
                                  columns={[
                                    { key: 'product', header: 'الصنف والكود', render: (it: any) => <span className="font-bold">{it.productName} <span className="text-slate-400 font-normal">({it.sku || '—'})</span></span> },
                                    { key: 'qty', header: 'الكمية بوحدة الصنف', render: (it: any) => <span className="font-mono font-bold">{formatProductQuantity(it.quantityM2, it)}</span> },
                                    { key: 'cost', header: 'التكلفة التقديرية', render: (it: any) => <span className="font-mono">{fmt(Number(it.estimatedUnitCost || 0))}</span> },
                                    { key: 'total', header: 'الإجمالي التقديري', render: (it: any) => <span className="font-bold text-orange-600">{fmt(Number(it.quantityM2 || 0) * Number(it.estimatedUnitCost || 0))}</span> },
                                    { key: 'notes', header: 'ملاحظات البند', render: (it: any) => <span className="text-slate-500">{it.notes || '—'}</span> },
                                  ]}
                                  emptyTitle="لا توجد بنود"
                                />
                              )}
                              {req.notes && <div className="mt-2 text-[11px] text-slate-600 font-medium">ملاحظات الطلب: {req.notes}</div>}
                              {req.decidedByName && (
                                <div className="mt-1 text-[11px] text-slate-500">
                                  تم الاعتماد بواسطة: <strong>{req.decidedByName}</strong> في {req.decidedAt ? new Date(req.decidedAt).toLocaleString('ar-EG') : ''}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
          </div>
        )}
      </div>

      {/* Reorder Suggestions Modal */}
      {suggestionsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-900">اقتراحات الشراء الآلية من حد إعادة الطلب</h3>
              </div>
              <button onClick={() => setSuggestionsModal(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              الأصناف التي وصل رصيدها الفعلي في المخازن إلى أو أقل من الحد الأدنى للأمان، مع حساب الكمية المقترحة لإعادة التوريد:
            </p>

            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <DataTable
                              ariaLabel="اقتراحات الشراء"
                              rows={suggestions}
                              rowKey={(sg) => sg.productId}
                              dense
                              columns={[
                                {
                                  key: 'product', header: 'الصنف',
                                  render: (sg) => (
                                    <span className="font-bold text-slate-900">
                                      {sg.productName}
                                      <small className="block text-slate-400 font-normal">{sg.sku} · {sg.brandName || ''}</small>
                                    </span>
                                  ),
                                },
                                { key: 'stock', header: 'الرصيد الحالي', render: (sg) => <span className="font-mono text-rose-600 font-bold">{sg.currentStock} {sg.unit}</span> },
                                { key: 'min', header: 'حد الأمان الأدنى', render: (sg) => <span className="font-mono text-slate-500">{sg.minStockLevel} {sg.unit}</span> },
                                { key: 'suggested', header: 'الكمية المقترحة', className: 'text-orange-600 font-black', render: (sg) => <span className="font-mono text-orange-600 font-black">{sg.suggestedQuantity} {sg.unit}</span> },
                                { key: 'cost', header: 'التكلفة التقديرية', render: (sg) => <span className="font-mono font-bold text-slate-800">{fmt(sg.estimatedCost)}</span> },
                              ]}
                              emptyTitle="جميع الأصناف في المخازن تفوق حد الأمان ولا يوجد عجز حالياً"
                            />

            </div>

            {suggestions.length > 0 && (
              <div className="mt-4 flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                <span className="font-bold text-amber-900">
                  إجمالي الأصناف المقترحة: {suggestions.length} صنف · القيمة التقديرية: {fmt(suggestions.reduce((a, b) => a + b.estimatedCost, 0))}
                </span>
                <button
                  onClick={() => importReorderSuggestions(suggestions)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black shadow-sm transition"
                >
                  استيراد وتحويل لطلب شراء
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: New Purchase Request */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">تقديم طلب توريد جديد</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المخزن المستلم</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    <option value="">— بدون تحديد مخزن —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">مطلوب بحلول تاريخ</label>
                  <input
                    type="date"
                    value={neededBy}
                    onChange={(e) => setNeededBy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">درجة الأولوية</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as RequestPriority)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <DataTable
                                  ariaLabel="أصناف طلب الشراء"
                                  rows={lines.map((l, i) => ({ ...l, _i: i }))}
                                  rowKey={(l) => String(l._i)}
                                  dense
                                  columns={[
                                    {
                                      key: 'product', header: 'الصنف',
                                      render: (l) => (
                                        <ProductPicker
                                          value={l.productId}
                                          selectedLabel={products.find((product) => product.id === l.productId)?.name}
                                          ariaLabel={`استعراض أصناف طلب الشراء للسطر ${l._i + 1}`}
                                          onChange={(productId) => pickProduct(l._i, productId)}
                                        />
                                      ),
                                    },
                                    {
                                      key: 'qty', header: 'الكمية / الوحدة',
                                      render: (l) => (
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={l.quantityM2 || ''}
                                          onChange={(e) => setLine(l._i, { quantityM2: Number(e.target.value) || 0 })}
                                          placeholder={products.find((product) => product.id === l.productId) ? getProductUnitLabel(products.find((product) => product.id === l.productId)!) : 'الوحدة'}
                                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center"
                                        />
                                      ),
                                    },
                                    {
                                      key: 'cost', header: 'تكلفة الوحدة',
                                      render: (l) => (
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={l.estimatedUnitCost || ''}
                                          onChange={(e) => setLine(l._i, { estimatedUnitCost: Number(e.target.value) || 0 })}
                                          className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-center"
                                        />
                                      ),
                                    },
                                    { key: 'total', header: 'الإجمالي', render: (l) => <span className="font-bold text-slate-700">{fmt(l.quantityM2 * l.estimatedUnitCost)}</span> },
                                    {
                                      key: 'actions', header: '',
                                      render: (l) => (
                                        <button
                                          type="button"
                                          onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== l._i) : prev))}
                                          className="p-1 text-slate-400 hover:text-rose-600"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      ),
                                    },
                                  ]}
                                />

                <div className="p-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, { productId: '', quantityM2: 0, estimatedUnitCost: 0, notes: '' }])}
                    className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> إضافة صنف
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <div>
                  <span className="text-xs font-bold text-orange-700">القيمة التقديرية: </span>
                  <span className="text-lg font-black text-orange-700">{fmt(estimated)}</span>
                </div>
                <div className="text-xs font-bold text-slate-600">
                  مستوى الاعتماد المطلوب: <strong className="text-purple-700">{estimated >= 25000 ? 'مستوى 2 (إدارة عليا / مالية)' : 'مستوى 1 (مباشر)'}</strong>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تقديم الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
