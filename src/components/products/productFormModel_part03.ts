import type { FormDefaults, FormState, ProductEntryFormState, VariantDraft } from './productFormModel_part02';

export const emptyForm = (
  categoryId = '',
  brandId = '',
  productType: FormState['productType'] = 'CERAMIC',
  defaults: FormDefaults = {},
): FormState => {
  const ceramic = productType === 'CERAMIC';
  const baseUnit = defaults.baseUnit || (ceramic ? 'M2' : 'PIECE');
  return {
    productType,
    name: '',
    sku: '',
    barcode: '',
    categoryId,
    brandId,
    grade: 'GRADE_1',
    size: ceramic ? '60x60' : '',
    thickness: ceramic ? 8 : 0,
    color: '',
    tone: '',
    finish: ceramic ? 'لامع' : '',
    // Ceramic products default to flooring; everything else stays neutral and
    // lets the service layer apply the business-profile default.
    surfaceLocation: ceramic ? 'FLOOR' : 'GENERAL',
    baseUnit,
    sellUnit: baseUnit,
    customUnit: '',
    piecesPerBox: ceramic ? 4 : 1,
    metersPerBox: ceramic ? 1.44 : 1,
    weightPerBox: 0,
    costPrice: ceramic ? 150 : 0,
    sellingPriceM2: ceramic ? 220 : 0,
    sellingPriceBox: ceramic ? 316.8 : 0,
    wholesalePriceM2: ceramic ? 190 : 0,
    minSellingPriceM2: ceramic ? 180 : 0,
    minStockLevel: ceramic ? 20 : 0,
    maxStockLevel: 1000,
    notes: '',
  };
};

export const emptyProductEntryForm = (): ProductEntryFormState => ({
  ...emptyForm(),
  productType: '',
  categoryId: '',
  brandId: '',
  grade: '',
  size: '',
  thickness: 0,
  finish: '',
  surfaceLocation: '',
  baseUnit: '',
  sellUnit: '',
  piecesPerBox: 0,
  metersPerBox: 0,
  costPrice: 0,
  sellingPriceM2: 0,
  sellingPriceBox: 0,
  wholesalePriceM2: 0,
  minSellingPriceM2: 0,
  minStockLevel: 0,
  maxStockLevel: 0,
});

export const emptyVariant = (): VariantDraft => ({
  variantName: '', sku: '', barcode: '', color: '', size: '',
  grade: '', costPrice: 0, sellingPriceM2: 0,
});
