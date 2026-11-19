import type { Product } from '../../../types';
import type { ProductService } from '../../../services/domains/products/ProductService';
import type { OperationalFieldService, OperationalFieldDefinition } from '../../../services/domains/products/OperationalFieldService';
import type { CategoryService } from '../../../services/domains/products/CategoryService';
import type { BrandService } from '../../../services/domains/products/BrandService';
import type { InventoryService } from '../../../services/domains/inventory/InventoryService';
import type { CategoryWithCount } from '../../../services/domains/products/CategoryService';
import type { BrandWithCount } from '../../../services/domains/products/BrandService';
import type { Warehouse } from '../../../types';
import type { ProductGradeOption } from '../../../services/domains/products/OperationalFieldService';
import type { BusinessConfiguration } from '../../../config/businessProfiles';
import { exportToExcel } from '../../../utils/export/export';
import { getProductUnitLabel } from '../../../utils/products/productUnits';
import { DatabaseManager } from '../../../database/repositories/databaseManager';
import { calcMetersFromSize, parseGrade, pickCell, round } from '../productFormModel';
import { readImportNumber } from './productFormConstants';

export interface ProductExportContext {
  productService: ProductService;
  operationalFieldService: OperationalFieldService;
  operationalFields: OperationalFieldDefinition[];
  selectedProductIds: string[];
  search: string;
  selectedCategory: string;
  selectedBrand: string;
  selectedGrade: string;
  selectedCustomField: string;
  selectedCustomFieldValue: string;
  selectedAttribute: string;
  selectedAttributeValue: string;
  stockStatus: 'all' | 'in' | 'low' | 'out';
  sortBy: 'name' | 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';
  productStatus: 'active' | 'inactive' | 'all';
}

export function exportProductsToExcel(ctx: ProductExportContext): void {
  const {
    productService, operationalFieldService, operationalFields, selectedProductIds,
    search, selectedCategory, selectedBrand, selectedGrade, selectedCustomField,
    selectedCustomFieldValue, selectedAttribute, selectedAttributeValue, stockStatus,
    sortBy, productStatus,
  } = ctx;
  const all = selectedProductIds.length
    ? selectedProductIds.map((id) => productService.getProductById(id)).filter((p): p is Product => Boolean(p))
    : productService.getProductsPage(search, selectedCategory || undefined, selectedBrand || undefined, 1, 100000, {
        grade: selectedGrade || undefined,
        customFieldFilters: selectedCustomField && selectedCustomFieldValue
          ? { [selectedCustomField]: selectedCustomFieldValue }
          : undefined,
        attributeFilters: selectedAttribute && selectedAttributeValue
          ? { [selectedAttribute]: selectedAttributeValue }
          : undefined,
        stockStatus: stockStatus === 'all' ? undefined : stockStatus,
        sortBy,
        status: productStatus,
        includeInactive: productStatus === 'all',
      }).items;
  const exportedFieldValues = operationalFieldService.getRecordValuesForExport(
    'products', all.map((product) => product.id),
  );
  const rows = all.map((p) => {
    const stock = productService.getProductStockSummary(p.id);
    return {
      barcode: p.barcode,
      sku: p.sku,
      name: p.name,
      type: p.categoryName || '',
      brand: p.brandName || '',
      unit: getProductUnitLabel(p),
      size: p.size,
      grade: p.grade,
      color: p.color || '',
      tone: p.tone || '',
      finish: p.finish || '',
      piecesPerBox: p.piecesPerBox,
      metersPerBox: p.metersPerBox,
      costPrice: p.costPrice,
      sellingPriceM2: p.sellingPriceM2,
      sellingPriceBox: p.sellingPriceBox,
      wholesalePriceM2: p.wholesalePriceM2,
      minStockLevel: p.minStockLevel,
      warehouse: stock.byWarehouse.find((entry) => entry.quantityM2 > 0 && entry.warehouseName)?.warehouseName || '',
      openingBoxes: p.productType === 'GENERAL'
        ? (p.baseUnit === 'BOX' ? stock.totalBoxes : stock.totalPieces)
        : stock.totalBoxes,
      stockM2: stock.totalM2,
      stockBoxes: stock.totalBoxes,
      stockPieces: stock.totalPieces,
      ...exportedFieldValues[p.id],
    };
  });
  // Box/piece breakdowns only make sense when the selection contains
  // packaged products; a pure general-goods catalogue exports unit columns.
  const hasBoxUnits = all.some((p) => p.productType !== 'GENERAL');
  exportToExcel({
    title: 'دليل المنتجات',
    subtitle: `عدد المنتجات: ${rows.length}`,
    fileName: 'products',
    permission: 'products.export',
    columns: [
      { key: 'barcode', label: 'الباركود' },
      { key: 'sku', label: 'الكود' },
      { key: 'name', label: 'اسم المنتج' },
      { key: 'type', label: 'النوع' },
      { key: 'brand', label: 'الماركة' },
      { key: 'unit', label: 'وحدة الصنف' },
      { key: 'size', label: 'المقاس' },
      { key: 'grade', label: 'الفرز' },
      { key: 'color', label: 'اللون' },
      { key: 'tone', label: 'التون' },
      { key: 'finish', label: 'التشطيب' },
      ...operationalFields.map((field) => ({ key: field.name, label: field.name })),
      ...(hasBoxUnits ? [
        { key: 'piecesPerBox', label: 'قطع/كرتونة' },
        { key: 'metersPerBox', label: 'م²/كرتونة' },
      ] : []),
      { key: 'costPrice', label: 'التكلفة' },
      { key: 'sellingPriceM2', label: 'سعر الوحدة' },
      ...(hasBoxUnits ? [{ key: 'sellingPriceBox', label: 'سعر الكرتونة' }] : []),
      { key: 'wholesalePriceM2', label: 'سعر الجملة' },
      { key: 'minStockLevel', label: 'حد الطلب' },
      { key: 'warehouse', label: 'المخزن' },
      { key: 'openingBoxes', label: 'كراتين افتتاحية' },
      { key: 'stockM2', label: 'المخزون بوحدة الصنف' },
      ...(hasBoxUnits ? [
        { key: 'stockBoxes', label: 'المخزون كرتونة' },
        { key: 'stockPieces', label: 'المخزون قطعة' },
      ] : []),
    ],
    rows,
  });
}

export function downloadProductImportTemplate(): void {
  exportToExcel({
    title: 'قالب استيراد المنتجات',
    subtitle: 'املأ الصفوف التالية ثم استخدم زر الاستيراد',
    fileName: 'products-import-template',
    permission: 'products.import',
    columns: [
      { key: 'name', label: 'اسم الصنف' },
      { key: 'category', label: 'النوع' },
      { key: 'brand', label: 'الماركة' },
      { key: 'barcode', label: 'الباركود' },
      { key: 'sku', label: 'الكود' },
        { key: 'grade', label: 'الفرز' },
        { key: 'size', label: 'المقاس' },
      { key: 'color', label: 'اللون' },
      { key: 'finish', label: 'التشطيب' },
      { key: 'piecesPerBox', label: 'قطع بالكرتونة' },
      { key: 'metersPerBox', label: 'م² بالكرتونة' },
      { key: 'costPrice', label: 'التكلفة' },
      { key: 'sellingPriceM2', label: 'سعر المتر' },
      { key: 'wholesalePriceM2', label: 'سعر الجملة' },
      { key: 'minStockLevel', label: 'حد الطلب' },
      { key: 'warehouse', label: 'المخزن' },
      { key: 'openingBoxes', label: 'كراتين افتتاحية' },
    ],
    rows: [],
  });
}

export interface ProductImportContext {
  categories: CategoryWithCount[];
  brands: BrandWithCount[];
  warehouses: Warehouse[];
  businessConfig: BusinessConfiguration;
  gradeOptions: ProductGradeOption[];
  tracksInventory: boolean;
  categoryService: CategoryService;
  brandService: BrandService;
  productService: ProductService;
  inventoryService: InventoryService;
}

export function importProductsFromRows(
  rawRows: Record<string, unknown>[],
  ctx: ProductImportContext,
): { created: number; errors: string[] } {
  const errors: string[] = [];
  let created = 0;
  const categoryMap = new Map(ctx.categories.map((c) => [c.name.trim(), c.id]));
  const brandMap = new Map(ctx.brands.map((b) => [b.name.trim(), b.id]));
  const warehouseMap = new Map(ctx.warehouses.map((w) => [w.name.trim(), w.id]));
  const db = DatabaseManager.getInstance();

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = rawRows[index];
    const name = String(pickCell(row, ['name', 'اسم الصنف', 'اسم المنتج', 'الاسم']) || '').trim();
    if (!name) continue;

    let createdCategoryName: string | null = null;
    let createdBrandName: string | null = null;
    try {
      const categoryName = String(pickCell(row, ['category', 'categoryName', 'النوع', 'التصنيف']) || 'عام').trim();
      const brandName = String(pickCell(row, ['brand', 'brandName', 'الماركة', 'ماركة']) || 'عام').trim();

      const stamp = `${Date.now().toString().slice(-5)}${String(index).padStart(3, '0')}`;
      const sku = pickCell(row, ['sku', 'الكود', 'كود الصنف']) || `IMP-${stamp}`;
      const barcode = pickCell(row, ['barcode', 'الباركود']) || `622${stamp}${String(index).padStart(2, '0')}`;
      const rowType = String(pickCell(row, ['productType', 'نوع الصنف', 'النوع']) || '').toUpperCase();
      const ceramicRow = rowType.includes('CERAMIC')
        || rowType.includes('سيراميك')
        || (!rowType && ctx.businessConfig.businessType === 'ceramics');
      const importUnit = (pickCell(row, ['unit', 'الوحدة']) as any)
        || ctx.businessConfig.units[0]
        || 'PIECE';
      const size = pickCell(row, ['size', 'المقاس']) || (ceramicRow ? '60x60' : '');

      const piecesPerBox = readImportNumber(
        row, ['piecesPerBox', 'قطع/كرتونة', 'قطع بالكرتونة', 'عدد القطع'], 'قطع بالكرتونة',
        ceramicRow ? 4 : 1, { min: 1, integer: true },
      );
      const metersPerBox = readImportNumber(
        row, ['metersPerBox', 'م²/كرتونة', 'م² بالكرتونة', 'متر/كرتونة', 'المترات'], 'المترات بالكرتونة',
        ceramicRow ? (calcMetersFromSize(size, piecesPerBox) || 1.44) : 1, { min: 0.000001 },
      );
      const costPrice = readImportNumber(row, ['costPrice', 'التكلفة', 'سعر الشراء'], 'التكلفة', 0, { min: 0 });
      const sellingPriceM2 = readImportNumber(
        row, ['sellingPriceM2', 'سعر الوحدة', 'سعر المتر', 'سعر البيع'], 'سعر البيع', round(costPrice * 1.4), { min: 0 },
      );
      const wholesalePriceM2 = readImportNumber(
        row, ['wholesalePriceM2', 'سعر الجملة'], 'سعر الجملة', round(sellingPriceM2 * 0.9), { min: 0 },
      );
      const minSellingPriceM2 = readImportNumber(
        row, ['minSellingPriceM2', 'أقل سعر'], 'أقل سعر', round(sellingPriceM2 * 0.85), { min: 0 },
      );
      const minStockLevel = readImportNumber(row, ['minStockLevel', 'حد الطلب'], 'حد الطلب', 10, { min: 0 });
      const thickness = readImportNumber(row, ['thickness', 'السمك'], 'السمك', 0, { min: 0 });
      const weightPerBox = readImportNumber(row, ['weightPerBox', 'الوزن'], 'الوزن', 0, { min: 0 });

      const explicitOpening = readImportNumber(
        row, ['openingBoxes', 'كراتين افتتاحية'], 'الكراتين الافتتاحية', 0, { min: 0 },
      );
      const exportedBoxes = readImportNumber(row, ['stockBoxes', 'المخزون كرتونة'], 'المخزون كرتونة', 0, { min: 0 });
      const exportedPieces = readImportNumber(row, ['stockPieces', 'المخزون قطعة'], 'المخزون قطعة', 0, { min: 0 });
      const openingBoxes = explicitOpening > 0
        ? explicitOpening
        : (ceramicRow ? exportedBoxes : (exportedPieces || exportedBoxes));

      const warehouseName = String(pickCell(row, ['warehouse', 'warehouseName', 'المخزن']) || '').trim();
      let warehouseId: string | undefined;
      if (warehouseName) {
        warehouseId = warehouseMap.get(warehouseName);
        if (!warehouseId) throw new Error(`المخزن «${warehouseName}» غير موجود أو غير نشط.`);
      }
      if (ctx.tracksInventory && openingBoxes > 0 && !warehouseId) {
        throw new Error('حدد اسم مخزن صالحًا في عمود «المخزن» لاستيراد الرصيد الافتتاحي.');
      }

      // One atomic unit per row: category, brand, product and opening
      // balance all commit together or none of them do.
      db.executeTransaction(() => {
        let categoryId = categoryMap.get(categoryName);
        if (!categoryId) {
          categoryId = ctx.categoryService.createCategory(categoryName).id;
          categoryMap.set(categoryName, categoryId);
          createdCategoryName = categoryName;
        }
        let brandId = brandMap.get(brandName);
        if (!brandId) {
          brandId = ctx.brandService.createBrand(brandName).id;
          brandMap.set(brandName, brandId);
          createdBrandName = brandName;
        }

        const product = ctx.productService.createProduct({
          name,
          sku,
          barcode,
          categoryId,
          brandId,
          productType: ceramicRow ? 'CERAMIC' : 'GENERAL',
          grade: ctx.gradeOptions.find((option) => option.value === pickCell(row, ['grade', 'الفرز'])
            || option.label === pickCell(row, ['grade', 'الفرز']))?.value
            || parseGrade(pickCell(row, ['grade', 'الفرز']), ctx.gradeOptions.filter((option) => option.isActive)),
          size,
          thickness,
          color: pickCell(row, ['color', 'اللون']),
          tone: pickCell(row, ['tone', 'التون']),
          finish: pickCell(row, ['finish', 'التشطيب']),
          surfaceLocation: ceramicRow ? 'FLOOR' : 'GENERAL',
          baseUnit: ceramicRow ? 'M2' : importUnit,
          sellUnit: ceramicRow ? 'M2' : importUnit,
          piecesPerBox,
          metersPerBox,
          weightPerBox,
          costPrice,
          sellingPriceM2,
          sellingPriceBox: round(sellingPriceM2 * metersPerBox),
          wholesalePriceM2,
          minSellingPriceM2,
          minStockLevel,
          maxStockLevel: 1000,
          notes: pickCell(row, ['notes', 'ملاحظات']),
          isActive: true,
        });

        if (ctx.tracksInventory && openingBoxes > 0 && warehouseId) {
          const quantity = product.productType === 'GENERAL' ? openingBoxes : openingBoxes * metersPerBox;
          ctx.inventoryService.createAdjustment({
            productId: product.id,
            warehouseId,
            type: 'OPENING_BALANCE',
            quantity: round(quantity, 3),
            reason: 'رصيد افتتاحي من استيراد جدول بيانات',
          });
        }
      });
      created += 1;
    } catch (rowError: any) {
      // The transaction rolled back, so drop lookup entries created for
      // this row to avoid reusing ids that no longer exist.
      if (createdCategoryName) categoryMap.delete(createdCategoryName);
      if (createdBrandName) brandMap.delete(createdBrandName);
      errors.push(`صف ${index + 2}: ${rowError?.message || rowError}`);
    }
  }

  return { created, errors };
}
