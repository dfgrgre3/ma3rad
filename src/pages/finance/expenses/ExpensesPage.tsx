import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { CalendarDays, Download, Loader2, Pencil, Plus, Search, Tag, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { CashierService } from '../../../services/domains/finance/CashierService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { ExpenseModal } from '../../../components/daily/ExpenseModal';
import { exportToExcel } from '../../../utils/export/export';
import type { Expense } from '../../../types';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدي', CARD: 'بطاقة', BANK: 'تحويل بنكي', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك',
};
const fmt = (amount: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(amount) + ' ج';
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const ExpensesManagement: React.FC<{ dateMode: 'today' | 'range' }> = ({ dateMode }) => {
  const service = useMemo(() => new CashierService(), []);
  const user = AuthService.getCurrentUser();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => dateMode === 'today' ? localToday() : '');
  const [dateTo, setDateTo] = useState(() => dateMode === 'today' ? localToday() : '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ initial?: Expense } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setExpenses(service.getAllExpenses(dateFrom || undefined, dateTo || undefined));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المصروفات.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, service]);

  useEffect(() => { load(); }, [load]);

  const filtered = expenses.filter((expense) => {
    const query = search.trim().toLowerCase();
    return !query || `${expense.category} ${expense.description} ${expense.recipient || ''}`.toLowerCase().includes(query);
  });
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const canAdd = PermissionService.can(user, 'ui.cashier.expenses.expense');
  const canEdit = PermissionService.can(user, 'cashier.expense.update');
  const canDelete = PermissionService.can(user, 'cashier.expense.delete');
  const canExport = PermissionService.can(user, 'ui.cashier.expenses.export');

  const exportExpenses = () => exportToExcel({
    title: dateMode === 'today' ? 'مصروفات اليوم' : 'تقرير المصروفات',
    subtitle: dateFrom || dateTo ? `${dateFrom || 'البداية'} — ${dateTo || 'حتى الآن'}` : 'كل الفترات',
    fileName: `expenses-${dateFrom || 'all'}-${dateTo || 'all'}`,
    permission: 'finance.export',
    columns: [
      { key: 'category', label: 'البند' },
      { key: 'description', label: 'البيان' },
      { key: 'recipient', label: 'المستفيد' },
      { key: 'date', label: 'التاريخ' },
      { key: 'paymentType', label: 'طريقة الدفع' },
      { key: 'amount', label: 'المبلغ' },
    ],
    rows: filtered.map((expense) => ({ ...expense, paymentType: PAYMENT_LABELS[expense.paymentType] || expense.paymentType })),
  });

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
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <div className="shrink-0 bg-white px-6 pt-4">
        <PageHeader
          icon={<TrendingDown className="h-5 w-5" />}
          title="إدارة المصروفات التشغيلية"
          description={dateMode === 'today' ? 'مصروفات اليوم' : 'مصروفات الفروع ضمن الفترة المحددة'}
          actions={<>
            {canExport && <button onClick={exportExpenses} className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold"><Download className="w-4 h-4" /> تصدير</button>}
            {canAdd && <button onClick={() => setEditor({})} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold"><Plus className="w-4 h-4" /> تسجيل مصروف جديد</button>}
          </>}
        />
      </div>

      <section className="p-4 bg-white border-b border-slate-200 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between px-6">
        <form onSubmit={(event) => event.preventDefault()} className="relative flex-1 max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالبند أو البيان..." className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {dateMode === 'range' ? <>
            <CalendarDays className="w-4 h-4 text-slate-500" />
            <label className="text-xs text-slate-500">من <input aria-label="من تاريخ" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-700" /></label>
            <label className="text-xs text-slate-500">إلى <input aria-label="إلى تاريخ" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-700" /></label>
          </> : <span className="text-xs text-slate-500">{dateFrom}</span>}
          <div className="text-xs font-bold text-slate-500 mr-2">الإجمالي المعروض: <span className="text-lg text-rose-600">{fmt(total)}</span></div>
        </div>
      </section>

      <main className="flex-1 overflow-auto p-6">
        {error && <div role="alert" className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-500" /></div> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              ariaLabel="المصروفات"
              rows={filtered}
              rowKey={(expense: any) => String(expense.id)}
              tableClassName="text-sm"
              columns={[
                {
                  key: 'category', header: 'الفئة',
                  render: (expense: any) => <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600"><Tag className="h-3 w-3" />{expense.category}</span>,
                },
                { key: 'date', header: 'التاريخ', render: (expense: any) => <span className="text-slate-500">{expense.date}</span> },
                {
                  key: 'method', header: 'طريقة الدفع',
                  render: (expense: any) => <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Wallet className="h-3.5 w-3.5" />{PAYMENT_LABELS[expense.paymentType] || expense.paymentType}</span>,
                },
                { key: 'recipient', header: 'المستفيد', render: (expense: any) => <span className="text-slate-500">{expense.recipient || '—'}</span> },
                { key: 'desc', header: 'الوصف والبيان', render: (expense: any) => <span className="block max-w-[260px] truncate text-slate-500">{expense.description}</span> },
                { key: 'amount', header: 'المبلغ', render: (expense: any) => <span className="font-black text-rose-600">{fmt(Number(expense.amount))}</span> },
                {
                  key: 'actions', header: 'إجراءات',
                  render: (expense: any) => (
                    <span>
                      {canEdit && <button aria-label={`تعديل مصروف ${expense.description}`} onClick={() => setEditor({ initial: expense })} className="rounded-lg p-2 text-sky-600 hover:bg-sky-50"><Pencil className="h-4 w-4" /></button>}
                      {canDelete && <button aria-label={`حذف مصروف ${expense.description}`} onClick={() => removeExpense(expense)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
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
