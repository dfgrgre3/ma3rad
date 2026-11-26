import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
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
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { localDateString } from '../../../utils/shared/date';
import { exportToExcel, exportToPdf } from '../../../utils/export/export';
import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
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
  success: 'bg-success-soft text-success border-success-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  info: 'bg-accent-soft text-primary border-accent-border',
  neutral: 'bg-surface-sunken text-ink-secondary border-line',
};

function badgeClass(value: unknown): string {
  const text = String(value || '').toUpperCase();
  if (['A', 'APPROVED', 'PAID', 'POSTED', 'ACTIVE', 'COMPLETED'].some((token) => text.includes(token))) {
    return 'bg-success-soft text-success border-success-border';
  }
  if (['B'].includes(text)) return 'bg-accent-soft text-primary border-accent-border';
  if (['C'].includes(text)) return 'bg-surface-sunken text-ink-secondary border-line';
  if (['REJECTED', 'BOUNCED', 'OVERDUE', 'LATE', 'CANCELLED', 'VOID'].some((token) => text.includes(token))) {
    return 'bg-danger-soft text-danger border-danger-border';
  }
  if (['PENDING', 'OPEN', 'DRAFT', 'PARTIAL', 'REVIEW'].some((token) => text.includes(token))) {
    return 'bg-warning-soft text-warning border-warning-border';
  }
  if (/متأخر|راكد|عجز|مرتد|خاسر|تجاوز|نفاد|خطر|منصرف/.test(String(value))) {
    return 'bg-danger-soft text-danger border-danger-border';
  }
  if (/منتظم|متاح|ملتزم|ربحي|آمن|نشط|وارد|زيادة|موافق|تم/.test(String(value))) {
    return 'bg-success-soft text-success border-success-border';
  }
  if (/معلق|بطيء|تحتاج|متابعة|قيد|مسودة/.test(String(value))) {
    return 'bg-warning-soft text-warning border-warning-border';
  }
  return 'bg-accent-soft text-primary border-accent-border';
}

const KPI_VALUE = (value: number | string): string => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? numberFormatter.format(value) : moneyFormatter.format(value);
  }
  return String(value);
};

const DATE_PRESETS = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'quarter', label: 'هذا الربع' },
  { key: 'year', label: 'هذا العام' },
] as const;

const INVOICE_STATUS_OPTIONS = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'pending', label: 'معلقة' },
  { value: 'cancelled', label: 'ملغاة' },
  { value: 'returned', label: 'مرتجعة' },
  { value: 'partial', label: 'جزئية' },
] as const;

const PAYMENT_METHOD_OPTIONS = [
  { value: 'all', label: 'كل وسائل الدفع' },
  { value: 'cash', label: 'نقدي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'bank', label: 'حوالة/تحويل' },
  { value: 'cheque', label: 'شيك' },
  { value: 'installment', label: 'أقساط' },
] as const;

const getRowFilterValue = (row: Record<string, any>, key: string): unknown => {
  const aliases = new Set<string>([
    key,
    key.toLowerCase(),
    key.replace(/([A-Z])/g, '_$1').toLowerCase(),
    key.replace(/Id$/i, '_id'),
    key.replace(/Id$/i, 'Id'),
  ]);

  for (const alias of aliases) {
    if (row[alias] !== undefined) return row[alias];
  }

  if (key === 'branchId') return row.branch_id ?? row.branchId ?? row.branch ?? row.branch_name;
  if (key === 'warehouseId') return row.warehouse_id ?? row.warehouseId ?? row.warehouse ?? row.warehouse_name;
  if (key === 'registerId') return row.register_id ?? row.registerId ?? row.cash_register_id ?? row.cashRegisterId;
  if (key === 'customerId') return row.customer_id ?? row.customerId ?? row.client_id ?? row.clientId;
  if (key === 'supplierId') return row.supplier_id ?? row.supplierId;
  if (key === 'employeeId') return row.employee_id ?? row.employeeId ?? row.user_id ?? row.userId;
  if (key === 'status') return row.invoice_status ?? row.status ?? row.payment_status ?? row.state;
  if (key === 'paymentMethod') return row.payment_method ?? row.paymentMethod ?? row.means_of_payment ?? row.method;
  if (key === 'compareBranchId') return row.compare_branch_id ?? row.compareBranchId ?? row.branch_id;
  return row[key];
};

const addDays = (value: Date, days: number): Date => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const startOfWeek = (value: Date): Date => {
  const date = new Date(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth() + 1, 0);

const applyPreset = (preset: string, definition: ReportDefinition, setFrom: (v: string) => void, setTo: (v: string) => void, setAsOf: (v: string) => void) => {
  const now = new Date();
  const range = (() => {
    switch (preset) {
      case 'today':
        return { from: localDateString(now), to: localDateString(now) };
      case 'yesterday': {
        const date = addDays(now, -1);
        return { from: localDateString(date), to: localDateString(date) };
      }
      case 'week': {
        const start = startOfWeek(now);
        const end = addDays(start, 6);
        return { from: localDateString(start), to: localDateString(end) };
      }
      case 'month': {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        return { from: localDateString(start), to: localDateString(end) };
      }
      case 'quarter': {
        const startMonth = Math.floor(now.getMonth() / 3) * 3;
        const start = new Date(now.getFullYear(), startMonth, 1);
        const end = new Date(now.getFullYear(), startMonth + 3, 0);
        return { from: localDateString(start), to: localDateString(end) };
      }
      case 'year':
        return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
      default:
        return null;
    }
  })();

  if (!range) return;
  if (definition.dateMode === 'range') {
    setFrom(range.from);
    setTo(range.to);
  } else {
    setAsOf(range.to);
  }
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const branches = useMemo(() => {
    const scope = branchAccess.sqlScope('id');
    return db.query<any>(`SELECT id, name FROM branches WHERE ${scope.clause} ORDER BY name`, scope.params);
  }, []);

  const warehouses = useMemo(() => {
    const scope = branchAccess.sqlScope('branch_id');
    return db.query<any>(`SELECT id, name FROM warehouses WHERE is_active = 1 AND ${scope.clause} ORDER BY name`, scope.params);
  }, []);

  const customers = useMemo(() => {
    const scope = branchAccess.sqlScope('branch_id');
    return db.query<any>(`SELECT id, name FROM customers WHERE is_active = 1 AND ${scope.clause} ORDER BY name`, scope.params);
  }, []);

  const suppliers = useMemo(() => {
    const scope = branchAccess.companyScope('company_id');
    return db.query<any>(`SELECT id, name FROM suppliers WHERE is_active = 1 AND ${scope.clause} ORDER BY name`, scope.params);
  }, []);

  const employees = useMemo(() => {
    const scope = branchAccess.sqlScope('branch_id');
    return db.query<any>(`SELECT id, full_name AS name FROM users WHERE is_active = 1 AND ${scope.clause} ORDER BY full_name`, scope.params);
  }, []);

  const registers = useMemo(() => {
    if (!definition.controls?.some((control) => control.kind === 'register')) return [];
    const scope = branchAccess.sqlScope('branch_id');
    return db.query<any>(`SELECT id, name FROM cash_registers WHERE is_active = 1 AND ${scope.clause} ORDER BY name`, scope.params);
  }, [definition]);

  const advancedFilterFields = useMemo(() => {
    const baseFields = [
      { key: 'branchId', label: 'الفرع', options: [{ value: '', label: 'كل الفروع' }, ...branches.map((branch) => ({ value: String(branch.id), label: String(branch.name) }))] },
      { key: 'warehouseId', label: 'المخزن', options: [{ value: '', label: 'كل المخازن' }, ...warehouses.map((warehouse) => ({ value: String(warehouse.id), label: String(warehouse.name) }))] },
      { key: 'registerId', label: 'الخزينة', options: [{ value: '', label: 'كل الخزائن' }, ...registers.map((register) => ({ value: String(register.id), label: String(register.name) }))] },
      { key: 'customerId', label: 'العميل', options: [{ value: '', label: 'كل العملاء' }, ...customers.map((customer) => ({ value: String(customer.id), label: String(customer.name) }))] },
      { key: 'supplierId', label: 'المورد', options: [{ value: '', label: 'كل الموردين' }, ...suppliers.map((supplier) => ({ value: String(supplier.id), label: String(supplier.name) }))] },
      { key: 'employeeId', label: 'الموظف', options: [{ value: '', label: 'كل الموظفين' }, ...employees.map((employee) => ({ value: String(employee.id), label: String(employee.name) }))] },
      { key: 'status', label: 'حالة الفاتورة', options: INVOICE_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
      { key: 'paymentMethod', label: 'طريقة الدفع', options: PAYMENT_METHOD_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
      { key: 'compareBranchId', label: 'مقارنة فرع', options: [{ value: '', label: 'بدون مقارنة' }, ...branches.map((branch) => ({ value: String(branch.id), label: String(branch.name) }))] },
    ];

    return baseFields.filter((field) => !definition.controls?.some((control) => control.key === field.key));
  }, [branches, customers, definition.controls, employees, registers, suppliers, warehouses]);

  const products = useMemo(() => {
    if (!definition.controls?.some((control) => control.kind === 'product')) return [];
    const scope = branchAccess.sqlScope('w.branch_id', undefined);
    return db.query<any>(`
      SELECT DISTINCT p.id, p.name, p.sku
      FROM products p
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      LEFT JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE (p.is_active = 1 OR COALESCE(ws.quantity_m2, 0) != 0)
        AND (${scope.clause} OR ws.id IS NULL)
      ORDER BY p.name
    `, scope.params);
  }, [definition]);

  useEffect(() => {
    setFilters({});
    setSort(null);
    setSearch('');
    setCurrentPage(1);
  }, [definition.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters, from, to, asOf, refreshToken]);

  useEffect(() => {
    if (definition.controls?.some((control) => control.kind === 'product') && productOptions(filters, products)) {
      setFilters((current) => (current.productId ? current : { ...current, productId: products[0].id }));
    }
  }, [definition, products, filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const params: ReportParams = {
          from: definition.dateMode === 'range' ? from : asOf,
          to: definition.dateMode === 'range' ? to : asOf,
          ...filters,
        };
        const next = await runReport(definition.id, params);
        if (cancelled) return;
        setResult(next);
        setLastUpdatedAt(new Date());
      } catch (caught: any) {
        if (cancelled) return;
        setResult(null);
        setError(caught?.message || 'تعذر تحميل التقرير.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [definition, from, to, asOf, filters, refreshToken]);

  const columns = useMemo(() => result?.columns || [], [result]);
  const rows = useMemo(() => {
    const source = result?.rows || [];
    const needle = search.trim();
    let filtered = needle
      ? source.filter((row) => columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle.toLowerCase())))
      : source;

    Object.entries(filters).forEach(([key, value]) => {
      if (!value || value === 'all' || value === 'all-branches' || value === 'none') return;
      filtered = filtered.filter((row) => {
        const candidate = getRowFilterValue(row, key);
        if (candidate === undefined || candidate === null || candidate === '') return false;
        return String(candidate).trim().toLowerCase() === String(value).trim().toLowerCase();
      });
    });

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
  }, [result, search, sort, columns, filters]);

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

  const chartKind: 'bar' | 'line' | 'area' | 'pie' = useMemo(() => {
    if (definition.chart) return definition.chart;
    const hasDateAxis = columns.some((column) => column.type === 'date');
    const hasTextAxis = columns.some((column) => column.type !== 'currency' && column.type !== 'number' && column.type !== 'qty' && column.type !== 'percent' && column.type !== 'date');
    if (hasDateAxis && rows.length >= 2) return 'line';
    if (hasTextAxis && rows.length <= 8) return 'pie';
    return 'bar';
  }, [columns, definition.chart, rows.length]);

  const rowValue = useCallback((key: string) => rows[0]?.[key], [rows]);

  const chartData = useMemo(() => {
    if (!rows.length || !columns.length) return [];
    const numericColumns = columns.filter((column) => column.type === 'currency' || column.type === 'number' || column.type === 'qty' || column.type === 'percent');
    const labelColumn = columns.find((column) => column.type !== 'currency' && column.type !== 'number' && column.type !== 'qty' && column.type !== 'percent' && column.type !== 'date') || columns[0];

    const valueColumn = numericColumns[0] || columns.find((column) => typeof rowValue(column.key) !== 'string');

    if (!valueColumn || !labelColumn) return [];

    return rows.slice(0, 10).map((row) => ({
      name: String(row[labelColumn.key] ?? 'غير محدد').slice(0, 18),
      value: Number(row[valueColumn.key]) || 0,
      label: valueColumn.label,
    }));
  }, [rows, columns, rowValue]);

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
  const handleRowClick = () => {
    if (definition.drilldown) {
      const routeMessage = definition.drilldown.route ? `الانتقال إلى ${definition.drilldown.route}` : definition.drilldown.label;
      toast.info(`${definition.drilldown.note || definition.drilldown.label} • ${routeMessage}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-muted text-ink">
      <div className="border-b border-line bg-surface px-5 py-4">
        <PageHeader
          icon={<Icon className="h-5 w-5" />}
          title={definition.title}
          description={definition.description}
          actions={<>
            <button
              type="button"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-surface-muted hover:text-ink"
              aria-label="العودة لمركز التقارير"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="flex rounded-xl border border-line bg-surface-sunken p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  viewMode === 'table' ? 'bg-surface text-success shadow-sm' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Table className="h-3.5 w-3.5" /> جدول
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  viewMode === 'chart' ? 'bg-surface text-success shadow-sm' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" /> رسم بياني
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-secondary transition hover:bg-surface-muted"
            >
              <SlidersHorizontal className="h-4 w-4" /> فلترة متقدمة
            </button>
            <button
              type="button"
              onClick={() => setRefreshToken((current) => current + 1)}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-secondary transition hover:bg-surface-muted"
            >
              <RefreshCw className="h-4 w-4" /> تحديث
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!result || rows.length === 0}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> طباعة / PDF
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!result || rows.length === 0}
              className="flex items-center gap-2 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> تصدير Excel
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!result || rows.length === 0}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </>}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-5 py-3">
        {definition.dateMode === 'range' ? (
          <>
            <DateField label="من تاريخ" value={from} onChange={setFrom} />
            <DateField label="إلى تاريخ" value={to} onChange={setTo} />
          </>
        ) : definition.dateMode === 'asOf' ? (
          <DateField label="كما في تاريخ" value={asOf} onChange={setAsOf} />
        ) : null}

        {definition.dateMode !== 'none' && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-muted p-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key, definition, setFrom, setTo, setAsOf)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-ink-secondary transition hover:bg-surface hover:text-success"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {definition.controls?.map((control) => {
          if (control.kind === 'dimension') {
            return (
              <label key={control.key} className="block">
                <span className="mb-1 block text-[10px] font-bold text-muted">{control.label}</span>
                <select
                  value={filters[control.key] || control.options?.[0]?.value || ''}
                  onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))}
                  className="min-w-36 rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs font-bold"
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
                <span className="mb-1 block text-[10px] font-bold text-muted">{control.label}</span>
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
              <span className="mb-1 block text-[10px] font-bold text-muted">{control.label}</span>
              <select
                value={filters[control.key] || ''}
                onChange={(event) => setFilters((current) => ({ ...current, [control.key]: event.target.value }))}
                className="w-full rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs font-bold"
              >
                <option value="">كل الخزائن</option>
                {registers.map((register) => (
                  <option key={register.id} value={register.id}>{register.name}</option>
                ))}
              </select>
            </label>
          );
        })}
        <span className="ms-auto text-[10px] font-medium text-muted" aria-live="polite">
          {lastUpdatedAt ? `آخر تحديث: ${lastUpdatedAt.toLocaleTimeString('ar-EG')}` : ''}
        </span>

        <div className="relative ms-auto w-full sm:w-64">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث في النتائج…"
            className="w-full rounded-xl border border-line bg-surface-muted py-2 pl-3 pr-9 text-xs font-bold"
          />
        </div>
        <div className="flex items-center gap-1 pb-1 text-[10px] font-bold text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {rows.length} صف
        </div>
      </div>

      {showAdvancedFilters && advancedFilterFields.length > 0 && (
        <div className="border-b border-line bg-surface-muted px-5 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-black text-ink">
              <SlidersHorizontal className="h-3.5 w-3.5" /> فلترة متقدمة
            </div>
            <button
              type="button"
              onClick={() => setFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key === 'productId' || key === 'registerId' || key === 'dimension')))}
              className="text-[10px] font-bold text-muted transition hover:text-success"
            >
              مسح الفلاتر
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {advancedFilterFields.map((field) => (
              <label key={field.key} className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold text-muted">{field.label}</span>
                <select
                  value={filters[field.key] || ''}
                  onChange={(event) => setFilters((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink"
                >
                  {field.options.map((option) => (
                    <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-5">
        {error && (
          <div className="mb-4 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-xs font-bold text-danger">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-success" /></div>
        ) : (
          <>
            {result?.kpis?.length ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {result.kpis.map((kpi) => (
                  <div key={kpi.label} className={`rounded-2xl border bg-surface p-4 ${kpi.tone ? TONE_CLASS[kpi.tone] : 'border-line'}`}>
                    <div className="text-[10px] font-bold text-muted">{kpi.label}</div>
                    <div className="mt-1 truncate text-xl font-black">{KPI_VALUE(kpi.value)}</div>
                    {kpi.hint && <div className="mt-1 text-[10px] font-medium text-muted">{kpi.hint}</div>}
                  </div>
                ))}
              </div>
            ) : null}

            {result?.notes?.length ? (
              <div className="mb-4 space-y-1 rounded-xl border border-accent-border bg-accent-soft px-4 py-3 text-[11px] font-semibold text-primary">
                {result.notes.map((note) => <div key={note}>• {note}</div>)}
              </div>
            ) : null}

            {definition.drilldown ? (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-accent-border bg-accent-soft px-4 py-2 text-[11px] font-bold text-primary">
                <span>{definition.drilldown.label}</span>
                <span className="text-primary">{definition.drilldown.note}</span>
              </div>
            ) : null}

            {viewMode === 'chart' && chartData.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-line bg-surface p-5">
                <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                  <h3 className="text-sm font-black">تحليل بياني (أعلى العناصر)</h3>
                  <span className="text-[11px] font-bold text-muted">
                    نوع الرسم: {chartKind === 'bar' ? 'أعمدة' : chartKind === 'line' ? 'خطي' : chartKind === 'area' ? 'مساحة' : 'توزيعي'}
                  </span>
                </div>
                <div className="h-72 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 288 }}>
                    {chartKind === 'pie' ? (
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={42} label>
                          {chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.value < 0 ? '#f43f5e' : '#0d9488'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [numberFormatter.format(Number(value) || 0), chartData[0]?.label || 'القيمة']}
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '12px' }}
                        />
                      </PieChart>
                    ) : chartKind === 'line' ? (
                      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} interval={0} angle={-25} textAnchor="end" />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <ReferenceLine y={0} stroke="#64748b" />
                        <Tooltip formatter={(value: any) => [numberFormatter.format(Number(value) || 0), chartData[0]?.label || 'القيمة']} contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '12px' }} />
                        <Line type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    ) : chartKind === 'area' ? (
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} interval={0} angle={-25} textAnchor="end" />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <ReferenceLine y={0} stroke="#64748b" />
                        <Tooltip formatter={(value: any) => [numberFormatter.format(Number(value) || 0), chartData[0]?.label || 'القيمة']} contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="value" stroke="#14b8a6" fill="#99f6e4" strokeWidth={2.5} />
                      </AreaChart>
                    ) : (
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} interval={0} angle={-25} textAnchor="end" />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <ReferenceLine y={0} stroke="#64748b" />
                        <Tooltip formatter={(value: any) => [numberFormatter.format(Number(value) || 0), chartData[0]?.label || 'القيمة']} contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none', fontSize: '12px' }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.value < 0 ? '#e11d48' : '#0d9488'} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line bg-surface-muted px-4 py-3">
                <h3 className="text-sm font-black">{definition.title}</h3>
                <span className="text-[10px] font-bold text-muted">
                  {definition.dateMode === 'range' ? `${from} → ${to}` : definition.dateMode === 'asOf' ? `كما في ${asOf}` : 'الأرصدة الحالية'}
                </span>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <DataTable
                ariaLabel="بيانات التقرير"
                rows={pagedRows.map((row: any, index: number) => ({ ...row, __i: index }))}
                rowKey={(row: any) => String(row.__i)}
                stickyHeader
                tableClassName="text-xs"
                onRowClick={definition.drilldown ? handleRowClick : undefined}
                rowClassName={() => definition.drilldown ? 'cursor-pointer transition hover:bg-surface-muted/70' : 'transition hover:bg-surface-muted/70'}
                columns={columns.map((column: any) => {
                  const isNumeric = column.type === 'currency' || column.type === 'number' || column.type === 'qty' || column.type === 'percent';
                  return {
                    key: column.key,
                    header: (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={`w-full cursor-pointer whitespace-nowrap font-bold text-muted transition hover:text-success ${isNumeric ? 'text-end' : 'text-start'}`}
                      >
                        {column.label}
                        {sort?.key === column.key ? (sort?.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    ),
                    align: isNumeric ? ('end' as const) : ('start' as const),
                    className: isNumeric ? 'font-mono font-bold' : undefined,
                    render: (row: any) => {
                      const value = row[column.key];
                      if (column.type === 'badge') {
                        return <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${badgeClass(value)}`}>{String(value ?? '—')}</span>;
                      }
                      const text = formatCell(value, column);
                      return <span className={column.type === 'currency' && Number(value) < 0 ? 'text-danger' : undefined}>{text}</span>;
                    },
                  };
                })}
                emptyTitle="لا توجد بيانات مطابقة للفترة أو الفلاتر المحددة."
              />
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-line bg-surface-muted px-4 py-2.5">
                  <div className="text-[11px] font-bold text-muted">
                    عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, rows.length)} من إجمالي {rows.length} سجل
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-ink-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-2 text-xs font-bold text-ink-secondary">
                      صفحة {currentPage} من {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-ink-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
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
    <span className="mb-1 block text-[10px] font-bold text-muted">{label}</span>
    <div className="relative">
      <CalendarDays className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-line bg-surface-muted py-2 pl-3 pr-9 text-xs font-bold"
      />
    </div>
  </label>
);

function productOptions(filters: Record<string, string>, products: Array<{ id: string }>): boolean {
  return !filters.productId && products.length > 0;
}
