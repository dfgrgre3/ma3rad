import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActivityGate } from '../../../components/ui/ActivityGate';
import {
  BookOpen, ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown,
  Loader2, Pencil, Plus, Power, RotateCcw, Search, Trash2, X,
} from 'lucide-react';
import { FinanceExtrasService, Account, AccountType } from '../../../services/domains/finance/FinanceExtrasService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';

import { useToast } from '../../../components/ui/Toast';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'أصول',
  LIABILITY: 'التزامات',
  EQUITY: 'حقوق ملكية',
  REVENUE: 'إيرادات',
  EXPENSE: 'مصروفات',
};
const TYPE_COLORS: Record<AccountType, string> = {
  ASSET: 'bg-accent-soft text-primary border-accent-border',
  LIABILITY: 'bg-danger-soft text-danger border-danger-border',
  EQUITY: 'bg-accent-soft text-primary border-accent-border',
  REVENUE: 'bg-success-soft text-success border-success-border',
  EXPENSE: 'bg-warning-soft text-warning border-warning-border',
};
const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n || 0) + ' ج';

type AccountTreeNode = { account: Account; children: AccountTreeNode[] };
type AccountTree = { roots: AccountTreeNode[]; parentOf: Map<string, Account> };
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const compareAccounts = (a: Account, b: Account) =>
  a.code.localeCompare(b.code, 'ar', { numeric: true, sensitivity: 'base' }) ||
  a.name.localeCompare(b.name, 'ar') ||
  a.id.localeCompare(b.id);

const buildAccountTree = (accounts: Account[]): AccountTree => {
  const sorted = [...accounts].sort(compareAccounts);
  const byCode = new Map<string, Account>();
  sorted.forEach((account) => {
    if (!byCode.has(account.code)) byCode.set(account.code, account);
  });

  const parentOf = new Map<string, Account>();
  sorted.forEach((account) => {
    const parent = account.parentCode ? byCode.get(account.parentCode) : undefined;
    if (parent && parent.id !== account.id) parentOf.set(account.id, parent);
  });

  const complete = new Set<string>();
  sorted.forEach((account) => {
    if (complete.has(account.id)) return;
    const chain: Account[] = [];
    const positions = new Map<string, number>();
    let cursor: Account | undefined = account;
    while (cursor && !complete.has(cursor.id)) {
      if (positions.has(cursor.id)) {
        const cycleTail = chain[chain.length - 1];
        if (cycleTail) parentOf.delete(cycleTail.id);
        break;
      }
      positions.set(cursor.id, chain.length);
      chain.push(cursor);
      cursor = parentOf.get(cursor.id);
    }
    chain.forEach((item) => complete.add(item.id));
  });

  const nodes = new Map<string, AccountTreeNode>();
  sorted.forEach((account) => nodes.set(account.id, { account, children: [] }));
  const roots: AccountTreeNode[] = [];
  sorted.forEach((account) => {
    const node = nodes.get(account.id)!;
    const parent = parentOf.get(account.id);
    const parentNode = parent ? nodes.get(parent.id) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  });
  return { roots, parentOf };
};

export const ChartOfAccountsPage: React.FC = () => {
  const toast = useToast();
  const newAccountLabel = useBusinessTerm('actions.newAccount');
  const service = useMemo(() => new FinanceExtrasService(), []);
  const canManage = PermissionService.can(AuthService.getCurrentUser(), 'ui.finance.accounts.approve');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AccountType>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'ASSET' as AccountType, parentCode: '', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    try { setAccounts(service.getAccounts()); setError(null); }
    catch (e: any) { setError(e?.message || 'تعذر تحميل دليل الحسابات.'); }
    finally { setLoading(false); }
  }, [service, setLoading, setAccounts, setError]);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);
  const totals = useMemo(() => {
    const result: Partial<Record<AccountType, number>> = {};
    accounts.forEach((account) => {
      result[account.type] = (result[account.type] || 0) + Number(account.computedBalance ?? account.balance ?? 0);
    });
    return result;
  }, [accounts]);

  const query = search.trim().toLocaleLowerCase('ar');
  const matches = useMemo(() => {
    const result = new Set<string>();
    accounts.forEach((account) => {
      const matchesType = typeFilter === 'ALL' || account.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? !!account.isActive : !account.isActive);
      const matchesSearch = !query ||
        account.name.toLocaleLowerCase('ar').includes(query) ||
        account.code.toLocaleLowerCase('ar').includes(query);
      if (matchesType && matchesStatus && matchesSearch) result.add(account.id);
    });
    return result;
  }, [accounts, query, statusFilter, typeFilter]);

  const isFiltering = !!query || typeFilter !== 'ALL' || statusFilter !== 'ALL';
  const visibleIds = useMemo(() => {
    const result = new Set<string>();
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    matches.forEach((id) => {
      let cursor: Account | undefined = accountsById.get(id);
      while (cursor && !result.has(cursor.id)) {
        result.add(cursor.id);
        cursor = tree.parentOf.get(cursor.id);
      }
    });
    return result;
  }, [accounts, matches, tree]);

  const rows = useMemo(() => {
    const flattened: Array<{ node: AccountTreeNode; depth: number; isExpanded: boolean; continuing: boolean[]; isLastSibling: boolean }> = [];
    const stack = tree.roots.slice().reverse().map((node, index) => ({
      node, depth: 0, continuing: [] as boolean[], isLastSibling: index === 0,
    }));
    while (stack.length) {
      const { node, depth, continuing, isLastSibling } = stack.pop()!;
      const account = node.account;
      if (!visibleIds.has(account.id)) continue;
      const isExpanded = isFiltering || expanded === null || expanded.has(account.id);
      flattened.push({ node, depth, isExpanded, continuing, isLastSibling });
      if (node.children.length && isExpanded) {
        node.children.slice().reverse().forEach((child, reversedIndex) => stack.push({
          node: child,
          depth: depth + 1,
          continuing: [...continuing, !isLastSibling],
          isLastSibling: reversedIndex === 0,
        }));
      }
    }
    return flattened;
  }, [expanded, isFiltering, tree, visibleIds]);

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current ?? accounts.map((account) => account.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) service.updateAccount(editing.id, { name: form.name, notes: form.notes });
      else service.createAccount({ code: form.code, name: form.name, type: form.type, parentCode: form.parentCode || undefined, notes: form.notes });
      setModal(false);
      setEditing(null);
      setForm({ code: '', name: '', type: 'ASSET', parentCode: '', notes: '' });
      load();
    } catch (err: any) { toast.error(err?.message || 'تعذر حفظ الحساب.'); }
  };

  const openNew = (parent?: Account) => {
    setEditing(null);
    setForm({
      code: '',
      name: '',
      type: parent?.type || 'ASSET',
      parentCode: parent?.code || '',
      notes: '',
    });
    setModal(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setForm({ code: account.code, name: account.name, type: account.type, parentCode: account.parentCode || '', notes: account.notes || '' });
    setModal(true);
  };

  const toggle = (account: Account) => {
    try { service.updateAccount(account.id, { isActive: !account.isActive }); load(); }
    catch (err: any) { toast.error(err?.message || 'تعذر تحديث الحساب.'); }
  };

  const remove = (account: Account) => {
    if (!confirm(`حذف الحساب ${account.code} — ${account.name}؟`)) return;
    try { service.deleteAccount(account.id); load(); }
    catch (err: any) { toast.error(err?.message || 'تعذر حذف الحساب.'); }
  };

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
  };

  const expandableIds = useMemo(() => {
    const ids = new Set<string>();
    accounts.forEach((account) => {
      const parent = tree.parentOf.get(account.id);
      if (parent) ids.add(parent.id);
    });
    return [...ids];
  }, [accounts, tree]);
  const hasChildren = expandableIds.length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="shrink-0 bg-surface px-4 pt-4 sm:px-6">
        <PageHeader
          icon={<BookOpen className="h-5 w-5" />}
          title="دليل الحسابات العام"
          description="هيكل الحسابات المحاسبية وأرصدتها المستخرجة من القيود"
          actions={<>
            <span className="text-xs font-semibold text-muted">{accounts.length} حساب</span>
            {canManage && (
              <ActivityGate element="new-account"><button onClick={() => openNew()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                <Plus className="h-4 w-4" /> {newAccountLabel}
              </button></ActivityGate>
            )}
          </>}
        />
      </div>

      <section aria-label="ملخص الأرصدة حسب نوع الحساب" className="grid shrink-0 grid-cols-2 gap-2 border-b border-line bg-surface p-3 sm:grid-cols-3 sm:gap-3 sm:px-6 sm:py-4 lg:grid-cols-5">
        {(Object.keys(TYPE_LABELS) as AccountType[]).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={typeFilter === type}
            onClick={() => setTypeFilter(typeFilter === type ? 'ALL' : type)}
            className={`rounded-lg border px-3 py-2 text-right transition focus:outline-none focus:ring-2 focus:ring-primary ${typeFilter === type ? 'ring-2 ring-primary' : 'hover:border-line-strong'} ${TYPE_COLORS[type]}`}
          >
            <span className="block text-[10px] font-bold">{TYPE_LABELS[type]}</span>
            <span className="mt-1 block font-mono text-sm font-black tabular-nums" dir="ltr">{fmt(totals[type] || 0)}</span>
          </button>
        ))}
      </section>

      <section aria-label="تصفية دليل الحسابات" className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1 lg:max-w-md">
            <span className="sr-only">بحث بالكود أو اسم الحساب</span>
            <Search aria-hidden="true" className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالكود أو اسم الحساب..."
              className="w-full rounded-lg border border-line bg-surface-muted py-2.5 pl-4 pr-10 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="account-status-filter">حالة الحساب</label>
            <select
              id="account-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-bold text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">كل الحالات</option>
              <option value="ACTIVE">نشط</option>
              <option value="INACTIVE">موقوف</option>
            </select>
            <span className="text-xs text-muted">{isFiltering ? `${matches.size} نتيجة · المسارات ظاهرة` : `${rows.length} حساب ظاهر`}</span>
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-bold text-muted transition hover:bg-surface-sunken hover:text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              <RotateCcw className="h-3.5 w-3.5" /> إعادة الضبط
            </button>
            <span className="hidden h-5 border-r border-line lg:block" />
            <button
              type="button"
              onClick={() => setExpanded(new Set(expandableIds))}
              disabled={!hasChildren || isFiltering}
              title={isFiltering ? 'تظهر مسارات الحسابات تلقائيًا أثناء التصفية' : undefined}
              className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-bold text-ink-secondary transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" /> توسيع الكل
            </button>
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              disabled={!hasChildren || isFiltering}
              title={isFiltering ? 'تظهر مسارات الحسابات تلقائيًا أثناء التصفية' : undefined}
              className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-bold text-ink-secondary transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" /> طي الكل
            </button>
          </div>
        </div>
      </section>

      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
        {error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">
            <span>{error}</span>
            <button type="button" onClick={load} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 hover:text-danger">إعادة المحاولة</button>
          </div>
        )}
        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-xl border border-line bg-surface">
            <Loader2 aria-label="جارٍ تحميل الحسابات" className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-16 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-3 text-sm font-bold text-ink">لا توجد حسابات بعد</h2>
            <p className="mt-1 text-xs text-muted">أضف الحسابات الرئيسية للبدء في بناء دليل الحسابات.</p>
            {canManage && <button type="button" onClick={() => openNew()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary">إضافة حساب رئيسي</button>}
          </div>
        ) : (
          <>
          <div className="overflow-hidden rounded-xl border border-line bg-surface lg:hidden">
            <div className="divide-y divide-line-strong">
              {rows.map(({ node, depth, isExpanded, continuing, isLastSibling }) => {
                const account = node.account;
                const parent = tree.parentOf.get(account.id);
                const isRoot = !account.parentCode;
                const isOrphan = !!account.parentCode && !parent;
                const isMatch = matches.has(account.id);
                const balance = Number(account.computedBalance ?? account.balance ?? 0);
                return (
                  <article
                    key={account.id}
                    className={`relative py-3 pl-3 transition-colors ${isRoot ? 'bg-accent-soft/70' : isOrphan ? 'bg-warning-soft/50' : 'bg-surface'} ${!isMatch ? 'opacity-75' : ''}`}
                    style={{ paddingRight: `${14 + depth * 14}px` }}
                    aria-level={depth + 1}
                  >
                    {continuing.map((hasFollowingSibling, index) => hasFollowingSibling && (
                      <span key={index} aria-hidden="true" className="absolute inset-y-0 border-r-2 border-accent-border" style={{ right: `${7 + index * 14}px` }} />
                    ))}
                    {depth > 0 && (
                      <>
                        <span aria-hidden="true" className={`absolute top-0 border-r-2 border-accent-border ${isLastSibling ? 'h-1/2' : 'inset-y-0'}`} style={{ right: `${7 + (depth - 1) * 14}px` }} />
                        <span aria-hidden="true" className="absolute top-1/2 h-0.5 w-3 bg-accent-border" style={{ right: `${7 + (depth - 1) * 14}px` }} />
                      </>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {node.children.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(account.id)}
                              aria-label={`${isExpanded ? 'طي' : 'توسيع'} الحساب ${account.name}`}
                              aria-expanded={isExpanded}
                              disabled={isFiltering}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                            </button>
                          ) : <span aria-hidden="true" className="h-6 w-6 shrink-0" />}
                          <span className={`truncate ${depth === 0 ? 'font-black text-ink' : 'font-semibold text-ink'}`}>{account.name}</span>
                          {isRoot && <span className="shrink-0 rounded border border-accent-border bg-surface px-1.5 py-0.5 text-[9px] font-bold text-primary">رئيسي</span>}
                          {isOrphan && <span className="shrink-0 rounded border border-warning-border bg-surface px-1.5 py-0.5 text-[9px] font-bold text-warning">أب غير مرتبط</span>}
                          {!isMatch && <span className="shrink-0 text-[9px] font-medium text-muted">مسار</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pr-7 text-[10px]">
                          <span className="font-mono font-bold text-ink-secondary" dir="ltr">{account.code}</span>
                          <span className={`rounded border px-1.5 py-0.5 font-bold ${TYPE_COLORS[account.type]}`}>{TYPE_LABELS[account.type]}</span>
                          <span className={`rounded-full px-1.5 py-0.5 font-bold ${account.isActive ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'}`}>{account.isActive ? 'نشط' : 'موقوف'}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pr-7 text-[10px] text-muted">
                          <span className="font-mono" dir="ltr">{parent?.code || (account.parentCode ? `${account.parentCode} · غير مرتبط` : 'حساب رئيسي')}</span>
                          <span className="font-medium">الرصيد</span>
                          <span className="font-mono font-black tabular-nums text-ink" dir="ltr">{fmt(balance)}</span>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {account.isActive && <button type="button" onClick={() => openNew(account)} title="إضافة حساب فرعي" aria-label={`إضافة حساب فرعي تحت ${account.name}`} className="rounded-md p-1.5 text-success hover:bg-success-soft focus:outline-none focus:ring-2 focus:ring-success"><Plus className="h-3.5 w-3.5" /></button>}
                          <button type="button" onClick={() => toggle(account)} title="تفعيل/إيقاف" aria-label={`${account.isActive ? 'إيقاف' : 'تفعيل'} ${account.name}`} className="rounded-md p-1.5 text-muted hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-line-strong"><Power className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => openEdit(account)} title="تعديل الحساب" aria-label={`تعديل ${account.name}`} className="rounded-md p-1.5 text-primary hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-primary"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => remove(account)} title="حذف" aria-label={`حذف ${account.name}`} className="rounded-md p-1.5 text-danger hover:bg-danger-soft focus:outline-none focus:ring-2 focus:ring-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              {rows.length === 0 && <div className="px-4 py-16 text-center text-sm text-muted">لا توجد حسابات مطابقة للفلاتر المحددة.</div>}
            </div>
          </div>
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface lg:block">
            <div className="overflow-x-auto">
              <DataTable
                ariaLabel="شجرة الحسابات"
                rows={rows}
                rowKey={(row: any) => row.node.account.id}
                minWidth={980}
                tableClassName="text-sm"
                rowClassName={(row: any) => {
                  const account = row.node.account;
                  const isRoot = !account.parentCode;
                  const isOrphan = !!account.parentCode;
                  const isMatch = matches.has(account.id);
                  return `group transition-colors hover:bg-surface-muted/80 ${isRoot ? 'bg-accent-soft/50' : isOrphan ? 'bg-warning-soft/50' : 'bg-surface'} ${!isMatch ? 'bg-surface-muted/50' : ''}`;
                }}
                columns={[
                  { key: 'code', header: 'الكود', render: (row: any) => <span className="whitespace-nowrap font-mono font-bold text-ink" dir="ltr">{row.node.account.code}</span> },
                  {
                    key: 'name', header: 'اسم الحساب',
                    render: (row: any) => {
                      const { node, depth, isExpanded, continuing, isLastSibling } = row;
                      const account = node.account;
                      const parent = tree.parentOf.get(account.id);
                      const isRoot = !account.parentCode;
                      const isOrphan = !!account.parentCode && !parent;
                      const isMatch = matches.has(account.id);
                      return (
                        <div className={`relative flex min-w-0 items-center gap-2 ${isRoot ? 'border-r-4 border-primary pr-2' : isOrphan ? 'border-r-4 border-warning pr-2' : 'pr-1'}`} style={{ paddingRight: depth ? `${depth * 22}px` : undefined }}>
                          {continuing.map((hasFollowingSibling: boolean, index: number) => hasFollowingSibling && (
                            <span key={index} aria-hidden="true" className="absolute inset-y-[-12px] border-r-2 border-accent-border" style={{ right: `${7 + index * 22}px` }} />
                          ))}
                          {depth > 0 && (
                            <>
                              <span aria-hidden="true" className={`absolute top-[-12px] border-r-2 border-accent-border ${isLastSibling ? 'h-[calc(50%+12px)]' : 'bottom-[-12px]'}`} style={{ right: `${7 + (depth - 1) * 22}px` }} />
                              <span aria-hidden="true" className="absolute h-0.5 w-4 bg-accent-border" style={{ right: `${7 + (depth - 1) * 22}px`, top: '50%' }} />
                            </>
                          )}
                          {node.children.length ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(account.id)}
                              aria-label={`${isExpanded ? 'طي' : 'توسيع'} الحساب ${account.name}`}
                              aria-expanded={isExpanded}
                              disabled={isFiltering}
                              title={isFiltering ? 'تظهر مسارات الحسابات تلقائيًا أثناء التصفية' : undefined}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-sunken hover:text-ink disabled:cursor-default focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                            </button>
                          ) : <span aria-hidden="true" className="h-6 w-6 shrink-0 border-r border-line" />}
                          <span className={`min-w-0 truncate ${depth === 0 ? 'font-black text-ink' : 'font-semibold text-ink'}`}>{account.name}</span>
                          {isRoot && <span className="hidden shrink-0 rounded border border-accent-border bg-surface px-1.5 py-0.5 text-[9px] font-bold text-primary sm:inline">رئيسي</span>}
                          {isOrphan && <span className="shrink-0 rounded border border-warning-border bg-surface px-1.5 py-0.5 text-[9px] font-bold text-warning">أب غير مرتبط</span>}
                          {!isMatch && <span className="shrink-0 text-[9px] font-medium text-muted">مسار</span>}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'type', header: 'النوع',
                    render: (row: any) => <span className={`whitespace-nowrap rounded border px-2 py-1 text-[10px] font-bold ${TYPE_COLORS[row.node.account.type as keyof typeof TYPE_COLORS]}`}>{TYPE_LABELS[row.node.account.type as keyof typeof TYPE_LABELS]}</span>,
                  },
                  {
                    key: 'parent', header: 'الحساب الأب',
                    render: (row: any) => {
                      const account = row.node.account;
                      const parent = tree.parentOf.get(account.id);
                      return <span className="whitespace-nowrap font-mono text-xs text-muted" dir="ltr">{parent?.code || (account.parentCode ? `${account.parentCode} · غير مرتبط` : '—')}</span>;
                    },
                  },
                  {
                    key: 'balance', header: 'الرصيد الصافي', align: 'end',
                    render: (row: any) => {
                      const account = row.node.account;
                      return <span className="whitespace-nowrap font-mono font-black tabular-nums text-ink" dir="ltr">{fmt(Number(account.computedBalance ?? account.balance ?? 0))}</span>;
                    },
                  },
                  {
                    key: 'status', header: 'الحالة',
                    render: (row: any) => {
                      const account = row.node.account;
                      return (
                        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${account.isActive ? 'bg-success-soft text-success' : 'bg-surface-sunken text-muted'}`}>
                          {account.isActive ? 'نشط' : 'موقوف'}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'actions', header: '',
                    render: (row: any) => {
                      const account = row.node.account;
                      return canManage ? (
                        <div className="flex items-center justify-end gap-1 opacity-100 transition sm:opacity-70 sm:group-hover:opacity-100">
                          {account.isActive ? (
                            <button type="button" onClick={() => openNew(account)} title="إضافة حساب فرعي" aria-label={`إضافة حساب فرعي تحت ${account.name}`} className="rounded-md p-1.5 text-success hover:bg-success-soft focus:outline-none focus:ring-2 focus:ring-success">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button type="button" onClick={() => toggle(account)} title="تفعيل/إيقاف" aria-label={`${account.isActive ? 'إيقاف' : 'تفعيل'} ${account.name}`} className="rounded-md p-1.5 text-muted hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-line-strong">
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => openEdit(account)} title="تعديل الحساب" aria-label={`تعديل ${account.name}`} className="rounded-md p-1.5 text-primary hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-primary">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => remove(account)} title="حذف" aria-label={`حذف ${account.name}`} className="rounded-md p-1.5 text-danger hover:bg-danger-soft focus:outline-none focus:ring-2 focus:ring-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null;
                    },
                  },
                ]}
                emptyTitle="لا توجد حسابات مطابقة للفلاتر المحددة."
              />
            </div>
          </div>
          </>
        )}
      </main>

      {modal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 id="account-dialog-title" className="text-base font-black text-ink">{editing ? 'تعديل الحساب' : form.parentCode ? 'إضافة حساب فرعي' : 'إضافة حساب رئيسي'}</h2>
                <p className="mt-1 text-xs text-muted">{editing ? 'حدّث بيانات الحساب مع الحفاظ على هيكله.' : 'أدخل بيانات الحساب المحاسبي الجديد.'}</p>
              </div>
              <button type="button" onClick={() => setModal(false)} aria-label="إغلاق" className="rounded-md p-2 text-muted hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-primary"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-4 text-xs">
              {!editing && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="account-code" className="mb-1.5 block font-bold text-ink">الكود *</label>
                    <input id="account-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2.5 font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary" placeholder="1106" />
                  </div>
                  <div>
                    <label htmlFor="account-type" className="mb-1.5 block font-bold text-ink">النوع *</label>
                    <select id="account-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType, parentCode: '' })} className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2.5 font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary">
                      {(Object.keys(TYPE_LABELS) as AccountType[]).map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="account-name" className="mb-1.5 block font-bold text-ink">اسم الحساب *</label>
                <input id="account-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {!editing && (
                <div>
                  <label htmlFor="account-parent" className="mb-1.5 block font-bold text-ink">الحساب الأب</label>
                  <select id="account-parent" value={form.parentCode} onChange={(e) => setForm({ ...form, parentCode: e.target.value })} className="w-full rounded-lg border border-line bg-surface-muted px-3 py-2.5 font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">حساب رئيسي</option>
                    {accounts.filter((account) => account.isActive && account.type === form.type).sort(compareAccounts).map((account) => (
                      <option key={account.id} value={account.code}>{account.code} — {account.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="account-notes" className="mb-1.5 block font-bold text-ink">ملاحظات</label>
                <textarea id="account-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full resize-y rounded-lg border border-line bg-surface-muted px-3 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg bg-surface-sunken px-4 py-2.5 font-bold text-ink hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-line-strong">إلغاء</button>
                <button type="submit" className="rounded-lg bg-primary px-5 py-2.5 font-bold text-white hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">حفظ الحساب</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
