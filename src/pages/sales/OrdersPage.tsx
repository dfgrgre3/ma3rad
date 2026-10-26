import React, { useEffect, useMemo, useState } from 'react';
import {
  Package2, Plus, Search, Calendar, User, Phone, Loader2, X, Trash2,
  ChevronLeft, ChevronRight, Eye, Pencil, CheckCircle2, Truck, Ban,
  FileText, Printer, RefreshCw, FileSpreadsheet, FileDown, Wallet, AlertTriangle,
  Boxes, Clock, Receipt, History, PackageCheck, MessageCircle,
} from 'lucide-react';
import { OrderService, Order, OrderStatus, OrderStats, OrderStatusEntry } from '../../services/OrderService';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { InventoryService } from '../../services/InventoryService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { PrintService } from '../../services/PrintService';
import { Customer, Product, Warehouse, PaymentType } from '../../types';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const PAGE_SIZE = 15;

const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار التأكيد', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CONFIRMED: { label: 'مؤكد', color: 'bg-violet-50 text-violet-600 border-violet-200' },
  PROCESSING: { label: 'قيد التجهيز', color: 'bg-sky-50 text-sky-600 border-sky-200' },
  PARTIAL: { label: 'تسليم جزئي', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  COMPLETED: { label: 'تم التسليم / مفوتر', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-50 text-rose-600 border-rose-200' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

type Line = { productId: string; quantityM2: number; unitPrice: number; discountAmount: number };

interface FormState {
  customerId: string;
  warehouseId: string;
  deliveryDate: string;
  notes: string;
  shipping: string;
  discount: string;
  tax: string;
  lines: Line[];
}

const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', deliveryDate: '', notes: '',
  shipping: '', discount: '', tax: '',
  lines: [{ productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }],
});

export const OrdersPage: React.FC = () => {
  const service = useMemo(() => new OrderService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'sales.create');
  const canUpdate = PermissionService.can(user, 'sales.approve');

  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
  } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<{ order: Order; entries: OrderStatusEntry[] } | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<Order | null>(null);
  const [deliveryLines, setDeliveryLines] = useState<Record<string, number>>({});
  const [deliveryNote, setDeliveryNote] = useState('');
  const [convertTarget, setConvertTarget] = useState<Order | null>(null);
  const [convertPaymentType, setConvertPaymentType] = useState<PaymentType>('CREDIT');
  const [convertPaid, setConvertPaid] = useState('');
  const [convertNotes, setConvertNotes] = useState('');

  const load = () => {
    setLoading(true);
    try {
      setOrders(service.getOrders(search.trim(), statusFilter, dateFrom || undefined, dateTo || undefined));
      setStats(service.getStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search, statusFilter, dateFrom, dateTo]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const pageItems = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loadReferences = () => {
    setCustomers(customerService.getAllCustomers());
    setProducts(productService.getAllProducts());
    const whs = inventoryService.getAllWarehouses();
    setWarehouses(whs);
    return whs;
  };

  const openCreate = () => {
    try {
      const whs = loadReferences();
      setEditingId(null);
      setForm({ ...emptyForm(), warehouseId: whs.find((w) => w.isDefault)?.id || whs[0]?.id || '' });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل بيانات الطلب.'); }
  };

  const openEdit = (order: Order) => {
    try {
      loadReferences();
      const full = service.getOrder(order.id) || order;
      setEditingId(order.id);
      setForm({
        customerId: full.customerId,
        warehouseId: full.warehouseId,
        deliveryDate: full.expectedDeliveryDate || '',
        notes: full.notes || '',
        shipping: String(full.shippingCost || ''),
        discount: String(full.discountAmount || ''),
        tax: String(full.taxAmount || ''),
        lines: (full.items || []).map((i) => ({
          productId: i.productId,
          quantityM2: i.quantityM2,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount || 0,
        })),
      });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل بيانات الطلب.'); }
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const getFormUnit = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    return product ? getProductUnitLabel(product) : 'وحدة';
  };

  const summarizeOrderQuantity = (items: any[], field: 'quantityM2' | 'deliveredM2') => {
    const totals = new Map<string, { product: any; quantity: number }>();
    for (const item of items) {
      const quantity = Number(item[field] || 0);
      if (quantity <= 0) continue;
      const unit = getProductUnitLabel(item);
      const entry = totals.get(unit) || { product: item, quantity: 0 };
      entry.quantity += quantity;
      totals.set(unit, entry);
    }
    return [...totals.values()].map((entry) => formatProductQuantity(entry.quantity, entry.product)).join('، ') || '0';
  };

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(idx, { productId, unitPrice: p ? p.sellingPriceM2 : 0 });
  };

  const stockOf = (productId: string, warehouseId: string): number => {
    if (!productId || !warehouseId) return 0;
    try {
      const stock = inventoryService.getProductStock(productId, warehouseId);
      return Math.max(0, Number(stock?.availableM2 ?? stock?.quantityM2 ?? 0));
    } catch { return 0; }
  };

  const subtotal = form.lines.reduce((s, l) => s + l.quantityM2 * l.unitPrice - (l.discountAmount || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0) + (Number(form.shipping) || 0));

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.lines.filter((l) => l.productId && l.quantityM2 > 0);
    if (!form.customerId) return alert('اختر العميل.');
    if (!form.warehouseId) return alert('اختر المخزن.');
    if (items.length === 0) return alert('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر.');
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        warehouseId: form.warehouseId,
        expectedDeliveryDate: form.deliveryDate || undefined,
        notes: form.notes || undefined,
        shippingCost: Number(form.shipping) || 0,
        discountAmount: Number(form.discount) || 0,
        taxAmount: Number(form.tax) || 0,
        items,
      };
      if (editingId) service.updateOrder(editingId, payload);
      else service.createOrder(payload);
      setFormOpen(false);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ الطلب.');
    } finally {
      setSaving(false);
    }
  };

  const advance = (order: Order) => {
    const next: Partial<Record<OrderStatus, OrderStatus>> = {
      PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING',
    };
    const target = next[order.status];
    if (!target) return;
    try { service.updateStatus(order.id, target); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const cancel = (order: Order) => {
    if (!window.confirm(`إلغاء الطلب ${order.orderNumber}؟ سيتم تحرير الكميات المحجوزة من المخزن.`)) return;
    try { service.cancelOrder(order.id); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const openTimeline = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    setTimeline({ order: full, entries: service.getStatusHistory(order.id) });
  };

  const openDelivery = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    const init: Record<string, number> = {};
    (full.items || []).forEach((item) => {
      const remaining = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
      init[item.id] = remaining;
    });
    setDeliveryTarget(full);
    setDeliveryLines(init);
    setDeliveryNote('');
  };

  const submitDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryTarget) return;
    const lines = Object.entries(deliveryLines)
      .map(([itemId, quantityM2]) => ({ itemId, quantityM2: Number(quantityM2) || 0 }))
      .filter((line) => line.quantityM2 > 0);
    if (lines.length === 0) return alert('أدخل كمية تسليم أكبر من صفر لبند واحد على الأقل.');
    setSaving(true);
    try {
      service.recordDelivery(deliveryTarget.id, lines, deliveryNote || undefined);
      setDeliveryTarget(null);
      setDetail(null);
      load();
      alert('تم تسجيل التسليم وتحديث حالة الطلب بنجاح.');
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل التسليم.');
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = (order: Order) => {
    if (!window.confirm(`حذف الطلب الملغي ${order.orderNumber} نهائياً؟`)) return;
    try { service.deleteCancelledOrder(order.id); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const shareOnWhatsApp = (order: Order) => {
    const phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `مرحباً ${order.customerName || ''}\nطلبكم رقم ${order.orderNumber} بتاريخ ${order.date}\n` +
      `الإجمالي: ${fmt(order.totalAmount)}\n` +
      (order.expectedDeliveryDate ? `موعد التسليم المتوقع: ${order.expectedDeliveryDate}\n` : '') +
      `شكراً لتعاملكم معنا.`
    );
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
  };

  const openConvert = (order: Order) => {
    const full = service.getOrder(order.id) || order;
    setConvertTarget(full);
    setConvertPaymentType('CREDIT');
    setConvertPaid('0');
    setConvertNotes('');
  };

  const submitConvert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTarget) return;
    setSaving(true);
    try {
      const invoice = service.convertToInvoice(convertTarget.id, {
        paymentType: convertPaymentType,
        paidAmount: Number(convertPaid) || 0,
        notes: convertNotes || undefined,
      });
      setConvertTarget(null);
      setDetail(null);
      load();
      alert(`تم إصدار الفاتورة ${invoice.invoiceNumber} بنجاح وإتمام الطلب.`);
    } catch (err: any) {
      alert(err?.message || 'تعذر إصدار الفاتورة.');
    } finally {
      setSaving(false);
    }
  };

  const exportRows = () => orders.map((o) => ({
    orderNumber: o.orderNumber,
    date: o.date,
    customer: o.customerName || '',
    phone: o.customerPhone || '',
    warehouse: o.warehouseName || '',
    delivery: o.expectedDeliveryDate || '',
    items: o.itemsCount || 0,
    total: o.totalAmount,
    status: STATUS_LABELS[o.status].label,
    invoice: o.invoiceNumber || '',
  }));

  const doExport = (kind: 'excel' | 'pdf') => {
    const options = {
      title: 'سجل طلبات وحجوزات العملاء',
      subtitle: `عدد الطلبات: ${orders.length}`,
      columns: [
        { key: 'orderNumber', label: 'رقم الطلب' },
        { key: 'date', label: 'التاريخ' },
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'warehouse', label: 'المخزن' },
        { key: 'delivery', label: 'التسليم المتوقع' },
        { key: 'items', label: 'عدد البنود' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'status', label: 'الحالة' },
        { key: 'invoice', label: 'الفاتورة' },
      ],
      rows: exportRows(),
      fileName: 'sales-orders',
    };
    setDocPreview({
      title: 'معاينة سجل أوامر البيع',
      subtitle: options.subtitle,
      fileName: options.fileName,
      html: buildExportHtml(options),
      excel: () => exportToExcel(options),
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center"><Package2 className="w-5 h-5 text-violet-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">طلبات وحجوزات العملاء</h1>
            <p className="text-xs text-slate-500 font-medium">حجز البضاعة، متابعة التجهيز، وإصدار الفاتورة مباشرة من الطلب</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => doExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel</button>
          <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> PDF</button>
          {canCreate && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition">
              <Plus className="w-4 h-4" /> إنشاء طلب حجز
            </button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Stat label="إجمالي الطلبات" value={String(stats?.total ?? 0)} icon={Package2} tone="text-slate-700 bg-slate-50 border-slate-200" />
          <Stat label="قيمة الطلبات" value={fmt(stats?.totalValue ?? 0)} icon={Wallet} tone="text-violet-700 bg-violet-50 border-violet-200" />
          <Stat label="بانتظار التأكيد" value={String(stats?.pending ?? 0)} icon={Clock} tone="text-amber-700 bg-amber-50 border-amber-200" />
          <Stat label="قيد التجهيز" value={String(stats?.processing ?? 0)} icon={Truck} tone="text-sky-700 bg-sky-50 border-sky-200" />
          <Stat label="مكتملة / مفوترة" value={String(stats?.completed ?? 0)} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
          <Stat label="قيمة المكتملة" value={fmt(stats?.completedValue ?? 0)} icon={Receipt} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
        </div>

        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الطلب أو العميل أو الهاتف أو الفاتورة..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-violet-400" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
              <span className="text-slate-300">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
              <option value="ALL">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={load} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-500" /></div> : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-right text-xs min-w-[980px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="px-4 py-3">رقم الطلب</th>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">المخزن</th>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">التسليم المتوقع</th>
                    <th className="px-4 py-3">البنود</th>
                    <th className="px-4 py-3">التسليم</th>
                    <th className="px-4 py-3">الإجمالي</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">الفاتورة</th>
                    <th className="px-4 py-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map((o) => {
                    const st = STATUS_LABELS[o.status];
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-bold text-violet-600">{o.orderNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800 flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-400" />{o.customerName}</div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{o.customerPhone || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-sky-600 font-semibold">{o.warehouseName}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{o.date}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{o.expectedDeliveryDate || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{o.itemsCount || 0} بند</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const pct = Math.min(100, Math.round(Number(o.deliveryProgress) || 0));
                            return (
                              <div className="min-w-[90px]">
                                <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                                  <span>اكتمال البنود</span>
                                  <span className={pct >= 100 ? 'text-emerald-600' : 'text-sky-600'}>{pct}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900">{fmt(o.totalAmount)}</td>
                        <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>{st.label}</span></td>
                        <td className="px-4 py-3 font-mono text-[10px] text-emerald-600">{o.invoiceNumber || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <IconBtn title="تفاصيل الطلب" onClick={() => setDetail(service.getOrder(o.id))}><Eye className="w-4 h-4" /></IconBtn>
                            <IconBtn title="طباعة الطلب" onClick={() => {
                              const full = service.getOrder(o.id);
                              if (full) printService.printOrder(full);
                            }}><Printer className="w-4 h-4" /></IconBtn>
                            <IconBtn title="سجل الحالات" onClick={() => openTimeline(o)}><History className="w-4 h-4" /></IconBtn>
                            <IconBtn title="مشاركة واتساب" onClick={() => shareOnWhatsApp(o)}><MessageCircle className="w-4 h-4 text-emerald-600" /></IconBtn>
                            {canCreate && o.status === 'PENDING' && (
                              <IconBtn title="تعديل الطلب" onClick={() => openEdit(o)}><Pencil className="w-4 h-4" /></IconBtn>
                            )}
                            {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(o.status) && (
                              <IconBtn title="تسجيل تسليم" onClick={() => openDelivery(o)}><PackageCheck className="w-4 h-4 text-sky-600" /></IconBtn>
                            )}
                            {canUpdate && ['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(o.status) && (
                              <button onClick={() => openConvert(o)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1"><Receipt className="w-3 h-3" /> فاتورة</button>
                            )}
                            {canUpdate && o.status === 'CANCELLED' && (
                              <IconBtn title="حذف الطلب الملغي" onClick={() => removeOrder(o)}><Trash2 className="w-4 h-4 text-rose-500" /></IconBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {orders.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-slate-400">لا توجد طلبات مطابقة.</td></tr>}
                </tbody>
              </table>
            </div>

            {orders.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>{(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, orders.length)} من {orders.length}</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                  <span className="px-3 font-bold">{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / edit modal */}
      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} wide>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><Package2 className="w-5 h-5 text-violet-600" /> {editingId ? 'تعديل طلب حجز' : 'إنشاء طلب حجز بضاعة'}</h3>
            <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={submitForm} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">العميل *</label>
                <select required value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر العميل —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">المخزن *</label>
                <select required value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— اختر المخزن —</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ التسليم المتوقع</label>
                <input type="date" value={form.deliveryDate} onChange={(e) => setForm((p) => ({ ...p, deliveryDate: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2 w-24">الكمية</th>
                    <th className="px-3 py-2 w-28">سعر الوحدة</th>
                    <th className="px-3 py-2 w-28">خصم البند</th>
                    <th className="px-3 py-2 w-20">المتاح</th>
                    <th className="px-3 py-2">الإجمالي</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.lines.map((l, idx) => {
                    const available = stockOf(l.productId, form.warehouseId);
                    const unitLabel = getFormUnit(l.productId);
                    const selectedProduct = products.find((product) => product.id === l.productId);
                    const exceeds = l.quantityM2 > available;
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <select value={l.productId} onChange={(e) => pickProduct(idx, e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold">
                            <option value="">— اختر الصنف —</option>
                            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.size} — {p.grade}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="number" min={0} step={selectedProduct?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(selectedProduct.baseUnit) ? 1 : 0.01} aria-label={`الكمية ${unitLabel}`} value={l.quantityM2 || ''} onChange={(e) => setLine(idx, { quantityM2: Number(e.target.value) || 0 })} className={`w-full px-2 py-1.5 bg-slate-50 border rounded-lg font-mono ${exceeds ? 'border-rose-300 text-rose-600' : 'border-slate-200'}`} /></td>
                        <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(idx, { unitPrice: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                        <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(idx, { discountAmount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                        <td className={`px-3 py-2 font-mono font-bold ${exceeds ? 'text-rose-600' : 'text-slate-500'}`}>{l.productId ? available.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{fmt(l.quantityM2 * l.unitPrice - (l.discountAmount || 0))}</td>
                        <td className="px-3 py-2"><button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== idx) : p.lines }))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-2 border-t border-slate-100">
                <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة صنف</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="خصم الطلب (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
              <Field label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
              <Field label="مصاريف الشحن (ج)" value={form.shipping} onChange={(v) => setForm((p) => ({ ...p, shipping: v }))} />
              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" placeholder="اختياري" />
              </div>
            </div>

            <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
              <span className="text-xs font-bold text-violet-700">إجمالي الطلب</span>
              <span className="text-lg font-black text-violet-700">{fmt(total)}</span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'إنشاء الطلب'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal onClose={() => setDetail(null)} wide>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">طلب {detail.orderNumber}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{detail.date} • {detail.warehouseName} • {STATUS_LABELS[detail.status].label}</p>
            </div>
            <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
            <Info label="العميل" value={detail.customerName || '—'} sub={detail.customerPhone || ''} />
            <Info label="التسليم المتوقع" value={detail.expectedDeliveryDate || '—'} sub={detail.invoiceNumber ? `الفاتورة: ${detail.invoiceNumber}` : 'لم تُصدر فاتورة'} />
            <Info
              label="نسبة التسليم"
              value={`${Number(detail.totalM2 || 0) > 0 ? Math.round((Number(detail.deliveredM2 || 0) / Number(detail.totalM2 || 1)) * 100) : 0}%`}
              sub={`${summarizeOrderQuantity(detail.items || [], 'deliveredM2')} من ${summarizeOrderQuantity(detail.items || [], 'quantityM2')}`}
            />
            <Info label="القيمة" value={fmt(detail.totalAmount)} sub={`${detail.items?.length || 0} بند`} />
          </div>
          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[600px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">المسلّم</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">السعر</th><th className="px-3 py-2">الخصم</th><th className="px-3 py-2">الإجمالي</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(detail.items || []).map((item) => {
                  const remaining = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
                  return (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-bold text-slate-800">{item.productName}<div className="text-[9px] text-slate-400 font-normal">{item.size} • {item.grade}</div></td>
                    <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(item.quantityM2), item)}</td>
                    <td className="px-3 py-2 font-mono">
                      <span className={remaining <= 0 ? 'text-emerald-600 font-bold' : 'text-sky-600'}>
                        {formatProductQuantity(Number(item.deliveredM2 || 0), item)}
                      </span>
                      {remaining > 0 && <div className="text-[9px] text-slate-400">متبقي {remaining.toFixed(2)}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono">{item.boxesCount}</td>
                    <td className="px-3 py-2 font-mono">{fmt(item.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{item.discountAmount ? `-${fmt(item.discountAmount)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold">{fmt(item.totalPrice)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button onClick={() => printService.printOrder(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
            <button onClick={() => shareOnWhatsApp(detail)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> واتساب</button>
            <button onClick={() => openTimeline(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> سجل الحالات</button>
            {canUpdate && ['CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && (
              <button onClick={() => openDelivery(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5" /> تسجيل تسليم</button>
            )}
            {canUpdate && ['PENDING', 'CONFIRMED'].includes(detail.status) && (
              <button onClick={() => advance(detail)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                <ChevronLeft className="w-3.5 h-3.5" />
                {detail.status === 'PENDING' ? 'تأكيد الطلب' : 'بدء التجهيز'}
              </button>
            )}
            {['PENDING', 'CONFIRMED', 'PROCESSING', 'PARTIAL'].includes(detail.status) && (
              <button onClick={() => openConvert(detail)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> إصدار فاتورة وإتمام</button>
            )}
            {canUpdate && !['COMPLETED', 'CANCELLED'].includes(detail.status) && (
              <button onClick={() => cancel(detail)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> إلغاء الطلب</button>
            )}
          </div>
        </Modal>
      )}

      {/* Delivery modal */}
      {deliveryTarget && (
        <Modal onClose={() => setDeliveryTarget(null)} wide>
          <form onSubmit={submitDelivery} className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-sky-600" /> تسجيل تسليم الطلب {deliveryTarget.orderNumber}
              </h3>
              <button type="button" onClick={() => setDeliveryTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11px] text-sky-800">
              يمكن التسليم على دفعات. عدّل الكميات المسلّمة الآن وسيتم خصمها من المتبقي لكل بند.
            </div>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-right text-[11px] min-w-[620px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2">الصنف</th>
                    <th className="px-3 py-2">المطلوب</th>
                    <th className="px-3 py-2">المسلّم سابقاً</th>
                    <th className="px-3 py-2">المتبقي</th>
                    <th className="px-3 py-2 w-32">تسليم الآن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(deliveryTarget.items || []).map((item) => {
                    const delivered = Number(item.deliveredM2 || 0);
                    const remaining = Math.max(0, Number(item.quantityM2) - delivered);
                    return (
                      <tr key={item.id} className={remaining <= 0 ? 'opacity-50' : ''}>
                        <td className="px-3 py-2 font-bold text-slate-800">{item.productName}<div className="text-[9px] text-slate-400 font-normal">{item.size} • {item.grade}</div></td>
                        <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(item.quantityM2), item)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-600">{delivered.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-amber-600">{remaining.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0} max={remaining} step="0.01" disabled={remaining <= 0}
                            value={deliveryLines[item.id] ?? ''}
                            onChange={(e) => setDeliveryLines((prev) => ({
                              ...prev,
                              [item.id]: Math.min(remaining, Number(e.target.value) || 0),
                            }))}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono disabled:bg-slate-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const all: Record<string, number> = {};
                  (deliveryTarget.items || []).forEach((item) => {
                    all[item.id] = Math.max(0, Number(item.quantityM2) - Number(item.deliveredM2 || 0));
                  });
                  setDeliveryLines(all);
                }}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700"
              >
                تسليم كل المتبقي
              </button>
              <span className="text-[11px] font-bold text-slate-500">
                إجمالي هذه الدفعة: {summarizeOrderQuantity(
                  (detail?.items || []).map((item) => ({ ...item, deliveredM2: Number(deliveryLines[item.id]) || 0 })),
                  'deliveredM2'
                )}
              </span>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">ملاحظات التسليم</label>
              <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="مندوب التسليم / رقم السيارة / ملاحظات..." className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setDeliveryTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ التسليم
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Timeline modal */}
      {timeline && (
        <Modal onClose={() => setTimeline(null)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-violet-600" /> سجل حالات الطلب {timeline.order.orderNumber}</h3>
            <button onClick={() => setTimeline(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          {timeline.entries.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">لا يوجد سجل حالات لهذا الطلب بعد.</div>
          ) : (
            <ol className="relative border-r-2 border-slate-100 mr-3 space-y-4 pr-5">
              {timeline.entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute -right-[27px] top-1 w-3 h-3 rounded-full bg-violet-500 border-2 border-white shadow" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800">{STATUS_LABELS[entry.toStatus]?.label || entry.toStatus}</span>
                    <span className="text-[10px] font-mono text-slate-400">{new Date(entry.createdAt).toLocaleString('ar-EG')}</span>
                  </div>
                  {entry.fromStatus && <div className="text-[10px] text-slate-400 mt-0.5">من: {STATUS_LABELS[entry.fromStatus]?.label || entry.fromStatus}</div>}
                  {entry.note && <div className="text-[11px] text-slate-600 mt-1">{entry.note}</div>}
                  <div className="text-[10px] text-slate-400 mt-0.5">بواسطة {entry.createdByName || '—'}</div>
                </li>
              ))}
            </ol>
          )}
        </Modal>
      )}

      {/* Convert modal */}
      {convertTarget && (
        <Modal onClose={() => setConvertTarget(null)}>
          <form onSubmit={submitConvert} className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600"><Receipt className="w-5 h-5" /><h3 className="text-base font-black">إصدار فاتورة للطلب {convertTarget.orderNumber}</h3></div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">قيمة الطلب</span><span className="font-black text-emerald-700">{fmt(convertTarget.totalAmount)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select value={convertPaymentType} onChange={(e) => setConvertPaymentType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="CREDIT">آجل بالكامل</option>
                  <option value="CASH">نقدي بالكامل</option>
                  <option value="CARD">بطاقة</option>
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع مقدماً</label>
                <input type="number" min={0} step="0.01" value={convertPaid} onChange={(e) => setConvertPaid(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
              <input value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="اختياري" />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم خصم الكميات من المخزن وإتمام الطلب. تأكد من توفر الرصيد الكافي.</div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setConvertTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إصدار الفاتورة</button>
            </div>
          </form>
        </Modal>
      )}

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          subtitle={docPreview.subtitle}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
        />
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Stat: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold opacity-80">{label}</span><Icon className="w-4 h-4 opacity-70" /></div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">{children}</button>
);

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="font-bold text-slate-700 block mb-1">{label}</label>
    <input type="number" min={0} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
  </div>
);

const Info: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs font-black text-slate-800 mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</div>}
  </div>
);
