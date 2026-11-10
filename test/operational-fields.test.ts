import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ProductService } from '../src/services/domains/products/ProductService.ts';
import { OperationalFieldService } from '../src/services/domains/products/OperationalFieldService.ts';
import { MasterDataSyncService } from '../src/sync/MasterDataSyncService.ts';
import { CrmService } from '../src/services/domains/crm/CrmService.ts';
import { parseGrade } from '../src/components/products/productFormModel.ts';

test('operational field definitions validate, persist, export, and protect stored values', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new OperationalFieldService();
  const code = `TEST_${Date.now()}`;
  const fieldId = service.addDefinition({
    entityType: 'products',
    code,
    name: 'مقاس خاص',
    dataType: 'SELECT',
    isRequired: true,
    isFilterable: true,
    options: ['XL', 'XXL'],
  });
  const product = new ProductService().createProduct({
    sku: `OP-${Date.now()}`,
    barcode: `OP-BAR-${Date.now()}`,
    name: 'منتج الحقول التشغيلية',
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

  assert.throws(() => service.setRecordValues('products', product.id, {}), /مطلوب/);
  assert.throws(() => service.setRecordValues('products', product.id, { [fieldId]: 'unknown' }), /غير صالحة/);
  service.setRecordValues('products', product.id, { [fieldId]: 'XL' });
  assert.deepEqual(service.getRecordValues('products', product.id), { [fieldId]: 'XL' });
  assert.deepEqual(service.getRecordValuesForExport('products', [product.id])[product.id], { 'مقاس خاص': 'XL' });
  assert.equal(service.getFilterableDefinitions('products').some((field) => field.id === fieldId), true);

  service.setRecordValues('products', product.id, {});
  assert.deepEqual(service.getRecordValues('products', product.id), { [fieldId]: 'XL' });
  service.updateDefinition(fieldId, { name: 'مقاس العبوة' });
  assert.deepEqual(service.getRecordValues('products', product.id), { [fieldId]: 'XL' });
  assert.throws(() => service.deleteDefinition(fieldId), /قيم محفوظة/);
  AuthService.logout();
});

test('purchase order export values are labeled for direct list reports', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new OperationalFieldService();
  const fieldId = service.addDefinition({
    entityType: 'purchase_orders',
    code: `EXPORT_${Date.now()}`,
    name: 'مجموعة التوريد',
    dataType: 'SELECT',
    options: ['A', 'B'],
  });
  service.setRecordValues('purchase_orders', 'po-export-check', { [fieldId]: 'B' }, 'create');

  assert.deepEqual(
    service.getRecordValuesForExport('purchase_orders', ['po-export-check'])['po-export-check'],
    { 'مجموعة التوريد': 'B' },
  );
  AuthService.logout();
});

test('product grade choices can be configured and new grade values remain persistable', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const service = new OperationalFieldService();
  const original = service.getProductGradeOptions(true).find((option) => option.value === 'GRADE_1');
  assert.ok(original);
  assert.equal(original.label, 'فرز أول');
  service.updateProductGradeOption(original.value, { label: 'الفرز القياسي' });
  assert.equal(service.getProductGradeOptions(true).find((option) => option.value === original.value)?.label, 'الفرز القياسي');
  const grade = service.addProductGradeOption(`Special grade ${Date.now()}`);
  assert.match(grade, /^SPECIAL_GRADE_\d+$/);

  const product = new ProductService().createProduct({
    sku: `GRADE-${Date.now()}`,
    barcode: `GRADE-BAR-${Date.now()}`,
    name: 'صنف بفرز مخصص',
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
    grade,
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
  assert.equal(new ProductService().getProductById(product.id)?.grade, grade);
  AuthService.logout();
});

test('operational field changes use the configured master-data sync policy', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  MasterDataSyncService.configure({
    tenantId: `tenant-${Date.now()}`,
    branchId: 'branch-main',
    deviceId: `device-${Date.now()}`,
    canManagePolicies: true,
  });

  try {
    const service = new OperationalFieldService();
    const fieldId = service.addDefinition({
      entityType: 'customers',
      code: `SYNC_${Date.now()}`,
      name: 'حقل متزامن',
      dataType: 'TEXT',
      options: [],
    });
    const events = db.query<{ entityType: string; entityId: string }>(
      `SELECT entity_type AS entityType, entity_id AS entityId FROM sync_outbox
       WHERE entity_type IN ('operational_field','operational_field_option')
       ORDER BY created_at DESC LIMIT 10`,
    );
    assert.ok(events.some((event) => event.entityType === 'operational_field' && event.entityId === fieldId));
    MasterDataSyncService.configure(null);
  } finally {
    MasterDataSyncService.configure(null);
    AuthService.logout();
  }
});

test('record deletion clears custom fields and configured grade parsing preserves custom values', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const fields = new OperationalFieldService();
  const fieldId = fields.addDefinition({
    entityType: 'leads',
    code: `DELETE_${Date.now()}`,
    name: 'حقل حذف',
    dataType: 'TEXT',
  });
  const lead = new CrmService().createLead({
    name: `عميل اختبار ${Date.now()}`,
    phone: `09${Date.now()}`,
  });
  fields.setRecordValues('leads', lead.id, { [fieldId]: 'قيمة مؤقتة' }, 'create');
  assert.equal(fields.getRecordValues('leads', lead.id)[fieldId], 'قيمة مؤقتة');
  new CrmService().deleteLead(lead.id);
  assert.deepEqual(fields.getRecordValues('leads', lead.id), {});

  const custom = fields.addProductGradeOption(`Grade parse ${Date.now()}`);
  const options = fields.getProductGradeOptions(true);
  const customOption = options.find((option) => option.value === custom);
  assert.ok(customOption);
  assert.equal(parseGrade(custom, options), custom);
  assert.equal(parseGrade(customOption.label, options), custom);
  AuthService.logout();
});
