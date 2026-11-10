import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Calculator, ClipboardList, Plus, Trash2, Package, ArrowRight,
  Ruler, DoorOpen, Save, AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { CustomerService } from '../../services/domains/customers/CustomerService';
import { ProductService } from '../../services/domains/products/ProductService';
import { InventoryService } from '../../services/domains/inventory/InventoryService';
import { QuotationService } from '../../services/domains/sales/QuotationService';
import { PermissionService } from '../../services/domains/auth/PermissionService';
import { AuthService } from '../../services/domains/auth/AuthService';
import { ProjectService, type Project } from '../../services/domains/projects/ProjectService';
import { ApartmentEstimateService } from '../../services/domains/projects/ApartmentEstimateService';
import type { ApartmentEstimate } from '../../types/projects/apartmentEstimate';
import type { Customer, Product, Warehouse } from '../../types';
import {
  getQuantity, getRoomLineTotal, getRoomMeasures,
  type EstimateLine, type EstimateRoom, type Measure,
} from './estimateCalculations';

type Room = EstimateRoom;
type CostLine = EstimateLine;
type StockRow = { productId: string; availableM2: number };

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const newRoom = (name = 'غرفة جديدة'): Room => ({
  id: makeId(), name, length: 4, width: 3, height: 3,
  doorCount: 1, doorWidth: 0.9, doorHeight: 2.1,
  windowCount: 1, windowWidth: 1.2, windowHeight: 1.2,
});
const newLine = (
  category: string, name: string, measure: Measure, unit: string,
): CostLine => ({
  id: makeId(), category, name, measure, unit,
  manualQuantity: 1, materialProductId: '', materialRate: 0, laborRate: 0,
  wastePercent: 0, discountPercent: 0, profitPercent: 0,
});
const initialLines = (): CostLine[] => [
  newLine('الأرضيات', 'توريد وتركيب الأرضيات', 'floor', 'م²'),
  newLine('السيراميك', 'سيراميك الحوائط', 'walls', 'م²'),
  newLine('المحارة', 'محارة الحوائط', 'walls', 'م²'),
  newLine('النقاشة', 'دهانات الحوائط', 'walls', 'م²'),
  newLine('الأسقف', 'دهانات الأسقف', 'ceiling', 'م²'),
  newLine('الجبس', 'أعمال الجبس', 'ceiling', 'م²'),
  newLine('كهرباء', 'أعمال الكهرباء', 'manual', 'نقطة'),
  newLine('سباكة', 'أعمال السباكة', 'manual', 'نقطة'),
  newLine('نجارة', 'أعمال النجارة', 'manual', 'بند'),
  newLine('ألوميتال', 'أعمال الألوميتال', 'manual', 'م²'),
  newLine('عمالة', 'عمالة التشطيب', 'floor', 'م²'),
];
const initialRooms = (): Room[] => [
  newRoom('الريسبشن'), newRoom('غرفة النوم'), newRoom('المطبخ'), newRoom('الحمام'), newRoom('البلكونة'),
];
const fmt = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value || 0);
const measureLabel: Record<Measure, string> = {
  floor: 'مساحة الأرضية',
  walls: 'مساحة الحوائط الصافية',
  ceiling: 'مساحة السقف',
  perimeter: 'محيط الغرفة',
  manual: 'كمية يدوية',
};

function fieldClass() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
}

function isUnitCompatible(product: Product, unit: string): boolean {
  const label = unit.trim().toLocaleLowerCase();
  if (['م²', 'م2', 'متر مربع'].includes(label)) return product.baseUnit === 'M2';
  if (['م', 'م طولي', 'متر طولي'].includes(label)) {
    return product.baseUnit === 'METER' || product.baseUnit === 'LINEAR_METER';
  }
  if (['نقطة', 'بند', 'قطعة', 'عدد'].includes(label)) {
    return ['PIECE', 'PACK', 'SET', 'SERVICE'].includes(product.baseUnit);
  }
  return product.baseUnit === 'CUSTOM' && product.customUnit?.trim().toLocaleLowerCase() === label;
}

export const ApartmentEstimatePage: React.FC = () => {
  const navigate = useNavigate();
  const quotationService = useMemo(() => new QuotationService(), []);
  const projectEstimateService = useMemo(() => new ApartmentEstimateService(), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectEstimates, setProjectEstimates] = useState<ApartmentEstimate[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [lines, setLines] = useState<CostLine[]>(initialLines);
  const [apartmentName, setApartmentName] = useState('');
  const [apartmentArea, setApartmentArea] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [dataError, setDataError] = useState('');
  const [productError, setProductError] = useState('');
  const [stockError, setStockError] = useState('');
  const [saving, setSaving] = useState(false);
  const canCreateQuotation = PermissionService.can(AuthService.getCurrentUser(), 'ui.quotations.quotations.create');
  const canViewProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.view');
  const canUpdateProjects = PermissionService.can(AuthService.getCurrentUser(), 'ui.projects.list.update');

  useEffect(() => {
    try { setCustomers(new CustomerService().getAllCustomers()); }
    catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل العملاء.'); }
    if (canViewProjects) {
      try { setProjects(new ProjectService().getProjects()); }
      catch (error) { setDataError(error instanceof Error ? error.message : 'تعذر تحميل المشروعات.'); }
    }
    try { setProducts(new ProductService().getAllProducts()); }
    catch (error) { setProductError(error instanceof Error ? error.message : 'تعذر تحميل أصناف المخزون.'); }
    try {
      const availableWarehouses = new InventoryService().getAllWarehouses();
      setWarehouses(availableWarehouses);
      const defaultWarehouse = availableWarehouses[0];
      if (defaultWarehouse) setWarehouseId(defaultWarehouse.id);
    } catch (error) {
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل المستودعات.');
    }
  }, [canViewProjects]);

  useEffect(() => {
    if (!projectId) {
      setProjectEstimates([]);
      setSelectedEstimateId('');
      setApartmentName('');
      setApartmentArea('');
      setRooms(initialRooms());
      setLines(initialLines());
      return;
    }
    const project = projects.find((item) => item.id === projectId);
    if (project) {
      setCustomerId(project.customerId);
      setApartmentName(project.name);
    }
    try {
      const savedEstimates = projectEstimateService.getByProject(projectId);
      setProjectEstimates(savedEstimates);
      const latest = savedEstimates[0];
      if (latest) {
        setSelectedEstimateId(latest.id);
        setApartmentName(latest.name);
        setApartmentArea(String(latest.areaM2));
        setRooms(latest.rooms);
        setLines(latest.costLines);
      } else {
        setSelectedEstimateId('');
        setApartmentArea('');
        setRooms(initialRooms());
        setLines(initialLines());
      }
      setDataError('');
    } catch (error) {
      setProjectEstimates([]);
      setSelectedEstimateId('');
      setDataError(error instanceof Error ? error.message : 'تعذر تحميل تصميم المشروع.');
    }
  }, [projectId, projects, projectEstimateService]);

  useEffect(() => {
    if (!warehouseId) { setStock([]); setStockError(''); return; }
    try {
      setStock(new InventoryService().getWarehouseStock(warehouseId));
      setStockError('');
    } catch (error) {
      setStock([]);
      setStockError(error instanceof Error ? error.message : 'تعذر تحميل أرصدة المستودع.');
    }
  }, [warehouseId]);

  const roomTotals = useMemo(() => rooms.map((room) => ({
    room,
    measures: getRoomMeasures(room),
    total: lines.reduce((sum, line) => sum + getRoomLineTotal(line, room, rooms.length).total, 0),
  })), [rooms, lines]);
  const estimateTotal = roomTotals.reduce((sum, item) => sum + item.total, 0);
  const totalArea = rooms.reduce((sum, room) => sum + getRoomMeasures(room).floor, 0);

  const patchRoom = (id: string, patch: Partial<Room>) => setRooms((current) =>
    current.map((room) => room.id === id ? { ...room, ...patch } : room));
  const patchLine = (id: string, patch: Partial<CostLine>) => setLines((current) =>
    current.map((line) => line.id === id ? { ...line, ...patch } : line));

  const loadLinkedStock = (productId: string) => stock.find((row) => row.productId === productId)?.availableM2 ?? 0;

  const saveProjectEstimate = (showConfirmation = true): ApartmentEstimate | null => {
    if (!projectId) {
      setDataError('اختر مشروعًا قائمًا أولًا لحفظ تصميم الشقة عليه.');
      return null;
    }
    if (!canUpdateProjects) {
      setDataError('لا تملك صلاحية تعديل المشروع لحفظ التصميم والمقايسة.');
      return null;
    }
    const saved = projectEstimateService.save({
      id: selectedEstimateId || undefined,
      projectId,
      name: apartmentName.trim() || projects.find((project) => project.id === projectId)?.name || 'تصميم الشقة',
      areaM2: Number(apartmentArea) || totalArea,
      totalAmount: estimateTotal,
      rooms,
      costLines: lines,
    });
    setSelectedEstimateId(saved.id);
    setApartmentName(saved.name);
    setProjectEstimates((current) => [saved, ...current.filter((estimate) => estimate.id !== saved.id)]);
    if (showConfirmation) setDataError('');
    return saved;
  };

  const selectProjectEstimate = (estimateId: string) => {
    setSelectedEstimateId(estimateId);
    const estimate = projectEstimates.find((item) => item.id === estimateId);
    if (!estimate) {
      const project = projects.find((item) => item.id === projectId);
      setApartmentName(project?.name || '');
      setApartmentArea('');
      setRooms(initialRooms());
      setLines(initialLines());
      return;
    }
    setApartmentName(estimate.name);
    setApartmentArea(String(estimate.areaM2));
    setRooms(estimate.rooms);
    setLines(estimate.costLines);
  };

  const createQuotation = () => {
    if (!canCreateQuotation) {
      setDataError('لا تملك صلاحية إنشاء عروض الأسعار. يمكنك إعداد المقايسة، لكن يلزم منح صلاحية عروض الأسعار لإصدارها.');
      return;
    }
    if (!customerId) { setDataError('اختر العميل قبل إصدار عرض السعر.'); return; }
    const activeLines = lines.filter((line) => line.name.trim() && getLineQuantity(line) > 0);
    if (!activeLines.length || estimateTotal <= 0) { setDataError('أضف بندًا بكمية وسعر صالحين قبل إصدار عرض السعر.'); return; }
    setSaving(true);
    setDataError('');
    try {
      const savedEstimate = projectId ? saveProjectEstimate(false) : null;
      if (projectId && !savedEstimate) {
        setSaving(false);
        return;
      }
      const quoteNotes = [
        `مقايسة تشطيب: ${apartmentName.trim() || 'الشقة'}`,
        `المساحة المدخلة: ${Number(apartmentArea) || totalArea} م² | المساحة المحسوبة للغرف: ${fmt(totalArea)} م²`,
        `عدد الغرف: ${rooms.length}`,
        ...rooms.map((room) => {
          const measures = getRoomMeasures(room);
          return `${room.name}: ${room.length}×${room.width}×${room.height}م، أرضية ${fmt(measures.floor)}م²، حوائط صافية ${fmt(measures.walls)}م²`;
        }),
        'البنود (السعر يشمل الخامات والمصنعية والهالك والخصم والربح المحددة في المقايسة):',
        ...activeLines.map((line) => {
          const totalQuantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
          const linkedProduct = products.find((product) => product.id === line.materialProductId);
          const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
          return `${line.category} - ${line.name}: كمية ${fmt(totalQuantity)} ${line.unit}; خامات ${fmt(line.materialRate)}/${line.unit}; مصنعية ${fmt(line.laborRate)}/${line.unit}; هالك ${fmt(line.wastePercent)}%; خصم ${fmt(line.discountPercent)}%; ربح ${fmt(line.profitPercent)}%${compatibleProduct ? `; صنف المخزون: ${linkedProduct.name}` : linkedProduct ? `; لم يربط الصنف ${linkedProduct.name} لاختلاف الوحدة` : ''}`;
        }),
        `المخزن المرجعي: ${warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || 'غير محدد'}`,
      ].join('\n');
      const serviceItems = activeLines.map((line) => {
        const quantity = rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
        const lineTotal = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
        return {
          productId: line.materialProductId && products.some((product) =>
            product.id === line.materialProductId && isUnitCompatible(product, line.unit))
            ? line.materialProductId
            : undefined,
          description: `${line.category}: ${line.name}`,
          unit: line.unit,
          quantity,
          unitPrice: quantity ? lineTotal / quantity : 0,
        };
      });
      const quotation = quotationService.createQuotation({
        customerId,
        projectId: projectId || undefined,
        warehouseId: warehouseId || undefined,
        validDays: 15,
        notes: quoteNotes,
        serviceItems,
      });
      if (savedEstimate && projectId) {
        try {
          projectEstimateService.linkQuotation(savedEstimate.id, projectId, quotation.id);
        } catch (error) {
          setDataError(`تم إصدار عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بتصميم الشقة: ${error instanceof Error ? error.message : String(error)}`);
          window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} وربطه بالمشروع، لكن تعذر ربطه بسجل التصميم. راجع المشروع قبل إعادة المحاولة.`);
          navigate('/quotations');
          return;
        }
      }
      window.alert(`تم إنشاء عرض السعر ${quotation.quotationNumber} بالمقايسة كاملة. يمكنك مراجعته وتعديله وطباعته من عروض الأسعار.`);
      navigate('/quotations');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'خطأ غير معروف.';
      setDataError(`${projectId ? 'تعذر حفظ تصميم المشروع أو إصدار عرض السعر' : 'تعذر إصدار عرض السعر'}: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  function getLineQuantity(line: CostLine) {
    return rooms.reduce((sum, room) => sum + getQuantity(line, room, rooms.length), 0);
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="حاسبة الشقة والمقايسة الهندسية"
        description="احسب مساحات الغرف وكميات التشطيب وتكلفتها، ثم أصدر عرض سعر قابلًا للتعديل والطباعة."
        eyebrow="التشطيبات والمشروعات"
        icon={<Building2 className="h-5 w-5" />}
        actions={<div className="flex flex-wrap gap-2">
          {projectId && canUpdateProjects && <button type="button" onClick={() => {
            try {
              const estimate = saveProjectEstimate();
              if (estimate) window.alert('تم حفظ تصميم الشقة والمقايسة على المشروع.');
            } catch (error) {
              setDataError(error instanceof Error ? error.message : 'تعذر حفظ تصميم المشروع.');
            }
          }} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-bold text-sky-800 disabled:opacity-50"><Save className="h-4 w-4" /> حفظ على المشروع</button>}
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"><Save className="h-4 w-4" /> إصدار عرض سعر</button>
        </div>}
      />

      {dataError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{dataError}</div>}
      {productError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">تعذر تحميل قائمة أصناف المخزون: {productError}</div>}
      {stockError && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />تعذر ربط المخزون: {stockError}</div>}

      <section className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">المشروع القائم
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${fieldClass()} mt-1`}>
            <option value="">— بدون ربط بمشروع —</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
          </select>
        </label>
        {projectId && <label className="text-xs font-bold text-slate-600">التصميم المحفوظ
          <select value={selectedEstimateId} onChange={(event) => selectProjectEstimate(event.target.value)} className={`${fieldClass()} mt-1`}>
            <option value="">تصميم جديد للمشروع</option>
            {projectEstimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.name} — {fmt(estimate.areaM2)} م²</option>)}
          </select>
        </label>}
        <label className="text-xs font-bold text-slate-600">اسم المشروع / الشقة<input value={apartmentName} onChange={(event) => setApartmentName(event.target.value)} className={`${fieldClass()} mt-1`} placeholder="مثال: شقة الأستاذ محمد" /></label>
        <label className="text-xs font-bold text-slate-600">مساحة الشقة (م²)<input type="number" min={0} step="0.1" value={apartmentArea} onChange={(event) => setApartmentArea(event.target.value)} className={`${fieldClass()} mt-1`} placeholder={`محسوبة تلقائيًا: ${fmt(totalArea)}`} /></label>
        <label className="text-xs font-bold text-slate-600">العميل لعرض السعر<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={!!projectId} className={`${fieldClass()} mt-1 disabled:bg-slate-100`}><option value="">— اختر العميل —</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">المستودع لحساب المتاح<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={`${fieldClass()} mt-1`}><option value="">— اختر المستودع —</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Ruler className="h-5 w-5 text-sky-700" /><div><h2 className="font-black text-slate-900">تقسيم الشقة والغرف</h2><p className="text-xs text-slate-500">المساحة الصافية للحوائط تخصم فتحات الأبواب والنوافذ.</p></div></div>
          <button type="button" onClick={() => setRooms((current) => [...current, newRoom()])} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800"><Plus className="h-4 w-4" /> إضافة غرفة</button>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rooms.map((room, index) => {
            const measures = getRoomMeasures(room);
            return (
              <article key={room.id} className="rounded-xl border border-slate-200 p-3">
                <header className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">{index + 1}</span><input aria-label="اسم الغرفة" value={room.name} onChange={(event) => patchRoom(room.id, { name: event.target.value })} className="max-w-56 border-b border-slate-200 bg-transparent px-1 py-1 font-bold outline-none focus:border-sky-500" /></div>
                  {rooms.length > 1 && <button type="button" aria-label="حذف الغرفة" onClick={() => setRooms((current) => current.filter((entry) => entry.id !== room.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                </header>
                <div className="grid grid-cols-3 gap-2">
                  <NumberInput label="الطول (م)" value={room.length} min={0} onChange={(length) => patchRoom(room.id, { length })} />
                  <NumberInput label="العرض (م)" value={room.width} min={0} onChange={(width) => patchRoom(room.id, { width })} />
                  <NumberInput label="الارتفاع (م)" value={room.height} min={0} onChange={(height) => patchRoom(room.id, { height })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-slate-600"><DoorOpen className="h-3.5 w-3.5" /> الأبواب</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <NumberInput label="عدد" value={room.doorCount} min={0} onChange={(doorCount) => patchRoom(room.id, { doorCount })} />
                      <NumberInput label="عرض" value={room.doorWidth} min={0} step={0.1} onChange={(doorWidth) => patchRoom(room.id, { doorWidth })} />
                      <NumberInput label="ارتفاع" value={room.doorHeight} min={0} step={0.1} onChange={(doorHeight) => patchRoom(room.id, { doorHeight })} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-bold text-slate-600"><Building2 className="h-3.5 w-3.5" /> النوافذ</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <NumberInput label="عدد" value={room.windowCount} min={0} onChange={(windowCount) => patchRoom(room.id, { windowCount })} />
                      <NumberInput label="عرض" value={room.windowWidth} min={0} step={0.1} onChange={(windowWidth) => patchRoom(room.id, { windowWidth })} />
                      <NumberInput label="ارتفاع" value={room.windowHeight} min={0} step={0.1} onChange={(windowHeight) => patchRoom(room.id, { windowHeight })} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <Metric label="الأرضية" value={`${fmt(measures.floor)} م²`} />
                  <Metric label="الحيطان الصافية" value={`${fmt(measures.walls)} م²`} />
                  <Metric label="السقف" value={`${fmt(measures.ceiling)} م²`} />
                  <Metric label="المحيط" value={`${fmt(measures.perimeter)} م`} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-violet-700" /><div><h2 className="font-black text-slate-900">بنود التشطيب والتسعير</h2><p className="text-xs text-slate-500">الهالك يضاف إلى كمية الخامات، بينما تحسب المصنعية على الكمية الصافية.</p></div></div>
          <button type="button" onClick={() => setLines((current) => [...current, newLine('أعمال أخرى', 'بند جديد', 'manual', 'بند')])} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800"><Plus className="h-4 w-4" /> إضافة بند</button>
        </div>
        <div className="space-y-4">
          {lines.map((line) => {
            const quantity = getLineQuantity(line);
            const materialQuantity = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).materialQuantity, 0);
            const total = rooms.reduce((sum, room) => sum + getRoomLineTotal(line, room, rooms.length).total, 0);
            const linkedProduct = products.find((product) => product.id === line.materialProductId);
            const compatibleProduct = linkedProduct && isUnitCompatible(linkedProduct, line.unit);
            const stockAvailable = compatibleProduct && warehouseId && !stockError
              ? loadLinkedStock(line.materialProductId)
              : null;
            const shortage = stockAvailable === null ? 0 : Math.max(0, materialQuantity - stockAvailable);
            return (
              <article key={line.id} className="rounded-xl border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <label className="text-[11px] font-bold text-slate-500">البند<input value={line.name} onChange={(event) => patchLine(line.id, { name: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-slate-500">التصنيف<input value={line.category} onChange={(event) => patchLine(line.id, { category: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  <label className="text-[11px] font-bold text-slate-500">طريقة حساب الكمية<select value={line.measure} onChange={(event) => patchLine(line.id, { measure: event.target.value as Measure })} className={`${fieldClass()} mt-1`}>{Object.entries(measureLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-500">الوحدة<input value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} className={`${fieldClass()} mt-1`} /></label>
                  {line.measure === 'manual' && <NumberInput label="الكمية اليدوية" value={line.manualQuantity} min={0} step={0.1} onChange={(manualQuantity) => patchLine(line.id, { manualQuantity })} />}
                  <label className="text-[11px] font-bold text-slate-500">الصنف المرتبط بالمخزون<select value={line.materialProductId} onChange={(event) => patchLine(line.id, { materialProductId: event.target.value })} className={`${fieldClass()} mt-1`}><option value="">— بدون ربط مخزني —</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <NumberInput label={`سعر الخامات / ${line.unit}`} value={line.materialRate} min={0} step={0.01} onChange={(materialRate) => patchLine(line.id, { materialRate })} />
                  <NumberInput label={`المصنعية / ${line.unit}`} value={line.laborRate} min={0} step={0.01} onChange={(laborRate) => patchLine(line.id, { laborRate })} />
                  <NumberInput label="الهالك %" value={line.wastePercent} min={0} step={0.1} onChange={(wastePercent) => patchLine(line.id, { wastePercent })} />
                  <NumberInput label="الخصم %" value={line.discountPercent} min={0} max={100} step={0.1} onChange={(discountPercent) => patchLine(line.id, { discountPercent })} />
                  <NumberInput label="الربح %" value={line.profitPercent} min={0} step={0.1} onChange={(profitPercent) => patchLine(line.id, { profitPercent })} />
                  <div className="flex items-end justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs"><div><div className="text-[10px] text-slate-500">الكمية / إجمالي البند</div><b className="text-emerald-800">{fmt(quantity)} {line.unit} • {fmt(total)} ج</b></div><button type="button" aria-label="حذف البند" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="rounded-md p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
                {linkedProduct && (
                  <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-[11px] ${shortage > 0 ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
                    <span className="inline-flex items-center gap-1 font-bold"><Package className="h-3.5 w-3.5" /> {linkedProduct.name}</span>
                    <span>الاحتياج شامل الهالك: {fmt(materialQuantity)} {line.unit}</span>
                    <span>{stockAvailable === null ? 'الرصيد غير متاح' : `المتاح بالمستودع: ${fmt(stockAvailable)}`}</span>
                    {stockAvailable !== null && shortage > 0 && <span className="font-black">عجز متوقع: {fmt(shortage)} {line.unit}</span>}
                    {!compatibleProduct && <span className="font-bold">وحدة الصنف لا تطابق وحدة الاحتياج؛ لم يتم احتساب الرصيد.</span>}
                    {compatibleProduct && stockAvailable === null && <span>اختر مستودعًا صالحًا لعرض الرصيد.</span>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Calculator className="h-5 w-5 text-emerald-700" /><h2 className="font-black text-slate-900">المقايسة النهائية حسب الغرفة</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-right text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-3 py-2">الغرفة</th><th className="px-3 py-2">المساحة</th><th className="px-3 py-2">مساحة الحوائط</th><th className="px-3 py-2">إجمالي الغرفة</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{roomTotals.map(({ room, measures, total }) => <tr key={room.id}><td className="px-3 py-3 font-bold">{room.name}</td><td className="px-3 py-3">{fmt(measures.floor)} م²</td><td className="px-3 py-3">{fmt(measures.walls)} م²</td><td className="px-3 py-3 font-black text-emerald-700">{fmt(total)} ج</td></tr>)}</tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black"><tr><td className="px-3 py-3">إجمالي الشقة</td><td className="px-3 py-3">{fmt(totalArea)} م²</td><td className="px-3 py-3">{fmt(rooms.reduce((sum, room) => sum + getRoomMeasures(room).walls, 0))} م²</td><td className="px-3 py-3 text-lg text-emerald-700">{fmt(estimateTotal)} ج</td></tr></tfoot>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white">
          <span className="font-bold">إجمالي المقايسة شامل البنود والتسعير</span>
          <span className="text-xl font-black">{fmt(estimateTotal)} ج</span>
          <button type="button" onClick={createQuotation} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-60"><Save className="h-4 w-4" /> اعتماد كعرض سعر <ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
};

const NumberInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => (
  <label className="block text-[10px] font-bold text-slate-500">
    {label}
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, Number(event.target.value) || 0)))}
      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-sky-400"
    />
  </label>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"><div className="text-[9px] text-slate-400">{label}</div><div className="font-bold text-slate-700">{value}</div></div>
);

export default ApartmentEstimatePage;
