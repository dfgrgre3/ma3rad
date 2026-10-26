import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Search, CheckCircle2, XCircle, ArrowRight,
  TrendingDown, Clock, ShieldCheck, DollarSign, Building2,
  Calendar, Layers, Check, X, Award, Eye, FileSpreadsheet
} from 'lucide-react';
import {
  ProcurementService, SupplierRfqRow, SupplierRfqItem,
  SupplierQuotationRow, SupplierQuotationItem
} from '../../services/ProcurementService';
import { SupplierService } from '../../services/SupplierService';
import { ProductService } from '../../services/ProductService';
import { OperationsService } from '../../services/OperationsService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';
import type { Supplier, Product } from '../../types';
import { formatProductQuantity, getProductUnitLabel } from '../../utils/productUnits';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'مفتوح لتلقي العروض', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  EVALUATING: { label: 'قيد المقارنة والتقييم', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  AWARDED: { label: 'تمت الترسية', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'ملغي', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export const SupplierQuotationsPage: React.FC = () => {
  const service = useMemo(() => new ProcurementService(), []);
  const toast = useToast();
  const canCreate = PermissionService.can(AuthService.getCurrentUser(), 'purchases.create');
  const canApprove = PermissionService.can(AuthService.getCurrentUser(), 'purchases.approve');

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

  const loadData = () => {
    setLoading(true);
    try {
      const data = service.getAllRfqs(search, statusFilter);
      setRfqs(data);
      if (selectedRfq) {
        const refreshed = service.getRfqById(selectedRfq.id);
        setSelectedRfq(refreshed);
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل طلبات عروض الأسعار.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const openRfqDetails = (id: string) => {
    const details = service.getRfqById(id);
    setSelectedRfq(details);
  };

  const handleOpenNewRfq = () => {
    try {
      setProducts(new ProductService().getAllProducts());
      setRfqDueDate('');
      setRfqNotes('');
      setRfqLines([{ productId: '', quantityM2: 100, notes: '' }]);
      setNewRfqModal(true);
    } catch (e: any) {
      toast.error(e?.message);
    }
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
    try {
      const sups = new SupplierService().getAllSuppliers();
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
      const result = service.awardQuotation(quotation.id, true, defaultWh);
      toast.success('تمت ترسية العرض بنجاح وإنشاء أمر الشراء المرتبط به.');
      loadData();
      if (selectedRfq) openRfqDetails(selectedRfq.id);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر ترسية العرض.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">طلب عروض أسعار الموردين ومقارنة العروض (RFQ)</h1>
            <p className="text-xs text-slate-500 font-medium">طرح الاحتياجات للمصانع، تسجيل العروض التنافسية، والترسية مع توليد أمر الشراء آلياً</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={handleOpenNewRfq}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md shadow-orange-600/20 transition shrink-0"
          >
            <Plus className="w-4 h-4" /> طلب عروض أسعار جديد (RFQ)
          </button>
        )}
      </header>

      {/* Filter bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو الملاحظات..."
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="OPEN">مفتوح لتلقي العروض</option>
          <option value="EVALUATING">قيد المقارنة والتقييم</option>
          <option value="AWARDED">تمت الترسية</option>
          <option value="CANCELLED">ملغي</option>
        </select>
        <button onClick={loadData} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100">
          تحديث
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* RFQ List */}
        <div className="w-full lg:w-1/3 border-l border-slate-200 overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-black text-slate-400 px-1 mb-2">طلبات عروض الأسعار النشطة ({rfqs.length})</div>
          {rfqs.map((r) => {
            const isSelected = selectedRfq?.id === r.id;
            const badge = STATUS_BADGES[r.status] || { label: r.status, color: 'bg-slate-100' };
            return (
              <div
                key={r.id}
                onClick={() => openRfqDetails(r.id)}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-orange-50/50 border-orange-300 ring-2 ring-orange-400/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-black text-sm text-slate-900">{r.rfqNumber}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>{badge.label}</span>
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  التاريخ: {r.date} {r.dueDate ? `· مهلة التقديم: ${r.dueDate}` : ''}
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 bg-slate-50 p-2 rounded-xl">
                  <span>الأصناف المطلوبة: {r.itemsCount || 0}</span>
                  <span className="text-orange-700 font-bold">العروض المستلمة: {r.quotationsCount || 0}</span>
                </div>
              </div>
            );
          })}
          {!rfqs.length && !loading && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl text-xs">
              لا توجد طلبات عروض أسعار مسجلة
            </div>
          )}
        </div>

        {/* Selected RFQ & Comparison Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {selectedRfq ? (
            <div className="space-y-6">
              {/* RFQ Header Box */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-black text-slate-900">{selectedRfq.rfqNumber}</h2>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${STATUS_BADGES[selectedRfq.status]?.color}`}>
                        {STATUS_BADGES[selectedRfq.status]?.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      تم الإنشاء بواسطة: {selectedRfq.createdByName || 'المسؤول'} في {selectedRfq.date} {selectedRfq.dueDate ? `· أقصى موعد لتلقي العروض: ${selectedRfq.dueDate}` : ''}
                    </p>
                  </div>
                  {canCreate && selectedRfq.status !== 'AWARDED' && selectedRfq.status !== 'CANCELLED' && (
                    <button
                      onClick={handleOpenAddQuote}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                    >
                      <Plus className="w-4 h-4" /> تسجيل عرض سعر مورد جديد
                    </button>
                  )}
                </div>

                {/* Items required */}
                <div className="mt-4">
                  <h3 className="text-xs font-black text-slate-700 mb-2">الأصناف والكميات المطلوبة للمقارنة:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedRfq.items.map((it) => (
                      <div key={it.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="font-bold text-xs text-slate-900">{it.productName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{it.categoryName || 'تشطيبات وسيراميك'}</div>
                        <div className="mt-2 text-xs font-black text-orange-600">الكمية المطلوبة: {formatProductQuantity(it.quantityM2, it)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quotations Comparison Matrix */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">مصفوفة مقارنة عروض الأسعار التنافسية</h3>
                    <p className="text-xs text-slate-500">مقارنة السعر الإجمالي، مدة التوريد، شروط الدفع وجودة الفرز</p>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
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
                                ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/20'
                                : isCheapest
                                  ? 'bg-sky-50/40 border-sky-300'
                                  : 'bg-white border-slate-200'
                            }`}
                          >
                            {isAccepted && (
                              <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                                <Award className="w-3 h-3" /> تم الترسية
                              </div>
                            )}
                            {isCheapest && !isAccepted && (
                              <div className="absolute top-3 left-3 bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                                <TrendingDown className="w-3 h-3" /> أقل سعر
                              </div>
                            )}

                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Building2 className="w-4 h-4 text-slate-600" />
                                <span className="font-black text-sm text-slate-900">{q.supplierName}</span>
                              </div>
                              <div className="text-xs text-slate-500 mb-3">عرض رقم {q.quotationNumber} · هاتف: {q.supplierPhone || '—'}</div>

                              {/* Price Highlight */}
                              <div className="p-3 bg-white border border-slate-200 rounded-xl mb-3 text-center">
                                <div className="text-xs text-slate-500 font-semibold">إجمالي قيمة العرض</div>
                                <div className="text-lg font-black text-orange-600">{fmt(q.totalAmount)}</div>
                              </div>

                              {/* Attributes */}
                              <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="flex items-center gap-1 text-slate-500"><Clock className="w-3.5 h-3.5"/> موعد التوريد:</span>
                                  <span className="font-bold text-slate-900">{q.deliveryDays} يوم عمل</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="flex items-center gap-1 text-slate-500"><DollarSign className="w-3.5 h-3.5"/> شروط الدفع:</span>
                                  <span className="font-bold text-slate-900">{q.paymentTerms}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-100 pb-1">
                                  <span className="flex items-center gap-1 text-slate-500"><ShieldCheck className="w-3.5 h-3.5"/> تقييم الجودة/الفرز:</span>
                                  <span className="font-bold text-slate-900">{q.qualityRating}</span>
                                </div>
                              </div>

                              {/* Item prices table */}
                              <div className="border border-slate-100 rounded-xl overflow-hidden mb-4 text-xs">
                                <table className="w-full text-right">
                                  <thead className="bg-slate-50 text-[10px] text-slate-500 font-bold">
                                    <tr>
                                      <th className="p-2">الصنف</th>
                                      <th className="p-2">سعر الوحدة</th>
                                      <th className="p-2">الإجمالي</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(q.items || []).map((it) => (
                                      <tr key={it.id} className="border-t border-slate-100">
                                        <td className="p-2 font-medium">{it.productName}</td>
                                        <td className="p-2 font-bold text-slate-900">{fmt(it.unitCost)} / {getProductUnitLabel(it)}</td>
                                        <td className="p-2 font-black text-orange-600">{fmt(it.totalCost)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Action Button */}
                            {selectedRfq.status !== 'AWARDED' && canApprove && (
                              <button
                                onClick={() => handleAwardQuotation(q)}
                                className="w-full mt-2 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition"
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
                  <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl text-xs">
                    لم يتم تسجيل أي عروض أسعار من الموردين لهذا الطلب حتى الآن. اضغط "تسجيل عرض سعر مورد جديد" للبدء.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <FileSpreadsheet className="w-16 h-16 stroke-[1.2] text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-600">اختر طلب عروض أسعار من القائمة للمعاينة والمقارنة</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                يمكنك مقارنة عروض الأسعار التنافسية المقدمة من مختلف الموردين والمصانع وترسية العرض الأنسب مباشرة.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create New RFQ */}
      {newRfqModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900">إنشاء طلب عروض أسعار جديد (RFQ)</h2>
              <button onClick={() => setNewRfqModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateRfq} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ أقصى موعد لتلقي العروض (Due Date)</label>
                  <input
                    type="date"
                    value={rfqDueDate}
                    onChange={(e) => setRfqDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات أو مواصفات خاصة للتوريد</label>
                  <input
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
                  <label className="text-xs font-black text-slate-800">الأصناف المطلوبة لعروض الأسعار</label>
                  <button
                    type="button"
                    onClick={() => setRfqLines([...rfqLines, { productId: '', quantityM2: 100, notes: '' }])}
                    className="text-xs text-orange-600 font-bold hover:underline"
                  >
                    + إضافة صنف آخر
                  </button>
                </div>
                <div className="space-y-2">
                  {rfqLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const updated = [...rfqLines];
                          updated[idx].productId = e.target.value;
                          const selectedProduct = products.find((product) => product.id === e.target.value);
                          if (selectedProduct) updated[idx].quantityM2 = selectedProduct.productType === 'GENERAL' ? 1 : 100;
                          setRfqLines(updated);
                        }}
                        required
                        className="flex-1 bg-white border rounded-lg px-2.5 py-1.5 text-xs font-bold"
                      >
                        <option value="">-- اختر الصنف من الدليل --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) - {getProductUnitLabel(p)}
                          </option>
                        ))}
                      </select>
                      <input
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
                        className="w-24 bg-white border rounded-lg px-2.5 py-1.5 text-xs text-center font-bold"
                        required
                      />
                      {rfqLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRfqLines(rfqLines.filter((_, i) => i !== idx))}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setNewRfqModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-orange-600 text-white rounded-xl text-xs font-black shadow-md shadow-orange-600/20">
                  حفظ وطرح طلب العروض
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal: Add Supplier Quotation */}
      {quoteModal && selectedRfq && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">تسجيل عرض سعر مورد لـ {selectedRfq.rfqNumber}</h2>
                <p className="text-xs text-slate-500">إدخال الأسعار وشروط الدفع المقترحة من المصنع/المورد للمقارنة</p>
              </div>
              <button onClick={() => setQuoteModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmitQuote} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المورد / المصنع المقدم للعرض</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.companyName || 'شركة'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم عرض سعر المورد</label>
                  <input
                    type="text"
                    value={quoteNumber}
                    onChange={(e) => setQuoteNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مدة التوريد (أيام عمل)</label>
                  <input
                    type="number"
                    min="1"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">شروط الدفع المقترحة</label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="مثال: نقدي عند الاستلام / آجل 45 يوم"
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">درجة الجودة والفرز</label>
                  <input
                    type="text"
                    value={qualityRating}
                    onChange={(e) => setQualityRating(e.target.value)}
                    placeholder="فرز أول أ / سوبر..."
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">صلاحية العرض حتى تاريخ</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Price per item */}
              <div className="pt-2">
                <label className="block text-xs font-black text-slate-800 mb-2">أسعار الأصناف في هذا العرض:</label>
                <div className="space-y-2">
                  {quoteItems.map((qi, idx) => (
                    <div key={qi.productId} className="flex items-center justify-between p-3 border rounded-xl bg-slate-50 text-xs">
                      <div className="font-bold text-slate-900">{qi.productName} <span className="text-slate-500 font-normal">({formatProductQuantity(qi.quantityM2, qi)})</span></div>
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
                          className="w-28 px-2 py-1 bg-white border rounded-lg text-center font-bold text-orange-600"
                        />
                        <span>ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-orange-50 rounded-xl text-xs font-bold text-orange-900 flex justify-between">
                  <span>إجمالي قيمة هذا العرض:</span>
                  <span>{fmt(quoteItems.reduce((s, it) => s + it.quantityM2 * it.unitCost, 0))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setQuoteModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20">
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
