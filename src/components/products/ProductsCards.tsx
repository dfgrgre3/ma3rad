import React from 'react';
import { Copy, Edit, Eye, Package, PackagePlus, Power, Trash2 } from 'lucide-react';
import type { Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { getProductUnitLabel } from '../../utils/productUnits';
import { round, gradeLabel } from './productFormModel';

export interface ProductsCardsProps {
  products: Product[];
  selectedProductIds: string[];
  canViewCosts: boolean;
  canViewPricing: boolean;
  canExportProducts: boolean;
  canDeleteProduct: boolean;
  canUpdateProduct: boolean;
  canCreateProduct: boolean;
  canAdjustInventory: boolean;
  stockOf: (product: Product) => { m2: number; boxes: number; pieces: number };
  stockTone: (product: Product) => string;
  onToggleProductSelection: (id: string) => void;
  onOpenDetails: (product: Product) => void;
  onOpenStock: (product: Product) => void;
  onOpenEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDelete: (id: string) => void;
}

export const ProductsCards: React.FC<ProductsCardsProps> = ({
  products,
  selectedProductIds,
  canViewCosts,
  canViewPricing,
  canExportProducts,
  canDeleteProduct,
  canUpdateProduct,
  canCreateProduct,
  canAdjustInventory,
  stockOf,
  stockTone,
  onToggleProductSelection,
  onOpenDetails,
  onOpenStock,
  onOpenEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
}) => (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {products.map((p) => {
              const stock = stockOf(p);
              return (
                <div key={p.id} className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md ${p.isActive ? '' : 'opacity-60'}`}>
                  <div className="relative h-36 bg-slate-100">
                    {p.imagePath ? <img src={p.imagePath} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="h-10 w-10" /></div>}
                    <span className={`absolute right-2 top-2 rounded-lg px-2 py-1 text-[10px] font-black ${stockTone(p)}`}>{p.productType === 'GENERAL' ? `${round(stock.m2, 3)} ${getProductUnitLabel(p)}` : CeramicMath.formatM2(stock.m2)}</span>
                    {(canExportProducts || canDeleteProduct) && <input aria-label={`تحديد ${p.name}`} type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => onToggleProductSelection(p.id)} className="absolute left-2 top-2 h-4 w-4 rounded border-slate-300 text-sky-600" />}
                    {!p.isActive && <span className="absolute left-2 top-2 rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black text-white">موقوف</span>}
                  </div>
                  <div className="flex-1 space-y-2 p-3.5">
                    <div>
                      <h3 className="truncate text-sm font-extrabold text-slate-900">{p.name}</h3>
                      <p className="text-[10px] text-slate-500">{p.categoryName || '—'} | {p.brandName || '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                      {p.productType === 'GENERAL' ? <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">وحدة الصنف: {getProductUnitLabel(p)}</span> : <>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{p.size}</span>
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">{gradeLabel(p.grade)}</span>
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-700">{p.piecesPerBox} قطعة / {p.metersPerBox} م²</span>
                      </>}
                    </div>
                    <div className={`grid gap-2 text-center ${canViewCosts && canViewPricing ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {canViewPricing && <div className="rounded-lg border border-slate-200 py-1.5">
                        <div className="text-[9px] font-bold text-slate-400">سعر {getProductUnitLabel(p)}</div>
                        <div className="text-xs font-black text-sky-600">{CeramicMath.formatCurrency(p.sellingPriceM2)}</div>
                      </div>}
                      {p.productType === 'GENERAL' ? (
                        canViewCosts && <div className="rounded-lg border border-slate-200 py-1.5">
                          <div className="text-[9px] font-bold text-slate-400">التكلفة للوحدة</div>
                          <div className="text-xs font-black text-slate-800">{CeramicMath.formatCurrency(p.costPrice)}</div>
                        </div>
                      ) : canViewPricing && <div className="rounded-lg border border-slate-200 py-1.5">
                        <div className="text-[9px] font-bold text-slate-400">سعر الكرتونة</div>
                        <div className="text-xs font-black text-slate-800">{CeramicMath.formatCurrency(p.sellingPriceBox || p.sellingPriceM2 * p.metersPerBox)}</div>
                      </div>}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                      {p.productType === 'GENERAL'
                        ? <span>حد الطلب: {p.minStockLevel} {getProductUnitLabel(p)}</span>
                        : <>
                          <span>كراتين: {round(stock.boxes)}</span>
                          <span>قطع: {Math.round(stock.pieces)}</span>
                          <span>حد الطلب: {p.minStockLevel} م²</span>
                        </>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => onOpenDetails(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-white" title="تفاصيل"><Eye className="w-3.5 h-3.5" /></button>
                      {canAdjustInventory && <button onClick={() => onOpenStock(p)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-white" title="إضافة كمية"><PackagePlus className="w-3.5 h-3.5" /></button>}
                      {canUpdateProduct && <button onClick={() => onOpenEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-white" title="تعديل"><Edit className="w-3.5 h-3.5" /></button>}
                      {canCreateProduct && <button onClick={() => onDuplicate(p)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-white" title="نسخ"><Copy className="w-3.5 h-3.5" /></button>}
                      {canDeleteProduct && <button onClick={() => onToggleActive(p)} className="p-1.5 rounded-lg text-amber-600 hover:bg-white" title={p.isActive ? 'إيقاف' : 'تفعيل'}><Power className="w-3.5 h-3.5" /></button>}
                    </div>
                    {canDeleteProduct && <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-white" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
);
