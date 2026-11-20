import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  ArrowDownUp, Building2, CalendarDays, Check, ClipboardList, Download, Loader2,
  MapPin, Pencil, Plus, Search, SlidersHorizontal, Trash2, TrendingDown, Wallet,
} from 'lucide-react';
import { FinanceExtrasService, type FixedAsset } from '../../../services/domains/finance/FinanceExtrasService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { fmt, CATEGORY_LABELS } from './fixedAssetsHelpers';
import { FixedAssetEditorModal } from './FixedAssetEditorModal';
import { FixedAssetWorkflows } from './FixedAssetWorkflows';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';

type ViewMode = 'register' | 'depreciation';
type StatusFilter = 'ALL' | FixedAsset['status'];
type SortField = 'code' | 'name' | 'purchaseDate' | 'bookValue' | 'accumulatedDepreciation';

const STATUS_LABELS: Record<FixedAsset['status'], string> = {
  ACTIVE: 'نشط',
  FULLY_DEPRECIATED: 'مهلك بالكامل',
  DISPOSED: 'مستبعد',
};

const bookValueOf = (asset: FixedAsset) =>
  Math.max(0, Number(asset.purchaseCost || 0) - Number(asset.accumulatedDepreciation || 0));

const depreciableValueOf = (asset: FixedAsset) =>
  Math.max(0, Number(asset.purchaseCost || 0) - Number(asset.salvageValue || 0));

const monthlyDepreciationOf = (asset: FixedAsset) =>
  asset.depreciationMethod === 'NON_DEPRECIABLE'
    ? 0
    : asset.depreciationMethod === 'DECLINING_BALANCE'
      ? bookValueOf(asset) * Number(asset.decliningRate || 0) / 12
      : asset.depreciationMethod === 'UNITS_OF_PRODUCTION'
        ? 0
        : Number(asset.usefulLifeYears) > 0
          ? depreciableValueOf(asset) / (Number(asset.usefulLifeYears) * 12)
          : 0;

const depreciationMethodLabel = (asset: FixedAsset) => ({
  STRAIGHT_LINE: 'القسط الثابت',
  DECLINING_BALANCE: 'الرصيد المتناقص',
  UNITS_OF_PRODUCTION: 'وحدات الإنتاج',
  NON_DEPRECIABLE: 'غير قابل للإهلاك',
}[asset.depreciationMethod || 'STRAIGHT_LINE']);

const depreciationProgressOf = (asset: FixedAsset) => {
  const depreciableValue = depreciableValueOf(asset);
  return depreciableValue > 0
    ? Math.min(100, (Number(asset.accumulatedDepreciation || 0) / depreciableValue) * 100)
    : 100;
};

export const FixedAssetsPage: React.FC = () => {
  const newAssetLabel = useBusinessTerm('actions.newFixedAsset');
  const service = useMemo(() => new FinanceExtrasService(), []);
  const user = AuthService.getCurrentUser();
  const canManage = PermissionService.can(user, 'ui.finance.assets.approve');
  const canExport = PermissionService.can(user, 'ui.finance.assets.export');
  const [rows, setRows] = useState<FixedAsset[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortField, setSortField] = useState<SortField>('code');
  const [view, setView] = useState<ViewMode>('register');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [workflowAssetId, setWorkflowAssetId] = useState<string | undefined>();
  const [form, setForm] = useState({
    name: '', category: 'EQUIPMENT', purchaseDate: localDateString(),
    purchaseCost: '', paymentType: 'CREDIT', salvageValue: '0', usefulLifeYears: '5', location: '', notes: '',
    depreciationMethod: 'STRAIGHT_LINE', decliningRate: '0.2', expectedUnits: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    try {
      setRows(service.getFixedAssets());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الأصول.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    cost: summary.cost + Number(row.purchaseCost || 0),
    accumulated: summary.accumulated + Number(row.accumulatedDepreciation || 0),
    bookValue: summary.bookValue + bookValueOf(row),
  }), { cost: 0, accumulated: 0, bookValue: 0 }), [rows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows
      .filter((row) => {
        const matchesSearch = !query || [
          row.name, row.code, row.location || '', CATEGORY_LABELS[row.category] || row.category,
        ].some((value) => String(value).toLocaleLowerCase().includes(query));
        return matchesSearch
          && (categoryFilter === 'ALL' || row.category === categoryFilter)
          && (statusFilter === 'ALL' || row.status === statusFilter);
      })
      .sort((left, right) => {
        if (sortField === 'bookValue') return bookValueOf(right) - bookValueOf(left);
        if (sortField === 'accumulatedDepreciation') {
          return Number(right.accumulatedDepreciation || 0) - Number(left.accumulatedDepreciation || 0);
        }
        return String(left[sortField] || '').localeCompare(String(right[sortField] || ''), 'ar');
      });
  }, [rows, search, categoryFilter, statusFilter, sortField]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '', category: 'EQUIPMENT', purchaseDate: localDateString(), purchaseCost: '',
      paymentType: 'CREDIT', salvageValue: '0', usefulLifeYears: '5', location: '', notes: '',
      depreciationMethod: 'STRAIGHT_LINE', decliningRate: '0.2', expectedUnits: '',
    });
    setModal(true);
  };

  const openEdit = (row: FixedAsset) => {
    setEditing(row);
    setForm({
      name: row.name, category: row.category, purchaseDate: row.purchaseDate, purchaseCost: String(row.purchaseCost),
      paymentType: 'CASH',
      salvageValue: String(row.salvageValue), usefulLifeYears: String(row.usefulLifeYears),
      location: row.location || '', notes: row.notes || '',
      depreciationMethod: row.depreciationMethod || 'STRAIGHT_LINE',
      decliningRate: String(row.decliningRate ?? 0.2), expectedUnits: row.expectedUnits == null ? '' : String(row.expectedUnits),
    });
    setModal(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      service.saveFixedAsset({
        id: editing?.id,
        name: form.name,
        category: form.category,
        purchaseDate: form.purchaseDate,
        purchaseCost: Number(form.purchaseCost),
        paymentType: form.paymentType,
        salvageValue: Number(form.salvageValue || 0),
        usefulLifeYears: Number(form.usefulLifeYears || 5),
        location: form.location,
        notes: form.notes,
        depreciationMethod: form.depreciationMethod as FixedAsset['depreciationMethod'],
        decliningRate: Number(form.decliningRate),
        expectedUnits: form.expectedUnits === '' ? null : Number(form.expectedUnits),
        status: editing?.status || 'ACTIVE',
      });
      setModal(false);
      load();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'تعذر حفظ الأصل.');
    } finally {
      setSaving(false);
    }
  };

  const depreciate = (row: FixedAsset) => {
    setWorkflowAssetId(row.id);
    setWorkflowsOpen(true);
  };

  const remove = (row: FixedAsset) => {
    if (!window.confirm(`حذف الأصل ${row.code} — ${row.name}؟`)) return;
    try {
      service.deleteFixedAsset(row.id);
      load();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'تعذر حذف الأصل.');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
  };

  const exportAssets = (pdf = false) => {
    const rowsForExport = visibleRows.map((row) => ({
      code: row.code,
      name: row.name,
      category: CATEGORY_LABELS[row.category] || row.category,
      purchaseDate: row.purchaseDate,
      usefulLife: `${row.usefulLifeYears} سنة`,
      depreciationMethod: depreciationMethodLabel(row),
      purchaseCost: Number(row.purchaseCost || 0),
      accumulatedDepreciation: Number(row.accumulatedDepreciation || 0),
      monthlyDepreciation: row.depreciationMethod === 'UNITS_OF_PRODUCTION'
        ? 'حسب الاستخدام'
        : monthlyDepreciationOf(row),
      bookValue: bookValueOf(row),
      location: row.location || '—',
      status: STATUS_LABELS[row.status],
    }));

    const exportOptions = {
      title: view === 'register' ? 'سجل الأصول الثابتة' : 'خطة الإهلاك الشهري',
      subtitle: `عدد الأصول المعروضة: ${visibleRows.length}`,
      fileName: `fixed-assets-${localDateString()}`,
      permission: 'finance.export',
      columns: view === 'register'
        ? [
          { key: 'code', label: 'كود الأصل' },
          { key: 'name', label: 'اسم الأصل' },
          { key: 'category', label: 'الفئة' },
          { key: 'purchaseDate', label: 'تاريخ الشراء' },
          { key: 'usefulLife', label: 'العمر الإنتاجي' },
          { key: 'depreciationMethod', label: 'طريقة الإهلاك' },
          { key: 'purchaseCost', label: 'تكلفة الشراء', type: 'currency' },
          { key: 'accumulatedDepreciation', label: 'مجمع الإهلاك', type: 'currency' },
          { key: 'bookValue', label: 'القيمة الدفترية', type: 'currency' },
          { key: 'location', label: 'الموقع' },
          { key: 'status', label: 'الحالة' },
        ]
        : [
          { key: 'code', label: 'كود الأصل' },
          { key: 'name', label: 'اسم الأصل' },
          { key: 'status', label: 'الحالة' },
          { key: 'usefulLife', label: 'العمر الإنتاجي' },
          { key: 'depreciationMethod', label: 'طريقة الإهلاك' },
          { key: 'monthlyDepreciation', label: 'الإهلاك الشهري' },
          { key: 'accumulatedDepreciation', label: 'مجمع الإهلاك', type: 'currency' },
          { key: 'bookValue', label: 'القيمة الدفترية', type: 'currency' },
        ],
      rows: rowsForExport,
    };
    if (pdf) exportToPdf(exportOptions);
    else exportToExcel(exportOptions);
  };

  const hasFilters = Boolean(search || categoryFilter !== 'ALL' || statusFilter !== 'ALL');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-muted text-ink dark:bg-[var(--cerami-canvas)] dark:text-[var(--cerami-text)]">
      <div className="shrink-0 bg-surface px-4 pt-4 dark:bg-[var(--cerami-surface)] sm:px-6">
        <PageHeader
          icon={<Building2 aria-hidden="true" className="h-5 w-5" />}
          title={<>الأصول الثابتة <span className="mr-2 rounded-md border border-line bg-surface-muted px-2 py-0.5 align-middle text-[10px] font-bold text-muted">إدارة مالية</span></>}
          description="سجل الاقتناء والقيمة الدفترية ومتابعة الإهلاك"
          actions={<>
            {canExport && (
              <>
                <button type="button" onClick={() => exportAssets()} disabled={loading || visibleRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-bold text-ink transition hover:border-accent-border hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50 ">
                  <Download aria-hidden="true" className="h-4 w-4" /> تصدير Excel
                </button>
                <button type="button" onClick={() => exportAssets(true)} disabled={loading || visibleRows.length === 0}
                  className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-bold text-ink disabled:opacity-50 ">
                  تصدير PDF
                </button>
              </>
            )}
            <button type="button" onClick={() => setWorkflowsOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-accent-border bg-accent-soft px-3 py-2.5 text-xs font-bold text-primary hover:bg-accent-soft dark:bg-primary/40 ">
              <ClipboardList aria-hidden="true" className="h-4 w-4" /> عمليات الأصول
            </button>
            {canManage && (
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="h-4 w-4" /> {newAssetLabel}
              </button>
            )}
            {workflowsOpen && (
              <FixedAssetWorkflows
                service={service}
                assets={rows}
                initialAssetId={workflowAssetId}
                initialWorkflow={workflowAssetId ? 'depreciation' : undefined}
                canManage={canManage}
                canExport={canExport}
                onClose={() => setWorkflowsOpen(false)}
                onChanged={load}
              />
            )}
          </>}
        />
      </div>

      <section aria-label="مسارات إدارة الأصول" className="shrink-0 border-b border-line bg-surface px-4 py-3 dark:bg-[var(--cerami-surface)] sm:px-6">
        <div className="flex flex-col gap-3 rounded-lg border border-accent-border bg-accent-soft/60 p-3 dark:border-primary/70 dark:bg-primary/30 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white">
              {view === 'register' ? <Building2 aria-hidden="true" className="h-4 w-4" /> : <TrendingDown aria-hidden="true" className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-xs font-black text-primary ">مسارات إدارة الأصول</h2>
              <p className="mt-1 text-[10px] leading-4 text-primary ">
                {view === 'register'
                  ? 'مراجعة بيانات الاقتناء والقيمة المتبقية في سجل الأصول.'
                  : 'متابعة الإهلاك الشهري المرحّل والقيمة الدفترية المتبقية.'}
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit shrink-0 rounded-lg border border-accent-border bg-surface p-1 dark:bg-primary/70" role="tablist" aria-label="طريقة عرض الأصول">
            <div role="tab" aria-selected={view === 'register'} className="contents">
              <button
                type="button"
                aria-selected={view === 'register'}
                onClick={() => setView('register')}
                className={`rounded-md px-3 py-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-primary ${view === 'register' ? 'bg-primary text-white shadow-sm' : 'text-ink-secondary hover:bg-accent-soft hover:text-primary dark:text-muted dark:hover:bg-primary/50 dark:hover:text-primary'}`}
              >
                سجل الأصول
              </button>
            </div>
            <div role="tab" aria-selected={view === 'depreciation'} className="contents">
              <button
                type="button"
                aria-selected={view === 'depreciation'}
                onClick={() => setView('depreciation')}
                className={`rounded-md px-3 py-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-primary ${view === 'depreciation' ? 'bg-primary text-white shadow-sm' : 'text-ink-secondary hover:bg-accent-soft hover:text-primary dark:text-muted dark:hover:bg-primary/50 dark:hover:text-primary'}`}
              >
                متابعة الإهلاك
              </button>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="ملخص الأصول الثابتة" className="grid shrink-0 grid-cols-2 gap-2 border-b border-line bg-surface p-3 dark:bg-[var(--cerami-surface)] sm:grid-cols-4 sm:gap-3 sm:px-6 sm:py-4">
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-muted px-3 py-3 dark:bg-primary/60 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-primary" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted sm:text-xs">عدد الأصول</span>
            <ClipboardList aria-hidden="true" className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums text-ink">{new Intl.NumberFormat('ar-EG').format(rows.length)}</div>
          <div className="mt-0.5 text-[10px] text-muted">إجمالي السجل</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface px-3 py-3 dark:bg-primary/40 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-primary" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted sm:text-xs">تكلفة الاقتناء</span>
            <Wallet aria-hidden="true" className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-ink sm:text-lg" dir="ltr">{fmt(totals.cost)}</div>
          <div className="mt-0.5 text-[10px] text-muted">إجمالي التكلفة المسجلة</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-danger-border bg-danger-soft/60 px-3 py-3 dark:border-danger/70 dark:bg-danger/30 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-danger" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-danger sm:text-xs">مجمع الإهلاك</span>
            <TrendingDown aria-hidden="true" className="h-4 w-4 text-danger" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-danger sm:text-lg" dir="ltr">{fmt(totals.accumulated)}</div>
          <div className="mt-0.5 text-[10px] text-danger/80 dark:text-danger">إهلاك مرحّل فعليًا</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-success-border bg-success-soft/70 px-3 py-3 dark:border-success/70 dark:bg-success/30 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-success" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-success sm:text-xs">القيمة الدفترية</span>
            <Check aria-hidden="true" className="h-4 w-4 text-success" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-success sm:text-lg" dir="ltr">{fmt(totals.bookValue)}</div>
          <div className="mt-0.5 text-[10px] text-success/80 dark:text-success">التكلفة بعد الإهلاك المرحّل</div>
        </div>
      </section>

      <section aria-label="البحث والتصفية" className="shrink-0 border-b border-line bg-surface px-4 py-3 dark:bg-[var(--cerami-surface)] sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-md">
            <span className="sr-only">بحث بالاسم أو الكود أو الموقع أو الفئة</span>
            <Search aria-hidden="true" className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالاسم أو الكود أو الموقع..."
              className="w-full rounded-lg border border-line bg-surface-muted py-2.5 pl-4 pr-10 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:placeholder:text-muted dark:focus:ring-primary"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="hidden h-4 w-4 text-muted sm:block" />
            <label className="sr-only" htmlFor="fixed-assets-category">الفئة</label>
            <select
              id="fixed-assets-category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-w-32 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-bold text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary"
            >
              <option value="ALL">كل الفئات</option>
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <option key={category} value={category}>{label}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="fixed-assets-status">حالة الأصل</label>
            <select
              id="fixed-assets-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="min-w-32 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-bold text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary"
            >
              <option value="ALL">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
            <label className="relative">
              <span className="sr-only">ترتيب الأصول</span>
              <ArrowDownUp aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
                className="min-w-40 rounded-lg border border-line bg-surface py-2.5 pl-3 pr-8 text-xs font-bold text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-primary"
              >
                <option value="code">ترتيب حسب الكود</option>
                <option value="name">ترتيب حسب الاسم</option>
                <option value="purchaseDate">تاريخ الشراء</option>
                <option value="bookValue">القيمة الدفترية</option>
                <option value="accumulatedDepreciation">مجمع الإهلاك</option>
              </select>
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg px-2 py-2 text-xs font-bold text-muted transition hover:bg-surface-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary dark:hover:text-muted"
              >
                مسح التصفية
              </button>
            )}
            <span className="mr-auto text-xs font-semibold text-muted">{visibleRows.length} من {rows.length} أصل</span>
          </div>
        </div>
      </section>

      <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm ">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-black text-ink">{view === 'register' ? 'سجل الأصول' : 'خطة الإهلاك الشهري'}</h2>
              <p className="mt-1 text-[11px] text-muted ">
                {view === 'register' ? 'بيانات الاقتناء والتكلفة والقيمة الدفترية لكل أصل' : 'معدل الإهلاك المحسوب ومتابعة القيمة المتبقية'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs font-semibold">جارٍ تحميل سجل الأصول...</span>
            </div>
          ) : error ? (
            <div role="alert" className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-danger-border bg-danger-soft text-danger dark:border-danger/70 dark:bg-danger/40 ">
                <Building2 aria-hidden="true" className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-black text-ink ">تعذر تحميل سجل الأصول</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted ">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 rounded-lg border border-danger-border bg-surface px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-danger/40"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-muted text-muted ">
                {hasFilters ? <Search aria-hidden="true" className="h-5 w-5" /> : <Building2 aria-hidden="true" className="h-5 w-5" />}
              </div>
              <h3 className="text-sm font-black text-ink ">{hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد أصول مسجلة'}</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted ">
                {hasFilters ? 'جرّب تغيير كلمات البحث أو خيارات التصفية.' : 'ابدأ بإضافة أصل ثابت ليظهر سجل الاقتناء والإهلاك هنا.'}
              </p>
              {hasFilters ? (
                <button type="button" onClick={resetFilters} className="mt-4 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink hover:bg-surface-muted">
                  مسح التصفية
                </button>
              ) : canManage && (
                <button type="button" onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary">
                  <Plus aria-hidden="true" className="h-4 w-4" /> {newAssetLabel}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <DataTable
                  ariaLabel="سجل الأصول الثابتة"
                  rows={visibleRows}
                  rowKey={(row: any) => String(row.id)}
                  minWidth={1120}
                  dense
                  tableClassName="text-xs"
                  columns={[
                    { key: 'code', header: 'كود الأصل', render: (row: any) => <span className="whitespace-nowrap font-mono font-bold text-ink-secondary " dir="ltr">{row.code}</span> },
                    {
                      key: 'asset', header: 'الأصل والفئة',
                      render: (row: any) => (
                        <span className="block min-w-48">
                          <span className="block font-bold text-ink">{row.name}</span>
                          <span className="mt-1 block text-[10px] text-muted ">{CATEGORY_LABELS[row.category] || row.category}</span>
                        </span>
                      ),
                    },
                    ...(view === 'register' ? [
                      { key: 'purchaseDate', header: 'تاريخ الشراء', render: (row: any) => <span className="whitespace-nowrap text-ink-secondary " dir="ltr">{row.purchaseDate}</span> },
                      { key: 'life', header: 'العمر الإنتاجي', render: (row: any) => <span className="whitespace-nowrap text-ink-secondary ">{row.usefulLifeYears} سنة</span> },
                      { key: 'cost', header: 'تكلفة الشراء', align: 'end' as const, render: (row: any) => <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-ink " dir="ltr">{fmt(Number(row.purchaseCost || 0))}</span> },
                      { key: 'accum', header: 'مجمع الإهلاك', align: 'end' as const, render: (row: any) => <span className="whitespace-nowrap font-mono tabular-nums text-danger " dir="ltr">{fmt(Number(row.accumulatedDepreciation || 0))}</span> },
                      {
                        key: 'book', header: 'القيمة الدفترية', align: 'end' as const,
                        render: (row: any) => (
                          <span className="block min-w-40 text-left" dir="ltr">
                            <span className="block font-mono font-black tabular-nums text-success ">{fmt(bookValueOf(row))}</span>
                            <DepreciationBar progress={depreciationProgressOf(row)} />
                          </span>
                        ),
                      },
                      {
                        key: 'location', header: 'الموقع',
                        render: (row: any) => <span className="whitespace-nowrap text-ink-secondary "><MapPin aria-hidden="true" className="ml-1 inline h-3 w-3 text-muted " />{row.location || '—'}</span>,
                      },
                    ] : [
                      {
                        key: 'monthly', header: 'الإهلاك الشهري', align: 'end' as const,
                        render: (row: any) => <span className="whitespace-nowrap font-mono font-bold tabular-nums text-primary " dir={row.depreciationMethod === 'UNITS_OF_PRODUCTION' ? 'rtl' : 'ltr'}>{row.depreciationMethod === 'UNITS_OF_PRODUCTION' ? 'حسب الاستخدام' : fmt(monthlyDepreciationOf(row))}</span>,
                      },
                      { key: 'life', header: 'العمر الإنتاجي', render: (row: any) => <span className="whitespace-nowrap text-ink-secondary ">{row.usefulLifeYears} سنة</span> },
                      { key: 'cost', header: 'تكلفة الاقتناء', align: 'end' as const, render: (row: any) => <span className="whitespace-nowrap font-mono tabular-nums text-ink " dir="ltr">{fmt(Number(row.purchaseCost || 0))}</span> },
                      { key: 'accum', header: 'مجمع الإهلاك', align: 'end' as const, render: (row: any) => <span className="whitespace-nowrap font-mono tabular-nums text-danger " dir="ltr">{fmt(Number(row.accumulatedDepreciation || 0))}</span> },
                      {
                        key: 'book', header: 'القيمة الدفترية', align: 'end' as const,
                        render: (row: any) => (
                          <span className="block min-w-40 text-left" dir="ltr">
                            <span className="block font-mono font-black tabular-nums text-success ">{fmt(bookValueOf(row))}</span>
                            <DepreciationBar progress={depreciationProgressOf(row)} />
                          </span>
                        ),
                      },
                    ]),
                    { key: 'status', header: 'الحالة', render: (row: any) => <StatusBadge status={row.status} /> },
                    {
                      key: 'actions', header: 'الإجراءات',
                      render: (row: any) => <AssetActions row={row} canManage={canManage} onDepreciate={depreciate} onEdit={openEdit} onRemove={remove} />,
                    },
                  ]}
                  rowClassName={() => 'group transition hover:bg-accent-soft/30 dark:hover:bg-primary/25'}
                />
              </div>

              <div className="divide-y divide-line-strong dark:divide-primary md:hidden">
                {visibleRows.map((row) => {
                  const progress = depreciationProgressOf(row);
                  return (
                    <article key={row.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-muted " dir="ltr">{row.code}</span>
                            <StatusBadge status={row.status} />
                          </div>
                          <h3 className="mt-1 truncate text-sm font-black text-ink">{row.name}</h3>
                          <p className="mt-1 text-[10px] text-muted ">{CATEGORY_LABELS[row.category] || row.category}</p>
                        </div>
                        <div className="shrink-0 text-left" dir="ltr">
                          <div className="text-sm font-black tabular-nums text-success ">{fmt(bookValueOf(row))}</div>
                          <div className="mt-1 text-[9px] text-muted ">القيمة الدفترية</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line py-3 text-[10px] ">
                        {view === 'register' ? (
                          <>
                            <AssetDatum label="تاريخ الشراء" value={row.purchaseDate} icon={<CalendarDays aria-hidden="true" className="h-3 w-3" />} />
                            <AssetDatum label="العمر الإنتاجي" value={`${row.usefulLifeYears} سنة`} />
                            <AssetDatum label="تكلفة الشراء" value={fmt(Number(row.purchaseCost || 0))} numeric />
                            <AssetDatum label="مجمع الإهلاك" value={fmt(Number(row.accumulatedDepreciation || 0))} numeric />
                            <AssetDatum label="الموقع" value={row.location || '—'} icon={<MapPin aria-hidden="true" className="h-3 w-3" />} />
                          </>
                        ) : (
                          <>
                            <AssetDatum label="طريقة الإهلاك" value={depreciationMethodLabel(row)} />
                            <AssetDatum label="الإهلاك الشهري" value={row.depreciationMethod === 'UNITS_OF_PRODUCTION' ? 'حسب الاستخدام' : fmt(monthlyDepreciationOf(row))} numeric={row.depreciationMethod !== 'UNITS_OF_PRODUCTION'} />
                            <AssetDatum label="العمر الإنتاجي" value={`${row.usefulLifeYears} سنة`} />
                            <AssetDatum label="تكلفة الاقتناء" value={fmt(Number(row.purchaseCost || 0))} numeric />
                            <AssetDatum label="مجمع الإهلاك" value={fmt(Number(row.accumulatedDepreciation || 0))} numeric />
                          </>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[10px] text-muted">
                          <span>نسبة الإهلاك</span><span className="font-mono font-bold tabular-nums">{progress.toFixed(0)}%</span>
                        </div>
                        <DepreciationBar progress={progress} />
                      </div>
                      <div className="flex justify-end border-t border-line pt-2 ">
                        <AssetActions
                          row={row}
                          canManage={canManage}
                          onDepreciate={depreciate}
                          onEdit={openEdit}
                          onRemove={remove}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {!loading && visibleRows.length > 0 && (
            <div className="flex items-center justify-between border-t border-line bg-surface-muted px-4 py-2.5 text-[10px] font-semibold text-muted dark:bg-primary/60 ">
              <span>يعرض {visibleRows.length} أصل</span>
              <span>القيم بالجنيه المصري</span>
            </div>
          )}
        </section>
      </main>

      {modal && canManage && (
        <FixedAssetEditorModal
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          onClose={() => setModal(false)}
          onSubmit={submit}
        />
      )}
    </div>
  );
};

const DepreciationBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="mt-1.5 flex items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken ">
      <div
        className={`h-full rounded-full transition-[width] ${progress >= 100 ? 'bg-success' : 'bg-primary'}`}
        style={{ width: `${progress}%` }}
      />
    </div>
    <span className="font-mono text-[9px] tabular-nums text-muted ">{progress.toFixed(0)}%</span>
  </div>
);

const StatusBadge: React.FC<{ status: FixedAsset['status'] }> = ({ status }) => {
  const styles: Record<FixedAsset['status'], string> = {
    ACTIVE: 'border-success-border bg-success-soft text-success dark:bg-success/50 ',
    FULLY_DEPRECIATED: 'border-warning-border bg-warning-soft text-warning dark:bg-warning/50 ',
    DISPOSED: 'border-line bg-surface-sunken text-ink-secondary ',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${styles[status]}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const AssetDatum: React.FC<{ label: string; value: string; icon?: React.ReactNode; numeric?: boolean }> = ({ label, value, icon, numeric }) => (
  <div className="min-w-0">
    <div className="mb-0.5 text-muted">{label}</div>
    <div className={`flex items-center gap-1 font-semibold text-ink ${numeric ? 'font-mono tabular-nums' : ''}`} dir={numeric ? 'ltr' : undefined}>
      {icon}{value}
    </div>
  </div>
);

const AssetActions: React.FC<{
  row: FixedAsset;
  canManage: boolean;
  onDepreciate: (row: FixedAsset) => void;
  onEdit: (row: FixedAsset) => void;
  onRemove: (row: FixedAsset) => void;
}> = ({ row, canManage, onDepreciate, onEdit, onRemove }) => {
  if (!canManage) return <span className="text-[10px] text-muted">—</span>;
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onDepreciate(row)}
        disabled={row.status !== 'ACTIVE'}
        title="طلب مراجعة إهلاك شهر واحد"
        aria-label={`طلب مراجعة إهلاك شهر واحد للأصل ${row.name}`}
        className="inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-soft px-2 py-1.5 text-[10px] font-bold text-primary transition hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 dark:bg-primary/40 dark:hover:bg-primary/70"
      >
        <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden xl:inline">طلب مراجعة الإهلاك</span>
      </button>
      <button
        type="button"
        onClick={() => onEdit(row)}
        title="تعديل الأصل"
        aria-label={`تعديل الأصل ${row.name}`}
        className="rounded-md p-2 text-muted transition hover:bg-surface-sunken hover:text-primary focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary dark:hover:text-primary"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(row)}
        title="حذف الأصل"
        aria-label={`حذف الأصل ${row.name}`}
        className="rounded-md p-2 text-muted transition hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger dark:hover:bg-danger/50 dark:hover:text-danger"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
