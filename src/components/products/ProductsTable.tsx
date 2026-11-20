import React from 'react';
import { Barcode, Copy, Edit, Eye, Package, PackagePlus, Power, Trash2 } from 'lucide-react';
import type { Product } from '../../types';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { CeramicMath } from '../../utils/products/ceramicMath';
import { getProductUnitLabel } from '../../utils/products/productUnits';
import { round, gradeLabel } from './productFormModel';
import type { OperationalFieldDefinition } from '../../services/domains/products/OperationalFieldService';

export interface ProductsTableProps {
  products: Product[];
  operationalFields?: OperationalFieldDefinition[];
  operationalFieldValues?: Record<string, Record<string, string>>;
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
  operationalFields = [],
  operationalFieldValues = {},
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
}) => {
  const columns: DataTableColumn<Product>[] = [];

  if (canExportProducts || canDeleteProduct) {
    columns.push({
      key: 'select',
      header: (
        <input
          aria-label="تحديد كل أصناف الصفحة"
          type="checkbox"
          checked={products.length > 0 && products.every((product) => selectedProductIds.includes(product.id))}
          onChange={onTogglePageSelection}
          className="rounded border-line-strong text-primary"
        />
      ),
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => (
        <input
          aria-label={`تحديد ${product.name}`}
          type="checkbox"
          checked={selectedProductIds.includes(product.id)}
          onChange={() => onToggleProductSelection(product.id)}
          className="rounded border-line-strong text-primary"
        />
      ),
    });
  }

  columns.push(
    {
      key: 'product',
      header: 'الصنف',
      render: (product) => (
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
            {product.imagePath
              ? <img src={product.imagePath} alt={product.name} className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-muted"><Package className="h-4 w-4" /></div>}
          </div>
          <div>
            <div className="font-bold text-ink">{product.name}</div>
            <div className="text-[10px] text-muted">
              {product.color || '—'} | {product.finish || '—'} {!product.isActive && <span className="font-bold text-danger">(موقوف)</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'الباركود / الكود',
      className: 'font-mono',
      render: (product) => (
        <>
          <div className="font-bold text-ink">{product.barcode}</div>
          <div className="text-[10px] text-muted">{product.sku}</div>
        </>
      ),
    },
    {
      key: 'category',
      header: 'النوع والماركة',
      render: (product) => (
        <>
          <div className="font-bold text-ink">{product.categoryName || '—'}</div>
          <div className="text-[10px] text-muted">{product.brandName || '—'}</div>
        </>
      ),
    },
  );

  if (hasCeramicRows) {
    columns.push({
      key: 'size',
      header: 'المقاس والفرز',
      render: (product) => (
        <>
          <span className="font-bold text-ink">{product.productType === 'GENERAL' ? '—' : product.size}</span>
          {product.productType !== 'GENERAL' && (
            <div className="text-[10px]">
              <span className={`font-extrabold ${product.grade === 'GRADE_1' ? 'text-primary' : 'text-warning'}`}>
                {gradeLabel(product.grade)}
              </span>
            </div>
          )}
        </>
      ),
    });
  }

  operationalFields.forEach((field) => {
    columns.push({
      key: `operational-${field.id}`,
      header: field.name,
      render: (product) => operationalFieldValues[product.id]?.[field.name] || '—',
    });
  });

  columns.push({
    key: 'unit',
    header: 'التحويل',
    className: 'font-semibold text-ink',
    render: (product) => product.productType === 'GENERAL' ? (
      <div>وحدة المخزون: {getProductUnitLabel(product)}</div>
    ) : (
      <>
        <div>{product.metersPerBox} {product.baseUnit === 'LINEAR_METER' ? 'م' : 'م²'} / كرتونة</div>
        <div className="text-[10px] text-muted">{product.piecesPerBox} قطعة / كرتونة</div>
      </>
    ),
  });

  if (canViewCosts) {
    columns.push({
      key: 'cost',
      header: 'التكلفة',
      className: 'font-mono text-ink-secondary',
      render: (product) => CeramicMath.formatCurrency(product.costPrice),
    });
  }
  if (canViewPricing) {
    columns.push({
      key: 'price',
      header: 'سعر الوحدة',
      className: 'font-black text-primary',
      render: (product) => CeramicMath.formatCurrency(product.sellingPriceM2),
    });
  }
  if (hasCeramicRows && canViewPricing) {
    columns.push({
      key: 'box-price',
      header: 'سعر الكرتونة',
      className: 'font-bold text-ink',
      render: (product) => product.productType === 'GENERAL'
        ? '—'
        : CeramicMath.formatCurrency(product.sellingPriceBox || (product.sellingPriceM2 * product.metersPerBox)),
    });
  }

  columns.push(
    {
      key: 'stock',
      header: 'المخزون',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => {
        const stock = stockOf(product);
        return (
          <span className={`erp-badge ${stockTone(product)}`}>
            {product.productType === 'GENERAL' ? `${round(stock.m2, 3)} ${getProductUnitLabel(product)}` : (
              <>
                {CeramicMath.formatM2(stock.m2)}
                <span className="mx-1 text-muted">|</span>
                {round(stock.boxes)} كرتونة
                <span className="mx-1 text-muted">|</span>
                {Math.round(stock.pieces)} قطعة
              </>
            )}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (product) => (
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={() => onOpenDetails(product)} className="rounded-lg p-1.5 text-muted transition hover:bg-accent-soft hover:text-primary" title="عرض التفاصيل" aria-label={`عرض تفاصيل ${product.name}`}><Eye className="h-4 w-4" /></button>
          {canAdjustInventory && <button type="button" onClick={() => onOpenStock(product)} className="rounded-lg p-1.5 text-muted transition hover:bg-success-soft hover:text-success" title="إضافة كمية للمخزون" aria-label={`إضافة كمية للمخزون: ${product.name}`}><PackagePlus className="h-4 w-4" /></button>}
          {canUpdateProduct && <button type="button" onClick={() => onOpenEdit(product)} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-sunken" title="تعديل" aria-label={`تعديل ${product.name}`}><Edit className="h-4 w-4" /></button>}
          {canCreateProduct && <button type="button" onClick={() => onDuplicate(product)} className="rounded-lg p-1.5 text-muted transition hover:bg-accent-soft hover:text-primary" title="نسخ الصنف" aria-label={`نسخ ${product.name}`}><Copy className="h-4 w-4" /></button>}
          {canExportProducts && <button type="button" onClick={onOpenBarcodes} className="rounded-lg p-1.5 text-muted transition hover:bg-accent-soft hover:text-primary" title="طباعة باركود" aria-label={`طباعة باركود ${product.name}`}><Barcode className="h-4 w-4" /></button>}
          {canDeleteProduct && <button type="button" onClick={() => onToggleActive(product)} className={`rounded-lg p-1.5 transition ${product.isActive ? 'text-muted hover:bg-warning-soft hover:text-warning' : 'text-success hover:bg-success-soft'}`} title={product.isActive ? 'إيقاف الصنف' : 'تفعيل الصنف'} aria-label={`${product.isActive ? 'إيقاف' : 'تفعيل'} ${product.name}`}><Power className="h-4 w-4" /></button>}
          {canDeleteProduct && <button type="button" onClick={() => onDelete(product.id)} className="rounded-lg p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger" title="حذف" aria-label={`حذف ${product.name}`}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    },
  );

  return (
    <DataTable
      ariaLabel="قائمة الأصناف"
      columns={columns}
      rows={products}
      rowKey={(product) => product.id}
      tableClassName="text-right text-xs"
      minWidth={1200}
      rowClassName={(product) => `${product.isActive ? '' : 'opacity-60'} transition-colors hover:bg-surface-muted`}
    />
  );
};
