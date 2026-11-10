import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { useToast } from '../../../components/ui/Toast';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { BranchAccessService } from '../../../services/domains/auth/BranchAccessService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import type { ReportColumn, ReportParams, ReportResult } from '../../../services/domains/reports/ReportCenterService';
import { runReport } from './reportCatalog';
import type { ReportDefinition } from './reportCatalog';
import { ProductPicker } from '../../../components/products/ProductPicker';

const db = DatabaseManager.getInstance();
const branchAccess = new BranchAccessService();

const today = () => localDateString();
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const numberFormatter = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const moneyFormatter = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });

function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'currency') return `${moneyFormatter.format(Number(value) || 0)} ج`;
  if (column.type === 'percent') return `${numberFormatter.format(Number(value) || 0)}%`;
  if (column.type === 'number' || column.type === 'qty') return numberFormatter.format(Number(value) || 0);
  if (column.type === 'date') return String(value).slice(0, 10);
  return String(value);
}

const TONE_CLASS: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

function badgeClass(value: unknown): string {
  const text = String(value || '').toUpperCase();
  if (['A', 'APPROVED', 'PAID', 'POSTED', 'ACTIVE', 'COMPLETED'].some((token) => text.includes(token))) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (['B'].includes(text)) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (['C'].includes(text)) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (['REJECTED', 'BOUNCED', 'OVERDUE', 'LATE', 'CANCELLED', 'VOID'].some((token) => text.includes(token))) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (['PENDING', 'OPEN', 'DRAFT', 'PARTIAL', 'REVIEW'].some((token) => text.includes(token))) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (/متأخر|راكد|عجز|مرتد|خاسر|تجاوز|نفاد|خطر|منصرف/.test(String(value))) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (/منتظم|متاح|ملتزم|ربحي|آمن|نشط|وارد|زيادة|موافق|تم/.test(String(value))) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (/معلق|بطيء|تحتاج|متابعة|قيد|مسودة/.test(String(value))) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

const KPI_VALUE = (value: number | string): string => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? numberFormatter.format(value) : moneyFormatter.format(value);
  }
  return String(value);
};

export const ReportView: React.FC<{ definition: ReportDefinition; onBack: () => void }> = ({ definition, onBack }) => {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  const products = useMemo(() => {
    if (!definition.controls?.some((control) => control.kind === 'product')) return [];
    const scope = branchAccess.sqlScope('w.branch_id', undefined);
    return db.query<any>(`
      SELECT DISTINCT p.id, p.name, p.sku
      FROM products p
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE p.is_active = 1 AND (${scope.clause} OR ws.id IS NULL)
      ORDER BY p.name
    `, scope.params);
  }, [definition]);

  const registers = useMemo(() => {
    if (!definition.controls?.some((control) => control.kind === 'register')) return [];
    const scope = branchAccess.sqlScope('branch_id');
    return db.query<any>(`SELECT id, name FROM cash_registers WHERE is_active = 1 AND ${scope.clause} ORDER BY name`, scope.params);
  }, [definition]);

  useEffect(() => {
    setFilters({});
    setSort(null);
    setSearch('');
    setCurrentPage(1);
  }, [definition.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters, from, to, asOf]);

  useEffect(() => {
    if (definition.controls?.some((control) => control.kind === 'product') && productOptions(filters, products)) {
      setFilters((current) => (current.productId ? current : { ...current, productId: products[0].id }));
    }
  }, [definition, products, filters]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const params: ReportParams = {
        from: definition.dateMode === 'range' ? from : asOf,
        to: definition.dateMode === 'range' ? to : asOf,
        ...filters,
      };
      setResult(runReport(definition.id, params));
      setLastUpdatedAt(new Date());
    } catch (caught: any) {
      setResult(null);
      setError(caught?.message || 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  }, [definition, from, to, asOf, filters]);

  const columns = useMemo(() => result?.columns || [], [result]);
  const rows = useMemo(() => {
    const source = result?.rows || [];
    const needle = search.trim();
    const filtered = needle
      ? source.filter((row) => columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle.toLowerCase())))
      : source;
    if (!sort) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === 'number' || typeof right === 'number') {
        return (Number(left) || 0) - (Number(right) || 0);
      }
      return String(left ?? '').localeCompare(String(right ?? ''), 'ar');
    });
    return sort.direction === 'asc' ? sorted : sorted.reverse();
  }, [result, search, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'desc' };
      if (current.direction === 'desc') return { key, direction: 'asc' };
      return null;
    });
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  // Chart data extraction (top 8 numeric entries)
  const chartData = useMemo(() => {
    if (!rows.length || !columns.length) return [];
    const numCol = columns.find(c => c.type === 'currency' || c.type === 'number' || c.type === 'qty');
    const labelCol = columns.find(c => c.type !== 'currency' && c.type !== 'number' && c.type !== 'qty' && c.type !== 'date') || columns[0];
    if (!numCol || !labelCol) return [];

    return rows.slice(0, 10).map(r => ({
      name: String(r[labelCol.key] || 'غير محدد').slice(0, 18),
      value: Number(r[numCol.key]) || 0,
      label: numCol.label,
    }));
  }, [rows, columns]);

  const handleExport = () => {
    if (!result) return;
    try {
      exportToExcel({
        title: definition.title,
        subtitle: `${definition.dateMode === 'range' ? `${from} إلى ${to}` : `كما في ${asOf}`}`,
        columns: result.columns.map((column) => ({ key: column.key, label: column.label })),
        rows,
        fileName: definition.id,
        kpis: result.kpis?.map(k => ({ label: k.label, value: KPI_VALUE(k.value), hint: k.hint })),
        notes: result.notes,
        permission: 'reports.export',
      });
    } catch (caught: any) {
      toast.error(caught?.message || 'تعذر تصدير التقرير.');
    }
  };

  const handlePrint = () => {
    if (!result) return;
    try {
      exportToPdf({
        title: definition.title,
        subtitle: `${definition.dateMode === 'range' ? `${from} إلى ${to}` : `كما في ${asOf}`}`,
        columns: result.columns.map((column) => ({ key: column.key, label: column.label, type: column.type, align: column.align })),
        rows,
        fileName: definition.id,
        kpis: result.kpis?.map(k => ({ label: k.label, value: KPI_VALUE(k.value), hint: k.hint })),
        notes: result.notes,
        permission: 'reports.export',
      });
    } catch (caught: any) {
      toast.error(caught?.message || 'تعذر طباعة التقرير.');
    }
  };

  const handleExportCsv = () => {
    if (!result) return;
    try {
      PermissionService.require(AuthService.requireAuth(), 'reports.export', '/reports');
      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = [
        result.columns.map((column) => escape(column.label)).join(','),
        ...rows.map((row) => result.columns.map((column) => escape(row[column.key])).join(',')),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${definition.id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught: any) {
      toast.error(caught?.message || 'تعذر تصدير التقرير.');
    }
  };

  const Icon = definition.icon;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="العودة لمركز التقارير"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-black">{definition.title}</h1>
            <p className="max-w-3xl text-xs font-medium text-slate-500">{definition.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'table' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="h-3.5 w-3.5" /> جدول
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                viewMode === 'chart' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" /> رسم بياني
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current }))}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!result || rows.length === 0}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> طباعة / PDF
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!result || rows.length === 0}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> تصدير Excel
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!result || rows.length === 0}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-5 py-3">
        {definition.dateMode === 'range' ? (
          <>
            <DateField label="من تاريخ" value={from} onChange={setFrom} />
            <DateField label="إلى تاريخ" value={to} onChange={setTo} />
          </>
        ) : definition.dateMode === 'asOf' ? (
          <DateField label="كما في تاريخ" value={asOf} onChange={setAsOf} />
        ) : null}

        {definition.controls?.map((control) => {
          if (control.kind === 'dimension') {
            return (
              <label key={control.key} className="block">
                <span className="mb-1 block text-[10px] font-bold text-slate-500">{control.label}</span>
                <select
                  value={filters[control.key] || control.options?.[0]?.value || ''}
                  onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))}
                  className="min-w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
                >
                  {control.options?.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            );
          }
          if (control.kind === 'product') {
            return (
              <label key={control.key} className="block min-w-56">
                <span className="mb-1 block text-[10px] font-bold text-slate-500">{control.label}</span>
                <ProductPicker
                  value={filters[control.key] || ''}
                  selectedLabel={products.find((product) => product.id === filters[control.key])?.name}
                  placeholder="اختر الصنف…"
                  ariaLabel={`استعراض أصناف التقرير: ${control.label}`}
                  onChange={(productId) => setFilters((current) => ({ ...current, [control.key]: productId }))}
                />
              </label>
            );
          }
          return (
            <label key={control.key} className="block min-w-44">
              <span className="mb-1 block text-[10px] font-bold text-slate-500">{control.label}</span>
              <select
                value={filters[control.key] || ''}
                onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold"
              >
                <option value="">كل الخزائن</option>
                {registers.map((register) => (
                  <option key={register.id} value={register.id}>{register.name}</option>
                ))}
              </select>
            </label>
          );
        })}
        <span className="mr-auto text-[10px] font-medium text-slate-400" aria-live="polite">
          {lastUpdatedAt ? `آخر تحديث: ${lastUpdatedAt.toLocaleTimeString('ar-EG')}` : ''}
        </span>

        <div className="relative mr-auto w-full sm:w-64">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث في النتائج…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-xs font-bold"
          />
        </div>
        <div className="flex items-center gap-1 pb-1 text-[10px] font-bold text-slate-400">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {rows.length} صف
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-teal-500" /></div>
        ) : (
          <>
            {result?.kpis?.length ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {result.kpis.map((kpi) => (
                  <div key={kpi.label} className={`rounded-2xl border bg-white p-4 ${kpi.tone ? TONE_CLASS[kpi.tone] : 'border-slate-200'}`}>
                    <div className="text-[10px] font-bold text-slate-500">{kpi.label}</div>
                    <div className="mt-1 truncate text-xl font-black">{KPI_VALUE(kpi.value)}</div>
                    {kpi.hint && <div className="mt-1 text-[10px] font-medium text-slate-400">{kpi.hint}</div>}
                  </div>
                ))}
              </div>
            ) : null}

            {result?.notes?.length ? (
              <div className="mb-4 space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] font-semibold text-sky-800">
                {result.notes.map((note) => <div key={note}>• {note}</div>)}
              </div>
            ) : null}

            {viewMode === 'chart' && chartData.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black">تحليل بياني (أعلى العناصر)</h3>
                  <span className="text-[11px] font-bold text-slate-500">
                    مقارنة: {chartData[0]?.label || ''}
                  </span>
                </div>
                <div className="h-72 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        fontSize={11}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <ReferenceLine y={0} stroke="#64748b" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '8px',
                          color: '#fff',
                          border: 'none',
                          fontSize: '12px',
                        }}
                        formatter={(val: any) => [numberFormatter.format(Number(val) || 0), chartData[0]?.label || 'القيمة']}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.value < 0 ? '#e11d48' : '#0d9488'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-black">{definition.title}</h3>
                <span className="text-[10px] font-bold text-slate-400">
                  {definition.dateMode === 'range' ? `${from} → ${to}` : definition.dateMode === 'asOf' ? `كما في ${asOf}` : 'الأرصدة الحالية'}
                </span>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-slate-200">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          onClick={() => toggleSort(column.key)}
                          className={`cursor-pointer whitespace-nowrap px-3 py-3 font-bold text-slate-500 transition hover:text-teal-700 ${
                            column.type === 'currency' || column.type === 'number' || column.type === 'qty' || column.type === 'percent' ? 'text-left' : 'text-right'
                          }`}
                        >
                          {column.label}
                          {sort?.key === column.key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRows.map((row, index) => (
                      <tr key={index} className="transition hover:bg-slate-50/70">
                        {columns.map((column) => {
                          const value = row[column.key];
                          const isNumeric = column.type === 'currency' || column.type === 'number' || column.type === 'qty' || column.type === 'percent';
                          return (
                            <td
                              key={column.key}
                              className={`px-3 py-2.5 ${isNumeric ? 'text-left font-mono font-bold' : 'text-right'} ${
                                column.type === 'currency' && Number(value) < 0 ? 'text-rose-700' : ''
                              }`}
                            >
                              {column.type === 'badge' ? (
                                <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${badgeClass(value)}`}>
                                  {String(value ?? '—')}
                                </span>
                              ) : (
                                formatCell(value, column)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={Math.max(1, columns.length)} className="py-16 text-center text-sm font-bold text-slate-400">
                          لا توجد بيانات مطابقة للفترة أو الفلاتر المحددة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="text-[11px] font-bold text-slate-500">
                    عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, rows.length)} من إجمالي {rows.length} سجل
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 text-xs font-bold text-slate-600">
                      صفحة {currentPage} من {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DateField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-bold text-slate-500">{label}</span>
    <div className="relative">
      <CalendarDays className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-xs font-bold"
      />
    </div>
  </label>
);

function productOptions(filters: Record<string, string>, products: Array<{ id: string }>): boolean {
  return !filters.productId && products.length > 0;
}
