import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt, Search, Printer, RotateCcw, Plus, Eye,
  FileSpreadsheet, FileDown, ChevronRight, ChevronLeft, Loader2,
  RefreshCw, Wallet, TrendingUp, Banknote, CalendarDays, Percent, XCircle, Info,
} from 'lucide-react';
import { SalesService, InvoiceFilters, InvoiceStats } from '../../services/domains/sales/SalesService';
import { CustomerService } from '../../services/domains/customers/CustomerService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { PrintService } from '../../services/shared/PrintService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { SalesInvoice, SalesInvoiceItem, CustomerPayment, PaymentType, Customer, Warehouse as WarehouseType } from '../../types';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { formatProductQuantity } from '../../utils/products/productUnits';
import { exportToExcel, buildExportHtml } from '../../utils/export/export';
import { SalesModals } from './SalesModals';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/Button';
import { ActivityGate } from '../ui/ActivityGate';
import { StatCard } from '../ui/Card';
import { FilterToolbar } from '../ui/FilterToolbar';
import { DataTable } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { localDateString } from '../../utils/shared/date';
import { openWhatsAppChat } from '../../utils/shared/externalLinks';
import { useBusinessProfileMeta, useBusinessTerm } from '../../hooks/domains/config/useBusinessTerm';
import { OperationalFieldService, type OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';
import { OperationalFieldsFilter, matchesOperationalFieldFilters, type OperationalFieldFilters } from '../products/OperationalFieldsFilter';
import { FinanceEnterpriseService } from '../../services/domains/finance/FinanceEnterpriseService';
import type { BankAccount } from '../../types/finance';

type InvoiceRow = SalesInvoice & { itemsCount?: number; returnedAmount?: number };

const PAGE_SIZE = 20;
const fmt = (n: number) => CeramicMath.formatCurrency(Number(n) || 0);

const paymentStatusLabel: Record<string, string> = {
  PAID: 'مسددة بالكامل',
  PARTIAL: 'مسدد جزء',
  UNPAID: 'آجل / غير مسدد',
};

const _paymentTypeLabel: Record<string, string> = {
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
  const newInvoiceLabel = useBusinessTerm('actions.newInvoice');
  const { label: businessProfileLabel } = useBusinessProfileMeta();
  const salesService = useMemo(() => new SalesService(), []);
  const customerService = useMemo(() => new CustomerService(), []);
  const inventoryService = useMemo(() => new InventoryService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const operationalFieldService = useMemo(() => new OperationalFieldService(), []);
  const financeEnterpriseService = useMemo(() => new FinanceEnterpriseService(), []);
  const user = AuthService.getCurrentUser();
  const canVoid = PermissionService.can(user, 'ui.sales.invoices.void');
  const canCollect = PermissionService.can(user, 'ui.customers.detail.payment');
  const canViewDebts = PermissionService.can(user, 'ui.finance.receivables.view');
  const canViewCustomerStatement = PermissionService.can(user, 'ui.customers.list.view') && canViewDebts;
  const canViewReturns = PermissionService.can(user, 'ui.returns.returns.view');
  const canRefund = PermissionService.can(user, 'ui.sales.invoices.refund');
  const canExport = PermissionService.can(user, 'ui.sales.invoices.export');
  const canCreate = PermissionService.can(user, 'ui.sales.invoices.create');
  const canUpdateInvoice = PermissionService.can(user, 'ui.sales.invoices.update');
  const canExportCustomers = PermissionService.can(user, 'ui.customers.list.export');
  const toast = useToast();

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
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [operationalFields, setOperationalFields] = useState<OperationalFieldDefinition[]>([]);
  const [operationalFieldFilters, setOperationalFieldFilters] = useState<OperationalFieldFilters>({});
  const [operationalValuesByInvoice, setOperationalValuesByInvoice] = useState<Record<string, Record<string, string>>>({});

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
      const accounts = financeEnterpriseService.getBankAccounts().filter((account) => account.isActive);
      setBankAccounts(accounts);
      setPayBankAccountId(accounts[0]?.id || '');
    } catch {
      /* reference data is optional for the list screen */
    }
  }, [customerService, inventoryService, financeEnterpriseService]);

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
      toast.error('تعذر فتح كشف الحساب', e?.message);
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
    (async () => {
      try {
        const [currentInvoices, statsResult] = await Promise.all([
          salesService.getInvoicesFilteredAsync(filters) as Promise<InvoiceRow[]>,
          salesService.getStatsAsync(filters),
        ]);
        setOperationalFields(operationalFieldService.getDefinitions('sales_invoices'));
        const valueMap = operationalFieldService.getRecordValuesForRecords('sales_invoices', currentInvoices.map((invoice) => invoice.id));
        setOperationalValuesByInvoice(valueMap);
        setInvoices(currentInvoices.filter((invoice) => matchesOperationalFieldFilters(invoice.id, valueMap, operationalFieldFilters)));
        setStats(statsResult);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'تعذر تحميل فواتير المبيعات.');
      } finally {
        setLoading(false);
      }
    })();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load();   }, [filters, operationalFieldFilters]);

  useEffect(() => { setPage(1); }, [filters]);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const pageItems = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openDetails = (invoice: InvoiceRow) => {
    (async () => {
      const [full, payments] = await Promise.all([
        salesService.getInvoiceByIdAsync(invoice.id),
        canViewDebts ? salesService.getInvoicePaymentsAsync(invoice.id) : Promise.resolve([]),
      ]);
      if (!full) return;
      setSelected(full);
      setPayments(payments);
    })();
  };

  const refreshSelected = (invoiceId: string) => {
    (async () => {
      const [full, payments] = await Promise.all([
        salesService.getInvoiceByIdAsync(invoiceId),
        canViewDebts ? salesService.getInvoicePaymentsAsync(invoiceId) : Promise.resolve([]),
      ]);
      setSelected(full);
      setPayments(payments);
    })();
  };

  const openVoid = (invoice: InvoiceRow) => {
    setVoidTarget(invoice);
    setVoidReason('');
  };

  const submitVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    if (!voidReason.trim()) { toast.warning('سبب الإلغاء مطلوب', 'يرجى إدخال سبب الإلغاء.'); return; }
    setSaving(true);
    try {
      salesService.voidInvoice(voidTarget.id, voidReason.trim());
      setVoidTarget(null);
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error('تعذر إلغاء الفاتورة', err?.message);
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
    if (!amount || amount <= 0) { toast.warning('مبلغ غير صحيح', 'يرجى إدخال مبلغ صحيح أكبر من الصفر.'); return; }
    if (amount > payTarget.remainingAmount) { toast.warning('مبلغ أكبر من المتبقي', 'المبلغ أكبر من المتبقي على الفاتورة.'); return; }
    setSaving(true);
    try {
      salesService.recordInvoicePayment(payTarget.id, amount, payType, undefined, undefined, payNotes, undefined, undefined, payBankAccountId || undefined);
      setPayTarget(null);
      refreshSelected(payTarget.id);
      load();
    } catch (err: any) {
      toast.error('تعذر تسجيل التحصيل', err?.message);
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
    shippingCost: inv.shippingCost || 0,
    extraFees: inv.extraFees || 0,
    total: inv.totalAmount,
    ...(canViewDebts ? {
      paid: inv.paidAmount,
      remaining: inv.remainingAmount,
      status: paymentStatusLabel[inv.paymentStatus] || inv.paymentStatus,
    } : {}),
    ...(canViewReturns ? { returned: inv.returnedAmount || 0 } : {}),
    profit: inv.grossProfit,
    invoiceStatus: inv.invoiceStatus === 'VOID' ? 'ملغاة' : 'مكتملة',
    ...(operationalFieldService.getRecordValuesForExport('sales_invoices', [inv.id])[inv.id] || {}),
  }));

  const exportColumns = [
    { key: 'invoiceNumber', label: 'رقم الفاتورة' },
    { key: 'date', label: 'التاريخ' },
    { key: 'customer', label: 'العميل' },
    { key: 'phone', label: 'الهاتف' },
    { key: 'warehouse', label: 'المخزن' },
    { key: 'shippingCost', label: 'النقل والشحن' },
    { key: 'extraFees', label: 'مصاريف إضافية' },
    { key: 'total', label: 'الإجمالي' },
    ...(canViewDebts ? [
      { key: 'paid', label: 'المدفوع' },
      { key: 'remaining', label: 'المتبقي' },
      { key: 'status', label: 'حالة السداد' },
    ] : []),
    ...(canViewReturns ? [{ key: 'returned', label: 'المرتجع' }] : []),
    { key: 'profit', label: 'الربح' },
    { key: 'invoiceStatus', label: 'حالة الفاتورة' },
    ...operationalFields.map((field) => ({ key: field.name, label: field.name })),
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
    const text =
      `فاتورة مبيعات ${full.invoiceNumber}\nالتاريخ: ${full.date}\n` +
      `الإجمالي: ${fmt(full.totalAmount)}\nالمدفوع: ${fmt(full.paidAmount)}\n` +
      (full.remainingAmount > 0 ? `المتبقي: ${fmt(full.remainingAmount)}\n` : '') +
      `شكراً لتعاملكم معنا.`;
    openWhatsAppChat(full.customerPhone || '', text);
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
    <div className="erp-page">
      <PageHeader
        title={`سجل فواتير ${salesLabel}`}
        description={`متابعة الفواتير، التحصيلات، المرتجعات، وإعادة الطباعة مع رقابة كاملة على الحسابات · ${businessProfileLabel}`}
        icon={<Receipt className="h-5 w-5" />}
        actions={
          <>
            {canExport && <ActivityGate element="export"><Button variant="secondary" size="sm" leadingIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => doExport('excel')}>جدول بيانات</Button></ActivityGate>}
            {canExport && <ActivityGate element="print"><Button variant="secondary" size="sm" leadingIcon={<FileDown className="h-4 w-4" />} onClick={() => doExport('pdf')}>مستند</Button></ActivityGate>}
            {canCreate && <ActivityGate element="pos-checkout"><Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/pos')}>{newInvoiceLabel}</Button></ActivityGate>}
          </>
        }
      />

      <div className="erp-stat-grid">
        <StatCard label="عدد الفواتير" value={String(stats?.count ?? 0)} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="إجمالي المبيعات" value={fmt(stats?.totalAmount ?? 0)} icon={<TrendingUp className="h-4 w-4" />} />
        {canViewDebts && <StatCard label="المحصّل" value={fmt(stats?.paidAmount ?? 0)} icon={<Wallet className="h-4 w-4" />} tone="success" />}
        {canViewDebts && <StatCard label="المتبقي (آجل)" value={fmt(stats?.remainingAmount ?? 0)} icon={<Banknote className="h-4 w-4" />} tone="warning" />}
        {canViewReturns && <StatCard label="المرتجعات" value={fmt(stats?.returnedAmount ?? 0)} icon={<RotateCcw className="h-4 w-4" />} tone="danger" />}
        <StatCard label="الربح الإجمالي" value={fmt(stats?.grossProfit ?? 0)} icon={<Percent className="h-4 w-4" />} />
      </div>

      <FilterToolbar ariaLabel="بحث وفلاتر فواتير المبيعات" className="space-y-3">
        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cerami-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل أو الهاتف..."
              aria-label="بحث في الفواتير"
              className="ui-input w-full pe-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-[var(--cerami-muted)]" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="ui-input" aria-label="من تاريخ" />
              <span className="text-[var(--cerami-muted)]">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="ui-input" aria-label="إلى تاريخ" />
            </div>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)} className="ui-input" aria-label="حالة السداد">
              <option value="ALL">كل حالات السداد</option>
              <option value="PAID">مسددة بالكامل</option>
              <option value="PARTIAL">مسدد جزء</option>
              <option value="UNPAID">آجل / غير مسدد</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="ui-input" aria-label="حالة الفاتورة">
              <option value="COMPLETED">الفواتير المكتملة</option>
              <option value="VOID">الفواتير الملغاة</option>
              <option value="ALL">كل الفواتير</option>
            </select>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="ui-input max-w-[180px]" aria-label="العميل">
              <option value="">كل العملاء</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="ui-input" aria-label="المخزن">
              <option value="">كل المخازن</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" iconOnly onClick={load} title="تحديث" aria-label="تحديث">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-[var(--cerami-muted)] ml-1">فترات سريعة:</span>
          {([
            ['today', 'اليوم'],
            ['yesterday', 'أمس'],
            ['week', 'آخر 7 أيام'],
            ['month', 'هذا الشهر'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => applyPreset(key)} className="erp-btn erp-btn--secondary erp-btn--sm">{label}</button>
          ))}
          <button type="button" onClick={() => applyPreset('clear')} className="erp-btn erp-btn--ghost erp-btn--sm">مسح التاريخ</button>
          {(search || dateFrom || dateTo || customerFilter || warehouseFilter || paymentFilter !== 'ALL' || statusFilter !== 'COMPLETED') && (
            <button type="button" onClick={clearFilters} className="erp-btn erp-btn--danger erp-btn--sm inline-flex items-center gap-1">
              <XCircle className="h-3 w-3" /> مسح كل الفلاتر
            </button>
          )}
        </div>
        <OperationalFieldsFilter fields={operationalFields} values={operationalFieldFilters} onChange={setOperationalFieldFilters} />
      </FilterToolbar>

      <DataTable<InvoiceRow>
        ariaLabel="فواتير المبيعات"
        columns={[
          {
            key: 'invoiceNumber',
            header: 'رقم الفاتورة',
            className: 'font-mono font-bold text-[var(--cerami-primary-readable)]',
            render: (inv) => inv.invoiceNumber,
          },
          {
            key: 'customer',
            header: 'العميل',
            render: (inv) => (
              <div>
                <div className="font-bold">{inv.customerName}</div>
                <div className="text-[10px] font-mono text-[var(--cerami-muted)]">{inv.customerPhone || '—'}</div>
              </div>
            ),
          },
          {
            key: 'warehouse',
            header: 'المخزن',
            className: 'text-[var(--cerami-primary-readable)]',
            render: (inv) => inv.warehouseName,
          },
          {
            key: 'date',
            header: 'التاريخ',
            className: 'font-mono text-[var(--cerami-muted)]',
            render: (inv) => inv.date,
          },
          {
            key: 'itemsCount',
            header: 'البنود',
            render: (inv) => inv.itemsCount ?? inv.items?.length ?? 0,
          },
          {
            key: 'total',
            header: 'الإجمالي',
            className: 'font-black',
            render: (inv) => fmt(inv.totalAmount),
          },
          ...(canViewDebts ? [
            {
              key: 'paid',
              header: 'المدفوع',
              className: 'font-bold text-[var(--cerami-success)]',
              render: (inv: InvoiceRow) => fmt(inv.paidAmount),
            },
            {
              key: 'remaining',
              header: 'المتبقي',
              className: 'font-bold text-[var(--cerami-warning)]',
              render: (inv: InvoiceRow) => fmt(inv.remainingAmount),
            },
          ] : []),
          {
            key: 'status',
            header: 'حالة الفاتورة',
            render: (inv) => (
              <div className="space-y-1">
                <span className={`erp-badge ${
                  inv.invoiceStatus === 'VOID'
                    ? 'erp-badge--danger'
                    : canViewDebts && inv.paymentStatus === 'PAID'
                      ? 'erp-badge--success'
                      : canViewDebts && inv.paymentStatus === 'PARTIAL'
                        ? 'erp-badge--primary'
                        : canViewDebts
                          ? 'erp-badge--warning'
                          : ''
                }`}>
                  {inv.invoiceStatus === 'VOID' ? 'ملغاة' : canViewDebts ? paymentStatusLabel[inv.paymentStatus] : 'مكتملة'}
                </span>
                {canViewReturns && (inv.returnedAmount || 0) > 0 && (
                  <div className="text-[9px] text-[var(--cerami-danger)] font-bold">مرتجع: {fmt(inv.returnedAmount || 0)}</div>
                )}
              </div>
            ),
          },
          ...operationalFields.map((field) => ({
            key: `op-${field.id}`,
            header: field.name,
            render: (inv: InvoiceRow) => {
              const raw = operationalValuesByInvoice[inv.id]?.[field.id] || '';
              return field.values.find((option) => option.value === raw)?.label || raw || '—';
            },
          })),
          {
            key: 'actions',
            header: 'الإجراءات',
            align: 'center' as const,
            render: (inv) => (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="sm" iconOnly title="معاينة الفاتورة" aria-label="معاينة الفاتورة" onClick={() => openInvoicePreview(inv)}><Eye className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" iconOnly title="تفاصيل الفاتورة" aria-label="تفاصيل الفاتورة" onClick={() => openDetails(inv)}><Info className="h-4 w-4" /></Button>
                <ActivityGate element="print"><Button variant="ghost" size="sm" iconOnly title="طباعة A4" aria-label="طباعة A4" onClick={() => {
                  const full = salesService.getInvoiceById(inv.id);
                  if (full) printService.printInvoice(full);
                }}><Printer className="h-4 w-4" /></Button></ActivityGate>
                <ActivityGate element="receipt-print"><Button variant="ghost" size="sm" iconOnly title="طباعة إيصال حراري" aria-label="طباعة إيصال حراري" onClick={() => {
                  const full = salesService.getInvoiceById(inv.id);
                  if (full) printService.printThermalReceipt(full);
                }}><Receipt className="h-4 w-4" /></Button></ActivityGate>
                {inv.invoiceStatus !== 'VOID' && inv.remainingAmount > 0 && canCollect && (
                  <ActivityGate element="collect-payment"><Button variant="ghost" size="sm" iconOnly title="تحصيل دفعة" aria-label="تحصيل دفعة" onClick={() => {
                    const full = salesService.getInvoiceById(inv.id);
                    if (full) openPayment(full);
                  }}><Wallet className="h-4 w-4" /></Button></ActivityGate>
                )}
                {inv.invoiceStatus !== 'VOID' && canRefund && (
                  <ActivityGate element="sales-return"><Button variant="ghost" size="sm" iconOnly title="مرتجع مبيعات" aria-label="مرتجع مبيعات" onClick={() => goToReturn(inv.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button></ActivityGate>
                )}
              </div>
            ),
          },
        ]}
        rows={pageItems}
        rowKey={(inv) => inv.id}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="لا توجد فواتير مطابقة للفلتر الحالي"
        minWidth={1100}
        stickyHeader
        page={page}
        pageCount={totalPages}
        total={invoices.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        rowClassName={(inv) => inv.invoiceStatus === 'VOID' ? 'opacity-60' : ''}
      />

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
        payBankAccountId={payBankAccountId}
        setPayBankAccountId={setPayBankAccountId}
        bankAccounts={bankAccounts}
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
        operationalFields={operationalFields}
        operationalFieldValues={selected ? operationalFieldService.getRecordValues('sales_invoices', selected.id) : {}}
        canUpdateOperationalFields={canUpdateInvoice}
        onSaveOperationalFields={(values) => {
          if (!selected) return;
          operationalFieldService.setRecordValues('sales_invoices', selected.id, values, 'update');
          setOperationalValuesByInvoice((previous) => ({ ...previous, [selected.id]: values }));
        }}
      />
    </div>
  );
};
