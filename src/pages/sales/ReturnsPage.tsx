import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RotateCcw, Plus, Search, Calendar, Printer, Loader2, X, AlertTriangle, Eye,
  RefreshCw, FileSpreadsheet, FileDown, ChevronLeft, ChevronRight, Banknote,
  Wallet, TrendingDown, FileText, CheckCircle2, PackageX,
} from 'lucide-react';
import { SalesService, ReturnableItem, ReturnStats } from '../../services/SalesService';
import { ProductService } from '../../services/ProductService';
import { PrintService } from '../../services/PrintService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { SalesInvoice, SalesReturn, SalesReturnItem, Product } from '../../types';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { formatProductQuantity } from '../../utils/productUnits';
import {
  convertQuantity, fromBaseQuantity, getSellableUnits, getUomLabel, isWholeUnit, pricePerUnit,
} from '../../utils/uom';
import { computeReturnImpact, round2 } from '../../services/financials';

const PAGE_SIZE = 15;

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

const REFUND_METHODS = [
  { value: 'CASH', label: 'استرداد نقدي من الخزينة' },
  { value: 'CARD', label: 'استرداد على البطاقة' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي للعميل' },
  { value: 'BALANCE', label: 'خصم من رصيد العميل (دائن)' },
] as const;

type RefundMethod = typeof REFUND_METHODS[number]['value'];

const REFUND_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  BALANCE: 'رصيد العميل',
};

const RETURN_REASONS = [
  'كسر أثناء النقل',
  'عيب صناعة',
  'مقاس غير مناسب',
  'عميل غيّر رأيه',
  'خطأ في الطلب',
  'زيادة كمية',
];

type ReturnRow = SalesReturn & { customerName: string; invoiceNumber: string };
type ReturnDetail = SalesReturn & { items: SalesReturnItem[]; customerName?: string; invoiceNumber?: string };
type ReturnLine = ReturnableItem & { quantityM2: number; reason: string; entryUnit: string };

export const ReturnsPage: React.FC = () => {
  const location = useLocation() as { state?: { invoiceId?: string } };
  const service = useMemo(() => new SalesService(), []);
  const productService = useMemo(() => new ProductService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const canRefund = PermissionService.can(AuthService.getCurrentUser(), 'sales.refund');

  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle?: string;
    fileName: string;
    html: string;
    excel?: () => void;
  } | null>(null);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [stats, setStats] = useState<ReturnStats | null>(null);
  const [invoices, setInvoices] = useState<(SalesInvoice & { customerName?: string })[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceInfo, setInvoiceInfo] = useState<(SalesInvoice & { customerName?: string }) | null>(null);
  const [refundCash, setRefundCash] = useState(true);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [topReasons, setTopReasons] = useState<{ reason: string; count: number; amount: number }[]>([]);

  // Exchange (swap) state
  const [exchangeMode, setExchangeMode] = useState(false);
  const [newItems, setNewItems] = useState<{ productId: string; productName: string; quantityM2: number; unitPrice: number; boxesCount: number }[]>([]);
  const [newSearch, setNewSearch] = useState('');
  const [newResults, setNewResults] = useState<Product[]>([]);
  const [newQty, setNewQty] = useState<number>(1);
  const [selectedNewProduct, setSelectedNewProduct] = useState<Product | null>(null);

  const [detail, setDetail] = useState<ReturnDetail | null>(null);

  useEffect(() => {
    if (!exchangeMode || !newSearch.trim()) { setNewResults([]); return; }
    const r = productService.getAllProducts(newSearch.trim());
    setNewResults(r.slice(0, 8));
  }, [exchangeMode, newSearch, productService]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setReturns(service.getReturns(search, dateFrom || undefined, dateTo || undefined));
      setStats(service.getReturnsStats());
      setTopReasons(service.getTopReturnReasons(4));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل المرتجعات.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, service]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(returns.length / PAGE_SIZE));
  const pageItems = returns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pickInvoice = useCallback((id: string) => {
    setInvoiceId(id);
    if (!id) { setLines([]); setInvoiceInfo(null); return; }
    const inv = service.getInvoiceById(id);
    setInvoiceInfo(inv);
    if (!inv) { setLines([]); return; }
    const returnable = service.getReturnableItems(id);
    setLines(returnable.map((r) => ({
      ...r,
      quantityM2: 0,
      reason: '',
      entryUnit: r.baseUnit || 'M2',
    })));
  }, [service]);

  const openModal = useCallback((presetInvoiceId?: string) => {
    try {
      const list = service.getInvoicesFiltered({}, false);
      setInvoices(list);
      setRefundCash(true);
      setRefundMethod('CASH');
      setInvoiceId('');
      setInvoiceInfo(null);
      setLines([]);
      setModalOpen(true);
      if (presetInvoiceId) {
        const exists = list.some((i) => i.id === presetInvoiceId);
        if (exists) pickInvoice(presetInvoiceId);
      }
    } catch (e: any) { alert(e?.message); }
  }, [pickInvoice, service]);

  useEffect(() => {
    if (location.state?.invoiceId) {
      openModal(location.state.invoiceId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, openModal]);

  const setLine = (idx: number, patch: Partial<ReturnLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  /** Quantity shown in the unit the user chose for this line. */
  const entryQuantity = (l: ReturnLine): number => {
    try {
      return round2(fromBaseQuantity(l.quantityM2, l.entryUnit, l));
    } catch {
      return l.quantityM2;
    }
  };

  const setEntryQuantity = (idx: number, value: number) => {
    const line = lines[idx];
    if (!line) return;
    const safe = Math.max(0, Number(value) || 0);
    let base: number;
    try {
      base = round2(convertQuantity(safe, line.entryUnit, line.baseUnit || 'M2', line));
    } catch {
      return;
    }
    // Do not clamp silently: an over-quantity must stay visible so submit can
    // explain it, and typing "2" must not jump to "1.66" under the cursor.
    setLine(idx, { quantityM2: base });
  };

  const total = round2(lines.reduce((s, l) => s + l.quantityM2 * l.unitPrice, 0));
  const refundPreview = useMemo(() => {
    if (!invoiceInfo) return { cash: 0, balance: 0 };
    const impact = computeReturnImpact({
      invoiceTotal: Number(invoiceInfo.totalAmount || 0),
      invoicePaid: Number(invoiceInfo.paidAmount || 0),
      returnTotal: total,
      refundCash: refundCash && refundMethod !== 'BALANCE',
    });
    return { cash: impact.cashRefund, balance: impact.balanceDelta };
  }, [invoiceInfo, total, refundCash, refundMethod]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const selected = lines.filter((l) => l.quantityM2 > 0);
    if (!invoiceId) return alert('اختر الفاتورة الأصلية.');
    if (selected.length === 0) return alert('حدد كمية لصنف واحد على الأقل.');
    const over = selected.find((l) => l.quantityM2 > l.returnableM2 + 1e-6);
    if (over) return alert(`الكمية المرتجعة من "${over.productName}" تتجاوز القابل للإرجاع (${formatProductQuantity(over.returnableM2, over)}).`);
    if (exchangeMode && newItems.length === 0) return alert('في وضع الاستبدال، أضف صنفاً بديلاً واحداً على الأقل.');
    setSaving(true);
    try {
      if (exchangeMode) {
        service.exchangeSale(
          invoiceId,
          selected.map((l) => ({
            productId: l.productId, quantityM2: l.quantityM2, boxesCount: 0,
            unitPrice: l.unitPrice, unitCost: l.unitCost, reason: l.reason || 'استبدال',
          })),
          newItems.map((n) => ({
            productId: n.productId, soldBy: 'PIECE', quantityM2: n.quantityM2, boxesCount: n.boxesCount,
            piecesCount: 0, unitPrice: n.unitPrice, unitCost: 0, discountAmount: 0,
          })),
          AuthService.getCurrentUser()?.id || 'usr_admin',
          { warehouseId: invoiceInfo?.warehouseId }
        );
      } else {
        service.returnSale(
          invoiceId,
          selected.map((l) => ({
            productId: l.productId, quantityM2: l.quantityM2, boxesCount: 0,
            unitPrice: l.unitPrice, unitCost: l.unitCost, reason: l.reason || 'مرتجع سيراميك',
          })),
          refundCash && refundMethod !== 'BALANCE',
          AuthService.getCurrentUser()?.id || 'usr_admin',
          { refundMethod }
        );
      }
      setModalOpen(false);
      setExchangeMode(false);
      setNewItems([]);
      load();
    } catch (err: any) { alert(err?.message || 'تعذر تسجيل المرتجع.'); }
    finally { setSaving(false); }
  };

  const doExport = (kind: 'excel' | 'pdf') => {
    const options = {
      title: 'سجل مرتجعات المبيعات',
      subtitle: `عدد المرتجعات: ${returns.length} • إجمالي القيمة: ${fmt(stats?.totalAmount ?? 0)}`,
      columns: [
        { key: 'returnNumber', label: 'رقم المرتجع' },
        { key: 'invoiceNumber', label: 'الفاتورة الأصلية' },
        { key: 'customerName', label: 'العميل' },
        { key: 'date', label: 'التاريخ' },
        { key: 'reason', label: 'السبب' },
        { key: 'totalAmount', label: 'القيمة' },
        { key: 'refundedAmount', label: 'نقدي' },
        { key: 'remainingToBalance', label: 'على الرصيد' },
        { key: 'refundMethod', label: 'طريقة التعويض' },
      ],
      rows: returns.map((r) => ({
        returnNumber: r.returnNumber, invoiceNumber: r.invoiceNumber || r.originalInvoiceNumber,
        customerName: r.customerName, date: r.date, reason: r.reason,
        totalAmount: r.totalAmount, refundedAmount: r.refundedAmount, remainingToBalance: r.remainingToBalance,
        refundMethod: REFUND_LABEL[r.refundMethod || 'CASH'] || 'نقدي',
      })),
      fileName: 'sales-returns',
      permission: 'returns.export',
    };
    setDocPreview({
      title: 'معاينة سجل مرتجعات المبيعات',
      subtitle: options.subtitle,
      fileName: options.fileName,
      html: buildExportHtml(options),
      excel: () => exportToExcel(options),
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center"><RotateCcw className="w-5 h-5 text-rose-600" /></div>
          <div>
            <h1 className="text-base font-black text-slate-900">مرتجع مبيعات المعرض</h1>
            <p className="text-xs text-slate-500 font-medium">تسجيل المرتجعات، إرجاع البضاعة للمخزن، وتحديث الأثر المالي ورصيد العميل</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => doExport('excel')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel</button>
          <button onClick={() => doExport('pdf')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"><FileDown className="w-4 h-4 text-rose-600" /> PDF</button>
          {canRefund && (
            <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition"><Plus className="w-4 h-4" /> تسجيل مرتجع</button>
          )}
        </div>
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="إجمالي المرتجعات" value={String(stats?.count ?? 0)} icon={RotateCcw} tone="text-slate-700 bg-slate-50 border-slate-200" />
          <Stat label="إجمالي القيمة" value={fmt(stats?.totalAmount ?? 0)} icon={TrendingDown} tone="text-rose-700 bg-rose-50 border-rose-200" />
          <Stat label="استُردت نقداً" value={fmt(stats?.cashRefunded ?? 0)} icon={Banknote} tone="text-amber-700 bg-amber-50 border-amber-200" />
          <Stat label="على الرصيد" value={fmt(stats?.creditedToBalance ?? 0)} icon={Wallet} tone="text-sky-700 bg-sky-50 border-sky-200" />
          <Stat label="مرتجعات اليوم" value={`${stats?.todayCount ?? 0} • ${fmt(stats?.todayAmount ?? 0)}`} icon={CheckCircle2} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
        </div>

        {topReasons.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400">أكثر أسباب الإرجاع:</span>
            {topReasons.map((r) => (
              <span key={r.reason} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                {r.reason} <span className="text-rose-400">×{r.count}</span> — {fmt(r.amount)}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم المرتجع أو العميل أو الفاتورة..." className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-400" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
              <span className="text-slate-300">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none" />
            </div>
            <button onClick={load} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{error}</div>}
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-rose-500" /></div> : (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
              <table className="w-full text-right text-xs min-w-[820px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <tr>
                    <th className="px-4 py-3">رقم المرتجع</th>
                    <th className="px-4 py-3">الفاتورة الأصلية</th>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">السبب</th>
                    <th className="px-4 py-3">القيمة</th>
                    <th className="px-4 py-3">نقدي / رصيد</th>
                    <th className="px-4 py-3 text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-bold text-rose-600">{r.returnNumber}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{r.invoiceNumber || r.originalInvoiceNumber}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{r.customerName}</td>
                      <td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{r.date || '—'}</span></td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-4 py-3 font-black text-rose-600">{fmt(r.totalAmount)}</td>
                      <td className="px-4 py-3 text-[10px] text-slate-500">
                        <div>نقدي: {fmt(r.refundedAmount)}</div>
                        <div>على الرصيد: {fmt(r.remainingToBalance)}</div>
                        <div className="text-[9px] font-bold text-sky-600 mt-0.5">{REFUND_LABEL[r.refundMethod || 'CASH'] || r.refundMethod || 'نقدي'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Btn onClick={() => setDetail(service.getReturnById(r.id))} tone="slate"><Eye className="w-3.5 h-3.5" /> تفاصيل</Btn>
                          <Btn onClick={() => printService.printSalesReturn(service.getReturnById(r.id))} tone="slate"><Printer className="w-3.5 h-3.5" /></Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {returns.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-slate-400">لا توجد مرتجعات مسجلة</td></tr>}
                </tbody>
              </table>
            </div>

            {returns.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
                <span>{(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, returns.length)} من {returns.length}</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                  <span className="px-3 font-bold">{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} wide>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><RotateCcw className="w-5 h-5 text-rose-600" /> تسجيل مرتجع جديد</h3>
            <button onClick={() => { setModalOpen(false); setExchangeMode(false); setNewItems([]); }} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <form onSubmit={submit} className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">الفاتورة الأصلية *</label>
              <select required value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                <option value="">— اختر الفاتورة —</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} — {i.customerName} — {fmt(i.totalAmount)}</option>)}
              </select>
            </div>

            {invoiceInfo && lines.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-center gap-2"><PackageX className="w-4 h-4" /> لا توجد كميات متاحة للإرجاع من هذه الفاتورة (تم إرجاع كل الكميات سابقاً).</div>
            )}

            {lines.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2">الصنف</th>
                      <th className="px-3 py-2">المباع</th>
                      <th className="px-3 py-2">مُرجع سابقاً</th>
                      <th className="px-3 py-2">القابل للإرجاع</th>
                      <th className="px-3 py-2">سعر الوحدة</th>
                      <th className="px-3 py-2 w-28">كمية الإرجاع</th>
                      <th className="px-3 py-2 w-32">السبب</th>
                      <th className="px-3 py-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, idx) => (
                      <tr key={l.productId}>
                        <td className="px-3 py-2 font-semibold text-slate-800">{l.productName}<div className="text-[9px] text-slate-400 font-normal">{l.size} • {l.grade}</div></td>
                        <td className="px-3 py-2 font-mono">{formatProductQuantity(l.soldM2, l)}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{formatProductQuantity(l.returnedM2, l)}</td>
                        <td className="px-3 py-2 font-mono font-bold text-emerald-600">{formatProductQuantity(l.returnableM2, l)}</td>
                        <td className="px-3 py-2 font-mono">{round2(pricePerUnit(l.unitPrice, l.entryUnit, l))} <span className="text-[9px] text-slate-400">/{getUomLabel(l.entryUnit, l)}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={entryQuantity({ ...l, quantityM2: l.returnableM2 })}
                              step={isWholeUnit(l.entryUnit, l) ? 1 : 0.01}
                              value={l.quantityM2 > 0 ? entryQuantity(l) : ''}
                              onChange={(e) => setEntryQuantity(idx, Number.parseFloat(e.target.value))}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                              aria-label={`كمية الإرجاع ${getUomLabel(l.entryUnit, l)}`}
                            />
                            {getSellableUnits(l).length > 1 && (
                              <select
                                value={l.entryUnit}
                                onChange={(e) => setLine(idx, { entryUnit: e.target.value })}
                                className="px-1 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold"
                                aria-label={`وحدة الإرجاع للصنف ${l.productName}`}
                              >
                                {getSellableUnits(l).map((unit) => (
                                  <option key={unit} value={unit}>{getUomLabel(unit, l)}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          {l.entryUnit !== (l.baseUnit || 'M2') && l.quantityM2 > 0 && (
                            <div className="text-[9px] text-slate-400 mt-1 font-normal">
                              = {formatProductQuantity(l.quantityM2, l)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2"><input list="return-reasons" value={l.reason} onChange={(e) => setLine(idx, { reason: e.target.value })} placeholder="كسر / عيب..." className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg" /></td>
                        <td className="px-3 py-2 font-bold text-rose-600">{fmt(l.quantityM2 * l.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
              <input type="checkbox" id="exchange-mode" checked={exchangeMode} onChange={(e) => { setExchangeMode(e.target.checked); if (!e.target.checked) setNewItems([]); }} />
              <label htmlFor="exchange-mode" className="text-xs font-bold text-sky-700 cursor-pointer">استبدال (Exchange): إضافة أصناف بديلة — المرتجع يُسجل كرصيد دائن للعميل</label>
            </div>

            {exchangeMode && (
              <div className="border border-sky-200 rounded-xl p-3 space-y-2 bg-sky-50/50">
                <div className="flex gap-2">
                  <input value={newSearch} onChange={(e) => setNewSearch(e.target.value)} placeholder="بحث عن صنف بديل..." className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" />
                  <input type="number" min={1} step={1} value={newQty} onChange={(e) => setNewQty(Number.parseFloat(e.target.value) || 1)} className="w-20 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs" placeholder="كمية" />
                </div>
                {newResults.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                    {newResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedNewProduct(p); setNewSearch(p.name); setNewResults([]); }} className="w-full text-right px-3 py-2 hover:bg-sky-50 text-xs border-b border-slate-100 last:border-0">
                        <span className="font-bold">{p.name}</span> <span className="text-slate-400">— {p.sku} — {fmt(Number(p.sellingPriceM2 || 0))}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedNewProduct && (
                  <button type="button" onClick={() => {
                    const qty = newQty > 0 ? newQty : 1;
                    const baseQty = qty; // assuming piece/box? simplify: use as M2 for now
                    setNewItems((prev) => [...prev, { productId: selectedNewProduct.id, productName: selectedNewProduct.name, quantityM2: baseQty, unitPrice: Number(selectedNewProduct.sellingPriceM2 || 0), boxesCount: 0 }]);
                    setSelectedNewProduct(null);
                    setNewSearch('');
                    setNewQty(1);
                  }} className="px-3 py-1.5 bg-sky-600 text-white font-bold rounded-lg text-xs">إضافة للقائمة</button>
                )}
                {newItems.length > 0 && (
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-slate-500"><th className="text-right py-1">الصنف</th><th className="text-center py-1">الكمية</th><th className="text-left py-1">السعر</th><th></th></tr></thead>
                    <tbody>
                      {newItems.map((n, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1">{n.productName}</td>
                          <td className="text-center py-1">{n.quantityM2}</td>
                          <td className="text-left py-1 font-bold">{fmt(n.quantityM2 * n.unitPrice)}</td>
                          <td className="text-left py-1"><button type="button" onClick={() => setNewItems((prev) => prev.filter((_, j) => j !== i))} className="text-rose-600 hover:text-rose-800"><X className="w-3 h-3" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {!exchangeMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-700 block mb-1">طريقة التعويض</label>
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as RefundMethod)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                  {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] text-slate-500 self-end">
                نقدي: <b className="text-amber-600">{fmt(refundPreview.cash)}</b> • على الرصيد: <b className="text-sky-600">{fmt(refundPreview.balance)}</b>
                <div className="mt-0.5 text-[9px] text-slate-400">يُحسب الاسترداد النقدي من الجزء المسدد فقط، والباقي يُسجل كرصيد دائن للعميل.</div>
              </div>
            </div>
            )}
            <datalist id="return-reasons">
              {RETURN_REASONS.map((reason) => <option key={reason} value={reason} />)}
            </datalist>

            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> إجمالي المرتجع</span>
              <span className="text-lg font-black text-rose-600">{fmt(total)}</span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => { setModalOpen(false); setExchangeMode(false); setNewItems([]); }} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl">إلغاء</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-2">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <FileText className="w-3.5 h-3.5" /> {exchangeMode ? 'اعتماد الاستبدال' : 'اعتماد المرتجع'}</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal onClose={() => setDetail(null)} wide>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">مرتجع {detail.returnNumber}</h3>
              <p className="text-[11px] text-slate-500 mt-1">الفاتورة الأصلية: {detail.invoiceNumber || detail.originalInvoiceNumber} • {detail.date}</p>
            </div>
            <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Info label="العميل" value={detail.customerName || '—'} />
            <Info label="القيمة" value={fmt(detail.totalAmount)} />
            <Info label="نقدي / رصيد" value={`${fmt(detail.refundedAmount)} / ${fmt(detail.remainingToBalance)}`} />
            <Info label="طريقة التعويض" value={REFUND_LABEL[detail.refundMethod || 'CASH'] || 'نقدي'} />
          </div>
          {detail.reason && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-800 mb-4"><b>سبب الإرجاع:</b> {detail.reason}</div>}
          <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <table className="w-full text-right text-[11px] min-w-[520px]">
              <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="px-3 py-2">الصنف</th><th className="px-3 py-2">الكمية</th><th className="px-3 py-2">الكراتين</th><th className="px-3 py-2">السعر</th><th className="px-3 py-2">الإجمالي</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(detail.items || []).map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-bold text-slate-800">{i.productName}<div className="text-[9px] text-slate-400 font-normal">{i.grade}</div></td>
                    <td className="px-3 py-2 font-mono">{formatProductQuantity(Number(i.quantityM2), i)}</td>
                    <td className="px-3 py-2 font-mono">{i.boxesCount}</td>
                    <td className="px-3 py-2 font-mono">{fmt(i.unitPrice)}</td>
                    <td className="px-3 py-2 font-bold">{fmt(i.totalRefund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button onClick={() => printService.printSalesReturn(detail)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> طباعة المرتجع</button>
          </div>
        </Modal>
      )}

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          subtitle={docPreview.subtitle}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; icon: React.ElementType; tone: string }> = ({ label, value, icon: Icon, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold opacity-80">{label}</span><Icon className="w-4 h-4 opacity-70" /></div>
    <div className="text-sm font-black mt-1 truncate">{value}</div>
  </div>
);

const Btn: React.FC<{ onClick: () => void; tone: 'slate'; children: React.ReactNode }> = ({ onClick, tone, children }) => {
  const styles: Record<string, string> = { slate: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' };
  return <button onClick={onClick} className={`px-3 py-1.5 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${styles[tone]}`}>{children}</button>;
};

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} p-6 max-h-[92vh] overflow-y-auto`}>{children}</div>
  </div>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs font-black text-slate-800 mt-0.5">{value}</div>
  </div>
);
