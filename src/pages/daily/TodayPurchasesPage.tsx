import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ShoppingBag, Plus, CalendarDays, RefreshCw, Download, Loader2, AlertTriangle, Printer,
  Search, Eye, Trash2, HandCoins, ChevronDown, ChevronLeft, ArrowUpDown, Wallet, Package,
  Truck, Users, TrendingUp, TrendingDown, ExternalLink, X,
  CircleDollarSign, ReceiptText, BadgeCheck, Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DailyOperationsService,
  type DailyPurchaseResult,
  type DailyPurchaseRow,
  type DailyPurchaseItemRow,
} from '../../services/DailyOperationsService';
import { SettingsService } from '../../services/SettingsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import {
  QuickPurchaseModal, PaymentModal, DetailsModal, VoidModal, type PaymentTarget,
} from '../../components/daily/DailyModals';
import { exportToExcel, exportToPdf, printHtml } from '../../utils/export';
import { useToast } from '../../components/ui/Toast';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

type TabKey = 'invoices' | 'items' | 'suppliers' | 'payments';
type SortKey = 'createdAt' | 'invoiceNumber' | 'supplierName' | 'total' | 'paid' | 'remaining' | 'itemsCount';

const PAY_LABEL: Record<string, string> = {
  PAID: 'مدفوعة',
  PARTIAL: 'جزئيًا',
  UNPAID: 'آجلة',
  CASH: 'نقدي',
  CREDIT: 'آجل',
  BANK: 'بنكي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  CHEQUE: 'شيك',
  MIXED: 'مختلط',
};

const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  PARTIAL: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  UNPAID: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

const METHOD_STYLE: Record<string, { bar: string; dot: string; text: string }> = {
  CASH: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  BANK_TRANSFER: { bar: 'bg-sky-500', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
  CARD: { bar: 'bg-violet-500', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  CHEQUE: { bar: 'bg-indigo-500', dot: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300' },
  CREDIT: { bar: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  MIXED: { bar: 'bg-slate-500', dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
};

const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);

const timeOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—');

const formatDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const shiftDay = (value: string, days: number) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const weekdayOf = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' });

const badge = (status: string) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
    {PAY_LABEL[status] || status || '—'}
  </span>
);

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, action, className = '', children }) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-2">
        {Icon && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  featured?: boolean;
  delta?: number | null;
}> = ({ label, value, hint, tone, featured, delta }) => (
  <div className={`min-w-0 rounded-xl border p-4 ${featured
    ? 'border-slate-800 bg-slate-900 text-white dark:border-slate-700'
    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
    <p className={`text-[11px] font-bold ${featured ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{label}</p>
    <p className={`mt-2 whitespace-normal break-words text-sm font-black leading-snug tabular-nums [overflow-wrap:anywhere] min-[400px]:text-base sm:text-lg xl:text-xl ${featured ? 'text-orange-300' : tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] ${featured ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
      {hint && <span className="break-words [overflow-wrap:anywhere]">{hint}</span>}
      {typeof delta === 'number' && Number.isFinite(delta) && (
        <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-bold tabular-nums ${delta >= 0
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%
        </span>
      )}
    </div>
  </div>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p>}
  </div>
);

const buildPurchaseInvoiceHtml = (
  row: DailyPurchaseRow,
  items: DailyPurchaseItemRow[],
  currency: string,
  storeName: string,
) => {
  const money = (value: number) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency}`;
  const lines = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="text-align:right;font-weight:700">${escapeHtml(item.productName)}<div style="font-size:10px;color:#64748b">${escapeHtml(item.sku || '')} · ${escapeHtml(item.grade || '')}</div></td>
      <td>${escapeHtml(formatProductQuantity(Number(item.quantityM2), item))}</td>
      <td>${escapeHtml(item.boxesCount)}</td>
      <td>${escapeHtml(money(item.unitCost))}</td>
      <td style="font-weight:700">${escapeHtml(money(item.totalCost))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>فاتورة توريد ${escapeHtml(row.invoiceNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; font-size: 12px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #ea580c; padding-bottom:12px; }
    .title { font-size:18px; font-weight:800; color:#c2410c; }
    .muted { color:#64748b; font-size:11px; }
    .grid { display:flex; justify-content:space-between; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; margin:14px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    th, td { border-bottom:1px solid #e2e8f0; padding:7px 6px; text-align:center; }
    th { background:#fff7ed; color:#9a3412; }
    .totals { width:280px; margin-right:auto; margin-top:14px; border:1px solid #e2e8f0; border-radius:6px; padding:10px; background:#f8fafc; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .grand { border-top:2px solid #cbd5e1; margin-top:6px; padding-top:6px; font-size:14px; font-weight:800; color:#c2410c; }
    @media print { body { padding:0; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="title">${escapeHtml(storeName || 'CeramiSys ERP')}</div>
      <div class="muted">فاتورة توريد / مشتريات</div>
    </div>
    <div style="text-align:left">
      <div style="font-weight:800">${escapeHtml(row.invoiceNumber)}</div>
      <div class="muted">${escapeHtml(row.date)}</div>
      ${row.supplierInvoiceNumber ? `<div class="muted">فاتورة المورد: ${escapeHtml(row.supplierInvoiceNumber)}</div>` : ''}
    </div>
  </div>
  <div class="grid">
    <div><strong>المورد:</strong> ${escapeHtml(row.supplierName || '—')}<br/><span class="muted">${escapeHtml(row.supplierPhone || '')}</span></div>
    <div><strong>المخزن:</strong> ${escapeHtml(row.warehouseName || '—')}</div>
    <div><strong>طريقة السداد:</strong> ${escapeHtml(PAY_LABEL[row.paymentType] || row.paymentType || '—')}</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>الكراتين</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="6">لا توجد أصناف</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>الإجمالي قبل الخصم</span><span>${escapeHtml(money(row.subtotal))}</span></div>
    <div class="row"><span>الخصم</span><span>${escapeHtml(money(row.discount))}</span></div>
    <div class="row"><span>الضريبة</span><span>${escapeHtml(money(row.tax))}</span></div>
    <div class="row"><span>الشحن</span><span>${escapeHtml(money(row.shippingCost))}</span></div>
    <div class="row grand"><span>إجمالي الفاتورة</span><span>${escapeHtml(money(row.total))}</span></div>
    <div class="row"><span>المدفوع</span><span>${escapeHtml(money(row.paid))}</span></div>
    <div class="row"><span>المتبقي</span><span>${escapeHtml(money(row.remaining))}</span></div>
  </div>
  ${row.notes ? `<p class="muted" style="margin-top:14px">ملاحظات: ${escapeHtml(row.notes)}</p>` : ''}
  <p class="muted" style="margin-top:20px;text-align:center">أُنشئت من CeramiSys ERP — ${escapeHtml(row.createdByName || '')} — ${escapeHtml(timeOf(row.createdAt))}</p>
</body>
</html>`;
};

export const TodayPurchasesPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const service = useMemo(() => new DailyOperationsService(), []);
  const user = useMemo(() => AuthService.getCurrentUser(), []);
  const can = (code: string) => PermissionService.can(user, code);
  const canCreate = can('purchases.create');
  const canDelete = can('purchases.delete');
  const canPay = can('suppliers.payment');

  const [date, setDate] = useState(() => service.today());
  const [data, setData] = useState<DailyPurchaseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [supplierId, setSupplierId] = useState('ALL');
  const [warehouse, setWarehouse] = useState('ALL');
  const [paymentType, setPaymentType] = useState('ALL');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [tab, setTab] = useState<TabKey>('invoices');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{ kind: 'purchase'; id: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ kind: 'purchase'; id: string; name: string } | null>(null);

  const settings = useMemo(() => {
    try { return SettingsService.getSettings(); } catch { return null; }
  }, []);
  const currency = settings?.currencySymbol || 'ج.م';
  const todayDate = service.today();
  const nf = useMemo(() => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }), []);
  const fmt = (value: number) => `${nf.format(Number(value) || 0)} ${currency}`;
  const plain = (value: number) => nf.format(Number(value) || 0);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setData(service.getPurchases(date));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل مشتريات اليوم');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);
  const loadFor = useCallback(
    (dateValue: string) => {
      setLoading(true);
      try {
        setData(service.getPurchases(dateValue));
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'تعذر تحميل مشتريات اليوم');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [service],
  );
  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [search, status, supplierId, warehouse, paymentType, minAmount, maxAmount, pageSize, date]);

  const rows = data?.rows || [];
  const items = data?.items || [];
  const payments = data?.payments || [];

  const suppliersOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => { if (row.supplierId) map.set(row.supplierId, row.supplierName || '—'); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows]);

  const warehouses = useMemo(() => [...new Set(rows.map((row) => row.warehouseName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const methods = useMemo(() => [...new Set(rows.map((row) => row.paymentType).filter(Boolean))], [rows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: rows.length };
    rows.forEach((row) => { counts[row.paymentStatus] = (counts[row.paymentStatus] || 0) + 1; });
    return counts;
  }, [rows]);

  const withinAmount = (row: DailyPurchaseRow) => {
    const total = Number(row.total) || 0;
    if (minAmount.trim() && total < Number(minAmount)) return false;
    if (maxAmount.trim() && total > Number(maxAmount)) return false;
    return true;
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (status !== 'ALL' && row.paymentStatus !== status) return false;
      if (supplierId !== 'ALL' && row.supplierId !== supplierId) return false;
      if (warehouse !== 'ALL' && row.warehouseName !== warehouse) return false;
      if (paymentType !== 'ALL' && row.paymentType !== paymentType) return false;
      if (!withinAmount(row)) return false;
      if (!term) return true;
      return `${row.invoiceNumber} ${row.supplierInvoiceNumber || ''} ${row.supplierName || ''} ${row.supplierPhone || ''} ${row.warehouseName || ''} ${row.createdByName || ''} ${row.notes || ''}`
        .toLowerCase().includes(term);
    });

    const direction = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'invoiceNumber': return a.invoiceNumber.localeCompare(b.invoiceNumber) * direction;
        case 'supplierName': return (a.supplierName || '').localeCompare(b.supplierName || '', 'ar') * direction;
        case 'createdAt': return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * direction;
        default: return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * direction;
      }
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, search, status, supplierId, warehouse, paymentType, minAmount, maxAmount, sortKey, sortDir]);

  const filteredRowsRaw = useMemo(() => rows.filter((row) => {
    if (status !== 'ALL' && row.paymentStatus !== status) return false;
    if (supplierId !== 'ALL' && row.supplierId !== supplierId) return false;
    if (warehouse !== 'ALL' && row.warehouseName !== warehouse) return false;
    if (paymentType !== 'ALL' && row.paymentType !== paymentType) return false;
    return withinAmount(row);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }), [rows, status, supplierId, warehouse, paymentType, minAmount, maxAmount]);

  const scopeWithoutSearch = useMemo(() => filteredRowsRaw, [filteredRowsRaw]);
  const scopedIds = useMemo(() => new Set(filteredRows.map((row) => row.id)), [filteredRows]);
  const scopedItems = useMemo(() => items.filter((item) => scopedIds.has(item.purchaseId)), [items, scopedIds]);

  const itemsByPurchase = useMemo(() => {
    const map = new Map<string, DailyPurchaseItemRow[]>();
    items.forEach((item) => {
      const list = map.get(item.purchaseId) || [];
      list.push(item);
      map.set(item.purchaseId, list);
    });
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const ids = new Set(filteredRows.map((row) => row.id));
    const list = items.filter((item) => ids.has(item.purchaseId));
    if (!term) return list;
    return list.filter((item) =>
      `${item.productName} ${item.sku || ''} ${item.invoiceNumber} ${item.supplierName} ${item.grade}`.toLowerCase().includes(term)
    );
  }, [items, filteredRows, search]);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (supplierId !== 'ALL' && payment.supplierId !== supplierId) return false;
      if (paymentType !== 'ALL' && payment.paymentType !== paymentType) return false;
      if (!term) return true;
      return `${payment.receiptNumber} ${payment.supplierName} ${payment.invoiceNumbers || ''} ${payment.notes || ''} ${payment.performedByName || ''}`
        .toLowerCase().includes(term);
    });
  }, [payments, search, supplierId, paymentType]);

  const supplierStats = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; phone?: string | null; invoices: number; total: number; paid: number;
      remaining: number; itemsCount: number; quantity: number; lastTime?: string | null; unpaid: number;
    }>();
    filteredRows.forEach((row) => {
      const key = row.supplierId || row.supplierName || '—';
      const current = map.get(key) || {
        id: key, name: row.supplierName || '—', phone: row.supplierPhone,
        invoices: 0, total: 0, paid: 0, remaining: 0, itemsCount: 0, quantity: 0, lastTime: row.createdAt, unpaid: 0,
      };
      current.invoices += 1;
      current.total += Number(row.total) || 0;
      current.paid += Number(row.paid) || 0;
      current.remaining += Number(row.remaining) || 0;
      current.unpaid += row.paymentStatus === 'PAID' ? 0 : 1;
      current.lastTime = String(row.createdAt || '') > String(current.lastTime || '') ? row.createdAt : current.lastTime;
      map.set(key, current);
    });
    scopedItems.forEach((item) => {
      const key = item.supplierId || item.supplierName || '—';
      const current = map.get(key);
      if (!current) return;
      current.itemsCount += 1;
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredRows, scopedItems]);

  const previousTrend = data && data.trend.length >= 2 ? data.trend[data.trend.length - 2] : null;
  const totalDelta = previousTrend && previousTrend.total > 0 && data
    ? ((data.summary.total - previousTrend.total) / previousTrend.total) * 100
    : null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'supplierName' || key === 'invoiceNumber' ? 'asc' : 'desc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('ALL');
    setSupplierId('ALL');
    setWarehouse('ALL');
    setPaymentType('ALL');
    setMinAmount('');
    setMaxAmount('');
  };

  const hasFilters = Boolean(search || status !== 'ALL' || supplierId !== 'ALL' || warehouse !== 'ALL' || paymentType !== 'ALL' || minAmount || maxAmount);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportInvoices = () => {
    if (!data) return;
    try {
      exportToExcel({
        title: 'كشف مشتريات اليوم',
        subtitle: `${formatDay(date)} — ${plain(data.summary.count)} فاتورة`,
        columns: [
          { key: 'invoiceNumber', label: 'الفاتورة' },
          { key: 'supplierInvoiceNumber', label: 'فاتورة المورد' },
          { key: 'time', label: 'الوقت' },
          { key: 'supplierName', label: 'المورد' },
          { key: 'supplierPhone', label: 'الهاتف' },
          { key: 'warehouseName', label: 'المخزن' },
          { key: 'itemsCount', label: 'الأصناف' },
          { key: 'subtotal', label: 'قبل الخصم' },
          { key: 'discount', label: 'الخصم' },
          { key: 'tax', label: 'الضريبة' },
          { key: 'shippingCost', label: 'الشحن' },
          { key: 'total', label: 'الإجمالي' },
          { key: 'paid', label: 'المدفوع' },
          { key: 'remaining', label: 'المتبقي' },
          { key: 'paymentTypeLabel', label: 'طريقة السداد' },
          { key: 'paymentStatusLabel', label: 'حالة السداد' },
          { key: 'createdByName', label: 'بواسطة' },
          { key: 'notes', label: 'ملاحظات' },
        ],
        rows: filteredRows.map((row) => ({
          ...row,
          time: timeOf(row.createdAt),
          paymentTypeLabel: PAY_LABEL[row.paymentType] || row.paymentType,
          paymentStatusLabel: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
        })),
        fileName: `daily-purchases-${date}`,
      });
      toast.success('تم تصدير فواتير التوريد');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير الفواتير');
    }
  };

  const exportItems = () => {
    try {
      exportToExcel({
        title: 'أصناف التوريد اليوم',
        subtitle: `${formatDay(date)} — ${plain(filteredItems.length)} سطر`,
        columns: [
          { key: 'invoiceNumber', label: 'الفاتورة' },
          { key: 'supplierName', label: 'المورد' },
          { key: 'productName', label: 'الصنف' },
          { key: 'sku', label: 'الكود' },
          { key: 'grade', label: 'الفرز' },
          { key: 'quantityM2', label: 'الكمية' },
          { key: 'unit', label: 'الوحدة' },
          { key: 'boxesCount', label: 'الكراتين' },
          { key: 'unitCost', label: 'تكلفة الوحدة' },
          { key: 'totalCost', label: 'الإجمالي' },
        ],
        rows: filteredItems.map((item) => ({
          ...item,
          quantityM2: plain(item.quantityM2),
          unit: getProductUnitLabel(item),
        })) as unknown as Array<Record<string, unknown>>,
        fileName: `daily-purchases-items-${date}`,
      });
      toast.success('تم تصدير أصناف التوريد');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير الأصناف');
    }
  };

  const exportSuppliers = () => {
    try {
      exportToExcel({
        title: 'موردون مشتريات اليوم',
        subtitle: formatDay(date),
        columns: [
          { key: 'name', label: 'المورد' },
          { key: 'phone', label: 'الهاتف' },
          { key: 'invoices', label: 'عدد الفواتير' },
          { key: 'itemsCount', label: 'عدد الأصناف' },
          { key: 'total', label: 'إجمالي المشتريات' },
          { key: 'paid', label: 'المدفوع' },
          { key: 'remaining', label: 'المتبقي' },
          { key: 'unpaid', label: 'فواتير غير مسددة' },
        ],
        rows: supplierStats as unknown as Array<Record<string, unknown>>,
        fileName: `daily-purchases-suppliers-${date}`,
      });
      toast.success('تم تصدير الموردين');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير الموردين');
    }
  };

  const exportPayments = () => {
    try {
      exportToExcel({
        title: 'سداد الموردين اليوم',
        subtitle: formatDay(date),
        columns: [
          { key: 'receiptNumber', label: 'السند' },
          { key: 'supplierName', label: 'المورد' },
          { key: 'invoiceNumbers', label: 'الفواتير' },
          { key: 'amount', label: 'المبلغ' },
          { key: 'paymentTypeLabel', label: 'طريقة السداد' },
          { key: 'performedByName', label: 'بواسطة' },
          { key: 'notes', label: 'ملاحظات' },
        ],
        rows: filteredPayments.map((payment) => ({
          ...payment,
          paymentTypeLabel: PAY_LABEL[payment.paymentType] || payment.paymentType,
        })),
        fileName: `daily-supplier-payments-${date}`,
      });
      toast.success('تم تصدير سداد الموردين');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تصدير السداد');
    }
  };

  const printStatement = () => {
    if (!data) return;
    try {
      exportToPdf({
        title: 'كشف مشتريات اليوم',
        subtitle: `${formatDay(date)} — ${plain(data.summary.count)} فاتورة — الإجمالي ${fmt(data.summary.total)}`,
        columns: [
          { key: 'invoiceNumber', label: 'الفاتورة' },
          { key: 'time', label: 'الوقت' },
          { key: 'supplierName', label: 'المورد' },
          { key: 'supplierInvoiceNumber', label: 'فاتورة المورد' },
          { key: 'itemsCount', label: 'الأصناف' },
          { key: 'total', label: 'الإجمالي' },
          { key: 'paid', label: 'المدفوع' },
          { key: 'remaining', label: 'المتبقي' },
          { key: 'status', label: 'الحالة' },
        ],
        rows: filteredRows.map((row) => ({
          invoiceNumber: row.invoiceNumber,
          time: timeOf(row.createdAt),
          supplierName: row.supplierName || '—',
          supplierInvoiceNumber: row.supplierInvoiceNumber || '—',
          itemsCount: plain(row.itemsCount),
          total: fmt(row.total),
          paid: fmt(row.paid),
          remaining: fmt(row.remaining),
          status: PAY_LABEL[row.paymentStatus] || row.paymentStatus,
        })),
        fileName: `daily-purchases-${date}`,
      });
      toast.success('تم تجهيز كشف الطباعة');
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تجهيز الطباعة');
    }
  };

  const printInvoice = (row: DailyPurchaseRow) => {
    try {
      const html = buildPurchaseInvoiceHtml(row, itemsByPurchase.get(row.id) || [], currency, settings?.showroomName || 'CeramiSys ERP');
      printHtml(html);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر طباعة الفاتورة');
    }
  };

  const tabCounts: Record<TabKey, number> = {
    invoices: filteredRows.length,
    items: filteredItems.length,
    suppliers: supplierStats.length,
    payments: filteredPayments.length,
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-base font-black text-slate-900 dark:text-white">مشتريات اليوم</h1>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {date === todayDate ? 'اليوم' : formatDay(date)}
                </span>
                <span className="hidden rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300 sm:inline-flex">
                  {plain(data?.summary.count || 0)} فاتورة توريد
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">متابعة فواتير التوريد والسداد والموردين والأصناف الواردة خلال اليوم</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              >
                <Plus className="h-4 w-4" /> فاتورة توريد
              </button>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setDate(todayDate)}
                aria-pressed={date === todayDate}
                className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${date === todayDate ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => setDate(shiftDay(todayDate, -1))}
                aria-pressed={date === shiftDay(todayDate, -1)}
                className={`min-h-8 rounded-md px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${date === shiftDay(todayDate, -1) ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                أمس
              </button>
              <label className="relative flex min-h-8 items-center gap-1.5 border-r border-slate-200 px-2 dark:border-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <span className="sr-only">اختيار تاريخ المشتريات</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value || todayDate)}
                  aria-label="اختيار تاريخ المشتريات"
                  className="w-[128px] bg-transparent text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-200"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={load}
              aria-label="تحديث بيانات المشتريات"
              title="تحديث"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={printStatement}
              disabled={!data}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" /> طباعة
            </button>
            <button
              type="button"
              onClick={exportInvoices}
              disabled={!data}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" /> تصدير Excel
            </button>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-screen-2xl flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={() => navigate('/purchases')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
            <ExternalLink className="h-3.5 w-3.5" /> كل فواتير التوريد
          </button>
          <button type="button" onClick={() => navigate('/suppliers')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
            <Users className="h-3.5 w-3.5" /> الموردون
          </button>
          <button type="button" onClick={() => navigate('/purchases/returns')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-orange-300">
            <ReceiptText className="h-3.5 w-3.5" /> مرتجعات التوريد
          </button>
          <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className={`inline-flex h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} />
            {loading ? 'جارٍ التحديث…' : 'متصل بقاعدة البيانات المحلية'}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-screen-2xl space-y-4 p-4 sm:space-y-5 sm:p-6">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={load} className="rounded-md px-2 py-1 font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                إعادة المحاولة
              </button>
            </div>
          )}

          {loading && !data ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white text-center dark:border-slate-700 dark:bg-slate-900" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">جارٍ تحميل مشتريات اليوم…</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">يتم تجميع الفواتير والأصناف والسداد من قاعدة البيانات</p>
            </div>
          ) : !data ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-center dark:border-slate-700 dark:bg-slate-900">
              <AlertTriangle className="h-7 w-7 text-rose-500" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">تعذر تحميل مشتريات اليوم</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">تحقق من صلاحياتك ومن الاتصال بقاعدة البيانات ثم أعد المحاولة.</p>
              <button type="button" onClick={load} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">إعادة المحاولة</button>
            </div>
          ) : (
            <>
              {(data.summary.remaining > 0 || filteredRows.some((row) => !row.supplierInvoiceNumber)) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.summary.remaining > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="flex-1">
                        يوجد <b>{fmt(data.summary.remaining)}</b> مستحقة للموردين على فواتير اليوم، منها <b>{fmt(data.summary.creditTotal)}</b> فواتير آجلة أو جزئية.
                      </div>
                      {canPay && (
                        <button type="button" onClick={() => setStatus('UNPAID')} className="shrink-0 rounded-md border border-amber-300 px-2 py-1 font-bold underline-offset-2 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50">
                          عرض الآجل
                        </button>
                      )}
                    </div>
                  )}
                  {filteredRows.some((row) => !row.supplierInvoiceNumber) && (
                    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <b>{plain(filteredRows.filter((row) => !row.supplierInvoiceNumber).length)}</b> فاتورة توريد بدون رقم فاتورة المورد. إضافة الرقم تُسهّل المطابقة مع كشوف الموردين.
                      </span>
                    </div>
                  )}
                </div>
              )}

              <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4" aria-label="تصفية المشتريات">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1 lg:max-w-sm">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="ابحث برقم الفاتورة أو المورد أو الهاتف أو الملاحظات…"
                        aria-label="البحث في مشتريات اليوم"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      {search && (
                        <button type="button" onClick={() => setSearch('')} aria-label="مسح البحث" className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="تصفية حسب حالة السداد">
                      {[
                        { key: 'ALL', label: 'الكل' },
                        { key: 'PAID', label: 'مدفوعة' },
                        { key: 'PARTIAL', label: 'جزئيًا' },
                        { key: 'UNPAID', label: 'آجلة' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setStatus(option.key)}
                          aria-pressed={status === option.key}
                          className={`min-h-8 rounded-md px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${status === option.key ? 'bg-white text-orange-700 shadow-sm dark:bg-slate-700 dark:text-orange-300' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700'}`}
                        >
                          {option.label} <span className="tabular-nums text-slate-400">({plain(statusCounts[option.key] || 0)})</span>
                        </button>
                      ))}
                    </div>

                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 lg:mr-auto" aria-live="polite">
                      {loading ? 'جارٍ التحديث…' : `${plain(filteredRows.length)} من ${plain(rows.length)} فاتورة · ${fmt(filteredRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0))}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المورد</span>
                      <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <option value="ALL">كل الموردين</option>
                        {suppliersOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المخزن</span>
                      <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <option value="ALL">كل المخازن</option>
                        {warehouses.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">طريقة السداد</span>
                      <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <option value="ALL">كل الطرق</option>
                        {methods.map((method) => <option key={method} value={method}>{PAY_LABEL[method] || method}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">من مبلغ</span>
                      <input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="0" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إلى مبلغ</span>
                      <input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="بلا حد" className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
                    </label>
                    <div className="flex items-end">
                      <button type="button" onClick={clearFilters} disabled={!hasFilters} className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                        مسح الفلاتر
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700 sm:px-4" role="tablist" aria-label="أقسام مشتريات اليوم">
                  <div className="flex flex-wrap items-center gap-1">
                    {([
                      { key: 'invoices', label: 'فواتير التوريد', icon: ReceiptText },
                      { key: 'items', label: 'الأصناف', icon: Package },
                      { key: 'suppliers', label: 'الموردون', icon: Truck },
                      { key: 'payments', label: 'سداد الموردين', icon: Wallet },
                    ] as { key: TabKey; label: string; icon: React.ElementType }[]).map((entry) => {
                      const TabIcon = entry.icon;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          role="tab"
                          aria-selected={tab === entry.key}
                          onClick={() => setTab(entry.key)}
                          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${tab === entry.key ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                        >
                          <TabIcon className="h-3.5 w-3.5" />
                          {entry.label}
                          <span className={`rounded px-1.5 py-0.5 text-[9px] tabular-nums ${tab === entry.key ? 'bg-white/15 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800'}`}>{plain(tabCounts[entry.key])}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {tab === 'invoices' && (
                      <button type="button" onClick={exportInvoices} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <Download className="h-3.5 w-3.5" /> Excel
                      </button>
                    )}
                    {tab === 'items' && (
                      <button type="button" onClick={exportItems} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <Download className="h-3.5 w-3.5" /> Excel
                      </button>
                    )}
                    {tab === 'suppliers' && (
                      <button type="button" onClick={exportSuppliers} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <Download className="h-3.5 w-3.5" /> Excel
                      </button>
                    )}
                    {tab === 'payments' && (
                      <button type="button" onClick={exportPayments} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <Download className="h-3.5 w-3.5" /> Excel
                      </button>
                    )}
                  </div>
                </div>

                {tab === 'invoices' && (
                  <div role="tabpanel" aria-label="فواتير التوريد">
                    {filteredRows.length === 0 ? (
                      <div className="flex flex-col items-center px-4 py-14 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
                          <ShoppingBag className="h-5 w-5" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{rows.length === 0 ? 'لا توجد مشتريات مسجلة في هذا اليوم' : 'لا توجد فواتير تطابق البحث'}</p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{rows.length === 0 ? 'ستظهر فواتير التوريد هنا فور تسجيلها، مع الأصناف وحالة السداد.' : 'غيّر كلمات البحث أو الفلاتر لعرض نتائج أخرى.'}</p>
                        {hasFilters ? (
                          <button type="button" onClick={clearFilters} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">مسح الفلاتر</button>
                        ) : canCreate ? (
                          <button type="button" onClick={() => setQuickOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-700">
                            <Plus className="h-4 w-4" /> تسجيل أول فاتورة توريد
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 xl:hidden">
                          {pageRows.map((row) => {
                            const lines = itemsByPurchase.get(row.id) || [];
                            const isOpen = expanded === row.id;
                            return (
                              <article key={row.id} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <button type="button" onClick={() => setExpanded(isOpen ? null : row.id)} className="flex items-center gap-1 font-mono text-sm font-bold text-orange-700 dark:text-orange-300">
                                      {row.invoiceNumber}
                                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{row.supplierName || '—'}</p>
                                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{timeOf(row.createdAt)} · {plain(row.itemsCount)} أصناف · {row.warehouseName || '—'}</p>
                                  </div>
                                  {badge(row.paymentStatus)}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الإجمالي</p><p className="mt-0.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</p></div>
                                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المدفوع</p><p className="mt-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</p></div>
                                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">المتبقي</p><p className={`mt-0.5 font-bold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</p></div>
                                  <div><p className="text-[10px] text-slate-500 dark:text-slate-400">الضريبة · الشحن</p><p className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{fmt(row.tax)} · {fmt(row.shippingCost)}</p></div>
                                </div>
                                {row.supplierInvoiceNumber && <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">فاتورة المورد: <span className="font-mono">{row.supplierInvoiceNumber}</span></p>}
                                {isOpen && (
                                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                    <table className="w-full min-w-[420px] text-right text-[11px]">
                                      <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                                        <tr>{['الصنف', 'الكمية', 'الكراتين', 'تكلفة الوحدة', 'الإجمالي'].map((heading) => <th key={heading} className="px-2 py-2 font-bold">{heading}</th>)}</tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {lines.map((line) => (
                                          <tr key={line.id}>
                                            <td className="px-2 py-2 font-semibold text-slate-800 dark:text-slate-200">{line.productName}<div className="font-mono text-[9px] text-slate-400">{line.sku}</div></td>
                                            <td className="px-2 py-2 tabular-nums">{formatProductQuantity(Number(line.quantityM2), line)}</td>
                                            <td className="px-2 py-2 tabular-nums">{plain(line.boxesCount)}</td>
                                            <td className="px-2 py-2 tabular-nums">{fmt(line.unitCost)}</td>
                                            <td className="px-2 py-2 font-bold tabular-nums">{fmt(line.totalCost)}</td>
                                          </tr>
                                        ))}
                                        {lines.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-400">لا توجد أصناف مسجلة</td></tr>}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                                  {canPay && row.remaining > 0 && (
                                    <button type="button" onClick={() => setPaymentTarget({ kind: 'purchase', id: row.id, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining })} aria-label={`سداد للمورد عن الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
                                      <HandCoins className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => setDetailsTarget({ kind: 'purchase', id: row.id })} aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => printInvoice(row)} aria-label={`طباعة الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                    <Printer className="h-4 w-4" />
                                  </button>
                                  {canDelete && (
                                    <button type="button" onClick={() => setVoidTarget({ kind: 'purchase', id: row.id, name: row.invoiceNumber })} aria-label={`حذف الفاتورة ${row.invoiceNumber}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>

                        <div className="hidden overflow-x-auto xl:block">
                          <table className="w-full min-w-[1220px] text-right text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/70">
                              <tr>
                                <th scope="col" className="w-8 px-2 py-3" aria-label="توسيع" />
                                {([
                                  ['invoiceNumber', 'الفاتورة'],
                                  ['createdAt', 'الوقت'],
                                  ['supplierName', 'المورد'],
                                ] as [SortKey, string][]).map(([key, label]) => (
                                  <th key={key} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">
                                    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                                      {label} <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(key)}</span>
                                    </button>
                                  </th>
                                ))}
                                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">فاتورة المورد</th>
                                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">المخزن</th>
                                {([
                                  ['itemsCount', 'الأصناف'],
                                  ['total', 'الإجمالي'],
                                  ['paid', 'المدفوع'],
                                  ['remaining', 'المتبقي'],
                                ] as [SortKey, string][]).map(([key, label]) => (
                                  <th key={key} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">
                                    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
                                      {label} <ArrowUpDown className="h-3 w-3" /> <span aria-hidden="true">{sortIndicator(key)}</span>
                                    </button>
                                  </th>
                                ))}
                                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">الحالة</th>
                                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">الضريبة / الشحن</th>
                                <th scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">إجراءات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {pageRows.map((row) => {
                                const lines = itemsByPurchase.get(row.id) || [];
                                const isOpen = expanded === row.id;
                                return (
                                  <React.Fragment key={row.id}>
                                    <tr className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${isOpen ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''}`}>
                                      <td className="px-2 py-2">
                                        <button
                                          type="button"
                                          onClick={() => setExpanded(isOpen ? null : row.id)}
                                          aria-expanded={isOpen}
                                          aria-label={`${isOpen ? 'طي' : 'عرض'} أصناف الفاتورة ${row.invoiceNumber}`}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                        >
                                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-orange-700 dark:text-orange-300">{row.invoiceNumber}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-slate-500 dark:text-slate-400">{timeOf(row.createdAt)}</td>
                                      <td className="px-3 py-3">
                                        <div className="font-semibold text-slate-900 dark:text-slate-100">{row.supplierName || '—'}</div>
                                        {row.supplierPhone && <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400" dir="ltr">{row.supplierPhone}</div>}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{row.supplierInvoiceNumber || <span className="text-amber-600 dark:text-amber-400">—</span>}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300">{row.warehouseName || '—'}</td>
                                      <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{plain(row.itemsCount)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(row.total)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.paid)}</td>
                                      <td className={`whitespace-nowrap px-3 py-3 font-semibold tabular-nums ${row.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>{fmt(row.remaining)}</td>
                                      <td className="px-3 py-3">{badge(row.paymentStatus)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-slate-300">
                                        <span className="font-semibold">{fmt(row.tax)}</span>
                                        <span className="mx-1 text-slate-400">/</span>
                                        <span>{fmt(row.shippingCost)}</span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                          {canPay && row.remaining > 0 && (
                                            <button type="button" title="سداد للمورد" aria-label={`سداد للمورد عن الفاتورة ${row.invoiceNumber}`} onClick={() => setPaymentTarget({ kind: 'purchase', id: row.id, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining })} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
                                              <HandCoins className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          <button type="button" title="التفاصيل" aria-label={`تفاصيل الفاتورة ${row.invoiceNumber}`} onClick={() => setDetailsTarget({ kind: 'purchase', id: row.id })} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950">
                                            <Eye className="h-3.5 w-3.5" />
                                          </button>
                                          <button type="button" title="طباعة" aria-label={`طباعة الفاتورة ${row.invoiceNumber}`} onClick={() => printInvoice(row)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                            <Printer className="h-3.5 w-3.5" />
                                          </button>
                                          {canDelete && (
                                            <button type="button" title="حذف" aria-label={`حذف الفاتورة ${row.invoiceNumber}`} onClick={() => setVoidTarget({ kind: 'purchase', id: row.id, name: row.invoiceNumber })} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {isOpen && (
                                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                                        <td colSpan={13} className="px-4 py-3">
                                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                              <table className="w-full min-w-[600px] text-right text-[11px]">
                                                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                  <tr>{['الصنف', 'الكود', 'الفرز', 'الكمية', 'الكراتين', 'تكلفة الوحدة', 'الإجمالي'].map((heading) => <th key={heading} className="px-3 py-2 font-bold">{heading}</th>)}</tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                  {lines.map((line) => (
                                                    <tr key={line.id}>
                                                      <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{line.productName}</td>
                                                      <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{line.sku || '—'}</td>
                                                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{line.grade || '—'}</td>
                                                      <td className="px-3 py-2 tabular-nums">{plain(line.quantityM2)}</td>
                                                      <td className="px-3 py-2 tabular-nums">{plain(line.boxesCount)}</td>
                                                      <td className="px-3 py-2 tabular-nums">{fmt(line.unitCost)}</td>
                                                      <td className="px-3 py-2 font-bold tabular-nums">{fmt(line.totalCost)}</td>
                                                    </tr>
                                                  ))}
                                                  {lines.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">لا توجد أصناف مسجلة لهذه الفاتورة</td></tr>}
                                                </tbody>
                                              </table>
                                            </div>
                                            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">قبل الخصم</span><span className="font-semibold tabular-nums">{fmt(row.subtotal)}</span></div>
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الخصم</span><span className="font-semibold tabular-nums">{fmt(row.discount)}</span></div>
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الضريبة</span><span className="font-semibold tabular-nums">{fmt(row.tax)}</span></div>
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">الشحن</span><span className="font-semibold tabular-nums">{fmt(row.shippingCost)}</span></div>
                                              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs dark:border-slate-700"><span className="font-bold">الإجمالي</span><span className="font-black tabular-nums">{fmt(row.total)}</span></div>
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">طريقة السداد</span><span className="font-semibold">{PAY_LABEL[row.paymentType] || row.paymentType}</span></div>
                                              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">بواسطة</span><span className="font-semibold">{row.createdByName || '—'}</span></div>
                                              {row.notes && <p className="border-t border-slate-200 pt-1.5 text-slate-500 dark:border-slate-700 dark:text-slate-400">{row.notes}</p>}
                                              <button type="button" onClick={() => printInvoice(row)} className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                                <Printer className="h-3 w-3" /> طباعة الفاتورة
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-slate-200 px-3 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            عرض {plain(filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1)}–{plain(Math.min(safePage * pageSize, filteredRows.length))} من {plain(filteredRows.length)} فاتورة
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              لكل صفحة
                              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                              </select>
                            </label>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} aria-label="الصفحة السابقة" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                <ChevronLeft className="h-4 w-4 rotate-180" />
                              </button>
                              <span className="min-w-[70px] text-center text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">صفحة {plain(safePage)} من {plain(pageCount)}</span>
                              <button type="button" onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage >= pageCount} aria-label="الصفحة التالية" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'items' && (
                  <div role="tabpanel" aria-label="أصناف التوريد">
                    {filteredItems.length === 0 ? (
                      <div className="flex flex-col items-center px-4 py-14 text-center">
                        <Package className="h-6 w-6 text-slate-400" />
                        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا توجد أصناف مطابقة</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">جرّب تعديل البحث أو الفلاتر، أو سجّل فاتورة توريد جديدة.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2 text-[11px] dark:border-slate-800">
                          <span className="font-bold text-slate-700 dark:text-slate-200">{plain(filteredItems.length)} سطر صنف</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">{[...filteredItems.reduce((totals, item) => {
                            const unit = getProductUnitLabel(item);
                            totals.set(unit, (totals.get(unit) || 0) + (Number(item.quantityM2) || 0));
                            return totals;
                          }, new Map<string, number>())].map(([unit, quantity]) => `${plain(quantity)} ${unit}`).join('، ') || '0'}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">{fmt(filteredItems.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0))}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">{plain(filteredItems.reduce((sum, item) => sum + (Number(item.boxesCount) || 0), 0))} كرتونة</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[860px] text-right text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/70">
                              <tr>{['الصنف', 'الكود', 'الفاتورة', 'المورد', 'الكمية', 'الكراتين', 'تكلفة الوحدة', 'الإجمالي', 'النسبة'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {filteredItems.map((item) => {
                                const grand = filteredItems.reduce((sum, entry) => sum + (Number(entry.totalCost) || 0), 0);
                                const share = grand > 0 ? (Number(item.totalCost) / grand) * 100 : 0;
                                return (
                                  <tr key={item.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                                    <td className="px-3 py-2.5">
                                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.productName}</div>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.grade}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{item.sku || '—'}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <button type="button" onClick={() => setDetailsTarget({ kind: 'purchase', id: item.purchaseId })} className="font-mono font-bold text-orange-700 hover:underline dark:text-orange-300">
                                        {item.invoiceNumber}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{item.supplierName || '—'}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{formatProductQuantity(Number(item.quantityM2), item)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{plain(item.boxesCount)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.unitCost)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmt(item.totalCost)}</td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex min-w-[80px] items-center gap-1.5">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(share, 2)}%` }} />
                                        </div>
                                        <span className="w-9 text-left text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{share.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'suppliers' && (
                  <div role="tabpanel" aria-label="موردون اليوم">
                    {supplierStats.length === 0 ? (
                      <div className="flex flex-col items-center px-4 py-14 text-center">
                        <Truck className="h-6 w-6 text-slate-400" />
                        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا يوجد موردون في النطاق المحدد</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">سيظهر الموردون تلقائيًا عند تسجيل فواتير التوريد.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-3">
                          <div className="rounded-lg bg-orange-50 px-3 py-2 dark:bg-orange-950/40">
                            <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-300">إجمالي مشتريات النطاق</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-orange-800 dark:text-orange-200">{fmt(supplierStats.reduce((sum, row) => sum + row.total, 0))}</p>
                          </div>
                          <div className="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
                            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">مسدد منهم</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-emerald-800 dark:text-emerald-200">{fmt(supplierStats.reduce((sum, row) => sum + row.paid, 0))}</p>
                          </div>
                          <div className="rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-950/40">
                            <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">متبقي آجل</p>
                            <p className="mt-1 text-sm font-black tabular-nums text-rose-800 dark:text-rose-200">{fmt(supplierStats.reduce((sum, row) => sum + row.remaining, 0))}</p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[900px] text-right text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/70">
                              <tr>{['المورد', 'الهاتف', 'الفواتير', 'الأصناف', 'إجمالي التوريد', 'المدفوع', 'المتبقي', 'آخر توريد', 'الحصة'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {supplierStats.map((supplier) => {
                                const grand = supplierStats.reduce((sum, row) => sum + row.total, 0);
                                const share = grand > 0 ? (supplier.total / grand) * 100 : 0;
                                return (
                                  <tr key={supplier.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                                    <td className="px-3 py-2.5">
                                      <button type="button" onClick={() => navigate(supplier.id ? `/suppliers/${supplier.id}` : '/suppliers')} className="font-bold text-slate-900 hover:text-orange-700 dark:text-slate-100 dark:hover:text-orange-300">{supplier.name}</button>
                                      {supplier.unpaid > 0 && <div className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400">{plain(supplier.unpaid)} فاتورة غير مسددة</div>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400" dir="ltr">{supplier.phone || '—'}</td>
                                    <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{plain(supplier.invoices)}</td>
                                    <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{plain(supplier.itemsCount)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(supplier.total)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(supplier.paid)}</td>
                                    <td className={`whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums ${supplier.remaining > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400'}`}>{fmt(supplier.remaining)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400">{timeOf(supplier.lastTime)}</td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex min-w-[80px] items-center gap-1.5">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(share, 2)}%` }} />
                                        </div>
                                        <span className="w-9 text-left text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{share.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'payments' && (
                  <div role="tabpanel" aria-label="سداد الموردين">
                    <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-4">
                      <MiniStat label="إجمالي السداد" value={fmt(filteredPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
                      <MiniStat label="عدد السندات" value={plain(filteredPayments.length)} />
                      <MiniStat label="نقدي" value={fmt(filteredPayments.filter((payment) => payment.paymentType === 'CASH').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
                      <MiniStat label="بنكي / بطاقة" value={fmt(filteredPayments.filter((payment) => payment.paymentType !== 'CASH').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))} />
                    </div>
                    {filteredPayments.length === 0 ? (
                      <div className="flex flex-col items-center px-4 py-14 text-center">
                        <Wallet className="h-6 w-6 text-slate-400" />
                        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">لا توجد سندات سداد في هذا اليوم</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">سجّل دفعة من زر «سداد للمورد» بجانب أي فاتورة غير مسددة.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-right text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/70">
                            <tr>{['السند', 'المورد', 'الفواتير', 'المبلغ', 'طريقة السداد', 'بواسطة', 'ملاحظات'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3 font-bold text-slate-500 dark:text-slate-400">{heading}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredPayments.map((payment) => (
                              <tr key={payment.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                                <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-emerald-700 dark:text-emerald-300">{payment.receiptNumber}</td>
                                <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{payment.supplierName || '—'}</td>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{payment.invoiceNumbers || '—'}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-black tabular-nums text-slate-900 dark:text-slate-100">{fmt(payment.amount)}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${METHOD_STYLE[payment.paymentType]?.text || 'text-slate-600 dark:text-slate-300'} bg-slate-100 dark:bg-slate-800`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${METHOD_STYLE[payment.paymentType]?.dot || 'bg-slate-400'}`} />
                                    {PAY_LABEL[payment.paymentType] || payment.paymentType}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{payment.performedByName || '—'}</td>
                                <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-500 dark:text-slate-400" title={payment.notes || ''}>{payment.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  جميع المبالغ بعملة {currency} — البيانات محدّثة لحظيًا من قاعدة البيانات المحلية
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5" />
                  {formatDay(date)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {quickOpen && <QuickPurchaseModal onClose={() => setQuickOpen(false)} onSaved={load} />}
      {paymentTarget && <PaymentModal target={paymentTarget} onClose={() => setPaymentTarget(null)} onSaved={load} />}
      {detailsTarget && <DetailsModal kind="purchase" id={detailsTarget.id} onClose={() => setDetailsTarget(null)} onChanged={load} />}
      {voidTarget && <VoidModal target={voidTarget} onClose={() => setVoidTarget(null)} onDeleted={load} />}
    </div>
  );
};
