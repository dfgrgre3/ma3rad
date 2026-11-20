import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  FileText, Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Users, RefreshCw, Eye, X, Printer, Download, MessageCircle,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { SalesService } from '../../../services/domains/sales/SalesService';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { PrintService } from '../../../services/shared/PrintService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { Customer, SalesInvoice } from '../../../types';
import { DocumentPreviewModal } from '../../../components/documents/DocumentPreviewModal';
import { exportToExcel } from '../../../utils/export/export';
import { CustomerStatementWhatsAppOptions } from '../../../components/sales/CustomerStatementWhatsAppOptions';
import { ActivityGate } from '../../../components/ui/ActivityGate';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';
const fmtAbs = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Math.abs(Number(n) || 0)) + ' ج';

const _PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PAID: { label: 'مسددة', color: 'bg-success-soft text-success border-success-border' },
  PARTIAL: { label: 'جزئية', color: 'bg-warning-soft text-warning border-warning-border' },
  UNPAID: { label: 'غير مسددة', color: 'bg-danger-soft text-danger border-danger-border' },
};

const CUSTOMER_TYPES: Record<string, string> = {
  RETAIL: 'قطاعي',
  CONTRACTOR: 'مقاول',
  WHOLESALE: 'جملة',
  ENGINEER: 'مهندس',
};

interface CustomerSummary extends Customer {
  overdueInvoices: number;
  overdueAmount: number;
  lastInvoiceDate: string | null;
}

interface CustomerStatementRow {
  date: string;
  type: 'invoice' | 'payment' | 'return';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementModalProps {
  customer: Customer;
  canExport: boolean;
  onClose: () => void;
}

interface StatementTableProps {
  loading: boolean;
  rows: CustomerStatementRow[];
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

const StatementTable: React.FC<StatementTableProps> = ({
  loading,
  rows,
  totalDebit,
  totalCredit,
  netBalance,
}) => (
  <>
    {loading ? (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    ) : rows.length === 0 ? (
      <div className="py-12 text-center text-muted ">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p className="text-sm font-semibold">لا توجد حركات في هذه الفترة</p>
      </div>
    ) : (
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <DataTable
                    ariaLabel="حركات كشف الحساب"
                    rows={[...rows.map((r, i) => ({ ...r, _i: i })), { __total: true } as any]}
                    rowKey={(row: any) => row.__total ? '__total__' : String(row._i)}
                    rowClassName={(row: any) => row.__total ? 'bg-surface-sunken font-bold' : `transition-colors ${
                      row.type === 'invoice' ? 'hover:bg-danger-soft/30 dark:hover:bg-danger/10' :
                      row.type === 'return' ? 'hover:bg-warning-soft/30 dark:hover:bg-warning/10' :
                      'hover:bg-success-soft/30 dark:hover:bg-success/10'
                    }`}
                    dense
                    columns={[
                      { key: 'date', header: 'التاريخ', render: (row: any) => row.__total ? '' : <span className="text-muted whitespace-nowrap">{row.date}</span> },
                      { key: 'ref', header: 'المرجع', render: (row: any) => row.__total ? '' : <span className="font-semibold text-primary whitespace-nowrap">{row.reference}</span> },
                      { key: 'desc', header: 'البيان', render: (row: any) => row.__total ? <span className="text-xs text-ink ">الإجمالي</span> : <span className="text-ink ">{row.description}</span> },
                      { key: 'debit', header: 'مدين', align: 'end', render: (row: any) => row.__total ? <span className="font-bold text-danger text-xs whitespace-nowrap">{fmt(totalDebit)}</span> : <span className="font-semibold text-danger whitespace-nowrap">{row.debit > 0 ? fmt(row.debit) : '—'}</span> },
                      { key: 'credit', header: 'دائن', align: 'end', render: (row: any) => row.__total ? <span className="font-bold text-success text-xs whitespace-nowrap">{fmt(totalCredit)}</span> : <span className="font-semibold text-success whitespace-nowrap">{row.credit > 0 ? fmt(row.credit) : '—'}</span> },
                      {
                        key: 'balance', header: 'الرصيد', align: 'end',
                        render: (row: any) => row.__total ? (
                          <span className={`font-black text-xs whitespace-nowrap ${netBalance > 0 ? 'text-danger dark:text-danger' : 'text-success dark:text-success'}`}>
                            {fmt(Math.abs(netBalance))} {netBalance > 0 ? '(مدين)' : netBalance < 0 ? '(دائن)' : '(مصفّى)'}
                          </span>
                        ) : (
                          <span className={`font-bold whitespace-nowrap ${row.balance > 0 ? 'text-danger dark:text-danger' : row.balance < 0 ? 'text-success dark:text-success' : 'text-muted'}`}>
                            {fmt(Math.abs(row.balance))}
                            {row.balance !== 0 && <span className="text-[10px] mr-1">{row.balance > 0 ? 'م' : 'د'}</span>}
                          </span>
                        ),
                      },
                    ]}
                  />

        </div>
      </div>
    )}
  </>
);

const StatementModal: React.FC<StatementModalProps> = ({ customer, canExport, onClose }) => {
  const customerService = useMemo(() => new CustomerService(), []);
  const salesService = useMemo(() => new SalesService(), []);
  const _printService = useMemo(() => new PrintService(), []);
  const [rows, setRows] = useState<CustomerStatementRow[]>([]);
  const [invoices, setInvoices] = useState<Array<SalesInvoice & { returnBalanceCredit?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [docPreview, setDocPreview] = useState<{ title: string; fileName: string; html: string } | null>(null);
  const [shareStatement, setShareStatement] = useState<ReturnType<CustomerService['getCustomerStatement']> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const invs = salesService.getInvoicesFiltered({ customerId: customer.id, dateFrom, dateTo }, true);
      setInvoices(invs);

      // Build statement rows
      const stRows: CustomerStatementRow[] = [];
      let runningBalance = 0;

      // Sort by date
      const sorted = [...invs].sort((a, b) => a.date.localeCompare(b.date));

      for (const inv of sorted) {
        // Invoice row (debit)
        runningBalance += inv.totalAmount;
        stRows.push({
          date: inv.date,
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: `فاتورة مبيعات — ${inv.warehouseName || ''}`,
          debit: inv.totalAmount,
          credit: 0,
          balance: runningBalance,
        });

        // Payment rows (credit)
        if (inv.paidAmount > 0) {
          runningBalance -= inv.paidAmount;
          stRows.push({
            date: inv.date,
            type: 'payment',
            reference: inv.invoiceNumber,
            description: `دفعة على الفاتورة ${inv.invoiceNumber}`,
            debit: 0,
            credit: inv.paidAmount,
            balance: runningBalance,
          });
        }

        // Return rows (credit)
        const returnCredit = inv.returnBalanceCredit ?? 0;
        if (returnCredit > 0) {
          runningBalance -= returnCredit;
          stRows.push({
            date: inv.date,
            type: 'return',
            reference: inv.invoiceNumber,
            description: `مرتجعات على الفاتورة ${inv.invoiceNumber}`,
            debit: 0,
            credit: returnCredit,
            balance: runningBalance,
          });
        }
      }

      setRows(stRows);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [salesService, customer.id, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const netBalance = totalDebit - totalCredit;
  const overdueInvoices = invoices.filter(inv => inv.paymentStatus !== 'PAID' && inv.dueDate && inv.dueDate < new Date().toISOString().split('T')[0]);

  const handleShareWhatsApp = () => {
    try {
      setShareStatement(customerService.getCustomerStatement(customer.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر تحميل كشف حساب العميل.');
    }
  };

  const handlePrint = () => {
    const headers = ['التاريخ', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد'];
    const tableRows = rows.map(r => [r.date, r.reference, r.description, r.debit > 0 ? fmt(r.debit) : '', r.credit > 0 ? fmt(r.credit) : '', fmt(r.balance)]);
    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="text-align: center; margin-bottom: 4px;">كشف حساب عميل</h2>
        <p style="text-align: center; color: #666; margin-bottom: 16px;">${customer.name} — ${customer.code} | الفترة: ${dateFrom} إلى ${dateTo}</p>
        <table border="1" cellpadding="6" cellspacing="0" style="width:100%; border-collapse: collapse; font-size: 12px;">
          <thead style="background: #f1f5f9;">
            <tr>${headers.map(h => `<th style="text-align:right; padding: 8px;">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${tableRows.map(r => `<tr>${r.map(c => `<td style="padding: 6px;">${c}</td>`).join('')}</tr>`).join('')}
          </tbody>
          <tfoot style="background: #e2e8f0; font-weight: bold;">
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right;">الإجمالي</td>
              <td style="padding: 8px;">${fmt(totalDebit)}</td>
              <td style="padding: 8px;">${fmt(totalCredit)}</td>
              <td style="padding: 8px;">${fmt(netBalance)}</td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top: 16px; padding: 12px; background: ${netBalance > 0 ? '#fff1f2' : '#f0fdf4'}; border-radius: 8px; border: 1px solid ${netBalance > 0 ? '#fecdd3' : '#bbf7d0'};">
          <strong>صافي الرصيد: ${fmt(netBalance)} ${netBalance > 0 ? '(مدين)' : '(دائن)'}</strong>
        </div>
      </div>
    `;
    setDocPreview({ title: `كشف حساب — ${customer.name}`, fileName: `statement_${customer.code}`, html });
  };

  const handleExport = () => {
    exportToExcel({
      title: `كشف حساب - ${customer.name}`,
      subtitle: `كود العميل: ${customer.code}`,
      columns: [
        { key: 'date', label: 'التاريخ' },
        { key: 'reference', label: 'المرجع' },
        { key: 'description', label: 'البيان' },
        { key: 'debit', label: 'مدين' },
        { key: 'credit', label: 'دائن' },
        { key: 'balance', label: 'الرصيد' },
      ],
      rows: rows as any,
      fileName: `statement_${customer.code}`,
      permission: 'customers.export',
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-8 overflow-y-auto">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl border border-line ">
          {/* Header */}
          <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-l from-primary/5 to-transparent">
            <div>
              <h2 className="font-bold text-lg text-ink ">كشف حساب</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-semibold text-ink ">{customer.name}</span>
                <span className="text-xs text-muted">•</span>
                <span className="text-xs text-muted">{customer.code}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-surface-sunken text-ink-secondary ">{CUSTOMER_TYPES[customer.customerType]}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-sunken dark:hover:bg-primary transition-colors">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Date range + actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted ">من:</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-line-strong bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted ">إلى:</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-line-strong bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <ActivityGate element="print">
                <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line-strong text-sm font-semibold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary transition-all">
                  <Printer className="w-3.5 h-3.5" />طباعة
                </button>
              </ActivityGate>
              {canExport && customer.phone && <ActivityGate element="send">
                <button onClick={handleShareWhatsApp} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success hover:bg-success text-sm font-semibold text-white transition-all">
                  <MessageCircle className="w-3.5 h-3.5" />إرسال واتساب
                </button>
              </ActivityGate>}
              <ActivityGate element="export">
                <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-line-strong text-sm font-semibold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary transition-all">
                  <Download className="w-3.5 h-3.5" />جدول بيانات
                </button>
              </ActivityGate>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface-muted dark:bg-primary/50 rounded-xl border border-line p-3">
                <p className="text-[10px] text-muted font-medium">الرصيد الحالي</p>
                <p className={`text-lg font-black mt-1 ${customer.currentBalance > 0 ? 'text-danger dark:text-danger' : 'text-success dark:text-success'}`}>
                  {fmtAbs(customer.currentBalance)}
                </p>
                <p className="text-xs text-muted mt-0.5">{customer.currentBalance > 0 ? '(مدين)' : customer.currentBalance < 0 ? '(دائن)' : 'مصفّى'}</p>
              </div>
              <div className="bg-surface-muted dark:bg-primary/50 rounded-xl border border-line p-3">
                <p className="text-[10px] text-muted font-medium">حد الائتمان</p>
                <p className="text-lg font-black text-primary mt-1">{fmt(customer.creditLimit)}</p>
                <p className="text-xs text-muted mt-0.5">الحد الأقصى المسموح</p>
              </div>
              <div className="bg-surface-muted dark:bg-primary/50 rounded-xl border border-line p-3">
                <p className="text-[10px] text-muted font-medium">إجمالي المشتريات</p>
                <p className="text-lg font-black text-primary mt-1">{fmt(customer.totalPurchases)}</p>
                <p className="text-xs text-muted mt-0.5">إجمالي تاريخي</p>
              </div>
              <div className="bg-surface-muted dark:bg-primary/50 rounded-xl border border-line p-3">
                <p className="text-[10px] text-muted font-medium">متأخرات بالفترة</p>
                <p className={`text-lg font-black mt-1 ${overdueInvoices.length > 0 ? 'text-danger dark:text-danger' : 'text-success dark:text-success'}`}>
                  {overdueInvoices.length}
                </p>
                <p className="text-xs text-muted mt-0.5">فاتورة متأخرة</p>
              </div>
            </div>

            {/* Overdue Alert */}
            {overdueInvoices.length > 0 && (
              <div className="bg-danger-soft dark:bg-danger/20 border border-danger-border rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-danger ">فواتير متأخرة السداد</p>
                  <div className="mt-2 space-y-1">
                    {overdueInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between text-xs">
                        <span className="text-danger font-semibold">{inv.invoiceNumber}</span>
                        <span className="text-muted">استحق: {inv.dueDate}</span>
                        <span className="font-bold text-danger ">{fmt(inv.remainingAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Statement Table */}
            <StatementTable
              loading={loading}
              rows={rows}
              totalDebit={totalDebit}
              totalCredit={totalCredit}
              netBalance={netBalance}
            />
          </div>

          <div className="p-4 border-t border-line flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-line-strong text-sm font-semibold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary transition-all">إغلاق</button>
          </div>
        </div>
      </div>

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
        />
      )}
      {shareStatement && (
        <CustomerStatementWhatsAppOptions
          key={`${shareStatement.customer.id}-${shareStatement.customer.updatedAt}`}
          statement={shareStatement}
          buttonClassName=""
          buttonLabel=""
          showTrigger={false}
          initiallyOpen
          onClose={() => setShareStatement(null)}
        />
      )}
    </>
  );
};

const PAGE_SIZE = 20;

export const CustomerStatementPage: React.FC = () => {
  const customerService = useMemo(() => new CustomerService(), []);
  const salesService = useMemo(() => new SalesService(), []);
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'ui.customers.list.view')
    && PermissionService.can(user, 'ui.sales.invoices.view')
    && PermissionService.can(user, 'ui.finance.receivables.view');
  const canExport = PermissionService.can(user, 'ui.customers.list.export');

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterBalance, setFilterBalance] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);

  const load = useCallback(() => {
    if (!canView) { setLoading(false); setError('ليس لديك صلاحية.'); return; }
    setLoading(true);
    setError(null);
    try {
      let all = customerService.getAllCustomers(search.trim() || undefined);
      if (filterType !== 'ALL') all = all.filter(c => c.customerType === filterType);
      if (filterBalance === 'DEBIT') all = all.filter(c => c.currentBalance > 0);
      if (filterBalance === 'CREDIT') all = all.filter(c => c.currentBalance < 0);
      if (filterBalance === 'ZERO') all = all.filter(c => c.currentBalance === 0);

      // Enrich with overdue invoice data
      const today = new Date().toISOString().split('T')[0];
      const enriched: CustomerSummary[] = all.map(c => {
        const invs = salesService.getInvoicesFiltered({ customerId: c.id }, false);
        const overdue = invs.filter(i => i.paymentStatus !== 'PAID' && i.dueDate && i.dueDate < today);
        const sorted = [...invs].sort((a, b) => b.date.localeCompare(a.date));
        return {
          ...c,
          overdueInvoices: overdue.length,
          overdueAmount: overdue.reduce((s, i) => s + i.remainingAmount, 0),
          lastInvoiceDate: sorted[0]?.date || null,
        };
      });

      setTotal(enriched.length);
      const start = (page - 1) * PAGE_SIZE;
      setCustomers(enriched.slice(start, start + PAGE_SIZE));
    } catch (e: any) {
      setError(e?.message || 'حدث خطأ.');
    } finally {
      setLoading(false);
    }
  }, [customerService, salesService, canView, search, filterType, filterBalance, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filterType, filterBalance]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canView) return (
    <div className="p-8 text-center text-muted ">
      <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-warning" />
      <p className="font-semibold">ليس لديك صلاحية عرض هذه الصفحة.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-surface-muted ">
      {/* Header */}
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<FileText className="w-5 h-5" />}
          title="كشوفات حسابات العملاء"
          description="الرصيد الحالي — الفواتير المستحقة — المتأخرات"
          actions={
            <button onClick={load} className="p-2 rounded-xl text-muted hover:bg-surface-sunken dark:hover:bg-primary transition-colors" title="تحديث">
              <RefreshCw className="w-4 h-4" />
            </button>
          }
        />
      </div>

      {/* Filters */}
      <div className="px-6 py-4">
        <div className="bg-surface rounded-xl border border-line p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-surface-muted rounded-xl px-3 py-2.5 border border-line ">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الهاتف أو الرمز..."
                className="flex-1 text-sm bg-transparent text-ink placeholder-muted focus:outline-none"
              />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="ALL">كل أنواع العملاء</option>
              <option value="RETAIL">قطاعي</option>
              <option value="CONTRACTOR">مقاول</option>
              <option value="WHOLESALE">جملة</option>
              <option value="ENGINEER">مهندس</option>
            </select>
            <select value={filterBalance} onChange={e => setFilterBalance(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="ALL">كل الأرصدة</option>
              <option value="DEBIT">مديونون فقط</option>
              <option value="CREDIT">لهم رصيد</option>
              <option value="ZERO">صفر</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-danger mb-3" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="py-20 text-center text-muted ">
              <Users className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">لا يوجد عملاء يطابقون المعايير</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <DataTable
                                    ariaLabel="أرصدة العملاء"
                                    rows={customers}
                                    rowKey={(c) => c.id}
                                    columns={[
                                      {
                                        key: 'customer', header: 'العميل',
                                        render: (c) => (
                                          <div>
                                            <p className="font-bold text-ink ">{c.name}</p>
                                            <p className="text-xs text-muted">{c.code} {c.phone && `• ${c.phone}`}</p>
                                          </div>
                                        ),
                                      },
                                      {
                                        key: 'type', header: 'النوع',
                                        render: (c) => (
                                          <span className="px-2.5 py-1 rounded-lg bg-surface-sunken text-xs font-semibold text-ink-secondary ">
                                            {CUSTOMER_TYPES[c.customerType] || c.customerType}
                                          </span>
                                        ),
                                      },
                                      {
                                        key: 'balance', header: 'الرصيد الحالي',
                                        render: (c) => (
                                          <div className="flex items-center gap-1.5">
                                            <span className={`font-bold text-sm ${c.currentBalance > 0 ? 'text-danger dark:text-danger' : c.currentBalance < 0 ? 'text-success dark:text-success' : 'text-muted'}`}>
                                              {fmtAbs(c.currentBalance)}
                                            </span>
                                            {c.currentBalance !== 0 && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.currentBalance > 0 ? 'bg-danger-soft text-danger dark:bg-danger/30 dark:text-danger' : 'bg-success-soft text-success dark:bg-success/30 dark:text-success'}`}>
                                                {c.currentBalance > 0 ? 'مدين' : 'دائن'}
                                              </span>
                                            )}
                                          </div>
                                        ),
                                      },
                                      { key: 'limit', header: 'حد الائتمان', render: (c) => <span className="text-primary font-semibold whitespace-nowrap">{fmt(c.creditLimit)}</span> },
                                      { key: 'purchases', header: 'إجمالي المشتريات', render: (c) => <span className="text-primary font-semibold whitespace-nowrap">{fmt(c.totalPurchases)}</span> },
                                      {
                                        key: 'overdue', header: 'متأخرات',
                                        render: (c) => c.overdueInvoices > 0 ? (
                                          <div className="flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                                            <div>
                                              <p className="text-xs font-bold text-danger ">{c.overdueInvoices} فاتورة</p>
                                              <p className="text-[10px] text-danger">{fmt(c.overdueAmount)}</p>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1 text-success ">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span className="text-xs font-semibold">لا متأخرات</span>
                                          </div>
                                        ),
                                      },
                                      { key: 'last', header: 'آخر فاتورة', render: (c) => <span className="text-xs text-muted whitespace-nowrap">{c.lastInvoiceDate || '—'}</span> },
                                      {
                                        key: 'actions', header: 'إجراءات',
                                        render: (c) => (
                                          <button
                                            onClick={() => setSelected(c)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-soft dark:bg-primary/20 text-primary text-xs font-semibold hover:bg-accent-soft dark:hover:bg-primary/30 transition-all border border-accent-border "
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            الكشف
                                          </button>
                                        ),
                                      },
                                    ]}
                                  />

              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-line flex items-center justify-between">
                <p className="text-xs text-muted ">إجمالي {total} عميل</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-ink-secondary px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40 transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <StatementModal customer={selected} canExport={canExport} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};
