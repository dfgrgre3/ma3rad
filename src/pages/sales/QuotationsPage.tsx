import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Search, Calendar, Printer, Trash2, Check, Loader2, Eye,
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
import { formatProductQuantity } from '../../utils/productUnits';
import {
  basePriceFromUnitPrice, convertQuantity, getSellableUnits, getUomLabel, isWholeUnit, pricePerUnit,
} from '../../utils/uom';
import { buildWhatsAppUrl, openExternalShare } from '../../utils/externalLinks';
import { QuotationModals } from './QuotationModals';
import { emptyForm } from './QuotationModals';
import type { FormState, Line } from './QuotationModals';


const PAGE_SIZE = 12;

const STATUS_LABELS: Record<QuotationStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الموافقة', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  CONVERTED: { label: 'محوّل إلى فاتورة', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-slate-200 text-slate-500 border-slate-300' },
  CANCELLED: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export const QuotationsPage: React.FC = () => {
  const service = useMemo(() => new QuotationService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'quotations.create');
  const canUpdate = PermissionService.can(user, 'quotations.update');
  const canDelete = PermissionService.can(user, 'quotations.delete');
  const canApprove = PermissionService.can(user, 'quotations.approve');

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

  useEffect(() => { load();   }, [search, statusFilter, dateFrom, dateTo, followUpOnly]);
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
          productId: i.productId,
          uom: i.baseUnit || 'M2',
          quantity: i.quantityM2,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount || 0,
        })),
      });
      setFormOpen(true);
    } catch (e: any) { alert(e?.message || 'تعذر تحميل عرض السعر.'); }
  };

  const setLine = (idx: number, patch: Partial<Line>) =>
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const pickProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(idx, {
      productId,
      uom: p ? (p.baseUnit || 'M2') : '',
      unitPrice: p ? (p.sellingPriceM2 || 0) : 0,
    });
  };

  /** Switch the line unit while keeping the same effective base-unit price. */
  const changeLineUnit = (idx: number, unit: string) => {
    const line = form.lines[idx];
    const product = products.find((p) => p.id === line.productId);
    if (!product) return setLine(idx, { uom: unit });
    const basePrice = basePriceFromUnitPrice(line.unitPrice, line.uom || product.baseUnit || 'M2', product);
    const converted = pricePerUnit(basePrice, unit, product);
    setLine(idx, { uom: unit, unitPrice: Math.round(converted * 100) / 100 });
  };

  const lineBaseQuantity = (line: Line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product || !line.uom) return line.quantity;
    try {
      return convertQuantity(line.quantity, line.uom, product.baseUnit || 'M2', product);
    } catch {
      return line.quantity;
    }
  };

  const subtotal = form.lines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discountAmount || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0));

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.lines.filter((l) => l.productId && l.quantity > 0);
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
        items: items.map((l) => ({
          productId: l.productId,
          quantityM2: 0,
          quantity: l.quantity,
          uom: l.uom || undefined,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || 0,
        })),
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
    openExternalShare(buildWhatsAppUrl(phone, text), decodeURIComponent(text));
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
      permission: 'quotations.export',
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
          <button onClick={() => doExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> جدول بيانات</button>
          <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> مستند</button>
          {canCreate && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition"><Plus className="w-4 h-4" /> عرض أسعار جديد</button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
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

      <QuotationModals
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        canApprove={canApprove}
        saving={saving}
        formOpen={formOpen}
        setFormOpen={setFormOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        submitForm={submitForm}
        customers={customers}
        products={products}
        warehouses={warehouses}
        setLine={setLine}
        pickProduct={pickProduct}
        changeLineUnit={changeLineUnit}
        lineBaseQuantity={lineBaseQuantity}
        total={total}
        detail={detail}
        setDetail={setDetail}
        convertTarget={convertTarget}
        setConvertTarget={setConvertTarget}
        convertWarehouse={convertWarehouse}
        setConvertWarehouse={setConvertWarehouse}
        convertPaymentType={convertPaymentType}
        setConvertPaymentType={setConvertPaymentType}
        convertPaid={convertPaid}
        setConvertPaid={setConvertPaid}
        convertNotes={convertNotes}
        setConvertNotes={setConvertNotes}
        submitConvert={submitConvert}
        orderTarget={orderTarget}
        setOrderTarget={setOrderTarget}
        orderDeliveryDate={orderDeliveryDate}
        setOrderDeliveryDate={setOrderDeliveryDate}
        orderNotes={orderNotes}
        setOrderNotes={setOrderNotes}
        submitConvertOrder={submitConvertOrder}
        followUpTarget={followUpTarget}
        setFollowUpTarget={setFollowUpTarget}
        followUpDate={followUpDate}
        setFollowUpDate={setFollowUpDate}
        followUpNotes={followUpNotes}
        setFollowUpNotes={setFollowUpNotes}
        submitFollowUp={submitFollowUp}
        docPreview={docPreview}
        setDocPreview={setDocPreview}
        printService={printService}
        shareOnWhatsApp={shareOnWhatsApp}
        openFollowUp={openFollowUp}
        duplicate={duplicate}
        openEdit={openEdit}
        openConvertOrder={openConvertOrder}
        openConvert={openConvert}
        reopenQuotation={reopenQuotation}
        cancelQuotation={cancelQuotation}
        deleteQuotation={deleteQuotation}
      />
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

