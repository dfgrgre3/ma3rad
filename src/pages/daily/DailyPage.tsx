import React, { useEffect, useMemo, useState } from 'react';
import {
  Receipt, ShoppingBag, TrendingDown, Banknote, CalendarDays,
  RefreshCw, Download, Loader2, AlertTriangle, Clock, Users,
  Plus, Search, Eye, Trash2, Pencil, HandCoins, Ban, ExternalLink,
} from 'lucide-react';
import { DailyOperationsService } from '../../services/DailyOperationsService';
import { SettingsService } from '../../services/SettingsService';
import { CustomerService } from '../../services/CustomerService';
import { SalesService } from '../../services/SalesService';
import { CashierService } from '../../services/CashierService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useNavigate } from 'react-router-dom';
import { exportToExcel } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';
import {
  QuickSaleModal, QuickPurchaseModal, ExpenseModal, PaymentModal,
  DetailsModal, VoidModal, type PaymentTarget,
} from '../../components/daily/DailyModals';

type DailyKind = 'sales' | 'purchases' | 'expenses' | 'debts';

const META: Record<DailyKind, { title: string; subtitle: string; icon: React.ElementType; color: string; perm: string }> = {
  sales: {
    title: 'مبيعات اليوم',
    subtitle: 'فواتير البيع المسجلة اليوم مع المدفوعات والهامش',
    icon: Receipt,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    perm: 'sales.view',
  },
  purchases: {
    title: 'مشتريات اليوم',
    subtitle: 'فواتير التوريد الواردة اليوم وحالة سدادها',
    icon: ShoppingBag,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    perm: 'purchases.view',
  },
  expenses: {
    title: 'منصرف اليوم',
    subtitle: 'المصروفات النقدية والبنكية المسجلة اليوم',
    icon: TrendingDown,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    perm: 'cashier.expense',
  },
  debts: {
    title: 'ديون اليوم',
    subtitle: 'الديون الجديدة والتحصيلات والأقساط المستحقة',
    icon: Banknote,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    perm: 'finance.debts.view',
  },
};

const PAY_LABEL: Record<string, string> = {
  PAID: 'مدفوع',
  PARTIAL: 'جزئي',
  UNPAID: 'آجل',
  PENDING: 'معلق',
  CASH: 'نقدي',
  CREDIT: 'آجل',
  BANK: 'بنكي',
  CARD: 'بطاقة',
  TRANSFER: 'تحويل',
};

const PAY_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-600',
  PARTIAL: 'bg-amber-50 text-amber-600',
  UNPAID: 'bg-rose-50 text-rose-600',
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <p className="text-[11px] font-semibold text-slate-500">{label}</p>
    <p className={`text-xl font-black mt-1 ${tone || 'text-slate-900'}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
  </div>
);

const Table: React.FC<{ title?: string; headers: string[]; rows: React.ReactNode[][]; empty: string }> = ({ title, headers, rows, empty }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
    {title && (
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        <span className="text-[11px] text-slate-500">{rows.length} سجل</span>
      </div>
    )}
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-right min-w-[640px]">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-2.5 text-[11px] font-bold text-slate-500 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="py-12 text-center text-slate-400">{empty}</td></tr>
          ) : rows.map((cells, i) => (
            <tr key={i} className="hover:bg-slate-50/70">{cells.map((cell, j) => <td key={j} className="px-4 py-2.5 whitespace-nowrap">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—');
const payBadge = (status?: string | null) => {
  const key = status || '';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PAY_STYLE[key] || 'bg-slate-100 text-slate-600'}`}>
      {PAY_LABEL[key] || key || '—'}
    </span>
  );
};

const DailyPage: React.FC<{ kind: DailyKind }> = ({ kind }) => {
  const meta = META[kind];
  const Icon = meta.icon;
  const toast = useToast();
  const navigate = useNavigate();
  const service = useMemo(() => new DailyOperationsService(), []);
  const user = useMemo(() => AuthService.getCurrentUser(), []);
  const can = (code: string) => PermissionService.can(user, code);
  const canPay = can('customers.payment');
  const canVoidSale = can('sales.void');
  const canDeletePurchase = can('purchases.delete');
  const canDeleteExpense = can('cashier.manage');
  const canCreateSale = can('sales.create');
  const canCreatePurchase = can('purchases.create');
  const canExpense = can('cashier.expense');
  const [date, setDate] = useState(() => service.today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickPurchaseOpen, setQuickPurchaseOpen] = useState(false);
  const [expenseModal, setExpenseModal] = useState<{ initial?: any } | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{ kind: 'sale' | 'purchase'; id: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ kind: 'sale' | 'purchase'; id: string; name: string } | null>(null);
  const currency = useMemo(() => {
    try { return SettingsService.getSettings().currencySymbol || 'ج.م'; }
    catch { return 'ج.م'; }
  }, []);

  const fmt = (value: number) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency}`;
  const plain = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0);

  const load = () => {
    setLoading(true);
    try {
      if (kind === 'sales') setData(service.getSales(date));
      else if (kind === 'purchases') setData(service.getPurchases(date));
      else if (kind === 'expenses') setData(service.getExpenses(date));
      else setData(service.getDebts(date));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات اليوم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, date]);

  const filteredRows = useMemo(() => {
    const rows: any[] = data?.rows || [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'ALL' && (kind === 'sales' || kind === 'purchases') && row.paymentStatus !== status) return false;
      if (!term) return true;
      const haystack = kind === 'sales'
        ? `${row.invoiceNumber} ${row.customerName || ''} ${row.customerPhone || ''} ${row.createdByName || ''}`
        : kind === 'purchases'
          ? `${row.invoiceNumber} ${row.supplierName || ''} ${row.supplierPhone || ''}`
          : kind === 'expenses'
            ? `${row.category} ${row.description} ${row.recipient || ''} ${row.registerName || ''}`
            : `${row.invoiceNumber} ${row.customerName || ''} ${row.customerPhone || ''}`;
      return haystack.toLowerCase().includes(term);
    });
  }, [data, search, status, kind]);

  const filteredPayments = useMemo(() => {
    const rows: any[] = data?.payments || [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.receiptNumber} ${row.customerName || ''} ${row.performedByName || ''}`.toLowerCase().includes(term));
  }, [data, search]);

  const deleteExpense = (row: any) => {
    if (!window.confirm(`حذف مصروف «${row.description}» بمبلغ ${fmt(row.amount)} وعكس أثره على الخزينة؟`)) return;
    try {
      new CashierService().deleteExpense(row.id);
      toast.success('تم حذف المصروف');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف المصروف');
    }
  };

  const deleteCustomerPayment = (row: any) => {
    if (!window.confirm(`حذف سند التحصيل ${row.receiptNumber} بمبلغ ${fmt(row.amount)}؟`)) return;
    try {
      if (row.invoiceId) new SalesService().deleteInvoicePayment(row.id);
      else new CustomerService().deletePayment(row.id);
      toast.success('تم حذف سند التحصيل');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر حذف السند');
    }
  };

  const handleExport = () => {
    if (!data) return;
    try {
      if (kind === 'sales') {
        exportToExcel({
          title: 'مبيعات اليوم', subtitle: date,
          columns: [
            { key: 'invoiceNumber', label: 'الفاتورة' }, { key: 'time', label: 'الوقت' },
            { key: 'customerName', label: 'العميل' }, { key: 'itemsCount', label: 'الأصناف' },
            { key: 'total', label: 'الإجمالي' }, { key: 'paid', label: 'المدفوع' },
            { key: 'remaining', label: 'المتبقي' }, { key: 'paymentStatus', label: 'الحالة' },
          ],
          rows: data.rows.map((r: any) => ({ ...r, time: time(r.createdAt), paymentStatus: PAY_LABEL[r.paymentStatus] || r.paymentStatus })),
          fileName: `sales-${date}`,
        });
      } else if (kind === 'purchases') {
        exportToExcel({
          title: 'مشتريات اليوم', subtitle: date,
          columns: [
            { key: 'invoiceNumber', label: 'الفاتورة' }, { key: 'time', label: 'الوقت' },
            { key: 'supplierName', label: 'المورد' }, { key: 'itemsCount', label: 'الأصناف' },
            { key: 'total', label: 'الإجمالي' }, { key: 'paid', label: 'المدفوع' },
            { key: 'remaining', label: 'المتبقي' }, { key: 'paymentStatus', label: 'الحالة' },
          ],
          rows: data.rows.map((r: any) => ({ ...r, time: time(r.createdAt), paymentStatus: PAY_LABEL[r.paymentStatus] || r.paymentStatus })),
          fileName: `purchases-${date}`,
        });
      } else if (kind === 'expenses') {
        exportToExcel({
          title: 'منصرف اليوم', subtitle: date,
          columns: [
            { key: 'category', label: 'البند' }, { key: 'description', label: 'البيان' },
            { key: 'recipient', label: 'المستفيد' }, { key: 'paymentType', label: 'طريقة الدفع' },
            { key: 'amount', label: 'المبلغ' }, { key: 'time', label: 'الوقت' },
          ],
          rows: data.rows.map((r: any) => ({ ...r, time: time(r.createdAt), paymentType: PAY_LABEL[r.paymentType] || r.paymentType })),
          fileName: `expenses-${date}`,
        });
      } else {
        exportToExcel({
          title: 'ديون اليوم', subtitle: date,
          columns: [
            { key: 'invoiceNumber', label: 'الفاتورة' }, { key: 'customerName', label: 'العميل' },
            { key: 'total', label: 'الإجمالي' }, { key: 'paid', label: 'المدفوع' },
            { key: 'remaining', label: 'المتبقي' }, { key: 'paymentStatus', label: 'الحالة' },
          ],
          rows: data.rows,
          fileName: `debts-${date}`,
        });
      }
      toast.success('تم تصدير التقرير');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير التقرير');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${meta.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900">{meta.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {kind === 'sales' && canCreateSale && (
              <button onClick={() => setQuickSaleOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> بيع سريع
              </button>
            )}
            {kind === 'purchases' && canCreatePurchase && (
              <button onClick={() => setQuickPurchaseOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700">
                <Plus className="w-4 h-4" /> فاتورة توريد
              </button>
            )}
            {kind === 'expenses' && canExpense && (
              <button onClick={() => setExpenseModal({})} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700">
                <Plus className="w-4 h-4" /> إضافة مصروف
              </button>
            )}
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || service.today())}
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none"
              />
            </div>
            <button onClick={load} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200" title="تحديث">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExport}
              disabled={!data}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> تصدير
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === 'expenses' ? 'بحث بالبند أو البيان...' : 'بحث بالرقم أو الاسم...'}
              className="w-full pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          {(kind === 'sales' || kind === 'purchases') && (
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 focus:outline-none">
              <option value="ALL">كل الحالات</option>
              <option value="PAID">مدفوعة</option>
              <option value="PARTIAL">مدفوعة جزئيًا</option>
              <option value="UNPAID">غير مدفوعة</option>
            </select>
          )}
          {(search || status !== 'ALL') && (
            <button onClick={() => { setSearch(''); setStatus('ALL'); }} className="px-3 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">مسح الفلاتر</button>
          )}
          <span className="text-[11px] text-slate-400 sm:mr-auto">
            {kind === 'debts' ? `${filteredRows.length} فاتورة · ${filteredPayments.length} سند` : `${filteredRows.length} صف`}
          </span>
        </div>

        {loading || !data ? (
          <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>
        ) : kind === 'sales' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard label="إجمالي المبيعات" value={fmt(data.summary.total)} hint={`${data.summary.count} فاتورة`} tone="text-emerald-600" />
              <StatCard label="المحصّل" value={fmt(data.summary.paid)} />
              <StatCard label="الآجل" value={fmt(data.summary.remaining)} tone={data.summary.remaining > 0 ? 'text-rose-600' : 'text-slate-900'} />
              <StatCard label="هامش الربح" value={fmt(data.summary.profit)} tone={data.summary.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
              <StatCard label="الضريبة" value={fmt(data.summary.tax)} hint={`خصم ${fmt(data.summary.discount)}`} />
            </div>
            <Table
              headers={['الفاتورة', 'الوقت', 'العميل', 'الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'إجراءات']}
              empty="لا توجد مبيعات مسجلة في هذا اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="font-mono text-sky-600">{row.invoiceNumber}</span>,
                <span className="text-slate-500">{time(row.createdAt)}</span>,
                <div><div className="font-semibold text-slate-900">{row.customerName || '—'}</div><div className="text-[11px] text-slate-400">{row.customerPhone || ''}</div></div>,
                plain(row.itemsCount),
                <b>{fmt(row.total)}</b>,
                <span className="text-emerald-600">{fmt(row.paid)}</span>,
                <span className={row.remaining > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{fmt(row.remaining)}</span>,
                payBadge(row.paymentStatus),
                <div className="flex items-center gap-1">
                  {canPay && row.remaining > 0 && (
                    <button title="تسجيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
                  )}
                  <button title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'sale', id: row.id })} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                  {canVoidSale && (
                    <button title="إلغاء الفاتورة" onClick={() => setVoidTarget({ kind: 'sale', id: row.id, name: row.invoiceNumber })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Ban className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
          </>
        ) : kind === 'purchases' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي المشتريات" value={fmt(data.summary.total)} hint={`${data.summary.count} فاتورة`} tone="text-orange-600" />
              <StatCard label="المدفوع" value={fmt(data.summary.paid)} />
              <StatCard label="المتبقي للموردين" value={fmt(data.summary.remaining)} tone={data.summary.remaining > 0 ? 'text-rose-600' : 'text-slate-900'} />
              <StatCard label="الضريبة" value={fmt(data.summary.tax)} hint={`خصم ${fmt(data.summary.discount)}`} />
            </div>
            <Table
              headers={['الفاتورة', 'الوقت', 'المورد', 'الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'إجراءات']}
              empty="لا توجد مشتريات مسجلة في هذا اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="font-mono text-orange-600">{row.invoiceNumber}</span>,
                <span className="text-slate-500">{time(row.createdAt)}</span>,
                <div><div className="font-semibold text-slate-900">{row.supplierName || '—'}</div><div className="text-[11px] text-slate-400">{row.supplierPhone || ''}</div></div>,
                plain(row.itemsCount),
                <b>{fmt(row.total)}</b>,
                <span className="text-emerald-600">{fmt(row.paid)}</span>,
                <span className={row.remaining > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}>{fmt(row.remaining)}</span>,
                payBadge(row.paymentStatus),
                <div className="flex items-center gap-1">
                  {canPay && row.remaining > 0 && (
                    <button title="سداد للمورد" onClick={() => setPaymentTarget({ kind: 'purchase', id: row.id, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
                  )}
                  <button title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'purchase', id: row.id })} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                  {canDeletePurchase && (
                    <button title="حذف فاتورة التوريد" onClick={() => setVoidTarget({ kind: 'purchase', id: row.id, name: row.invoiceNumber })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
          </>
        ) : kind === 'expenses' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي المنصرف" value={fmt(data.summary.total)} hint={`${data.summary.count} حركة`} tone="text-rose-600" />
              <StatCard label="المنصرف النقدي" value={fmt(data.summary.cash)} />
              <StatCard label="أعلى بند" value={data.summary.topCategory || '—'} hint={data.summary.topCategory ? fmt(data.summary.topCategoryAmount) : ''} />
              <StatCard label="متوسط الحركة" value={data.summary.count ? fmt(data.summary.total / data.summary.count) : fmt(0)} />
            </div>
            <Table
              headers={['البند', 'البيان', 'المستفيد', 'الخزينة', 'طريقة الدفع', 'المبلغ', 'الوقت', 'إجراءات']}
              empty="لا توجد مصروفات مسجلة في هذا اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-bold">{row.category}</span>,
                <span className="font-semibold text-slate-900">{row.description}</span>,
                <span className="text-slate-500">{row.recipient || '—'}</span>,
                <span className="text-slate-500">{row.registerName || '—'}</span>,
                <span className="text-xs text-slate-600">{PAY_LABEL[row.paymentType] || row.paymentType || '—'}</span>,
                <b className="text-rose-600">{fmt(row.amount)}</b>,
                <span className="text-slate-500">{time(row.createdAt)}</span>,
                <div className="flex items-center gap-1">
                  {canExpense && (
                    <button title="تعديل" onClick={() => setExpenseModal({ initial: row })} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                  {canDeleteExpense && (
                    <button title="حذف" onClick={() => deleteExpense(row)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard label="ديون جديدة اليوم" value={fmt(data.summary.newDebt)} hint={`${data.rows.length} فاتورة آجلة`} tone="text-rose-600" />
              <StatCard label="تحصيلات اليوم" value={fmt(data.summary.collectedToday)} hint={`${data.payments.length} إيصال`} tone="text-emerald-600" />
              <StatCard label="صافي التغير" value={fmt(data.summary.netChange)} tone={data.summary.netChange > 0 ? 'text-rose-600' : 'text-emerald-600'} />
              <StatCard label="أقساط مستحقة" value={fmt(data.summary.dueInstallments)} hint={`${data.dueInstallments.length} قسط`} />
              <StatCard label="إجمالي مديونية العملاء" value={fmt(data.summary.totalOutstanding)} />
            </div>
            <Table
              title="فواتير آجلة صادرة اليوم"
              headers={['الفاتورة', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'إجراءات']}
              empty="لا توجد ديون جديدة اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="font-mono text-amber-600">{row.invoiceNumber}</span>,
                <div><div className="font-semibold text-slate-900">{row.customerName || '—'}</div><div className="text-[11px] text-slate-400">{row.customerPhone || ''}</div></div>,
                fmt(row.total),
                <span className="text-emerald-600">{fmt(row.paid)}</span>,
                <b className="text-rose-600">{fmt(row.remaining)}</b>,
                payBadge(row.paymentStatus),
                <div className="flex items-center gap-1">
                  {canPay && row.remaining > 0 && (
                    <button title="تحصيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
                  )}
                  <button title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'sale', id: row.id })} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                  {canVoidSale && (
                    <button title="إلغاء الفاتورة" onClick={() => setVoidTarget({ kind: 'sale', id: row.id, name: row.invoiceNumber })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Ban className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
            <Table
              title="تحصيلات ومدفوعات العملاء اليوم"
              headers={['الإيصال', 'العميل', 'المبلغ', 'طريقة الدفع', 'بواسطة', 'ملاحظات', 'إجراءات']}
              empty="لا توجد تحصيلات اليوم"
              rows={filteredPayments.map((row: any) => [
                <span className="font-mono text-emerald-600">{row.receiptNumber}</span>,
                <span className="font-semibold text-slate-900">{row.customerName || '—'}</span>,
                <b className="text-emerald-600">{fmt(row.amount)}</b>,
                <span className="text-slate-600">{PAY_LABEL[row.paymentType] || row.paymentType}</span>,
                <span className="text-slate-500">{row.performedByName || '—'}</span>,
                <span className="text-slate-500">{row.notes || '—'}</span>,
                canPay ? (
                  <button title="حذف السند" onClick={() => deleteCustomerPayment(row)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                ) : <span className="text-slate-300">—</span>,
              ])}
            />
            {data.dueInstallments.length > 0 && (
              <Table
                title="أقساط مستحقة غير مسددة"
                headers={['الخطة', 'العميل', 'القسط', 'تاريخ الاستحقاق', 'المتبقي', 'الحالة', 'إجراءات']}
                empty="لا توجد أقساط مستحقة"
                rows={data.dueInstallments.map((row: any) => [
                  <span className="font-mono text-amber-600">{row.planNumber}</span>,
                  <span className="font-semibold text-slate-900">{row.customerName || '—'}</span>,
                  `#${row.sequenceNumber}`,
                  <span className="text-slate-600">{row.dueDate}</span>,
                  <b className="text-rose-600">{fmt(row.remaining)}</b>,
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold">{row.status}</span>,
                  <button title="فتح صفحة الأقساط" onClick={() => navigate('/finance/installments')} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg inline-flex"><ExternalLink className="w-3.5 h-3.5" /></button>,
                ])}
              />
            )}
          </>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-end">
          <Clock className="w-3.5 h-3.5" /> البيانات محدّثة لحظيًا من قاعدة البيانات المحلية
          <Users className="w-3.5 h-3.5 mr-2" /> {date}
        </div>
      </div>

      {quickSaleOpen && <QuickSaleModal onClose={() => setQuickSaleOpen(false)} onSaved={load} />}
      {quickPurchaseOpen && <QuickPurchaseModal onClose={() => setQuickPurchaseOpen(false)} onSaved={load} />}
      {expenseModal && <ExpenseModal initial={expenseModal.initial} onClose={() => setExpenseModal(null)} onSaved={load} />}
      {paymentTarget && <PaymentModal target={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={load} />}
      {detailsTarget && <DetailsModal kind={detailsTarget.kind} id={detailsTarget.id} onClose={() => setDetailsTarget(null)} onChanged={load} />}
      {voidTarget && <VoidModal target={voidTarget} onClose={() => setVoidTarget(null)} onDeleted={load} />}
    </div>
  );
};

export const TodaySalesPage: React.FC = () => <DailyPage kind="sales" />;
export const TodayPurchasesPage: React.FC = () => <DailyPage kind="purchases" />;
export const TodayExpensesPage: React.FC = () => <DailyPage kind="expenses" />;
export const TodayDebtsPage: React.FC = () => <DailyPage kind="debts" />;
