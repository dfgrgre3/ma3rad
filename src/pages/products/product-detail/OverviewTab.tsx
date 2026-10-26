import React from 'react';
import { Product } from '../../../types';
import { getProductUnitLabel } from '../../../utils/productUnits';
import { SURFACE_LABELS } from './constants';
import { money } from './format';

interface OverviewTabProps {
  product: Product;
  margin: number | null;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ product, margin }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">البيانات الأساسية</h3>
        <dl className="space-y-3">
          {[
            { label: 'المقاس', value: product.size },
            { label: 'السمكة', value: product.thickness ? `${product.thickness} سم` : '' },
            { label: 'اللون', value: product.color },
            { label: 'التشطيب', value: product.finish },
            { label: 'مكان الاستخدام', value: SURFACE_LABELS[product.surfaceLocation || ''] || product.surfaceLocation },
            ...(product.productType === 'GENERAL'
              ? [{ label: 'وحدة الصنف', value: getProductUnitLabel(product) }]
              : [{ label: 'عدد القطع بالكرتونة', value: product.piecesPerBox }, { label: 'م²/كرتونة', value: product.metersPerBox }]),
            { label: 'وزن الكرتونة', value: product.weightPerBox ? `${product.weightPerBox} كجم` : '' },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="text-sm font-semibold text-slate-900">{String(row.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4">الأسعار</h3>
        <div className="space-y-3">
          {[
            { label: 'سعر التكلفة', value: product.costPrice, color: 'text-rose-600' },
            { label: `سعر البيع (${getProductUnitLabel(product)})`, value: product.sellingPriceM2, color: 'text-sky-600' },
            ...(product.productType === 'GENERAL' ? [] : [
              { label: 'سعر البيع (كرتونة)', value: product.sellingPriceBox, color: 'text-sky-600' },
              { label: 'سعر الجملة (م²)', value: product.wholesalePriceM2, color: 'text-violet-600' },
              { label: 'أقل سعر بيع (م²)', value: product.minSellingPriceM2, color: 'text-amber-600' },
            ]),
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-xs text-slate-500">{row.label}</span>
              <span className={`text-sm font-black ${row.color}`}>{money(row.value)}</span>
            </div>
          ))}
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex justify-between">
            <span className="text-xs text-slate-700">هامش الربح</span>
            <span className="text-sm font-black text-emerald-600">{margin === null ? '—' : `${margin.toFixed(1)}%`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
