import React from 'react';
import { Barcode, Copy, Edit, Eye, Package, PackagePlus, Power, Trash2 } from 'lucide-react';
import type { Product } from '../../types';
import { CeramicMath } from '../../utils/ceramicMath';
import { getProductUnitLabel } from '../../utils/productUnits';
import { round, gradeLabel } from './productFormModel';

export interface ProductsTableProps {
  products: Product[];
  selectedProductIds: string[];
  hasCeramicRows: boolean;
  canViewCosts: boolean;
  canViewPricing: boolean;
  canExportProducts: boolean;
  canDeleteProduct: boolean;
  canUpdateProduct: boolean;
  canCreateProduct: boolean;
  canAdjustInventory: boolean;
  stockOf: (product: Product) => { m2: number; boxes: number; pieces: number };
  stockTone: (product: Product) => string;
  onTogglePageSelection: () => void;
  onToggleProductSelection: (id: string) => void;
  onOpenDetails: (product: Product) => void;
  onOpenStock: (product: Product) => void;
  onOpenEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onOpenBarcodes: () => void;
  onToggleActive: (product: Product) => void;
  onDelete: (id: string) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  selectedProductIds,
  hasCeramicRows,
  canViewCosts,
  canViewPricing,
  canExportProducts,
  canDeleteProduct,
  canUpdateProduct,
  canCreateProduct,
  canAdjustInventory,
  stockOf,
  stockTone,
  onTogglePageSelection,
  onToggleProductSelection,
  onOpenDetails,
  onOpenStock,
  onOpenEdit,
  onDuplicate,
  onOpenBarcodes,
  onToggleActive,
  onDelete,
}) => (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  {(canExportProducts || canDeleteProduct) && <th className="p-3.5 text-center"><input aria-label="تحديد كل أصناف الصفحة" type="checkbox" checked={products.length > 0 && products.every((product) => selectedProductIds.includes(product.id))} onChange={onTogglePageSelection} className="rounded border-slate-300 text-sky-600" /></th>}
                  <th className="p-3.5">الصنف</th>
                  <th className="p-3.5">الباركود / الكود</th>
                  <th className="p-3.5">النوع والماركة</th>
                  {hasCeramicRows && <th className="p-3.5">المقاس والفرز</th>}
                  <th className="p-3.5">التحويل</th>
                  {canViewCosts && <th className="p-3.5">التكلفة</th>}
                  {canViewPricing && <th className="p-3.5">سعر الوحدة</th>}
                  {hasCeramicRows && canViewPricing && <th className="p-3.5">سعر الكرتونة</th>}
                  <th className="p-3.5 text-center">المخزون</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const stock = stockOf(p);
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50 transition ${p.isActive ? '' : 'opacity-60'}`}>
                      {(canExportProducts || canDeleteProduct) && <td className="p-3.5 text-center"><input aria-label={`تحديد ${p.name}`} type="checkbox" checked={selectedProductIds.includes(p.id)} onChange={() => onToggleProductSelection(p.id)} className="rounded border-slate-300 text-sky-600" /></td>}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            {p.imagePath ? <img src={p.imagePath} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500">{p.color || '—'} | {p.finish || '—'} {!p.isActive && <span className="text-rose-500 font-bold">(موقوف)</span>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono">
                        <div className="font-bold text-slate-900">{p.barcode}</div>
                        <div className="text-[10px] text-slate-500">{p.sku}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-700">{p.categoryName || '—'}</div>
                        <div className="text-[10px] text-slate-500">{p.brandName || '—'}</div>
                      </td>
                      {hasCeramicRows && (
                      <td className="p-3.5">
                        <span className="font-bold text-slate-700">{p.productType === 'GENERAL' ? '—' : p.size}</span>
                        {p.productType !== 'GENERAL' && (
                        <div className="text-[10px]">
                          <span className={`font-extrabold ${p.grade === 'GRADE_1' ? 'text-sky-600' : 'text-amber-600'}`}>{gradeLabel(p.grade)}</span>
                        </div>
                        )}
                      </td>
                      )}
                      <td className="p-3.5 font-semibold text-slate-700">
                        {p.productType === 'GENERAL' ? <div>وحدة المخزون: {getProductUnitLabel(p)}</div> : <>
                          <div>{p.metersPerBox} {p.baseUnit === 'LINEAR_METER' ? 'م' : 'م²'} / كرتونة</div>
                          <div className="text-[10px] text-slate-500">{p.piecesPerBox} قطعة / كرتونة</div>
                        </>}
                      </td>
                      {canViewCosts && <td className="p-3.5 font-mono text-slate-600">{CeramicMath.formatCurrency(p.costPrice)}</td>}
                      {canViewPricing && <td className="p-3.5 font-black text-sky-600">{CeramicMath.formatCurrency(p.sellingPriceM2)}</td>}
                      {hasCeramicRows && canViewPricing && (
                        <td className="p-3.5 font-bold text-slate-900">{p.productType === 'GENERAL' ? '—' : CeramicMath.formatCurrency(p.sellingPriceBox || (p.sellingPriceM2 * p.metersPerBox))}</td>
                      )}
                      <td className="p-3.5 text-center">
                        <span className={`inline-block px-2 py-1 rounded-lg font-black text-[11px] ${stockTone(p)}`}>
                          {p.productType === 'GENERAL' ? `${round(stock.m2, 3)} ${getProductUnitLabel(p)}` : <>
                            {CeramicMath.formatM2(stock.m2)}
                            <span className="mx-1 text-slate-400">|</span>
                            {round(stock.boxes)} كرتونة
                            <span className="mx-1 text-slate-400">|</span>
                            {Math.round(stock.pieces)} قطعة
                          </>}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onOpenDetails(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-600 transition" title="عرض التفاصيل"><Eye className="w-4 h-4" /></button>
                          {canAdjustInventory && <button onClick={() => onOpenStock(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition" title="إضافة كمية للمخزون"><PackagePlus className="w-4 h-4" /></button>}
                          {canUpdateProduct && <button onClick={() => onOpenEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition" title="تعديل"><Edit className="w-4 h-4" /></button>}
                          {canCreateProduct && <button onClick={() => onDuplicate(p)} className="p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition" title="نسخ الصنف"><Copy className="w-4 h-4" /></button>}
                          {canExportProducts && <button onClick={() => onOpenBarcodes()} className="p-1.5 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 transition" title="طباعة باركود"><Barcode className="w-4 h-4" /></button>}
                          {canDeleteProduct && <button onClick={() => onToggleActive(p)} className={`p-1.5 rounded-lg transition ${p.isActive ? 'text-slate-500 hover:bg-amber-50 hover:text-amber-600' : 'text-emerald-600 hover:bg-emerald-50'}`} title={p.isActive ? 'إيقاف الصنف' : 'تفعيل الصنف'}><Power className="w-4 h-4" /></button>}
                          {canDeleteProduct && <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition" title="حذف"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
);
