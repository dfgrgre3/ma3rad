import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import { CalendarDays, Download, Loader2, Pencil, Plus, Printer, RefreshCw, Search, Tag, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { CashierService } from '../../../services/domains/finance/CashierService';
import { DailyOperationsService, type DailyExpenseResult } from '../../../services/domains/operations/DailyOperationsService';
import { SettingsService } from '../../../services/domains/config/SettingsService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { ExpenseModal } from '../../../components/daily/ExpenseModal';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { useToast } from '../../../components/ui/Toast';
import type { Expense } from '../../../types';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK: 'تحويل بنكي', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك',
};
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const shiftDate = (value: string, days: number) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const ExpenseStatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
    <p className="text-[11px] font-bold text-muted dark:text-muted">{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg ${tone || 'text-ink dark:text-muted'}`}>{value}</p>
    {hint != null && <p className="mt-1 whitespace-normal break-words text-[11px] [overflow-wrap:anywhere] text-muted dark:text-muted">{hint}</p>}
  </div>
);

const ExpensesManagement: React.FC<{ dateMode: 'today' | 'range' }> = ({ dateMode }) => {
  const newExpenseLabel = useBusinessTerm('actions.newExpense');
  const toast = useToast();
  const service = useMemo(() => new CashierService(), []);
  const dailyOps = useMemo(() => new DailyOperationsService(), []);
  const user = AuthService.getCurrentUser();
  const currency = useMemo(() => {
    try { return SettingsService.getSettings().currencySymbol || 'ج.م'; }
    catch { return 'ج.م'; }
  }, []);
  const nf = useMemo(() => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }), []);
  const fmt = (amount: number) => `${nf.format(Number(amount) || 0)} ${currency}`;
  const plain = (value: number) => nf.format(Number(value) || 0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [daily, setDaily] = useState<DailyExpenseResult | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => dateMode === 'today' ? localToday() : '');
  const [dateTo, setDateTo] = useState(() => dateMode === 'today' ? localToday() : '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ initial?: Expense } | null>(null);

  const fetchData = useCallback(() => {
    if (dateMode === 'today') {
      const day = dateFrom || localToday();
      const result = dailyOps.getExpenses(day);
      return { rows: result.rows as unknown as Expense[], daily: result };
    }
    return { rows: service.getAllExpenses(dateFrom || undefined, dateTo || undefined), daily: null };
  }, [dateMode, dateFrom, dateTo, service, dailyOps]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      const { rows, daily: result } = fetchData();
      setExpenses(rows);
      setDaily(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المصروفات.');
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try {
        const { rows, daily: result } = fetchData();
        setExpenses(rows);
        setDaily(result);
      } catch {
        // keep last rendered data on transient refresh failures
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchData]);

  const filtered = expenses.filter((expense) => {
    const query = search.trim().toLowerCase();
    return !query || `${expense.category} ${expense.description} ${expense.recipient || ''}`.toLowerCase().includes(query);
  });
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const stats = useMemo(() => {
    if (daily) {
      const s = daily.summary;
      return {
        count: s.count,
        total: s.total,
        cash: s.cash,
        other: Math.round((s.total - s.cash) * 100) / 100,
        topCategory: s.topCategory,
        topCategoryAmount: s.topCategoryAmount,
      };
    }
    const count = expenses.length;
    const periodTotal = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const cash = expenses.reduce((sum, expense) => sum + (expense.paymentType === 'CASH' ? Number(expense.amount) || 0 : 0), 0);
    const byCategory = new Map<string, number>();
    expenses.forEach((expense) => {
      byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + (Number(expense.amount) || 0));
    });
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      count,
      total: periodTotal,
      cash,
      other: Math.round((periodTotal - cash) * 100) / 100,
      topCategory: top?.[0] || null,
      topCategoryAmount: top?.[1] || 0,
    };
  }, [daily, expenses]);

  const canAdd = PermissionService.can(user, 'ui.cashier.expenses.expense');
  const canEdit = PermissionService.can(user, 'cashier.expense.update');
  const canDelete = PermissionService.can(user, 'cashier.expense.delete');
  const canExport = PermissionService.can(user, 'ui.cashier.expenses.export');

  const exportRows = useMemo(
    () => filtered.map((expense) => ({ ...expense, paymentType: PAYMENT_LABELS[expense.paymentType] || expense.paymentType })),
    [filtered],
  );

  const exportColumns = [
    { key: 'category', label: 'البند' },
    { key: 'description', label: 'البيان' },
    { key: 'recipient', label: 'المستفيد' },
    { key: 'date', label: 'التاريخ' },
    { key: 'paymentType', label: 'طريقة الدفع' },
    { key: 'amount', label: 'المبلغ' },
  ];

  const exportExpenses = () => {
    try {
      exportToExcel({
        title: dateMode === 'today' ? 'مصروفات اليوم' : 'تقرير المصروفات',
        subtitle: dateFrom || dateTo ? `${dateFrom || 'البداية'} — ${dateTo || 'حتى الآن'}` : 'كل الفترات',
        fileName: `expenses-${dateFrom || 'all'}-${dateTo || 'all'}`,
        permission: 'finance.export',
        columns: exportColumns,
        rows: exportRows,
      });
      toast.success('تم تصدير المصروفات');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'تعذر تصدير المصروفات.');
    }
  };

  const printExpenses = () => {
    try {
      exportToPdf({
        title: dateMode === 'today' ? 'منصرف اليوم' : 'تقرير المصروفات',
        subtitle: `${dateMode === 'today' ? dateFrom : `${dateFrom || 'البداية'} — ${dateTo || 'حتى الآن'}`} — ${plain(stats.count)} حركة — الإجمالي ${fmt(stats.total)}`,
        fileName: `expenses-print-${dateFrom || 'all'}-${dateTo || 'all'}`,
        permission: 'finance.export',
        columns: exportColumns,
        rows: exportRows,
        kpis: [
          { label: 'عدد الحركات', value: plain(stats.count) },
          { label: 'الإجمالي', value: fmt(stats.total) },
          { label: 'النقدي', value: fmt(stats.cash) },
          { label: 'غير النقدي', value: fmt(stats.other) },
          ...(stats.topCategory ? [{ label: 'أعلى بند', value: `${stats.topCategory} — ${fmt(stats.topCategoryAmount)}` }] : []),
        ],
      });
      toast.success('تم تجهيز كشف الطباعة');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'تعذر تجهيز الطباعة.');
    }
  };

  const selectTodayDate = (value: string) => {
    setDateFrom(value);
    setDateTo(value);
  };

  const removeExpense = (expense: Expense) => {
    if (!window.confirm(`حذف مصروف «${expense.description}»؟`)) return;
    try {
      service.deleteExpense(expense.id);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف المصروف.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      <div className="shrink-0 bg-surface px-6 pt-4">
        <PageHeader
          icon={<TrendingDown className="h-5 w-5" />}
          title="إدارة المصروفات التشغيلية"
          description={dateMode === 'today' ? 'مصروفات اليوم' : 'مصروفات الفروع ضمن الفترة المحددة'}
          actions={<>
            <button type="button" onClick={load} aria-label="تحديث بيانات المصروفات" title="تحديث" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-secondary transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-primary">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canExport && <ActivityGate element="export"><button onClick={printExpenses} disabled={expenses.length === 0} className="flex items-center gap-2 px-3 py-2 border border-line text-ink rounded-xl text-sm font-semibold disabled:opacity-50"><Printer className="w-4 h-4" /> طباعة</button></ActivityGate>}
            {canExport && <ActivityGate element="export"><button onClick={exportExpenses} className="flex items-center gap-2 px-3 py-2 border border-line text-ink rounded-xl text-sm font-semibold"><Download className="w-4 h-4" /> تصدير</button></ActivityGate>}
            {canAdd && <ActivityGate element="new-expense"><button onClick={() => setEditor({})} className="flex items-center gap-2 px-4 py-2 bg-danger hover:bg-danger text-white rounded-xl text-sm font-semibold"><Plus className="w-4 h-4" /> تسجيل {newExpenseLabel}</button></ActivityGate>}
          </>}
        />
      </div>

      <section className="shrink-0 p-4 bg-surface border-b border-line flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between px-6">
        <form onSubmit={(event) => event.preventDefault()} className="relative flex-1 max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالبند أو البيان..." className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-danger" />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {dateMode === 'range' ? <>
            <CalendarDays className="w-4 h-4 text-muted" />
            <label className="text-xs text-muted">من <input aria-label="من تاريخ" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-ink" /></label>
            <label className="text-xs text-muted">إلى <input aria-label="إلى تاريخ" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-ink" /></label>
          </> : (
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => selectTodayDate(localToday())}
                aria-pressed={dateFrom === localToday()}
                className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger ${dateFrom === localToday() ? 'bg-surface text-danger shadow-sm' : 'text-ink-secondary hover:bg-surface'}`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => selectTodayDate(shiftDate(localToday(), -1))}
                aria-pressed={dateFrom === shiftDate(localToday(), -1)}
                className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger ${dateFrom === shiftDate(localToday(), -1) ? 'bg-surface text-danger shadow-sm' : 'text-ink-secondary hover:bg-surface'}`}
              >
                أمس
              </button>
              <label className="relative flex min-h-8 items-center gap-1.5 border-r border-line px-2">
                <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
                <span className="sr-only">اختيار تاريخ المصروفات</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => selectTodayDate(event.target.value || localToday())}
                  aria-label="اختيار تاريخ المصروفات"
                  className="w-[128px] bg-transparent text-xs font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-danger"
                />
              </label>
            </div>
          )}
          <div className="text-xs font-bold text-muted mr-2">الإجمالي المعروض: <span className="text-lg text-danger">{fmt(total)}</span></div>
        </div>
      </section>

      <section className="shrink-0 px-6 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <ExpenseStatCard label="عدد الحركات" value={plain(stats.count)} hint={dateMode === 'today' ? 'حركة مصروف اليوم' : 'ضمن الفترة المحددة'} />
          <ExpenseStatCard label="إجمالي المنصرف" value={fmt(stats.total)} hint="كل حركات الفترة" tone="text-danger dark:text-danger" />
          <ExpenseStatCard label="المصروف النقدي" value={fmt(stats.cash)} hint="طريقة الدفع: نقدي" tone="text-success dark:text-success" />
          <ExpenseStatCard label="غير النقدي" value={fmt(stats.other)} hint="بنكي · بطاقة · شيك" />
          <ExpenseStatCard label="أعلى بند" value={stats.topCategory || '—'} hint={stats.topCategory ? fmt(stats.topCategoryAmount) : 'لا توجد حركات'} />
          <ExpenseStatCard label="متوسط الحركة" value={stats.count ? fmt(stats.total / stats.count) : fmt(0)} hint="إجمالي ÷ عدد الحركات" />
        </div>
      </section>

      <main className="flex-1 overflow-auto p-6 pt-0">
        {error && <div role="alert" className="mb-3 px-4 py-2.5 rounded-xl bg-danger-soft border border-danger-border text-danger text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-danger" /></div> : (
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="المصروفات"
              rows={filtered}
              rowKey={(expense: any) => String(expense.id)}
              tableClassName="text-sm"
              columns={[
                {
                  key: 'category', header: 'الفئة',
                  render: (expense: any) => <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-sunken px-2.5 py-1 text-[11px] text-ink-secondary"><Tag className="h-3 w-3" />{expense.category}</span>,
                },
                { key: 'date', header: 'التاريخ', render: (expense: any) => <span className="text-muted">{expense.date}</span> },
                {
                  key: 'method', header: 'طريقة الدفع',
                  render: (expense: any) => <span className="inline-flex items-center gap-1 font-semibold text-ink"><Wallet className="h-3.5 w-3.5" />{PAYMENT_LABELS[expense.paymentType] || expense.paymentType}</span>,
                },
                { key: 'recipient', header: 'المستفيد', render: (expense: any) => <span className="text-muted">{expense.recipient || '—'}</span> },
                { key: 'desc', header: 'الوصف والبيان', render: (expense: any) => <span className="block max-w-[260px] truncate text-muted">{expense.description}</span> },
                { key: 'amount', header: 'المبلغ', render: (expense: any) => <span className="font-black text-danger">{fmt(Number(expense.amount))}</span> },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (expense: any) => (
                    <span>
                      {canEdit && <button aria-label={`تعديل مصروف ${expense.description}`} onClick={() => setEditor({ initial: expense })} className="rounded-lg p-2 text-primary hover:bg-accent-soft"><Pencil className="h-4 w-4" /></button>}
                      {canDelete && <button aria-label={`حذف مصروف ${expense.description}`} onClick={() => removeExpense(expense)} className="rounded-lg p-2 text-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>}
                    </span>
                  ),
                },
              ]}
              emptyTitle="لا توجد مصروفات مطابقة للفلاتر"
            />
          </div>
        )}
      </main>

      {editor && <ExpenseModal initial={editor.initial} onClose={() => setEditor(null)} onSaved={load} />}
    </div>
  );
};

export const ExpensesPage: React.FC = () => <ExpensesManagement dateMode="range" />;
export const TodayExpensesPage: React.FC = () => <ExpensesManagement dateMode="today" />;

export default ExpensesPage;
