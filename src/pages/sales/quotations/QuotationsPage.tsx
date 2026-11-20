import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Search, Calendar, Printer, Check, Loader2, Eye,
  Pencil, RefreshCw, FileSpreadsheet, FileDown, ChevronLeft,
  ChevronRight, Percent, Clock, CheckCircle2, AlertTriangle,
  MessageCircle, CalendarClock, ShoppingBag, PhoneCall,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useActivityPageCopy, useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
import { QuotationService, Quotation, QuotationStats, QuotationStatus } from '../../../services/domains/sales/QuotationService';
import { EmployeeService } from '../../../services/domains/hr/EmployeeService';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { InventoryService } from '../../../services/domains/inventory/InventoryService';
import { PrintService } from '../../../services/shared/PrintService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { Customer, Product, Warehouse, PaymentType } from '../../../types';
import { exportToExcel, buildExportHtml } from '../../../utils/export/export';

import { addLocalDays, localDateString } from '../../../utils/shared/date';
import {
  basePriceFromUnitPrice, convertQuantity, pricePerUnit,
} from '../../../utils/products/uom';
import { openWhatsAppChat } from '../../../utils/shared/externalLinks';
import { QuotationModals } from './QuotationModals';
import { emptyForm } from './QuotationModals';
import type { FormState, Line } from './QuotationModals';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../../../components/products/OperationalFieldsFilter';
import { OperationalFieldsChips } from '../../../components/products/OperationalFieldsChips';


import { useToast } from '../../../components/ui/Toast';
const PAGE_SIZE = 12;

const STATUS_LABELS: Record<QuotationStatus, { label: string; color: string }> = {
  PENDING: { label: 'بانتظار الموافقة', color: 'bg-warning/10 text-warning border-warning/20' },
  CONVERTED: { label: 'محوّل إلى فاتورة', color: 'bg-success/10 text-success border-success/20' },
  EXPIRED: { label: 'منتهي الصلاحية', color: 'bg-surface-sunken text-muted border-line-strong' },
  CANCELLED: { label: 'ملغي', color: 'bg-danger/10 text-danger border-danger/20' },
};

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

export const QuotationsPage: React.FC = () => {
  const toast = useToast();
  const service = useMemo(() => new QuotationService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const fieldService = useMemo(() => new OperationalFieldService(), []);
  const user = AuthService.getCurrentUser();
  const canCreate = PermissionService.can(user, 'ui.quotations.quotations.create');
  const canUpdate = PermissionService.can(user, 'ui.quotations.quotations.update');
  const canDelete = PermissionService.can(user, 'ui.quotations.quotations.delete');
  const canApprove = PermissionService.can(user, 'ui.quotations.quotations.approve');
  const pageCopy = useActivityPageCopy('quotations');
  const newQuotationLabel = useBusinessTerm('actions.newQuotation');

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
  const [salesReps, setSalesReps] = useState<ReturnType<typeof EmployeeService.getSalesReps>>([]);
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
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldValues, setOperationalFieldValues] = useState<Record<string, string>>({});
  const [valuesByQuotation, setValuesByQuotation] = useState<Record<string, Record<string, string>>>({});
  const [fieldFilters, setFieldFilters] = useState<OperationalFieldFilters>({});

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

  const load = useCallback(() => {
    setLoading(true);
    try {
      const rows = service.getQuotations({
        search, status: statusFilter, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
      });
      setOperationalFields(fieldService.getDefinitions('quotations'));
      const fieldValues = fieldService.getRecordValuesForRecords('quotations', rows.map((row) => row.id));
      setValuesByQuotation(fieldValues);
      const today = localDateString();
      setQuotations(
        followUpOnly
          ? rows.filter((q) => q.status === 'PENDING' && q.followUpDate && q.followUpDate <= today
            && matchesOperationalFieldFilters(q.id, fieldValues, fieldFilters))
          : rows.filter((q) => matchesOperationalFieldFilters(q.id, fieldValues, fieldFilters))
      );
      setStats(service.getStats());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل عروض الأسعار.');
    } finally {
      setLoading(false);
    }
  }, [service, fieldService, search, statusFilter, dateFrom, dateTo, followUpOnly, fieldFilters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, followUpOnly]);
  useEffect(() => {
    const branchId = warehouses.find((w) => w.id === form.warehouseId)?.branchId;
    setSalesReps(EmployeeService.getSalesReps(branchId));
  }, [form.warehouseId, warehouses]);

  const totalPages = Math.max(1, Math.ceil(quotations.length / PAGE_SIZE));
  const pageItems = quotations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loadReferences = () => {
    setCustomers(customerService.getAllCustomers());
    setProducts(productService.getAllProducts());
    const whs = inventoryService.getAllWarehouses();
    setWarehouses(whs);
    setSalesReps(EmployeeService.getSalesReps());
    return whs;
  };

  const openCreate = () => {
    try {
      const whs = loadReferences();
      setEditingId(null);
      setForm({ ...emptyForm(), warehouseId: service.getDefaultWarehouseId() || whs[0]?.id || '' });
      setOperationalFieldValues({});
      setFormOpen(true);
    } catch (e: any) { toast.error(e?.message || 'تعذر تحميل البيانات.'); }
  };

  const openEdit = (quotation: Quotation) => {
    try {
      loadReferences();
      const full = service.getQuotation(quotation.id) || quotation;
      setEditingId(full.id);
      setOperationalFieldValues(fieldService.getRecordValues('quotations', full.id));
      const days = Math.max(1, Math.round((new Date(full.validUntil).getTime() - Date.now()) / 86400000)) || 15;
      setForm({
        customerId: full.customerId,
        warehouseId: full.warehouseId || '',
        salesRepId: full.salesRepId || '',
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
        serviceLines: (full.serviceItems || []).map((item) => ({
          productId: item.productId || undefined,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
        })),
      });
      setFormOpen(true);
    } catch (e: any) { toast.error(e?.message || 'تعذر تحميل عرض السعر.'); }
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

  const subtotal = form.lines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discountAmount || 0), 0)
    + form.serviceLines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discountAmount || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0) + (Number(form.tax) || 0));

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.lines.filter((l) => l.productId && l.quantity > 0);
    const serviceItems = form.serviceLines.filter((line) => line.description.trim() && line.quantity > 0);
    if (!form.customerId) return toast.warning('اختر العميل.');
    if (items.length === 0 && serviceItems.length === 0) return toast.warning('أضف بنداً واحداً على الأقل بكمية أكبر من صفر.');
    setSaving(true);
    try {
      fieldService.validateRecordValues(
        'quotations', operationalFieldValues, editingId ? 'update' : 'create', editingId || undefined,
      );
      const payload = {
        customerId: form.customerId,
        warehouseId: form.warehouseId || undefined,
        salesRepId: form.salesRepId || undefined,
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
        serviceItems: serviceItems.map((line) => ({
          productId: line.productId || undefined,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount || 0,
        })),
      };
      if (editingId) {
        service.updateQuotation(editingId, payload);
        fieldService.setRecordValues('quotations', editingId, operationalFieldValues, 'update');
      } else {
        const created = service.createQuotation(payload);
        fieldService.setRecordValues('quotations', created.id, operationalFieldValues, 'create');
      }
      setOperationalFieldValues({});
      setFormOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ عرض السعر.');
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
      toast.success(`تم تحويل عرض السعر إلى الفاتورة ${invoice.invoiceNumber} بنجاح.`);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحويل عرض السعر.');
    } finally {
      setSaving(false);
    }
  };

  const cancelQuotation = (quotation: Quotation) => {
    if (!window.confirm(`إلغاء عرض السعر ${quotation.quotationNumber}؟`)) return;
    try { service.setStatus(quotation.id, 'CANCELLED'); load(); setDetail(null); }
    catch (e: any) { toast.warning(e?.message); }
  };

  const reopenQuotation = (quotation: Quotation) => {
    try { service.setStatus(quotation.id, 'PENDING'); load(); setDetail(null); }
    catch (e: any) { toast.warning(e?.message); }
  };

  const deleteQuotation = (quotation: Quotation) => {
    if (!window.confirm(`حذف عرض السعر ${quotation.quotationNumber} نهائياً؟`)) return;
    try { service.deleteQuotation(quotation.id); load(); setDetail(null); }
    catch (e: any) { toast.warning(e?.message); }
  };

  const duplicate = (quotation: Quotation) => {
    try { service.duplicateQuotation(quotation.id); load(); }
    catch (e: any) { toast.warning(e?.message); }
  };

  const shareOnWhatsApp = (quotation: Quotation) => {
    const text =
      `مرحباً ${quotation.customerName || ''}\nعرض السعر رقم ${quotation.quotationNumber}\n` +
      `الإجمالي: ${fmt(quotation.totalAmount)}\nصالح حتى: ${quotation.validUntil}\n` +
      `يسعدنا خدمتكم.`;
    openWhatsAppChat(quotation.customerPhone || '', text);
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
      toast.error(err?.message || 'تعذر حفظ المتابعة.');
    } finally {
      setSaving(false);
    }
  };

  const logContact = (quotation: Quotation) => {
    try {
      service.recordContact(quotation.id, `تم التواصل مع العميل بتاريخ ${localDateString()}`);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل التواصل.');
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
      toast.success(`تم إنشاء الطلب ${order.orderNumber} بنجاح.`);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تحويل عرض السعر إلى طلب.');
    } finally {
      setSaving(false);
    }
  };

  const doExport = (_kind: 'excel' | 'pdf') => {
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
        ...operationalFields.map((field) => ({ key: field.name, label: field.name })),
      ],
      rows: quotations.map((q) => ({
        quotationNumber: q.quotationNumber, date: q.date, validUntil: q.validUntil,
        customer: q.customerName || '', phone: q.customerPhone || '',
        items: q.itemsCount || 0, total: q.totalAmount,
        status: STATUS_LABELS[q.status].label,
        followUp: q.followUpDate || '',
        order: q.convertedOrderNumber || '',
        invoice: q.convertedInvoiceNumber || '',
        ...(fieldService.getRecordValuesForExport('quotations', [q.id])[q.id] || {}),
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
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<FileText className="w-5 h-5" />}
          title={pageCopy?.title || 'عروض الأسعار والمقايسات'}
          description={pageCopy?.description || 'إنشاء المقايسات، متابعة صلاحيتها، وتحويلها إلى فواتير مبيعات معتمدة'}
          meta={<OperationalFieldsFilter fields={operationalFields} values={fieldFilters} onChange={setFieldFilters} />}
          actions={<>
            <button onClick={() => doExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-line hover:bg-surface-muted text-ink rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-success" /> جدول بيانات</button>
            <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-line hover:bg-surface-muted text-ink rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-danger" /> مستند</button>
            {canCreate && (
              <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-white rounded-xl text-xs font-bold transition"><Plus className="w-4 h-4" /> {newQuotationLabel}</button>
            )}
          </>}
        />
      </div>

      <div className="p-4 bg-surface border-b border-line space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <Stat label="إجمالي العروض" value={String(stats?.total ?? 0)} icon={FileText} tone="text-ink bg-surface-muted border-line" />
          <Stat label="بانتظار الموافقة" value={`${stats?.pending ?? 0} • ${fmt(stats?.pendingValue ?? 0)}`} icon={Clock} tone="text-warning bg-warning-soft border-warning-border" />
          <Stat label="محوّلة لفواتير" value={`${stats?.converted ?? 0} • ${fmt(stats?.convertedValue ?? 0)}`} icon={CheckCircle2} tone="text-success bg-success-soft border-success-border" />
          <Stat label="منتهية الصلاحية" value={String(stats?.expired ?? 0)} icon={AlertTriangle} tone="text-ink-secondary bg-surface-muted border-line" />
          <Stat label="متابعات مستحقة" value={String(stats?.followUpDue ?? 0)} icon={PhoneCall} tone="text-danger bg-danger-soft border-danger-border" />
          <Stat label="تنتهي قريباً" value={String(stats?.expiringSoon ?? 0)} icon={CalendarClock} tone="text-primary bg-accent-soft border-accent-border" />
          <Stat label="إجمالي القيمة" value={fmt(stats?.totalValue ?? 0)} icon={Percent} tone="text-primary bg-accent-soft border-accent-border" />
        </div>

        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم العرض أو العميل أو الهاتف أو الفاتورة..." className="w-full pl-4 pr-10 py-2 bg-surface-muted border border-line rounded-xl text-xs font-medium focus:outline-none focus:border-warning" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-muted border border-line rounded-xl px-2 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
              <span className="text-muted">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-surface-muted border border-line rounded-xl text-[11px] font-bold">
              <option value="ALL">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setFollowUpOnly((v) => !v)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${followUpOnly ? 'bg-danger text-white border-danger' : 'bg-surface-muted text-ink-secondary border-line hover:bg-surface-sunken'}`}
            >
              <PhoneCall className="w-3.5 h-3.5" /> متابعات مستحقة
            </button>
            <button onClick={load} className="p-2 bg-surface-muted border border-line rounded-xl text-ink-secondary hover:bg-surface-sunken" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-warning" /></div> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageItems.map((q) => {
                const st = STATUS_LABELS[q.status];
                return (
                  <div key={q.id} className="bg-surface border border-line hover:border-warning rounded-2xl p-5 transition flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-lg border border-warning/20">{q.quotationNumber}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${st.color}`}>{st.label}</span>
                      </div>
                      <h3 className="font-bold text-ink text-sm">{q.customerName}</h3>
                      <p className="text-[11px] text-muted mb-3 font-mono">{q.customerPhone || '—'}</p>
                      <div className="space-y-1.5 text-[11px] text-muted bg-surface-muted p-3 rounded-xl border border-line">
                        <div className="flex justify-between"><span>تاريخ العرض</span><span className="font-mono text-ink">{q.date}</span></div>
                        <div className="flex justify-between">
                          <span>صالح لغاية</span>
                          <span className="font-mono text-ink flex items-center gap-1.5">
                            {q.validUntil}
                            {q.status === 'PENDING' && (() => {
                              const days = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
                              if (days < 0) return <span className="text-[9px] font-bold text-muted">(منتهي)</span>;
                              if (days <= 7) return <span className="text-[9px] font-bold text-danger bg-danger-soft border border-danger-border rounded px-1">باقي {days} يوم</span>;
                              return null;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between"><span>البنود</span><span className="font-mono text-ink">{q.itemsCount || 0}</span></div>
                        {q.followUpDate && (
                          <div className="flex justify-between">
                            <span>المتابعة القادمة</span>
                            <span className={`font-mono ${q.status === 'PENDING' && q.followUpDate <= localDateString() ? 'text-danger font-bold' : 'text-ink'}`}>{q.followUpDate}</span>
                          </div>
                        )}
                        {(q.contactCount || 0) > 0 && <div className="flex justify-between"><span>مرات التواصل</span><span className="font-mono text-ink">{q.contactCount}</span></div>}
                        {q.convertedOrderNumber && <div className="flex justify-between"><span>الطلب</span><span className="font-mono text-primary">{q.convertedOrderNumber}</span></div>}
                        {q.convertedInvoiceNumber && <div className="flex justify-between"><span>الفاتورة</span><span className="font-mono text-success">{q.convertedInvoiceNumber}</span></div>}
                      </div>
                      <div className="bg-surface rounded-xl p-3 border border-line flex items-center justify-between mt-3">
                        <span className="text-xs text-muted">إجمالي المقايسة</span>
                        <span className="text-sm font-black text-success">{fmt(q.totalAmount)}</span>
                      </div>
                      {operationalFields.length > 0 && (
                        <div className="mt-2">
                          <OperationalFieldsChips fields={operationalFields} values={valuesByQuotation[q.id]} max={4} />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-end gap-1.5 flex-wrap">
                      <Btn onClick={() => setDetail(service.getQuotation(q.id))} tone="slate"><Eye className="w-3.5 h-3.5" /> تفاصيل</Btn>
                      <Btn onClick={() => printService.printQuotation(service.getQuotation(q.id))} tone="slate"><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
                      <Btn onClick={() => shareOnWhatsApp(q)} tone="slate"><MessageCircle className="w-3.5 h-3.5 text-success" /> واتساب</Btn>
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
                <div className="col-span-full py-16 text-center text-muted border-2 border-dashed border-line rounded-2xl bg-surface">لا توجد عروض أسعار مطابقة.</div>
              )}
            </div>

            {quotations.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 text-xs text-muted">
                <span>{(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, quotations.length)} من {quotations.length}</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-line bg-surface disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                  <span className="px-3 font-bold">{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-line bg-surface disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
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
        salesReps={salesReps}
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
        operationalFields={operationalFields}
        operationalFieldValues={detail ? fieldService.getRecordValues('quotations', detail.id) : operationalFieldValues}
        onOperationalFieldValuesChange={setOperationalFieldValues}
        canUpdateOperationalFields={canUpdate}
        onSaveOperationalFields={(quotationId, values) => {
          fieldService.setRecordValues('quotations', quotationId, values, 'update');
          setValuesByQuotation((previous) => ({ ...previous, [quotationId]: values }));
        }}
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
    slate: 'bg-surface-sunken hover:bg-surface-sunken text-ink border-line',
    sky: 'bg-accent-soft hover:bg-accent-soft text-primary border-accent-border',
    emerald: 'bg-success hover:bg-success text-white border-success',
  };
  return <button onClick={onClick} className={`px-3 py-1.5 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${styles[tone]}`}>{children}</button>;
};
