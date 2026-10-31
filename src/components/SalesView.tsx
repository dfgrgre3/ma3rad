import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt, Search, Printer, RotateCcw, FileText, Plus, X, Eye, Ban,
  FileSpreadsheet, FileDown, ChevronRight, ChevronLeft, User, CreditCard,
  Loader2, RefreshCw, Wallet, TrendingUp, Banknote, CheckCircle2, AlertTriangle,
  ShoppingCart, CalendarDays, Percent, Users, Warehouse, FileBarChart, XCircle, Info,
} from 'lucide-react';
import { SalesService, InvoiceFilters, InvoiceStats } from '../services/SalesService';
import { CustomerService } from '../services/CustomerService';
import { InventoryService } from '../services/InventoryService';
import { PrintService } from '../services/PrintService';
import { AuthService } from '../services/AuthService';
import { PermissionService } from '../services/PermissionService';
import { SalesInvoice, SalesInvoiceItem, CustomerPayment, PaymentType, Customer, Warehouse as WarehouseType } from '../types';
import { CeramicMath } from '../utils/ceramicMath';
import { formatProductQuantity, getProductUnitLabel } from '../utils/productUnits';
import { exportToExcel, buildExportHtml } from '../utils/export';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { SalesModals } from './sales/SalesModals';
import { StatCard, IconButton, Modal, InfoBox, SummaryRow } from './sales/SalesUi';
import { localDateString } from '../utils/date';
import { buildWhatsAppUrl, openExternalShare } from '../utils/externalLinks';
import { useBusinessProfileMeta, useBusinessTerm } from '../hooks/useBusinessTerm';

type InvoiceRow = SalesInvoice & { itemsCount?: number; returnedAmount?: number };

const PAGE_SIZE = 20;
const fmt = (n: number) => CeramicMath.formatCurrency(Number(n) || 0);

const paymentStatusLabel: Record<string, string> = {
  PAID: 'مسددة بالكامل',
  PARTIAL: 'مسدد جزء',
  UNPAID: 'آجل / غير مسدد',
};

const paymentTypeLabel: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  CREDIT: 'آجل',
  MIXED: 'مختلط',
};

export const SalesView: React.FC = () => {
  const navigate = useNavigate();
  const salesLabel = useBusinessTerm('modules.sales');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const salesService = useMemo(() => new SalesService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canVoid = PermissionService.can(user, 'sales.void');
  const canCollect = PermissionService.can(user, 'customers.payment');
  const canViewDebts = PermissionService.can(user, 'finance.debts.view');
  const canViewCustomerStatement = PermissionService.can(user, 'customers.view') && canViewDebts;
  const canViewReturns = PermissionService.can(user, 'returns.view');
  const canRefund = PermissionService.can(user, 'sales.refund');
  const canExport = PermissionService.can(user, 'sales.export');
  const canCreate = PermissionService.can(user, 'sales.create');
  const canExportCustomers = PermissionService.can(user, 'customers.export');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'VOID'>('COMPLETED');
  const [customerFilter, setCustomerFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [page, setPage] = useState(1);

  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
    whatsapp?: () => void;
  } | null>(null);
  const [selected, setSelected] = useState<(SalesInvoice & { items: SalesInvoiceItem[] }) | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [voidTarget, setVoidTarget] = useState<InvoiceRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [payTarget, setPayTarget] = useState<(SalesInvoice & { items: SalesInvoiceItem[] }) | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<PaymentType>('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [statement, setStatement] = useState<ReturnType<CustomerService['getCustomerStatement']> | null>(null);

  const filters: InvoiceFilters = useMemo(() => ({
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    paymentStatus: paymentFilter,
    invoiceStatus: statusFilter,
    customerId: customerFilter || undefined,
    warehouseId: warehouseFilter || undefined,
  }), [search, dateFrom, dateTo, paymentFilter, statusFilter, customerFilter, warehouseFilter]);

  useEffect(() => {
    try {
      setCustomers(customerService.getAllCustomers());
      setWarehouses(inventoryService.getAllWarehouses());
    } catch {
      /* reference data is optional for the list screen */
    }
  }, [customerService, inventoryService]);

  const applyPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'clear') => {
    const today = new Date();
    const iso = (d: Date) => localDateString(d);
    if (preset === 'clear') { setDateFrom(''); setDateTo(''); return; }
    if (preset === 'today') { setDateFrom(iso(today)); setDateTo(iso(today)); return; }
    if (preset === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      setDateFrom(iso(y)); setDateTo(iso(y)); return;
    }
    if (preset === 'week') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      setDateFrom(iso(start)); setDateTo(iso(today)); return;
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    setDateFrom(iso(start)); setDateTo(iso(today));
  };

  const openStatement = (customerId: string) => {
    try {
      setStatement(customerService.getCustomerStatement(customerId));
    } catch (e: any) {
      alert(e?.message || 'تعذر فتح كشف الحساب.');
    }
  };

  const statementExportOptions = (st: NonNullable<typeof statement>) => ({
    title: `كشف حساب العميل - ${st.customer.name}`,
    subtitle: `الرصيد الحالي: ${fmt(st.customer.currentBalance || 0)}`,
    columns: [
      { key: 'date', label: 'التاريخ' },
      { key: 'docNumber', label: 'المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'debit', label: 'مدين' },
      { key: 'credit', label: 'دائن' },
      { key: 'balanceAfter', label: 'الرصيد' },
    ],
    rows: st.transactions.map((tx) => ({
      date: tx.date, docNumber: tx.docNumber, description: tx.description,
      debit: tx.debit, credit: tx.credit, balanceAfter: tx.balanceAfter,
    })),
    fileName: `statement-${st.customer.code || st.customer.id}`,
    permission: 'customers.export',
  });

  const clearFilters = () => {
    setSearch(''); setDateFrom(''); setDateTo('');
    setPaymentFilter('ALL'); setStatusFilter('COMPLETED');
    setCustomerFilter(''); setWarehouseFilter('');
  };

  const load = () => {
    setLoading(true);
    try {
      setInvoices(salesService.getInvoicesFiltered(filters) as InvoiceRow[]);
      setStats(salesService.getStats(filters));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل فواتير المبيعات.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filters]);

  useEffect(() => { setPage(1); }, [filters]);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const pageItems = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openDetails = (invoice: InvoiceRow) => {
    const full = salesService.getInvoiceById(invoice.id);
    if (!full) return;
    setSelected(full);
    setPayments(canViewDebts ? salesService.getInvoicePayments(invoice.id) : []);
  };

  const refreshSelected = (invoiceId: string) => {
    const full = salesService.getInvoiceById(invoiceId);
    setSelected(full);
    setPayments(canViewDebts ? salesService.getInvoicePayments(invoiceId) : []);
  };

  const openVoid = (invoice: InvoiceRow) => {
    setVoidTarget(invoice);
    setVoidReason('');
  };

  const submitVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    if (!voidReason.trim()) return alert('يرجى إدخال سبب الإلغاء.');
    setSaving(true);
    try {
      salesService.voidInvoice(voidTarget.id, voidReason.trim());
      setVoidTarget(null);
      setSelected(null);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر إلغاء الفاتورة.');
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (invoice: SalesInvoice & { items: SalesInvoiceItem[] }) => {
    if (!invoice || invoice.remainingAmount <= 0) return;
    setPayTarget(invoice);
    setPayAmount(String(invoice.remainingAmount));
    setPayType('CASH');
    setPayNotes('');
  };

  const submitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return alert('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
    if (amount > payTarget.remainingAmount) return alert('المبلغ أكبر من المتبقي على الفاتورة.');
    setSaving(true);
    try {
      salesService.recordInvoicePayment(payTarget.id, amount, payType, undefined, undefined, payNotes);
      setPayTarget(null);
      refreshSelected(payTarget.id);
      load();
    } catch (err: any) {
      alert(err?.message || 'تعذر تسجيل التحصيل.');
    } finally {
      setSaving(false);
    }
  };

  const exportRows = () => invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    date: inv.date,
    customer: inv.customerName || '',
    phone: inv.customerPhone || '',
    warehouse: inv.warehouseName || '',
    total: inv.totalAmount,
    ...(canViewDebts ? {
      paid: inv.paidAmount,
      remaining: inv.remainingAmount,
      status: paymentStatusLabel[inv.paymentStatus] || inv.paymentStatus,
    } : {}),
    ...(canViewReturns ? { returned: inv.returnedAmount || 0 } : {}),
    profit: inv.grossProfit,
    invoiceStatus: inv.invoiceStatus === 'VOID' ? 'ملغاة' : 'مكتملة',
  }));

  const exportColumns = [
    { key: 'invoiceNumber', label: 'رقم الفاتورة' },
    { key: 'date', label: 'التاريخ' },
    { key: 'customer', label: 'العميل' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'warehouse', label: 'المخزن' },
    { key: 'total', label: 'الإجمالي' },
    ...(canViewDebts ? [
      { key: 'paid', label: 'المدفوع' },
      { key: 'remaining', label: 'المتبقي' },
      { key: 'status', label: 'حالة السداد' },
    ] : []),
    ...(canViewReturns ? [{ key: 'returned', label: 'المرتجع' }] : []),
    { key: 'profit', label: 'الربح' },
    { key: 'invoiceStatus', label: 'حالة الفاتورة' },
  ];

  const doExport = (_kind: 'excel' | 'pdf') => {
    const options = {
      title: 'سجل فواتير المبيعات',
      subtitle: `عدد الفواتير: ${invoices.length}`,
      columns: exportColumns,
      rows: exportRows(),
      fileName: 'sales-invoices',
      permission: 'sales.export',
    };
    setDocPreview({
      title: 'معاينة سجل فواتير المبيعات',
      subtitle: options.subtitle,
      fileName: options.fileName,
      html: buildExportHtml(options),
      excel: () => exportToExcel(options),
    });
  };

  const invoiceExcelOptions = (full: SalesInvoice & { items: SalesInvoiceItem[] }) => ({
    title: `فاتورة مبيعات ${full.invoiceNumber}`,
    subtitle: `${full.customerName || 'عميل نقدي'} • ${full.date} • ${full.warehouseName || ''}`,
    columns: [
      { key: 'idx', label: '#' },
      { key: 'product', label: 'الصنف' },
      { key: 'sku', label: 'الكود' },
      { key: 'qty', label: 'الكمية' },
      { key: 'boxes', label: 'الكراتين' },
      { key: 'price', label: 'سعر الوحدة' },
      { key: 'discount', label: 'الخصم' },
      { key: 'total', label: 'الإجمالي' },
    ],
    rows: full.items.map((item, idx) => ({
      idx: idx + 1,
      product: item.productName,
      sku: item.productSku || '',
      qty: formatProductQuantity(item.quantityM2, item),
      boxes: item.productType === 'GENERAL' ? '' : item.boxesCount,
      price: item.unitPrice,
      discount: item.discountAmount,
      total: item.totalPrice,
    })),
    fileName: `invoice-${full.invoiceNumber}`,
    permission: 'sales.export',
  });

  const shareInvoiceWhatsApp = (full: SalesInvoice & { items: SalesInvoiceItem[] }) => {
    const phone = (full.customerPhone || '').replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `فاتورة مبيعات ${full.invoiceNumber}\nالتاريخ: ${full.date}\n` +
      `الإجمالي: ${fmt(full.totalAmount)}\nالمدفوع: ${fmt(full.paidAmount)}\n` +
      (full.remainingAmount > 0 ? `المتبقي: ${fmt(full.remainingAmount)}\n` : '') +
      `شكراً لتعاملكم معنا.`
    );
    openExternalShare(buildWhatsAppUrl(phone, text), decodeURIComponent(text));
  };

  const openInvoicePreview = (invoice: InvoiceRow) => {
    const full = salesService.getInvoiceById(invoice.id);
    if (!full) return;
    const excel = invoiceExcelOptions(full);
    setDocPreview({
      title: `معاينة الفاتورة ${full.invoiceNumber}`,
      subtitle: `${full.customerName || 'عميل نقدي'} • ${full.date} • ${fmt(full.totalAmount)}`,
      fileName: `invoice-${full.invoiceNumber}`,
      html: printService.getInvoiceHtml(full),
      excel: () => exportToExcel(excel),
      whatsapp: full.customerPhone ? () => shareInvoiceWhatsApp(full) : undefined,
    });
  };

  const goToReturn = (invoiceId: string) => {
    navigate('/returns', { state: { invoiceId } });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">
              سجل فواتير {salesLabel}
              <span className="ml-2 text-sm font-bold text-sky-700">· {businessProfileLabel}</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              متابعة الفواتير، التحصيلات، المرتجعات، وإعادة الطباعة مع رقابة كاملة على الحسابات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canExport && <button
            onClick={() => doExport('excel')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> جدول بيانات
          </button>}
          {canExport && <button
            onClick={() => doExport('pdf')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <FileDown className="w-4 h-4 text-rose-600" /> مستند
          </button>}
          {canCreate && <button
            onClick={() => navigate('/pos')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            <Plus className="w-4 h-4" /> فاتورة جديدة (POS)
          </button>}
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard label="عدد الفواتير" value={String(stats?.count ?? 0)} icon={Receipt} tone="text-slate-700 bg-slate-50 border-slate-200" />
          <StatCard label="إجمالي المبيعات" value={fmt(stats?.totalAmount ?? 0)} icon={TrendingUp} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
          {canViewDebts && <StatCard label="المحصّل" value={fmt(stats?.paidAmount ?? 0)} icon={Wallet} tone="text-sky-700 bg-sky-50 border-sky-200" />}
          {canViewDebts && <StatCard label="المتبقي (آجل)" value={fmt(stats?.remainingAmount ?? 0)} icon={Banknote} tone="text-amber-700 bg-amber-50 border-amber-200" />}
          {canViewReturns && <StatCard label="المرتجعات" value={fmt(stats?.returnedAmount ?? 0)} icon={RotateCcw} tone="text-rose-700 bg-rose-50 border-rose-200" />}
          <StatCard label="الربح الإجمالي" value={fmt(stats?.grossProfit ?? 0)} icon={Percent} tone="text-violet-700 bg-violet-50 border-violet-200" />
        </div>

        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل أو الهاتف..."
              className="w-full pl-4 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
              <span className="text-slate-300">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
            </div>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
              <option value="ALL">كل حالات السداد</option>
              <option value="PAID">مسددة بالكامل</option>
              <option value="PARTIAL">مسدد جزء</option>
              <option value="UNPAID">آجل / غير مسدد</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
              <option value="COMPLETED">الفواتير المكتملة</option>
              <option value="VOID">الفواتير الملغاة</option>
              <option value="ALL">كل الفواتير</option>
            </select>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="max-w-[180px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
              <option value="">كل العملاء</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold">
              <option value="">كل المخازن</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={load} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100" title="تحديث">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 ml-1">فترات سريعة:</span>
          {([
            ['today', 'اليوم'],
            ['yesterday', 'أمس'],
            ['week', 'آخر 7 أيام'],
            ['month', 'هذا الشهر'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => applyPreset(key)} className="px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 rounded-lg text-[10px] font-bold transition">{label}</button>
          ))}
          <button onClick={() => applyPreset('clear')} className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500">مسح التاريخ</button>
          {(search || dateFrom || dateTo || customerFilter || warehouseFilter || paymentFilter !== 'ALL' || statusFilter !== 'COMPLETED') && (
            <button onClick={clearFilters} className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[10px] font-bold text-rose-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> مسح كل الفلاتر
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-right text-xs min-w-[980px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="px-4 py-3">رقم الفاتورة</th>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">المخزن</th>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">البنود</th>
                    <th className="px-4 py-3">الإجمالي</th>
                    {canViewDebts && <th className="px-4 py-3">المدفوع</th>}
                    {canViewDebts && <th className="px-4 py-3">المتبقي</th>}
                    <th className="px-4 py-3">حالة الفاتورة</th>
                    <th className="px-4 py-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map((inv) => (
                    <tr key={inv.id} className={`hover:bg-slate-50/70 ${inv.invoiceStatus === 'VOID' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{inv.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.customerPhone || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-sky-600 font-semibold">{inv.warehouseName}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{inv.date}</td>
                      <td className="px-4 py-3 text-slate-500">{inv.itemsCount ?? inv.items?.length ?? 0}</td>
                      <td className="px-4 py-3 font-black text-slate-900">{fmt(inv.totalAmount)}</td>
                      {canViewDebts && <td className="px-4 py-3 font-bold text-emerald-600">{fmt(inv.paidAmount)}</td>}
                      {canViewDebts && <td className="px-4 py-3 font-bold text-amber-600">{fmt(inv.remainingAmount)}</td>}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.invoiceStatus === 'VOID'
                              ? 'bg-rose-500/10 text-rose-600'
                              : canViewDebts && inv.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : canViewDebts && inv.paymentStatus === 'PARTIAL'
                                  ? 'bg-sky-500/10 text-sky-600'
                                  : canViewDebts
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : 'bg-slate-100 text-slate-600'
                          }`}>
                            {inv.invoiceStatus === 'VOID' ? 'ملغاة' : canViewDebts ? paymentStatusLabel[inv.paymentStatus] : 'مكتملة'}
                          </span>
                          {canViewReturns && (inv.returnedAmount || 0) > 0 && (
                            <div className="text-[9px] text-rose-500 font-bold">مرتجع: {fmt(inv.returnedAmount || 0)}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton title="معاينة الفاتورة" onClick={() => openInvoicePreview(inv)}><Eye className="w-4 h-4" /></IconButton>
                          <IconButton title="تفاصيل الفاتورة" onClick={() => openDetails(inv)}><Info className="w-4 h-4" /></IconButton>
                          <IconButton title="طباعة A4" onClick={() => {
                            const full = salesService.getInvoiceById(inv.id);
                            if (full) printService.printInvoice(full);
                          }}><Printer className="w-4 h-4" /></IconButton>
                          <IconButton title="طباعة إيصال حراري" onClick={() => {
                            const full = salesService.getInvoiceById(inv.id);
                            if (full) printService.printThermalReceipt(full);
                          }}><Receipt className="w-4 h-4" /></IconButton>
                          {inv.invoiceStatus !== 'VOID' && inv.remainingAmount > 0 && canCollect && (
                            <IconButton title="تحصيل دفعة" tone="hover:text-sky-600" onClick={() => {
                              const full = salesService.getInvoiceById(inv.id);
                              if (full) openPayment(full);
                            }}><Wallet className="w-4 h-4" /></IconButton>
                          )}
                          {inv.invoiceStatus !== 'VOID' && canRefund && (
                            <IconButton title="مرتجع مبيعات" tone="hover:text-rose-600" onClick={() => goToReturn(inv.id)}>
                              <RotateCcw className="w-4 h-4" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={canViewDebts ? 10 : 8} className="py-16 text-center text-slate-400">لا توجد فواتير مطابقة للفلتر الحالي.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {invoices.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>عرض {(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, invoices.length)} من {invoices.length}</span>
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

      <SalesModals
        selected={selected}
        setSelected={setSelected}
        payments={payments}
        voidTarget={voidTarget}
        setVoidTarget={setVoidTarget}
        voidReason={voidReason}
        setVoidReason={setVoidReason}
        submitVoid={submitVoid}
        payTarget={payTarget}
        setPayTarget={setPayTarget}
        payAmount={payAmount}
        setPayAmount={setPayAmount}
        payType={payType}
        setPayType={setPayType}
        payNotes={payNotes}
        setPayNotes={setPayNotes}
        submitPayment={submitPayment}
        docPreview={docPreview}
        setDocPreview={setDocPreview}
        statement={statement}
        setStatement={setStatement}
        statementExportOptions={statementExportOptions}
        canViewDebts={canViewDebts}
        canViewReturns={canViewReturns}
        canViewCustomerStatement={canViewCustomerStatement}
        canRefund={canRefund}
        canCollect={canCollect}
        canVoid={canVoid}
        canExportCustomers={canExportCustomers}
        saving={saving}
        printInvoice={(invoice) => printService.printInvoice(invoice)}
        printThermalReceipt={(invoice) => printService.printThermalReceipt(invoice)}
        openInvoicePreview={openInvoicePreview}
        openStatement={openStatement}
        goToReturn={goToReturn}
        openPayment={openPayment}
        openVoid={openVoid}
        buildExportHtml={buildExportHtml}
        exportToExcel={exportToExcel}
      />
    </div>
  );
};
