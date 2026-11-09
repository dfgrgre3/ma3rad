import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatProductQuantity, getProductUnitLabel, getStockQuantityLabel, isServiceProduct } from '../src/utils/products/productUnits';
import { emptyForm, emptyProductEntryForm, emptyVariant } from '../src/components/products/productFormModel';

test('service units read as خدمة instead of square meters', () => {
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'SERVICE' }), 'خدمة');
  assert.equal(getStockQuantityLabel({ productType: 'SERVICE', baseUnit: 'SERVICE' }), 'خدمة');
  assert.equal(isServiceProduct({ productType: 'SERVICE', baseUnit: 'SERVICE' }), true);
  assert.equal(isServiceProduct({ productType: 'GENERAL', baseUnit: 'SERVICE' }), true);
  assert.equal(isServiceProduct({ productType: 'CERAMIC', baseUnit: 'M2' }), false);
});

test('the shared form helper keeps neutral values for non-ceramic flows', () => {
  const general = emptyForm('cat_1', 'br_1', 'GENERAL', { baseUnit: 'SERVICE' });
  assert.equal(general.productType, 'GENERAL');
  assert.equal(general.size, '');
  assert.equal(general.thickness, 0);
  assert.equal(general.finish, '');
  assert.equal(general.surfaceLocation, 'GENERAL');
  assert.equal(general.baseUnit, 'SERVICE');
  assert.equal(general.sellUnit, 'SERVICE');
  assert.equal(general.piecesPerBox, 1);
  assert.equal(general.metersPerBox, 1);
  assert.equal(general.costPrice, 0);
  assert.equal(general.sellingPriceM2, 0);
  assert.equal(general.minStockLevel, 0);
});

test('the shared form helper retains existing ceramic values for other flows', () => {
  const ceramic = emptyForm('cat_1', 'br_1', 'CERAMIC');
  assert.equal(ceramic.size, '60x60');
  assert.equal(ceramic.thickness, 8);
  assert.equal(ceramic.surfaceLocation, 'FLOOR');
  assert.equal(ceramic.baseUnit, 'M2');
  assert.equal(ceramic.piecesPerBox, 4);
  assert.equal(ceramic.metersPerBox, 1.44);
  assert.equal(ceramic.costPrice, 150);
});

test('new product entry fields start blank without sample values', () => {
  const form = emptyProductEntryForm();
  assert.equal(form.productType, '');
  assert.equal(form.name, '');
  assert.equal(form.sku, '');
  assert.equal(form.barcode, '');
  assert.equal(form.categoryId, '');
  assert.equal(form.brandId, '');
  assert.equal(form.grade, '');
  assert.equal(form.size, '');
  assert.equal(form.thickness, 0);
  assert.equal(form.surfaceLocation, '');
  assert.equal(form.baseUnit, '');
  assert.equal(form.sellUnit, '');
  assert.equal(form.piecesPerBox, 0);
  assert.equal(form.metersPerBox, 0);
  assert.equal(form.costPrice, 0);
  assert.equal(form.sellingPriceM2, 0);
  assert.equal(form.minStockLevel, 0);
  assert.equal(form.maxStockLevel, 0);
  assert.equal(emptyVariant().grade, '');
});

test('general products keep their selected stock unit', () => {
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'BOX', customUnit: '' }), 'كرتونة');
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'PIECE', customUnit: '' }), 'قطعة');
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'CUSTOM', customUnit: 'شيكارة' }), 'شيكارة');
  assert.equal(formatProductQuantity(3, { productType: 'GENERAL', baseUnit: 'PIECE', customUnit: '' }), '٣ قطعة');
});

test('ceramic quantities remain in square meters', () => {
  assert.equal(getProductUnitLabel({ productType: 'CERAMIC', baseUnit: 'M2', customUnit: '' }), 'م²');
});
