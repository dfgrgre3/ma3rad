import React, { useState, useEffect } from 'react';
import {
  Barcode, Printer, Search, Check, Layers, Sliders, RefreshCw, Eye, Tag, FileText, CheckCircle2
} from 'lucide-react';
import { ProductService } from '../../services/ProductService';
import { SettingsService } from '../../services/SettingsService';
import { Product } from '../../types';

interface LabelSettings {
  labelSize: '50x30' | '60x40' | '80x50' | 'A4_SHEET';
  showPriceM2: boolean;
  showPriceBox: boolean;
  showSize: boolean;
  showGrade: boolean;
  showBrand: boolean;
  showBarcodeNumber: boolean;
}

export const BarcodesPrintPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [labelCopies, setLabelCopies] = useState<number>(6);
  const [search, setSearch] = useState('');

  const [settings, setSettings] = useState<LabelSettings>({
    labelSize: '60x40',
    showPriceM2: true,
    showPriceBox: true,
    showSize: true,
    showGrade: true,
    showBrand: true,
    showBarcodeNumber: true,
  });

  const productService = new ProductService();

  useEffect(() => {
    try {
      const all = productService.getAllProducts();
      setProducts(all);
      if (all.length > 0) {
        setSelectedProductId(all[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const selectedProduct = products.find(p => p.id === selectedProductId) || products[0];
  const showroomName = SettingsService.getSettings().showroomName;

  const filteredProducts = products.filter(p =>
    p.name.includes(search) || p.barcode.includes(search) || p.sku.includes(search)
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      {/* Header (Hidden when printing) */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600">
            <Barcode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">استوديو طباعة باركود وملصقات السيراميك (Barcode Studio)</h1>
            <p className="text-xs text-slate-500 font-medium">
              تصميم وتجهيز باركود الكراتين والعينات مع المقاس والفرز والأسعار للطابعات الحرارية
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-600/20 active:scale-95"
        >
          <Printer className="w-4 h-4" />
          طباعة الملصقات ({labelCopies} نسخة)
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6">
        {/* Left Controls (Hidden on print) */}
        <div className="w-full lg:w-96 space-y-5 overflow-y-auto no-print">
          {/* Select Product */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700">اختر صنف السيراميك</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="بحث بالاسم أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  type="button"
                  className={`w-full text-right p-2.5 rounded-xl border text-xs transition ${
 selectedProductId === p.id
 ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 font-bold'
 : 'bg-white hover:border-slate-300'
 }`}
                >
                  <div className="truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {p.size} | باركود: {p.barcode}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Label Dimensions Preset */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700">مقاس الملصق الحراري</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, labelSize: '60x40' }))}
                className={`p-2.5 rounded-xl border font-bold transition text-center ${
 settings.labelSize === '60x40'
 ? 'bg-sky-500/20 text-sky-700 border-sky-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                60 × 40 مم (كراتين)
              </button>
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, labelSize: '50x30' }))}
                className={`p-2.5 rounded-xl border font-bold transition text-center ${
 settings.labelSize === '50x30'
 ? 'bg-sky-500/20 text-sky-700 border-sky-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                50 × 30 مم (أرفف)
              </button>
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, labelSize: '80x50' }))}
                className={`p-2.5 rounded-xl border font-bold transition text-center ${
 settings.labelSize === '80x50'
 ? 'bg-sky-500/20 text-sky-700 border-sky-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                80 × 50 مم (عينات)
              </button>
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, labelSize: 'A4_SHEET' }))}
                className={`p-2.5 rounded-xl border font-bold transition text-center ${
 settings.labelSize === 'A4_SHEET'
 ? 'bg-sky-500/20 text-sky-700 border-sky-500/40'
 : 'bg-white border-slate-200'
 }`}
              >
                ورقة A4 (24 ملصق)
              </button>
            </div>
          </div>

          {/* Toggle Display Elements */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <label className="block text-xs font-bold text-slate-700">عناصر الملصق الظاهرة</label>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPriceM2}
                  onChange={(e) => setSettings(s => ({ ...s, showPriceM2: e.target.checked }))}
                  className="rounded border-slate-300 bg-slate-50 text-sky-500"
                />
                <span>سعر المتر المربع (ج/م²)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPriceBox}
                  onChange={(e) => setSettings(s => ({ ...s, showPriceBox: e.target.checked }))}
                  className="rounded border-slate-300 bg-slate-50 text-sky-500"
                />
                <span>سعر الكرتونة</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showGrade}
                  onChange={(e) => setSettings(s => ({ ...s, showGrade: e.target.checked }))}
                  className="rounded border-slate-300 bg-slate-50 text-sky-500"
                />
                <span>درجة الفرز (فرز أول / ثاني)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showSize}
                  onChange={(e) => setSettings(s => ({ ...s, showSize: e.target.checked }))}
                  className="rounded border-slate-300 bg-slate-50 text-sky-500"
                />
                <span>المقاس (مثال: 60×120)</span>
              </label>
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <label className="block text-xs font-bold text-slate-700 mb-2">عدد النسخ المطلوبة للطباعة</label>
            <input
              type="number"
              min="1"
              max="100"
              value={labelCopies}
              onChange={(e) => setLabelCopies(Number.parseInt(e.target.value, 10) || 1)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

        {/* Right: Live Label Preview Sheet */}
        <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-start overflow-y-auto">
          <div className="text-xs font-bold text-slate-500 mb-4 flex items-center gap-2 no-print self-start">
            <Eye className="w-4 h-4 text-sky-600" />
            معاينة الملصق المباشرة (جاهز للطباعة الحرارية)
          </div>

          {selectedProduct ? (
            <div className="w-full flex flex-wrap gap-4 justify-center" id="barcode-print-container">
              {Array.from({ length: labelCopies }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white text-slate-900 rounded-xl border-2 border-slate-200 p-3.5 flex flex-col justify-between shadow-md print-label"
                  style={{
                    width: settings.labelSize === '50x30' ? '240px' : settings.labelSize === '80x50' ? '320px' : '280px',
                    minHeight: settings.labelSize === '50x30' ? '140px' : settings.labelSize === '80x50' ? '190px' : '165px',
                  }}
                >
                  <div>
                    {/* Header: Company & Grade */}
                    <div className="flex items-start justify-between border-b border-slate-300 pb-1.5 mb-1.5">
                      <span className="text-[11px] font-black tracking-tight text-slate-800 truncate">
                        {showroomName}
                      </span>
                      {settings.showGrade && (
                        <span className="text-[10px] font-black px-1.5 py-0.2 bg-white text-slate-900 rounded">
                          {({ GRADE_1: 'فرز أول', GRADE_2: 'فرز ثان', GRADE_3: 'فرز ثالث', COMMERCIAL: 'تجاري' } as Record<string, string>)[selectedProduct.grade] || selectedProduct.grade}
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <div className="font-black text-xs text-slate-950 leading-tight mb-1 truncate">
                      {selectedProduct.name}
                    </div>

                    {/* Meta: Size & Brand */}
                    <div className="flex items-center justify-between text-[11px] text-slate-700 font-bold mb-2">
                      {settings.showSize && <span>المقاس: {selectedProduct.size}</span>}
                      <span>{selectedProduct.metersPerBox} م²/كرتونة</span>
                    </div>
                  </div>

                  {/* Show the registered barcode value without drawing a fake barcode. */}
                  <div className="my-1 text-center">
                    <div className="inline-block py-1 px-3 bg-slate-50 border border-slate-200 rounded">
                      {settings.showBarcodeNumber && (
                        <span className="text-[10px] font-mono tracking-widest text-slate-900 block mt-0.5">
                          {selectedProduct.barcode || 'لا يوجد باركود مسجل'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pricing Footer */}
                  <div className="border-t border-slate-300 pt-1.5 flex items-center justify-between text-xs">
                    {settings.showPriceM2 && (
                      <span className="font-black text-slate-900">
                        {selectedProduct.sellingPriceM2} ج / م²
                      </span>
                    )}
                    {settings.showPriceBox && (
                      <span className="text-[11px] font-bold text-slate-600">
                        الكرتونة: {Math.round(selectedProduct.sellingPriceM2 * (selectedProduct.metersPerBox || 1.44))} ج
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">لا يوجد منتج محدد</div>
          )}
        </div>
      </div>
    </div>
  );
};
