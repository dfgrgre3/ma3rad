import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePercent, Boxes, Calculator, ClipboardList, Eye, FileText, LayoutGrid, Printer, RefreshCw, Search, Send, Warehouse, Wrench,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { FormField } from '../../../components/ui/FormField';
import { useToast } from '../../../components/ui/Toast';
import { usePermission } from '../../../hooks/domains/auth/usePermission';
import { CustomerService } from '../../../services/domains/customers/CustomerService';
import type { Customer } from '../../../types';
import {
  CeramicsService,
  type CeramicAreaQuote,
  type CeramicDesign,
  type CeramicQuoteStatus,
  type CeramicSampleRow,
  type CeramicServiceOrder,
  type CeramicServiceStatus,
  type CeramicServiceType,
  type CeramicCommission,
  type CeramicCommissionStatus,
  type CeramicStockRow,
  type CeramicTopDesign,
} from '../../../services/domains/ceramics/CeramicsService';
import type { ProductBatch } from '../../../types';
import { CeramicMath } from '../../../utils/products/ceramicMath';
import { PrintService } from '../../../services/shared/PrintService';
import { ActivityGate } from '../../../components/ui/ActivityGate';

const currency = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const fmt = (n: number) => currency.format(n || 0);
const fmtM2 = (n: number) => `${fmt(n)} م²`;

const inputCls = 'w-full rounded-lg border border-[var(--cerami-border)] bg-[var(--cerami-surface)] px-3 py-2 text-sm';
const selectCls = inputCls;

const GRADE_LABELS: Record<string, string> = {
  GRADE_1: 'فرز أول', GRADE_2: 'فرز ثاني', GRADE_3: 'فرز ثالث', COMMERCIAL: 'تجاري',
};
const gradeLabel = (grade: string) => GRADE_LABELS[grade] || grade || '—';

const SURFACE_LABELS: Record<string, string> = {
  FLOOR: 'أرضيات', WALL: 'حوائط', OUTDOOR: 'خارجي', GENERAL: 'عام',
};
const surfaceLabel = (s?: string | null) => (s ? SURFACE_LABELS[s] || s : '');

const QUOTE_STATUS_LABEL: Record<CeramicQuoteStatus, string> = {
  DRAFT: 'مسودة', SENT: 'مُرسل', ACCEPTED: 'مقبول', REJECTED: 'مرفوض',
};
const QUOTE_STATUS_CLS: Record<CeramicQuoteStatus, string> = {
  DRAFT: 'bg-surface-sunken text-ink-secondary', SENT: 'bg-accent-soft text-primary',
  ACCEPTED: 'bg-success-soft text-success', REJECTED: 'bg-danger-soft text-danger',
};

const SERVICE_TYPE_LABEL: Record<CeramicServiceType, string> = {
  CUTTING: 'قص وتقطيع', INSTALLATION: 'تركيب', DELIVERY: 'توصيل', CUTTING_INSTALLATION: 'قص وتركيب',
};
const SERVICE_STATUS_LABEL: Record<CeramicServiceStatus, string> = {
  PENDING: 'منتظر', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي',
};
const SERVICE_STATUS_CLS: Record<CeramicServiceStatus, string> = {
  PENDING: 'bg-warning-soft text-warning', IN_PROGRESS: 'bg-accent-soft text-primary',
  COMPLETED: 'bg-success-soft text-success', CANCELLED: 'bg-surface-sunken text-muted',
};
const COMMISSION_STATUS_LABEL: Record<CeramicCommissionStatus, string> = {
  PENDING: 'مستحقة', PAID: 'مدفوعة', CANCELLED: 'ملغاة',
};
const COMMISSION_STATUS_CLS: Record<CeramicCommissionStatus, string> = {
  PENDING: 'bg-warning-soft text-warning', PAID: 'bg-success-soft text-success',
  CANCELLED: 'bg-surface-sunken text-muted',
};

interface CalcLine {
  key: string;
  productId: string;
  productName: string;
  areaM2: number;
  wastePercent: number;
  requiredM2: number;
  boxesNeeded: number;
  metersPerBox: number;
  piecesPerBox: number;
  unitPriceM2: number;
  totalAmount: number;
}

export const CeramicsPage: React.FC = () => {
  const service = useMemo(() => new CeramicsService(), []);
  const toast = useToast();
  const can = usePermission();
  const canManage = can('sales.create');
  const canQuote = can('quotations.create');

  const [tab, setTab] = useState<'designs' | 'calculator' | 'quotes' | 'services' | 'commissions' | 'stock' | 'samples'>('designs');
  const [loading, setLoading] = useState(true);
  const [designs, setDesigns] = useState<CeramicDesign[]>([]);
  const [stockRows, setStockRows] = useState<CeramicStockRow[]>([]);
  const [quotes, setQuotes] = useState<CeramicAreaQuote[]>([]);
  const [serviceOrders, setServiceOrders] = useState<CeramicServiceOrder[]>([]);
  const [commissions, setCommissions] = useState<CeramicCommission[]>([]);
  const [samples, setSamples] = useState<CeramicSampleRow[]>([]);
  const [topDesigns, setTopDesigns] = useState<CeramicTopDesign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<ReturnType<CeramicsService['getDashboardStats']> | null>(null);
  const [batchesProduct, setBatchesProduct] = useState<CeramicStockRow | null>(null);
  const [batches, setBatches] = useState<ProductBatch[]>([]);

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState('');
  const [stockSearch, setStockSearch] = useState('');

  // calculator state
  const [calcProductId, setCalcProductId] = useState('');
  const [calcLength, setCalcLength] = useState('');
  const [calcWidth, setCalcWidth] = useState('');
  const [calcArea, setCalcArea] = useState('');
  const [calcWaste, setCalcWaste] = useState('10');
  const [calcPriceMode, setCalcPriceMode] = useState<'m2' | 'box'>('m2');
  const [calcLines, setCalcLines] = useState<CalcLine[]>([]);

  // quote modal
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ customerId: '', notes: '' });

  // service order modal
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    customerId: '', customerName: '', siteAddress: '', serviceType: 'CUTTING' as CeramicServiceType,
    areaM2: '', boxesCount: '', unitPrice: '', scheduledDate: '', notes: '',
  });

  // commission modal
  const [commissionModal, setCommissionModal] = useState(false);
  const [commissionForm, setCommissionForm] = useState({
    partnerName: '', partnerPhone: '', customerId: '', customerName: '',
    saleReference: '', baseAmount: '', percent: '', amount: '', notes: '',
  });

  const run = useCallback((fn: () => void) => {
    try { fn(); } catch (e: any) { toast.error('خطأ', e?.message || 'حدث خطأ'); }
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    try {
      setDesigns(service.getDesigns());
      setStockRows(service.getStockRows());
      setQuotes(service.getAreaQuotes());
      setServiceOrders(service.getServiceOrders());
      setCommissions(service.getCommissions());
      setSamples(service.getDisplaySamples());
      setTopDesigns(service.getTopSellingDesigns(30, 5));
      setStats(service.getDashboardStats());
      setCustomers(can('customers.view') ? new CustomerService().getAllCustomers() : []);
    } catch (e: any) {
      toast.error('تعذر تحميل بيانات السيراميك', e?.message);
    } finally {
      setLoading(false);
    }
  }, [service, can, toast]);

  useEffect(() => { load(); }, [load]);

  const filteredDesigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return designs.filter((d) => {
      if (term && !(`${d.name} ${d.brandName}`.toLowerCase().includes(term))) return false;
      return d.variants.some((v) => {
        if (gradeFilter && v.product.grade !== gradeFilter) return false;
        if (surfaceFilter && (v.product.surfaceLocation || 'GENERAL') !== surfaceFilter) return false;
        return true;
      });
    }).map((d) => ({
      ...d,
      variants: d.variants.filter((v) =>
        (!gradeFilter || v.product.grade === gradeFilter)
        && (!surfaceFilter || (v.product.surfaceLocation || 'GENERAL') === surfaceFilter)
      ),
    })).filter((d) => d.variants.length > 0);
  }, [designs, search, gradeFilter, surfaceFilter]);

  const calcProduct = useMemo(
    () => stockRows.find((r) => r.productId === calcProductId) || null,
    [stockRows, calcProductId]
  );

  const areaFromInputs = useMemo(() => {
    const l = Number(calcLength);
    const w = Number(calcWidth);
    if (Number.isFinite(l) && Number.isFinite(w) && l > 0 && w > 0) return round2Local(l * w);
    const a = Number(calcArea);
    return Number.isFinite(a) && a > 0 ? a : 0;
  }, [calcLength, calcWidth, calcArea]);

  const calc = useMemo(() => {
    if (!calcProduct || areaFromInputs <= 0) return null;
    const waste = Number(calcWaste) || 0;
    const pricePerM2 = calcPriceMode === 'm2'
      ? calcProduct.sellingPriceM2
      : CeramicMath.calculateMeterPrice(calcProduct.sellingPriceBox || calcProduct.sellingPriceM2 * calcProduct.metersPerBox, calcProduct.metersPerBox);
    return service.calculateArea({
      areaM2: areaFromInputs,
      wastePercent: waste,
      metersPerBox: calcProduct.metersPerBox,
      piecesPerBox: calcProduct.piecesPerBox,
      pricePerM2,
    });
  }, [service, calcProduct, areaFromInputs, calcWaste, calcPriceMode]);

  const addCalcLine = () => {
    if (!calcProduct || !calc) { toast.error('تنبيه', 'اختر الصنف وأدخل المساحة أولًا.'); return; }
    if (calc.boxesNeeded <= 0) { toast.error('تنبيه', 'لا يمكن حساب الكراتين — تأكد من مساحة الكرتونة.'); return; }
    const line: CalcLine = {
      key: `${calcProduct.productId}-${Date.now()}`,
      productId: calcProduct.productId,
      productName: `${calcProduct.name} — ${gradeLabel(calcProduct.grade)} ${calcProduct.size}`,
      areaM2: calc.areaM2,
      wastePercent: calc.wastePercent,
      requiredM2: calc.requiredM2,
      boxesNeeded: calc.boxesNeeded,
      metersPerBox: calcProduct.metersPerBox,
      piecesPerBox: calcProduct.piecesPerBox,
      unitPriceM2: calcPriceMode === 'm2' ? calcProduct.sellingPriceM2 : CeramicMath.calculateMeterPrice(calcProduct.sellingPriceBox || calcProduct.sellingPriceM2 * calcProduct.metersPerBox, calcProduct.metersPerBox),
      totalAmount: calc.totalByMeter,
    };
    setCalcLines((prev) => [...prev, line]);
    setCalcLength(''); setCalcWidth(''); setCalcArea('');
  };

  const saveQuotes = () => {
    if (calcLines.length === 0) { toast.error('تنبيه', 'أضف بندًا واحدًا على الأقل للمقايسة.'); return; }
    run(() => {
      for (const line of calcLines) {
        service.saveAreaQuote({
          customerId: quoteForm.customerId || undefined,
          customerName: customers.find((c) => c.id === quoteForm.customerId)?.name || undefined,
          productId: line.productId,
          productName: line.productName,
          areaM2: line.areaM2,
          wastePercent: line.wastePercent,
          requiredM2: line.requiredM2,
          boxesNeeded: line.boxesNeeded,
          metersPerBox: line.metersPerBox,
          piecesPerBox: line.piecesPerBox,
          unitPriceM2: line.unitPriceM2,
          totalAmount: line.totalAmount,
          notes: quoteForm.notes || undefined,
        });
      }
      setQuoteModal(false);
      setCalcLines([]);
      setQuoteForm({ customerId: '', notes: '' });
      toast.success('تم حفظ مقاييسات المساحة');
      load();
    });
  };

  const saveServiceOrder = () => {
    if (!serviceForm.customerName.trim() && !serviceForm.customerId) {
      toast.error('تنبيه', 'اختر العميل أو اكتب اسمه.'); return;
    }
    run(() => {
      service.saveServiceOrder({
        customerId: serviceForm.customerId || undefined,
        customerName: serviceForm.customerName || customers.find((c) => c.id === serviceForm.customerId)?.name || undefined,
        siteAddress: serviceForm.siteAddress || undefined,
        serviceType: serviceForm.serviceType,
        areaM2: Number(serviceForm.areaM2) || 0,
        boxesCount: Number(serviceForm.boxesCount) || 0,
        unitPrice: Number(serviceForm.unitPrice) || 0,
        scheduledDate: serviceForm.scheduledDate || undefined,
        notes: serviceForm.notes || undefined,
      });
      setServiceModal(false);
      setServiceForm({ customerId: '', customerName: '', siteAddress: '', serviceType: 'CUTTING', areaM2: '', boxesCount: '', unitPrice: '', scheduledDate: '', notes: '' });
      toast.success('تم حفظ أمر الخدمة');
      load();
    });
  };

  const saveCommission = () => {
    run(() => {
      service.saveCommission({
        partnerName: commissionForm.partnerName,
        partnerPhone: commissionForm.partnerPhone || undefined,
        customerId: commissionForm.customerId || undefined,
        customerName: commissionForm.customerName || customers.find((c) => c.id === commissionForm.customerId)?.name || undefined,
        saleReference: commissionForm.saleReference || undefined,
        baseAmount: Number(commissionForm.baseAmount) || 0,
        percent: commissionForm.percent ? Number(commissionForm.percent) : undefined,
        amount: commissionForm.amount ? Number(commissionForm.amount) : undefined,
        notes: commissionForm.notes || undefined,
      });
      setCommissionModal(false);
      setCommissionForm({ partnerName: '', partnerPhone: '', customerId: '', customerName: '', saleReference: '', baseAmount: '', percent: '', amount: '', notes: '' });
      toast.success('تم حفظ العمولة');
      load();
    });
  };

  const openBatches = (row: CeramicStockRow) => {
    setBatchesProduct(row);
    run(() => setBatches(service.getProductBatches(row.productId)));
  };

  const convertTakeoff = (quoteNumber: string) => {
    run(() => {
      const quotation = service.convertTakeoffToQuotation(quoteNumber);
      toast.success('تم إنشاء عرض السعر', quotation.quotationNumber);
      load();
    });
  };

  const printTakeoff = (quoteNumber: string) => {
    const lines = quotes.filter((q) => q.quoteNumber === quoteNumber);
    if (lines.length === 0) return;
    new PrintService().printAreaTakeoff(lines);
  };

  const preselectProduct = (productId: string) => {
    setCalcProductId(productId);
    setCalcLines([]);
    setTab('calculator');
  };

  const tabs = [
    { id: 'designs' as const, label: 'التصميمات والأصناف', icon: LayoutGrid },
    { id: 'calculator' as const, label: 'حاسبة المساحة', icon: Calculator },
    { id: 'quotes' as const, label: 'مقاييسات المساحات', icon: ClipboardList },
    { id: 'services' as const, label: 'خدمات القص والتركيب', icon: Wrench },
    { id: 'commissions' as const, label: 'عمولات المهندسين', icon: BadgePercent },
    { id: 'stock' as const, label: 'مخزون الصالة والمخزن', icon: Warehouse },
    { id: 'samples' as const, label: 'العينات المعروضة', icon: Eye },
  ];

  const grades = useMemo(() => [...new Set(stockRows.map((r) => r.grade).filter(Boolean))].sort(), [stockRows]);
  const surfaces = useMemo(() => [...new Set(stockRows.map((r) => r.surfaceLocation || 'GENERAL'))].sort(), [stockRows]);
  const calcTotal = calcLines.reduce((s, l) => s + l.totalAmount, 0);
  const filteredStock = useMemo(() => {
    const term = stockSearch.trim().toLowerCase();
    if (!term) return stockRows;
    return stockRows.filter((r) => `${r.name} ${r.sku} ${r.brandName || ''} ${r.size}`.toLowerCase().includes(term));
  }, [stockRows, stockSearch]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="صالة السيراميك والتصميمات"
        description="التصميمات والأصناف بالفرز والمقاس، حاسبة مساحة الغرف، ومقاييسات الكراتين والعرض."
        icon={<LayoutGrid className="w-6 h-6" />}
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} leadingIcon={<RefreshCw className="w-4 h-4" />}>تحديث</Button>
        </div>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="التصميمات" value={stats?.designsCount ?? 0} />
        <StatCard label="أصناف السيراميك" value={stats?.skusCount ?? 0} />
        <StatCard label="مساحة المعرض" value={fmtM2(stats?.showroomM2 ?? 0)} />
        <StatCard label="أصناف تحت حد الطلب" value={stats?.lowStockCount ?? 0} tone={stats?.lowStockCount ? 'danger' : undefined} />
        <StatCard label="مقاييسات مفتوحة" value={stats?.openQuotes ?? 0} />
        <StatCard label="قيمة مقاييسات مفتوحة" value={fmt(stats?.openQuotesAmount ?? 0)} />
        <StatCard label="أوامر خدمة مفتوحة" value={stats?.openServiceOrders ?? 0} />
        <StatCard label="عمولات مستحقة" value={fmt(stats?.pendingCommissionsAmount ?? 0)} tone={stats?.pendingCommissions ? 'warning' : undefined} />
      </div>

      <div className="flex gap-1 border-b border-[var(--cerami-border)] flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-[var(--cerami-primary)] text-[var(--cerami-primary)]' : 'border-transparent text-[var(--cerami-muted)] hover:text-[var(--cerami-text)]'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-line border-primary rounded-full animate-spin" /></div>
      ) : tab === 'designs' ? (
        <div className="space-y-4">
          <Card padding="sm" className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--cerami-muted)]" />
              <input className={`${inputCls} pr-9`} placeholder="بحث بالتصميم أو الماركة..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FormField label="الفرز"><select className={`${selectCls} w-36`} value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}><option value="">كل الفرز</option>{grades.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}</select></FormField>
            <FormField label="الاستخدام"><select className={`${selectCls} w-32`} value={surfaceFilter} onChange={(e) => setSurfaceFilter(e.target.value)}><option value="">الكل</option>{surfaces.map((s) => <option key={s} value={s}>{surfaceLabel(s)}</option>)}</select></FormField>
          </Card>
          {topDesigns.length > 0 && (
            <Card padding="sm">
              <CardHeader title="الأكثر مبيعًا — آخر 30 يومًا" />
              <div className="mt-2 flex flex-wrap gap-2">
                {topDesigns.map((d, i) => (
                  <span key={d.name} className="inline-flex items-center gap-2 rounded-full border border-[var(--cerami-border)] bg-[var(--cerami-bg)] px-3 py-1 text-xs">
                    <span className="font-bold text-[var(--cerami-muted)]">{i + 1}.</span>
                    <span className="font-semibold">{d.name}{d.brandName ? ` — ${d.brandName}` : ''}</span>
                    <span className="text-[var(--cerami-muted)]">{fmtM2(d.totalM2)} • {fmt(d.totalAmount)}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredDesigns.map((d) => (
              <Card key={d.key} padding="sm" className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-bold">{d.name}</h3>
                    <p className="text-xs text-[var(--cerami-muted)]">{d.brandName || 'بدون ماركة'} • {d.variants.length} صنف</p>
                  </div>
                  <span className="text-[11px] bg-[var(--cerami-bg)] px-2 py-1 rounded-full whitespace-nowrap">{fmtM2(d.totalM2)}</span>
                </div>
                <div className="text-[11px] text-[var(--cerami-muted)] flex gap-3">
                  <span>معرض: <b className="text-success">{fmtM2(d.showroomM2)}</b></span>
                  <span>مخزن: <b>{fmtM2(d.storeM2)}</b></span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.variants.slice(0, 6).map((v) => (
                    <button key={v.product.id} onClick={() => preselectProduct(v.product.id)}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-accent-soft text-primary border border-accent-border hover:bg-accent-soft"
                      title={`${gradeLabel(v.product.grade)} • ${v.product.size}${v.product.finish ? ` • ${v.product.finish}` : ''}`}>
                      {gradeLabel(v.product.grade)} {v.product.size}
                    </button>
                  ))}
                  {d.variants.length > 6 && <span className="text-[10px] text-[var(--cerami-muted)] self-center">+{d.variants.length - 6}</span>}
                </div>
              </Card>
            ))}
            {filteredDesigns.length === 0 && <Card className="col-span-full"><p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد تصميمات مطابقة.</p></Card>}
          </div>
        </div>
      ) : tab === 'calculator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="sm" className="space-y-3">
            <CardHeader title="حساب مساحة الغرفة" />
            <FormField label="الصنف (تصميم/فرز/مقاس)" required>
              <select className={selectCls} value={calcProductId} onChange={(e) => setCalcProductId(e.target.value)}>
                <option value="">اختر الصنف...</option>
                {stockRows.map((r) => (
                  <option key={r.productId} value={r.productId}>
                    {r.name} — {gradeLabel(r.grade)} {r.size}{r.finish ? ` • ${r.finish}` : ''}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="الطول (م)"><input type="number" step="0.01" className={inputCls} value={calcLength} onChange={(e) => setCalcLength(e.target.value)} /></FormField>
              <FormField label="العرض (م)"><input type="number" step="0.01" className={inputCls} value={calcWidth} onChange={(e) => setCalcWidth(e.target.value)} /></FormField>
              <FormField label="أو المساحة (م²)"><input type="number" step="0.01" className={inputCls} value={calcArea} onChange={(e) => setCalcArea(e.target.value)} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="نسبة الهالك / الفاقد %"><input type="number" min="0" className={inputCls} value={calcWaste} onChange={(e) => setCalcWaste(e.target.value)} /></FormField>
              <FormField label="وحدة السعر">
                <select className={selectCls} value={calcPriceMode} onChange={(e) => setCalcPriceMode(e.target.value as 'm2' | 'box')}>
                  <option value="m2">سعر المتر المربع</option>
                  <option value="box">سعر الكرتونة</option>
                </select>
              </FormField>
            </div>
            {calc && (
              <div className="rounded-xl bg-[var(--cerami-bg)] p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>المساحة الصافية</span><b>{fmtM2(calc.areaM2)}</b></div>
                <div className="flex justify-between"><span>مع الهالك ({calc.wastePercent}%)</span><b>{fmtM2(calc.requiredM2)}</b></div>
                <div className="flex justify-between"><span>الكراتين المطلوبة</span><b className="text-primary">{calc.boxesNeeded} كرتونة</b></div>
                {calc.piecesNeeded != null && <div className="flex justify-between"><span>القطع</span><b>{calc.piecesNeeded} قطعة</b></div>}
                <div className="flex justify-between"><span>المساحة المغطاة</span><b>{fmtM2(calc.coveredM2)}</b></div>
                <div className="flex justify-between"><span>فائض التقطيع</span><b>{fmtM2(calc.leftoverM2)}</b></div>
                <div className="flex justify-between border-t border-[var(--cerami-border)] pt-1 mt-1"><span>إجمالي بالمتر</span><b>{fmt(calc.totalByMeter)}</b></div>
                <div className="flex justify-between"><span>إجمالي بالكرتونة</span><b>{fmt(calc.totalByBox)}</b></div>
              </div>
            )}
            <Button className="w-full" disabled={!calc || !canManage} onClick={addCalcLine} leadingIcon={<Boxes className="w-4 h-4" />}>
              إضافة بند للمقايسة
            </Button>
          </Card>

          <Card padding="sm" className="space-y-3">
            <CardHeader title={`بنود المقايسة (${calcLines.length}) — الإجمالي ${fmt(calcTotal)}`} />
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {calcLines.map((l) => (
                <div key={l.key} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--cerami-border)] p-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{l.productName}</div>
                    <div className="text-[var(--cerami-muted)]">{fmtM2(l.areaM2)} + {l.wastePercent}% → {l.boxesNeeded} كرتونة</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <b>{fmt(l.totalAmount)}</b>
                    <Button size="sm" variant="ghost" onClick={() => setCalcLines((p) => p.filter((x) => x.key !== l.key))}>حذف</Button>
                  </div>
                </div>
              ))}
              {calcLines.length === 0 && <p className="text-center text-sm text-[var(--cerami-muted)] py-8">لا توجد بنود — احسب المساحة وأضفها هنا.</p>}
            </div>
            {canManage && calcLines.length > 0 && (
              <ActivityGate element="save-design">
                <Button className="w-full" onClick={() => setQuoteModal(true)}>حفظ المقاييسات</Button>
              </ActivityGate>
            )}
          </Card>
        </div>
      ) : tab === 'quotes' ? (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
              <th className="p-3">رقم المقاييسة</th><th className="p-3">العميل</th><th className="p-3">الصنف</th>
              <th className="p-3">المساحة</th><th className="p-3">الكراتين</th><th className="p-3">الإجمالي</th>
              <th className="p-3">الحالة</th><th className="p-3">التاريخ</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-[var(--cerami-border)] last:border-0">
                  <td className="p-3 font-mono text-xs">{q.quoteNumber}</td>
                  <td className="p-3 font-medium">{q.customerName || 'عميل نقدي'}</td>
                  <td className="p-3 text-xs">{q.productName || '—'}</td>
                  <td className="p-3">{fmtM2(q.areaM2)} <span className="text-[10px] text-[var(--cerami-muted)]">(+{q.wastePercent}%)</span></td>
                  <td className="p-3">{q.boxesNeeded} كرتونة</td>
                  <td className="p-3 font-semibold">{fmt(q.totalAmount)}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${QUOTE_STATUS_CLS[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
                    {q.quotationNumber && <div className="text-[10px] text-success mt-1 font-mono">عرض {q.quotationNumber}</div>}
                  </td>
                  <td className="p-3 text-xs">{q.createdAt?.slice(0, 10)}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="ghost" title="طباعة مقاييسة المساحة" onClick={() => printTakeoff(q.quoteNumber)}>
                        <Printer className="w-3 h-3" />
                      </Button>
                      {canManage && <>
                        {q.status === 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateAreaQuoteStatus(q.id, 'SENT'); load(); })}><Send className="w-3 h-3" /></Button>}
                        {q.status === 'SENT' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateAreaQuoteStatus(q.id, 'ACCEPTED'); load(); })}>قبول</Button>}
                        {(q.status === 'DRAFT' || q.status === 'SENT') && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateAreaQuoteStatus(q.id, 'REJECTED'); load(); })}>رفض</Button>}
                        {canQuote && !q.quotationId && (q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'ACCEPTED') && q.customerId && (
                          <Button size="sm" variant="ghost" title="تحويل كل بنود هذه المقاييسة إلى عرض سعر واحد" onClick={() => convertTakeoff(q.quoteNumber)}>
                            <FileText className="w-3 h-3" /> عرض سعر
                          </Button>
                        )}
                        {canQuote && !q.quotationId && !q.customerId && q.status !== 'REJECTED' && (
                          <span className="text-[10px] text-warning self-center">بدون عميل</span>
                        )}
                        {q.status === 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.deleteAreaQuote(q.id); load(); })}>حذف</Button>}
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد مقاييسات محفوظة.</td></tr>}
            </tbody>
          </table>
        </Card>
      ) : tab === 'services' ? (
        <div className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setServiceModal(true)} leadingIcon={<Wrench className="w-4 h-4" />}>أمر خدمة جديد</Button>
            </div>
          )}
          <Card padding="none">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">رقم الأمر</th><th className="p-3">العميل</th><th className="p-3">الخدمة</th>
                <th className="p-3">موقع التنفيذ</th><th className="p-3">المساحة</th><th className="p-3">الموعد</th>
                <th className="p-3">الإجمالي</th><th className="p-3">الحالة</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {serviceOrders.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--cerami-border)] last:border-0">
                    <td className="p-3 font-mono text-xs">{o.orderNumber}</td>
                    <td className="p-3 font-medium">{o.customerName || '—'}</td>
                    <td className="p-3 text-xs">{SERVICE_TYPE_LABEL[o.serviceType]}</td>
                    <td className="p-3 text-xs">{o.siteAddress || '—'}</td>
                    <td className="p-3">{o.areaM2 ? fmtM2(o.areaM2) : '—'}{o.boxesCount ? <div className="text-[10px] text-[var(--cerami-muted)]">{o.boxesCount} كرتونة</div> : null}</td>
                    <td className="p-3 text-xs">{o.scheduledDate || '—'}</td>
                    <td className="p-3 font-semibold">{fmt(o.totalAmount)}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${SERVICE_STATUS_CLS[o.status]}`}>{SERVICE_STATUS_LABEL[o.status]}</span></td>
                    <td className="p-3">
                      {canManage && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                        <div className="flex gap-1">
                          {o.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateServiceOrderStatus(o.id, 'IN_PROGRESS'); load(); })}>بدء</Button>}
                          <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateServiceOrderStatus(o.id, 'COMPLETED'); load(); })}>إكمال</Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateServiceOrderStatus(o.id, 'CANCELLED'); load(); })}>إلغاء</Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => { service.deleteServiceOrder(o.id); load(); })}>حذف</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {serviceOrders.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد أوامر خدمة — سجّل أول أمر قص أو تركيب.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      ) : tab === 'commissions' ? (
        <div className="space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCommissionModal(true)} leadingIcon={<BadgePercent className="w-4 h-4" />}>عمولة جديدة</Button>
            </div>
          )}
          <Card padding="none">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">رقم العمولة</th><th className="p-3">المهندس / الشريك</th><th className="p-3">العميل</th>
                <th className="p-3">مرجع البيع</th><th className="p-3">أساس العمولة</th><th className="p-3">النسبة</th>
                <th className="p-3">المبلغ</th><th className="p-3">الحالة</th><th className="p-3">التاريخ</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {commissions.map((cm) => (
                  <tr key={cm.id} className="border-b border-[var(--cerami-border)] last:border-0">
                    <td className="p-3 font-mono text-xs">{cm.commissionNumber}</td>
                    <td className="p-3">
                      <div className="font-medium">{cm.partnerName}</div>
                      {cm.partnerPhone && <div className="text-[10px] text-[var(--cerami-muted)]">{cm.partnerPhone}</div>}
                    </td>
                    <td className="p-3 text-xs">{cm.customerName || '—'}</td>
                    <td className="p-3 font-mono text-xs">{cm.saleReference || '—'}</td>
                    <td className="p-3">{fmt(cm.baseAmount)}</td>
                    <td className="p-3 text-xs">{cm.percent != null ? `${cm.percent}%` : 'مبلغ ثابت'}</td>
                    <td className="p-3 font-semibold">{fmt(cm.amount)}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${COMMISSION_STATUS_CLS[cm.status]}`}>{COMMISSION_STATUS_LABEL[cm.status]}</span></td>
                    <td className="p-3 text-xs">{cm.createdAt?.slice(0, 10)}</td>
                    <td className="p-3">
                      {canManage && cm.status !== 'CANCELLED' && (
                        <div className="flex gap-1">
                          {cm.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateCommissionStatus(cm.id, 'PAID'); load(); })}>دفع</Button>}
                          {cm.status === 'PAID' && <Button size="sm" variant="ghost" onClick={() => run(() => { service.updateCommissionStatus(cm.id, 'PENDING'); load(); })}>إعادة استحقاق</Button>}
                          <Button size="sm" variant="ghost" onClick={() => run(() => { service.deleteCommission(cm.id); load(); })}>حذف</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {commissions.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد عمولات مسجلة.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      ) : tab === 'samples' ? (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
              <th className="p-3">العينة</th><th className="p-3">الصنف</th><th className="p-3">المقاس</th>
              <th className="p-3">المخزن</th><th className="p-3">الكمية</th><th className="p-3">الحالة</th><th className="p-3">التاريخ</th>
            </tr></thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id} className="border-b border-[var(--cerami-border)] last:border-0">
                  <td className="p-3 font-mono text-xs">{s.specialNumber}</td>
                  <td className="p-3">
                    <div className="font-medium">{s.productName}</div>
                    <div className="text-[10px] text-[var(--cerami-muted)]">{s.sku} • {gradeLabel(s.grade)}</div>
                  </td>
                  <td className="p-3 text-xs font-semibold">{s.size}</td>
                  <td className="p-3 text-xs">{s.warehouseName}</td>
                  <td className="p-3">{fmtM2(s.quantityM2)}<div className="text-[10px] text-[var(--cerami-muted)]">{s.boxesCount} كرتونة</div></td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[11px] bg-accent-soft text-primary">{s.status === 'RECORDED' ? 'مسجلة' : s.status === 'INSPECTED' ? 'تم فحصها' : s.status === 'DOWNGRADED_SALE' ? 'اتباعت مخفضة' : s.status}</span></td>
                  <td className="p-3 text-xs">{s.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
              {samples.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد عينات عرض مسجلة — تُسجل من صفحة التالف والحجر.</td></tr>}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card padding="sm" className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--cerami-muted)]" />
            <input className={`${inputCls} pr-9`} placeholder="بحث بالاسم أو الكود أو المقاس..." value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
                <th className="p-3">الصنف</th><th className="p-3">الماركة</th><th className="p-3">الفرز</th><th className="p-3">المقاس</th>
                <th className="p-3">التشطيب</th><th className="p-3">سعر المتر</th><th className="p-3">سعر الكرتونة</th>
                <th className="p-3">معرض</th><th className="p-3">مخزن</th><th className="p-3">الإجمالي</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {filteredStock.map((r) => (
                  <tr key={r.productId} className="border-b border-[var(--cerami-border)] last:border-0">
                    <td className="p-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] text-[var(--cerami-muted)]">{r.sku}</div>
                    </td>
                    <td className="p-3 text-xs">{r.brandName || '—'}</td>
                    <td className="p-3 text-xs">{gradeLabel(r.grade)}</td>
                    <td className="p-3 text-xs font-semibold">{r.size}</td>
                    <td className="p-3 text-xs">{r.finish || '—'}</td>
                    <td className="p-3">{fmt(r.sellingPriceM2)}</td>
                    <td className="p-3">{fmt(r.sellingPriceBox)}</td>
                    <td className="p-3"><span className="text-success font-semibold">{fmtM2(r.showroomM2)}</span><div className="text-[10px] text-[var(--cerami-muted)]">{r.showroomBoxes} كرتونة</div></td>
                    <td className="p-3">{fmtM2(r.storeM2)}<div className="text-[10px] text-[var(--cerami-muted)]">{r.storeBoxes} كرتونة</div></td>
                    <td className="p-3 font-bold">{fmtM2(r.totalM2)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => preselectProduct(r.productId)}>احسب</Button>
                        <Button size="sm" variant="ghost" onClick={() => openBatches(r)}>دفعات</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStock.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-[var(--cerami-muted)]">لا توجد أصناف.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Save quotes modal */}
      <Modal open={quoteModal} onClose={() => setQuoteModal(false)} title="حفظ مقاييسات المساحات" size="sm"
        footer={<div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setQuoteModal(false)}>إلغاء</Button>
          <Button onClick={saveQuotes} disabled={calcLines.length === 0}>حفظ {calcLines.length} بند</Button>
        </div>}>
        <div className="space-y-3">
          <FormField label="العميل">
            <select className={selectCls} value={quoteForm.customerId} onChange={(e) => setQuoteForm({ ...quoteForm, customerId: e.target.value })}>
              <option value="">عميل نقدي / بدون اسم</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="ملاحظات">
            <input className={inputCls} value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} placeholder="مثال: شقة المعادي — تشطيب كامل" />
          </FormField>
          <div className="rounded-lg bg-[var(--cerami-bg)] p-3 text-sm flex justify-between">
            <span>عدد البنود</span><b>{calcLines.length}</b>
          </div>
          <div className="rounded-lg bg-[var(--cerami-bg)] p-3 text-sm flex justify-between">
            <span>إجمالي المقاييسات</span><b>{fmt(calcTotal)}</b>
          </div>
        </div>
      </Modal>

      {/* Batches modal */}
      <Modal open={batchesProduct !== null} onClose={() => setBatchesProduct(null)} title={`دفعات ${batchesProduct?.name || ''}`} size="lg"
        footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setBatchesProduct(null)}>إغلاق</Button></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-[var(--cerami-muted)] border-b border-[var(--cerami-border)]">
              <th className="p-2">رقم الدفعة</th><th className="p-2">النغمة</th><th className="p-2">العيار</th>
              <th className="p-2">الفرز</th><th className="p-2">المخزن</th><th className="p-2">المستلم</th>
              <th className="p-2">رصيد متبقٍ (م²)</th><th className="p-2">تاريخ الاستلام</th>
            </tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-[var(--cerami-border)] last:border-0">
                  <td className="p-2 font-mono text-xs">{b.batchNumber}</td>
                  <td className="p-2">{b.toneShade || '—'}</td>
                  <td className="p-2">{b.caliber || '—'}</td>
                  <td className="p-2 text-xs">{b.grade ? gradeLabel(b.grade) : '—'}</td>
                  <td className="p-2 text-xs">{b.warehouseName || '—'}</td>
                  <td className="p-2 text-xs">{b.supplierName || '—'}</td>
                  <td className="p-2 font-semibold">{fmtM2(b.quantityRemainingM2)}</td>
                  <td className="p-2 text-xs">{b.receivedDate || b.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[var(--cerami-muted)]">لا توجد دفعات مسجلة لهذا الصنف.</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Service order modal */}
      <Modal open={serviceModal} onClose={() => setServiceModal(false)} title="أمر خدمة قص / تركيب / توصيل" size="md"
        footer={<div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setServiceModal(false)}>إلغاء</Button>
          <Button onClick={saveServiceOrder}>حفظ الأمر</Button>
        </div>}>
        <div className="space-y-3">
          <FormField label="العميل">
            <select className={selectCls} value={serviceForm.customerId} onChange={(e) => {
              const id = e.target.value;
              setServiceForm({ ...serviceForm, customerId: id, customerName: customers.find((c) => c.id === id)?.name || '' });
            }}>
              <option value="">— اختر أو اكتب اسمًا يدويًا —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          {!serviceForm.customerId && (
            <FormField label="اسم العميل (يدوي)">
              <input className={inputCls} value={serviceForm.customerName} onChange={(e) => setServiceForm({ ...serviceForm, customerName: e.target.value })} />
            </FormField>
          )}
          <FormField label="موقع التنفيذ">
            <input className={inputCls} value={serviceForm.siteAddress} onChange={(e) => setServiceForm({ ...serviceForm, siteAddress: e.target.value })} placeholder="مثال: شقة 12 — مدينة نصر" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="نوع الخدمة">
              <select className={selectCls} value={serviceForm.serviceType} onChange={(e) => setServiceForm({ ...serviceForm, serviceType: e.target.value as CeramicServiceType })}>
                {Object.entries(SERVICE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="الموعد المجدول">
              <input type="date" className={inputCls} value={serviceForm.scheduledDate} onChange={(e) => setServiceForm({ ...serviceForm, scheduledDate: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="المساحة (م²)"><input type="number" step="0.01" className={inputCls} value={serviceForm.areaM2} onChange={(e) => setServiceForm({ ...serviceForm, areaM2: e.target.value })} /></FormField>
            <FormField label="الكراتين"><input type="number" step="0.5" className={inputCls} value={serviceForm.boxesCount} onChange={(e) => setServiceForm({ ...serviceForm, boxesCount: e.target.value })} /></FormField>
            <FormField label="سعر الخدمة"><input type="number" step="0.01" className={inputCls} value={serviceForm.unitPrice} onChange={(e) => setServiceForm({ ...serviceForm, unitPrice: e.target.value })} /></FormField>
          </div>
          <FormField label="ملاحظات">
            <input className={inputCls} value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} placeholder="تفاصيل القص أو التركيب..." />
          </FormField>
        </div>
      </Modal>

      {/* Commission modal */}
      <Modal open={commissionModal} onClose={() => setCommissionModal(false)} title="عمولة مهندس / مصمم / مقاول" size="md"
        footer={<div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setCommissionModal(false)}>إلغاء</Button>
          <Button onClick={saveCommission}>حفظ العمولة</Button>
        </div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="اسم المهندس / الشريك" required>
              <input className={inputCls} value={commissionForm.partnerName} onChange={(e) => setCommissionForm({ ...commissionForm, partnerName: e.target.value })} />
            </FormField>
            <FormField label="رقم الهاتف">
              <input className={inputCls} value={commissionForm.partnerPhone} onChange={(e) => setCommissionForm({ ...commissionForm, partnerPhone: e.target.value })} />
            </FormField>
          </div>
          <FormField label="العميل">
            <select className={selectCls} value={commissionForm.customerId} onChange={(e) => {
              const id = e.target.value;
              setCommissionForm({ ...commissionForm, customerId: id, customerName: customers.find((c) => c.id === id)?.name || '' });
            }}>
              <option value="">— بدون ربط بعميل —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="مرجع البيع (فاتورة / عرض سعر)">
            <input className={inputCls} value={commissionForm.saleReference} onChange={(e) => setCommissionForm({ ...commissionForm, saleReference: e.target.value })} placeholder="مثال: INV-2026-001" />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="قيمة البيع"><input type="number" step="0.01" className={inputCls} value={commissionForm.baseAmount} onChange={(e) => setCommissionForm({ ...commissionForm, baseAmount: e.target.value })} /></FormField>
            <FormField label="النسبة %"><input type="number" step="0.1" className={inputCls} value={commissionForm.percent} onChange={(e) => setCommissionForm({ ...commissionForm, percent: e.target.value })} /></FormField>
            <FormField label="أو مبلغ ثابت"><input type="number" step="0.01" className={inputCls} value={commissionForm.amount} onChange={(e) => setCommissionForm({ ...commissionForm, amount: e.target.value })} /></FormField>
          </div>
          <p className="text-[11px] text-[var(--cerami-muted)]">اترك النسبة فارغة مع مبلغ ثابت لحساب مبلغ محدد، أو اترك المبلغ فارغًا ليُحسب من النسبة.</p>
          <FormField label="ملاحظات">
            <input className={inputCls} value={commissionForm.notes} onChange={(e) => setCommissionForm({ ...commissionForm, notes: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};

function round2Local(n: number): number {
  return Math.round(n * 100) / 100;
}
