import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileText, CheckCircle2, Truck, DollarSign, RotateCcw, AlertTriangle,
  Search, Plus, Eye, Printer, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, X, Clock, PackageCheck, Ban, CreditCard, Banknote,
  ArrowRight, Filter, Calendar, Users, Warehouse, CheckSquare,
  XCircle, Receipt, Package, TrendingUp, ShoppingCart,
} from 'lucide-react';
import { SalesService, InvoiceFilters } from '../../services/SalesService';
import { CustomerService } from '../../services/CustomerService';
import { InventoryService } from '../../services/InventoryService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { PrintService } from '../../services/PrintService';
import { SalesInvoice, Customer, Warehouse as WarehouseType, PaymentType } from '../../types';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { exportToExcel, buildExportHtml } from '../../utils/export';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const PAGE_SIZE = 20;

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

type CycleStage = 'DRAFT' | 'PRICE_APPROVED' | 'RESERVED' | 'ISSUED' | 'PARTIAL' | 'COLLECTED' | 'DISPATCHED';

interface CycleStep {
  id: CycleStage;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

const CYCLE_STEPS: CycleStep[] = [
  { id: 'DRAFT', label: 'مسودة', icon: FileText, color: 'text-slate-500', bgColor: 'bg-slate-100', borderColor: 'border-slate-300', description: 'الفاتورة في مرحلة الإعداد' },
  { id: 'PRICE_APPROVED', label: 'اعتماد السعر', icon: CheckSquare, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-300', description: 'السعر والخصم معتمدان' },
  { id: 'RESERVED', label: 'حجز الكمية', icon: Package, color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-violet-300', description: 'الكمية محجوزة في المخزن' },
  { id: 'ISSUED', label: 'إصدار الفاتورة', icon: Receipt, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-300', description: 'تم إصدار الفاتورة رسمياً' },
  { id: 'PARTIAL', label: 'دفع جزئي', icon: CreditCard, color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-300', description: 'تم استلام دفعة جزئية' },
  { id: 'COLLECTED', label: 'التحصيل', icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300', description: 'تم تحصيل كامل المبلغ أو الائتمان' },
  { id: 'DISPATCHED', label: 'الصرف والتسليم', icon: Truck, color: 'text-sky-600', bgColor: 'bg-sky-50', borderColor: 'border-sky-300', description: 'تم الصرف من المخزن والتسليم' },
];

const INVOICE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'مكتملة', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  HOLD: { label: 'معلقة', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  VOID: { label: 'ملغاة', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  DRAFT: { label: 'مسودة', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PAID: { label: 'مسددة', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'جزئية', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  UNPAID: { label: 'غير مسددة', color: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك',
  CREDIT: 'آجل',
  MIXED: 'متعدد',
};

// Helper to derive a CycleStage from invoice data
function deriveStage(inv: SalesInvoice): CycleStage {
  if (inv.invoiceStatus === 'DRAFT') return 'DRAFT';
  if (inv.invoiceStatus === 'VOID') return 'DRAFT';
  if (inv.paymentStatus === 'PAID' && inv.invoiceStatus === 'COMPLETED') return 'DISPATCHED';
  if (inv.paymentStatus === 'PAID') return 'COLLECTED';
  if (inv.paymentStatus === 'PARTIAL') return 'PARTIAL';
  if (inv.invoiceStatus === 'HOLD') return 'RESERVED';
  return 'ISSUED';
}

interface CollectPaymentModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
  onSuccess: () => void;
}

const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({ invoice, onClose, onSuccess }) => {
  const service = useMemo(() => new SalesService(), []);
  const [amount, setAmount] = useState(String(invoice.remainingAmount ?? 0));
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { setError('يجب إدخال مبلغ صحيح.'); return; }
    setBusy(true);
    try {
      service.recordInvoicePayment(invoice.id, val, paymentType, undefined, undefined, notes);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'حدث خطأ أثناء التحصيل.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100">تسجيل تحصيل</h2>
            <p className="text-xs text-slate-500 mt-0.5">فاتورة رقم {invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-amber-700 font-medium">المبلغ المتبقي:</span>
            <span className="font-bold text-amber-800 text-lg">{fmt(invoice.remainingAmount)}</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">المبلغ المحصّل</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              min={0}
              max={invoice.remainingAmount}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">طريقة الدفع</label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'CARD', 'BANK_TRANSFER'] as PaymentType[]).map(pt => (
                <button
                  key={pt}
                  onClick={() => setPaymentType(pt)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    paymentType === pt
                      ? 'bg-sky-600 text-white border-sky-600 shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PAYMENT_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">ملاحظات</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="ملاحظات اختيارية..."
            />
          </div>
          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all">إلغاء</button>
          <button onClick={handleSubmit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            تأكيد التحصيل
          </button>
        </div>
      </div>
    </div>
  );
};

interface InvoiceDetailDrawerProps {
  invoice: SalesInvoice;
  onClose: () => void;
  onRefresh: () => void;
}

const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({ invoice, onClose, onRefresh }) => {
  const service = useMemo(() => new SalesService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canCollect = PermissionService.can(user, 'customers.payment');
  const canVoid = PermissionService.can(user, 'sales.void');
  const [showCollect, setShowCollect] = useState(false);
  const [detail, setDetail] = useState<SalesInvoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<{ title: string; fileName: string; html: string } | null>(null);

  useEffect(() => {
    const d = service.getInvoiceById(invoice.id);
    setDetail(d);
  }, [invoice.id, service]);

  const stage = deriveStage(invoice);
  const stageIndex = CYCLE_STEPS.findIndex(s => s.id === stage);

  const handleVoid = async () => {
    if (!window.confirm(`هل تريد إلغاء الفاتورة ${invoice.invoiceNumber}؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    try {
      service.voidInvoice(invoice.id, 'إلغاء الفاتورة من شاشة دورة الفاتورة');
      onRefresh();
      onClose();
    } catch (e: any) { setError(e?.message || 'حدث خطأ.'); }
    finally { setBusy(false); }
  };

  const handlePrint = () => {
    if (!detail) return;
    const html = printService.getInvoiceHtml(detail as any);
    setDocPreview({ title: `فاتورة مبيعات`, fileName: `invoice_${invoice.invoiceNumber}`, html });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col" dir="rtl">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-l from-sky-600/5 to-transparent">
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">فاتورة {invoice.invoiceNumber}</h2>
            <p className="text-xs text-slate-500">{invoice.customerName} • {invoice.date}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Cycle Progress */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">دورة الفاتورة</p>
            <div className="flex items-center gap-1 flex-wrap">
              {CYCLE_STEPS.map((step, idx) => {
                const StepIcon = step.icon;
                const isPast = idx < stageIndex;
                const isCurrent = idx === stageIndex;
                return (
                  <React.Fragment key={step.id}>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      isCurrent ? `${step.bgColor} ${step.color} ${step.borderColor} shadow-sm` :
                      isPast ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                    }`}>
                      {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                    {idx < CYCLE_STEPS.length - 1 && (
                      <ArrowRight className={`w-3 h-3 shrink-0 ${isPast ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-1">إجمالي الفاتورة</p>
              <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{fmt(invoice.totalAmount)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-900/10 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">المحصّل</p>
              <p className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{fmt(invoice.paidAmount)}</p>
            </div>
            <div className={`rounded-xl p-3 border ${invoice.remainingAmount > 0 ? 'bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-900/10 border-rose-200 dark:border-rose-800' : 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
              <p className={`text-[10px] font-medium mb-1 ${invoice.remainingAmount > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>المتبقي</p>
              <p className={`font-bold text-sm ${invoice.remainingAmount > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-400'}`}>{fmt(invoice.remainingAmount)}</p>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
            {[
              { label: 'العميل', value: invoice.customerName },
              { label: 'المخزن', value: invoice.warehouseName },
              { label: 'طريقة الدفع', value: PAYMENT_LABELS[invoice.paymentType] || invoice.paymentType },
              { label: 'حالة الفاتورة', value: INVOICE_STATUS_MAP[invoice.invoiceStatus]?.label || invoice.invoiceStatus },
              { label: 'حالة السداد', value: PAYMENT_STATUS_MAP[invoice.paymentStatus]?.label || invoice.paymentStatus },
              { label: 'الربح الإجمالي', value: fmt(invoice.grossProfit) },
              ...(invoice.dueDate ? [{ label: 'تاريخ الاستحقاق', value: invoice.dueDate }] : []),
              ...(invoice.notes ? [{ label: 'ملاحظات', value: invoice.notes }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 text-left">{value}</span>
              </div>
            ))}
          </div>

          {/* Items */}
          {detail?.items && detail.items.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">أصناف الفاتورة ({detail.items.length})</p>
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                {detail.items.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.size} — {formatProductQuantity(item.quantityM2, item)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{fmt(item.totalPrice)}</p>
                      <p className="text-xs text-slate-500">{fmt(item.unitPrice)} / {getProductUnitLabel(item)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
            <Printer className="w-4 h-4" />طباعة
          </button>
          {canCollect && invoice.remainingAmount > 0 && invoice.invoiceStatus !== 'VOID' && (
            <button onClick={() => setShowCollect(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md transition-all">
              <DollarSign className="w-4 h-4" />تحصيل دفعة
            </button>
          )}
          {canVoid && invoice.invoiceStatus !== 'VOID' && (
            <button onClick={handleVoid} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-sm font-semibold transition-all disabled:opacity-60">
              <Ban className="w-4 h-4" />إلغاء الفاتورة
            </button>
          )}
        </div>
      </div>

      {showCollect && (
        <CollectPaymentModal
          invoice={invoice}
          onClose={() => setShowCollect(false)}
          onSuccess={() => { setShowCollect(false); onRefresh(); }}
        />
      )}

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
        />
      )}
    </>
  );
};

export const InvoiceCyclePage: React.FC = () => {
  const service = useMemo(() => new SalesService(), []);
  const printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'sales.view');

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterStage, setFilterStage] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<SalesInvoice | null>(null);
  const [docPreview, setDocPreview] = useState<{ title: string; fileName: string; html: string; excel?: () => void } | null>(null);

  const load = useCallback(() => {
    if (!canView) { setLoading(false); setError('ليس لديك صلاحية عرض المبيعات.'); return; }
    setLoading(true);
    setError(null);
    try {
      const filters: InvoiceFilters = {
        search: search.trim() || undefined,
        paymentStatus: filterPayment === 'ALL' ? undefined : filterPayment as any,
        invoiceStatus: filterStatus === 'ALL' ? undefined : filterStatus as any,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const all = service.getInvoicesFiltered(filters, true);
      const s = service.getStats(filters, true);
      setStats(s);

      // Filter by cycle stage if set
      const filtered = filterStage === 'ALL' ? all : all.filter(inv => deriveStage(inv) === filterStage);
      setTotal(filtered.length);
      const start = (page - 1) * PAGE_SIZE;
      setInvoices(filtered.slice(start, start + PAGE_SIZE));
    } catch (e: any) {
      setError(e?.message || 'حدث خطأ أثناء تحميل البيانات.');
    } finally {
      setLoading(false);
    }
  }, [service, canView, search, filterPayment, filterStatus, filterStage, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [search, filterPayment, filterStatus, filterStage, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = () => {
    const columns = [
      { key: 'invoiceNumber', label: 'رقم الفاتورة' },
      { key: 'date', label: 'التاريخ' },
      { key: 'customerName', label: 'العميل' },
      { key: 'totalAmount', label: 'الإجمالي' },
      { key: 'paidAmount', label: 'المحصّل' },
      { key: 'remainingAmount', label: 'المتبقي' },
      { key: 'paymentType', label: 'طريقة الدفع' },
      { key: 'invoiceStatus', label: 'حالة الفاتورة' },
      { key: 'paymentStatus', label: 'حالة السداد' },
      { key: 'stage', label: 'مرحلة الدورة' },
    ];
    const exportRows = invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      customerName: inv.customerName || '',
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      remainingAmount: inv.remainingAmount,
      paymentType: PAYMENT_LABELS[inv.paymentType] || inv.paymentType,
      invoiceStatus: INVOICE_STATUS_MAP[inv.invoiceStatus]?.label || '',
      paymentStatus: PAYMENT_STATUS_MAP[inv.paymentStatus]?.label || '',
      stage: CYCLE_STEPS.find(s => s.id === deriveStage(inv))?.label || '',
    }));
    const html = buildExportHtml({
      title: 'دورة الفواتير',
      columns,
      rows: exportRows,
      fileName: 'invoice_cycle',
    });
    setDocPreview({
      title: 'دورة الفواتير',
      fileName: 'invoice_cycle',
      html,
      excel: () => exportToExcel({
        title: 'دورة الفواتير',
        columns,
        rows: exportRows,
        fileName: 'invoice_cycle',
      }),
    });
  };

  if (!canView) return (
    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
      <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400" />
      <p className="font-semibold">ليس لديك صلاحية عرض هذه الصفحة.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">دورة الفاتورة</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">متابعة مراحل إغلاق الفواتير — من المسودة إلى التسليم</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="تحديث"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
              تصدير
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'إجمالي الفواتير', value: stats.count, icon: Receipt, color: 'from-slate-500 to-slate-600' },
            { label: 'الإجمالي', value: fmt(stats.totalAmount), icon: TrendingUp, color: 'from-emerald-500 to-teal-600' },
            { label: 'المحصّل', value: fmt(stats.paidAmount), icon: DollarSign, color: 'from-sky-500 to-blue-600' },
            { label: 'المتبقي', value: fmt(stats.remainingAmount), icon: CreditCard, color: 'from-amber-500 to-orange-600' },
            { label: 'إجمالي الربح', value: fmt(stats.grossProfit), icon: TrendingUp, color: 'from-violet-500 to-purple-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cycle Stage Filter Pills */}
      <div className="px-6 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setFilterStage('ALL')}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${filterStage === 'ALL' ? 'bg-slate-800 text-white border-slate-800 shadow' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50'}`}
          >
            جميع المراحل
          </button>
          {CYCLE_STEPS.map(step => {
            const StepIcon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => setFilterStage(step.id === filterStage ? 'ALL' : step.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
                  filterStage === step.id
                    ? `${step.bgColor} ${step.color} ${step.borderColor} shadow`
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <StepIcon className="w-3 h-3" />
                {step.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pb-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث برقم الفاتورة أو العميل..."
                className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              />
            </div>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="ALL">كل حالات الدفع</option>
              <option value="PAID">مسددة</option>
              <option value="PARTIAL">جزئية</option>
              <option value="UNPAID">غير مسددة</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="ALL">كل حالات الفاتورة</option>
              <option value="COMPLETED">مكتملة</option>
              <option value="HOLD">معلقة</option>
              <option value="DRAFT">مسودة</option>
              <option value="VOID">ملغاة</option>
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-400 mb-3" />
              <p className="text-sm text-rose-600">{error}</p>
              <button onClick={load} className="mt-3 px-4 py-2 bg-sky-600 text-white text-sm rounded-xl hover:bg-sky-500 transition-all">إعادة المحاولة</button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-20 text-center text-slate-400 dark:text-slate-500">
              <Receipt className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">لا توجد فواتير تطابق المعايير المحددة</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['رقم الفاتورة', 'التاريخ', 'العميل', 'مرحلة الدورة', 'الإجمالي', 'المحصّل', 'المتبقي', 'حالة السداد', 'إجراءات'].map(h => (
                        <th key={h} className="text-right text-xs font-bold text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {invoices.map(inv => {
                      const stage = deriveStage(inv);
                      const stepInfo = CYCLE_STEPS.find(s => s.id === stage);
                      const StageIcon = stepInfo?.icon || FileText;
                      const ps = PAYMENT_STATUS_MAP[inv.paymentStatus];
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap text-xs">{inv.date}</td>
                          <td className="px-4 py-3 text-slate-900 dark:text-slate-100 max-w-[160px]">
                            <p className="truncate font-semibold">{inv.customerName}</p>
                            {inv.customerPhone && <p className="text-xs text-slate-500 truncate">{inv.customerPhone}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${stepInfo?.bgColor} ${stepInfo?.color} ${stepInfo?.borderColor}`}>
                              <StageIcon className="w-3.5 h-3.5" />
                              {stepInfo?.label}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{fmt(inv.totalAmount)}</td>
                          <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{fmt(inv.paidAmount)}</td>
                          <td className="px-4 py-3 font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">{fmt(inv.remainingAmount)}</td>
                          <td className="px-4 py-3">
                            {ps && <span className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${ps.color}`}>{ps.label}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setSelected(inv)} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all">
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">إجمالي {total} فاتورة</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <InvoiceDetailDrawer
          invoice={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { load(); setSelected(null); }}
        />
      )}

      {docPreview && (
        <DocumentPreviewModal
          title={docPreview.title}
          fileName={docPreview.fileName}
          html={docPreview.html}
          onClose={() => setDocPreview(null)}
          onDownloadExcel={docPreview.excel}
        />
      )}
    </div>
  );
};
