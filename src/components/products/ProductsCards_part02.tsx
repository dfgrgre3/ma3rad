import React from 'react';
import { Copy, Edit, Eye, Package, PackagePlus, Power, Trash2 } from 'lucide-react';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { round, gradeLabel } from './productFormModel';
import type { ProductsCardsProps } from './ProductsCards_part01';

export const ProductsCards: React.FC<ProductsCardsProps> = ({
  products,
  operationalFields = [],
  operationalFieldValues = {},
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
                <div key={p.id} className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:shadow-md ${p.isActive ? '' : 'opacity-60'}`}>
                  <div className="relative h-36 bg-surface-sunken">
                    {p.imagePath ? <img src={p.imagePath} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted"><Package className="h-10 w-10" /></div>}
                    <span className={`erp-badge absolute right-2 top-2 ${stockTone(p)}`}>{p.productType === 'GENERAL' ? `${round(stock.m2, 3)} ${getProductUnitLabel(p)}` : CeramicMath.formatM2(stock.m2)}</span>
                    {(canExportProducts || canDeleteProduct) && <input aria-label={`تحديد ${p.name}`} type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => onToggleProductSelection(p.id)} className="absolute left-2 top-2 h-4 w-4 rounded border-line-strong text-primary" />}
                    {!p.isActive && <span className="absolute left-2 top-2 rounded-lg bg-danger px-2 py-1 text-[10px] font-black text-white">موقوف</span>}
                  </div>
                  <div className="flex-1 space-y-2 p-3.5">
                    <div>
                      <h3 className="truncate text-sm font-extrabold text-ink">{p.name}</h3>
                      <p className="text-[10px] text-muted">{p.categoryName || '—'} | {p.brandName || '—'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                      {p.productType === 'GENERAL' ? <span className="rounded-md bg-accent-soft px-2 py-0.5 text-primary">وحدة الصنف: {getProductUnitLabel(p)}</span> : <>
                        <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-ink-secondary">{p.size}</span>
                        <span className="rounded-md bg-warning-soft px-2 py-0.5 text-warning">{gradeLabel(p.grade)}</span>
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-primary">{p.piecesPerBox} قطعة / {p.metersPerBox} م²</span>
                      </>}
                    </div>
                    <div className={`grid gap-2 text-center ${canViewCosts && canViewPricing ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                      {canViewPricing && <div className="rounded-lg border border-line py-1.5">
                        <div className="text-[9px] font-bold text-muted">سعر {getProductUnitLabel(p)}</div>
                        <div className="text-xs font-black text-primary">{CeramicMath.formatCurrency(p.sellingPriceM2)}</div>
                      </div>}
                      {p.productType === 'GENERAL' ? (
                        canViewCosts && <div className="rounded-lg border border-line py-1.5">
                          <div className="text-[9px] font-bold text-muted">التكلفة للوحدة</div>
                          <div className="text-xs font-black text-ink">{CeramicMath.formatCurrency(p.costPrice)}</div>
                        </div>
                      ) : canViewPricing && <div className="rounded-lg border border-line py-1.5">
                        <div className="text-[9px] font-bold text-muted">سعر الكرتونة</div>
                        <div className="text-xs font-black text-ink">{CeramicMath.formatCurrency(p.sellingPriceBox || p.sellingPriceM2 * p.metersPerBox)}</div>
                      </div>}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted">
                      {p.productType === 'GENERAL'
                        ? <span>حد الطلب: {p.minStockLevel} {getProductUnitLabel(p)}</span>
                        : <>
                          <span>كراتين: {round(stock.boxes)}</span>
                          <span>قطع: {Math.round(stock.pieces)}</span>
                          <span>حد الطلب: {p.minStockLevel} م²</span>
                        </>}
                    </div>
                    {operationalFields.length > 0 && <div className="space-y-1 border-t border-line pt-2 text-[10px] text-ink-secondary">
                      {operationalFields.map((field) => {
                        const value = operationalFieldValues[p.id]?.[field.name];
                        return value ? <div key={field.id} className="flex justify-between gap-2"><span className="font-semibold">{field.name}</span><span className="text-left">{value}</span></div> : null;
                      })}
                    </div>}
                  </div>
                  <div className="flex items-center justify-between border-t border-line bg-surface-muted/60 px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => onOpenDetails(p)} className="p-1.5 rounded-lg text-muted hover:bg-surface" title="تفاصيل"><Eye className="w-3.5 h-3.5" /></button>
                      {canAdjustInventory && <button onClick={() => onOpenStock(p)} className="p-1.5 rounded-lg text-success hover:bg-surface" title="إضافة كمية"><PackagePlus className="w-3.5 h-3.5" /></button>}
                      {canUpdateProduct && <button onClick={() => onOpenEdit(p)} className="p-1.5 rounded-lg text-muted hover:bg-surface" title="تعديل"><Edit className="w-3.5 h-3.5" /></button>}
                      {canCreateProduct && <button onClick={() => onDuplicate(p)} className="p-1.5 rounded-lg text-primary hover:bg-surface" title="نسخ"><Copy className="w-3.5 h-3.5" /></button>}
                      {canDeleteProduct && <button onClick={() => onToggleActive(p)} className="p-1.5 rounded-lg text-warning hover:bg-surface" title={p.isActive ? 'إيقاف' : 'تفعيل'}><Power className="w-3.5 h-3.5" /></button>}
                    </div>
                    {canDeleteProduct && <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg text-danger hover:bg-surface" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
);
