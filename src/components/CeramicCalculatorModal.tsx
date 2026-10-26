import React, { useState } from 'react';
import { Calculator, X, Plus, Check, Ruler, Sparkles, AlertCircle, ShoppingCart } from 'lucide-react';
import { Product } from '../types';

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
  const [doorsCount, setDoorsCount] = useState<number>(1);
  const [doorWidth, setDoorWidth] = useState<number>(0.9);
  const [doorHeight, setDoorHeight] = useState<number>(2.1);

  const [windowsCount, setWindowsCount] = useState<number>(1);
  const [windowWidth, setWindowWidth] = useState<number>(1.2);
  const [windowHeight, setWindowHeight] = useState<number>(1.2);

  // Waste pattern
  const [wastePercentage, setWastePercentage] = useState<number>(10);

  // Selected product
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');

  if (!isOpen) return null;

  const selectedProduct = products.find(p => p.id === selectedProductId) || products[0];

  // Calculations
  const floorNetArea = (length || 0) * (width || 0);

  // Walls net area: perimeter * height - doors - windows
  const perimeter = 2 * ((length || 0) + (width || 0));
  const wallsGrossArea = perimeter * (height || 0);
  const doorsDeduction = (doorsCount || 0) * (doorWidth || 0) * (doorHeight || 0);
  const windowsDeduction = (windowsCount || 0) * (windowWidth || 0) * (windowHeight || 0);
  const wallsNetArea = Math.max(0, wallsGrossArea - doorsDeduction - windowsDeduction);

  const netTargetArea =
    calculationMode === 'FLOOR'
      ? floorNetArea
      : calculationMode === 'WALLS'
      ? wallsNetArea
      : floorNetArea + wallsNetArea;

  const wasteArea = (netTargetArea * (wastePercentage || 0)) / 100;
  const grossRequiredArea = netTargetArea + wasteArea;

  const metersPerBox = selectedProduct?.metersPerBox || 1.44;
  const boxesNeeded = Math.ceil(grossRequiredArea / (metersPerBox || 1));
  const actualCoveredArea = boxesNeeded * metersPerBox;
  const surplusArea = actualCoveredArea - grossRequiredArea;

  const unitPrice = selectedProduct?.sellingPriceM2 || 0;
  const estimatedCost = actualCoveredArea * unitPrice;

  const handleApplyToCart = () => {
    if (selectedProduct && onAddToCart) {
      onAddToCart(selectedProduct, Number(actualCoveredArea.toFixed(2)), boxesNeeded);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scaleIn" dir="rtl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">حاسبة السيراميك وهندسة الغرف والهدر</h2>
              <p className="text-xs text-slate-500">حساب الأمتار والكراتين والقطع مع مراعاة الفتحات ونمط التركيب</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-lg font-mono p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Target Area Mode */}
          <fieldset>
            <legend className="block text-xs font-bold text-slate-700 mb-2">نوع المساحة المراد تبليطها</legend>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCalculationMode('FLOOR')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'FLOOR'
 ? 'bg-amber-500/20 text-amber-700 border-amber-500/40 shadow-sm'
 : 'bg-white hover:border-slate-300'
 }`}
              >
                أرضيات فقط
              </button>
              <button
                type="button"
                onClick={() => setCalculationMode('WALLS')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'WALLS'
 ? 'bg-amber-500/20 text-amber-700 border-amber-500/40 shadow-sm'
 : 'bg-white hover:border-slate-300'
 }`}
              >
                حوائط وجدران
              </button>
              <button
                type="button"
                onClick={() => setCalculationMode('COMBINED')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
 calculationMode === 'COMBINED'
 ? 'bg-amber-500/20 text-amber-700 border-amber-500/40 shadow-sm'
 : 'bg-white hover:border-slate-300'
 }`}
              >
                أرضيات + حوائط (حمام/مطبخ)
              </button>
            </div>
          </fieldset>

          {/* Product Selector */}
          <div>
            <label htmlFor="ceramic-product" className="block text-xs font-bold text-slate-700 mb-1.5">اختر صنف السيراميك / البورسلين</label>
            <select
              id="ceramic-product"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} - مقاس ({p.size}) - {p.metersPerBox} م²/كرتونة - {p.sellingPriceM2} ج/م²
                </option>
              ))}
            </select>
          </div>

          {/* Dimensions Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-slate-200/80">
            <div>
              <label htmlFor="ceramic-room-length" className="block text-[11px] font-semibold text-slate-500 mb-1">طول الغرفة (متر)</label>
              <input
                id="ceramic-room-length"
                type="number"
                step="0.05"
                min="0.5"
                value={length}
                onChange={(e) => setLength(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label htmlFor="ceramic-room-width" className="block text-[11px] font-semibold text-slate-500 mb-1">عرض الغرفة (متر)</label>
              <input
                id="ceramic-room-width"
                type="number"
                step="0.05"
                min="0.5"
                value={width}
                onChange={(e) => setWidth(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label htmlFor="ceramic-wall-height" className="block text-[11px] font-semibold text-slate-500 mb-1">ارتفاع الجدار (متر)</label>
              <input
                id="ceramic-wall-height"
                type="number"
                step="0.05"
                min="1.0"
                value={height}
                disabled={calculationMode === 'FLOOR'}
                onChange={(e) => setHeight(Number.parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono disabled:opacity-40"
              />
            </div>
          </div>

          {/* Deductions (Only for walls) */}
          {calculationMode !== 'FLOOR' && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-700 block">خصومات الفتحات (أبواب وشبابيك)</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="ceramic-doors-count" className="text-xs text-slate-500">الأبواب:</label>
                  <input
                    id="ceramic-doors-count"
                    type="number"
                    min="0"
                    value={doorsCount}
                    onChange={(e) => setDoorsCount(Number.parseInt(e.target.value, 10) || 0)}
                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 text-center"
                  />
                  <span className="text-[11px] text-slate-500">باب</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="ceramic-windows-count" className="text-xs text-slate-500">الشبابيك:</label>
                  <input
                    id="ceramic-windows-count"
                    type="number"
                    min="0"
                    value={windowsCount}
                    onChange={(e) => setWindowsCount(Number.parseInt(e.target.value, 10) || 0)}
                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 text-center"
                  />
                  <span className="text-[11px] text-slate-500">شباك</span>
                </div>
              </div>
            </div>
          )}

          {/* Waste pattern selector */}
          <fieldset>
            <legend className="block text-xs font-bold text-slate-700 mb-2">
              طريقة التركيب ونسبة الهدر الموصى بها (Waste Allowance)
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setWastePercentage(5)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 5
 ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                <div className="text-xs font-bold">+5% تركيب عدل</div>
                <div className="text-[10px] text-slate-500 mt-0.5">غرف مستطيلة قياسية</div>
              </button>

              <button
                type="button"
                onClick={() => setWastePercentage(10)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 10
 ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                <div className="text-xs font-bold">+10% تركيب مائل</div>
                <div className="text-[10px] text-slate-500 mt-0.5">سمبوكسة أو زوايا شاطرة</div>
              </button>

              <button
                type="button"
                onClick={() => setWastePercentage(15)}
                className={`p-2.5 rounded-xl border text-right transition ${
 wastePercentage === 15
 ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                <div className="text-xs font-bold">+15% باركيه / هيرينغبون</div>
                <div className="text-[10px] text-slate-500 mt-0.5">قصات كثيرة ومساحات غير منتظمة</div>
              </button>
            </div>
          </fieldset>

          {/* Result Card */}
          <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-slate-50 border border-amber-500/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3 border-b border-amber-500/20 pb-2">
              <span className="text-xs font-black text-amber-600 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                النتيجة الهندسية للكمية المطلوبة
              </span>
              <span className="text-xs font-bold text-slate-900">
                {boxesNeeded} كرتونة ({actualCoveredArea.toFixed(2)} م²)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">صافي المساحة</span>
                <span className="text-sm font-bold text-slate-900">{netTargetArea.toFixed(2)} م²</span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">الهدر (+{wastePercentage}%)</span>
                <span className="text-sm font-bold text-amber-600">{wasteArea.toFixed(2)} م²</span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">عدد الكراتين</span>
                <span className="text-base font-black text-emerald-600">{boxesNeeded} كرتونة</span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <span className="text-[11px] text-slate-500 block">التكلفة المتوقعة</span>
                <span className="text-sm font-bold text-sky-600">
                  {new Intl.NumberFormat('ar-EG').format(Math.round(estimatedCost))} ج
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
          >
            إغلاق
          </button>

          {onAddToCart && (
            <button
              type="button"
              onClick={handleApplyToCart}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 active:scale-95 transition"
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
