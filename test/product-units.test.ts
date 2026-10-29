import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatProductQuantity, getProductUnitLabel, getStockQuantityLabel, isServiceProduct } from '../src/utils/productUnits';
import { emptyForm } from '../src/components/products/productFormModel';

test('service units read as خدمة instead of square meters', () => {
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'SERVICE' }), 'خدمة');
  assert.equal(getStockQuantityLabel({ productType: 'SERVICE', baseUnit: 'SERVICE' }), 'خدمة');
  assert.equal(isServiceProduct({ productType: 'SERVICE', baseUnit: 'SERVICE' }), true);
  assert.equal(isServiceProduct({ productType: 'GENERAL', baseUnit: 'SERVICE' }), true);
  assert.equal(isServiceProduct({ productType: 'CERAMIC', baseUnit: 'M2' }), false);
});

test('the product form starts neutral for non-ceramic business types', () => {
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

test('the product form keeps ceramic defaults for ceramics businesses', () => {
  const ceramic = emptyForm('cat_1', 'br_1', 'CERAMIC');
  assert.equal(ceramic.size, '60x60');
  assert.equal(ceramic.thickness, 8);
  assert.equal(ceramic.surfaceLocation, 'FLOOR');
  assert.equal(ceramic.baseUnit, 'M2');
  assert.equal(ceramic.piecesPerBox, 4);
  assert.equal(ceramic.metersPerBox, 1.44);
  assert.equal(ceramic.costPrice, 150);
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
