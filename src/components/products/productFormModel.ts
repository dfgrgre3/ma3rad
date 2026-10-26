import type { CeramicGrade, UnitType } from '../../types';

export const UNITS: { value: UnitType; label: string }[] = [
  { value: 'M2', label: 'متر مربع (م²)' },
  { value: 'LINEAR_METER', label: 'متر طولي' },
  { value: 'METER', label: 'متر' },
  { value: 'KG', label: 'كيلوجرام' },
  { value: 'TON', label: 'طن' },
  { value: 'LITER', label: 'لتر' },
  { value: 'SET', label: 'طقم' },
  { value: 'PACK', label: 'عبوة' },
  { value: 'SERVICE', label: 'خدمة' },
  { value: 'BOX', label: 'كرتونة' },
  { value: 'PIECE', label: 'قطعة' },
];
export const unitLabelFor = (unit: UnitType, custom = '') => custom.trim() || UNITS.find((item) => item.value === unit)?.label || unit;

export const SURFACES = [
  { value: 'FLOOR', label: 'أرضيات' },
  { value: 'WALL', label: 'حوائط' },
  { value: 'OUTDOOR', label: 'خارجي / حدائق' },
  { value: 'GENERAL', label: 'عام / متعدد' },
];

export const GRADES: { value: CeramicGrade; label: string }[] = [
  { value: 'GRADE_1', label: 'فرز أول' },
  { value: 'GRADE_2', label: 'فرز ثاني' },
  { value: 'GRADE_3', label: 'فرز ثالث' },
  { value: 'COMMERCIAL', label: 'تجاري' },
];

export const round = (value: number, digits = 2) => Number(((Number.isFinite(value) ? value : 0)).toFixed(digits));

export const gradeLabel = (grade: CeramicGrade) => GRADES.find((g) => g.value === grade)?.label || grade;

export const calcMetersFromSize = (size: string, pieces: number): number | null => {
  const normalized = (size || '').replace(/[×*]/g, 'x');
  const match = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) return null;
  const width = parseFloat(match[1]);
  const height = parseFloat(match[2]);
  if (!width || !height || !pieces || pieces <= 0) return null;
  return round((width / 100) * (height / 100) * pieces, 3);
};

export interface FormState {
  productType: 'CERAMIC' | 'GENERAL';
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  brandId: string;
  grade: CeramicGrade;
  size: string;
  thickness: number;
  color: string;
  tone: string;
  finish: string;
  surfaceLocation: 'FLOOR' | 'WALL' | 'OUTDOOR' | 'GENERAL';
  baseUnit: UnitType;
  sellUnit: UnitType;
  customUnit: string;
  piecesPerBox: number;
  metersPerBox: number;
  weightPerBox: number;
  costPrice: number;
  sellingPriceM2: number;
  sellingPriceBox: number;
  wholesalePriceM2: number;
  minSellingPriceM2: number;
  minStockLevel: number;
  maxStockLevel: number;
  notes: string;
}

export interface OpeningStockRow {
  warehouseId: string;
  boxes: number;
  pieces: number;
  meters: number;
}

export interface VariantDraft {
  id?: string;
  variantName: string;
  sku: string;
  barcode: string;
  color: string;
  size: string;
  grade: string;
  costPrice: number;
  sellingPriceM2: number;
}

export type TabId = 'basic' | 'units' | 'pricing' | 'stock' | 'extras';

export const emptyForm = (categoryId = '', brandId = '', productType: FormState['productType'] = 'CERAMIC'): FormState => ({
  productType,
  name: '',
  sku: '',
  barcode: '',
  categoryId,
  brandId,
  grade: 'GRADE_1',
  size: '60x60',
  thickness: 8,
  color: '',
  tone: '',
  finish: 'لامع',
  surfaceLocation: 'FLOOR',
  baseUnit: 'M2',
  sellUnit: 'M2',
  customUnit: '',
  piecesPerBox: 4,
  metersPerBox: 1.44,
  weightPerBox: 0,
  costPrice: 150,
  sellingPriceM2: 220,
  sellingPriceBox: 316.8,
  wholesalePriceM2: 190,
  minSellingPriceM2: 180,
  minStockLevel: 20,
  maxStockLevel: 1000,
  notes: '',
});

export const emptyVariant = (): VariantDraft => ({
  variantName: '', sku: '', barcode: '', color: '', size: '',
  grade: 'GRADE_1', costPrice: 0, sellingPriceM2: 0,
});

export const pickCell = (row: Record<string, any>, keys: string[]): string => {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.trim().toLowerCase());
    if (found !== undefined && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return String(row[found]).trim();
    }
  }
  return '';
};

export const parseGrade = (value: string): CeramicGrade => {
  const v = value.trim();
  if (v.includes('ثاني') || v.toUpperCase() === 'GRADE_2') return 'GRADE_2';
  if (v.includes('ثالث') || v.toUpperCase() === 'GRADE_3') return 'GRADE_3';
  if (v.includes('تجاري') || v.toUpperCase() === 'COMMERCIAL') return 'COMMERCIAL';
  return 'GRADE_1';
};
