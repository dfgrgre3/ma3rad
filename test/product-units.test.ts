import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatProductQuantity, getProductUnitLabel } from '../src/utils/productUnits';

test('general products keep their selected stock unit', () => {
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'BOX', customUnit: '' }), 'كرتونة');
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'PIECE', customUnit: '' }), 'قطعة');
  assert.equal(getProductUnitLabel({ productType: 'GENERAL', baseUnit: 'CUSTOM', customUnit: 'شيكارة' }), 'شيكارة');
  assert.equal(formatProductQuantity(3, { productType: 'GENERAL', baseUnit: 'PIECE', customUnit: '' }), '٣ قطعة');
});

test('ceramic quantities remain in square meters', () => {
  assert.equal(getProductUnitLabel({ productType: 'CERAMIC', baseUnit: 'M2', customUnit: '' }), 'م²');
});
