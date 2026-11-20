import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Check, CheckCircle2, Clock,
  Download, FileText, Printer, RefreshCw, Search, SlidersHorizontal, X
} from 'lucide-react';
import { SupplierService } from '../../../services/domains/suppliers/SupplierService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import type { Supplier } from '../../../types';

type ViewMode = 'statement' | 'matching';
type InvoiceStatus = 'all' | 'outstanding' | 'paid';
type PaymentStatus = 'all' | 'allocated' | 'partial' | 'unapplied';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  supplier_invoice_number?: string;
  date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  allocations: Array<{ id: string; amount: number; receiptNumber: string; paymentDate: string }>;
}

interface PaymentRow {
  id: string;
  receipt_number: string;
  date: string;
  amount: number;
  payment_type: string;
  notes?: string;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocations: Array<{
    id: string;
    purchaseInvoiceId: string;
    amount: number;
    invoiceNumber: string;
    invoiceDate: string;
    invoiceTotal: number;
  }>;
}

const fmt = (value: number) => new Intl.NumberFormat('ar-EG', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
}).format(Number(value) || 0) + ' ج.م';

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const inPeriod = (date: string, from: string, to: string) => (!from || date >= from) && (!to || date <= to);

export const SupplierStatementPage: React.FC = () => {
  const service = useMemo(() => new SupplierService(), []);
  const toast = useToast();
  const currentUser = AuthService.getCurrentUser();
  const canUpdate = PermissionService.can(currentUser, 'ui.suppliers.supplier_detail.payment')
    && PermissionService.can(currentUser, 'ui.suppliers.suppliers.payment')
    && PermissionService.can(currentUser, 'ui.finance.receivables.view');
  const canExport = PermissionService.can(currentUser, 'ui.suppliers.supplier_detail.export')
    && PermissionService.can(currentUser, 'ui.finance.receivables.view');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('statement');
  const [statementData, setStatementData] = useState<any | null>(null);
  const [invoicesWithAlloc, setInvoicesWithAlloc] = useState<InvoiceRow[]>([]);
  const [paymentsWithAlloc, setPaymentsWithAlloc] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('all');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('all');

  const [reallocModal, setReallocModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [allocDraft, setAllocDraft] = useState<Record<string, number>>({});
  const [savingAllocation, setSavingAllocation] = useState(false);

  useEffect(() => {
    try {
      const allSuppliers = service.getAllSuppliers();
      setSuppliers(allSuppliers);
      setSelectedSupplierId(allSuppliers[0]?.id || '');
    } catch (error: any) {
      setLoadError(error?.message || 'تعذر تحميل قائمة الموردين.');
      toast.error(error?.message || 'تعذر تحميل قائمة الموردين.');
    }
  }, [service, toast]);

  const loadStatement = useCallback(() => {
    if (!selectedSupplierId || (dateFrom && dateTo && dateFrom > dateTo)) return;
    setLoading(true);
    setLoadError('');
    try {
      const statement = service.getSupplierStatement(selectedSupplierId, dateFrom, dateTo);
      const invoices = service.getInvoicesWithAllocations(selectedSupplierId);
      const payments = service.getPaymentsWithAllocations(selectedSupplierId);
      setStatementData(statement);
      setInvoicesWithAlloc(invoices as InvoiceRow[]);
      setPaymentsWithAlloc(payments as PaymentRow[]);
    } catch (error: any) {
      setLoadError(error?.message || 'تعذر تحميل كشف حساب المورد.');
      toast.error(error?.message || 'تعذر تحميل كشف حساب المورد.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedSupplierId, service, toast]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId);
  const filteredSuppliers = suppliers.filter((supplier) =>
    `${supplier.name} ${supplier.companyName || ''} ${supplier.code || ''}`.toLowerCase().includes(supplierSearch.trim().toLowerCase())
  );
  const supplierOptions = selectedSupplier && !filteredSuppliers.some((supplier) => supplier.id === selectedSupplier.id)
    ? [selectedSupplier, ...filteredSuppliers]
    : filteredSuppliers;
  const transactions = statementData?.transactions || [];
  const periodPurchases = roundMoney(transactions.reduce((sum: number, row: any) => sum + Number(row.credit || 0), 0));
  const periodCredits = roundMoney(transactions.reduce((sum: number, row: any) => sum + Number(row.debit || 0), 0));

  const periodInvoices = useMemo(
    () => invoicesWithAlloc.filter((invoice) => inPeriod(invoice.date, dateFrom, dateTo)),
    [dateFrom, dateTo, invoicesWithAlloc]
  );
  const periodPayments = useMemo(
    () => paymentsWithAlloc.filter((payment) => inPeriod(payment.date, dateFrom, dateTo)),
    [dateFrom, dateTo, paymentsWithAlloc]
  );
  const invoicePaid = roundMoney(periodInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0));
  const invoiceOutstanding = roundMoney(periodInvoices.reduce((sum, invoice) => sum + Number(invoice.remaining_amount || 0), 0));
  const allocatedTotal = roundMoney(periodPayments.reduce((sum, payment) => sum + Number(payment.allocatedAmount || 0), 0));
  const unappliedTotal = roundMoney(periodPayments.reduce((sum, payment) => sum + Number(payment.unallocatedAmount || 0), 0));

  const visibleInvoices = periodInvoices.filter((invoice) => {
    const query = invoiceSearch.trim().toLowerCase();
    const matchesSearch = !query || `${invoice.invoice_number} ${invoice.supplier_invoice_number || ''}`.toLowerCase().includes(query);
    const isPaid = Number(invoice.remaining_amount) <= 0.01;
    return matchesSearch && (invoiceStatus === 'all' || (invoiceStatus === 'paid' ? isPaid : !isPaid));
  });
  const visiblePayments = periodPayments.filter((payment) => {
    const query = paymentSearch.trim().toLowerCase();
    const matchesSearch = !query || `${payment.receipt_number} ${payment.notes || ''}`.toLowerCase().includes(query);
    const allocated = Number(payment.allocatedAmount || 0);
    const unapplied = Number(payment.unallocatedAmount || 0);
    const status: PaymentStatus = allocated <= 0.01
      ? 'unapplied'
      : unapplied <= 0.01 ? 'allocated' : 'partial';
    return matchesSearch && (paymentStatus === 'all' || status === paymentStatus);
  });

  const handleExport = (type: 'excel' | 'pdf') => {
    if (!canExport || !statementData || !selectedSupplier) return;
    const title = `كشف حساب المورد: ${selectedSupplier.name}`;
    const columns = [
      { key: 'date', label: 'التاريخ' },
      { key: 'docNumber', label: 'رقم المستند' },
      { key: 'description', label: 'البيان' },
      { key: 'credit', label: 'دائن / فواتير (ج)' },
      { key: 'debit', label: 'مدين / سداد (ج)' },
      { key: 'balanceAfter', label: 'الرصيد المستحق (ج)' }
    ];
    const rows = [
      {
        date: dateFrom || '—',
        docNumber: '—',
        description: 'الرصيد الافتتاحي للفترة',
        credit: '—',
        debit: '—',
        balanceAfter: fmt(statementData.openingBalance)
      },
      ...transactions.map((transaction: any) => ({
        date: transaction.date,
        docNumber: transaction.docNumber,
        description: transaction.description,
        credit: transaction.credit > 0 ? fmt(transaction.credit) : '—',
        debit: transaction.debit > 0 ? fmt(transaction.debit) : '—',
        balanceAfter: fmt(transaction.balanceAfter)
      })),
      {
        date: dateTo || '—',
        docNumber: '—',
        description: 'الرصيد الختامي للفترة',
        credit: fmt(periodPurchases),
        debit: fmt(periodCredits),
        balanceAfter: fmt(statementData.closingBalance)
      }
    ];
    const options = {
      title,
      columns,
      rows,
      fileName: `كشف-حساب-${selectedSupplier.name}`,
      permission: 'suppliers.export'
    };
    if (type === 'excel') exportToExcel(options);
    else exportToPdf(options);
  };

  const handleOpenReallocate = (payment: PaymentRow) => {
    if (!canUpdate) return;
    const draft: Record<string, number> = {};
    for (const allocation of payment.allocations || []) {
      const invoice = invoicesWithAlloc.find((item) => item.id === allocation.purchaseInvoiceId);
      if (invoice) draft[invoice.id] = (draft[invoice.id] || 0) + Number(allocation.amount);
    }
    setSelectedPayment(payment);
    setAllocDraft(draft);
    setReallocModal(true);
  };

  const priorAllocationByInvoice = useMemo(() => {
    const result: Record<string, number> = {};
    if (selectedPayment) {
      for (const allocation of selectedPayment.allocations || []) {
        const invoice = invoicesWithAlloc.find((item) => item.id === allocation.purchaseInvoiceId);
        if (invoice) result[invoice.id] = (result[invoice.id] || 0) + Number(allocation.amount);
      }
    }
    return result;
  }, [invoicesWithAlloc, selectedPayment]);

  const allocationTotal = roundMoney(Object.values(allocDraft).reduce((sum, amount) => sum + Number(amount || 0), 0));
  const paymentCap = Number(selectedPayment?.amount || 0);
  const allocationRemainder = roundMoney(paymentCap - allocationTotal);
  const hasInvalidAllocation = Boolean(selectedPayment) && (
    allocationRemainder < -0.001
    || Object.entries(allocDraft).some(([invoiceId, amount]) => {
      const invoice = invoicesWithAlloc.find((item) => item.id === invoiceId);
      const numericAmount = Number(amount);
      const capacity = invoice
        ? Math.max(0, Number(invoice.remaining_amount || 0) + Number(priorAllocationByInvoice[invoiceId] || 0))
        : 0;
      return !Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > capacity + 0.001;
    })
  );

  const handleSaveReallocation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canUpdate || !selectedPayment) return;
    if (hasInvalidAllocation) {
      toast.error('تحقق من أن التوزيع لا يتجاوز قيمة السند أو المتبقي المتاح لكل فاتورة.');
      return;
    }
    const allocations = Object.entries(allocDraft)
      .map(([purchaseInvoiceId, amount]) => ({ purchaseInvoiceId, amount: roundMoney(Number(amount)) }))
      .filter((allocation) => allocation.amount > 0);
    setSavingAllocation(true);
    try {
      service.reallocateSupplierPayment(selectedPayment.id, allocations);
      toast.success('تم تحديث مطابقة السند على الفواتير المحددة بنجاح.');
      setReallocModal(false);
      loadStatement();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر حفظ مطابقة السند.');
    } finally {
      setSavingAllocation(false);
    }
  };

  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-4 pt-4 sm:px-6">
        <PageHeader
          icon={<FileText className="h-5 w-5" />}
          title="كشف حساب المورد"
          description="مراجعة الحركات المالية ومطابقة سندات الصرف بفواتير الشراء"
          actions={canExport && (
            <>
              <ActivityGate element="export"><button
                type="button"
                onClick={() => handleExport('excel')}
                disabled={!statementData || loading}
                className="inline-flex items-center gap-2 rounded-md border border-success bg-success px-3 py-2 text-xs font-bold text-white transition hover:bg-success focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> تصدير Excel
              </button></ActivityGate>
              <ActivityGate element="print"><button
                type="button"
                onClick={() => handleExport('pdf')}
                disabled={!statementData || loading}
                className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" /> طباعة / PDF
              </button></ActivityGate>
            </>
          )}
        />
      </div>

      <section className="border-b border-line bg-surface px-4 py-3 sm:px-6" aria-label="مرشحات كشف الحساب">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs font-bold text-ink-secondary">
            المورد
            <span className="mt-1 flex items-center rounded-md border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-primary/25">
              <Search className="mr-3 h-4 w-4 shrink-0 text-muted" />
              <input
                aria-label="بحث عن مورد"
                value={supplierSearch}
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="ابحث بالاسم أو الكود"
                className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
              />
              <select
                aria-label="اختيار المورد"
                value={selectedSupplierId}
                onChange={(event) => setSelectedSupplierId(event.target.value)}
                className="max-w-[52%] border-0 border-r border-line bg-surface-muted py-2 pl-2 pr-2 text-xs font-bold text-ink outline-none focus:ring-0"
              >
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.code}</option>
                ))}
              </select>
            </span>
          </label>
          <label className="text-xs font-bold text-ink-secondary">
            من تاريخ
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 block rounded-md border border-line-strong bg-surface px-2.5 py-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="text-xs font-bold text-ink-secondary">
            إلى تاريخ
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 block rounded-md border border-line-strong bg-surface px-2.5 py-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="inline-flex rounded-md border border-line-strong bg-surface-sunken p-1" role="tablist" aria-label="طريقة عرض الحساب">
            <div role="tab" aria-selected={viewMode === 'statement'} className="contents">
              <button
                type="button"
                aria-selected={viewMode === 'statement'}
                onClick={() => setViewMode('statement')}
                className={`rounded px-3 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${viewMode === 'statement' ? 'bg-surface text-primary shadow-sm' : 'text-ink-secondary hover:text-ink'}`}
              >
                كشف الحساب
              </button>
            </div>
            <div role="tab" aria-selected={viewMode === 'matching'} className="contents">
              <button
                type="button"
                aria-selected={viewMode === 'matching'}
                onClick={() => setViewMode('matching')}
                className={`rounded px-3 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${viewMode === 'matching' ? 'bg-surface text-primary shadow-sm' : 'text-ink-secondary hover:text-ink'}`}
              >
                المطابقة
              </button>
            </div>
          </div>
        </div>
        {invalidDateRange && <p className="mt-2 text-xs font-semibold text-danger">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p>}
      </section>

      {selectedSupplier && statementData && !loading && !loadError && !invalidDateRange && (
        <section className="grid grid-cols-2 border-b border-line bg-surface sm:grid-cols-3 xl:grid-cols-5" aria-label="ملخص الفترة">
          {[
            { label: 'الرصيد الافتتاحي', value: statementData.openingBalance, icon: Clock, tone: 'text-ink', emphasis: 'normal' },
            { label: 'مشتريات الفترة', value: periodPurchases, icon: ArrowUpRight, tone: 'text-primary', emphasis: 'normal' },
            { label: 'مسدد / خصومات الفترة', value: periodCredits, icon: ArrowDownRight, tone: 'text-success', emphasis: 'normal' },
            { label: 'الرصيد الختامي للفترة', value: statementData.closingBalance, icon: CheckCircle2, tone: 'text-warning', emphasis: 'closing' },
            { label: 'الرصيد الحالي للمورد', value: selectedSupplier.currentBalance, icon: FileText, tone: 'text-danger', emphasis: 'current' }
          ].map(({ label, value, icon: Icon, tone, emphasis }) => (
            <div
              key={label}
              className={`min-w-0 border-b border-l px-4 py-3 last:border-l-0 sm:border-b-0 ${
                emphasis === 'current'
                  ? 'border-line-strong bg-primary'
                  : emphasis === 'closing'
                    ? 'border-warning-border bg-warning-soft'
                    : 'border-line bg-surface'
              }`}
            >
              <div className={`flex items-center gap-2 text-xs font-bold ${emphasis === 'current' ? 'text-muted' : emphasis === 'closing' ? 'text-warning' : 'text-ink-secondary'}`}>
                <Icon className={`h-3.5 w-3.5 ${tone}`} /> {label}
              </div>
              <div className={`mt-1 font-mono font-black tabular-nums ${
                emphasis === 'current'
                  ? 'text-base leading-tight text-white sm:text-lg xl:text-xl'
                  : emphasis === 'closing'
                    ? 'text-base text-warning'
                    : 'text-sm text-ink'
              }`}>{fmt(Number(value || 0))}</div>
            </div>
          ))}
        </section>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {!selectedSupplierId && !loading && !loadError && (
          <div className="rounded-md border border-dashed border-line-strong bg-surface px-5 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-3 text-sm font-black text-ink">لا يوجد مورد مطابق للبحث</h2>
            <p className="mt-1 text-xs text-muted">غيّر عبارة البحث أو امسحها لعرض الموردين المتاحين.</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface p-12 text-sm font-bold text-ink-secondary" role="status">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" /> جارٍ تحميل بيانات المورد…
          </div>
        )}
        {!loading && loadError && (
          <div className="rounded-md border border-danger-border bg-danger-soft p-5 text-center" role="alert">
            <AlertCircle className="mx-auto h-6 w-6 text-danger" />
            <p className="mt-2 text-sm font-bold text-danger">{loadError}</p>
            <button type="button" onClick={loadStatement} className="mt-3 inline-flex items-center gap-2 rounded-md border border-danger bg-surface px-3 py-2 text-xs font-bold text-danger hover:bg-danger-soft">
              <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
            </button>
          </div>
        )}
        {!loading && !loadError && invalidDateRange && (
          <div className="rounded-md border border-warning-border bg-warning-soft p-5 text-center text-sm font-semibold text-warning">
            عدّل نطاق التاريخ لعرض كشف حساب متسق.
          </div>
        )}
        {!loading && !loadError && statementData && !invalidDateRange && viewMode === 'statement' && (
          <section className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-ink">حركات الحساب</h2>
                <p className="mt-0.5 text-xs text-muted">{selectedSupplier?.name} · {dateFrom || 'بداية السجل'} — {dateTo || 'حتى اليوم'}</p>
              </div>
              <span className="text-xs font-bold text-muted">{transactions.length} حركة</span>
            </div>
            <div className="overflow-x-auto">
              <DataTable
                ariaLabel="كشف حساب المورد التفصيلي"
                rows={[
                  { __opening: true, date: dateFrom || '—', docNumber: '—', description: 'الرصيد الافتتاحي للفترة', credit: null, debit: null, balanceAfter: statementData.openingBalance },
                  ...transactions.map((transaction: any, index: number) => ({ ...transaction, __i: index })),
                ]}
                rowKey={(tx: any) => tx.__opening ? '__opening' : `${tx.id}-${tx.__i}`}
                minWidth={820}
                dense
                tableClassName="border-collapse text-xs"
                rowClassName={(tx: any) => `${tx.__opening ? 'bg-surface-muted font-bold text-ink' : 'transition-colors hover:bg-surface-muted'} ${tx.balanceAfter != null && !tx.__opening ? 'bg-surface-muted/60' : ''}`}
                columns={[
                  { key: 'date', header: 'التاريخ', render: (tx: any) => <span className={`whitespace-nowrap text-ink-secondary ${tx.__opening ? '' : 'font-mono'}`}>{tx.date}</span> },
                  { key: 'doc', header: 'رقم المستند', render: (tx: any) => <span className="whitespace-nowrap font-mono font-bold text-ink">{tx.docNumber || '—'}</span> },
                  { key: 'desc', header: 'البيان', render: (tx: any) => <span className={`min-w-[260px] text-ink ${tx.__opening ? '' : ''}`}>{tx.description}</span> },
                  {
                    key: 'credit', header: 'دائن — فاتورة', align: 'end', headerClassName: 'font-bold text-primary',
                    render: (tx: any) => tx.__opening ? <span className="text-left">—</span> : (
                      <span className="whitespace-nowrap font-mono font-bold tabular-nums text-primary">{Number(tx.credit) > 0 ? fmt(tx.credit) : '—'}</span>
                    ),
                  },
                  {
                    key: 'debit', header: 'مدين — سداد / تسوية', align: 'end', headerClassName: 'font-bold text-success',
                    render: (tx: any) => tx.__opening ? <span className="text-left">—</span> : (
                      <span className="whitespace-nowrap font-mono font-bold tabular-nums text-success">{Number(tx.debit) > 0 ? fmt(tx.debit) : '—'}</span>
                    ),
                  },
                  {
                    key: 'balance', header: 'الرصيد', align: 'end',
                    render: (tx: any) => <span className="whitespace-nowrap font-mono font-black tabular-nums text-ink">{fmt(tx.balanceAfter)}</span>,
                  },
                ]}
                footer={(
                  <tr className="border-t border-line-strong bg-surface-sunken font-black text-ink">
                    <td className="px-4 py-3">{dateTo || '—'}</td>
                    <td className="px-4 py-3 font-mono">—</td>
                    <td className="px-4 py-3">الرصيد الختامي للفترة</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums text-primary">{fmt(periodPurchases)}</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums text-success">{fmt(periodCredits)}</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums">{fmt(statementData.closingBalance)}</td>
                  </tr>
                )}
                emptyTitle="لا توجد حركات في هذه الفترة"
                emptyDescription="الرصيد الختامي يساوي الرصيد الافتتاحي."
              />
            </div>
          </section>
        )}

        {!loading && !loadError && statementData && !invalidDateRange && viewMode === 'matching' && (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="ملخص المطابقة">
              {[
                { label: 'المسدد على الفواتير', value: invoicePaid, tone: 'text-success' },
                { label: 'المتبقي على الفواتير', value: invoiceOutstanding, tone: 'text-danger' },
                { label: 'مخصص من سندات الفترة', value: allocatedTotal, tone: 'text-primary' },
                { label: 'غير مخصص من سندات الفترة', value: unappliedTotal, tone: 'text-warning' }
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-line bg-surface px-3 py-3">
                  <p className="text-xs font-bold text-ink-secondary">{item.label}</p>
                  <p className={`mt-1 font-mono text-sm font-black tabular-nums ${item.tone}`}>{fmt(item.value)}</p>
                </div>
              ))}
            </section>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
                <div className="border-b border-line px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-black text-ink">فواتير الشراء</h2>
                      <p className="mt-0.5 text-xs text-ink-secondary">المسدد والمتبقي حسب بيانات الفاتورة الحالية</p>
                    </div>
                    <span className="text-xs font-bold text-muted">{visibleInvoices.length} من {periodInvoices.length}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border border-line-strong px-2.5 focus-within:ring-2 focus-within:ring-primary/20">
                      <Search className="h-3.5 w-3.5 text-muted" />
                      <input aria-label="بحث في الفواتير" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="رقم الفاتورة…" className="w-full bg-transparent py-2 text-xs outline-none placeholder:text-muted" />
                    </label>
                    <select aria-label="حالة الفاتورة" value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus)} className="rounded-md border border-line-strong bg-surface px-2.5 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="all">كل الحالات</option>
                      <option value="outstanding">عليها متبقي</option>
                      <option value="paid">مسددة</option>
                    </select>
                  </div>
                </div>
                <div className="max-h-[65vh] overflow-y-auto">
                  {visibleInvoices.length ? visibleInvoices.map((invoice) => {
                    const paid = Number(invoice.remaining_amount) <= 0.01;
                    return (
                      <article key={invoice.id} className="border-b border-line px-4 py-3 last:border-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-mono text-xs font-black text-ink">{invoice.invoice_number}</h3>
                            {invoice.supplier_invoice_number && <p className="mt-0.5 text-xs text-ink-secondary">رقم المورد: {invoice.supplier_invoice_number}</p>}
                            <p className="mt-1 text-xs text-ink-secondary">{invoice.date}</p>
                          </div>
                          <span className={`rounded border px-2 py-1 text-xs font-bold ${paid ? 'border-success-border bg-success-soft text-success' : 'border-danger-border bg-danger-soft text-danger'}`}>
                            {paid ? 'مسددة' : `متبقي ${fmt(invoice.remaining_amount)}`}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
                          <div><p className="text-muted">قيمة الفاتورة</p><p className="mt-0.5 font-mono font-bold tabular-nums">{fmt(invoice.total_amount)}</p></div>
                          <div><p className="text-muted">المسدد</p><p className="mt-0.5 font-mono font-bold tabular-nums text-success">{fmt(invoice.paid_amount)}</p></div>
                          <div><p className="text-muted">المتبقي</p><p className="mt-0.5 font-mono font-bold tabular-nums text-danger">{fmt(invoice.remaining_amount)}</p></div>
                        </div>
                        {invoice.allocations?.length > 0 && (
                          <details className="mt-2 border-t border-line pt-2 text-xs">
                            <summary className="cursor-pointer font-bold text-ink-secondary focus:outline-none focus:ring-2 focus:ring-primary/20">عرض تخصيصات السداد ({invoice.allocations.length})</summary>
                            <ul className="mt-2 space-y-1">
                              {invoice.allocations.map((allocation) => (
                                <li key={allocation.id} className="flex justify-between gap-3 rounded bg-surface-muted px-2 py-1.5 text-xs">
                                  <span className="text-ink-secondary">{allocation.receiptNumber} · {allocation.paymentDate}</span>
                                  <span className="font-mono font-bold tabular-nums text-success">{fmt(allocation.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </article>
                    );
                  }) : (
                    <div className="px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-muted" />
                      <p className="mt-2 text-xs font-bold text-ink-secondary">{periodInvoices.length ? 'لا توجد فواتير تطابق المرشحات' : 'لا توجد فواتير في الفترة المحددة'}</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
                <div className="border-b border-line px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-black text-ink">سندات الصرف</h2>
                      <p className="mt-0.5 text-xs text-ink-secondary">المبالغ المخصصة والمتبقية دون تخصيص</p>
                    </div>
                    <span className="text-xs font-bold text-muted">{visiblePayments.length} من {periodPayments.length}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border border-line-strong px-2.5 focus-within:ring-2 focus-within:ring-primary/20">
                      <Search className="h-3.5 w-3.5 text-muted" />
                      <input aria-label="بحث في سندات الصرف" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="رقم السند أو البيان…" className="w-full bg-transparent py-2 text-xs outline-none placeholder:text-muted" />
                    </label>
                    <select aria-label="حالة تخصيص السند" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)} className="rounded-md border border-line-strong bg-surface px-2.5 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="all">كل الحالات</option>
                      <option value="allocated">مخصص بالكامل</option>
                      <option value="partial">مخصص جزئياً</option>
                      <option value="unapplied">غير مخصص</option>
                    </select>
                  </div>
                </div>
                <div className="max-h-[65vh] overflow-y-auto">
                  {visiblePayments.length ? visiblePayments.map((payment) => (
                    <article key={payment.id} className="border-b border-line px-4 py-3 last:border-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-mono text-xs font-black text-ink">{payment.receipt_number}</h3>
                          <p className="mt-1 text-xs text-ink-secondary">{payment.date} · {payment.payment_type}</p>
                          {payment.notes && <p className="mt-1 text-xs text-ink">{payment.notes}</p>}
                        </div>
                        <div className="text-left">
                          <p className="font-mono text-sm font-black tabular-nums text-ink">{fmt(payment.amount)}</p>
                          {canUpdate && (
                            <button type="button" onClick={() => handleOpenReallocate(payment)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
                              <SlidersHorizontal className="h-3 w-3" /> إعادة توزيع
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-y border-line py-2 text-xs">
                        <div><p className="text-muted">مخصص للفواتير</p><p className="mt-0.5 font-mono font-bold tabular-nums text-primary">{fmt(payment.allocatedAmount)}</p></div>
                        <div><p className="text-muted">غير مخصص</p><p className="mt-0.5 font-mono font-bold tabular-nums text-warning">{fmt(payment.unallocatedAmount)}</p></div>
                      </div>
                      {payment.allocations?.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {payment.allocations.map((allocation) => (
                            <li key={allocation.id} className="flex justify-between gap-3 rounded bg-surface-muted px-2 py-1.5 text-xs">
                              <span className="text-ink-secondary">فاتورة {allocation.invoiceNumber} · {allocation.invoiceDate}</span>
                              <span className="font-mono font-bold tabular-nums text-primary">{fmt(allocation.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-warning"><Clock className="h-3.5 w-3.5" /> السند غير مخصص لفاتورة محددة.</p>
                      )}
                    </article>
                  )) : (
                    <div className="px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-muted" />
                      <p className="mt-2 text-xs font-bold text-ink-secondary">{periodPayments.length ? 'لا توجد سندات تطابق المرشحات' : 'لا توجد سندات في الفترة المحددة'}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {reallocModal && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 p-3 sm:p-5" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="allocation-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-line bg-surface-muted px-4 py-4 sm:px-5">
              <div>
                <h2 id="allocation-title" className="text-sm font-black text-ink">إعادة توزيع سند {selectedPayment.receipt_number}</h2>
                <p className="mt-1 text-xs text-ink-secondary">سقف السند {fmt(paymentCap)} · التوزيعات السابقة {fmt(Object.values(priorAllocationByInvoice).reduce((sum, value) => sum + value, 0))}</p>
              </div>
              <button type="button" aria-label="إغلاق" onClick={() => setReallocModal(false)} className="rounded p-1.5 text-muted hover:bg-surface-sunken hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
                <X className="h-4 w-4" />
              </button>
            </header>
            <form onSubmit={handleSaveReallocation} className="flex min-h-0 flex-1 flex-col">
              <div className="overflow-y-auto px-4 py-4 sm:px-5">
                <p className="mb-3 text-xs leading-5 text-ink-secondary">المتاح لكل فاتورة هو رصيدها الحالي مضافاً إليه تخصيص هذا السند السابق فقط؛ أي مبالغ مسددة أخرى تظل محجوزة.</p>
                <div className="space-y-2">
                  {invoicesWithAlloc.map((invoice) => {
                    const prior = Number(priorAllocationByInvoice[invoice.id] || 0);
                    const capacity = roundMoney(Math.max(0, Number(invoice.remaining_amount || 0) + prior));
                    const value = Number(allocDraft[invoice.id] || 0);
                    const invalid = value > capacity + 0.001;
                    return (
                      <div key={invoice.id} className={`grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${invalid ? 'border-danger bg-danger-soft/50' : 'border-line bg-surface'}`}>
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-black text-ink">{invoice.invoice_number} <span className="font-sans font-medium text-muted">· {invoice.date}</span></p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-secondary">
                            <span>قيمة الفاتورة: {fmt(invoice.total_amount)}</span>
                            <span>تخصيص هذا السند سابقاً: {fmt(prior)}</span>
                            <span className="font-bold text-ink">السعة المتبقية للتخصيص: {fmt(capacity)}</span>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-ink">
                          التخصيص الجديد
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={capacity}
                            value={allocDraft[invoice.id] ?? ''}
                            onChange={(event) => setAllocDraft((draft) => ({ ...draft, [invoice.id]: event.target.value === '' ? 0 : Number(event.target.value) }))}
                            aria-label={`مبلغ التخصيص للفاتورة ${invoice.invoice_number}`}
                            aria-invalid={invalid}
                            className={`w-28 rounded border px-2 py-2 text-left font-mono text-xs font-bold tabular-nums outline-none focus:ring-2 focus:ring-primary/20 ${invalid ? 'border-danger bg-surface text-danger' : 'border-line-strong bg-surface text-ink'}`}
                          />
                          <span>ج.م</span>
                        </label>
                      </div>
                    );
                  })}
                  {!invoicesWithAlloc.length && <p className="rounded border border-dashed border-line-strong p-8 text-center text-xs text-muted">لا توجد فواتير متاحة لهذا المورد.</p>}
                </div>
              </div>
              <footer className="border-t border-line bg-surface-muted px-4 py-4 sm:px-5">
                <div className={`mb-3 grid grid-cols-2 gap-2 rounded-md border p-3 text-xs sm:grid-cols-3 ${hasInvalidAllocation ? 'border-danger-border bg-danger-soft' : 'border-line bg-surface'}`}>
                  <div><p className="text-muted">سقف السند</p><p className="mt-1 font-mono font-black tabular-nums">{fmt(paymentCap)}</p></div>
                  <div><p className="text-muted">إجمالي المخصص</p><p className="mt-1 font-mono font-black tabular-nums">{fmt(allocationTotal)}</p></div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-muted">المتبقي غير المخصص</p>
                    <p className={`mt-1 font-mono font-black tabular-nums ${allocationRemainder < -0.001 ? 'text-danger' : 'text-warning'}`}>{fmt(Math.max(0, allocationRemainder))}</p>
                  </div>
                </div>
                {hasInvalidAllocation && <p className="mb-2 text-xs font-bold text-danger" role="alert">التخصيص يتجاوز سقف السند أو السعة المتبقية لإحدى الفواتير.</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setReallocModal(false)} className="rounded-md border border-line-strong bg-surface px-4 py-2 text-xs font-bold text-ink hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-primary/30">إلغاء</button>
                  <button type="submit" disabled={!canUpdate || hasInvalidAllocation || savingAllocation} className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    {savingAllocation ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    حفظ التوزيع
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
