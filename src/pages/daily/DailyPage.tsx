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
import { TodayPurchasesPage as PurchasesPage } from './TodayPurchasesPage';

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

const SalesMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  tone?: string;
  featured?: boolean;
}> = ({ label, value, hint, tone, featured }) => (
  <div className={`min-w-0 rounded-xl border p-4 ${featured
    ? 'border-slate-800 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-900'
    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
    <p className={`text-[11px] font-bold ${featured ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg xl:text-xl ${featured ? 'text-emerald-300' : tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    <p className={`mt-1 whitespace-normal break-words text-[11px] [overflow-wrap:anywhere] ${featured ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{hint}</p>
  </div>
);

const SalesPulse: React.FC<{ rows: any[]; format: (value: number) => string }> = ({ rows, format }) => {
  const hourly = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
  rows.forEach((row) => {
    const timestamp = new Date(row.createdAt);
    if (Number.isNaN(timestamp.getTime())) return;
    const hour = timestamp.getHours();
    hourly[hour].total += Number(row.total) || 0;
    hourly[hour].count += 1;
  });
  const peak = Math.max(...hourly.map((hour) => hour.total), 0);
  const totalInvoices = hourly.reduce((sum, hour) => sum + hour.count, 0);
  const activeHours = hourly.reduce((sum, hour) => sum + Number(hour.count > 0), 0);
  const peakHour = hourly.findIndex((hour) => hour.total === peak && peak > 0);
  const hourlyDescription = totalInvoices > 0
    ? `تم تسجيل ${totalInvoices} فاتورة خلال ${activeHours} ${activeHours === 1 ? 'ساعة نشطة' : 'ساعات نشطة'}. ${activeHours === 1 ? `الساعة النشطة ${String(peakHour).padStart(2, '0')}:00 بإجمالي ${format(peak)}.` : `أعلى إجمالي في الساعة ${String(peakHour).padStart(2, '0')}:00 بقيمة ${format(peak)}.`}`
    : 'لا توجد فواتير مسجلة في هذا اليوم.';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5" aria-labelledby="sales-pulse-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sales-pulse-title" className="text-sm font-black text-slate-900 dark:text-slate-100">نبض المبيعات</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">توزيع قيمة الفواتير المسجلة على ساعات اليوم</p>
        </div>
        <div className="text-left">
          <p className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">{totalInvoices} فاتورة</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{peak > 0 ? `أعلى ساعة · ${format(peak)}` : 'لا توجد حركة مسجلة'}</p>
        </div>
      </div>
      <p id="sales-pulse-description" className="sr-only">{hourlyDescription}</p>
      <ul className="sr-only" aria-label="تفاصيل المبيعات بحسب الساعة">
        {hourly.map((hour, index) => hour.count > 0 ? (
          <li key={index}>{String(index).padStart(2, '0')}:00: {hour.count} {hour.count === 1 ? 'فاتورة' : 'فواتير'}، بإجمالي {format(hour.total)}</li>
        ) : null)}
      </ul>
      {totalInvoices > 0 ? (
        <div className="mt-5" role="img" aria-labelledby="sales-pulse-title" aria-describedby="sales-pulse-description">
          <div className="flex h-24 items-end gap-1 border-b border-slate-200 dark:border-slate-700 sm:gap-1.5" dir="ltr">
            {hourly.map((hour, index) => (
              <div
                key={index}
                title={`${String(index).padStart(2, '0')}:00 · ${hour.count} فاتورة · ${format(hour.total)}`}
                className={`min-w-0 flex-1 rounded-t-sm transition-colors ${hour.total > 0 ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-100 dark:bg-slate-800'}`}
                style={{ height: hour.total > 0 ? `${Math.max((hour.total / peak) * 100, 8)}%` : '3px' }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-slate-400" dir="ltr">
            {[0, 4, 8, 12, 16, 20, 23].map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {hourlyDescription} سيظهر النشاط هنا بعد تسجيل أول فاتورة.
        </div>
      )}
    </section>
  );
};

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
const moveDate = (value: string, days: number) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const PAY_DARK_STYLE: Record<string, string> = {
  PAID: 'dark:bg-emerald-950 dark:text-emerald-300',
  PARTIAL: 'dark:bg-amber-950 dark:text-amber-300',
  UNPAID: 'dark:bg-rose-950 dark:text-rose-300',
};

const payBadge = (status?: string | null, darkTheme = false) => {
  const key = status || '';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PAY_STYLE[key] || 'bg-slate-100 text-slate-600'} ${darkTheme ? PAY_DARK_STYLE[key] || 'dark:bg-slate-700 dark:text-slate-200' : ''}`}>
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
  const canCustomerPay = can('customers.payment');
  const canSupplierPay = can('suppliers.payment');
  const canVoidSale = can('sales.void');
  const canDeletePurchase = can('purchases.delete');
  const canDeleteExpense = can('cashier.expense.delete');
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
  const todayDate = service.today();

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
      if (kind === 'sales') setData(null);
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

  const saleActions = (row: any) => (
    <div className="flex items-center gap-1">
      {canCustomerPay && row.remaining > 0 && (
        <button type="button" aria-label={`تسجيل دفعة للفاتورة ${row.invoiceNumber}`} title="تسجيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-950">
          <HandCoins className="h-4 w-4" />
        </button>
      )}
      <button type="button" aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'sale', id: row.id })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sky-700 transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300 dark:hover:bg-sky-950">
        <Eye className="h-4 w-4" />
      </button>
      {canVoidSale && (
        <button type="button" aria-label={`إلغاء الفاتورة ${row.invoiceNumber}`} title="إلغاء الفاتورة" onClick={() => setVoidTarget({ kind: 'sale', id: row.id, name: row.invoiceNumber })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-950">
          <Ban className="h-4 w-4" />
        </button>
      )}
    </div>
  );

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
    <div className={`h-full flex flex-col overflow-hidden ${kind === 'sales' ? 'bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100' : 'bg-slate-50 text-slate-900'}`} dir="rtl">
      {kind === 'sales' ? (
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="text-base font-black text-slate-900 dark:text-white">مبيعات اليوم</h1>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {date === todayDate ? 'اليوم' : formatDate(date)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCreateSale && (
                <button
                  type="button"
                  onClick={() => setQuickSaleOpen(true)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                >
                  <Plus className="h-4 w-4" /> بيع سريع
                </button>
              )}
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                <button type="button" onClick={() => setDate(todayDate)} aria-pressed={date === todayDate} className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${date === todayDate ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}>اليوم</button>
                <button type="button" onClick={() => setDate(moveDate(todayDate, -1))} aria-pressed={date === moveDate(todayDate, -1)} className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${date === moveDate(todayDate, -1) ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}>أمس</button>
                <label className="relative flex min-h-8 items-center gap-1.5 border-r border-slate-200 px-2 dark:border-slate-700">
                  <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span className="sr-only">اختيار تاريخ المبيعات</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value || todayDate)}
                    aria-label="اختيار تاريخ المبيعات"
                    className="w-[130px] bg-transparent text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200"
                  />
                </label>
              </div>
              <button type="button" onClick={load} aria-label="تحديث بيانات المبيعات" title="تحديث" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={handleExport} disabled={!data} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <Download className="h-4 w-4" /> تصدير Excel
              </button>
            </div>
          </div>
        </header>
      ) : (
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
      )}

      <div className={`flex-1 overflow-y-auto ${kind === 'sales' ? 'space-y-4 p-4 sm:space-y-5 sm:p-6' : 'space-y-5 p-6'}`}>
        {error && (
          <div role="alert" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${kind === 'sales' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="flex-1">{error}</span>
            {kind === 'sales' && <button type="button" onClick={load} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">إعادة المحاولة</button>}
          </div>
        )}

        {kind === 'sales' ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث برقم الفاتورة أو العميل أو الهاتف..."
              aria-label="البحث في فواتير المبيعات"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">حالة السداد</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="تصفية حسب حالة السداد" className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:flex-none">
              <option value="ALL">كل الحالات</option>
              <option value="PAID">مدفوعة</option>
              <option value="PARTIAL">مدفوعة جزئيًا</option>
              <option value="UNPAID">غير مدفوعة</option>
            </select>
          </label>
          {(search || status !== 'ALL') && (
            <button type="button" onClick={() => { setSearch(''); setStatus('ALL'); }} className="min-h-9 rounded-lg px-2 text-xs font-bold text-slate-600 underline underline-offset-2 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:text-emerald-300">مسح الفلاتر</button>
          )}
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:mr-auto" aria-live="polite">
            {loading ? 'جارٍ التحديث…' : `${plain(filteredRows.length)} من ${plain(data?.rows?.length || 0)} فاتورة`}
          </span>
        </div>
        ) : (
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
          {kind === 'purchases' && (
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
        )}

        {loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
            <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">جارٍ تحميل بيانات اليوم…</span>
          </div>
        ) : !data ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <AlertTriangle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">تعذر تحميل {meta.title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">تحقق من الاتصال بقاعدة البيانات ثم أعد المحاولة.</p>
            <button type="button" onClick={load} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-slate-100 dark:text-slate-900">إعادة المحاولة</button>
          </div>
        ) : kind === 'sales' ? (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
              <SalesMetric featured label="إجمالي المبيعات" value={fmt(data.summary.total)} hint={`${plain(data.summary.count)} فاتورة في ${date === todayDate ? 'اليوم' : formatDate(date)}`} />
              <SalesMetric label="عدد الفواتير" value={plain(data.summary.count)} hint="الفواتير غير الملغاة" />
              <SalesMetric label="المحصّل" value={fmt(data.summary.paid)} hint="إجمالي المدفوع" tone="text-emerald-700 dark:text-emerald-300" />
              <SalesMetric label="المتبقي" value={fmt(data.summary.remaining)} hint="رصيد مستحق على العملاء" tone={data.summary.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'} />
              <SalesMetric label="هامش الربح" value={fmt(data.summary.profit)} hint="المبيعات بعد تكلفة الأصناف" tone={data.summary.profit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'} />
              <SalesMetric label="الضريبة والخصم" value={fmt(data.summary.tax)} hint={`خصومات الفواتير · ${fmt(data.summary.discount)}`} />
            </div>

            <SalesPulse rows={data.rows} format={fmt} />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="sales-invoices-title">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
                <div>
                  <h2 id="sales-invoices-title" className="text-sm font-black text-slate-900 dark:text-slate-100">فواتير المبيعات</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">تفاصيل الفواتير والمدفوعات المسجلة</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{plain(filteredRows.length)} فاتورة</span>
              </div>
              {filteredRows.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{data.rows.length === 0 ? 'لا توجد مبيعات مسجلة في هذا اليوم' : 'لا توجد فواتير تطابق البحث'}</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{data.rows.length === 0 ? 'ستظهر الفواتير هنا فور تسجيلها.' : 'غيّر كلمات البحث أو حالة السداد لعرض نتائج أخرى.'}</p>
                  {search || status !== 'ALL' ? (
                    <button type="button" onClick={() => { setSearch(''); setStatus('ALL'); }} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">مسح الفلاتر</button>
                  ) : canCreateSale ? (
                    <button type="button" onClick={() => setQuickSaleOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><Plus className="h-4 w-4" /> تسجيل أول عملية بيع</button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 xl:hidden">
                    {filteredRows.map((row: any) => (
                      <article key={row.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-sky-700 dark:text-sky-300">{row.invoiceNumber}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{row.customerName || 'عميل نقدي'}</p>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{time(row.createdAt)} · {plain(row.itemsCount)} أصناف</p>
                          </div>
                          {payBadge(row.paymentStatus, true)}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                          <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الإجمالي</p><p className="mt-0.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</p></div>
                          <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المدفوع</p><p className="mt-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</p></div>
                          <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المتبقي</p><p className={`mt-0.5 font-bold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</p></div>
                          <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الربح · الضريبة · الخصم</p><p className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{fmt(row.profit)} · {fmt(row.tax)} · {fmt(row.discount)}</p></div>
                        </div>
                        <div className="mt-2 flex items-center justify-end border-t border-slate-100 pt-2 dark:border-slate-800">{saleActions(row)}</div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full min-w-[1120px] text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/70">
                        <tr>{['الفاتورة', 'الوقت', 'العميل', 'الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'الربح', 'الضريبة / الخصم', 'إجراءات'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredRows.map((row: any) => (
                          <tr key={row.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-3 font-mono font-bold text-sky-700 dark:text-sky-300">{row.invoiceNumber}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-500 dark:text-slate-400">{time(row.createdAt)}</td>
                            <td className="px-3 py-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{row.customerName || 'عميل نقدي'}</div>{row.customerPhone && <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400" dir="ltr">{row.customerPhone}</div>}</td>
                            <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{plain(row.itemsCount)}</td>
                            <td className="whitespace-nowrap px-3 py-3 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</td>
                            <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</td>
                            <td className={`whitespace-nowrap px-3 py-3 font-semibold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</td>
                            <td className="px-3 py-3">{payBadge(row.paymentStatus, true)}</td>
                            <td className={`whitespace-nowrap px-3 py-3 font-semibold tabular-nums ${row.profit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{fmt(row.profit)}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300"><span className="font-semibold">{fmt(row.tax)}</span><span className="mx-1 text-slate-400">/</span><span>{fmt(row.discount)}</span></td>
                            <td className="px-3 py-2">{saleActions(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </section>
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
                  {canSupplierPay && row.remaining > 0 && (
                    <button title="سداد للمورد" onClick={() => setPaymentTarget({ kind: 'purchase', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
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
                  {can('cashier.expense.update') && (
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
                  {canCustomerPay && row.remaining > 0 && (
                    <button title="تحصيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
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
                canCustomerPay ? (
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
export const TodayPurchasesPage: React.FC = () => <PurchasesPage />;
export const TodayExpensesPage: React.FC = () => <DailyPage kind="expenses" />;
export const TodayDebtsPage: React.FC = () => <DailyPage kind="debts" />;
