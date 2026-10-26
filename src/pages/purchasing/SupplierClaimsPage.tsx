import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, Plus, Search, AlertTriangle, CheckCircle2,
  DollarSign, FileText, ChevronDown, Check, X, Building2,
  Layers, Package, Receipt, ArrowDownRight, Sparkles
} from 'lucide-react';
import {
  ProcurementService, SupplierClaimRow, SupplierClaimItem
} from '../../services/ProcurementService';
import { SupplierService } from '../../services/SupplierService';
import { ProductService } from '../../services/ProductService';
import { AuthService } from '../../services/AuthService';
import { PermissionService } from '../../services/PermissionService';
import { useToast } from '../../components/ui/Toast';
import type { Supplier, Product } from '../../types';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ج.م';

const CLAIM_TYPES: Record<string, { label: string; color: string }> = {
  DAMAGE_DEFECT: { label: 'كسر وعيوب تصنيع/فرز', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  SHORTAGE: { label: 'عجز أو نقص في الكمية', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  PRICE_DIFFERENCE: { label: 'فرق سعر عن أمر الشراء', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  LATE_DELIVERY: { label: 'غرامة تأخير توريد', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  OTHER: { label: 'مطالبة أخرى', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'مفتوحة / قيد الإرسال', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNDER_REVIEW: { label: 'قيد المراجعة مع المصنع', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  APPROVED: { label: 'معتمدة من المورد', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  SETTLED: { label: 'تمت التسوية والخصم', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'مرفوضة من المورد', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const SupplierClaimsPage: React.FC = () => {
  const service = useMemo(() => new ProcurementService(), []);
  const toast = useToast();
  const canCreate = PermissionService.can(AuthService.getCurrentUser(), 'purchases.create');
  const canApprove = PermissionService.can(AuthService.getCurrentUser(), 'purchases.approve');

  const [claims, setClaims] = useState<SupplierClaimRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<(SupplierClaimRow & { items: SupplierClaimItem[] }) | null>(null);

  // New Claim Modal
  const [createModal, setCreateModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [grns, setGrns] = useState<any[]>([]);

  const [claimSupplierId, setClaimSupplierId] = useState('');
  const [claimType, setClaimType] = useState<SupplierClaimRow['claimType']>('DAMAGE_DEFECT');
  const [claimSeverity, setClaimSeverity] = useState<SupplierClaimRow['severity']>('MEDIUM');
  const [claimGrnId, setClaimGrnId] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [claimLines, setClaimLines] = useState<Array<{
    productId: string;
    defectType: string;
    quantityM2: number;
    unitCost: number;
    notes: string;
  }>>([{ productId: '', defectType: 'كسر ونقص كراتين', quantityM2: 10, unitCost: 120, notes: '' }]);

  // Settlement Modal
  const [settleModal, setSettleModal] = useState(false);
  const [settleClaimTarget, setSettleClaimTarget] = useState<SupplierClaimRow | null>(null);
  const [settleResolution, setSettleResolution] = useState<'DEBIT_NOTE' | 'REPLACEMENT' | 'REFUND'>('DEBIT_NOTE');
  const [settleAgreedAmount, setSettleAgreedAmount] = useState(0);
  const [settleNotes, setSettleNotes] = useState('');

  const loadData = () => {
    setLoading(true);
    try {
      const rows = service.getAllClaims(search, statusFilter, supplierFilter);
      setClaims(rows);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل مطالبات الموردين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, supplierFilter]);

  const toggleDetails = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetails(null);
      return;
    }
    const det = service.getClaimById(id);
    setExpandedDetails(det);
    setExpandedId(id);
  };

  const openCreateModal = () => {
    try {
      const sups = new SupplierService().getAllSuppliers();
      const prods = new ProductService().getAllProducts();
      const receiptList = service.getAllGoodsReceipts('', 'ALL');

      setSuppliers(sups);
      setProducts(prods);
      setGrns(receiptList);

      setClaimSupplierId(sups[0]?.id || '');
      setClaimType('DAMAGE_DEFECT');
      setClaimSeverity('MEDIUM');
      setClaimGrnId('');
      setClaimNotes('');
      setClaimLines([{
        productId: prods[0]?.id || '',
        defectType: 'كسر ونقص كراتين',
        quantityM2: 10,
        unitCost: prods[0]?.costPrice || 120,
        notes: '',
      }]);
      setCreateModal(true);
    } catch (e: any) {
      toast.error(e?.message);
    }
  };

  const handleCreateClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimSupplierId) return toast.error('اختر المورد.');
    const validLines = claimLines.filter((l) => l.productId && Number(l.quantityM2) > 0);
    const totalClaimed = validLines.reduce((s, l) => s + Number(l.quantityM2) * Number(l.unitCost), 0);
    if (totalClaimed <= 0) return toast.error('أدخل قيمة صحيحة للمطالبة.');

    try {
      const created = service.createClaim({
        supplierId: claimSupplierId,
        grnId: claimGrnId || undefined,
        claimType,
        severity: claimSeverity,
        claimedAmount: totalClaimed,
        notes: claimNotes || undefined,
        items: validLines.map((l) => ({
          productId: l.productId,
          defectType: l.defectType,
          quantityM2: Number(l.quantityM2),
          unitCost: Number(l.unitCost),
          notes: l.notes,
        })),
      });

      toast.success(`تم تسجيل المطالبة رقم ${created.claimNumber} بنجاح.`);
      setCreateModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسجيل المطالبة.');
    }
  };

  const openSettleModal = (c: SupplierClaimRow) => {
    setSettleClaimTarget(c);
    setSettleAgreedAmount(c.claimedAmount);
    setSettleResolution('DEBIT_NOTE');
    setSettleNotes(`تسوية مطالبة ${c.claimNumber} بإشعار مدين.`);
    setSettleModal(true);
  };

  const handleSettleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleClaimTarget) return;

    try {
      service.settleClaim(settleClaimTarget.id, settleResolution, settleAgreedAmount, settleNotes);
      toast.success(
        settleResolution === 'DEBIT_NOTE'
          ? `تمت تسوية المطالبة وخصم مبلغ ${fmt(settleAgreedAmount)} من رصيد المورد وإصدار إشعار مدين.`
          : `تمت تسوية المطالبة بنجاح.`
      );
      setSettleModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تسوية المطالبة.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">مطالبات عيوب ونقص توريد الموردين</h1>
            <p className="text-xs text-slate-500 font-medium">توثيق الكسر، العيوب، فروق الأسعار، وإصدار إشعارات الخصم (Debit Notes) المعتمدة</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md shadow-rose-600/20 transition shrink-0"
          >
            <Plus className="w-4 h-4" /> تسجيل مطالبة جديدة
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
            placeholder="بحث برقم المطالبة، اسم المورد، أو الملاحظات..."
            className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="ALL">جميع الحالات</option>
          <option value="OPEN">مفتوحة</option>
          <option value="UNDER_REVIEW">قيد المراجعة</option>
          <option value="APPROVED">معتمدة</option>
          <option value="SETTLED">تمت التسوية والخصم</option>
          <option value="REJECTED">مرفوضة</option>
        </select>
        <button onClick={loadData} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100">
          تحديث
        </button>
      </div>

      {/* Claims List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {claims.map((c) => {
          const typeCfg = CLAIM_TYPES[c.claimType] || { label: c.claimType, color: 'bg-slate-50' };
          const statusCfg = STATUS_BADGES[c.status] || { label: c.status, color: 'bg-slate-50' };
          const isExpanded = expandedId === c.id;

          return (
            <article key={c.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition">
              <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center font-black text-xs text-rose-700">
                    CLM
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base text-slate-900">{c.claimNumber}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${typeCfg.color}`}>{typeCfg.label}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${statusCfg.color}`}>{statusCfg.label}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>المورد: <strong className="text-slate-800">{c.supplierName}</strong></span>
                      <span>تاريخ المطالبة: <strong>{c.date}</strong></span>
                      {c.grnNumber && <span>إذن الاستلام: <strong className="text-amber-700">{c.grnNumber}</strong></span>}
                      {c.orderNumber && <span>أمر الشراء: <strong>{c.orderNumber}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Claim Amount & Action */}
                <div className="flex items-center gap-3">
                  <div className="text-left bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <div className="text-slate-500">القيمة المطالب بها: <strong className="text-rose-600 font-black">{fmt(c.claimedAmount)}</strong></div>
                    {c.status === 'SETTLED' ? (
                      <div className="text-emerald-700 font-bold">المبلغ المسوى: <strong>{fmt(c.agreedAmount)}</strong> ({c.resolutionType === 'DEBIT_NOTE' ? 'إشعار مدين' : c.resolutionType})</div>
                    ) : (
                      <div className="text-slate-400">بانتظار التسوية والاعتماد</div>
                    )}
                  </div>

                  {c.status !== 'SETTLED' && c.status !== 'REJECTED' && canApprove && (
                    <button
                      onClick={() => openSettleModal(c)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                    >
                      تسوية وإصدار إشعار مدين
                    </button>
                  )}

                  <button
                    onClick={() => toggleDetails(c.id)}
                    className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ChevronDown className={`w-4 h-4 transition ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && expandedDetails && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-5">
                  <h4 className="text-xs font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-rose-600" /> تفاصيل أصناف المطالبة والعيوب المرصودة:
                  </h4>
                  <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <tr>
                          <th className="p-3">الصنف</th>
                          <th className="p-3">نوع العيب / المشكلة</th>
                          <th className="p-3">الكمية المتضررة</th>
                          <th className="p-3">سعر التكلفة</th>
                          <th className="p-3">إجمالي قيمة الضرر</th>
                          <th className="p-3">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expandedDetails.items.map((it) => (
                          <tr key={it.id}>
                            <td className="p-3 font-bold text-slate-900">{it.productName}</td>
                            <td className="p-3 text-rose-700 font-semibold">{it.defectType || 'كسر/تلف'}</td>
                            <td className="p-3 font-bold text-slate-800">{it.quantityM2} م²</td>
                            <td className="p-3">{fmt(it.unitCost)}</td>
                            <td className="p-3 font-black text-rose-600">{fmt(it.totalAmount)}</td>
                            <td className="p-3 text-slate-500">{it.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {expandedDetails.notes && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-600">
                      <strong>ملاحظات المطالبة: </strong> {expandedDetails.notes}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!claims.length && !loading && (
          <div className="p-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            لا توجد مطالبات مسجلة مطابقة للبحث
          </div>
        )}
      </div>

      {/* Modal: Create Claim */}
      {createModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">تسجيل مطالبة نقص أو عيوب توريد</h2>
                <p className="text-xs text-slate-500">توثيق الكسر، التلف أو العجز لخصم القيمة من حساب المورد</p>
              </div>
              <button onClick={() => setCreateModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCreateClaim} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المورد المعني بالمطالبة</label>
                  <select
                    value={claimSupplierId}
                    onChange={(e) => setClaimSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إذن الاستلام المخزني المرتبط (اختياري)</label>
                  <select
                    value={claimGrnId}
                    onChange={(e) => setClaimGrnId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="">-- غير مرتبط بإذن محدد --</option>
                    {grns.map((g) => (
                      <option key={g.id} value={g.id}>{g.grnNumber} ({g.supplierName} - {g.date})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المطالبة</label>
                  <select
                    value={claimType}
                    onChange={(e) => setClaimType(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="DAMAGE_DEFECT">كسر وتلف / عيوب تصنيع</option>
                    <option value="SHORTAGE">عجز أو نقص في كمية التوريد</option>
                    <option value="PRICE_DIFFERENCE">فرق سعر عن أمر الشراء</option>
                    <option value="LATE_DELIVERY">غرامة تأخير توريد</option>
                    <option value="OTHER">مطالبة أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">درجة الأهمية / الخطورة</label>
                  <select
                    value={claimSeverity}
                    onChange={(e) => setClaimSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                  >
                    <option value="LOW">منخفضة</option>
                    <option value="MEDIUM">متوسطة</option>
                    <option value="CRITICAL">حرجة / عاجلة</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black text-slate-800">الأصناف المتضررة / المطالب بها:</label>
                  <button
                    type="button"
                    onClick={() => setClaimLines([...claimLines, { productId: products[0]?.id || '', defectType: 'كسر ونقص كراتين', quantityM2: 5, unitCost: products[0]?.costPrice || 100, notes: '' }])}
                    className="text-xs text-rose-600 font-bold hover:underline"
                  >
                    + إضافة صنف
                  </button>
                </div>

                <div className="space-y-2">
                  {claimLines.map((line, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                      <div className="flex gap-2 items-center">
                        <select
                          value={line.productId}
                          onChange={(e) => {
                            const p = products.find((x) => x.id === e.target.value);
                            const updated = [...claimLines];
                            updated[idx].productId = e.target.value;
                            if (p) updated[idx].unitCost = p.costPrice;
                            setClaimLines(updated);
                          }}
                          className="flex-1 bg-white border rounded-lg px-2.5 py-1.5 font-bold"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0.1"
                          placeholder="الكمية م²"
                          value={line.quantityM2}
                          onChange={(e) => {
                            const updated = [...claimLines];
                            updated[idx].quantityM2 = Number(e.target.value);
                            setClaimLines(updated);
                          }}
                          className="w-24 bg-white border rounded-lg px-2 py-1.5 text-center font-bold"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="سعر المتر"
                          value={line.unitCost}
                          onChange={(e) => {
                            const updated = [...claimLines];
                            updated[idx].unitCost = Number(e.target.value);
                            setClaimLines(updated);
                          }}
                          className="w-24 bg-white border rounded-lg px-2 py-1.5 text-center font-bold"
                        />
                        {claimLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setClaimLines(claimLines.filter((_, i) => i !== idx))}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="نوع العيب وتفاصيله (مثال: كسر زوايا بالصناديق، شيد غير متناسق)..."
                        value={line.defectType}
                        onChange={(e) => {
                          const updated = [...claimLines];
                          updated[idx].defectType = e.target.value;
                          setClaimLines(updated);
                        }}
                        className="w-full bg-white border rounded-lg px-2.5 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 p-3 bg-rose-50 rounded-xl text-xs font-bold text-rose-900 flex justify-between">
                  <span>إجمالي القيمة المطالب بخصمها:</span>
                  <span className="font-black text-sm">{fmt(claimLines.reduce((s, l) => s + l.quantityM2 * l.unitCost, 0))}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية وتوثيق المطالبة</label>
                <textarea
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="رقم محضر الفحص، أسماء الشهود أو تفاصيل الاتفاق مع مندوب المصنع..."
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setCreateModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/20">
                  تسجيل المطالبة
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal: Settlement / Debit Note */}
      {settleModal && settleClaimTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">تسوية مطالبة {settleClaimTarget.claimNumber}</h2>
                <p className="text-xs text-slate-500">المورد: {settleClaimTarget.supplierName}</p>
              </div>
              <button onClick={() => setSettleModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSettleClaim} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة التسوية المتفق عليها</label>
                <select
                  value={settleResolution}
                  onChange={(e) => setSettleResolution(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white"
                >
                  <option value="DEBIT_NOTE">إشعار مدين (Debit Note) - خصم آلي من رصيد حساب المورد</option>
                  <option value="REFUND">استرداد نقدي من المورد لخزينة المعرض</option>
                  <option value="REPLACEMENT">توريد بضاعة تعويضية بديلة بدون مقابل</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المتفق على تسويته (ج.م)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settleAgreedAmount}
                  onChange={(e) => setSettleAgreedAmount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border rounded-xl text-sm font-black text-emerald-700"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  القيمة المطالب بها في البداية كانت: {fmt(settleClaimTarget.claimedAmount)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات التسوية ورقم الإشعار</label>
                <textarea
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setSettleModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20">
                  تأكيد التسوية والخصم
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
