import React, { useEffect, useMemo, useState } from 'react';
import {
  Receipt, ShoppingBag, TrendingDown, Banknote, CalendarDays,
  RefreshCw, Download, Loader2, AlertTriangle, Clock, Users,
  Plus, Search, Eye, Trash2, Pencil, HandCoins, Ban, ExternalLink,
} from 'lucide-react';
import { DailyOperationsService } from '../../../services/domains/operations/DailyOperationsService';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import { SalesService } from '../../../services/domains/sales/SalesService';
import { CashierService } from '../../../services/domains/finance/CashierService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useNavigate } from 'react-router-dom';
import { exportToExcel } from '../../../utils/export/export';
import { useToast } from '../../../components/ui/Toast';
import { CentralLimitGuard } from '../../../components/ui/CentralLimitGuard';
import {
  QuickSaleModal, QuickPurchaseModal, ExpenseModal, PaymentModal,
  DetailsModal, VoidModal, type PaymentTarget,
} from '../../../components/daily/DailyModals';
import { TodayPurchasesPage as PurchasesPage } from '../today-purchases/TodayPurchasesPage';
import { DataTable as UiDataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard as UiStatCard } from '../../../components/ui/Card';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { useActivityElementLabel } from '../../../hooks/domains/config/useActivityUi';
import { getActivityNavLabel } from '../../../config/activityNavLabels';


const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone }) => (
  <UiStatCard label={label} value={<span className={tone || 'text-ink'}>{value}</span>} hint={hint} />
);
type DailyKind = 'sales' | 'purchases' | 'expenses' | 'debts';

const META: Record<DailyKind, { title: string; subtitle: string; icon: React.ElementType; color: string; perm: string }> = {
  sales: {
    title: 'مبيعات اليوم',
    subtitle: 'فواتير البيع المسجلة اليوم مع المدفوعات والهامش',
    icon: Receipt,
    color: 'text-success bg-success-soft border-success-border',
    perm: 'sales.view',
  },
  purchases: {
    title: 'مشتريات اليوم',
    subtitle: 'فواتير التوريد الواردة اليوم وحالة سدادها',
    icon: ShoppingBag,
    color: 'text-warning bg-warning-soft border-warning-border',
    perm: 'purchases.view',
  },
  expenses: {
    title: 'منصرف اليوم',
    subtitle: 'المصروفات النقدية والبنكية المسجلة اليوم',
    icon: TrendingDown,
    color: 'text-danger bg-danger-soft border-danger-border',
    perm: 'cashier.expense',
  },
  debts: {
    title: 'ديون اليوم',
    subtitle: 'الديون الجديدة والتحصيلات والأقساط المستحقة',
    icon: Banknote,
    color: 'text-warning bg-warning-soft border-warning-border',
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
  PAID: 'bg-success-soft text-success',
  PARTIAL: 'bg-warning-soft text-warning',
  UNPAID: 'bg-danger-soft text-danger',
};


const SalesMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  tone?: string;
  featured?: boolean;
}> = ({ label, value, hint, tone, featured }) => (
  <div className={`min-w-0 rounded-xl border p-4 ${featured
    ? 'border-line-strong bg-primary text-white '
    : 'border-line bg-surface '}`}>
    <p className={`text-[11px] font-bold ${featured ? 'text-muted' : 'text-muted dark:text-muted'}`}>{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg xl:text-xl ${featured ? 'text-success' : tone || 'text-ink dark:text-muted'}`}>{value}</p>
    <p className={`mt-1 whitespace-normal break-words text-[11px] [overflow-wrap:anywhere] ${featured ? 'text-muted' : 'text-muted dark:text-muted'}`}>{hint}</p>
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
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="sales-pulse-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sales-pulse-title" className="text-sm font-black text-ink ">نبض المبيعات</h2>
          <p className="mt-1 text-xs text-muted ">توزيع قيمة الفواتير المسجلة على ساعات اليوم</p>
        </div>
        <div className="text-left">
          <p className="text-xs font-bold tabular-nums text-ink ">{totalInvoices} فاتورة</p>
          <p className="mt-1 text-[11px] text-muted ">{peak > 0 ? `أعلى ساعة · ${format(peak)}` : 'لا توجد حركة مسجلة'}</p>
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
          <div className="flex h-24 items-end gap-1 border-b border-line sm:gap-1.5" dir="ltr">
            {hourly.map((hour, index) => (
              <div
                key={index}
                title={`${String(index).padStart(2, '0')}:00 · ${hour.count} فاتورة · ${format(hour.total)}`}
                className={`min-w-0 flex-1 rounded-t-sm transition-colors ${hour.total > 0 ? 'bg-success hover:bg-success' : 'bg-surface-sunken dark:bg-primary'}`}
                style={{ height: hour.total > 0 ? `${Math.max((hour.total / peak) * 100, 8)}%` : '3px' }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted" dir="ltr">
            {[0, 4, 8, 12, 16, 20, 23].map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex h-24 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted ">
          {hourlyDescription} سيظهر النشاط هنا بعد تسجيل أول فاتورة.
        </div>
      )}
    </section>
  );
};

const Table: React.FC<{ title?: string; headers: string[]; rows: React.ReactNode[][]; empty: string }> = ({ title, headers, rows, empty }) => {
  const body = rows.map((cells, i) => ({ __cells: cells, __i: i }));
  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-line bg-surface-muted flex items-center justify-between">
          <h3 className="text-xs font-bold text-ink">{title}</h3>
          <span className="text-[11px] text-muted">{rows.length} سجل</span>
        </div>
      )}
      <UiDataTable
        ariaLabel={headers.join(' ')}
        rows={body}
        rowKey={(r) => String(r.__i)}
        minWidth={640}
        dense
        tableClassName="text-sm"
        columns={headers.map((h, j) => ({
          key: `c${j}`,
          header: h,
          render: (r: { __cells: React.ReactNode[] }) => <span className="whitespace-nowrap">{r.__cells[j] ?? null}</span>,
        }))}
        emptyTitle={empty}
      />
    </div>
  );
};

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
  PAID: 'dark:bg-success dark:text-success',
  PARTIAL: 'dark:bg-warning dark:text-warning',
  UNPAID: 'dark:bg-danger dark:text-danger',
};

const getDailyData = (service: DailyOperationsService, kind: DailyKind, date: string) => {
  const loaders: Record<DailyKind, (value: string) => any> = {
    sales: service.getSales.bind(service),
    purchases: service.getPurchases.bind(service),
    expenses: service.getExpenses.bind(service),
    debts: service.getDebts.bind(service),
  };
  return loaders[kind](date);
};

const getDailyRowSearchText = (kind: DailyKind, row: any) => {
  const fields: Record<DailyKind, string> = {
    sales: `${row.invoiceNumber} ${row.customerName || ''} ${row.customerPhone || ''} ${row.createdByName || ''}`,
    purchases: `${row.invoiceNumber} ${row.supplierName || ''} ${row.supplierPhone || ''}`,
    expenses: `${row.category} ${row.description} ${row.recipient || ''} ${row.registerName || ''}`,
    debts: `${row.invoiceNumber} ${row.customerName || ''} ${row.customerPhone || ''}`,
  };
  return fields[kind].toLowerCase();
};

const getDailyExportOptions = (kind: DailyKind, date: string, data: any) => {
  const invoiceColumns = [
    { key: 'invoiceNumber', label: 'الفاتورة' }, { key: 'time', label: 'الوقت' },
    { key: 'customerName', label: 'العميل' }, { key: 'itemsCount', label: 'الأصناف' },
    { key: 'total', label: 'الإجمالي' }, { key: 'paid', label: 'المدفوع' },
    { key: 'remaining', label: 'المتبقي' }, { key: 'paymentStatus', label: 'الحالة' },
  ];
  const exportOptions: Record<DailyKind, Parameters<typeof exportToExcel>[0]> = {
    sales: {
      title: getActivityNavLabel('/daily/sales') || 'مبيعات اليوم',
      subtitle: date,
      columns: invoiceColumns,
      rows: data.rows.map((row: any) => ({
        ...row,
        time: time(row.createdAt),
        paymentStatus: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
      })),
      fileName: `sales-${date}`,
      permission: 'sales.export',
    },
    purchases: {
      title: getActivityNavLabel('/daily/purchases') || 'مشتريات اليوم',
      subtitle: date,
      columns: invoiceColumns.map((column) => column.key === 'customerName'
        ? { ...column, key: 'supplierName', label: 'المورد' }
        : column),
      rows: data.rows.map((row: any) => ({
        ...row,
        time: time(row.createdAt),
        paymentStatus: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
      })),
      fileName: `purchases-${date}`,
      permission: 'purchases.export',
    },
    expenses: {
      title: 'منصرف اليوم',
      subtitle: date,
      columns: [
        { key: 'category', label: 'البند' }, { key: 'description', label: 'البيان' },
        { key: 'recipient', label: 'المستفيد' }, { key: 'paymentType', label: 'طريقة الدفع' },
        { key: 'amount', label: 'المبلغ' }, { key: 'time', label: 'الوقت' },
      ],
      rows: data.rows.map((row: any) => ({
        ...row,
        time: time(row.createdAt),
        paymentType: PAY_LABEL[row.paymentType] || row.paymentType,
      })),
      fileName: `expenses-${date}`,
      permission: 'finance.export',
    },
    debts: {
      title: 'ديون اليوم',
      subtitle: date,
      columns: [
        { key: 'invoiceNumber', label: 'الفاتورة' }, { key: 'customerName', label: 'العميل' },
        { key: 'total', label: 'الإجمالي' }, { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' }, { key: 'paymentStatus', label: 'الحالة' },
      ],
      rows: data.rows,
      fileName: `debts-${date}`,
      permission: 'finance.export',
    },
  };
  return exportOptions[kind];
};

const payBadge = (status?: string | null, darkTheme = false) => {
  const key = status || '';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PAY_STYLE[key] || 'bg-surface-sunken text-ink-secondary'} ${darkTheme ? PAY_DARK_STYLE[key] || 'dark:bg-primary dark:text-muted' : ''}`}>
      {PAY_LABEL[key] || key || '—'}
    </span>
  );
};

const DailyPage: React.FC<{ kind: DailyKind }> = ({ kind }) => {
  const activityTitle = kind === 'sales'
    ? getActivityNavLabel('/daily/sales')
    : kind === 'purchases'
      ? getActivityNavLabel('/daily/purchases')
      : undefined;
  const meta = { ...META[kind], title: activityTitle || META[kind].title };
  const Icon = meta.icon;
  const dailyPath = `/daily/${kind}` as const;
  const quickSaleLabel = useActivityElementLabel('quick-sale', dailyPath);
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
      setData(getDailyData(service, kind, date));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات اليوم');
      if (kind === 'sales') setData(null);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [kind, date]);

  const filteredRows = useMemo(() => {
    const rows: any[] = data?.rows || [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const supportsPaymentFilter = kind === 'sales' || kind === 'purchases';
      if (supportsPaymentFilter && status !== 'ALL' && row.paymentStatus !== status) return false;
      if (!term) return true;
      return getDailyRowSearchText(kind, row).includes(term);
    });
  }, [data, search, status, kind]);

  const filteredPayments = useMemo(() => {
    const rows: any[] = data?.payments || [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => !row.isOrderDepositRefunded || row.movementType === 'ORDER_DEPOSIT_REFUND')
      .filter((row) => !term || `${row.receiptNumber} ${row.customerName || ''} ${row.performedByName || ''}`.toLowerCase().includes(term));
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
        <button type="button" aria-label={`تسجيل دفعة للفاتورة ${row.invoiceNumber}`} title="تسجيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-success transition hover:bg-success-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:hover:bg-success">
          <HandCoins className="h-4 w-4" />
        </button>
      )}
      <button type="button" aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'sale', id: row.id })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary">
        <Eye className="h-4 w-4" />
      </button>
      {canVoidSale && (
        <button type="button" aria-label={`إلغاء الفاتورة ${row.invoiceNumber}`} title="إلغاء الفاتورة" onClick={() => setVoidTarget({ kind: 'sale', id: row.id, name: row.invoiceNumber })} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger transition hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-danger">
          <Ban className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const handleExport = () => {
    if (!data) return;
    try {
      exportToExcel(getDailyExportOptions(kind, date, data));
      toast.success('تم تصدير التقرير');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير التقرير');
    }
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden ${kind === 'sales' ? 'bg-surface-muted text-ink dark:bg-primary dark:text-muted' : 'bg-surface-muted text-ink'}`}>
      {kind === 'sales' ? (
        <div className="shrink-0 border-b border-line bg-surface px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-screen-2xl">
            <PageHeader
              icon={<Receipt className="h-5 w-5" />}
              title={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {meta.title}
                  <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-secondary ">
                    {date === todayDate ? 'اليوم' : formatDate(date)}
                  </span>
                </span>
              }
              description={meta.subtitle}
              actions={<>
                <CentralLimitGuard metric="maxInvoices">
                  {canCreateSale && (
                    <ActivityGate element="quick-sale" atPath={dailyPath}>
                    <button
                      type="button"
                      onClick={() => setQuickSaleOpen(true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-success px-4 text-xs font-bold text-white shadow-sm transition hover:bg-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                    >
                      <Plus className="h-4 w-4" /> {quickSaleLabel || 'بيع سريع'}
                    </button>
                    </ActivityGate>
                  )}
                </CentralLimitGuard>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-1 ">
                  <button type="button" onClick={() => setDate(todayDate)} aria-pressed={date === todayDate} className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success ${date === todayDate ? 'bg-surface text-success shadow-sm dark:bg-primary dark:text-success' : 'text-ink-secondary hover:bg-surface dark:hover:bg-primary'}`}>اليوم</button>
                  <button type="button" onClick={() => setDate(moveDate(todayDate, -1))} aria-pressed={date === moveDate(todayDate, -1)} className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success ${date === moveDate(todayDate, -1) ? 'bg-surface text-success shadow-sm dark:bg-primary dark:text-success' : 'text-ink-secondary hover:bg-surface dark:hover:bg-primary'}`}>أمس</button>
                  <label className="relative flex min-h-8 items-center gap-1.5 border-r border-line px-2 ">
                    <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
                    <span className="sr-only">اختيار تاريخ المبيعات</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value || todayDate)}
                      aria-label="اختيار تاريخ المبيعات"
                      className="w-[130px] bg-transparent text-xs font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-success "
                    />
                  </label>
                </div>
                <button type="button" onClick={load} aria-label="تحديث بيانات المبيعات" title="تحديث" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-secondary transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:hover:bg-primary">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <ActivityGate element="export" atPath={dailyPath}>
                <button type="button" onClick={handleExport} disabled={!data} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-bold text-ink transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary">
                  <Download className="h-4 w-4" /> تصدير جدول بيانات
                </button>
                </ActivityGate>
              </>}
            />
          </div>
        </div>
      ) : (
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<Icon className="w-5 h-5" />}
          title={meta.title}
          description={meta.subtitle}
          actions={<>
            {kind === 'purchases' && canCreatePurchase && (
              <ActivityGate element="quick-purchase" atPath={dailyPath}>
              <button onClick={() => setQuickPurchaseOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-warning text-white rounded-xl text-xs font-bold hover:bg-warning">
                <Plus className="w-4 h-4" /> فاتورة توريد
              </button>
              </ActivityGate>
            )}
            {kind === 'expenses' && canExpense && (
              <ActivityGate element="new-expense" atPath={dailyPath}>
              <button onClick={() => setExpenseModal({})} className="flex items-center gap-1.5 px-3.5 py-2.5 bg-danger text-white rounded-xl text-xs font-bold hover:bg-danger">
                <Plus className="w-4 h-4" /> إضافة مصروف
              </button>
              </ActivityGate>
            )}
            <div className="flex items-center gap-2 bg-surface-sunken border border-line rounded-xl px-3 py-2">
              <CalendarDays className="w-4 h-4 text-muted" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || service.today())}
                className="bg-transparent text-xs font-semibold text-ink outline-none"
              />
            </div>
            <button onClick={load} className="p-2.5 rounded-xl bg-surface-sunken text-ink-secondary hover:bg-surface-sunken" title="تحديث">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <ActivityGate element="export" atPath={dailyPath}>
            <button
              onClick={handleExport}
              disabled={!data}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> تصدير
            </button>
            </ActivityGate>
          </>}
        />
      </div>
      )}

      <div className={`flex-1 overflow-y-auto ${kind === 'sales' ? 'space-y-4 p-4 sm:space-y-5 sm:p-6' : 'space-y-5 p-6'}`}>
        {error && (
          <div role="alert" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${kind === 'sales' ? 'border-danger-border bg-danger-soft text-danger dark:bg-danger/50 dark:text-danger' : 'bg-danger-soft border-danger-border text-danger'}`}>
            <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="flex-1">{error}</span>
            {kind === 'sales' && <button type="button" onClick={load} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">إعادة المحاولة</button>}
          </div>
        )}

        {kind === 'sales' ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث برقم الفاتورة أو العميل أو الهاتف..."
              aria-label="البحث في فواتير المبيعات"
              className="w-full rounded-lg border border-line bg-surface-muted py-2.5 pl-3 pr-9 text-xs text-ink outline-none transition placeholder:text-muted focus:border-success focus:ring-2 focus:ring-success/20 "
            />
          </div>
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold text-muted ">حالة السداد</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="تصفية حسب حالة السداد" className="min-h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink outline-none focus:border-success focus:ring-2 focus:ring-success/20 sm:flex-none">
              <option value="ALL">كل الحالات</option>
              <option value="PAID">مدفوعة</option>
              <option value="PARTIAL">مدفوعة جزئيًا</option>
              <option value="UNPAID">غير مدفوعة</option>
            </select>
          </label>
          {(search || status !== 'ALL') && (
            <button type="button" onClick={() => { setSearch(''); setStatus('ALL'); }} className="min-h-9 rounded-lg px-2 text-xs font-bold text-ink-secondary underline underline-offset-2 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:hover:text-success">مسح الفلاتر</button>
          )}
          <span className="text-[11px] font-semibold text-muted sm:mr-auto" aria-live="polite">
            {loading ? 'جارٍ التحديث…' : `${plain(filteredRows.length)} من ${plain(data?.rows?.length || 0)} فاتورة`}
          </span>
        </div>
        ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === 'expenses' ? 'بحث بالبند أو البيان...' : 'بحث بالرقم أو الاسم...'}
              className="w-full pr-9 pl-3 py-2.5 bg-surface border border-line rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {kind === 'purchases' && (
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2.5 bg-surface border border-line rounded-xl text-xs font-semibold text-ink-secondary focus:outline-none">
              <option value="ALL">كل الحالات</option>
              <option value="PAID">مدفوعة</option>
              <option value="PARTIAL">مدفوعة جزئيًا</option>
              <option value="UNPAID">غير مدفوعة</option>
            </select>
          )}
          {(search || status !== 'ALL') && (
            <button onClick={() => { setSearch(''); setStatus('ALL'); }} className="px-3 py-2.5 text-xs font-semibold text-muted hover:text-ink">مسح الفلاتر</button>
          )}
          <span className="text-[11px] text-muted sm:mr-auto">
            {kind === 'debts' ? `${filteredRows.length} فاتورة · ${filteredPayments.length} سند` : `${filteredRows.length} صف`}
          </span>
        </div>
        )}

        {loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-xs font-semibold text-muted ">جارٍ تحميل بيانات اليوم…</span>
          </div>
        ) : !data ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-ink ">تعذر تحميل {meta.title}</p>
            <p className="mt-1 text-xs text-muted ">تحقق من الاتصال بقاعدة البيانات ثم أعد المحاولة.</p>
            <button type="button" onClick={load} className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:text-ink">إعادة المحاولة</button>
          </div>
        ) : kind === 'sales' ? (
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xl:grid-cols-6">
              <SalesMetric featured label="إجمالي المبيعات" value={fmt(data.summary.total)} hint={`${plain(data.summary.count)} فاتورة في ${date === todayDate ? 'اليوم' : formatDate(date)}`} />
              <SalesMetric label="عدد الفواتير" value={plain(data.summary.count)} hint="الفواتير غير الملغاة" />
              <SalesMetric label="المحصّل" value={fmt(data.summary.paid)} hint="إجمالي المدفوع" tone="text-success " />
              <SalesMetric label="المتبقي" value={fmt(data.summary.remaining)} hint="رصيد مستحق على العملاء" tone={data.summary.remaining > 0 ? 'text-danger ' : 'text-ink '} />
              <SalesMetric label="هامش الربح" value={fmt(data.summary.profit)} hint="المبيعات بعد تكلفة الأصناف" tone={data.summary.profit >= 0 ? 'text-success ' : 'text-danger '} />
              <SalesMetric label="الضريبة والخصم" value={fmt(data.summary.tax)} hint={`خصومات الفواتير · ${fmt(data.summary.discount)}`} />
            </div>

            <SalesPulse rows={data.rows} format={fmt} />

            <section className="overflow-hidden rounded-xl border border-line bg-surface " aria-labelledby="sales-invoices-title">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                <div>
                  <h2 id="sales-invoices-title" className="text-sm font-black text-ink ">فواتير المبيعات</h2>
                  <p className="mt-0.5 text-[11px] text-muted ">تفاصيل الفواتير والمدفوعات المسجلة</p>
                </div>
                <span className="rounded-md bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-secondary ">{plain(filteredRows.length)} فاتورة</span>
              </div>
              {filteredRows.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken text-muted ">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-bold text-ink ">{data.rows.length === 0 ? 'لا توجد مبيعات مسجلة في هذا اليوم' : 'لا توجد فواتير تطابق البحث'}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted ">{data.rows.length === 0 ? 'ستظهر الفواتير هنا فور تسجيلها.' : 'غيّر كلمات البحث أو حالة السداد لعرض نتائج أخرى.'}</p>
                  {search || status !== 'ALL' ? (
                    <button type="button" onClick={() => { setSearch(''); setStatus('ALL'); }} className="mt-4 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success dark:hover:bg-primary">مسح الفلاتر</button>
                  ) : canCreateSale ? (
                    <CentralLimitGuard metric="maxInvoices">
                      <button type="button" onClick={() => setQuickSaleOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-xs font-bold text-white hover:bg-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><Plus className="h-4 w-4" /> تسجيل أول عملية بيع</button>
                    </CentralLimitGuard>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-line-strong dark:divide-primary xl:hidden">
                    {filteredRows.map((row: any) => (
                      <article key={row.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-primary ">{row.invoiceNumber}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-ink ">{row.customerName || 'عميل نقدي'}</p>
                            <p className="mt-1 text-[11px] text-muted ">{time(row.createdAt)} · {plain(row.itemsCount)} أصناف</p>
                          </div>
                          {payBadge(row.paymentStatus, true)}
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-xs ">
                          <div><p className="text-[10px] text-muted ">الإجمالي</p><p className="mt-0.5 font-black tabular-nums text-ink ">{fmt(row.total)}</p></div>
                          <div><p className="text-[10px] text-muted ">المدفوع</p><p className="mt-0.5 font-bold tabular-nums text-success ">{fmt(row.paid)}</p></div>
                          <div><p className="text-[10px] text-muted ">المتبقي</p><p className={`mt-0.5 font-bold tabular-nums ${row.remaining > 0 ? 'text-danger dark:text-danger' : 'text-muted dark:text-muted'}`}>{fmt(row.remaining)}</p></div>
                          <div><p className="text-[10px] text-muted ">الربح · الضريبة · الخصم</p><p className="mt-0.5 font-semibold tabular-nums text-ink ">{fmt(row.profit)} · {fmt(row.tax)} · {fmt(row.discount)}</p></div>
                        </div>
                        <div className="mt-2 flex items-center justify-end border-t border-line pt-2 ">{saleActions(row)}</div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden xl:block">
                  <UiDataTable
                    ariaLabel="مبيعات اليوم"
                    rows={filteredRows}
                    rowKey={(row: any) => row.id}
                    minWidth={1120}
                    dense
                    tableClassName="text-xs"
                    rowClassName={() => 'transition-colors hover:bg-surface-muted/80 dark:hover:bg-primary/50'}
                    columns={[
                      { key: 'invoice', header: 'الفاتورة', render: (row: any) => <span className="font-mono font-bold text-primary ">{row.invoiceNumber}</span> },
                      { key: 'time', header: 'الوقت', render: (row: any) => <span className="whitespace-nowrap text-muted ">{time(row.createdAt)}</span> },
                      {
                        key: 'customer', header: 'العميل',
                        render: (row: any) => (
                          <span>
                            <span className="block font-semibold text-ink ">{row.customerName || 'عميل نقدي'}</span>
                            {row.customerPhone && <span className="mt-0.5 block text-[10px] text-muted " dir="ltr">{row.customerPhone}</span>}
                          </span>
                        ),
                      },
                      { key: 'items', header: 'الأصناف', render: (row: any) => <span className="tabular-nums text-ink-secondary ">{plain(row.itemsCount)}</span> },
                      { key: 'total', header: 'الإجمالي', render: (row: any) => <span className="whitespace-nowrap font-black tabular-nums text-ink ">{fmt(row.total)}</span> },
                      { key: 'paid', header: 'المدفوع', render: (row: any) => <span className="whitespace-nowrap font-semibold tabular-nums text-success ">{fmt(row.paid)}</span> },
                      { key: 'remaining', header: 'المتبقي', render: (row: any) => <span className={`whitespace-nowrap font-semibold tabular-nums ${row.remaining > 0 ? 'text-danger dark:text-danger' : 'text-muted dark:text-muted'}`}>{fmt(row.remaining)}</span> },
                      { key: 'status', header: 'الحالة', render: (row: any) => payBadge(row.paymentStatus, true) },
                      { key: 'profit', header: 'الربح', render: (row: any) => <span className={`whitespace-nowrap font-semibold tabular-nums ${row.profit >= 0 ? 'text-success dark:text-success' : 'text-danger dark:text-danger'}`}>{fmt(row.profit)}</span> },
                      { key: 'tax', header: 'الضريبة / الخصم', render: (row: any) => <span className="whitespace-nowrap text-ink-secondary "><span className="font-semibold">{fmt(row.tax)}</span><span className="mx-1 text-muted">/</span><span>{fmt(row.discount)}</span></span> },
                      { key: 'actions', header: 'إجراءات', render: (row: any) => saleActions(row) },
                    ]}
                  />
                </div>
                </>
              )}
            </section>
          </section>
        ) : kind === 'purchases' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي المشتريات" value={fmt(data.summary.total)} hint={`${data.summary.count} فاتورة`} tone="text-warning" />
              <StatCard label="المدفوع" value={fmt(data.summary.paid)} />
              <StatCard label="المتبقي للموردين" value={fmt(data.summary.remaining)} tone={data.summary.remaining > 0 ? 'text-danger' : 'text-ink'} />
              <StatCard label="الضريبة" value={fmt(data.summary.tax)} hint={`خصم ${fmt(data.summary.discount)}`} />
            </div>
            <Table
              headers={['الفاتورة', 'الوقت', 'المورد', 'الأصناف', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'إجراءات']}
              empty="لا توجد مشتريات مسجلة في هذا اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="font-mono text-warning">{row.invoiceNumber}</span>,
                <span className="text-muted">{time(row.createdAt)}</span>,
                <div><div className="font-semibold text-ink">{row.supplierName || '—'}</div><div className="text-[11px] text-muted">{row.supplierPhone || ''}</div></div>,
                plain(row.itemsCount),
                <b>{fmt(row.total)}</b>,
                <span className="text-success">{fmt(row.paid)}</span>,
                <span className={row.remaining > 0 ? 'text-danger font-semibold' : 'text-muted'}>{fmt(row.remaining)}</span>,
                payBadge(row.paymentStatus),
                <div className="flex items-center gap-1">
                  {canSupplierPay && row.remaining > 0 && (
                    <button title="سداد للمورد" onClick={() => setPaymentTarget({ kind: 'purchase', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining })} className="p-1.5 text-success hover:bg-success-soft rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
                  )}
                  <button title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'purchase', id: row.id })} className="p-1.5 text-primary hover:bg-accent-soft rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                  {canDeletePurchase && (
                    <button title="حذف فاتورة التوريد" onClick={() => setVoidTarget({ kind: 'purchase', id: row.id, name: row.invoiceNumber })} className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
          </>
        ) : kind === 'expenses' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي المنصرف" value={fmt(data.summary.total)} hint={`${data.summary.count} حركة`} tone="text-danger" />
              <StatCard label="المنصرف النقدي" value={fmt(data.summary.cash)} />
              <StatCard label="أعلى بند" value={data.summary.topCategory || '—'} hint={data.summary.topCategory ? fmt(data.summary.topCategoryAmount) : ''} />
              <StatCard label="متوسط الحركة" value={data.summary.count ? fmt(data.summary.total / data.summary.count) : fmt(0)} />
            </div>
            <Table
              headers={['البند', 'البيان', 'المستفيد', 'الخزينة', 'طريقة الدفع', 'المبلغ', 'الوقت', 'إجراءات']}
              empty="لا توجد مصروفات مسجلة في هذا اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger-soft text-danger font-bold">{row.category}</span>,
                <span className="font-semibold text-ink">{row.description}</span>,
                <span className="text-muted">{row.recipient || '—'}</span>,
                <span className="text-muted">{row.registerName || '—'}</span>,
                <span className="text-xs text-ink-secondary">{PAY_LABEL[row.paymentType] || row.paymentType || '—'}</span>,
                <b className="text-danger">{fmt(row.amount)}</b>,
                <span className="text-muted">{time(row.createdAt)}</span>,
                <div className="flex items-center gap-1">
                  {can('cashier.expense.update') && (
                    <button title="تعديل" onClick={() => setExpenseModal({ initial: row })} className="p-1.5 text-primary hover:bg-accent-soft rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                  {canDeleteExpense && (
                    <button title="حذف" onClick={() => deleteExpense(row)} className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard label="ديون جديدة اليوم" value={fmt(data.summary.newDebt)} hint={`${data.rows.length} فاتورة آجلة`} tone="text-danger" />
              <StatCard label="تحصيلات اليوم" value={fmt(data.summary.collectedToday)} hint={`${data.payments.length} إيصال`} tone="text-success" />
              <StatCard label="صافي التغير" value={fmt(data.summary.netChange)} tone={data.summary.netChange > 0 ? 'text-danger' : 'text-success'} />
              <StatCard label="أقساط مستحقة" value={fmt(data.summary.dueInstallments)} hint={`${data.dueInstallments.length} قسط`} />
              <StatCard label="إجمالي مديونية العملاء" value={fmt(data.summary.totalOutstanding)} />
            </div>
            <Table
              title="فواتير آجلة صادرة اليوم"
              headers={['الفاتورة', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'إجراءات']}
              empty="لا توجد ديون جديدة اليوم"
              rows={filteredRows.map((row: any) => [
                <span className="font-mono text-warning">{row.invoiceNumber}</span>,
                <div><div className="font-semibold text-ink">{row.customerName || '—'}</div><div className="text-[11px] text-muted">{row.customerPhone || ''}</div></div>,
                fmt(row.total),
                <span className="text-success">{fmt(row.paid)}</span>,
                <b className="text-danger">{fmt(row.remaining)}</b>,
                payBadge(row.paymentStatus),
                <div className="flex items-center gap-1">
                  {canCustomerPay && row.remaining > 0 && (
                    <button title="تحصيل دفعة" onClick={() => setPaymentTarget({ kind: 'sale', id: row.id, branchId: row.branchId, name: `${row.invoiceNumber} — ${row.customerName || ''}`, remaining: row.remaining })} className="p-1.5 text-success hover:bg-success-soft rounded-lg"><HandCoins className="w-3.5 h-3.5" /></button>
                  )}
                  <button title="التفاصيل" onClick={() => setDetailsTarget({ kind: 'sale', id: row.id })} className="p-1.5 text-primary hover:bg-accent-soft rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                  {canVoidSale && (
                    <button title="إلغاء الفاتورة" onClick={() => setVoidTarget({ kind: 'sale', id: row.id, name: row.invoiceNumber })} className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"><Ban className="w-3.5 h-3.5" /></button>
                  )}
                </div>,
              ])}
            />
            <Table
              title="تحصيلات ومدفوعات العملاء اليوم"
              headers={['الإيصال', 'العميل', 'المبلغ', 'طريقة الدفع', 'بواسطة', 'ملاحظات', 'إجراءات']}
              empty="لا توجد تحصيلات اليوم"
              rows={filteredPayments.map((row: any) => [
                <span className={`font-mono ${row.movementType === 'ORDER_DEPOSIT_REFUND' ? 'text-danger' : 'text-success'}`}>{row.receiptNumber}</span>,
                <span className="font-semibold text-ink">{row.customerName || '—'}</span>,
                <b className={row.amount < 0 ? 'text-danger' : 'text-success'}>{fmt(row.amount)}</b>,
                <span className="text-ink-secondary">{PAY_LABEL[row.paymentType] || row.paymentType}</span>,
                <span className="text-muted">{row.performedByName || '—'}</span>,
                <span className="text-muted">{row.movementType === 'ORDER_DEPOSIT_REFUND' ? `رد عربون · ${row.notes || ''}` : row.isOrderDepositRefunded ? `تم رد العربون · ${row.notes || ''}` : row.notes || '—'}</span>,
                canCustomerPay && !row.isOrderDeposit ? (
                  <button title="حذف السند" onClick={() => deleteCustomerPayment(row)} className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                ) : <span className="text-muted">—</span>,
              ])}
            />
            {data.dueInstallments.length > 0 && (
              <Table
                title="أقساط مستحقة غير مسددة"
                headers={['الخطة', 'العميل', 'القسط', 'تاريخ الاستحقاق', 'المتبقي', 'الحالة', 'إجراءات']}
                empty="لا توجد أقساط مستحقة"
                rows={data.dueInstallments.map((row: any) => [
                  <span className="font-mono text-warning">{row.planNumber}</span>,
                  <span className="font-semibold text-ink">{row.customerName || '—'}</span>,
                  `#${row.sequenceNumber}`,
                  <span className="text-ink-secondary">{row.dueDate}</span>,
                  <b className="text-danger">{fmt(row.remaining)}</b>,
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning-soft text-warning font-bold">{row.status}</span>,
                  <button title="فتح صفحة الأقساط" onClick={() => navigate('/finance/installments')} className="p-1.5 text-primary hover:bg-accent-soft rounded-lg inline-flex"><ExternalLink className="w-3.5 h-3.5" /></button>,
                ])}
              />
            )}
          </>
        )}

        <div className="flex items-center gap-2 text-[11px] text-muted justify-end">
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
export const TodayDebtsPage: React.FC = () => <DailyPage kind="debts" />;
