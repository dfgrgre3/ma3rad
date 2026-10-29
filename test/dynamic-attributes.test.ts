import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { AttributeService } from '../src/services/AttributeService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { ProductExtraService } from '../src/services/ProductExtraService.ts';
import {
  normalizeDynamicAttributeValue,
  type DynamicAttributeDefinition,
} from '../src/services/dynamicAttributes.ts';

const attribute = (
  dataType: DynamicAttributeDefinition['dataType'],
  overrides: Partial<DynamicAttributeDefinition> = {},
): DynamicAttributeDefinition => ({
  id: 'attr_test',
  name: 'خاصية اختبار',
  dataType,
  isRequired: false,
  isFilterable: true,
  values: [],
  ...overrides,
});

test('dynamic product attributes normalize supported values and reject invalid values', () => {
  assert.equal(normalizeDynamicAttributeValue(attribute('TEXT'), '  glazed  '), 'glazed');
  assert.equal(normalizeDynamicAttributeValue(attribute('NUMBER'), '12.50'), '12.5');
  assert.equal(normalizeDynamicAttributeValue(attribute('BOOLEAN'), '1'), 'true');
  assert.equal(normalizeDynamicAttributeValue(attribute('DATE'), '2026-02-28'), '2026-02-28');
  assert.equal(normalizeDynamicAttributeValue(attribute('SELECT', {
    values: [{ value: 'matte', label: 'مطفي' }],
  }), 'matte'), 'matte');
  assert.equal(normalizeDynamicAttributeValue(attribute('MULTI_SELECT'), '["red","blue"]'), '["red","blue"]');
  assert.equal(normalizeDynamicAttributeValue(attribute('TEXT'), '  '), null);

  assert.throws(() => normalizeDynamicAttributeValue(attribute('NUMBER'), 'NaN'), /غير صالحة/);
  assert.throws(() => normalizeDynamicAttributeValue(attribute('BOOLEAN'), 'sometimes'), /غير صالحة/);
  assert.throws(() => normalizeDynamicAttributeValue(attribute('DATE'), '2026-02-30'), /غير صالحة/);
  assert.throws(() => normalizeDynamicAttributeValue(attribute('SELECT', {
    values: [{ value: 'matte', label: 'مطفي' }],
  }), 'glossy'), /غير صالحة/);
  assert.throws(() => normalizeDynamicAttributeValue(attribute('TEXT', { isRequired: true }), ''), /مطلوبة/);
  assert.throws(() => normalizeDynamicAttributeValue(attribute('MULTI_SELECT', { isRequired: true }), '[]'), /مطلوبة/);
});

test('dynamic product attributes enforce definitions and persist normalized values', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const suffix = Date.now().toString();
  const attributeService = new AttributeService();
  attributeService.addCategory({
    name: 'حالة الاختبار',
    code: `TEST_STATE_${suffix}`,
    dataType: 'SELECT',
    isRequired: true,
    isFilterable: false,
    options: ['ready', 'pending'],
  });
  const definition = attributeService.getCategories().find((item) => item.code === `TEST_STATE_${suffix}`);
  assert.ok(definition);
  assert.equal(definition.isRequired, true);
  assert.equal(definition.isFilterable, false);
  assert.deepEqual(definition.values.map((option) => option.value), ['ready', 'pending']);

  const product = new ProductService().createProduct({
    sku: `DYNAMIC-${suffix}`,
    barcode: `DYNAMIC-BAR-${suffix}`,
    name: 'منتج اختبار الخصائص',
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
    grade: 'GRADE_1',
    size: '60x60',
    baseUnit: 'M2',
    sellUnit: 'M2',
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 10,
    sellingPriceM2: 20,
    sellingPriceBox: 28,
    wholesalePriceM2: 18,
    minSellingPriceM2: 15,
    minStockLevel: 10,
    isActive: true,
  });
  const extraService = new ProductExtraService();

  assert.throws(() => extraService.setAttributeValues(product.id, {}), /مطلوبة/);
  assert.throws(
    () => extraService.setAttributeValues(product.id, { [definition.id]: 'unknown' }),
    /غير صالحة/,
  );
  extraService.setAttributeValues(product.id, { [definition.id]: 'ready' });
  assert.equal(extraService.getAttributeValues(product.id)[definition.id], 'ready');

  AuthService.logout();
});
