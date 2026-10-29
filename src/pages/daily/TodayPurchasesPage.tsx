import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CircleDollarSign, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DailyOperationsService,
  type DailyPurchaseResult,
  type DailyPurchaseRow,
} from '../../services/DailyOperationsService';
import { SettingsService } from '../../services/SettingsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import type { PaymentTarget } from '../../components/daily/DailyModals';
import { useToast } from '../../components/ui/Toast';
import { PurchasesHeader } from './today-purchases/PurchasesHeader';
import { PurchaseAlerts } from './today-purchases/PurchaseAlerts';
import { PurchaseFiltersSection } from './today-purchases/PurchaseFiltersSection';
import { PurchasesTabsBar } from './today-purchases/PurchasesTabsBar';
import { InvoicesPanel } from './today-purchases/InvoicesPanel';
import { ItemsPanel } from './today-purchases/ItemsPanel';
import { SuppliersPanel } from './today-purchases/SuppliersPanel';
import { PaymentsPanel } from './today-purchases/PaymentsPanel';
import { PurchasesErrorAlert, PurchasesLoadingState, PurchasesUnavailableState } from './today-purchases/PurchaseStates';
import { PurchaseModals } from './today-purchases/PurchaseModals';
import {
  buildSupplierStats, filterPurchaseRows, filterItemsByPurchaseIds, filterSupplierPayments,
  formatDay, groupItemsByPurchase, itemsInScope, sortPurchaseRows,
} from './today-purchases/helpers';
import {
  exportPurchaseInvoices, exportPurchaseItems, exportPurchaseSuppliers, exportSupplierPayments,
  printPurchaseStatement, printPurchaseInvoice, type PurchaseExportContext,
} from './today-purchases/exports';
import type { PurchaseDetailsTarget, PurchaseFilters, PurchaseVoidTarget, SortKey, TabKey } from './today-purchases/types';

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
  const [detailsTarget, setDetailsTarget] = useState<PurchaseDetailsTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<PurchaseVoidTarget | null>(null);

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

  const filters: PurchaseFilters = { search, status, supplierId, warehouse, paymentType, minAmount, maxAmount };

  const withinAmount = (row: DailyPurchaseRow) => {
    const total = Number(row.total) || 0;
    if (minAmount.trim() && total < Number(minAmount)) return false;
    if (maxAmount.trim() && total > Number(maxAmount)) return false;
    return true;
  };

  const filteredRows = useMemo(() => {
    const list = filterPurchaseRows(rows, { search, status, supplierId, warehouse, paymentType, minAmount, maxAmount });
    return sortPurchaseRows(list, sortKey, sortDir);
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
  const scopedItems = useMemo(() => itemsInScope(items, scopedIds), [items, scopedIds]);

  const itemsByPurchase = useMemo(() => groupItemsByPurchase(items), [items]);

  const filteredItems = useMemo(
    () => filterItemsByPurchaseIds(items, new Set(filteredRows.map((row) => row.id)), search),
    [items, filteredRows, search],
  );

  const filteredPayments = useMemo(
    () => filterSupplierPayments(payments, { search, supplierId, paymentType }),
    [payments, search, supplierId, paymentType],
  );

  const supplierStats = useMemo(() => buildSupplierStats(filteredRows, scopedItems), [filteredRows, scopedItems]);

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

  const exportContext: PurchaseExportContext = {
    date, data, rows: filteredRows, items: filteredItems, supplierStats, payments: filteredPayments, plain, fmt, toast,
  };

  const exportInvoices = () => exportPurchaseInvoices(exportContext);
  const exportItems = () => exportPurchaseItems(exportContext);
  const exportSuppliers = () => exportPurchaseSuppliers(exportContext);
  const exportPayments = () => exportSupplierPayments(exportContext);
  const printStatement = () => printPurchaseStatement(exportContext);

  const printInvoice = (row: DailyPurchaseRow) => {
    printPurchaseInvoice({
      row,
      items: itemsByPurchase.get(row.id) || [],
      currency,
      storeName: settings?.showroomName || 'سيراميسيس',
      toast,
    });
  };

  const tabCounts: Record<TabKey, number> = {
    invoices: filteredRows.length,
    items: filteredItems.length,
    suppliers: supplierStats.length,
    payments: filteredPayments.length,
  };

  const toggleExpanded = (id: string) => setExpanded((current) => (current === id ? null : id));

  const openPayment = (row: DailyPurchaseRow) => setPaymentTarget({
    kind: 'purchase', id: row.id, name: `${row.invoiceNumber} — ${row.supplierName || ''}`, remaining: row.remaining,
  });
  const openDetails = (id: string) => setDetailsTarget({ kind: 'purchase', id });
  const openVoid = (row: DailyPurchaseRow) => setVoidTarget({ kind: 'purchase', id: row.id, name: row.invoiceNumber });

  const changeFilters = (patch: Partial<PurchaseFilters>) => {
    if (patch.search !== undefined) setSearch(patch.search);
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.supplierId !== undefined) setSupplierId(patch.supplierId);
    if (patch.warehouse !== undefined) setWarehouse(patch.warehouse);
    if (patch.paymentType !== undefined) setPaymentType(patch.paymentType);
    if (patch.minAmount !== undefined) setMinAmount(patch.minAmount);
    if (patch.maxAmount !== undefined) setMaxAmount(patch.maxAmount);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" dir="rtl">
      <PurchasesHeader
        date={date}
        todayDate={todayDate}
        invoiceCountLabel={plain(data?.summary.count || 0)}
        hasData={Boolean(data)}
        canCreate={canCreate}
        loading={loading}
        onSelectDate={setDate}
        onRefresh={load}
        onPrint={printStatement}
        onExport={exportInvoices}
        onOpenQuickCreate={() => setQuickOpen(true)}
        onNavigate={navigate}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-screen-2xl space-y-4 p-4 sm:space-y-5 sm:p-6">
          {error && <PurchasesErrorAlert message={error} onRetry={load} />}

          {loading && !data ? (
            <PurchasesLoadingState />
          ) : !data ? (
            <PurchasesUnavailableState onRetry={load} />
          ) : (
            <>
              <PurchaseAlerts
                remaining={data.summary.remaining}
                creditTotal={data.summary.creditTotal}
                missingSupplierInvoiceCount={filteredRows.filter((row) => !row.supplierInvoiceNumber).length}
                canPay={canPay}
                onShowUnpaid={() => setStatus('UNPAID')}
                plain={plain}
                fmt={fmt}
              />

              <PurchaseFiltersSection
                filters={filters}
                onChange={changeFilters}
                onClearFilters={clearFilters}
                hasFilters={hasFilters}
                statusCounts={statusCounts}
                suppliers={suppliersOptions}
                warehouses={warehouses}
                methods={methods}
                loading={loading}
                rowsCount={rows.length}
                filteredCount={filteredRows.length}
                filteredTotal={filteredRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0)}
                plain={plain}
                fmt={fmt}
              />

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <PurchasesTabsBar
                  tab={tab}
                  tabCounts={tabCounts}
                  onTabChange={setTab}
                  onExportInvoices={exportInvoices}
                  onExportItems={exportItems}
                  onExportSuppliers={exportSuppliers}
                  onExportPayments={exportPayments}
                  plain={plain}
                />

                {tab === 'invoices' && (
                  <InvoicesPanel
                    rows={rows}
                    pageRows={pageRows}
                    filteredCount={filteredRows.length}
                    itemsByPurchase={itemsByPurchase}
                    expanded={expanded}
                    onToggleExpanded={toggleExpanded}
                    hasFilters={hasFilters}
                    canCreate={canCreate}
                    canPay={canPay}
                    canDelete={canDelete}
                    onClearFilters={clearFilters}
                    onOpenQuickCreate={() => setQuickOpen(true)}
                    onPay={openPayment}
                    onDetails={openDetails}
                    onPrint={printInvoice}
                    onDelete={openVoid}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    page={safePage}
                    pageCount={pageCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    fmt={fmt}
                    plain={plain}
                  />
                )}

                {tab === 'items' && (
                  <ItemsPanel items={filteredItems} onDetails={openDetails} fmt={fmt} plain={plain} />
                )}

                {tab === 'suppliers' && (
                  <SuppliersPanel supplierStats={supplierStats} onNavigate={navigate} fmt={fmt} plain={plain} />
                )}

                {tab === 'payments' && (
                  <PaymentsPanel payments={filteredPayments} fmt={fmt} plain={plain} />
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

      <PurchaseModals
        quickOpen={quickOpen}
        onCloseQuickOpen={() => setQuickOpen(false)}
        paymentTarget={paymentTarget}
        onClosePayment={() => setPaymentTarget(null)}
        detailsTarget={detailsTarget}
        onCloseDetails={() => setDetailsTarget(null)}
        voidTarget={voidTarget}
        onCloseVoid={() => setVoidTarget(null)}
        onSaved={load}
      />
    </div>
  );
};
