import type { CeramicGrade, UnitType } from '../../types';

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

export interface ProductEntryFormState extends Omit<FormState, 'productType' | 'grade' | 'surfaceLocation' | 'baseUnit' | 'sellUnit'> {
  productType: FormState['productType'] | '';
  grade: CeramicGrade | '';
  surfaceLocation: FormState['surfaceLocation'] | '';
  baseUnit: UnitType | '';
  sellUnit: UnitType | '';
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

export interface FormDefaults {
  /** Default stocking/selling unit, usually the first unit of the business profile. */
  baseUnit?: UnitType;
}
