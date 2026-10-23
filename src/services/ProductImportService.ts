import * as XLSX from 'xlsx';
import { ProductService } from './ProductService';
import { CategoryService } from './CategoryService';
import { BrandService } from './BrandService';
import { AuthService } from './AuthService';
import { PermissionService } from './PermissionService';
import type { CeramicGrade, Product } from '../types';
import { round2 } from './financials';

export interface ProductImportRow {
  rowNumber: number;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  grade: CeramicGrade;
  size: string;
  piecesPerBox: number;
  metersPerBox: number;
  costPrice: number;
  sellingPriceM2: number;
  wholesalePriceM2: number;
  minSellingPriceM2: number;
  initialStockM2: number;
  errors: string[];
}

export interface ProductImportResult {
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

const GRADES: CeramicGrade[] = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'COMMERCIAL'];

const normalize = (value: unknown) => String(value ?? '').trim();

const num = (value: unknown): number => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'الكود', 'كود', 'كود الصنف'],
  barcode: ['barcode', 'الباركود', 'باركود'],
  name: ['name', 'اسم المنتج', 'الاسم', 'الصنف', 'اسم الصنف'],
  category: ['category', 'التصنيف', 'القسم', 'النوع'],
  brand: ['brand', 'الماركة', 'ماركة'],
  grade: ['grade', 'الفرز', 'الدرجة'],
  size: ['size', 'المقاس'],
  piecesPerBox: ['pieces_per_box', 'قطع/كرتونة', 'عدد القطع', 'القطع'],
  metersPerBox: ['meters_per_box', 'م²/كرتونة', 'متر/كرتونة', 'المترات'],
  costPrice: ['cost_price', 'التكلفة', 'سعر التكلفة'],
  sellingPriceM2: ['selling_price_m2', 'سعر المتر', 'سعر البيع'],
  wholesalePriceM2: ['wholesale_price_m2', 'سعر الجملة'],
  minSellingPriceM2: ['min_selling_price_m2', 'أقل سعر', 'الحد الأدنى للسعر'],
  initialStockM2: ['stock', 'المخزون', 'الكمية', 'initial_stock', 'المخزون م²'],
};

const canonicalHeader = (header: string): string | null => {
  const clean = header.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === clean)) return key;
  }
  return null;
};

export class ProductImportService {
  private productService = new ProductService();

  public parseWorkbook(buffer: ArrayBuffer): { rows: ProductImportRow[]; missingColumns: string[] } {
    PermissionService.require(AuthService.requireAuth(), 'products.create');
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('الملف لا يحتوي على أي ورقة عمل.');

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    if (raw.length === 0) throw new Error('الملف لا يحتوي على بيانات.');

    const headerMap = new Map<string, string>();
    for (const header of Object.keys(raw[0])) {
      const key = canonicalHeader(header);
      if (key) headerMap.set(header, key);
    }

    const required = ['sku', 'name', 'category', 'brand', 'piecesPerBox', 'metersPerBox', 'costPrice', 'sellingPriceM2'];
    const present = new Set(headerMap.values());
    const missingColumns = required.filter((key) => !present.has(key));

    const categories = new CategoryService().getAllCategories();
    const brands = new BrandService().getAllBrands();
    const categoryNames = new Set(categories.map((c) => c.name.trim()));
    const brandNames = new Set(brands.map((b) => b.name.trim()));

    const seenSku = new Set<string>();
    const seenBarcode = new Set<string>();

    const rows = raw.map((record, index) => {
      const value = (key: string): unknown => {
        const header = Array.from(headerMap.entries()).find(([, mapped]) => mapped === key)?.[0];
        return header ? record[header] : '';
      };

      const sku = normalize(value('sku'));
      const barcode = normalize(value('barcode')) || sku;
      const name = normalize(value('name'));
      const category = normalize(value('category'));
      const brand = normalize(value('brand'));
      const size = normalize(value('size'));
      const gradeText = normalize(value('grade')).toUpperCase();
      const grade = (GRADES.find((g) => g === gradeText || g === `GRADE_${gradeText}`) || 'GRADE_1') as CeramicGrade;
      const piecesPerBox = num(value('piecesPerBox'));
      const metersPerBox = num(value('metersPerBox'));
      const costPrice = num(value('costPrice'));
      const sellingPriceM2 = num(value('sellingPriceM2'));
      const wholesalePriceM2 = num(value('wholesalePriceM2')) || sellingPriceM2;
      const minSellingPriceM2 = num(value('minSellingPriceM2')) || costPrice;
      const initialStockM2 = num(value('initialStockM2'));

      const errors: string[] = [];
      if (!sku) errors.push('الكود مطلوب');
      if (!name) errors.push('اسم المنتج مطلوب');
      if (!category) errors.push('التصنيف مطلوب');
      else if (!categoryNames.has(category)) errors.push(`التصنيف غير موجود: ${category}`);
      if (!brand) errors.push('الماركة مطلوبة');
      else if (!brandNames.has(brand)) errors.push(`الماركة غير موجودة: ${brand}`);
      if (!size) errors.push('المقاس مطلوب');
      if (!(piecesPerBox > 0)) errors.push('عدد القطع بالكرتونة يجب أن يكون أكبر من صفر');
      if (!(metersPerBox > 0)) errors.push('مترات الكرتونة يجب أن تكون أكبر من صفر');
      if (!(sellingPriceM2 > 0)) errors.push('سعر المتر مطلوب');
      if (sellingPriceM2 > 0 && costPrice > sellingPriceM2) errors.push('سعر التكلفة أكبر من سعر البيع');
      if (sku && seenSku.has(sku)) errors.push('الكود مكرر داخل الملف');
      if (barcode && seenBarcode.has(barcode)) errors.push('الباركود مكرر داخل الملف');

      if (sku) seenSku.add(sku);
      if (barcode) seenBarcode.add(barcode);

      return {
        rowNumber: index + 2, sku, barcode, name, category, brand, grade, size,
        piecesPerBox, metersPerBox, costPrice, sellingPriceM2, wholesalePriceM2,
        minSellingPriceM2, initialStockM2, errors,
      };
    });

    return { rows, missingColumns };
  }

  public importRows(rows: ProductImportRow[], warehouseId: string): ProductImportResult {
    PermissionService.require(AuthService.requireAuth(), 'products.create');
    const categories = new CategoryService().getAllCategories();
    const brands = new BrandService().getAllBrands();
    const categoryMap = new Map(categories.map((c) => [c.name.trim(), c.id]));
    const brandMap = new Map(brands.map((b) => [b.name.trim(), b.id]));

    const result: ProductImportResult = { created: 0, failed: 0, errors: [] };
    for (const row of rows) {
      if (row.errors.length > 0) {
        result.failed++;
        result.errors.push({ row: row.rowNumber, message: row.errors.join('، ') });
        continue;
      }
      try {
        this.productService.createProduct({
          sku: row.sku,
          barcode: row.barcode,
          name: row.name,
          categoryId: categoryMap.get(row.category)!,
          brandId: brandMap.get(row.brand)!,
          grade: row.grade,
          size: row.size,
          baseUnit: 'M2',
          sellUnit: 'M2',
          piecesPerBox: row.piecesPerBox,
          metersPerBox: row.metersPerBox,
          costPrice: round2(row.costPrice),
          sellingPriceM2: round2(row.sellingPriceM2),
          sellingPriceBox: round2(row.sellingPriceM2 * row.metersPerBox),
          wholesalePriceM2: round2(row.wholesalePriceM2),
          minSellingPriceM2: round2(row.minSellingPriceM2),
          minStockLevel: 0,
          isActive: true,
        } as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, row.initialStockM2 > 0
          ? { warehouseId, quantityM2: row.initialStockM2, unitCost: row.costPrice }
          : undefined);
        result.created++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ row: row.rowNumber, message: error?.message || 'تعذر إنشاء الصنف' });
      }
    }
    return result;
  }
}
