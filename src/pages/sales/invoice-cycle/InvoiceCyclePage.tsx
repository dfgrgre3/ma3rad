import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  FileText, CheckCircle2, Truck, DollarSign, AlertTriangle,
  Search, Eye, Printer, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, X, Ban, CreditCard,
  ArrowRight, CheckSquare,
  Receipt, Package, TrendingUp,
} from 'lucide-react';
import { SalesService, InvoiceFilters } from '../../../services/domains/sales/SalesService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { PrintService } from '../../../services/shared/PrintService';
import { SalesInvoice, PaymentType } from '../../../types';
import { DocumentPreviewModal } from '../../../components/documents/DocumentPreviewModal';
import { exportToExcel, buildExportHtml } from '../../../utils/export/export';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';
import { FinanceEnterpriseService } from '../../../services/domains/finance/FinanceEnterpriseService';
import type { BankAccount } from '../../../types/finance';

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
  { id: 'DRAFT', label: 'مسودة', icon: FileText, color: 'text-muted', bgColor: 'bg-surface-sunken', borderColor: 'border-line-strong', description: 'الفاتورة في مرحلة الإعداد' },
  { id: 'PRICE_APPROVED', label: 'اعتماد السعر', icon: CheckSquare, color: 'text-primary', bgColor: 'bg-accent-soft', borderColor: 'border-accent-border', description: 'السعر والخصم معتمدان' },
  { id: 'RESERVED', label: 'حجز الكمية', icon: Package, color: 'text-primary', bgColor: 'bg-accent-soft', borderColor: 'border-accent-border', description: 'الكمية محجوزة في المخزن' },
  { id: 'ISSUED', label: 'إصدار الفاتورة', icon: Receipt, color: 'text-warning', bgColor: 'bg-warning-soft', borderColor: 'border-warning', description: 'تم إصدار الفاتورة رسمياً' },
  { id: 'PARTIAL', label: 'دفع جزئي', icon: CreditCard, color: 'text-warning', bgColor: 'bg-warning-soft', borderColor: 'border-warning', description: 'تم استلام دفعة جزئية' },
  { id: 'COLLECTED', label: 'التحصيل', icon: DollarSign, color: 'text-success', bgColor: 'bg-success-soft', borderColor: 'border-success', description: 'تم تحصيل كامل المبلغ أو الائتمان' },
  { id: 'DISPATCHED', label: 'الصرف والتسليم', icon: Truck, color: 'text-primary', bgColor: 'bg-accent-soft', borderColor: 'border-accent-border', description: 'تم الصرف من المخزن والتسليم' },
];

const INVOICE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'مكتملة', color: 'bg-success-soft text-success border-success-border' },
  HOLD: { label: 'معلقة', color: 'bg-warning-soft text-warning border-warning-border' },
  VOID: { label: 'ملغاة', color: 'bg-danger-soft text-danger border-danger-border' },
  DRAFT: { label: 'مسودة', color: 'bg-surface-sunken text-ink-secondary border-line' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PAID: { label: 'مسددة', color: 'bg-success-soft text-success border-success-border' },
  PARTIAL: { label: 'جزئية', color: 'bg-warning-soft text-warning border-warning-border' },
  UNPAID: { label: 'غير مسددة', color: 'bg-danger-soft text-danger border-danger-border' },
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
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const financeService = useMemo(() => new FinanceEnterpriseService(), []);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const accounts = financeService.getBankAccounts().filter((account) => account.isActive);
      setBankAccounts(accounts);
      setBankAccountId(accounts[0]?.id || '');
    } catch { setBankAccounts([]); }
  }, [financeService]);

  const handleSubmit = async () => {
    setError(null);
    const val = Number.parseFloat(amount);
    if (isNaN(val) || val <= 0) { setError('يجب إدخال مبلغ صحيح.'); return; }
    setBusy(true);
    try {
      service.recordInvoicePayment(invoice.id, val, paymentType, undefined, undefined, notes, undefined, undefined, bankAccountId || undefined);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'حدث خطأ أثناء التحصيل.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-line ">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink ">تسجيل تحصيل</h2>
            <p className="text-xs text-muted mt-0.5">فاتورة رقم {invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink-secondary transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-warning-soft border border-warning-border rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-warning font-medium">المبلغ المتبقي:</span>
            <span className="font-bold text-warning text-lg">{fmt(invoice.remainingAmount)}</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">المبلغ المحصّل</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-line-strong bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
              max={invoice.remainingAmount}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">طريقة الدفع</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['CASH', 'CARD', 'BANK_TRANSFER'] as PaymentType[]).map(pt => (
                <button
                  key={pt}
                  onClick={() => setPaymentType(pt)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    paymentType === pt
                      ? 'bg-primary text-white border-primary shadow-md'
                      : 'bg-surface text-ink-secondary border-line-strong hover:bg-surface-muted'
                  }`}
                >
                  {PAYMENT_LABELS[pt]}
                </button>
              ))}
            </div>
          </div>
          {paymentType === 'BANK_TRANSFER' && (
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1.5">الحساب البنكي المستلم *</label>
              <select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm ">
                <option value="">اختر الحساب البنكي</option>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} — {account.bankName}</option>)}
              </select>
              {bankAccounts.length === 0 && <p className="mt-1 text-xs text-danger">لا توجد حسابات بنكية متاحة؛ اختر وسيلة أخرى.</p>}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">ملاحظات</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-line-strong bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="ملاحظات اختيارية..."
            />
          </div>
          {error && <p className="text-xs text-danger bg-danger-soft border border-danger-border rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="p-5 border-t border-line flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-line-strong text-sm font-semibold text-ink-secondary hover:bg-surface-muted transition-all">إلغاء</button>
          <button onClick={handleSubmit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-success hover:bg-success text-white text-sm font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
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
  const canCollect = PermissionService.can(user, 'ui.customers.detail.payment');
  const canVoid = PermissionService.can(user, 'ui.sales.invoices.void');
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
      <div className="fixed inset-y-0 left-0 z-50 w-full max-w-2xl bg-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-l from-primary/5 to-transparent">
          <div>
            <h2 className="font-bold text-lg text-ink ">فاتورة {invoice.invoiceNumber}</h2>
            <p className="text-xs text-muted">{invoice.customerName} • {invoice.date}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-sunken dark:hover:bg-primary transition-colors">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Cycle Progress */}
          <div className="bg-surface-muted dark:bg-primary/50 rounded-2xl p-4">
            <p className="text-xs font-bold text-muted mb-3 uppercase tracking-wider">دورة الفاتورة</p>
            <div className="flex items-center gap-1 flex-wrap">
              {CYCLE_STEPS.map((step, idx) => {
                const StepIcon = step.icon;
                const isPast = idx < stageIndex;
                const isCurrent = idx === stageIndex;
                return (
                  <React.Fragment key={step.id}>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      isCurrent ? `${step.bgColor} ${step.color} ${step.borderColor} shadow-sm` :
                      isPast ? 'bg-success-soft text-success border-success-border' :
                      'bg-surface text-muted border-line '
                    }`}>
                      {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                    {idx < CYCLE_STEPS.length - 1 && (
                      <ArrowRight className={`w-3 h-3 shrink-0 ${isPast ? 'text-success' : 'text-muted dark:text-ink-secondary'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-line to-line dark:from-ink dark:to-ink/50 rounded-xl p-3 border border-line ">
              <p className="text-[10px] text-muted font-medium mb-1">إجمالي الفاتورة</p>
              <p className="font-bold text-sm text-ink ">{fmt(invoice.totalAmount)}</p>
            </div>
            <div className="bg-gradient-to-br from-success to-success dark:from-success/20 dark:to-success/10 rounded-xl p-3 border border-success-border ">
              <p className="text-[10px] text-success font-medium mb-1">المحصّل</p>
              <p className="font-bold text-sm text-success ">{fmt(invoice.paidAmount)}</p>
            </div>
            <div className={`rounded-xl p-3 border ${invoice.remainingAmount > 0 ? 'bg-gradient-to-br from-danger to-danger dark:from-danger/20 dark:to-danger/10 border-danger-border dark:border-danger' : 'bg-gradient-to-br from-line to-line dark:from-ink dark:to-ink/50 border-line'}`}>
              <p className={`text-[10px] font-medium mb-1 ${invoice.remainingAmount > 0 ? 'text-danger dark:text-danger' : 'text-muted dark:text-muted'}`}>المتبقي</p>
              <p className={`font-bold text-sm ${invoice.remainingAmount > 0 ? 'text-danger dark:text-danger' : 'text-ink-secondary dark:text-muted'}`}>{fmt(invoice.remainingAmount)}</p>
            </div>
          </div>

          {/* Details */}
          <div className="bg-surface dark:bg-primary/50 rounded-xl border border-line divide-y divide-line-strong dark:divide-primary">
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
                <span className="text-xs text-muted ">{label}</span>
                <span className="text-xs font-semibold text-ink text-left">{value}</span>
              </div>
            ))}
          </div>

          {/* Items */}
          {detail?.items && detail.items.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted mb-2 uppercase tracking-wider">أصناف الفاتورة ({detail.items.length})</p>
              <div className="bg-surface dark:bg-primary/50 rounded-xl border border-line divide-y divide-line-strong dark:divide-primary">
                {detail.items.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{item.productName}</p>
                      <p className="text-xs text-muted">{item.size} — {formatProductQuantity(item.quantityM2, item)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-ink ">{fmt(item.totalPrice)}</p>
                      <p className="text-xs text-muted">{fmt(item.unitPrice)} / {getProductUnitLabel(item)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger bg-danger-soft border border-danger-border rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-line flex flex-wrap gap-2">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-sunken text-ink text-sm font-semibold hover:bg-surface-sunken dark:hover:bg-primary transition-all">
            <Printer className="w-4 h-4" />طباعة
          </button>
          {canCollect && invoice.remainingAmount > 0 && invoice.invoiceStatus !== 'VOID' && (
            <button onClick={() => setShowCollect(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-success hover:bg-success text-white text-sm font-bold shadow-md transition-all">
              <DollarSign className="w-4 h-4" />تحصيل دفعة
            </button>
          )}
          {canVoid && invoice.invoiceStatus !== 'VOID' && (
            <button onClick={handleVoid} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-danger-soft hover:bg-danger-soft text-danger border border-danger-border text-sm font-semibold transition-all disabled:opacity-60">
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
  const _printService = useMemo(() => new PrintService(), []);
  const user = AuthService.getCurrentUser();
  const canView = PermissionService.can(user, 'ui.sales.cycle.view');

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
      { key: 'shippingCost', label: 'النقل والشحن' },
      { key: 'extraFees', label: 'مصاريف إضافية' },
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
      shippingCost: inv.shippingCost || 0,
      extraFees: inv.extraFees || 0,
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
      permission: 'sales.export',
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
        permission: 'sales.export',
      }),
    });
  };

  if (!canView) return (
    <div className="p-8 text-center text-muted ">
      <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-warning" />
      <p className="font-semibold">ليس لديك صلاحية عرض هذه الصفحة.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-surface-muted ">
      {/* Header */}
      <div className="bg-surface border-b border-line px-6 pt-4">
        <PageHeader
          icon={<ArrowRight className="w-5 h-5" />}
          title="دورة الفاتورة"
          description="متابعة مراحل إغلاق الفواتير — من المسودة إلى التسليم"
          actions={<>
            <button onClick={load} className="p-2 rounded-xl text-muted hover:bg-surface-sunken dark:hover:bg-primary transition-colors" title="تحديث"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-line-strong text-sm font-semibold text-ink-secondary hover:bg-surface-muted dark:hover:bg-primary transition-all">
              تصدير
            </button>
          </>}
        />
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'إجمالي الفواتير', value: stats.count, icon: Receipt, color: 'from-muted to-ink' },
            { label: 'الإجمالي', value: fmt(stats.totalAmount), icon: TrendingUp, color: 'from-success to-success' },
            { label: 'المحصّل', value: fmt(stats.paidAmount), icon: DollarSign, color: 'from-primary to-primary' },
            { label: 'المتبقي', value: fmt(stats.remainingAmount), icon: CreditCard, color: 'from-warning to-warning' },
            { label: 'إجمالي الربح', value: fmt(stats.grossProfit), icon: TrendingUp, color: 'from-primary to-primary' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-surface rounded-xl border border-line p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted font-medium">{label}</p>
                <p className="text-sm font-bold text-ink truncate">{value}</p>
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
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${filterStage === 'ALL' ? 'bg-primary text-white border-line-strong shadow' : 'bg-surface dark:bg-primary text-ink-secondary border-line-strong hover:bg-surface-muted'}`}
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
                    : 'bg-surface text-ink-secondary border-line-strong hover:bg-surface-muted dark:hover:bg-primary'
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
        <div className="bg-surface rounded-xl border border-line p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-surface-muted rounded-xl px-3 py-2.5 border border-line ">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث برقم الفاتورة أو العميل..."
                className="flex-1 text-sm bg-transparent text-ink placeholder-muted focus:outline-none"
              />
            </div>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="ALL">كل حالات الدفع</option>
              <option value="PAID">مسددة</option>
              <option value="PARTIAL">جزئية</option>
              <option value="UNPAID">غير مسددة</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="ALL">كل حالات الفاتورة</option>
              <option value="COMPLETED">مكتملة</option>
              <option value="HOLD">معلقة</option>
              <option value="DRAFT">مسودة</option>
              <option value="VOID">ملغاة</option>
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2.5 rounded-xl border border-line bg-surface-muted text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-danger mb-3" />
              <p className="text-sm text-danger">{error}</p>
              <button onClick={load} className="mt-3 px-4 py-2 bg-primary text-white text-sm rounded-xl hover:bg-primary transition-all">إعادة المحاولة</button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-20 text-center text-muted ">
              <Receipt className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm">لا توجد فواتير تطابق المعايير المحددة</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <DataTable
                ariaLabel="فواتير دورة الفوترة"
                rows={invoices}
                rowKey={(inv: any) => String(inv.id)}
                tableClassName="text-sm"
                rowClassName={() => 'transition-colors hover:bg-surface-muted dark:hover:bg-primary/50'}
                columns={[
                  { key: 'num', header: 'رقم الفاتورة', render: (inv: any) => <span className="whitespace-nowrap font-bold text-primary ">{inv.invoiceNumber}</span> },
                  { key: 'date', header: 'التاريخ', render: (inv: any) => <span className="whitespace-nowrap text-xs text-ink-secondary ">{inv.date}</span> },
                  {
                    key: 'customer', header: 'العميل',
                    render: (inv: any) => (
                      <div className="max-w-[160px]">
                        <p className="truncate font-semibold text-ink ">{inv.customerName}</p>
                        {inv.customerPhone && <p className="truncate text-xs text-muted">{inv.customerPhone}</p>}
                      </div>
                    ),
                  },
                  {
                    key: 'stage', header: 'مرحلة الدورة',
                    render: (inv: any) => {
                      const stage = deriveStage(inv);
                      const stepInfo = CYCLE_STEPS.find(s => s.id === stage);
                      const StageIcon = stepInfo?.icon || FileText;
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${stepInfo?.bgColor} ${stepInfo?.color} ${stepInfo?.borderColor}`}>
                          <StageIcon className="h-3.5 w-3.5" />
                          {stepInfo?.label}
                        </span>
                      );
                    },
                  },
                  { key: 'total', header: 'الإجمالي', render: (inv: any) => <span className="whitespace-nowrap font-bold text-ink ">{fmt(inv.totalAmount)}</span> },
                  { key: 'paid', header: 'المحصّل', render: (inv: any) => <span className="whitespace-nowrap font-semibold text-success ">{fmt(inv.paidAmount)}</span> },
                  { key: 'rem', header: 'المتبقي', render: (inv: any) => <span className="whitespace-nowrap font-semibold text-danger ">{fmt(inv.remainingAmount)}</span> },
                  {
                    key: 'paystatus', header: 'حالة السداد',
                    render: (inv: any) => {
                      const ps = PAYMENT_STATUS_MAP[inv.paymentStatus];
                      return ps ? <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${ps.color}`}>{ps.label}</span> : null;
                    },
                  },
                  {
                    key: 'actions', header: 'إجراءات', align: 'center',
                    render: (inv: any) => (
                      <button onClick={() => setSelected(inv)} className="rounded-lg p-1.5 text-muted transition-all hover:bg-accent-soft hover:text-primary dark:hover:bg-primary/20">
                        <Eye className="h-4 w-4" />
                      </button>
                    ),
                  },
                ]}
              />
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-line flex items-center justify-between">
                <p className="text-xs text-muted ">إجمالي {total} فاتورة</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-ink-secondary px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-sunken dark:hover:bg-primary disabled:opacity-40 transition-all">
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
