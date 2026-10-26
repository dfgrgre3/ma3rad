import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileText, Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Users, DollarSign, RefreshCw, TrendingUp, TrendingDown, Calendar,
  Receipt, CreditCard, Banknote, Eye, X, Printer, Download,
  CheckCircle2, Clock, AlertCircle, Filter,
} from 'lucide-react';
import { SalesService } from '../../services/SalesService';
import { CustomerService } from '../../services/CustomerService';
import { PrintService } from '../../services/PrintService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { Customer, SalesInvoice } from '../../types';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { exportToExcel, buildExportHtml } from '../../utils/export';

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';
const fmtAbs = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Math.abs(Number(n) || 0)) + ' ج';

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PAID: { label: 'مسددة', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'جزئية', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  UNPAID: { label: 'غير مسددة', color: 'bg-rose-100 text-rose-700 border-rose-200' },
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
  onClose: () => void;
}

const StatementModal: React.FC<StatementModalProps> = ({ customer, onClose }) => {
  const salesService = useMemo(() => new SalesService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const [rows, setRows] = useState<CustomerStatementRow[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [docPreview, setDocPreview] = useState<{ title: string; fileName: string; html: string } | null>(null);

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
        if ((inv.returnedAmount ?? 0) > 0) {
          runningBalance -= (inv.returnedAmount ?? 0);
          stRows.push({
            date: inv.date,
            type: 'return',
            reference: inv.invoiceNumber,
            description: `مرتجعات على الفاتورة ${inv.invoiceNumber}`,
            debit: 0,
            credit: inv.returnedAmount ?? 0,
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

  const handlePrint = () => {
    const headers = ['التاريخ', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد'];
    const tableRows = rows.map(r => [r.date, r.reference, r.description, r.debit > 0 ? fmt(r.debit) : '', r.credit > 0 ? fmt(r.credit) : '', fmt(r.balance)]);
    const html = `
      <div dir="rtl" style="font-family: Arial; padding: 20px;">
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
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-8 overflow-y-auto" dir="rtl">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-700">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-l from-sky-600/5 to-transparent">
            <div>
              <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">كشف حساب</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{customer.name}</span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500">{customer.code}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{CUSTOMER_TYPES[customer.customerType]}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Date range + actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">من:</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">إلى:</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                <Printer className="w-3.5 h-3.5" />طباعة
              </button>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                <Download className="w-3.5 h-3.5" />Excel
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">الرصيد الحالي</p>
                <p className={`text-lg font-black mt-1 ${customer.currentBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {fmtAbs(customer.currentBalance)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{customer.currentBalance > 0 ? '(مدين)' : customer.currentBalance < 0 ? '(دائن)' : 'مصفّى'}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">حد الائتمان</p>
                <p className="text-lg font-black text-sky-600 dark:text-sky-400 mt-1">{fmt(customer.creditLimit)}</p>
                <p className="text-xs text-slate-500 mt-0.5">الحد الأقصى المسموح</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">إجمالي المشتريات</p>
                <p className="text-lg font-black text-violet-600 dark:text-violet-400 mt-1">{fmt(customer.totalPurchases)}</p>
                <p className="text-xs text-slate-500 mt-0.5">إجمالي تاريخي</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">متأخرات بالفترة</p>
                <p className={`text-lg font-black mt-1 ${overdueInvoices.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {overdueInvoices.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">فاتورة متأخرة</p>
              </div>
            </div>

            {/* Overdue Alert */}
            {overdueInvoices.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-300">فواتير متأخرة السداد</p>
                  <div className="mt-2 space-y-1">
                    {overdueInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between text-xs">
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">{inv.invoiceNumber}</span>
                        <span className="text-slate-500">استحق: {inv.dueDate}</span>
                        <span className="font-bold text-rose-700 dark:text-rose-300">{fmt(inv.remainingAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Statement Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">لا توجد حركات في هذه الفترة</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                      <tr>
                        {['التاريخ', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد'].map(h => (
                          <th key={h} className="text-right font-bold text-slate-500 dark:text-slate-400 px-3 py-2.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((row, i) => (
                        <tr key={i} className={`transition-colors ${
                          row.type === 'invoice' ? 'hover:bg-rose-50/30 dark:hover:bg-rose-900/10' :
                          row.type === 'return' ? 'hover:bg-amber-50/30 dark:hover:bg-amber-900/10' :
                          'hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10'
                        }`}>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2.5 font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">{row.reference}</td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.description}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            {row.debit > 0 ? fmt(row.debit) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {row.credit > 0 ? fmt(row.credit) : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${row.balance > 0 ? 'text-rose-700 dark:text-rose-400' : row.balance < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                            {fmt(Math.abs(row.balance))}
                            {row.balance !== 0 && <span className="text-[10px] mr-1">{row.balance > 0 ? 'م' : 'د'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 font-bold text-slate-700 dark:text-slate-300 text-xs">الإجمالي</td>
                        <td className="px-3 py-3 font-bold text-rose-700 dark:text-rose-400 text-xs whitespace-nowrap">{fmt(totalDebit)}</td>
                        <td className="px-3 py-3 font-bold text-emerald-700 dark:text-emerald-400 text-xs whitespace-nowrap">{fmt(totalCredit)}</td>
                        <td className={`px-3 py-3 font-black text-xs whitespace-nowrap ${netBalance > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {fmt(Math.abs(netBalance))} {netBalance > 0 ? '(مدين)' : netBalance < 0 ? '(دائن)' : '(مصفّى)'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">إغلاق</button>
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
    </>
  );
};

const PAGE_SIZE = 20;

export const CustomerStatementPage: React.FC = () => {
  const customerService = useMemo(() => new CustomerService(), []);
  const salesService = useMemo(() => new SalesService(), []);
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'customers.view');

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
    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
      <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400" />
      <p className="font-semibold">ليس لديك صلاحية عرض هذه الصفحة.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">كشوفات حسابات العملاء</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">الرصيد الحالي — الفواتير المستحقة — المتأخرات</p>
            </div>
          </div>
          <button onClick={load} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الهاتف أو الرمز..."
                className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="ALL">كل أنواع العملاء</option>
              <option value="RETAIL">قطاعي</option>
              <option value="CONTRACTOR">مقاول</option>
              <option value="WHOLESALE">جملة</option>
              <option value="ENGINEER">مهندس</option>
            </select>
            <select value={filterBalance} onChange={e => setFilterBalance(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-400 mb-3" />
              <p className="text-sm text-rose-600">{error}</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="py-20 text-center text-slate-400 dark:text-slate-500">
              <Users className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">لا يوجد عملاء يطابقون المعايير</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['العميل', 'النوع', 'الرصيد الحالي', 'حد الائتمان', 'إجمالي المشتريات', 'متأخرات', 'آخر فاتورة', 'إجراءات'].map(h => (
                        <th key={h} className="text-right text-xs font-bold text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customers.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.code} {c.phone && `• ${c.phone}`}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            {CUSTOMER_TYPES[c.customerType] || c.customerType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold text-sm ${c.currentBalance > 0 ? 'text-rose-600 dark:text-rose-400' : c.currentBalance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                              {fmtAbs(c.currentBalance)}
                            </span>
                            {c.currentBalance !== 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${c.currentBalance > 0 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                {c.currentBalance > 0 ? 'مدين' : 'دائن'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sky-600 dark:text-sky-400 font-semibold whitespace-nowrap">{fmt(c.creditLimit)}</td>
                        <td className="px-4 py-3 text-violet-600 dark:text-violet-400 font-semibold whitespace-nowrap">{fmt(c.totalPurchases)}</td>
                        <td className="px-4 py-3">
                          {c.overdueInvoices > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{c.overdueInvoices} فاتورة</p>
                                <p className="text-[10px] text-rose-500">{fmt(c.overdueAmount)}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">لا متأخرات</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {c.lastInvoiceDate || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelected(c)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-all border border-violet-200 dark:border-violet-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            الكشف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">إجمالي {total} عميل</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <StatementModal customer={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};
