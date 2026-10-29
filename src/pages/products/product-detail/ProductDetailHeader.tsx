import React from 'react';
import { Package, Edit, ArrowRight } from 'lucide-react';
import { Product } from '../../../types';
import { getProductUnitLabel } from '../../../utils/productUnits';
import { TABS, GRADE_LABELS, Tab } from './constants';
import { fmt } from './format';
import { StockSummary } from './types';
import { usePermission } from '../../../hooks/usePermission';
import { useBusinessProfileMeta, useBusinessTerm } from '../../../hooks/useBusinessTerm';

interface ProductDetailHeaderProps {
  product: Product;
  stock: StockSummary;
  canEdit: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onBack: () => void;
  onEdit: () => void;
}

export const ProductDetailHeader: React.FC<ProductDetailHeaderProps> = ({ product, stock, canEdit, tab, onTabChange, onBack, onEdit }) => {
  const can = usePermission();
  const canViewInventory = can('inventory.view');
  const productsLabel = useBusinessTerm('entities.products.plural');
  const { label: businessProfileLabel } = useBusinessProfileMeta();

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100" title="رجوع">
            <ArrowRight className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center"><Package className="w-7 h-7 text-sky-600" /></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${product.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{product.isActive ? 'نشط' : 'غير نشط'}</span>
              {product.productType !== 'GENERAL' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 font-bold">{GRADE_LABELS[product.grade] || product.grade}</span>}
            </div>
            <h1 className="text-lg font-black text-slate-900">{product.name}</h1>
            <div className="mt-1 text-[11px] font-bold text-sky-700">{productsLabel} · {businessProfileLabel}</div>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
              <span>#{product.sku}</span>
              <span>باركود: {product.barcode}</span>
              {product.categoryName && <span>{product.categoryName}</span>}
              {product.brandName && <span>{product.brandName}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canViewInventory && <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
            <div className="text-base font-black text-sky-600">{fmt(stock.totalM2)}</div>
            <div className="text-[10px] text-slate-500">{product.productType === 'GENERAL' ? `${getProductUnitLabel(product)} متاح` : 'م² متاح'}</div>
          </div>}
          {canViewInventory && product.productType !== 'GENERAL' && <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
            <div className="text-base font-black text-slate-700">{fmt(stock.totalBoxes)}</div>
            <div className="text-[10px] text-slate-500">كرتونة</div>
          </div>}
          {canViewInventory && product.productType !== 'GENERAL' && <div className="text-center px-3 py-2 bg-slate-100 rounded-xl">
            <div className="text-base font-black text-slate-700">{fmt(stock.totalPieces)}</div>
            <div className="text-[10px] text-slate-500">قطعة</div>
          </div>}
          {canEdit && (
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition">
              <Edit className="w-4 h-4" /> تعديل
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mt-4 overflow-x-auto">
        {TABS.filter((t) => {
          if (t.id === 'batches' && product.productType === 'GENERAL') return false;
          if ((t.id === 'batches' || t.id === 'inventory' || t.id === 'history') && !canViewInventory) return false;
          if (t.id === 'sales' && !can('sales.view')) return false;
          if (t.id === 'purchases' && !can('purchases.view')) return false;
          if (t.id === 'pricing' && !can('pricing.view')) return false;
          if (t.id === 'documents' && !can('documents.view')) return false;
          if (t.id === 'activity' && !can('audit.view')) return false;
          return true;
        }).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => onTabChange(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
