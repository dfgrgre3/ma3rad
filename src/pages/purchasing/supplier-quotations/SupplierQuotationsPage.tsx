import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { DataTable } from '../../../components/ui/DataTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useBusinessTerm } from '../../../hooks/domains/config/useBusinessTerm';
import {
  Plus, Search, TrendingDown, Clock, ShieldCheck, DollarSign, Building2,
  X, Award, FileSpreadsheet,
} from 'lucide-react';
import {
  ProcurementService, SupplierRfqRow, SupplierRfqItem,
  SupplierQuotationRow
} from '../../../services/domains/procurement/ProcurementService';
import { SupplierService } from '../../../services/domains/suppliers/SupplierService';
import { ProductService } from '../../../services/domains/products/ProductService';
import { OperationsService } from '../../../services/domains/operations/OperationsService';
import { AuthService } from '../../../services/domains/auth/AuthService';
import { PermissionService } from '../../../services/domains/auth/PermissionService';
import { useToast } from '../../../components/ui/Toast';
import { ProductPicker } from '../../../components/products/ProductPicker';
import type { Supplier, Product } from '../../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../../utils/products/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'مفتوح لتلقي العروض', color: 'bg-accent-soft text-primary border-accent-border' },
  EVALUATING: { label: 'قيد المقارنة والتقييم', color: 'bg-warning-soft text-warning border-warning-border' },
  AWARDED: { label: 'تمت الترسية', color: 'bg-success-soft text-success border-success-border' },
  CANCELLED: { label: 'ملغي', color: 'bg-surface-sunken text-muted border-line' },
};

export const SupplierQuotationsPage: React.FC = () => {
  const newRfqLabel = useBusinessTerm('actions.newRfq');
  const service = useMemo(() => new ProcurementService(), []);
  const toast = useToast();
  const canCreate = PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.quotations.create');
  const canApprove = PermissionService.can(AuthService.getCurrentUser(), 'ui.purchases.quotations.approve');

  const [rfqs, setRfqs] = useState<SupplierRfqRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Selected RFQ details
  const [selectedRfq, setSelectedRfq] = useState<(SupplierRfqRow & { items: SupplierRfqItem[]; quotations: SupplierQuotationRow[] }) | null>(null);

  // Modal: New RFQ
  const [newRfqModal, setNewRfqModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [rfqDueDate, setRfqDueDate] = useState('');
  const [rfqNotes, setRfqNotes] = useState('');
  const [rfqLines, setRfqLines] = useState<Array<{ productId: string; quantityM2: number; notes: string }>>([
    { productId: '', quantityM2: 100, notes: '' },
  ]);

  // Modal: Add Supplier Quotation
  const [quoteModal, setQuoteModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [deliveryDays, setDeliveryDays] = useState(7);
  const [paymentTerms, setPaymentTerms] = useState('آجل 30 يوم');
  const [qualityRating, setQualityRating] = useState('فرز أول نخب أ');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<Array<{ rfqItemId: string; productId: string; productName: string; quantityM2: number; unitCost: number; productType?: 'CERAMIC' | 'GENERAL'; baseUnit?: string; customUnit?: string }>>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    (async () => {
      try {
        const data = await service.getAllRfqsAsync(search, statusFilter);
        setRfqs(data);
        if (selectedRfq) {
          const refreshed = await service.getRfqByIdAsync(selectedRfq.id);
          setSelectedRfq(refreshed);
        }
      } catch (e: any) {
        toast.error(e?.message || 'تعذر تحميل طلبات عروض الأسعار.');
      } finally {
        setLoading(false);
      }
    })();
  }, [service, setLoading, setRfqs, setSelectedRfq, toast, search, statusFilter, selectedRfq]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openRfqDetails = (id: string) => {
    service.getRfqByIdAsync(id).then((details) => setSelectedRfq(details));
  };

  const handleOpenNewRfq = () => {
    (async () => {
      try {
        setProducts(await new ProductService().getAllProductsAsync());
        setRfqDueDate('');
        setRfqNotes('');
        setRfqLines([{ productId: '', quantityM2: 100, notes: '' }]);
        setNewRfqModal(true);
      } catch (e: any) {
        toast.error(e?.message);
      }
    })();
  };

  const handleCreateRfq = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = rfqLines.filter((l) => l.productId && Number(l.quantityM2) > 0);
    if (!validLines.length) return toast.error('أضف صنفاً واحداً على الأقل.');

    try {
      const created = service.createRfq({
        dueDate: rfqDueDate || undefined,
        notes: rfqNotes || undefined,
        items: validLines.map((l) => ({ productId: l.productId, quantityM2: Number(l.quantityM2), notes: l.notes || undefined })),
      });
      toast.success(`تم إنشاء طلب عروض الأسعار رقم ${created.rfqNumber}`);
      setNewRfqModal(false);
      loadData();
      openRfqDetails(created.id);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إنشاء الطلب.');
    }
  };

  const handleOpenAddQuote = () => {
    if (!selectedRfq) return;
    (async () => {
      try {
        const sups = await new SupplierService().getAllSuppliersAsync();
        setSuppliers(sups);
      setSelectedSupplierId(sups[0]?.id || '');
      setQuoteNumber(`BID-${Date.now().toString().slice(-5)}`);
      setValidUntil('');
      setDeliveryDays(7);
      setPaymentTerms('آجل 30 يوم');
      setQualityRating('فرز أول أ');
      setQuoteNotes('');
      setQuoteItems(
        selectedRfq.items.map((it) => ({
          rfqItemId: it.id,
          productId: it.productId,
          productName: it.productName,
          quantityM2: it.quantityM2,
          unitCost: 100,
          productType: it.productType,
          baseUnit: it.baseUnit,
          customUnit: it.customUnit,
        }))
      );
        setQuoteModal(true);
      } catch (e: any) {
        toast.error(e?.message);
      }
    })();
  };

  const handleSubmitQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRfq || !selectedSupplierId) return;

    try {
      service.addSupplierQuotation({
        rfqId: selectedRfq.id,
        supplierId: selectedSupplierId,
        quotationNumber: quoteNumber,
        validUntil: validUntil || undefined,
        deliveryDays: Number(deliveryDays),
        paymentTerms,
        qualityRating,
        notes: quoteNotes || undefined,
        items: quoteItems.map((qi) => ({
          rfqItemId: qi.rfqItemId,
          productId: qi.productId,
          quantityM2: Number(qi.quantityM2),
          unitCost: Number(qi.unitCost),
        })),
      });
      toast.success('تم تسجيل عرض سعر المورد بنجاح وإدراجه في المقارنة.');
      setQuoteModal(false);
      loadData();
      openRfqDetails(selectedRfq.id);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر إضافة عرض السعر.');
    }
  };

  const handleAwardQuotation = (quotation: SupplierQuotationRow) => {
    if (!canApprove) return toast.error('ليس لديك صلاحية اعتماد وترسية عروض الأسعار.');
    if (!confirm(`هل أنت متأكد من ترسية العرض رقم ${quotation.quotationNumber} المقدم من ${quotation.supplierName}؟ سيتم إنشاء أمر شراء آلياً.`)) return;

    try {
      const warehouses = new OperationsService().getWarehouses();
      const defaultWh = warehouses[0]?.id || 'wh_main';
      service.awardQuotation(quotation.id, true, defaultWh);
      toast.success('تمت ترسية العرض بنجاح وإنشاء أمر الشراء المرتبط به.');
      loadData();
      if (selectedRfq) openRfqDetails(selectedRfq.id);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر ترسية العرض.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted text-ink overflow-hidden">
      {/* Header */}
      <div className="bg-surface px-6 pt-4">
        <PageHeader
          icon={<FileSpreadsheet className="w-5 h-5" />}
          title="طلب عروض أسعار الموردين ومقارنة العروض (RFQ)"
          description="طرح الاحتياجات للمصانع، تسجيل العروض التنافسية، والترسية مع توليد أمر الشراء آلياً"
          actions={canCreate && (
            <button
              onClick={handleOpenNewRfq}
              className="flex items-center gap-2 px-4 py-2.5 bg-warning hover:bg-warning text-white rounded-xl text-sm font-bold shadow-md shadow-warning/20 transition shrink-0"
            >
              <Plus className="w-4 h-4" /> {newRfqLabel} (RFQ)
            </button>
          )}
        />
      </div>

      {/* Filter bar */}
      <div className="p-4 bg-surface border-b border-line flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو الملاحظات..."
            className="w-full pl-4 pr-10 py-2.5 bg-surface border border-line rounded-xl text-sm focus:outline-none focus:border-warning"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-surface-muted border border-line rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="OPEN">مفتوح لتلقي العروض</option>
          <option value="EVALUATING">قيد المقارنة والتقييم</option>
          <option value="AWARDED">تمت الترسية</option>
          <option value="CANCELLED">ملغي</option>
        </select>
        <button onClick={loadData} className="px-4 py-2.5 border border-line rounded-xl text-xs font-bold bg-surface-muted hover:bg-surface-sunken">
          تحديث
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* RFQ List */}
        <div className="w-full lg:w-1/3 border-l border-line overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-black text-muted px-1 mb-2">طلبات عروض الأسعار النشطة ({rfqs.length})</div>
          {rfqs.map((r) => {
            const isSelected = selectedRfq?.id === r.id;
            const badge = STATUS_BADGES[r.status] || { label: r.status, color: 'bg-surface-sunken' };
            return (
              <div
                key={r.id}
                onClick={() => openRfqDetails(r.id)}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-warning-soft/50 border-warning ring-2 ring-warning/20 shadow-sm'
                    : 'bg-surface border-line hover:border-line-strong hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-black text-sm text-ink">{r.rfqNumber}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>{badge.label}</span>
                </div>
                <div className="text-xs text-muted mb-2">
                  التاريخ: {r.date} {r.dueDate ? `· مهلة التقديم: ${r.dueDate}` : ''}
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary bg-surface-muted p-2 rounded-xl">
                  <span>الأصناف المطلوبة: {r.itemsCount || 0}</span>
                  <span className="text-warning font-bold">العروض المستلمة: {r.quotationsCount || 0}</span>
                </div>
              </div>
            );
          })}
          {!rfqs.length && !loading && (
            <div className="p-8 text-center text-muted border border-dashed border-line rounded-2xl text-xs">
              لا توجد طلبات عروض أسعار مسجلة
            </div>
          )}
        </div>

        {/* Selected RFQ & Comparison Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-muted">
          {selectedRfq ? (
            <div className="space-y-6">
              {/* RFQ Header Box */}
              <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-black text-ink">{selectedRfq.rfqNumber}</h2>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_BADGES[selectedRfq.status]?.color}`}>
                        {STATUS_BADGES[selectedRfq.status]?.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">
                      تم الإنشاء بواسطة: {selectedRfq.createdByName || 'المسؤول'} في {selectedRfq.date} {selectedRfq.dueDate ? `· أقصى موعد لتلقي العروض: ${selectedRfq.dueDate}` : ''}
                    </p>
                  </div>
                  {canCreate && selectedRfq.status !== 'AWARDED' && selectedRfq.status !== 'CANCELLED' && (
                    <button
                      onClick={handleOpenAddQuote}
                      className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success text-white rounded-xl text-xs font-bold shadow-md shadow-success/20 transition"
                    >
                      <Plus className="w-4 h-4" /> تسجيل عرض سعر مورد جديد
                    </button>
                  )}
                </div>

                {/* Items required */}
                <div className="mt-4">
                  <h3 className="text-xs font-black text-ink mb-2">الأصناف والكميات المطلوبة للمقارنة:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedRfq.items.map((it) => (
                      <div key={it.id} className="p-3 bg-surface-muted border border-line rounded-xl">
                        <div className="font-bold text-xs text-ink">{it.productName}</div>
                        <div className="text-xs text-muted mt-0.5">{it.categoryName || 'تشطيبات وسيراميك'}</div>
                        <div className="mt-2 text-xs font-black text-warning">الكمية المطلوبة: {formatProductQuantity(it.quantityM2, it)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quotations Comparison Matrix */}
              <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-ink">مصفوفة مقارنة عروض الأسعار التنافسية</h3>
                    <p className="text-xs text-muted">مقارنة السعر الإجمالي، مدة التوريد، شروط الدفع وجودة الفرز</p>
                  </div>
                  <div className="text-xs font-bold text-muted">
                    عدد العروض المقدمة: {selectedRfq.quotations.length}
                  </div>
                </div>

                {selectedRfq.quotations.length > 0 ? (
                  <div className="space-y-4">
                    {/* Bids cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {selectedRfq.quotations.map((q, idx) => {
                        const isCheapest = idx === 0;
                        const isAccepted = q.status === 'ACCEPTED';
                        return (
                          <div
                            key={q.id}
                            className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                              isAccepted
                                ? 'bg-success-soft/50 border-success ring-2 ring-success/20'
                                : isCheapest
                                  ? 'bg-accent-soft/40 border-accent-border'
                                  : 'bg-surface border-line'
                            }`}
                          >
                            {isAccepted && (
                              <div className="absolute top-3 left-3 bg-success text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                                <Award className="w-3 h-3" /> تم الترسية
                              </div>
                            )}
                            {isCheapest && !isAccepted && (
                              <div className="absolute top-3 left-3 bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                                <TrendingDown className="w-3 h-3" /> أقل سعر
                              </div>
                            )}

                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Building2 className="w-4 h-4 text-ink-secondary" />
                                <span className="font-black text-sm text-ink">{q.supplierName}</span>
                              </div>
                              <div className="text-xs text-muted mb-3">عرض رقم {q.quotationNumber} · هاتف: {q.supplierPhone || '—'}</div>

                              {/* Price Highlight */}
                              <div className="p-3 bg-surface border border-line rounded-xl mb-3 text-center">
                                <div className="text-xs text-muted font-semibold">إجمالي قيمة العرض</div>
                                <div className="text-lg font-black text-warning">{fmt(q.totalAmount)}</div>
                              </div>

                              {/* Attributes */}
                              <div className="space-y-1.5 text-xs text-ink-secondary mb-4">
                                <div className="flex justify-between border-b border-line pb-1">
                                  <span className="flex items-center gap-1 text-muted"><Clock className="w-3.5 h-3.5"/> موعد التوريد:</span>
                                  <span className="font-bold text-ink">{q.deliveryDays} يوم عمل</span>
                                </div>
                                <div className="flex justify-between border-b border-line pb-1">
                                  <span className="flex items-center gap-1 text-muted"><DollarSign className="w-3.5 h-3.5"/> شروط الدفع:</span>
                                  <span className="font-bold text-ink">{q.paymentTerms}</span>
                                </div>
                                <div className="flex justify-between border-b border-line pb-1">
                                  <span className="flex items-center gap-1 text-muted"><ShieldCheck className="w-3.5 h-3.5"/> تقييم الجودة/الفرز:</span>
                                  <span className="font-bold text-ink">{q.qualityRating}</span>
                                </div>
                              </div>

                              {/* Item prices table */}
                              <div className="border border-line rounded-xl overflow-hidden mb-4 text-xs">
                                <DataTable
                                  ariaLabel="أصناف عرض السعر"
                                  rows={q.items || []}
                                  rowKey={(it: any) => String(it.id)}
                                  dense
                                  columns={[
                                    { key: 'product', header: 'الصنف', render: (it: any) => <span className="font-medium">{it.productName}</span> },
                                    { key: 'price', header: 'سعر الوحدة', render: (it: any) => <span className="font-bold text-ink">{fmt(it.unitCost)} / {getProductUnitLabel(it)}</span> },
                                    { key: 'total', header: 'الإجمالي', render: (it: any) => <span className="font-black text-warning">{fmt(it.totalCost)}</span> },
                                  ]}
                                />
                              </div>
                            </div>

                            {/* Action Button */}
                            {selectedRfq.status !== 'AWARDED' && canApprove && (
                              <button
                                onClick={() => handleAwardQuotation(q)}
                                className="w-full mt-2 py-2.5 bg-warning hover:bg-warning text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition"
                              >
                                <Award className="w-4 h-4" /> ترسية العرض وإنشاء أمر شراء
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted border border-dashed border-line rounded-2xl text-xs">
                    لم يتم تسجيل أي عروض أسعار من الموردين لهذا الطلب حتى الآن. اضغط "تسجيل عرض سعر مورد جديد" للبدء.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted">
              <FileSpreadsheet className="w-16 h-16 stroke-[1.2] text-muted mb-3" />
              <h3 className="text-sm font-bold text-ink-secondary">اختر طلب عروض أسعار من القائمة للمعاينة والمقارنة</h3>
              <p className="text-xs text-muted mt-1 max-w-sm">
                يمكنك مقارنة عروض الأسعار التنافسية المقدمة من مختلف الموردين والمصانع وترسية العرض الأنسب مباشرة.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create New RFQ */}
      {newRfqModal && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h2 className="text-base font-black text-ink">إنشاء طلب عروض أسعار جديد (RFQ)</h2>
              <button onClick={() => setNewRfqModal(false)} className="p-1.5 rounded-lg hover:bg-surface-sunken"><X className="w-5 h-5 text-muted" /></button>
            </div>
            <form onSubmit={handleCreateRfq} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rfq-due-date" className="block text-xs font-bold text-ink mb-1">تاريخ أقصى موعد لتلقي العروض (Due Date)</label>
                  <input
                    id="rfq-due-date"
                    type="date"
                    value={rfqDueDate}
                    onChange={(e) => setRfqDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="rfq-notes" className="block text-xs font-bold text-ink mb-1">ملاحظات أو مواصفات خاصة للتوريد</label>
                  <input
                    id="rfq-notes"
                    type="text"
                    value={rfqNotes}
                    onChange={(e) => setRfqNotes(e.target.value)}
                    placeholder="مثال: شروط فحص كسر لا تتعدى 1%..."
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-black text-ink">الأصناف المطلوبة لعروض الأسعار</div>
                  <button
                    type="button"
                    onClick={() => setRfqLines([...rfqLines, { productId: '', quantityM2: 100, notes: '' }])}
                    className="text-xs text-warning font-bold hover:underline"
                  >
                    + إضافة صنف آخر
                  </button>
                </div>
                <div className="space-y-2">
                  {rfqLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center border border-line rounded-xl p-2.5 bg-surface-muted">
                      <ProductPicker
                        aria-label={`الصنف ${idx + 1}`}
                        value={line.productId}
                        selectedLabel={products.find((product) => product.id === line.productId)?.name}
                        ariaLabel={`استعراض أصناف طلب عرض السعر للسطر ${idx + 1}`}
                        onChange={(productId, selectedProduct) => {
                          const updated = [...rfqLines];
                          updated[idx].productId = productId;
                          updated[idx].quantityM2 = selectedProduct.productType === 'GENERAL' ? 1 : 100;
                          setRfqLines(updated);
                        }}
                        className="flex-1"
                      />
                      <input
                        aria-label={`الكمية ${idx + 1}`}
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder={`الكمية ${products.find((product) => product.id === line.productId) ? getProductUnitLabel(products.find((product) => product.id === line.productId)!) : 'بالوحدة'}`}
                        value={line.quantityM2}
                        onChange={(e) => {
                          const updated = [...rfqLines];
                          updated[idx].quantityM2 = Number(e.target.value);
                          setRfqLines(updated);
                        }}
                        className="w-24 bg-surface border rounded-lg px-2.5 py-1.5 text-xs text-center font-bold"
                        required
                      />
                      {rfqLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRfqLines(rfqLines.filter((_, i) => i !== idx))}
                          className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-line">
                <button type="button" onClick={() => setNewRfqModal(false)} className="px-4 py-2 bg-surface-sunken rounded-xl text-xs font-bold text-ink">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-warning text-white rounded-xl text-xs font-black shadow-md shadow-warning/20">
                  حفظ وطرح طلب العروض
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal: Add Supplier Quotation */}
      {quoteModal && selectedRfq && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div>
                <h2 className="text-base font-black text-ink">تسجيل عرض سعر مورد لـ {selectedRfq.rfqNumber}</h2>
                <p className="text-xs text-muted">إدخال الأسعار وشروط الدفع المقترحة من المصنع/المورد للمقارنة</p>
              </div>
              <button onClick={() => setQuoteModal(false)} className="p-1.5 rounded-lg hover:bg-surface-sunken"><X className="w-5 h-5 text-muted" /></button>
            </div>
            <form onSubmit={handleSubmitQuote} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="quote-supplier" className="block text-xs font-bold text-ink mb-1">المورد / المصنع المقدم للعرض</label>
                  <select
                    id="quote-supplier"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-surface"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.companyName || 'شركة'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="quote-number" className="block text-xs font-bold text-ink mb-1">رقم عرض سعر المورد</label>
                  <input
                    id="quote-number"
                    type="text"
                    value={quoteNumber}
                    onChange={(e) => setQuoteNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="quote-delivery-days" className="block text-xs font-bold text-ink mb-1">مدة التوريد (أيام عمل)</label>
                  <input
                    id="quote-delivery-days"
                    type="number"
                    min="1"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="quote-payment-terms" className="block text-xs font-bold text-ink mb-1">شروط الدفع المقترحة</label>
                  <input
                    id="quote-payment-terms"
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="مثال: نقدي عند الاستلام / آجل 45 يوم"
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="quote-quality-rating" className="block text-xs font-bold text-ink mb-1">درجة الجودة والفرز</label>
                  <input
                    id="quote-quality-rating"
                    type="text"
                    value={qualityRating}
                    onChange={(e) => setQualityRating(e.target.value)}
                    placeholder="فرز أول أ / سوبر..."
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="quote-valid-until" className="block text-xs font-bold text-ink mb-1">صلاحية العرض حتى تاريخ</label>
                  <input
                    id="quote-valid-until"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Price per item */}
              <div className="pt-2">
                <div className="block text-xs font-black text-ink mb-2">أسعار الأصناف في هذا العرض:</div>
                <div className="space-y-2">
                  {quoteItems.map((qi, idx) => (
                    <div key={qi.productId} className="flex items-center justify-between p-3 border rounded-xl bg-surface-muted text-xs">
                      <div className="font-bold text-ink">{qi.productName} <span className="text-muted font-normal">({formatProductQuantity(qi.quantityM2, qi)})</span></div>
                      <div className="flex items-center gap-2">
                        <span>السعر / {getProductUnitLabel(qi)}:</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={qi.unitCost}
                          onChange={(e) => {
                            const updated = [...quoteItems];
                            updated[idx].unitCost = Number(e.target.value);
                            setQuoteItems(updated);
                          }}
                          className="w-28 px-2 py-1 bg-surface border rounded-lg text-center font-bold text-warning"
                        />
                        <span>ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-warning-soft rounded-xl text-xs font-bold text-warning flex justify-between">
                  <span>إجمالي قيمة هذا العرض:</span>
                  <span>{fmt(quoteItems.reduce((s, it) => s + it.quantityM2 * it.unitCost, 0))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-line">
                <button type="button" onClick={() => setQuoteModal(false)} className="px-4 py-2 bg-surface-sunken rounded-xl text-xs font-bold text-ink">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-success text-white rounded-xl text-xs font-black shadow-md shadow-success/20">
                  حفظ وإدراج العرض للمقارنة
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
