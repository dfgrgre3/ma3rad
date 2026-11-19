import {
  SURFACES, UNITS, pickCell,
  type FormState, type ProductEntryFormState,
} from '../productFormModel';
import type { CategoryWithCount } from '../../../services/domains/products/CategoryService';
import type { BrandWithCount } from '../../../services/domains/products/BrandService';

export const PRODUCT_FORM_DEFAULT_FIELDS: readonly (keyof ProductEntryFormState)[] = [
  'productType', 'name', 'categoryId', 'brandId', 'grade', 'size', 'thickness',
  'color', 'tone', 'finish', 'surfaceLocation', 'baseUnit', 'sellUnit',
  'customUnit', 'piecesPerBox', 'metersPerBox', 'weightPerBox', 'costPrice',
  'sellingPriceM2', 'sellingPriceBox', 'wholesalePriceM2', 'minSellingPriceM2',
  'minStockLevel', 'maxStockLevel', 'notes',
];
export const PRODUCT_FORM_FIELD_LABELS: Record<keyof FormState, string> = {
  productType: 'نوع الصنف',
  name: 'اسم الصنف',
  sku: 'كود الصنف',
  barcode: 'الباركود',
  categoryId: 'نوع المنتج (التصنيف)',
  brandId: 'الماركة / المصنع',
  grade: 'الفرز والدرجة',
  size: 'المقاس',
  thickness: 'السمك',
  color: 'اللون',
  tone: 'التون',
  finish: 'التشطيب',
  surfaceLocation: 'الاستخدام / السطح',
  baseUnit: 'وحدة الأساس',
  sellUnit: 'وحدة البيع',
  customUnit: 'اسم الوحدة',
  piecesPerBox: 'عدد القطع بالكرتونة',
  metersPerBox: 'المترات بالكرتونة',
  weightPerBox: 'وزن الكرتونة',
  costPrice: 'سعر الشراء / التكلفة',
  sellingPriceM2: 'سعر البيع',
  sellingPriceBox: 'سعر الكرتونة',
  wholesalePriceM2: 'سعر الجملة',
  minSellingPriceM2: 'الحد الأدنى لسعر البيع',
  minStockLevel: 'حد الطلب الأدنى',
  maxStockLevel: 'الحد الأقصى للمخزون',
  notes: 'ملاحظات',
};
export const isProductFormDefaultField = (field: string): field is keyof ProductEntryFormState =>
  PRODUCT_FORM_DEFAULT_FIELDS.some((candidate) => candidate === field);

export const applyRememberedFormFields = (
  form: ProductEntryFormState,
  preferences: Record<string, string | number>,
  categories: CategoryWithCount[],
  brands: BrandWithCount[],
): ProductEntryFormState => {
  const next = { ...form };
  for (const field of PRODUCT_FORM_DEFAULT_FIELDS) {
    const value = preferences[field];
    if (value === undefined || typeof value !== typeof next[field]) continue;
    if (field === 'categoryId' && !categories.some((category) => category.id === value)) continue;
    if (field === 'brandId' && value !== '' && !brands.some((brand) => brand.id === value)) continue;
    if (field === 'productType' && value !== 'CERAMIC' && value !== 'GENERAL') continue;
    if (field === 'grade' && typeof value !== 'string') continue;
    if (field === 'surfaceLocation' && !SURFACES.some((surface) => surface.value === value)) continue;
    if ((field === 'baseUnit' || field === 'sellUnit')
      && !UNITS.some((unit) => unit.value === value)
      && !(value === 'CUSTOM')) continue;
    Object.assign(next, { [field]: value });
  }
  return next;
};

const _normalizeImportNumber = (value: string): number =>
  Number(
    value
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[٬,]/g, '')
      .replace(/[٫]/g, '.')
      .trim(),
  );

/**
 * يقرأ خلية رقمية بشكل صارم: أي قيمة فارغة أو غير رقمية أو غير منتهية
 * أو أقل من الحد الأدنى أو غير صحيحة (إن طُلب) تُفشل الصف بخطأ.
 * لا توجد أي قيمة افتراضية — كل قيمة يجب أن تكون حقيقية من الملف.
 */
export const readImportNumber = (
row: Record<string, unknown>, keys: string[], label: string, p0: number, options: { min?: number; max?: number; integer?: boolean; } = {},
): number => {
  const raw = pickCell(row, keys);

  // لا fallback: القيمة الفارغة أو المفقودة = خطأ
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new Error(`قيمة «${label}» مطلوبة ولم يتم العثور عليها في الصف`);
  }

  const text = String(raw).trim();

  // رفض أي شيء ليس رقمًا عشريًا/صحيحًا صريحًا (يمنع 0x10 و 1e5 الغريبة إن أردت)
  // لو عايز تسمح بالأس العلمي (1e5) شيل هذا الشرط
  const cleaned = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٬,]/g, '')
    .replace(/[٫]/g, '.');

  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) {
    throw new Error(`قيمة «${label}» غير صالحة: ${text}`);
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    throw new Error(`قيمة «${label}» غير صالحة: ${text}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`قيمة «${label}» أقل من الحد الأدنى (${options.min}): ${text}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`قيمة «${label}» أكبر من الحد الأقصى (${options.max}): ${text}`);
  }
  if (options.integer && !Number.isInteger(parsed)) {
    throw new Error(`قيمة «${label}» يجب أن تكون عددًا صحيحًا: ${text}`);
  }

  return parsed;
};
