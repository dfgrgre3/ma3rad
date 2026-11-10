import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 sm:text-lg">كشف حساب المورد</h1>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">مراجعة الحركات المالية ومطابقة سندات الصرف بفواتير الشراء</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  disabled={!statementData || loading}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> تصدير Excel
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={!statementData || loading}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5" /> طباعة / PDF
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6" aria-label="مرشحات كشف الحساب">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs font-bold text-slate-600">
            المورد
            <span className="mt-1 flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-sky-600/25">
              <Search className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
              <input
                aria-label="بحث عن مورد"
                value={supplierSearch}
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="ابحث بالاسم أو الكود"
                className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm font-medium text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400"
              />
              <select
                aria-label="اختيار المورد"
                value={selectedSupplierId}
                onChange={(event) => setSelectedSupplierId(event.target.value)}
                className="max-w-[52%] border-0 border-r border-slate-200 bg-slate-50 py-2 pl-2 pr-2 text-xs font-bold text-slate-800 outline-none focus:ring-0"
              >
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.code}</option>
                ))}
              </select>
            </span>
          </label>
          <label className="text-xs font-bold text-slate-600">
            من تاريخ
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            إلى تاريخ
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
            />
          </label>
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-1" role="tablist" aria-label="طريقة عرض الحساب">
            <div role="tab" aria-selected={viewMode === 'statement'} className="contents">
              <button
                type="button"
                aria-selected={viewMode === 'statement'}
                onClick={() => setViewMode('statement')}
                className={`rounded px-3 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-sky-600/30 ${viewMode === 'statement' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                كشف الحساب
              </button>
            </div>
            <div role="tab" aria-selected={viewMode === 'matching'} className="contents">
              <button
                type="button"
                aria-selected={viewMode === 'matching'}
                onClick={() => setViewMode('matching')}
                className={`rounded px-3 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-sky-600/30 ${viewMode === 'matching' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                المطابقة
              </button>
            </div>
          </div>
        </div>
        {invalidDateRange && <p className="mt-2 text-xs font-semibold text-rose-700">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p>}
      </section>

      {selectedSupplier && statementData && !loading && !loadError && !invalidDateRange && (
        <section className="grid grid-cols-2 border-b border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-5" aria-label="ملخص الفترة">
          {[
            { label: 'الرصيد الافتتاحي', value: statementData.openingBalance, icon: Clock, tone: 'text-slate-700', emphasis: 'normal' },
            { label: 'مشتريات الفترة', value: periodPurchases, icon: ArrowUpRight, tone: 'text-sky-700', emphasis: 'normal' },
            { label: 'مسدد / خصومات الفترة', value: periodCredits, icon: ArrowDownRight, tone: 'text-emerald-700', emphasis: 'normal' },
            { label: 'الرصيد الختامي للفترة', value: statementData.closingBalance, icon: CheckCircle2, tone: 'text-amber-800', emphasis: 'closing' },
            { label: 'الرصيد الحالي للمورد', value: selectedSupplier.currentBalance, icon: FileText, tone: 'text-rose-300', emphasis: 'current' }
          ].map(({ label, value, icon: Icon, tone, emphasis }) => (
            <div
              key={label}
              className={`min-w-0 border-b border-l px-4 py-3 last:border-l-0 sm:border-b-0 ${
                emphasis === 'current'
                  ? 'border-slate-700 bg-slate-900'
                  : emphasis === 'closing'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-slate-100 bg-white'
              }`}
            >
              <div className={`flex items-center gap-2 text-xs font-bold ${emphasis === 'current' ? 'text-slate-100' : emphasis === 'closing' ? 'text-amber-950' : 'text-slate-600'}`}>
                <Icon className={`h-3.5 w-3.5 ${tone}`} /> {label}
              </div>
              <div className={`mt-1 font-mono font-black tabular-nums ${
                emphasis === 'current'
                  ? 'text-base leading-tight text-white sm:text-lg xl:text-xl'
                  : emphasis === 'closing'
                    ? 'text-base text-amber-950'
                    : 'text-sm text-slate-900'
              }`}>{fmt(Number(value || 0))}</div>
            </div>
          ))}
        </section>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {!selectedSupplierId && !loading && !loadError && (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 text-sm font-black text-slate-800">لا يوجد مورد مطابق للبحث</h2>
            <p className="mt-1 text-xs text-slate-500">غيّر عبارة البحث أو امسحها لعرض الموردين المتاحين.</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white p-12 text-sm font-bold text-slate-600" role="status">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-700" /> جارٍ تحميل بيانات المورد…
          </div>
        )}
        {!loading && loadError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-5 text-center" role="alert">
            <AlertCircle className="mx-auto h-6 w-6 text-rose-700" />
            <p className="mt-2 text-sm font-bold text-rose-800">{loadError}</p>
            <button type="button" onClick={loadStatement} className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100">
              <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
            </button>
          </div>
        )}
        {!loading && !loadError && invalidDateRange && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-5 text-center text-sm font-semibold text-amber-900">
            عدّل نطاق التاريخ لعرض كشف حساب متسق.
          </div>
        )}
        {!loading && !loadError && statementData && !invalidDateRange && viewMode === 'statement' && (
          <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">حركات الحساب</h2>
                <p className="mt-0.5 text-xs text-slate-500">{selectedSupplier?.name} · {dateFrom || 'بداية السجل'} — {dateTo || 'حتى اليوم'}</p>
              </div>
              <span className="text-xs font-bold text-slate-500">{transactions.length} حركة</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-right text-xs">
                <thead className="bg-white text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="px-4 py-3 font-bold">التاريخ</th>
                    <th scope="col" className="px-4 py-3 font-bold">رقم المستند</th>
                    <th scope="col" className="px-4 py-3 font-bold">البيان</th>
                    <th scope="col" className="px-4 py-3 text-left font-bold text-sky-800">دائن — فاتورة</th>
                    <th scope="col" className="px-4 py-3 text-left font-bold text-emerald-800">مدين — سداد / تسوية</th>
                    <th scope="col" className="px-4 py-3 text-left font-bold text-slate-900">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50 font-bold text-slate-700">
                    <td className="px-4 py-3">{dateFrom || '—'}</td>
                    <td className="px-4 py-3 font-mono">—</td>
                    <td className="px-4 py-3">الرصيد الافتتاحي للفترة</td>
                    <td className="px-4 py-3 text-left">—</td>
                    <td className="px-4 py-3 text-left">—</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums">{fmt(statementData.openingBalance)}</td>
                  </tr>
                  {transactions.map((transaction: any, index: number) => (
                    <tr key={`${transaction.id}-${index}`} className="transition-colors hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{transaction.date}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-800">{transaction.docNumber || '—'}</td>
                      <td className="min-w-[260px] px-4 py-3 text-slate-700">{transaction.description}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-left font-mono font-bold tabular-nums text-sky-800">
                        {Number(transaction.credit) > 0 ? fmt(transaction.credit) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-left font-mono font-bold tabular-nums text-emerald-800">
                        {Number(transaction.debit) > 0 ? fmt(transaction.debit) : '—'}
                      </td>
                      <td className="whitespace-nowrap bg-slate-50/60 px-4 py-3 text-left font-mono font-black tabular-nums text-slate-900">{fmt(transaction.balanceAfter)}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <CheckCircle2 className="mx-auto h-6 w-6 text-slate-300" />
                        <p className="mt-2 text-sm font-bold text-slate-600">لا توجد حركات في هذه الفترة</p>
                        <p className="mt-1 text-xs text-slate-500">الرصيد الختامي يساوي الرصيد الافتتاحي.</p>
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                    <td className="px-4 py-3">{dateTo || '—'}</td>
                    <td className="px-4 py-3 font-mono">—</td>
                    <td className="px-4 py-3">الرصيد الختامي للفترة</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums text-sky-800">{fmt(periodPurchases)}</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums text-emerald-800">{fmt(periodCredits)}</td>
                    <td className="px-4 py-3 text-left font-mono tabular-nums">{fmt(statementData.closingBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && !loadError && statementData && !invalidDateRange && viewMode === 'matching' && (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="ملخص المطابقة">
              {[
                { label: 'المسدد على الفواتير', value: invoicePaid, tone: 'text-emerald-800' },
                { label: 'المتبقي على الفواتير', value: invoiceOutstanding, tone: 'text-rose-800' },
                { label: 'مخصص من سندات الفترة', value: allocatedTotal, tone: 'text-sky-800' },
                { label: 'غير مخصص من سندات الفترة', value: unappliedTotal, tone: 'text-amber-800' }
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-slate-200 bg-white px-3 py-3">
                  <p className="text-xs font-bold text-slate-600">{item.label}</p>
                  <p className={`mt-1 font-mono text-sm font-black tabular-nums ${item.tone}`}>{fmt(item.value)}</p>
                </div>
              ))}
            </section>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-black text-slate-900">فواتير الشراء</h2>
                      <p className="mt-0.5 text-xs text-slate-600">المسدد والمتبقي حسب بيانات الفاتورة الحالية</p>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{visibleInvoices.length} من {periodInvoices.length}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border border-slate-300 px-2.5 focus-within:ring-2 focus-within:ring-sky-600/20">
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      <input aria-label="بحث في الفواتير" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="رقم الفاتورة…" className="w-full bg-transparent py-2 text-xs outline-none placeholder:text-slate-400" />
                    </label>
                    <select aria-label="حالة الفاتورة" value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus)} className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-600/20">
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
                      <article key={invoice.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-mono text-xs font-black text-slate-900">{invoice.invoice_number}</h3>
                            {invoice.supplier_invoice_number && <p className="mt-0.5 text-xs text-slate-600">رقم المورد: {invoice.supplier_invoice_number}</p>}
                            <p className="mt-1 text-xs text-slate-600">{invoice.date}</p>
                          </div>
                          <span className={`rounded border px-2 py-1 text-xs font-bold ${paid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                            {paid ? 'مسددة' : `متبقي ${fmt(invoice.remaining_amount)}`}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
                          <div><p className="text-slate-500">قيمة الفاتورة</p><p className="mt-0.5 font-mono font-bold tabular-nums">{fmt(invoice.total_amount)}</p></div>
                          <div><p className="text-slate-500">المسدد</p><p className="mt-0.5 font-mono font-bold tabular-nums text-emerald-800">{fmt(invoice.paid_amount)}</p></div>
                          <div><p className="text-slate-500">المتبقي</p><p className="mt-0.5 font-mono font-bold tabular-nums text-rose-800">{fmt(invoice.remaining_amount)}</p></div>
                        </div>
                        {invoice.allocations?.length > 0 && (
                          <details className="mt-2 border-t border-slate-100 pt-2 text-xs">
                            <summary className="cursor-pointer font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20">عرض تخصيصات السداد ({invoice.allocations.length})</summary>
                            <ul className="mt-2 space-y-1">
                              {invoice.allocations.map((allocation) => (
                                <li key={allocation.id} className="flex justify-between gap-3 rounded bg-slate-50 px-2 py-1.5 text-xs">
                                  <span className="text-slate-600">{allocation.receiptNumber} · {allocation.paymentDate}</span>
                                  <span className="font-mono font-bold tabular-nums text-emerald-800">{fmt(allocation.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </article>
                    );
                  }) : (
                    <div className="px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-slate-300" />
                      <p className="mt-2 text-xs font-bold text-slate-600">{periodInvoices.length ? 'لا توجد فواتير تطابق المرشحات' : 'لا توجد فواتير في الفترة المحددة'}</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-black text-slate-900">سندات الصرف</h2>
                      <p className="mt-0.5 text-xs text-slate-600">المبالغ المخصصة والمتبقية دون تخصيص</p>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{visiblePayments.length} من {periodPayments.length}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border border-slate-300 px-2.5 focus-within:ring-2 focus-within:ring-sky-600/20">
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      <input aria-label="بحث في سندات الصرف" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="رقم السند أو البيان…" className="w-full bg-transparent py-2 text-xs outline-none placeholder:text-slate-400" />
                    </label>
                    <select aria-label="حالة تخصيص السند" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)} className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-600/20">
                      <option value="all">كل الحالات</option>
                      <option value="allocated">مخصص بالكامل</option>
                      <option value="partial">مخصص جزئياً</option>
                      <option value="unapplied">غير مخصص</option>
                    </select>
                  </div>
                </div>
                <div className="max-h-[65vh] overflow-y-auto">
                  {visiblePayments.length ? visiblePayments.map((payment) => (
                    <article key={payment.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-mono text-xs font-black text-slate-900">{payment.receipt_number}</h3>
                          <p className="mt-1 text-xs text-slate-600">{payment.date} · {payment.payment_type}</p>
                          {payment.notes && <p className="mt-1 text-xs text-slate-700">{payment.notes}</p>}
                        </div>
                        <div className="text-left">
                          <p className="font-mono text-sm font-black tabular-nums text-slate-900">{fmt(payment.amount)}</p>
                          {canUpdate && (
                            <button type="button" onClick={() => handleOpenReallocate(payment)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-sky-800 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-600/30">
                              <SlidersHorizontal className="h-3 w-3" /> إعادة توزيع
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-2 text-xs">
                        <div><p className="text-slate-500">مخصص للفواتير</p><p className="mt-0.5 font-mono font-bold tabular-nums text-sky-800">{fmt(payment.allocatedAmount)}</p></div>
                        <div><p className="text-slate-500">غير مخصص</p><p className="mt-0.5 font-mono font-bold tabular-nums text-amber-800">{fmt(payment.unallocatedAmount)}</p></div>
                      </div>
                      {payment.allocations?.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {payment.allocations.map((allocation) => (
                            <li key={allocation.id} className="flex justify-between gap-3 rounded bg-slate-50 px-2 py-1.5 text-xs">
                              <span className="text-slate-600">فاتورة {allocation.invoiceNumber} · {allocation.invoiceDate}</span>
                              <span className="font-mono font-bold tabular-nums text-sky-800">{fmt(allocation.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Clock className="h-3.5 w-3.5" /> السند غير مخصص لفاتورة محددة.</p>
                      )}
                    </article>
                  )) : (
                    <div className="px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-slate-300" />
                      <p className="mt-2 text-xs font-bold text-slate-600">{periodPayments.length ? 'لا توجد سندات تطابق المرشحات' : 'لا توجد سندات في الفترة المحددة'}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {reallocModal && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-5" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="allocation-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
              <div>
                <h2 id="allocation-title" className="text-sm font-black text-slate-900">إعادة توزيع سند {selectedPayment.receipt_number}</h2>
                <p className="mt-1 text-xs text-slate-600">سقف السند {fmt(paymentCap)} · التوزيعات السابقة {fmt(Object.values(priorAllocationByInvoice).reduce((sum, value) => sum + value, 0))}</p>
              </div>
              <button type="button" aria-label="إغلاق" onClick={() => setReallocModal(false)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/30">
                <X className="h-4 w-4" />
              </button>
            </header>
            <form onSubmit={handleSaveReallocation} className="flex min-h-0 flex-1 flex-col">
              <div className="overflow-y-auto px-4 py-4 sm:px-5">
                <p className="mb-3 text-xs leading-5 text-slate-600">المتاح لكل فاتورة هو رصيدها الحالي مضافاً إليه تخصيص هذا السند السابق فقط؛ أي مبالغ مسددة أخرى تظل محجوزة.</p>
                <div className="space-y-2">
                  {invoicesWithAlloc.map((invoice) => {
                    const prior = Number(priorAllocationByInvoice[invoice.id] || 0);
                    const capacity = roundMoney(Math.max(0, Number(invoice.remaining_amount || 0) + prior));
                    const value = Number(allocDraft[invoice.id] || 0);
                    const invalid = value > capacity + 0.001;
                    return (
                      <div key={invoice.id} className={`grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${invalid ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-black text-slate-900">{invoice.invoice_number} <span className="font-sans font-medium text-slate-500">· {invoice.date}</span></p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span>قيمة الفاتورة: {fmt(invoice.total_amount)}</span>
                            <span>تخصيص هذا السند سابقاً: {fmt(prior)}</span>
                            <span className="font-bold text-slate-700">السعة المتبقية للتخصيص: {fmt(capacity)}</span>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
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
                            className={`w-28 rounded border px-2 py-2 text-left font-mono text-xs font-bold tabular-nums outline-none focus:ring-2 focus:ring-sky-600/20 ${invalid ? 'border-rose-400 bg-white text-rose-800' : 'border-slate-300 bg-white text-slate-900'}`}
                          />
                          <span>ج.م</span>
                        </label>
                      </div>
                    );
                  })}
                  {!invoicesWithAlloc.length && <p className="rounded border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">لا توجد فواتير متاحة لهذا المورد.</p>}
                </div>
              </div>
              <footer className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <div className={`mb-3 grid grid-cols-2 gap-2 rounded-md border p-3 text-xs sm:grid-cols-3 ${hasInvalidAllocation ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                  <div><p className="text-slate-500">سقف السند</p><p className="mt-1 font-mono font-black tabular-nums">{fmt(paymentCap)}</p></div>
                  <div><p className="text-slate-500">إجمالي المخصص</p><p className="mt-1 font-mono font-black tabular-nums">{fmt(allocationTotal)}</p></div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-slate-500">المتبقي غير المخصص</p>
                    <p className={`mt-1 font-mono font-black tabular-nums ${allocationRemainder < -0.001 ? 'text-rose-800' : 'text-amber-800'}`}>{fmt(Math.max(0, allocationRemainder))}</p>
                  </div>
                </div>
                {hasInvalidAllocation && <p className="mb-2 text-xs font-bold text-rose-800" role="alert">التخصيص يتجاوز سقف السند أو السعة المتبقية لإحدى الفواتير.</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setReallocModal(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500/30">إلغاء</button>
                  <button type="submit" disabled={!canUpdate || hasInvalidAllocation || savingAllocation} className="inline-flex items-center gap-2 rounded-md border border-sky-800 bg-sky-800 px-4 py-2 text-xs font-bold text-white hover:bg-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
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
