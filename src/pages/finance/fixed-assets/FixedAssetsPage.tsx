import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp, Building2, CalendarDays, Check, ClipboardList, Download, Loader2,
  MapPin, Pencil, Plus, Search, SlidersHorizontal, Trash2, TrendingDown, Wallet,
} from 'lucide-react';
import { FinanceExtrasService, type FixedAsset } from '../../../services/finance/FinanceExtrasService';
import { AuthService } from '../../../services/auth/AuthService';
import { PermissionService } from '../../../services/auth/PermissionService';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { fmt, CATEGORY_LABELS } from './fixedAssetsHelpers';
import { FixedAssetEditorModal } from './FixedAssetEditorModal';
import { FixedAssetWorkflows } from './FixedAssetWorkflows';

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[var(--cerami-canvas)] dark:text-[var(--cerami-text)]" dir="rtl">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-700 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
              <Building2 aria-hidden="true" className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black tracking-tight">الأصول الثابتة</h1>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">إدارة مالية</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">سجل الاقتناء والقيمة الدفترية ومتابعة الإهلاك</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <button type="button" onClick={() => exportAssets()} disabled={loading || visibleRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
                  <Download aria-hidden="true" className="h-4 w-4" /> تصدير Excel
                </button>
                <button type="button" onClick={() => exportAssets(true)} disabled={loading || visibleRows.length === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
                  تصدير PDF
                </button>
              </>
            )}
            <button type="button" onClick={() => setWorkflowsOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              <ClipboardList aria-hidden="true" className="h-4 w-4" /> عمليات الأصول
            </button>
            {canManage && (
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="h-4 w-4" /> إضافة أصل جديد
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
          </div>
        </div>
      </header>

      <section aria-label="مسارات إدارة الأصول" className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[var(--cerami-surface)] sm:px-6">
        <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/70 dark:bg-violet-950/30 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-700 text-white">
              {view === 'register' ? <Building2 aria-hidden="true" className="h-4 w-4" /> : <TrendingDown aria-hidden="true" className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-xs font-black text-violet-950 dark:text-violet-100">مسارات إدارة الأصول</h2>
              <p className="mt-1 text-[10px] leading-4 text-violet-800 dark:text-violet-200">
                {view === 'register'
                  ? 'مراجعة بيانات الاقتناء والقيمة المتبقية في سجل الأصول.'
                  : 'متابعة الإهلاك الشهري المرحّل والقيمة الدفترية المتبقية.'}
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit shrink-0 rounded-lg border border-violet-200 bg-white p-1 dark:border-violet-800 dark:bg-slate-900/70" role="tablist" aria-label="طريقة عرض الأصول">
            <div role="tab" aria-selected={view === 'register'} className="contents">
              <button
                type="button"
                aria-selected={view === 'register'}
                onClick={() => setView('register')}
                className={`rounded-md px-3 py-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-violet-400 ${view === 'register' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-900 dark:text-slate-300 dark:hover:bg-violet-950/50 dark:hover:text-violet-100'}`}
              >
                سجل الأصول
              </button>
            </div>
            <div role="tab" aria-selected={view === 'depreciation'} className="contents">
              <button
                type="button"
                aria-selected={view === 'depreciation'}
                onClick={() => setView('depreciation')}
                className={`rounded-md px-3 py-2 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-violet-400 ${view === 'depreciation' ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-900 dark:text-slate-300 dark:hover:bg-violet-950/50 dark:hover:text-violet-100'}`}
              >
                متابعة الإهلاك
              </button>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="ملخص الأصول الثابتة" className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[var(--cerami-surface)] sm:grid-cols-4 sm:gap-3 sm:px-6 sm:py-4">
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/60 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-violet-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 sm:text-xs">عدد الأصول</span>
            <ClipboardList aria-hidden="true" className="h-4 w-4 text-violet-600" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums text-slate-900">{new Intl.NumberFormat('ar-EG').format(rows.length)}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">إجمالي السجل</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800/40 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-sky-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-500 sm:text-xs">تكلفة الاقتناء</span>
            <Wallet aria-hidden="true" className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-slate-900 sm:text-lg" dir="ltr">{fmt(totals.cost)}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">إجمالي التكلفة المسجلة</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-3 dark:border-rose-900/70 dark:bg-rose-950/30 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-rose-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 sm:text-xs">مجمع الإهلاك</span>
            <TrendingDown aria-hidden="true" className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-rose-800 dark:text-rose-200 sm:text-lg" dir="ltr">{fmt(totals.accumulated)}</div>
          <div className="mt-0.5 text-[10px] text-rose-700/80 dark:text-rose-300">إهلاك مرحّل فعليًا</div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/30 sm:px-4">
          <div className="absolute inset-y-0 right-0 w-1 bg-emerald-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 sm:text-xs">القيمة الدفترية</span>
            <Check aria-hidden="true" className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 truncate text-base font-black tabular-nums text-emerald-900 dark:text-emerald-200 sm:text-lg" dir="ltr">{fmt(totals.bookValue)}</div>
          <div className="mt-0.5 text-[10px] text-emerald-800/80 dark:text-emerald-300">التكلفة بعد الإهلاك المرحّل</div>
        </div>
      </section>

      <section aria-label="البحث والتصفية" className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[var(--cerami-surface)] sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-md">
            <span className="sr-only">بحث بالاسم أو الكود أو الموقع أو الفئة</span>
            <Search aria-hidden="true" className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالاسم أو الكود أو الموقع..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:placeholder:text-slate-500 dark:focus:ring-violet-950"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="hidden h-4 w-4 text-slate-400 sm:block" />
            <label className="sr-only" htmlFor="fixed-assets-category">الفئة</label>
            <select
              id="fixed-assets-category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-w-32 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:text-slate-200 dark:focus:ring-violet-950"
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
              className="min-w-32 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:text-slate-200 dark:focus:ring-violet-950"
            >
              <option value="ALL">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
            <label className="relative">
              <span className="sr-only">ترتيب الأصول</span>
              <ArrowDownUp aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
                className="min-w-40 rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-xs font-bold text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:text-slate-200 dark:focus:ring-violet-950"
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
                className="rounded-lg px-2 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                مسح التصفية
              </button>
            )}
            <span className="mr-auto text-xs font-semibold text-slate-500">{visibleRows.length} من {rows.length} أصل</span>
          </div>
        </div>
      </section>

      <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-black text-slate-900">{view === 'register' ? 'سجل الأصول' : 'خطة الإهلاك الشهري'}</h2>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {view === 'register' ? 'بيانات الاقتناء والتكلفة والقيمة الدفترية لكل أصل' : 'معدل الإهلاك المحسوب ومتابعة القيمة المتبقية'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-violet-600" />
              <span className="text-xs font-semibold">جارٍ تحميل سجل الأصول...</span>
            </div>
          ) : error ? (
            <div role="alert" className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
                <Building2 aria-hidden="true" className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">تعذر تحميل سجل الأصول</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-200 dark:hover:bg-rose-950/40"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                {hasFilters ? <Search aria-hidden="true" className="h-5 w-5" /> : <Building2 aria-hidden="true" className="h-5 w-5" />}
              </div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{hasFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد أصول مسجلة'}</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                {hasFilters ? 'جرّب تغيير كلمات البحث أو خيارات التصفية.' : 'ابدأ بإضافة أصل ثابت ليظهر سجل الاقتناء والإهلاك هنا.'}
              </p>
              {hasFilters ? (
                <button type="button" onClick={resetFilters} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  مسح التصفية
                </button>
              ) : canManage && (
                <button type="button" onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">
                  <Plus aria-hidden="true" className="h-4 w-4" /> إضافة أول أصل
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1120px] text-right text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70">
                    <tr className="text-[10px] font-bold text-slate-500 dark:text-slate-300">
                      <th scope="col" className="px-4 py-3">كود الأصل</th>
                      <th scope="col" className="px-4 py-3">الأصل والفئة</th>
                      {view === 'register' ? (
                        <>
                          <th scope="col" className="px-4 py-3">تاريخ الشراء</th>
                          <th scope="col" className="px-4 py-3">العمر الإنتاجي</th>
                          <th scope="col" className="px-4 py-3">تكلفة الشراء</th>
                          <th scope="col" className="px-4 py-3">مجمع الإهلاك</th>
                          <th scope="col" className="px-4 py-3">القيمة الدفترية</th>
                          <th scope="col" className="px-4 py-3">الموقع</th>
                        </>
                      ) : (
                        <>
                          <th scope="col" className="px-4 py-3">الإهلاك الشهري</th>
                          <th scope="col" className="px-4 py-3">العمر الإنتاجي</th>
                          <th scope="col" className="px-4 py-3">تكلفة الاقتناء</th>
                          <th scope="col" className="px-4 py-3">مجمع الإهلاك</th>
                          <th scope="col" className="px-4 py-3">القيمة الدفترية</th>
                        </>
                      )}
                      <th scope="col" className="px-4 py-3">الحالة</th>
                      <th scope="col" className="px-4 py-3">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => {
                      const progress = depreciationProgressOf(row);
                      return (
                        <tr key={row.id} className="group transition hover:bg-violet-50/30 dark:hover:bg-violet-950/25">
                          <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-300" dir="ltr">{row.code}</td>
                          <td className="min-w-48 px-4 py-3">
                            <div className="font-bold text-slate-900">{row.name}</div>
                            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{CATEGORY_LABELS[row.category] || row.category}</div>
                          </td>
                          {view === 'register' ? (
                            <>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300" dir="ltr">{row.purchaseDate}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{row.usefulLifeYears} سنة</td>
                              <td className="whitespace-nowrap px-4 py-3 text-left font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-200" dir="ltr">{fmt(Number(row.purchaseCost || 0))}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-left font-mono tabular-nums text-rose-700 dark:text-rose-300" dir="ltr">{fmt(Number(row.accumulatedDepreciation || 0))}</td>
                              <td className="min-w-40 px-4 py-3 text-left" dir="ltr">
                                <div className="font-mono font-black tabular-nums text-emerald-800 dark:text-emerald-300">{fmt(bookValueOf(row))}</div>
                                <DepreciationBar progress={progress} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                                <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3 text-slate-400 dark:text-slate-500" />{row.location || '—'}</span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="whitespace-nowrap px-4 py-3 text-left font-mono font-bold tabular-nums text-violet-800 dark:text-violet-300" dir={row.depreciationMethod === 'UNITS_OF_PRODUCTION' ? 'rtl' : 'ltr'}>
                                {row.depreciationMethod === 'UNITS_OF_PRODUCTION' ? 'حسب الاستخدام' : fmt(monthlyDepreciationOf(row))}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{row.usefulLifeYears} سنة</td>
                              <td className="whitespace-nowrap px-4 py-3 text-left font-mono tabular-nums text-slate-700 dark:text-slate-200" dir="ltr">{fmt(Number(row.purchaseCost || 0))}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-left font-mono tabular-nums text-rose-700 dark:text-rose-300" dir="ltr">{fmt(Number(row.accumulatedDepreciation || 0))}</td>
                              <td className="min-w-40 px-4 py-3 text-left" dir="ltr">
                                <div className="font-mono font-black tabular-nums text-emerald-800 dark:text-emerald-300">{fmt(bookValueOf(row))}</div>
                                <DepreciationBar progress={progress} />
                              </td>
                            </>
                          )}
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <AssetActions
                              row={row}
                              canManage={canManage}
                              onDepreciate={depreciate}
                              onEdit={openEdit}
                              onRemove={remove}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                {visibleRows.map((row) => {
                  const progress = depreciationProgressOf(row);
                  return (
                    <article key={row.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400" dir="ltr">{row.code}</span>
                            <StatusBadge status={row.status} />
                          </div>
                          <h3 className="mt-1 truncate text-sm font-black text-slate-900">{row.name}</h3>
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{CATEGORY_LABELS[row.category] || row.category}</p>
                        </div>
                        <div className="shrink-0 text-left" dir="ltr">
                          <div className="text-sm font-black tabular-nums text-emerald-800 dark:text-emerald-300">{fmt(bookValueOf(row))}</div>
                          <div className="mt-1 text-[9px] text-slate-400 dark:text-slate-500">القيمة الدفترية</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-100 py-3 text-[10px] dark:border-slate-800">
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
                        <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                          <span>نسبة الإهلاك</span><span className="font-mono font-bold tabular-nums">{progress.toFixed(0)}%</span>
                        </div>
                        <DepreciationBar progress={progress} />
                      </div>
                      <div className="flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
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
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
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
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div
        className={`h-full rounded-full transition-[width] ${progress >= 100 ? 'bg-emerald-500' : 'bg-violet-500'}`}
        style={{ width: `${progress}%` }}
      />
    </div>
    <span className="font-mono text-[9px] tabular-nums text-slate-500 dark:text-slate-400">{progress.toFixed(0)}%</span>
  </div>
);

const StatusBadge: React.FC<{ status: FixedAsset['status'] }> = ({ status }) => {
  const styles: Record<FixedAsset['status'], string> = {
    ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    FULLY_DEPRECIATED: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    DISPOSED: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${styles[status]}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const AssetDatum: React.FC<{ label: string; value: string; icon?: React.ReactNode; numeric?: boolean }> = ({ label, value, icon, numeric }) => (
  <div className="min-w-0">
    <div className="mb-0.5 text-slate-400">{label}</div>
    <div className={`flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200 ${numeric ? 'font-mono tabular-nums' : ''}`} dir={numeric ? 'ltr' : undefined}>
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
  if (!canManage) return <span className="text-[10px] text-slate-400">—</span>;
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onDepreciate(row)}
        disabled={row.status !== 'ACTIVE'}
        title="طلب مراجعة إهلاك شهر واحد"
        aria-label={`طلب مراجعة إهلاك شهر واحد للأصل ${row.name}`}
        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-[10px] font-bold text-violet-800 transition hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/70"
      >
        <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden xl:inline">طلب مراجعة الإهلاك</span>
      </button>
      <button
        type="button"
        onClick={() => onEdit(row)}
        title="تعديل الأصل"
        aria-label={`تعديل الأصل ${row.name}`}
        className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-slate-800 dark:hover:text-violet-300"
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(row)}
        title="حذف الأصل"
        aria-label={`حذف الأصل ${row.name}`}
        className="rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
