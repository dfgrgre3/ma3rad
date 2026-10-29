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
import { localDateString } from '../utils/date';
import { buildWhatsAppUrl, openExternalShare } from '../utils/externalLinks';

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
  const salesService = useMemo(() => new SalesService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canVoid = PermissionService.can(user, 'sales.void');
  const canCollect = PermissionService.can(user, 'customers.payment');
  const canRefund = PermissionService.can(user, 'sales.refund');

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
    setPayments(salesService.getInvoicePayments(invoice.id));
  };

  const refreshSelected = (invoiceId: string) => {
    const full = salesService.getInvoiceById(invoiceId);
    setSelected(full);
    setPayments(salesService.getInvoicePayments(invoiceId));
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
    paid: inv.paidAmount,
    remaining: inv.remainingAmount,
    returned: inv.returnedAmount || 0,
    profit: inv.grossProfit,
    status: paymentStatusLabel[inv.paymentStatus] || inv.paymentStatus,
    invoiceStatus: inv.invoiceStatus === 'VOID' ? 'ملغاة' : 'مكتملة',
  }));

  const exportColumns = [
    { key: 'invoiceNumber', label: 'رقم الفاتورة' },
    { key: 'date', label: 'التاريخ' },
    { key: 'customer', label: 'العميل' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'warehouse', label: 'المخزن' },
    { key: 'total', label: 'الإجمالي' },
    { key: 'paid', label: 'المدفوع' },
    { key: 'remaining', label: 'المتبقي' },
    { key: 'returned', label: 'المرتجع' },
    { key: 'profit', label: 'الربح' },
    { key: 'status', label: 'حالة السداد' },
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
            <h1 className="text-base font-black text-slate-900">سجل فواتير المبيعات</h1>
            <p className="text-xs text-slate-500 font-medium">
              متابعة الفواتير، التحصيلات، المرتجعات، وإعادة الطباعة مع رقابة كاملة على الحسابات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => doExport('excel')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            onClick={() => doExport('pdf')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <FileDown className="w-4 h-4 text-rose-600" /> PDF
          </button>
          <button
            onClick={() => navigate('/pos')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            <Plus className="w-4 h-4" /> فاتورة جديدة (POS)
          </button>
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard label="عدد الفواتير" value={String(stats?.count ?? 0)} icon={Receipt} tone="text-slate-700 bg-slate-50 border-slate-200" />
          <StatCard label="إجمالي المبيعات" value={fmt(stats?.totalAmount ?? 0)} icon={TrendingUp} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
          <StatCard label="المحصّل" value={fmt(stats?.paidAmount ?? 0)} icon={Wallet} tone="text-sky-700 bg-sky-50 border-sky-200" />
          <StatCard label="المتبقي (آجل)" value={fmt(stats?.remainingAmount ?? 0)} icon={Banknote} tone="text-amber-700 bg-amber-50 border-amber-200" />
          <StatCard label="المرتجعات" value={fmt(stats?.returnedAmount ?? 0)} icon={RotateCcw} tone="text-rose-700 bg-rose-50 border-rose-200" />
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
                    <th className="px-4 py-3">المدفوع</th>
                    <th className="px-4 py-3">المتبقي</th>
                    <th className="px-4 py-3">الحالة</th>
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
                      <td className="px-4 py-3 font-bold text-emerald-600">{fmt(inv.paidAmount)}</td>
                      <td className="px-4 py-3 font-bold text-amber-600">{fmt(inv.remainingAmount)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.invoiceStatus === 'VOID'
                              ? 'bg-rose-500/10 text-rose-600'
                              : inv.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : inv.paymentStatus === 'PARTIAL'
                                  ? 'bg-sky-500/10 text-sky-600'
                                  : 'bg-amber-500/10 text-amber-600'
                          }`}>
                            {inv.invoiceStatus === 'VOID' ? 'ملغاة' : paymentStatusLabel[inv.paymentStatus]}
                          </span>
                          {(inv.returnedAmount || 0) > 0 && (
                            <div className="text-[9px] text-rose-500 font-bold">مرتجع: {fmt(inv.returnedAmount || 0)}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton title="معاينة الفاتورة" onClick={() => openInvoicePreview(inv)}><Eye className="w-4 h-4" /></IconButton>
                          <IconButton title="تفاصيل الفاتورة والمدفوعات" onClick={() => openDetails(inv)}><Info className="w-4 h-4" /></IconButton>
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
                    <tr><td colSpan={10} className="py-16 text-center text-slate-400">لا توجد فواتير مطابقة للفلتر الحالي.</td></tr>
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

      {/* ── Invoice Details ─────────────────────────────────────────────────── */}
      {selected && (
        <Modal onClose={() => setSelected(null)} wide>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" /> فاتورة {selected.invoiceNumber}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                {selected.date} • {selected.warehouseName} • أنشأها {selected.createdByName || '—'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <InfoBox label="العميل" value={selected.customerName || 'عميل نقدي'} sub={selected.customerPhone} />
            <InfoBox label="طريقة الدفع" value={paymentTypeLabel[selected.paymentType] || selected.paymentType} sub={paymentStatusLabel[selected.paymentStatus]} />
            <InfoBox label="حالة الفاتورة" value={selected.invoiceStatus === 'VOID' ? 'ملغاة' : 'مكتملة'} sub={`${selected.items.length} بند`} />
          </div>

          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[700px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">المقاس / الفرز</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">الكراتين</th>
                  <th className="px-3 py-2">سعر الوحدة</th>
                  <th className="px-3 py-2">الخصم</th>
                  <th className="px-3 py-2">الإجمالي</th>
                  <th className="px-3 py-2">الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-bold text-slate-800">{item.productName}</td>
                    <td className="px-3 py-2 text-slate-500">{item.productType === 'GENERAL' ? getProductUnitLabel(item) : `${item.size} • ${item.productGrade}`}</td>
                    <td className="px-3 py-2 font-mono">{formatProductQuantity(item.quantityM2, item)}</td>
                    <td className="px-3 py-2 font-mono">{item.productType === 'GENERAL' ? '—' : item.boxesCount}</td>
                    <td className="px-3 py-2 font-mono">{fmt(item.unitPrice)}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{item.discountAmount ? `-${fmt(item.discountAmount)}` : '—'}</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{fmt(item.totalPrice)}</td>
                    <td className={`px-3 py-2 font-bold ${item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(item.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] font-black text-slate-600 mb-2">الملخص المالي</div>
                <SummaryRow label="المجموع الفرعي" value={selected.subtotal} />
                <SummaryRow label="خصم الفاتورة" value={-selected.discountAmount} tone={selected.discountAmount ? 'text-rose-600' : ''} />
                <SummaryRow label="الضريبة" value={selected.taxAmount} />
                <SummaryRow label="المشال والنقل" value={selected.shippingCost} />
                <div className="border-t border-slate-300 mt-1 pt-2">
                  <SummaryRow label="إجمالي الفاتورة" value={selected.totalAmount} strong />
                  <SummaryRow label="المدفوع" value={selected.paidAmount} tone="text-emerald-600" />
                  <SummaryRow label="المتبقي" value={selected.remainingAmount} tone="text-amber-600" />
                  {(selected.returnedAmount || 0) > 0 && <SummaryRow label="المرتجع" value={selected.returnedAmount || 0} tone="text-rose-600" />}
                </div>
              </div>
              {selected.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
                  <b>ملاحظات:</b> {selected.notes}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-black text-slate-600 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> تحصيلات الفاتورة ({payments.length})
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {payments.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-slate-400">لا توجد تحصيلات لاحقة مسجلة على هذه الفاتورة.</div>
                ) : payments.map((p) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between text-[11px]">
                    <div>
                      <div className="font-bold text-slate-700 font-mono">{p.receiptNumber}</div>
                      <div className="text-slate-400">{p.date} • {paymentTypeLabel[p.paymentType] || p.paymentType}</div>
                    </div>
                    <span className="font-black text-emerald-600">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
            <button onClick={() => openInvoicePreview(selected)} className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> معاينة الفاتورة
            </button>
            <button onClick={() => printService.printInvoice(selected)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> طباعة A4
            </button>
            <button onClick={() => printService.printThermalReceipt(selected)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> إيصال حراري
            </button>
            <button onClick={() => openStatement(selected.customerId)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <FileBarChart className="w-3.5 h-3.5" /> كشف حساب العميل
            </button>
            {selected.invoiceStatus !== 'VOID' && canRefund && (
              <button onClick={() => goToReturn(selected.id)} className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> مرتجع مبيعات
              </button>
            )}
            {selected.invoiceStatus !== 'VOID' && selected.remainingAmount > 0 && canCollect && (
              <button onClick={() => openPayment(selected)} className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> تحصيل دفعة
              </button>
            )}
            {selected.invoiceStatus !== 'VOID' && canVoid && (
              <button onClick={() => openVoid(selected)} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5" /> إلغاء الفاتورة
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Void modal ──────────────────────────────────────────────────────── */}
      {voidTarget && (
        <Modal onClose={() => setVoidTarget(null)}>
          <form onSubmit={submitVoid} className="space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-black">إلغاء الفاتورة {voidTarget.invoiceNumber}</h3>
            </div>
            <p className="text-xs text-slate-500">
              سيتم إرجاع كميات الفاتورة إلى المخزن وعكس أثرها المالي على حساب العميل والخزينة. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div>
              <label htmlFor="sales-void-reason" className="block text-xs font-bold text-slate-700 mb-1">سبب الإلغاء *</label>
              <textarea id="sales-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="مثال: خطأ في إدخال الفاتورة / إلغاء الاتفاق مع العميل" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setVoidTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">رجوع</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تأكيد الإلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Payment modal ───────────────────────────────────────────────────── */}
      {payTarget && (
        <Modal onClose={() => setPayTarget(null)}>
          <form onSubmit={submitPayment} className="space-y-4">
            <div className="flex items-center gap-2 text-sky-600">
              <Wallet className="w-5 h-5" />
              <h3 className="text-base font-black">تحصيل دفعة على الفاتورة {payTarget.invoiceNumber}</h3>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex items-center justify-between">
              <span className="text-slate-500">المتبقي على الفاتورة</span>
              <span className="font-black text-amber-600">{fmt(payTarget.remainingAmount)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sales-payment-amount" className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحصل *</label>
                <input id="sales-payment-amount" type="number" min={0.01} max={payTarget.remainingAmount} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" />
              </div>
              <div>
                <label htmlFor="sales-payment-type" className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select id="sales-payment-type" value={payType} onChange={(e) => setPayType(e.target.value as PaymentType)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
                  <option value="CASH">نقدي</option>
                  <option value="CARD">بطاقة</option>
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="CHEQUE">شيك</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="sales-payment-notes" className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
              <input id="sales-payment-notes" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" placeholder="اختياري" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">إلغاء</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} تسجيل التحصيل
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── In-app document preview ────────────────────────────────────────── */}
      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          subtitle={docPreview.subtitle}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
          onWhatsApp={docPreview.whatsapp}
        />
      )}

      {/* ── Customer statement ─────────────────────────────────────────────── */}
      {statement && (
        <Modal onClose={() => setStatement(null)} wide>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileBarChart className="w-5 h-5 text-emerald-600" /> كشف حساب {statement.customer.name}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                {statement.customer.phone} • الحد الائتماني {fmt(statement.customer.creditLimit)} • الرصيد الحالي{' '}
                <span className={(statement.customer.currentBalance || 0) > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {fmt(statement.customer.currentBalance || 0)}
                </span>
              </p>
            </div>
            <button onClick={() => setStatement(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[680px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المستند</th>
                  <th className="px-3 py-2">البيان</th>
                  <th className="px-3 py-2">مدين</th>
                  <th className="px-3 py-2">دائن</th>
                  <th className="px-3 py-2">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.transactions.map((tx) => (
                  <tr key={`${tx.type}-${tx.id}`}>
                    <td className="px-3 py-2 font-mono text-slate-500">{tx.date}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-700">{tx.docNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{tx.description}</td>
                    <td className="px-3 py-2 font-mono text-rose-600">{tx.debit ? fmt(tx.debit) : '—'}</td>
                    <td className="px-3 py-2 font-mono text-emerald-600">{tx.credit ? fmt(tx.credit) : '—'}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{fmt(tx.balanceAfter)}</td>
                  </tr>
                ))}
                {statement.transactions.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">لا توجد حركات على حساب العميل.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={() => {
                const options = statementExportOptions(statement);
                setDocPreview({
                  title: 'معاينة كشف الحساب',
                  subtitle: options.subtitle,
                  fileName: options.fileName,
                  html: buildExportHtml(options),
                  excel: () => exportToExcel(options),
                });
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" /> معاينة وتصدير
            </button>
            <button onClick={() => setStatement(null)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">إغلاق</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Small presentational helpers ─────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold opacity-80">{label}</span>
      <Icon className="w-4 h-4 opacity-70" />
    </div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode; tone?: string }> = ({ title, onClick, children, tone }) => (
  <button title={title} onClick={onClick} className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition ${tone || ''}`}>
    {children}
  </button>
);

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };

    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="إغلاق النافذة"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="نافذة حوارية"
        tabIndex={-1}
        className={`relative z-10 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] p-6`}
      >
        {children}
      </div>
    </div>
  );
};

const InfoBox: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs font-black text-slate-800 mt-0.5">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</div>}
  </div>
);

const SummaryRow: React.FC<{ label: string; value: number; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-center justify-between py-0.5 text-[11px] ${strong ? 'font-black text-slate-900 text-xs' : 'text-slate-600'}`}>
    <span>{label}</span>
    <span className={`font-mono ${tone || ''}`}>{fmt(value)}</span>
  </div>
);
