import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Search, Calendar, Printer, Trash2, Check, X, Loader2, Eye,
  Pencil, Ban, Copy, RefreshCw, FileSpreadsheet, FileDown, ChevronLeft,
  ChevronRight, Percent, Ban as CancelIcon, Receipt, Clock, CheckCircle2, AlertTriangle,
  MessageCircle, CalendarClock, ShoppingBag, PhoneCall,
} from 'lucide-react';
import { QuotationService, Quotation, QuotationStats, QuotationStatus } from '../../services/QuotationService';
import { CustomerService } from '../../services/CustomerService';
import { ProductService } from '../../services/ProductService';
import { InventoryService } from '../../services/InventoryService';
import { PrintService } from '../../services/PrintService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Customer, Product, Warehouse, PaymentType } from '../../types';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { addLocalDays, localDateString } from '../../utils/date';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const PAGE_SIZE = 12;

const STATUS_LABELS: Record<QuotationStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الموافقة', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  CONVERTED: { label: 'محوّل إلى فاتورة', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-slate-200 text-slate-500 border-slate-300' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

type Line = { productId: string; quantityM2: number; unitPrice: number; discountAmount: number };

interface FormState {
  customerId: string;
  warehouseId: string;
  validDays: string;
  discount: string;
  tax: string;
  notes: string;
  lines: Line[];
}

const emptyForm = (): FormState => ({
  customerId: '', warehouseId: '', validDays: '15', discount: '', tax: '', notes: '',
  lines: [{ productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }],
});

export const QuotationsPage: React.FC = () => {
  const service = useMemo(() => new QuotationService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'sales.create');
  const canApprove = PermissionService.can(user, 'sales.approve');

  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
  } | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<QuotationStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuotationStatus>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Quotation | null>(null);
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null);
  const [convertWarehouse, setConvertWarehouse] = useState('');
  const [convertPaymentType, setConvertPaymentType] = useState<PaymentType>('CREDIT');
  const [convertPaid, setConvertPaid] = useState('0');
  const [convertNotes, setConvertNotes] = useState('');

  const [orderTarget, setOrderTarget] = useState<Quotation | null>(null);
  const [orderDeliveryDate, setOrderDeliveryDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [followUpTarget, setFollowUpTarget] = useState<Quotation | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  const [followUpOnly, setFollowUpOnly] = useState(false);

  const load = () => {
    setLoading(true);
    try {
      const rows = service.getQuotations({
        search, status: statusFilter, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
      });
      const today = localDateString();
      setQuotations(
        followUpOnly
          ? rows.filter((q) => q.status === 'PENDING' && q.followUpDate && q.followUpDate <= today)
          : rows
      );
      setStats(service.getStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل عروض الأسعار.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, statusFilter, dateFrom, dateTo, followUpOnly]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, followUpOnly]);

  const totalPages = Math.max(1, Math.ceil(quotations.length / PAGE_SIZE));
  const pageItems = quotations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      setForm({ ...emptyForm(), warehouseId: service.getDefaultWarehouseId() || whs[0]?.id || '' });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل البيانات.'); }
  };

  const openEdit = (quotation: Quotation) => {
    try {
      loadReferences();
      const full = service.getQuotation(quotation.id) || quotation;
      setEditingId(full.id);
      const days = Math.max(1, Math.round((new Date(full.validUntil).getTime() - Date.now()) / 86400000)) || 15;
      setForm({
        customerId: full.customerId,
        warehouseId: full.warehouseId || '',
        validDays: String(days),
        discount: String(full.discountAmount || ''),
        tax: String(full.taxAmount || ''),
        notes: full.notes || '',
        lines: (full.items || []).map((i) => ({
          productId: i.productId, quantityM2: i.quantityM2, unitPrice: i.unitPrice, discountAmount: i.discountAmount || 0,
        })),
      });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل عرض السعر.'); }
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(idx, { productId, unitPrice: p ? (p.sellingPriceM2 || 0) : 0 });
  };

  const getFormUnit = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    return product ? getProductUnitLabel(product) : 'وحدة';
  };

  const subtotal = form.lines.reduce((s, l) => s + l.quantityM2 * l.unitPrice - (l.discountAmount || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0));

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.lines.filter((l) => l.productId && l.quantityM2 > 0);
    if (!form.customerId) return alert('اختر العميل.');
    if (items.length === 0) return alert('أضف بنداً واحداً على الأقل بكمية أكبر من صفر.');
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        warehouseId: form.warehouseId || undefined,
        validDays: Number(form.validDays) || 15,
        discountAmount: Number(form.discount) || 0,
        taxAmount: Number(form.tax) || 0,
        notes: form.notes || undefined,
        items,
      };
      if (editingId) service.updateQuotation(editingId, payload);
      else service.createQuotation(payload);
      setFormOpen(false);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ عرض السعر.');
    } finally {
      setSaving(false);
    }
  };

  const openConvert = (quotation: Quotation) => {
    const full = service.getQuotation(quotation.id) || quotation;
    setConvertTarget(full);
    setConvertWarehouse(full.warehouseId || service.getDefaultWarehouseId() || '');
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
        warehouseId: convertWarehouse || undefined,
        paymentType: convertPaymentType,
        paidAmount: Number(convertPaid) || 0,
        notes: convertNotes || undefined,
      });
      setConvertTarget(null);
      load();
      alert(`تم تحويل عرض السعر إلى الفاتورة ${invoice.invoiceNumber} بنجاح.`);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحويل عرض السعر.');
    } finally {
      setSaving(false);
    }
  };

  const cancelQuotation = (quotation: Quotation) => {
    if (!window.confirm(`إلغاء عرض السعر ${quotation.quotationNumber}؟`)) return;
    try { service.setStatus(quotation.id, 'CANCELLED'); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const reopenQuotation = (quotation: Quotation) => {
    try { service.setStatus(quotation.id, 'PENDING'); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const deleteQuotation = (quotation: Quotation) => {
    if (!window.confirm(`حذف عرض السعر ${quotation.quotationNumber} نهائياً؟`)) return;
    try { service.deleteQuotation(quotation.id); load(); setDetail(null); }
    catch (e: any) { alert(e?.message); }
  };

  const duplicate = (quotation: Quotation) => {
    try { service.duplicateQuotation(quotation.id); load(); }
    catch (e: any) { alert(e?.message); }
  };

  const shareOnWhatsApp = (quotation: Quotation) => {
    const phone = (quotation.customerPhone || '').replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `مرحباً ${quotation.customerName || ''}\nعرض السعر رقم ${quotation.quotationNumber}\n` +
      `الإجمالي: ${fmt(quotation.totalAmount)}\nصالح حتى: ${quotation.validUntil}\n` +
      `يسعدنا خدمتكم.`
    );
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
  };

  const openFollowUp = (quotation: Quotation) => {
    const full = service.getQuotation(quotation.id) || quotation;
    setFollowUpTarget(full);
    setFollowUpDate(full.followUpDate || localDateString(addLocalDays(new Date(), 2)));
    setFollowUpNotes(full.followUpNotes || '');
  };

  const submitFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpTarget) return;
    setSaving(true);
    try {
      service.scheduleFollowUp(followUpTarget.id, followUpDate || null, followUpNotes || null);
      setFollowUpTarget(null);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر حفظ المتابعة.');
    } finally {
      setSaving(false);
    }
  };

  const logContact = (quotation: Quotation) => {
    try {
      service.recordContact(quotation.id, `تم التواصل مع العميل بتاريخ ${localDateString()}`);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل التواصل.');
    }
  };

  const openConvertOrder = (quotation: Quotation) => {
    const full = service.getQuotation(quotation.id) || quotation;
    setOrderTarget(full);
    setOrderDeliveryDate('');
    setOrderNotes(`طلب مبيعات من عرض السعر ${quotation.quotationNumber}`);
  };

  const submitConvertOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTarget) return;
    setSaving(true);
    try {
      const order = service.convertToOrder(orderTarget.id, {
        expectedDeliveryDate: orderDeliveryDate || undefined,
        notes: orderNotes || undefined,
      });
      setOrderTarget(null);
      setDetail(null);
      load();
      alert(`تم إنشاء الطلب ${order.orderNumber} بنجاح.`);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحويل عرض السعر إلى طلب.');
    } finally {
      setSaving(false);
    }
  };

  const doExport = (kind: 'excel' | 'pdf') => {
    const options = {
      title: 'سجل عروض الأسعار والمقايسات',
      subtitle: `عدد العروض: ${quotations.length}`,
      columns: [
        { key: 'quotationNumber', label: 'رقم العرض' },
        { key: 'date', label: 'التاريخ' },
        { key: 'validUntil', label: 'صالح لغاية' },
        { key: 'customer', label: 'العميل' },
        { key: 'phone', label: 'الهاتف' },
        { key: 'items', label: 'عدد البنود' },
        { key: 'total', label: 'الإجمالي' },
        { key: 'status', label: 'الحالة' },
        { key: 'followUp', label: 'المتابعة القادمة' },
        { key: 'order', label: 'الطلب' },
        { key: 'invoice', label: 'الفاتورة' },
      ],
      rows: quotations.map((q) => ({
        quotationNumber: q.quotationNumber, date: q.date, validUntil: q.validUntil,
        customer: q.customerName || '', phone: q.customerPhone || '',
        items: q.itemsCount || 0, total: q.totalAmount,
        status: STATUS_LABELS[q.status].label,
        followUp: q.followUpDate || '',
        order: q.convertedOrderNumber || '',
        invoice: q.convertedInvoiceNumber || '',
      })),
      fileName: 'quotations',
    };
    setDocPreview({
      title: 'معاينة سجل عروض الأسعار',
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
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"><FileText className="w-5 h-5 text-amber-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">عروض الأسعار والمقايسات</h1>
            <p className="text-xs text-slate-500 font-medium">إنشاء المقايسات، متابعة صلاحيتها، وتحويلها إلى فواتير مبيعات معتمدة</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => doExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel</button>
          <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> PDF</button>
          {canCreate && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition"><Plus className="w-4 h-4" /> عرض أسعار جديد</button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
          <Stat label="إجمالي العروض" value={String(stats?.total ?? 0)} icon={FileText} tone="text-slate-700 bg-slate-50 border-slate-200" />
          <Stat label="بانتظار الموافقة" value={`${stats?.pending ?? 0} • ${fmt(stats?.pendingValue ?? 0)}`} icon={Clock} tone="text-amber-700 bg-amber-50 border-amber-200" />
          <Stat label="محوّلة لفواتير" value={`${stats?.converted ?? 0} • ${fmt(stats?.convertedValue ?? 0)}`} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
          <Stat label="منتهية الصلاحية" value={String(stats?.expired ?? 0)} icon={AlertTriangle} tone="text-slate-600 bg-slate-50 border-slate-200" />
          <Stat label="متابعات مستحقة" value={String(stats?.followUpDue ?? 0)} icon={PhoneCall} tone="text-rose-700 bg-rose-50 border-rose-200" />
          <Stat label="تنتهي قريباً" value={String(stats?.expiringSoon ?? 0)} icon={CalendarClock} tone="text-violet-700 bg-violet-50 border-violet-200" />
          <Stat label="إجمالي القيمة" value={fmt(stats?.totalValue ?? 0)} icon={Percent} tone="text-sky-700 bg-sky-50 border-sky-200" />
        </div>

        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم العرض أو العميل أو الهاتف أو الفاتورة..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-400" />
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
            <button
              type="button"
              onClick={() => setFollowUpOnly((v) => !v)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${followUpOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
            >
              <PhoneCall className="w-3.5 h-3.5" /> متابعات مستحقة
            </button>
            <button onClick={load} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-amber-500" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageItems.map((q) => {
                const st = STATUS_LABELS[q.status];
                return (
                  <div key={q.id} className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-5 transition flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">{q.quotationNumber}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>{st.label}</span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm">{q.customerName}</h3>
                      <p className="text-[11px] text-slate-500 mb-3 font-mono">{q.customerPhone || '—'}</p>
                      <div className="space-y-1.5 text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between"><span>تاريخ العرض</span><span className="font-mono text-slate-700">{q.date}</span></div>
                        <div className="flex justify-between">
                          <span>صالح لغاية</span>
                          <span className="font-mono text-slate-700 flex items-center gap-1.5">
                            {q.validUntil}
                            {q.status === 'PENDING' && (() => {
                              const days = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
                              if (days < 0) return <span className="text-[9px] font-bold text-slate-400">(منتهي)</span>;
                              if (days <= 7) return <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1">باقي {days} يوم</span>;
                              return null;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between"><span>البنود</span><span className="font-mono text-slate-700">{q.itemsCount || 0}</span></div>
                        {q.followUpDate && (
                          <div className="flex justify-between">
                            <span>المتابعة القادمة</span>
                            <span className={`font-mono ${q.status === 'PENDING' && q.followUpDate <= localDateString() ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>{q.followUpDate}</span>
                          </div>
                        )}
                        {(q.contactCount || 0) > 0 && <div className="flex justify-between"><span>مرات التواصل</span><span className="font-mono text-slate-700">{q.contactCount}</span></div>}
                        {q.convertedOrderNumber && <div className="flex justify-between"><span>الطلب</span><span className="font-mono text-sky-600">{q.convertedOrderNumber}</span></div>}
                        {q.convertedInvoiceNumber && <div className="flex justify-between"><span>الفاتورة</span><span className="font-mono text-emerald-600">{q.convertedInvoiceNumber}</span></div>}
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between mt-3">
                        <span className="text-xs text-slate-500">إجمالي المقايسة</span>
                        <span className="text-sm font-black text-emerald-600">{fmt(q.totalAmount)}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5 flex-wrap">
                      <Btn onClick={() => setDetail(service.getQuotation(q.id))} tone="slate"><Eye className="w-3.5 h-3.5" /> تفاصيل</Btn>
                      <Btn onClick={() => printService.printQuotation(service.getQuotation(q.id))} tone="slate"><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
                      <Btn onClick={() => shareOnWhatsApp(q)} tone="slate"><MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> واتساب</Btn>
                      {canCreate && q.status === 'PENDING' && (
                        <Btn onClick={() => openFollowUp(q)} tone="sky"><CalendarClock className="w-3.5 h-3.5" /> متابعة</Btn>
                      )}
                      {canCreate && q.status === 'PENDING' && (
                        <Btn onClick={() => logContact(q)} tone="slate"><PhoneCall className="w-3.5 h-3.5" /> تواصل</Btn>
                      )}
                      {canCreate && ['PENDING', 'EXPIRED'].includes(q.status) && (
                        <Btn onClick={() => openEdit(q)} tone="sky"><Pencil className="w-3.5 h-3.5" /> تعديل</Btn>
                      )}
                      {canCreate && q.status === 'PENDING' && !q.convertedOrderNumber && (
                        <Btn onClick={() => openConvertOrder(q)} tone="sky"><ShoppingBag className="w-3.5 h-3.5" /> طلب</Btn>
                      )}
                      {canCreate && q.status === 'PENDING' && (
                        <Btn onClick={() => openConvert(q)} tone="emerald"><Check className="w-3.5 h-3.5" /> فاتورة</Btn>
                      )}
                    </div>
                  </div>
                );
              })}
              {quotations.length === 0 && (
                <div className="col-span-full py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white">لا توجد عروض أسعار مطابقة.</div>
              )}
            </div>

            {quotations.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
                <span>{(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, quotations.length)} من {quotations.length}</span>
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
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-amber-600" /> {editingId ? 'تعديل عرض السعر' : 'إصدار عرض أسعار جديد'}</h3>
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
                <label className="font-bold text-slate-700 block mb-1">المخزن المرجعي</label>
                <select value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  <option value="">— بدون —</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">صلاحية العرض (أيام)</label>
                <input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm((p) => ({ ...p, validDays: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono" />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2 w-24">الكمية</th><th className="px-3 py-2 w-28">سعر الوحدة</th><th className="px-3 py-2 w-28">خصم البند</th><th className="px-3 py-2">الإجمالي</th><th className="px-3 py-2 w-8"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <select value={l.productId} onChange={(e) => pickProduct(idx, e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold">
                          <option value="">— اختر الصنف —</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.size} — {p.grade}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="number" min={0} step={products.find((product) => product.id === l.productId)?.productType === 'GENERAL' && ['BOX', 'PIECE', 'SET'].includes(products.find((product) => product.id === l.productId)?.baseUnit || '') ? 1 : 0.01} aria-label={`الكمية ${getFormUnit(l.productId)}`} value={l.quantityM2 || ''} onChange={(e) => setLine(idx, { quantityM2: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unitPrice || ''} onChange={(e) => setLine(idx, { unitPrice: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                      <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.discountAmount || ''} onChange={(e) => setLine(idx, { discountAmount: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono" /></td>
                      <td className="px-3 py-2 font-bold text-slate-700">{fmt(l.quantityM2 * l.unitPrice - (l.discountAmount || 0))}</td>
                      <td className="px-3 py-2"><button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== idx) : p.lines }))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2 border-t border-slate-100">
                <button type="button" onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, { productId: '', quantityM2: 0, unitPrice: 0, discountAmount: 0 }] }))} className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"><Plus className="w-3 h-3" /> إضافة بند</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumField label="خصم إجمالي (ج)" value={form.discount} onChange={(v) => setForm((p) => ({ ...p, discount: v }))} />
              <NumField label="ضريبة (ج)" value={form.tax} onChange={(v) => setForm((p) => ({ ...p, tax: v }))} />
              <div>
                <label className="font-bold text-slate-700 block mb-1">شروط وملاحظات</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200" placeholder="الأسعار شاملة النقل..." />
              </div>
            </div>

            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-xs font-bold text-amber-700">صافي قيمة المقايسة</span>
              <span className="text-lg font-black text-emerald-600">{fmt(total)}</span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? 'حفظ التعديلات' : 'حفظ عرض السعر'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal onClose={() => setDetail(null)} wide>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">عرض سعر {detail.quotationNumber}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{detail.date} • صالح لغاية {detail.validUntil} • {STATUS_LABELS[detail.status].label}</p>
            </div>
            <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Info label="العميل" value={detail.customerName || '—'} sub={detail.customerPhone || ''} />
            <Info label="المخزن المرجعي" value={warehouses.find((w) => w.id === detail.warehouseId)?.name || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة: ${detail.convertedInvoiceNumber}` : 'لم تُفوتر بعد'} />
            <Info label="القيمة" value={fmt(detail.totalAmount)} sub={`${detail.items?.length || 0} بند`} />
          </div>
          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[560px]">
              <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">السعر</th><th className="px-3 py-2">الخصم</th><th className="px-3 py-2">الإجمالي</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(detail.items || []).map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-bold text-slate-800">{i.productName}<div className="text-[9px] text-slate-400 font-normal">{i.size} • {i.grade}</div></td>
                    <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(i.quantityM2), i)}</td>
                    <td className="px-3 py-2 font-mono">{i.productType === 'GENERAL' ? '—' : i.boxesCount}</td>
                    <td className="px-3 py-2 font-mono">{fmt(i.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{i.discountAmount ? `-${fmt(i.discountAmount)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold">{fmt(i.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.notes && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 mb-4"><b>ملاحظات:</b> {detail.notes}</div>}
          {(detail.followUpDate || detail.followUpNotes || detail.convertedOrderNumber) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Info label="المتابعة القادمة" value={detail.followUpDate || '—'} sub={detail.followUpNotes || ''} />
              <Info label="مرات التواصل" value={String(detail.contactCount || 0)} sub={detail.lastContactAt ? `آخر تواصل ${detail.lastContactAt.slice(0, 10)}` : 'لم يتم تسجيل تواصل'} />
              <Info label="الطلب المرتبط" value={detail.convertedOrderNumber || '—'} sub={detail.convertedInvoiceNumber ? `الفاتورة ${detail.convertedInvoiceNumber}` : ''} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button onClick={() => printService.printQuotation(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة</button>
            <button onClick={() => shareOnWhatsApp(detail)} className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> واتساب</button>
            {canCreate && detail.status === 'PENDING' && (
              <button onClick={() => { setDetail(null); openFollowUp(detail); }} className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> جدولة متابعة</button>
            )}
            {canCreate && <button onClick={() => duplicate(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> نسخ</button>}
            {canCreate && ['PENDING', 'EXPIRED'].includes(detail.status) && (
              <button onClick={() => { setDetail(null); openEdit(detail); }} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> تعديل</button>
            )}
            {canCreate && detail.status === 'PENDING' && !detail.convertedOrderNumber && (
              <button onClick={() => { setDetail(null); openConvertOrder(detail); }} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> تحويل لطلب</button>
            )}
            {canCreate && detail.status === 'PENDING' && (
              <button onClick={() => { setDetail(null); openConvert(detail); }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> تحويل لفاتورة</button>
            )}
            {canCreate && detail.status === 'EXPIRED' && (
              <button onClick={() => reopenQuotation(detail)} className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> إعادة فتح</button>
            )}
            {canApprove && detail.status === 'PENDING' && (
              <button onClick={() => cancelQuotation(detail)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><CancelIcon className="w-3.5 h-3.5" /> إلغاء</button>
            )}
            {canCreate && detail.status !== 'CONVERTED' && (
              <button onClick={() => deleteQuotation(detail)} className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> حذف</button>
            )}
          </div>
        </Modal>
      )}

      {/* Follow-up modal */}
      {followUpTarget && (
        <Modal onClose={() => setFollowUpTarget(null)}>
          <form onSubmit={submitFollowUp} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-sky-600" /> متابعة عرض السعر {followUpTarget.quotationNumber}</h3>
              <button type="button" onClick={() => setFollowUpTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">العميل</span>
              <span className="font-bold text-slate-800">{followUpTarget.customerName} • {fmt(followUpTarget.totalAmount)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المتابعة</label>
                <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => setFollowUpDate('')} className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold">إلغاء المتابعة المجدولة</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات المتابعة</label>
              <textarea rows={3} value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="مثال: العميل يطلب خصم إضافي / سيحدد موعد الرد..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFollowUpTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ المتابعة</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Convert to order modal */}
      {orderTarget && (
        <Modal onClose={() => setOrderTarget(null)}>
          <form onSubmit={submitConvertOrder} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-sky-600" /> تحويل العرض {orderTarget.quotationNumber} إلى طلب</h3>
              <button type="button" onClick={() => setOrderTarget(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">قيمة العرض</span><span className="font-black text-sky-700">{fmt(orderTarget.totalAmount)}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسليم المتوقع</label>
              <input type="date" value={orderDeliveryDate} onChange={(e) => setOrderDeliveryDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الطلب</label>
              <input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11px] text-sky-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم حجز الكميات من المخزن كطلب مبيعات، ويمكن لاحقاً إصدار الفاتورة أو تسجيل التسليم.</div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOrderTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} إنشاء الطلب</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Convert modal */}
      {convertTarget && (
        <Modal onClose={() => setConvertTarget(null)}>
          <form onSubmit={submitConvert} className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600"><Receipt className="w-5 h-5" /><h3 className="text-base font-black">تحويل العرض {convertTarget.quotationNumber} إلى فاتورة</h3></div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">قيمة العرض</span><span className="font-black text-emerald-700">{fmt(convertTarget.totalAmount)}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المخزن المنصرف منه *</label>
              <select required value={convertWarehouse} onChange={(e) => setConvertWarehouse(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                <option value="">— اختر المخزن —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> سيتم خصم الكميات من المخزن مباشرة وإصدار فاتورة مبيعات عادية غير معتمدة إلكترونياً.</div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setConvertTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تحويل وإصدار</button>
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

const Stat: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold opacity-80">{label}</span><Icon className="w-4 h-4 opacity-70" /></div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

const Btn: React.FC<{ onClick: () => void; tone: 'slate' | 'sky' | 'emerald'; children: React.ReactNode }> = ({ onClick, tone, children }) => {
  const styles: Record<string, string> = {
    slate: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200',
    sky: 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
  };
  return <button onClick={onClick} className={`px-3 py-1.5 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${styles[tone]}`}>{children}</button>;
};

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
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
