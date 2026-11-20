import React, { useEffect, useState } from 'react';
import { Calculator, X, Sparkles, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';
import { ProductPicker } from './ProductPicker';

const DOOR_SIZES = [
  { id: 'door-70', label: '70 × 210 سم — حمام', width: 0.7, height: 2.1 },
  { id: 'door-80', label: '80 × 210 سم — داخلي', width: 0.8, height: 2.1 },
  { id: 'door-90', label: '90 × 210 سم — داخلي/مدخل', width: 0.9, height: 2.1 },
  { id: 'door-100', label: '100 × 210 سم — مدخل واسع', width: 1, height: 2.1 },
  { id: 'door-120', label: '120 × 210 سم — باب مزدوج', width: 1.2, height: 2.1 },
];
const WINDOW_SIZES = [
  { id: 'window-60', label: '60 × 60 سم', width: 0.6, height: 0.6 },
  { id: 'window-80', label: '80 × 100 سم', width: 0.8, height: 1 },
  { id: 'window-100', label: '100 × 120 سم', width: 1, height: 1.2 },
  { id: 'window-120', label: '120 × 120 سم', width: 1.2, height: 1.2 },
  { id: 'window-150', label: '150 × 120 سم', width: 1.5, height: 1.2 },
  { id: 'window-180', label: '180 × 120 سم', width: 1.8, height: 1.2 },
];

interface CeramicCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddToCart?: (product: Product, quantityM2: number, boxesCount: number) => void;
}

export const CeramicCalculatorModal: React.FC<CeramicCalculatorModalProps> = ({
  isOpen,
  onClose,
  products,
  onAddToCart,
}) => {
  const [calculationMode, setCalculationMode] = useState<'FLOOR' | 'WALLS' | 'COMBINED'>('FLOOR');

  // Room inputs
  const [length, setLength] = useState<number>(4);
  const [width, setWidth] = useState<number>(3);
  const [height, setHeight] = useState<number>(2.8);

  // Deductions
  const [doors, setDoors] = useState([{ name: 'باب 1', width: 0.9, height: 2.1, wall: 1, sizePreset: 'door-90' }]);
  const [windows, setWindows] = useState([{ name: 'شباك 1', width: 1.2, height: 1.2, wall: 2, sizePreset: 'window-120' }]);
  const [doorPresetId, setDoorPresetId] = useState('door-90');
  const [windowPresetId, setWindowPresetId] = useState('window-120');
  const [doorCountToAdd, setDoorCountToAdd] = useState(1);
  const [windowCountToAdd, setWindowCountToAdd] = useState(1);

  // Waste pattern
  const [wastePercentage, setWastePercentage] = useState<number>(10);
  const [customWaste, setCustomWaste] = useState('10');
  const chooseWaste = (value: number) => { setWastePercentage(value); setCustomWaste(String(value)); };
  const [tileLengthCm, setTileLengthCm] = useState(60);
  const [tileWidthCm, setTileWidthCm] = useState(60);
  const [adhesiveKgPerM2, setAdhesiveKgPerM2] = useState(5);
  const [jointWidthMm, setJointWidthMm] = useState(2);
  const [groutDepthMm, setGroutDepthMm] = useState(8);
  const [materialReserve, setMaterialReserve] = useState(5);
  const [includeWaterproofing, setIncludeWaterproofing] = useState(false);
  const [waterproofingKgPerM2, setWaterproofingKgPerM2] = useState(1.2);

  // Selected product
  const ceramicProducts = products.filter(p => p.productType !== 'GENERAL' && Number.isFinite(p.metersPerBox) && p.metersPerBox > 0);
  const [selectedProductId, setSelectedProductId] = useState<string>(ceramicProducts[0]?.id || '');

  const addDoors = () => {
    const size = DOOR_SIZES.find(option => option.id === doorPresetId) || DOOR_SIZES[2];
    setDoors(current => [...current, ...Array.from({ length: Math.max(1, Math.min(50, doorCountToAdd)) }, (_, index) => ({ name: `باب ${current.length + index + 1}`, width: size.width, height: size.height, wall: 1, sizePreset: size.id }))]);
  };
  const addWindows = () => {
    const size = WINDOW_SIZES.find(option => option.id === windowPresetId) || WINDOW_SIZES[3];
    setWindows(current => [...current, ...Array.from({ length: Math.max(1, Math.min(50, windowCountToAdd)) }, (_, index) => ({ name: `شباك ${current.length + index + 1}`, width: size.width, height: size.height, wall: 2, sizePreset: size.id }))]);
  };

  useEffect(() => {
    if (!ceramicProducts.some(p => p.id === selectedProductId)) setSelectedProductId(ceramicProducts[0]?.id || '');
  }, [ceramicProducts, selectedProductId]);

  useEffect(() => {
    const size = ceramicProducts.find(p => p.id === selectedProductId)?.size || '';
    const dimensions = size.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
    if (dimensions) {
      setTileLengthCm(Number(dimensions[1]));
      setTileWidthCm(Number(dimensions[2]));
    }
  }, [ceramicProducts, selectedProductId]);

  if (!isOpen) return null;

  const selectedProduct = ceramicProducts.find(p => p.id === selectedProductId);

  // Calculations
  const floorNetArea = length * width;

  // Walls net area: perimeter * height - doors - windows
  const perimeter = 2 * (length + width);
  const wallsGrossArea = perimeter * height;
  const doorsDeduction = doors.reduce((sum, opening) => sum + opening.width * opening.height, 0);
  const windowsDeduction = windows.reduce((sum, opening) => sum + opening.width * opening.height, 0);
  const wallsNetArea = wallsGrossArea - doorsDeduction - windowsDeduction;

  const netTargetArea =
    calculationMode === 'FLOOR'
      ? floorNetArea
      : calculationMode === 'WALLS'
      ? wallsNetArea
      : floorNetArea + wallsNetArea;

  const wasteArea = (netTargetArea * wastePercentage) / 100;
  const grossRequiredArea = netTargetArea + wasteArea;

  const metersPerBox = selectedProduct?.metersPerBox || 0;
  const boxesNeeded = metersPerBox > 0 ? Math.ceil(grossRequiredArea / metersPerBox) : 0;
  const actualCoveredArea = boxesNeeded * metersPerBox;
  const _surplusArea = actualCoveredArea - grossRequiredArea;

  const unitPrice = selectedProduct?.sellingPriceM2 || 0;
  const estimatedCost = actualCoveredArea * unitPrice;
  const tileAreaM2 = tileLengthCm > 0 && tileWidthCm > 0 ? (tileLengthCm * tileWidthCm) / 10000 : 0;
  const materialArea = netTargetArea * (1 + materialReserve / 100);
  const tileCountEstimate = tileAreaM2 > 0 ? Math.ceil(materialArea / tileAreaM2) : 0;
  const groutKgPerM2 = tileLengthCm > 0 && tileWidthCm > 0
    ? (((tileLengthCm * 10) + (tileWidthCm * 10)) / ((tileLengthCm * 10) * (tileWidthCm * 10))) * jointWidthMm * groutDepthMm * 1.6
    : 0;
  const adhesiveKg = materialArea * adhesiveKgPerM2;
  const adhesiveBags = Math.ceil(adhesiveKg / 25);
  const groutKg = materialArea * groutKgPerM2;
  const spacersCount = tileCountEstimate * 4;
  const levelingClipsCount = tileCountEstimate * 4;
  const waterproofingKg = includeWaterproofing ? materialArea * waterproofingKgPerM2 : 0;
  const openings = [...doors, ...windows];
  const wallLength = (wall: number) => wall % 2 === 1 ? length : width;
  const invalidOpenings = calculationMode !== 'FLOOR' && openings.some(o => !Number.isFinite(o.width) || !Number.isFinite(o.height) || o.width <= 0 || o.height <= 0 || o.width > wallLength(o.wall) || o.height > height);
  const invalidDimensions = !Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0 || ((calculationMode !== 'FLOOR') && (!Number.isFinite(height) || height <= 0));
  const openingsExceedWalls = calculationMode !== 'FLOOR' && [1, 2, 3, 4].some(wall => openings.filter(o => o.wall === wall).reduce((sum, opening) => sum + opening.width * opening.height, 0) > wallLength(wall) * height);
  const invalidWaste = !Number.isFinite(wastePercentage) || wastePercentage < 0 || wastePercentage > 100;
  const invalidMaterials = !Number.isFinite(tileLengthCm) || !Number.isFinite(tileWidthCm) || tileLengthCm <= 0 || tileWidthCm <= 0 || !Number.isFinite(adhesiveKgPerM2) || adhesiveKgPerM2 < 0 || !Number.isFinite(jointWidthMm) || jointWidthMm < 0 || !Number.isFinite(groutDepthMm) || groutDepthMm < 0 || !Number.isFinite(materialReserve) || materialReserve < 0 || materialReserve > 100 || !Number.isFinite(waterproofingKgPerM2) || waterproofingKgPerM2 < 0;
  const canApply = !!selectedProduct && !invalidDimensions && !invalidOpenings && !openingsExceedWalls && !invalidWaste && !invalidMaterials && netTargetArea > 0 && boxesNeeded > 0;

  const handleApplyToCart = () => {
    if (selectedProduct && onAddToCart && canApply) {
      onAddToCart(selectedProduct, Number(actualCoveredArea.toFixed(2)), boxesNeeded);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scaleIn">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-warning/20 to-warning/20 border border-warning/30 flex items-center justify-center text-warning">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-ink">حاسبة السيراميك وهندسة الغرف والهدر</h2>
              <p className="text-xs text-muted">حساب الأمتار والكراتين والقطع مع مراعاة الفتحات ونمط التركيب</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg font-mono p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Target Area Mode */}
          <fieldset>
            <legend className="block text-xs font-bold text-ink mb-2">نوع المساحة المراد تبليطها</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCalculationMode('FLOOR')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'FLOOR'
 ? 'bg-warning/20 text-warning border-warning/40 shadow-sm'
 : 'bg-surface hover:border-line-strong'
 }`}
              >
                أرضيات فقط
              </button>
              <button
                type="button"
                onClick={() => setCalculationMode('WALLS')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'WALLS'
 ? 'bg-warning/20 text-warning border-warning/40 shadow-sm'
 : 'bg-surface hover:border-line-strong'
 }`}
              >
                حوائط وجدران
              </button>
              <button
                type="button"
                onClick={() => setCalculationMode('COMBINED')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'COMBINED'
 ? 'bg-warning/20 text-warning border-warning/40 shadow-sm'
 : 'bg-surface hover:border-line-strong'
 }`}
              >
                أرضيات + حوائط (حمام/مطبخ)
              </button>
            </div>
          </fieldset>

          {/* Product Selector */}
          <div>
            <label htmlFor="ceramic-product" className="block text-xs font-bold text-ink mb-1.5">اختر صنف السيراميك / البورسلين</label>
            <ProductPicker
              id="ceramic-product"
              value={selectedProductId}
              selectedLabel={selectedProduct?.name}
              ariaLabel="استعراض أصناف السيراميك والبورسلين"
              allowedProductIds={ceramicProducts.map((product) => product.id)}
              onChange={setSelectedProductId}
            />
            {ceramicProducts.length === 0 && <p className="mt-2 text-xs text-danger">لا توجد أصناف سيراميك صالحة للحساب. تحقق من نوع الصنف ومساحة الكرتونة.</p>}
          </div>

          {/* Dimensions Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface p-4 rounded-2xl border border-line/80">
            <div>
              <label htmlFor="ceramic-room-length" className="block text-[11px] font-semibold text-muted mb-1">طول الغرفة (متر)</label>
              <input
                id="ceramic-room-length"
                type="number"
                step="0.05"
                min="0.5"
                value={length}
                onChange={(e) => setLength(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono"
              />
            </div>
            <div>
              <label htmlFor="ceramic-room-width" className="block text-[11px] font-semibold text-muted mb-1">عرض الغرفة (متر)</label>
              <input
                id="ceramic-room-width"
                type="number"
                step="0.05"
                min="0.5"
                value={width}
                onChange={(e) => setWidth(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono"
              />
            </div>
            <div>
              <label htmlFor="ceramic-wall-height" className="block text-[11px] font-semibold text-muted mb-1">ارتفاع الجدار (متر)</label>
              <input
                id="ceramic-wall-height"
                type="number"
                step="0.05"
                min="1.0"
                value={height}
                disabled={calculationMode === 'FLOOR'}
                onChange={(e) => setHeight(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning font-mono disabled:opacity-40"
              />
            </div>
          </div>

          {/* Deductions (Only for walls) */}
          {calculationMode !== 'FLOOR' && (
            <div className="bg-surface p-4 rounded-2xl border border-line/80 space-y-3">
              <span className="text-xs font-bold text-ink block">خصومات الفتحات (أبواب وشبابيك)</span>
              <p className="text-[11px] text-muted">اختر المقاس الشائع والعدد لإضافتهم دفعة واحدة، أو عدّل مقاس كل فتحة يدويًا. المقاسات إرشادية ويُفضّل مطابقتها مع القياس الفعلي بالموقع.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['doors', 'windows'] as const).map((kind) => {
                  const openings = kind === 'doors' ? doors : windows;
                  const setOpenings = kind === 'doors' ? setDoors : setWindows;
                  const presets = kind === 'doors' ? DOOR_SIZES : WINDOW_SIZES;
                  const batchPresetId = kind === 'doors' ? doorPresetId : windowPresetId;
                  const setBatchPresetId = kind === 'doors' ? setDoorPresetId : setWindowPresetId;
                  const countToAdd = kind === 'doors' ? doorCountToAdd : windowCountToAdd;
                  const setCountToAdd = kind === 'doors' ? setDoorCountToAdd : setWindowCountToAdd;
                  return <div key={kind} className="sm:col-span-2 space-y-2">
                    <div className="text-xs font-bold">{kind === 'doors' ? 'الأبواب' : 'الشبابيك'} ({openings.length})</div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_auto] gap-2 rounded-lg bg-warning-soft p-2">
                      <label className="text-[11px] text-ink-secondary">مقاس شائع (العرض × الارتفاع)<select value={batchPresetId} onChange={e => setBatchPresetId(e.target.value)} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink">{presets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                      <label className="text-[11px] text-ink-secondary">العدد<input type="number" min="1" max="50" step="1" value={countToAdd} onChange={e => setCountToAdd(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
                      <button type="button" onClick={kind === 'doors' ? addDoors : addWindows} className="self-end rounded-lg bg-warning px-3 py-2 text-xs font-bold text-white">إضافة العدد</button>
                    </div>
                    {openings.map((opening, index) => <div key={`${kind}-${index}`} className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-end rounded-xl border border-line bg-surface-muted p-2">
                      <label className="text-[11px] text-muted">الاسم<input aria-label={`اسم ${opening.name}`} type="text" value={opening.name} onChange={e => setOpenings(openings.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1 text-ink" /></label>
                      <label className="col-span-2 text-[11px] text-muted">المقاس<select value={opening.sizePreset} onChange={e => { const preset = presets.find(option => option.id === e.target.value); setOpenings(openings.map((item, i) => i === index ? { ...item, sizePreset: e.target.value, ...(preset ? { width: preset.width, height: preset.height } : {}) } : item)); }} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1 text-ink"><option value="custom">مقاس مخصص</option>{presets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                      <label className="text-[11px] text-muted">العرض (م)<input aria-label={`${opening.name} العرض بالمتر`} type="number" min="0.01" step="0.05" value={opening.width} onChange={e => setOpenings(openings.map((item, i) => i === index ? { ...item, sizePreset: 'custom', width: Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1 text-ink" /></label>
                      <label className="text-[11px] text-muted">الارتفاع (م)<input aria-label={`${opening.name} الارتفاع بالمتر`} type="number" min="0.01" step="0.05" value={opening.height} onChange={e => setOpenings(openings.map((item, i) => i === index ? { ...item, sizePreset: 'custom', height: Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1 text-ink" /></label>
                      <label className="text-[11px] text-muted">على أي جدار؟<select value={opening.wall} onChange={e => setOpenings(openings.map((item, i) => i === index ? { ...item, wall: Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1 text-ink">{[1, 2, 3, 4].map(wall => <option key={wall} value={wall}>جدار {wall} ({wallLength(wall).toFixed(2)} م)</option>)}</select></label>
                      <button type="button" onClick={() => setOpenings(openings.filter((_, i) => i !== index))} className="px-2 py-1 text-lg text-danger" aria-label={`حذف ${opening.name}`}>×</button>
                      <span className="col-span-4 text-[10px] text-muted">مساحة الخصم: {(opening.width * opening.height).toFixed(2)} م²</span>
                    </div>)}
                  </div>;
                })}
              </div>
            </div>
          )}

          {calculationMode !== 'FLOOR' && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-warning-border bg-warning-soft p-3 text-center text-xs">
            <div><span className="block text-muted">خصم الأبواب</span><b>{doorsDeduction.toFixed(2)} م²</b></div>
            <div><span className="block text-muted">خصم الشبابيك</span><b>{windowsDeduction.toFixed(2)} م²</b></div>
            <div><span className="block text-muted">صافي الجدران</span><b>{wallsNetArea.toFixed(2)} م²</b></div>
          </div>}

          {/* Waste pattern selector */}
          <fieldset>
            <legend className="block text-xs font-bold text-ink mb-2">
              طريقة التركيب ونسبة الهدر الموصى بها (Waste Allowance)
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => chooseWaste(5)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 5
 ? 'bg-warning/15 text-warning border-warning/40'
 : 'bg-surface border-line'
 }`}
              >
                <div className="text-xs font-bold">+5% تركيب عدل</div>
                <div className="text-[10px] text-muted mt-0.5">غرف مستطيلة قياسية</div>
              </button>

              <button
                type="button"
                onClick={() => chooseWaste(10)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 10
 ? 'bg-warning/15 text-warning border-warning/40'
 : 'bg-surface border-line'
 }`}
              >
                <div className="text-xs font-bold">+10% تركيب مائل</div>
                <div className="text-[10px] text-muted mt-0.5">سمبوكسة أو زوايا شاطرة</div>
              </button>

              <button
                type="button"
                onClick={() => chooseWaste(15)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 15
 ? 'bg-warning/15 text-warning border-warning/40'
 : 'bg-surface border-line'
 }`}
              >
                <div className="text-xs font-bold">+15% باركيه / هيرينغبون</div>
                <div className="text-[10px] text-muted mt-0.5">قصات كثيرة ومساحات غير منتظمة</div>
              </button>
            </div>
            <label className="mt-3 block text-xs font-semibold text-ink-secondary">نسبة هدر مخصصة (%)
              <input type="number" min="0" max="100" step="0.5" value={customWaste} onChange={e => { setCustomWaste(e.target.value); setWastePercentage(Number(e.target.value)); }} className="mr-2 w-24 rounded-lg border px-2 py-1 text-ink" />
            </label>
          </fieldset>

          <section className="space-y-3 rounded-2xl border border-accent-border bg-accent-soft/60 p-4">
            <div>
              <h3 className="text-sm font-black text-ink">تقدير مواد التركيب</h3>
              <p className="mt-1 text-[11px] text-muted">تقدير إرشادي قابل للتعديل؛ الاستهلاك الفعلي يتغير حسب استواء السطح ونوع اللاصق ومقاس الفواصل.</p>
            </div>
            <div className="grid grid-cols-1  sm:grid-cols-4 gap-2">
              <label className="text-[11px] text-ink-secondary">طول البلاطة (سم)<input type="number" min="1" step="1" value={tileLengthCm} onChange={e => setTileLengthCm(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="text-[11px] text-ink-secondary">عرض البلاطة (سم)<input type="number" min="1" step="1" value={tileWidthCm} onChange={e => setTileWidthCm(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="text-[11px] text-ink-secondary">لاصق (كجم/م²)<input type="number" min="0" step="0.5" value={adhesiveKgPerM2} onChange={e => setAdhesiveKgPerM2(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="text-[11px] text-ink-secondary">عرض الفاصل (مم)<input type="number" min="0" step="0.5" value={jointWidthMm} onChange={e => setJointWidthMm(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="text-[11px] text-ink-secondary">عمق الروبة (مم)<input type="number" min="0" step="1" value={groutDepthMm} onChange={e => setGroutDepthMm(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="text-[11px] text-ink-secondary">احتياطي المواد (%)<input type="number" min="0" max="100" step="1" value={materialReserve} onChange={e => setMaterialReserve(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>
              <label className="flex items-center gap-2 text-[11px] text-ink-secondary"><input type="checkbox" checked={includeWaterproofing} onChange={e => setIncludeWaterproofing(e.target.checked)} />عزل مائي للمناطق الرطبة</label>
              {includeWaterproofing && <label className="text-[11px] text-ink-secondary">العزل (كجم/م²)<input type="number" min="0" step="0.1" value={waterproofingKgPerM2} onChange={e => setWaterproofingKgPerM2(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-surface px-2 py-1.5 text-ink" /></label>}
            </div>
            <div className="grid grid-cols-1  sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border bg-surface p-2"><span className="block text-[10px] text-muted">لاصق 25 كجم</span><b className="text-sm text-ink">{adhesiveBags} كيس</b><span className="block text-[10px] text-muted">{adhesiveKg.toFixed(1)} كجم إجمالي · {adhesiveKgPerM2} كجم/م²</span></div>
              <div className="rounded-xl border bg-surface p-2"><span className="block text-[10px] text-muted">روبة الفواصل</span><b className="text-sm text-ink">{groutKg.toFixed(1)} كجم</b><span className="block text-[10px] text-muted">{groutKgPerM2.toFixed(2)} كجم/م²</span></div>
              <div className="rounded-xl border bg-surface p-2"><span className="block text-[10px] text-muted">فواصل البلاط</span><b className="text-sm text-ink">{spacersCount} قطعة</b><span className="block text-[10px] text-muted">تقدير 4 لكل بلاطة</span></div>
              <div className="rounded-xl border bg-surface p-2"><span className="block text-[10px] text-muted">كليبس تسوية (اختياري)</span><b className="text-sm text-ink">{levelingClipsCount} قطعة</b><span className="block text-[10px] text-muted">تقدير 4 لكل بلاطة</span></div>
              {includeWaterproofing && <div className="rounded-xl border bg-surface p-2"><span className="block text-[10px] text-muted">عزل مائي</span><b className="text-sm text-ink">{waterproofingKg.toFixed(1)} كجم</b><span className="block text-[10px] text-muted">{waterproofingKgPerM2} كجم/م²</span></div>}
            </div>
            <p className="text-[10px] text-muted">الحساب على مساحة التنفيذ {netTargetArea.toFixed(2)} م² مع احتياطي مواد {materialReserve}%، ولا يشمل الهدر الخاص بقص البلاط.</p>
          </section>

          {(invalidDimensions || invalidOpenings || openingsExceedWalls || invalidWaste || invalidMaterials || !selectedProduct) && <div role="alert" className="rounded-xl border border-danger-border bg-danger-soft p-3 text-xs text-danger">
            {!selectedProduct && <p>اختر صنف سيراميك صالحًا للحساب.</p>}{invalidDimensions && <p>أدخل أبعادًا أكبر من صفر للغرفة والجدران المستخدمة.</p>}{invalidOpenings && <p>تحقق من أبعاد كل فتحة؛ يجب ألا يتجاوز عرضها الجدار المحدد أو ارتفاعها ارتفاع الغرفة.</p>}{openingsExceedWalls && <p>مجموع مساحات الفتحات يتجاوز مساحة أحد الجدران المحددة.</p>}{invalidWaste && <p>نسبة الهدر يجب أن تكون بين 0% و100%.</p>}{invalidMaterials && <p>تحقق من مقاس البلاطة ومعدلات استهلاك المواد وقيم الاحتياطي.</p>}
          </div>}

          {/* Result Card */}
          <div className="bg-gradient-to-br from-warning/10 via-warning/5 to-line border border-warning/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3 border-b border-warning/20 pb-2">
              <span className="text-xs font-black text-warning flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                النتيجة الهندسية للكمية المطلوبة
              </span>
              <span className="text-xs font-bold text-ink">
              {boxesNeeded} كرتونة ({actualCoveredArea.toFixed(2)} م²)
              </span>
            </div>

            <div className="grid grid-cols-1  sm:grid-cols-4 gap-3 text-center">
              <div className="p-2 rounded-xl bg-surface border border-line">
                <span className="text-[11px] text-muted block">صافي المساحة</span>
                <span className="text-sm font-bold text-ink">{netTargetArea.toFixed(2)} م²</span>
              </div>

              <div className="p-2 rounded-xl bg-surface border border-line">
                <span className="text-[11px] text-muted block">الهدر (+{wastePercentage}%)</span>
                <span className="text-sm font-bold text-warning">{wasteArea.toFixed(2)} م²</span>
              </div>

              <div className="p-2 rounded-xl bg-surface border border-line">
                <span className="text-[11px] text-muted block">عدد الكراتين</span>
                <span className="text-base font-black text-success">{boxesNeeded} كرتونة</span>
              </div>

              <div className="p-2 rounded-xl bg-surface border border-line">
                <span className="text-[11px] text-muted block">التكلفة التقديرية بسعر المتر</span>
                <span className="text-sm font-bold text-primary">
                  {new Intl.NumberFormat('ar-EG').format(Math.round(estimatedCost))} ج
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line bg-surface flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-sunken hover:bg-surface-sunken text-ink rounded-xl text-xs font-semibold"
          >
            إغلاق
          </button>

          {onAddToCart && (
            <button
              type="button"
              onClick={handleApplyToCart}
              disabled={!canApply}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-warning to-warning hover:from-warning hover:to-warning text-white rounded-xl text-xs font-bold shadow-lg shadow-warning/20 active:scale-95 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ShoppingCart className="w-4 h-4" />
              إضافة المحسوب مباشرة إلى سلة البيع ({boxesNeeded} كرتونة)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
