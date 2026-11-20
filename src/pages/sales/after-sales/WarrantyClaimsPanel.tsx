import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import {
  ShieldCheck, Plus, Search, RefreshCw, Loader2, X, CheckCircle2, XCircle,
  Clock, FileText, Wrench, Eye, AlertTriangle, Ban, ThumbsUp, PackageCheck,
} from 'lucide-react';
import {
  WarrantyClaimService, WarrantyClaim, WarrantyClaimStatus, WarrantyClaimType,
  WarrantyClaimAction, WarrantyClaimsStats, EligibleWarrantyItem, WarrantyResolutionType,
} from '../../../services/domains/sales/WarrantyClaimService';
import { PermissionGate } from '../../../components/auth/PermissionGate';
import { useToast } from '../../../components/ui/Toast';
import { formatProductQuantity } from '../../../utils/products/productUnits';
import type { SalesInvoice } from '../../../types';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج';

const STATUS_LABELS: Record<WarrantyClaimStatus, string> = {
  OPEN: 'جديدة',
  UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
  RESOLVED: 'تم الحل',
  CANCELLED: 'ملغاة',
};

const STATUS_BADGES: Record<WarrantyClaimStatus, string> = {
  OPEN: 'bg-warning-soft text-warning border-warning-border dark:bg-warning/40 ',
  UNDER_REVIEW: 'bg-accent-soft text-primary border-accent-border dark:bg-primary/40 ',
  APPROVED: 'bg-success-soft text-success border-success-border dark:bg-success/40 ',
  REJECTED: 'bg-danger-soft text-danger border-danger-border dark:bg-danger/40 ',
  RESOLVED: 'bg-accent-soft text-primary border-accent-border dark:bg-primary/40 ',
  CANCELLED: 'bg-surface-sunken text-ink-secondary border-line ',
};

const TYPE_LABELS: Record<WarrantyClaimType, string> = {
  WARRANTY: 'ضمان',
  REPAIR: 'إصلاح',
  REPLACEMENT: 'استبدال',
  COMPLAINT: 'شكوى',
};

const RESOLUTION_LABELS: Record<WarrantyResolutionType, string> = {
  REPAIR: 'إصلاح',
  REPLACEMENT: 'استبدال',
  REFUND: 'استرداد',
  REJECTED: 'رفض',
  OTHER: 'أخرى',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'إنشاء المطالبة',
  REVIEW: 'بدء المراجعة',
  APPROVE: 'اعتماد',
  REJECT: 'رفض',
  RESOLVE: 'تسجيل الحل',
  CANCEL: 'إلغاء',
};

const ACTION_BUTTON_LABELS: Record<WarrantyClaimAction, string> = {
  review: 'مراجعة',
  approve: 'اعتماد',
  reject: 'رفض',
  resolve: 'تسجيل الحل',
  cancel: 'إلغاء',
};

const unitInfo = (item: { productType?: string | null; baseUnit?: string | null; customUnit?: string | null }) => ({
  productType: item.productType ?? undefined,
  baseUnit: item.baseUnit ?? undefined,
  customUnit: item.customUnit ?? undefined,
});

const emptyStats: WarrantyClaimsStats = {
  total: 0, open: 0, underReview: 0, approved: 0, rejected: 0,
  resolved: 0, cancelled: 0, active: 0, thisMonth: 0,
  byType: { WARRANTY: 0, REPAIR: 0, REPLACEMENT: 0, COMPLAINT: 0 },
};

interface Props {
  invoices: SalesInvoice[];
  onChanged?: () => void;
}

interface DecisionState {
  claim: WarrantyClaim;
  action: WarrantyClaimAction;
  notes: string;
  resolutionType: 'REPAIR' | 'REPLACEMENT' | 'REFUND' | 'OTHER' | '';
}

export const WarrantyClaimsPanel: React.FC<Props> = ({ invoices }) => {
  const toast = useToast();
  const service = useMemo(() => new WarrantyClaimService(), []);

  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [stats, setStats] = useState<WarrantyClaimsStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WarrantyClaimStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<WarrantyClaimType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [eligibleItems, setEligibleItems] = useState<EligibleWarrantyItem[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [selectedInvoiceItemId, setSelectedInvoiceItemId] = useState('');
  const [claimType, setClaimType] = useState<WarrantyClaimType>('WARRANTY');
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [quantity, setQuantity] = useState('');
  const [issue, setIssue] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail & decision
  const [detail, setDetail] = useState<WarrantyClaim | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [deciding, setDeciding] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      setClaims(service.listClaims({ status: statusFilter, claimType: typeFilter, search }));
      setStats(service.stats());
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل مطالبات الضمان.');
    } finally {
      setLoading(false);
    }
  }, [service, statusFilter, typeFilter, search, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedItem = eligibleItems.find((item) => item.invoiceItemId === selectedInvoiceItemId) || null;
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId) || null;
  const claimableItems = eligibleItems.filter((item) => item.availableQuantity > 0);

  const resetCreateForm = () => {
    setInvoiceId('');
    setEligibleItems([]);
    setSelectedInvoiceItemId('');
    setClaimType('WARRANTY');
    setWarrantyMonths(12);
    setQuantity('');
    setIssue('');
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const loadEligible = (nextInvoiceId: string, months = warrantyMonths) => {
    setInvoiceId(nextInvoiceId);
    setSelectedInvoiceItemId('');
    setQuantity('');
    if (!nextInvoiceId) {
      setEligibleItems([]);
      return;
    }
    setLoadingEligible(true);
    try {
      setEligibleItems(service.getEligibleItems(nextInvoiceId, months));
    } catch (error: any) {
      setEligibleItems([]);
      toast.error(error?.message || 'تعذر تحميل أصناف الفاتورة.');
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleMonthsChange = (value: number) => {
    const months = Math.max(0, Math.trunc(Number(value) || 0));
    setWarrantyMonths(months);
    if (invoiceId) loadEligible(invoiceId, months);
  };

  const selectItem = (item: EligibleWarrantyItem) => {
    setSelectedInvoiceItemId(item.invoiceItemId || '');
    setQuantity(String(item.availableQuantity));
    if (!item.warrantyActive) setClaimType('COMPLAINT');
  };

  const handleCreate = () => {
    if (!invoiceId) return toast.error('اختر الفاتورة أولاً.');
    if (!selectedItem) return toast.error('اختر الصنف المراد المطالبة به.');
    const qty = Number(quantity);
    if (!(qty > 0)) return toast.error('أدخل كمية صحيحة أكبر من صفر.');
    setSaving(true);
    try {
      service.createClaim({
        invoiceId,
        productId: selectedItem.productId,
        invoiceItemId: selectedItem.invoiceItemId || undefined,
        claimType,
        quantityM2: qty,
        warrantyMonths,
        issueDescription: issue,
      });
      toast.success('تم تسجيل المطالبة بنجاح.');
      setCreateOpen(false);
      resetCreateForm();
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تسجيل المطالبة.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (claim: WarrantyClaim) => {
    setDetail(claim);
    setLoadingDetail(true);
    try {
      const full = service.getClaim(claim.id);
      if (full) setDetail(full);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحميل تفاصيل المطالبة.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openDecision = (claim: WarrantyClaim, action: WarrantyClaimAction) => {
    setDecision({ claim, action, notes: '', resolutionType: '' });
  };

  const submitDecision = () => {
    if (!decision) return;
    if (decision.action === 'reject' && !decision.notes.trim()) {
      return toast.error('يجب كتابة سبب الرفض.');
    }
    setDeciding(true);
    try {
      service.transition(
        decision.claim.id,
        decision.action,
        decision.notes,
        decision.action === 'resolve' && decision.resolutionType
          ? decision.resolutionType
          : undefined
      );
      toast.success('تم تحديث حالة المطالبة.');
      setDecision(null);
      if (detail?.id === decision.claim.id) openDetail(decision.claim);
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث المطالبة.');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المطالبات', value: stats.total, tone: 'text-ink ' },
          { label: 'مفتوحة / قيد المراجعة', value: stats.open + stats.underReview, tone: 'text-warning ' },
          { label: 'معتمدة', value: stats.approved, tone: 'text-success ' },
          { label: 'تم حلها', value: stats.resolved, tone: 'text-primary ' },
        ].map((card) => (
          <div key={card.label} className="bg-surface p-4 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm">
            <div className="text-xs text-muted font-medium">{card.label}</div>
            <div className={`text-2xl font-black mt-1 ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-surface p-4 rounded-2xl border border-line/80 dark:border-line-strong shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as WarrantyClaimStatus | 'ALL')}
            className="px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as WarrantyClaimType | 'ALL')}
            className="px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">كل الأنواع</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث برقم المطالبة أو العميل أو الفاتورة..."
              className="w-64 pl-3 pr-9 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={loadData}
            className="p-2 text-ink-secondary bg-surface-sunken hover:bg-surface-sunken dark:hover:bg-primary rounded-xl transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <PermissionGate permission="ui.sales.after_sales.create">
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            تسجيل مطالبة جديدة
          </button>
        </PermissionGate>
      </div>

      {/* Claims table */}
      <div className="bg-surface rounded-2xl border border-line/80 dark:border-line-strong shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-muted">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-3 text-primary" />
            جاري تحميل المطالبات...
          </div>
        ) : claims.length === 0 ? (
          <div className="p-16 text-center text-muted">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted" />
            لا توجد مطالبات ضمان مطابقة لمعايير البحث.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              ariaLabel="مطالبات الضمان"
              rows={claims}
              rowKey={(claim) => claim.id}
              tableClassName="text-sm"
              columns={[
                { key: 'num', header: 'رقم المطالبة', render: (claim) => <span className="font-bold font-mono text-primary ">{claim.claimNumber}</span> },
                {
                  key: 'customer', header: 'العميل',
                  render: (claim) => (
                    <span className="font-semibold text-ink dark:text-white">
                      {claim.customerName}
                      <span className="block text-[11px] text-muted font-normal">{claim.customerPhone || '—'}</span>
                    </span>
                  ),
                },
                { key: 'invoice', header: 'الفاتورة', render: (claim) => <span className="font-mono text-xs text-ink-secondary ">{claim.invoiceNumber}</span> },
                {
                  key: 'product', header: 'الصنف',
                  render: (claim) => (
                    <span className="text-ink max-w-[200px] truncate block">
                      {claim.productName}
                      <span className="block text-[11px] text-muted">{claim.grade || ''} {claim.size || ''}</span>
                    </span>
                  ),
                },
                { key: 'type', header: 'النوع', render: (claim) => <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-surface-sunken text-ink-secondary ">{TYPE_LABELS[claim.claimType]}</span> },
                { key: 'qty', header: 'الكمية', render: (claim) => <span className="font-bold text-ink dark:text-white">{formatProductQuantity(claim.quantityM2, unitInfo(claim))}</span> },
                {
                  key: 'warranty', header: 'حالة الضمان',
                  render: (claim) => {
                    const days = Math.ceil(
                      (new Date(`${claim.warrantyExpiresAt || ''}T00:00:00`).getTime() - Date.now()) / 86_400_000
                    );
                    if (!claim.warrantyExpiresAt) return <span className="text-xs text-muted">—</span>;
                    return days >= 0 ? (
                      <span className="text-xs text-success font-semibold">ساري ({days} يوم)</span>
                    ) : (
                      <span className="text-xs text-danger font-semibold">منتهي</span>
                    );
                  },
                },
                { key: 'status', header: 'الحالة', render: (claim) => <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border ${STATUS_BADGES[claim.status]}`}>{STATUS_LABELS[claim.status]}</span> },
                { key: 'date', header: 'التاريخ', render: (claim) => <span className="text-xs text-muted font-mono">{claim.createdAt?.substring(0, 10)}</span> },
                {
                  key: 'actions', header: 'إجراءات', align: 'center',
                  render: (claim) => (
                    <span className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openDetail(claim)}
                        className="p-1.5 text-muted hover:text-primary dark:hover:text-primary bg-surface-sunken rounded-lg transition"
                        title="عرض التفاصيل"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {claim.status === 'OPEN' && (
                        <PermissionGate permission="ui.sales.after_sales.update">
                          <button
                            onClick={() => openDecision(claim, 'review')}
                            className="p-1.5 text-primary hover:text-white hover:bg-primary bg-accent-soft dark:bg-primary/50 rounded-lg transition"
                            title="بدء المراجعة"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        </PermissionGate>
                      )}
                      {(claim.status === 'OPEN' || claim.status === 'UNDER_REVIEW') && (
                        <>
                          <PermissionGate permission="ui.sales.after_sales.approve">
                            <button
                              onClick={() => openDecision(claim, 'approve')}
                              className="p-1.5 text-success hover:text-white hover:bg-success bg-success-soft dark:bg-success/50 rounded-lg transition"
                              title="اعتماد"
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                          <PermissionGate permission="ui.sales.after_sales.reject">
                            <button
                              onClick={() => openDecision(claim, 'reject')}
                              className="p-1.5 text-danger hover:text-white hover:bg-danger bg-danger-soft dark:bg-danger/50 rounded-lg transition"
                              title="رفض"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                        </>
                      )}
                      {claim.status === 'APPROVED' && (
                        <PermissionGate permission="ui.sales.after_sales.update">
                          <button
                            onClick={() => openDecision(claim, 'resolve')}
                            className="p-1.5 text-primary hover:text-white hover:bg-primary bg-accent-soft dark:bg-primary/50 rounded-lg transition"
                            title="تسجيل الحل"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </button>
                        </PermissionGate>
                      )}
                    </span>
                  ),
                },
              ]}
              emptyTitle="لا توجد مطالبات ضمان مطابقة لمعايير البحث."
            />
          </div>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl border border-line w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-line flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="text-lg font-black text-ink dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                تسجيل مطالبة ضمان جديدة
              </h3>
              <button onClick={() => setCreateOpen(false)} className="p-1 text-muted hover:text-ink-secondary dark:hover:text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">الفاتورة</label>
                  <select
                    value={invoiceId}
                    onChange={(event) => loadEligible(event.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">اختر الفاتورة...</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} — {invoice.customerName || 'عميل نقدي'} — {invoice.date?.substring(0, 10)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">مدة الضمان (شهور)</label>
                  <input
                    type="number"
                    min={0}
                    value={warrantyMonths}
                    onChange={(event) => handleMonthsChange(Number(event.target.value))}
                    className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">نوع المطالبة</label>
                  <select
                    value={claimType}
                    onChange={(event) => setClaimType(event.target.value as WarrantyClaimType)}
                    className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedInvoice && (
                <div className="text-xs text-muted bg-surface-muted dark:bg-primary/40 rounded-xl p-3">
                  العميل: <strong className="text-ink ">{selectedInvoice.customerName || 'عميل نقدي'}</strong>
                  <span className="mx-2">•</span>
                  تاريخ الفاتورة: <strong className="font-mono text-ink ">{selectedInvoice.date?.substring(0, 10)}</strong>
                </div>
              )}

              {invoiceId && (
                <div>
                  <h4 className="text-sm font-bold text-ink dark:text-white mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    أصناف الفاتورة المؤهلة للمطالبة
                  </h4>
                  {loadingEligible ? (
                    <div className="p-8 text-center text-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                  ) : claimableItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted bg-surface-muted dark:bg-primary/40 rounded-xl">
                      لا توجد كميات متاحة للمطالبة في هذه الفاتورة (تم إرجاعها أو المطالبة بها بالكامل).
                    </div>
                  ) : (
                    <div className="border border-line rounded-xl overflow-hidden">
                      <DataTable
                        ariaLabel="أصناف الفاتورة المؤهلة للمطالبة"
                        rows={claimableItems}
                        rowKey={(item) => item.invoiceItemId || item.productId}
                        dense
                        onRowClick={(item) => selectItem(item)}
                        rowClassName={(item) => selectedInvoiceItemId === item.invoiceItemId
                          ? 'bg-accent-soft dark:bg-primary/40 cursor-pointer'
                          : 'cursor-pointer'}
                        columns={[
                          {
                            key: 'product', header: 'الصنف',
                            render: (item) => (
                              <span className="font-bold text-ink dark:text-white">
                                {item.productName}
                                <span className="block text-[10px] text-muted">{item.productSku || ''} {item.size || ''}</span>
                              </span>
                            ),
                          },
                          { key: 'sold', header: 'المباع', render: (item) => formatProductQuantity(item.soldQuantity, unitInfo(item)) },
                          { key: 'returned', header: 'المرتجع', render: (item) => formatProductQuantity(item.returnedQuantity, unitInfo(item)) },
                          { key: 'claimed', header: 'مطالبات سابقة', render: (item) => formatProductQuantity(item.claimedQuantity, unitInfo(item)) },
                          { key: 'available', header: 'المتاح', render: (item) => <span className="font-bold text-primary ">{formatProductQuantity(item.availableQuantity, unitInfo(item))}</span> },
                          { key: 'price', header: 'سعر الوحدة', render: (item) => <span className="font-mono">{fmtCurrency(item.unitPrice)}</span> },
                          {
                            key: 'warranty', header: 'الضمان',
                            render: (item) => (
                              <span>
                                {item.warrantyActive ? (
                                  <span className="text-success font-semibold">ساري</span>
                                ) : (
                                  <span className="text-danger font-semibold">منتهي</span>
                                )}
                                <span className="block text-[10px] text-muted font-mono">{item.warrantyExpiresAt}</span>
                              </span>
                            ),
                          },
                          {
                            key: 'selected', header: '', align: 'center',
                            render: (item) => selectedInvoiceItemId === item.invoiceItemId
                              ? <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />
                              : <span className="block w-4 h-4 rounded-full border border-line-strong mx-auto" />,
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}

              {selectedItem && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink-secondary mb-1">
                      الكمية المطالب بها (المتاح: {selectedItem.availableQuantity})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      max={selectedItem.availableQuantity}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-ink-secondary mb-1">وصف المشكلة / العيب *</label>
                    <input
                      value={issue}
                      onChange={(event) => setIssue(event.target.value)}
                      placeholder="مثال: كسر في 3 كراتين أثناء النقل أو اختلاف درجة اللون..."
                      className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {selectedItem && !selectedItem.warrantyActive && claimType !== 'COMPLAINT' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-warning-soft dark:bg-warning/40 border border-warning-border text-xs text-warning ">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  انتهت مدة الضمان لهذا الصنف. يمكن تسجيل «شكوى» فقط دون مطالبة ضمان.
                </div>
              )}
            </div>

            <div className="p-5 border-t border-line flex justify-end gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm font-bold text-ink-secondary bg-surface-sunken hover:bg-surface-sunken rounded-xl transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !selectedItem}
                className="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                حفظ المطالبة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl border border-line w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-line flex items-center justify-between sticky top-0 bg-surface z-10">
              <h3 className="text-lg font-black text-ink dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                تفاصيل المطالبة {detail.claimNumber}
              </h3>
              <button onClick={() => setDetail(null)} className="p-1 text-muted hover:text-ink-secondary dark:hover:text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-16 text-center text-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : (
              <div className="p-5 space-y-4 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-surface-muted dark:bg-primary/40 rounded-xl text-xs">
                  <div>
                    <span className="text-muted block">العميل</span>
                    <span className="font-bold text-ink dark:text-white">{detail.customerName}</span>
                  </div>
                  <div>
                    <span className="text-muted block">الفاتورة</span>
                    <span className="font-mono font-bold text-ink dark:text-white">{detail.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-muted block">تاريخ الفاتورة</span>
                    <span className="font-mono text-ink ">{detail.invoiceDate?.substring(0, 10)}</span>
                  </div>
                  <div>
                    <span className="text-muted block">الحالة</span>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md border font-bold ${STATUS_BADGES[detail.status]}`}>
                      {STATUS_LABELS[detail.status]}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">الصنف</span>
                    <span className="font-bold text-ink dark:text-white">{detail.productName}</span>
                  </div>
                  <div>
                    <span className="text-muted block">النوع</span>
                    <span className="font-bold text-ink dark:text-white">{TYPE_LABELS[detail.claimType]}</span>
                  </div>
                  <div>
                    <span className="text-muted block">الكمية</span>
                    <span className="font-bold text-ink dark:text-white">{formatProductQuantity(detail.quantityM2, unitInfo(detail))}</span>
                  </div>
                  <div>
                    <span className="text-muted block">انتهاء الضمان</span>
                    <span className="font-mono text-ink ">{detail.warrantyExpiresAt || '—'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-line ">
                  <div className="text-xs font-bold text-muted mb-1">وصف المشكلة</div>
                  <p className="text-ink leading-relaxed">{detail.issueDescription}</p>
                </div>

                {(detail.resolutionType || detail.resolutionNotes) && (
                  <div className="p-3 rounded-xl border border-success-border bg-success-soft/60 dark:bg-success/30">
                    <div className="text-xs font-bold text-success mb-1">الحل / القرار</div>
                    {detail.resolutionType && (
                      <div className="text-xs text-ink-secondary ">
                        نوع الحل: <strong>{RESOLUTION_LABELS[detail.resolutionType]}</strong>
                      </div>
                    )}
                    {detail.resolutionNotes && (
                      <p className="text-ink mt-1">{detail.resolutionNotes}</p>
                    )}
                  </div>
                )}

                {detail.execution && (
                  <div className="p-3 rounded-xl border border-accent-border bg-accent-soft/60 dark:bg-primary/30">
                    <div className="text-xs font-bold text-primary mb-1">تنفيذ الحل والمراجع</div>
                    <div className="text-xs text-ink ">
                      الإجراء: <strong>{detail.execution.referenceType}</strong>
                      {detail.execution.referenceId && <span className="font-mono" dir="ltr"> — {detail.execution.referenceId}</span>}
                    </div>
                    {detail.execution.returnId && <div className="text-xs text-ink mt-1">رقم المرتجع: <span className="font-mono" dir="ltr">{detail.execution.returnId}</span></div>}
                    {detail.execution.replacementInvoiceId && <div className="text-xs text-ink mt-1">الفاتورة البديلة: <span className="font-mono" dir="ltr">{detail.execution.replacementInvoiceId}</span></div>}
                    {detail.execution.amount > 0 && <div className="text-xs text-ink mt-1">المبلغ المسوّى: <strong>{fmtCurrency(detail.execution.amount)}</strong></div>}
                    <p className="text-xs text-ink-secondary mt-1">{detail.execution.details}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-muted mb-2">سجل المطالبة</h4>
                  <div className="space-y-2">
                    {(detail.events || []).map((event) => (
                      <div key={event.id} className="flex gap-3 p-2.5 rounded-xl bg-surface-muted dark:bg-primary/40">
                        <div className="w-7 h-7 rounded-full bg-accent-soft dark:bg-primary/60 text-primary flex items-center justify-center shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-ink text-xs">
                              {ACTION_LABELS[event.action] || event.action}
                              {event.toStatus && (
                                <span className="mr-2 font-normal text-muted">→ {STATUS_LABELS[event.toStatus]}</span>
                              )}
                            </span>
                            <span className="text-[10px] text-muted font-mono">{event.createdAt?.replace('T', ' ').substring(0, 16)}</span>
                          </div>
                          <div className="text-[11px] text-muted mt-0.5">
                            بواسطة {event.createdByName || event.createdBy}
                          </div>
                          {event.notes && <p className="text-xs text-ink-secondary mt-1">{event.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-line ">
                  {detail.status === 'OPEN' && (
                    <PermissionGate permission="ui.sales.after_sales.update">
                      <button onClick={() => openDecision(detail, 'review')} className="px-3 py-2 text-xs font-bold text-primary bg-accent-soft hover:bg-accent-soft dark:bg-primary/50 rounded-xl transition flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> بدء المراجعة
                      </button>
                    </PermissionGate>
                  )}
                  {(detail.status === 'OPEN' || detail.status === 'UNDER_REVIEW') && (
                    <>
                      <PermissionGate permission="ui.sales.after_sales.approve">
                        <button onClick={() => openDecision(detail, 'approve')} className="px-3 py-2 text-xs font-bold text-white bg-success hover:bg-success rounded-xl transition flex items-center gap-1.5">
                          <ThumbsUp className="w-4 h-4" /> اعتماد
                        </button>
                      </PermissionGate>
                      <PermissionGate permission="ui.sales.after_sales.reject">
                        <button onClick={() => openDecision(detail, 'reject')} className="px-3 py-2 text-xs font-bold text-white bg-danger hover:bg-danger rounded-xl transition flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" /> رفض
                        </button>
                      </PermissionGate>
                    </>
                  )}
                  {detail.status === 'APPROVED' && (
                    <PermissionGate permission="ui.sales.after_sales.resolve">
                      <button onClick={() => openDecision(detail, 'resolve')} className="px-3 py-2 text-xs font-bold text-white bg-primary hover:bg-primary rounded-xl transition flex items-center gap-1.5">
                        <PackageCheck className="w-4 h-4" /> تسجيل الحل
                      </button>
                    </PermissionGate>
                  )}
                  {['OPEN', 'UNDER_REVIEW', 'APPROVED'].includes(detail.status) && (
                    <PermissionGate permission="ui.sales.after_sales.delete">
                      <button onClick={() => openDecision(detail, 'cancel')} className="px-3 py-2 text-xs font-bold text-ink-secondary bg-surface-sunken hover:bg-surface-sunken rounded-xl transition flex items-center gap-1.5">
                        <Ban className="w-4 h-4" /> إلغاء
                      </button>
                    </PermissionGate>
                  )}
                  <button onClick={() => setDetail(null)} className="px-4 py-2 text-xs font-bold text-ink-secondary bg-surface-sunken hover:bg-surface-sunken rounded-xl transition">
                    إغلاق
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision modal */}
      {decision && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl border border-line w-full max-w-lg shadow-2xl">
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h3 className="text-base font-black text-ink dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" />
                {ACTION_BUTTON_LABELS[decision.action]} المطالبة {decision.claim.claimNumber}
              </h3>
              <button onClick={() => setDecision(null)} className="p-1 text-muted hover:text-ink-secondary dark:hover:text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {decision.action === 'resolve' && (
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">نوع الحل</label>
                  <select
                    value={decision.resolutionType}
                    onChange={(event) => setDecision({
                      ...decision,
                      resolutionType: event.target.value as DecisionState['resolutionType'],
                    })}
                    className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">اختر نوع الحل...</option>
                    {(['REPAIR', 'REPLACEMENT', 'REFUND', 'OTHER'] as const).map((value) => (
                      <option key={value} value={value}>{RESOLUTION_LABELS[value]}</option>
                    ))}
                  </select>
                  {decision.resolutionType === 'REFUND' && (
                    <p className="mt-2 text-xs text-warning ">سينشئ النظام مرتجعًا ماليًا ويضيف المبلغ إلى رصيد العميل، مع عزل الكمية المرتجعة للفحص.</p>
                  )}
                  {decision.resolutionType === 'REPLACEMENT' && (
                    <p className="mt-2 text-xs text-warning ">سينشئ النظام المرتجع ويعزل الصنف المعيب، ثم يصدر فاتورة بديلة ويصرف الكمية من المخزون.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">
                  ملاحظات {decision.action === 'reject' || (decision.action === 'resolve' && ['REPAIR', 'OTHER'].includes(decision.resolutionType)) ? '*' : ''}
                </label>
                <textarea
                  rows={3}
                  value={decision.notes}
                  onChange={(event) => setDecision({ ...decision, notes: event.target.value })}
                  placeholder={decision.action === 'reject' ? 'سبب رفض المطالبة...' : 'تفاصيل القرار أو الحل...'}
                  className="w-full px-3 py-2 text-sm bg-surface-muted dark:bg-primary/50 border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {decision.action === 'cancel' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-warning-soft dark:bg-warning/40 border border-warning-border text-xs text-warning ">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  إلغاء المطالبة يحرر الكمية المطالب بها ويمكن تسجيل مطالبة جديدة لها لاحقاً.
                </div>
              )}
            </div>
            <div className="p-5 border-t border-line flex justify-end gap-2">
              <button onClick={() => setDecision(null)} className="px-4 py-2 text-sm font-bold text-ink-secondary bg-surface-sunken hover:bg-surface-sunken rounded-xl transition">
                تراجع
              </button>
              <button
                onClick={submitDecision}
                disabled={deciding || (decision.action === 'resolve' && !decision.resolutionType)}
                className="px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-primary disabled:opacity-50 rounded-xl transition flex items-center gap-1.5"
              >
                {deciding ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarrantyClaimsPanel;
