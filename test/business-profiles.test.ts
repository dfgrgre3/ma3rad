import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { SettingsService } from '../src/services/SettingsService.ts';
import { BusinessProfileService } from '../src/services/BusinessProfileService.ts';
import { ManufacturingService } from '../src/services/ManufacturingService.ts';
import { RestaurantService } from '../src/services/RestaurantService.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ConfigurationVersionService } from '../src/services/ConfigurationVersionService.ts';
import {
  BUSINESS_MODULES,
  BUSINESS_PROFILES,
  BUSINESS_ACTIVITY_CATALOG,
  BUSINESS_ACTIVITY_FAMILY_OPTIONS,
  BUSINESS_TYPES,
  getActivityModuleIds,
  getBusinessModuleForPath,
  getBusinessProfile,
  getDefaultBusinessConfiguration,
  getManagedBusinessPaths,
  getProfileModuleIds,
  parseBusinessConfiguration,
  parseEnabledModules,
  serializeBusinessConfiguration,
} from '../src/config/businessProfiles.ts';
import { NAV_GROUPS } from '../src/config/navigation.tsx';
import {
  resolveBusinessTerm,
  validateBusinessTermOverrides,
} from '../src/config/businessTerminology.ts';
import { NavigationService } from '../src/services/NavigationService.ts';
import { TerminologyService } from '../src/services/TerminologyService.ts';
import { validateModuleSelection } from '../src/config/moduleRegistry.ts';
import { shouldShowFirstRunSetup } from '../src/config/setupLifecycle.ts';

test('custom business profiles start with every ERP module enabled', () => {
  assert.deepEqual(getProfileModuleIds('custom'), BUSINESS_MODULES.map((module) => module.id));
});

test('first-run setup is limited to genuinely unconfigured databases', () => {
  assert.equal(shouldShowFirstRunSetup({
    completed: false,
    hasBusinessData: false,
    hasLegacyConfiguration: false,
  }), true);
  assert.equal(shouldShowFirstRunSetup({
    completed: true,
    hasBusinessData: false,
    hasLegacyConfiguration: false,
  }), false);
  assert.equal(shouldShowFirstRunSetup({
    completed: false,
    hasBusinessData: true,
    hasLegacyConfiguration: false,
  }), false);
  assert.equal(shouldShowFirstRunSetup({
    completed: false,
    hasBusinessData: false,
    hasLegacyConfiguration: true,
  }), false);
});

test('all catalog activities resolve to validated shared profile templates', () => {
  assert.equal(BUSINESS_PROFILES.length, 25);
  assert.equal(BUSINESS_ACTIVITY_CATALOG.length, 149);
  assert.equal(new Set(BUSINESS_ACTIVITY_CATALOG.map((activity) => activity.id)).size, BUSINESS_ACTIVITY_CATALOG.length);
  assert.equal(new Set(BUSINESS_TYPES.map((activity) => activity.id)).size, BUSINESS_TYPES.length);
  assert.equal(BUSINESS_ACTIVITY_FAMILY_OPTIONS.length, 14);
  assert.deepEqual(
    Object.fromEntries(BUSINESS_ACTIVITY_FAMILY_OPTIONS.map((family) => [
      family.id,
      BUSINESS_ACTIVITY_CATALOG.filter((activity) => activity.familyId === family.id).length,
    ])),
    {
      retail: 20,
      distribution: 11,
      manufacturing: 13,
      construction: 10,
      transport: 11,
      hospitality: 10,
      healthcare: 11,
      education: 8,
      professional_services: 17,
      beauty_sports: 9,
      tourism_events: 8,
      finance: 8,
      nonprofit: 7,
      agriculture: 6,
    },
  );
  for (const activity of BUSINESS_ACTIVITY_CATALOG) {
    const profile = getBusinessProfile(activity.id);
    assert.equal(profile.id, activity.id);
    assert.equal(profile.familyId, activity.familyId);
    assert.ok(profile.name.ar.trim());
    assert.ok(profile.name.en.trim());
    assert.ok(profile.description.ar.trim());
    assert.ok(profile.description.en.trim());
    assert.equal(profile.configuration.units.length > 0, true);
    assert.equal(
      profile.modules.enabledByDefault.length + profile.modules.optional.length,
      BUSINESS_MODULES.length,
    );
    assert.equal(profile.support.profileDefaults, 'implemented');
    assert.deepEqual(
      validateModuleSelection(getProfileModuleIds(activity.id), {
        trackInventory: profile.configuration.trackInventory,
      }).errors,
      [],
    );
  }
  for (const profile of BUSINESS_PROFILES) {
    assert.equal(BUSINESS_TYPES.some((type) => type.id === profile.id), true);
    assert.ok(profile.name.ar.trim());
    assert.ok(profile.name.en.trim());
    assert.ok(profile.description.ar.trim());
    assert.ok(profile.description.en.trim());
    assert.equal(profile.configuration.units.length > 0, true);
    for (const values of [
      profile.configuration.units,
      profile.configuration.customUnits,
      profile.configuration.productAttributes,
    ]) {
      const normalized = values.map((value) => value.trim().toLocaleLowerCase());
      assert.equal(normalized.every(Boolean), true, `${profile.id} contains an empty configuration value`);
      assert.equal(new Set(normalized).size, normalized.length, `${profile.id} contains duplicate configuration values`);
    }
    assert.equal(
      profile.modules.enabledByDefault.length + profile.modules.optional.length,
      BUSINESS_MODULES.length,
    );
    assert.equal(profile.support.profileDefaults, 'implemented');
    assert.deepEqual(
      validateModuleSelection(getProfileModuleIds(profile.id), {
        trackInventory: profile.configuration.trackInventory,
      }).errors,
      [],
    );
  }
});

test('industry profiles provide useful item attributes where their catalog needs them', () => {
  const profilesWithAttributes = [
    'building_materials',
    'construction',
    'ecommerce',
    'education',
    'hospitality',
    'import_export',
    'logistics',
    'manufacturing',
    'professional_services',
    'services',
  ];

  for (const profileId of profilesWithAttributes) {
    assert.ok(
      getDefaultBusinessConfiguration(profileId).productAttributes.length > 0,
      `${profileId} should provide useful default attributes`,
    );
  }
});

test('JSON module defaults preserve the prior profile module selections', () => {
  assert.deepEqual(getProfileModuleIds('services'), [
    'sales', 'customers', 'finance', 'reports', 'documents', 'projects', 'hr',
  ]);
  assert.deepEqual(getProfileModuleIds('ceramics'), BUSINESS_MODULES.map((module) => module.id));
});

test('enabled module settings preserve an intentionally empty selection', () => {
  assert.deepEqual(parseEnabledModules('[]', 'custom'), []);
  assert.deepEqual(parseEnabledModules('["sales","not-a-module"]', 'custom'), ['sales']);
});

test('all business navigation entries are controlled by a configurable module', () => {
  const managedPaths = getManagedBusinessPaths();
  const unassignedPaths = NAV_GROUPS
    .filter((group) => group.id !== 'dashboard' && group.id !== 'system')
    .flatMap((group) => group.items)
    .map((item) => item.to)
    .filter((path) => !managedPaths.has(path));

  assert.deepEqual(unassignedPaths, []);
});

test('business templates retain ceramic defaults and provide retail and service capabilities', () => {
  assert.deepEqual(getDefaultBusinessConfiguration('ceramics').units, ['M2', 'BOX', 'PIECE']);
  assert.equal(getDefaultBusinessConfiguration('services').trackInventory, false);
  assert.equal(getDefaultBusinessConfiguration('services').businessModel, 'services');
  assert.equal('appointmentsEnabled' in getDefaultBusinessConfiguration('services'), false);
});

test('additional industry profiles configure suitable defaults using available modules', () => {
  assert.equal(getDefaultBusinessConfiguration('manufacturing').trackInventory, true);
  assert.equal(getProfileModuleIds('manufacturing').includes('inventory'), true);
  assert.equal(getDefaultBusinessConfiguration('construction').units.includes('SERVICE'), true);
  assert.equal(getProfileModuleIds('construction').includes('customers'), true);
  assert.equal(getDefaultBusinessConfiguration('professional_services').trackInventory, false);
  assert.equal(getDefaultBusinessConfiguration('healthcare_admin').businessModel, 'services');
});

test('secondary activities merge only their supported defaults and modules', () => {
  const combined = getDefaultBusinessConfiguration('ceramics', ['services']);
  assert.equal(combined.businessModel, 'mixed');
  assert.equal(combined.trackInventory, true);
  assert.equal(combined.units.includes('SERVICE'), true);
  assert.deepEqual(combined.additionalActivityIds, ['services']);

  const modules = getActivityModuleIds('ceramics', ['services']);
  assert.equal(modules.includes('inventory'), true);
  assert.equal(modules.includes('hr'), true);
  assert.deepEqual(
    parseBusinessConfiguration(JSON.stringify({
      ...getDefaultBusinessConfiguration('ceramics'),
      additionalActivityIds: ['services', 'not-an-activity', 'ceramics'],
    }), 'ceramics').additionalActivityIds,
    ['services'],
  );
});

test('business customizations restore from saved settings and ignore malformed values', () => {
  const restored = parseBusinessConfiguration(JSON.stringify({
    businessModel: 'mixed',
    trackInventory: false,
    units: ['KG', 'NOT_A_UNIT', 'KG'],
    customUnits: ['صندوق'],
    productAttributes: ['اللون'],
    variantsEnabled: true,
  }), 'custom');
  assert.equal(restored.trackInventory, false);
  assert.equal(restored.businessModel, 'mixed');
  assert.deepEqual(restored.units, ['KG']);
  assert.deepEqual(restored.customUnits, ['صندوق']);
  assert.equal('variantsEnabled' in restored, false);
  assert.equal(parseBusinessConfiguration('{', 'ceramics').trackInventory, true);
});

test('saved activity configurations are versioned and legacy flat settings remain readable', () => {
  const configuration = getDefaultBusinessConfiguration('clothing');
  const serialized = serializeBusinessConfiguration(configuration);
  assert.equal(JSON.parse(serialized).schemaVersion, 1);
  assert.deepEqual(parseBusinessConfiguration(serialized, 'clothing'), configuration);
  assert.deepEqual(
    parseBusinessConfiguration(JSON.stringify(configuration), 'clothing'),
    configuration,
  );
  assert.throws(
    () => parseBusinessConfiguration('{"schemaVersion":2}', 'clothing'),
    /إصدار إعدادات النشاط غير مدعوم/,
  );
  assert.throws(
    () => serializeBusinessConfiguration({ ...configuration, trackInventory: 'yes' } as never),
    /إعدادات النشاط غير صالحة/,
  );
});

test('nested paths resolve to their configured module for direct-route gating', () => {
  assert.equal(getBusinessModuleForPath('/products/123'), 'inventory');
  assert.equal(getBusinessModuleForPath('/sales/analytics'), 'sales');
  assert.equal(getBusinessModuleForPath('/admin'), undefined);
});

test('profile attribute names become real attributes exactly once', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const names = ['اختبار اللون ١', 'اختبار المقاس ١'];

  const first = BusinessProfileService.ensureProfileAttributes(names);
  assert.deepEqual(first.created, names);
  assert.deepEqual(first.existing, []);

  // Re-applying the same profile must not duplicate fields.
  const second = BusinessProfileService.ensureProfileAttributes(names);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.existing, names);

  const rows = manager.query<{ id: string; code: string }>(
    `SELECT id, code FROM attributes WHERE name IN (?, ?)`,
    names
  );
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.code)).size, 2);
  // Names created by another profile (or by the user) are untouched.
  manager.run(
    `INSERT OR REPLACE INTO attributes (id, code, name, data_type, is_filterable, sort_order)
     VALUES ('attr_keep_manual', 'attr_keep_manual', 'خاصية يدوية', 'TEXT', 1, 99)`
  );
  BusinessProfileService.ensureProfileAttributes(names);
  assert.equal(manager.query(`SELECT id FROM attributes WHERE id = 'attr_keep_manual'`).length, 1);
});

test('saved business profile attributes are materialized on demand', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessType',
    'furniture',
  ]);
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify({
      ...getDefaultBusinessConfiguration('furniture'),
      productAttributes: ['اختبار الخامة ١', 'اختبار الموديل ١'],
    }),
  ]);

  const result = BusinessProfileService.applyFromSettings();
  assert.deepEqual(result.created, ['اختبار الخامة ١', 'اختبار الموديل ١']);
  const stored = manager.query<{ name: string }>(
    `SELECT name FROM attributes WHERE name IN ('اختبار الخامة ١', 'اختبار الموديل ١') ORDER BY name`
  );
  assert.equal(stored.length, 2);
});

test('industry profiles materialize typed product fields and selection options', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const profiles = [
    { type: 'clothing', code: 'APPAREL_SIZE', dataType: 'SELECT', optionCount: 6 },
    { type: 'ceramics', code: 'TILE_GRADE', dataType: 'SELECT', optionCount: 3 },
    { type: 'electronics', code: 'WARRANTY_MONTHS', dataType: 'NUMBER', unit: 'شهر' },
    { type: 'food', code: 'PRODUCT_EXPIRY', dataType: 'DATE' },
    { type: 'cosmetics', code: 'COSMETIC_VOLUME', dataType: 'NUMBER', unit: 'مل' },
  ] as const;

  BusinessProfileService.ensureProfileAttributes(['مقاس الملابس']);
  for (const profile of profiles) {
    const configuration = getDefaultBusinessConfiguration(profile.type);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      'businessType',
      profile.type,
    ]);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      'businessProfileConfig',
      serializeBusinessConfiguration(configuration),
    ]);
    BusinessProfileService.applyFromSettings();

    const attribute = manager.query<{ id: string; dataType: string; unit: string | null }>(
      'SELECT id, data_type AS dataType, unit FROM attributes WHERE code = ?',
      [profile.code],
    )[0];
    assert.ok(attribute, `${profile.type} should create its declared profile field`);
    assert.equal(attribute.dataType, profile.dataType);
    if ('unit' in profile) assert.equal(attribute.unit, profile.unit);
    if ('optionCount' in profile) {
      assert.equal(
        manager.query('SELECT id FROM attribute_options WHERE attribute_id = ?', [attribute.id]).length,
        profile.optionCount,
      );
    }

    const repeated = BusinessProfileService.applyFromSettings();
    assert.equal(repeated.created.includes(
      getBusinessProfile(profile.type).configuration.productAttributeDefinitions?.[0]?.name || '',
    ), false);
  }
});

test('profile defaults do not rewrite manually configured product attributes', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  manager.run(
    `INSERT INTO attributes (id, code, name, data_type, is_filterable, sort_order)
     VALUES (?, ?, ?, 'TEXT', 1, 0)`,
    ['attr_manual_profile', 'MANUAL_PROFILE_FIELD', 'حقل النشاط المخصص'],
  );

  const result = BusinessProfileService.ensureProfileAttributeDefinitions([{
    code: 'MANAGED_PROFILE_FIELD',
    name: 'حقل النشاط المخصص',
    dataType: 'SELECT',
    options: ['اختيار'],
  }]);

  assert.deepEqual(result, { created: [], existing: ['حقل النشاط المخصص'] });
  const stored = manager.query<{ code: string; dataType: string }>(
    'SELECT code, data_type AS dataType FROM attributes WHERE id = ?',
    ['attr_manual_profile'],
  )[0];
  assert.deepEqual(stored, { code: 'MANUAL_PROFILE_FIELD', dataType: 'TEXT' });
  assert.equal(
    manager.query('SELECT id FROM attribute_options WHERE attribute_id = ?', ['attr_manual_profile']).length,
    0,
  );
});

test('business configuration is restored from SQLite settings', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const config = getDefaultBusinessConfiguration('services');
  manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(config),
  ]);
  const restored = parseBusinessConfiguration(SettingsService.getValue('businessProfileConfig'), 'services');
  assert.equal(restored.businessType, 'services');
  assert.equal(restored.trackInventory, false);
  assert.deepEqual(restored.units, ['SERVICE']);
});

test('business terminology resolves Arabic organization overrides before profile defaults', () => {
  const key = 'entities.products.plural';
  assert.equal(resolveBusinessTerm(key, {
    businessType: 'ceramics',
    language: 'ar',
  }), 'الأصناف');
  assert.equal(resolveBusinessTerm(key, {
    businessType: 'services',
    language: 'ar',
  }), 'الخدمات');
  assert.equal(resolveBusinessTerm(key, {
    businessType: 'ceramics_distribution',
    language: 'ar',
  }), 'الأصناف');
  assert.equal(resolveBusinessTerm(key, {
    businessType: 'ceramics',
    language: 'ar',
    overrides: { ar: { [key]: 'مواد' } },
  }), 'مواد');
  assert.equal(resolveBusinessTerm('entities.customers.plural', {
    businessType: 'ceramics',
    language: 'ar',
  }), 'العملاء');
});

test('business terminology rejects unknown keys, malformed values, and duplicate labels', () => {
  assert.throws(() => validateBusinessTermOverrides({ ar: { 'tables.products': 'مواد' } }), /مفتاح مصطلح غير مسموح/);
  assert.throws(() => validateBusinessTermOverrides({ ar: { 'entities.products.plural': 12 } }), /يجب أن تكون نصًا/);
  assert.throws(() => validateBusinessTermOverrides({
    ar: {
      'entities.products.plural': 'العملاء',
      'entities.customers.plural': 'العملاء',
    },
  }), /مكرر/);
  assert.deepEqual(validateBusinessTermOverrides({
    ar: { 'entities.products.plural': '   ' },
  }), { ar: {} });
  assert.deepEqual(validateBusinessTermOverrides({
    en: { 'entities.products.plural': 'Products' },
  }), {});
});

test('terminology settings drive navigation labels and retain explicit navigation overrides', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const keys = ['businessType', 'businessTerminologyOverrides', 'nav.labels'];
  const previous = new Map(keys.map((key) => [
    key,
    manager.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0]?.value,
  ]));

  try {
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', 'services']);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      'businessTerminologyOverrides',
      JSON.stringify({ ar: { 'entities.products.plural': 'حلول المنشأة' } }),
    ]);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      'nav.labels',
      JSON.stringify({ 'group:products': 'تسمية القائمة', '/products': 'تسمية الدليل' }),
    ]);

    assert.equal(TerminologyService.getTerm('entities.products.plural'), 'حلول المنشأة');
    const groups = NavigationService.getGroups();
    const products = groups.find((group) => group.id === 'products');
    const sales = groups.find((group) => group.id === 'sales');
    assert.equal(products?.label, 'تسمية القائمة');
    assert.equal(products?.items.find((item) => item.to === '/products')?.label, 'تسمية الدليل');
    assert.equal(sales?.items.find((item) => item.to === '/sales')?.label, 'فواتير الخدمات');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) manager.run('DELETE FROM system_settings WHERE key = ?', [key]);
      else manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
});

test('restaurant tickets consume recipe ingredients and issue one linked invoice', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const settingKeys = ['businessType', 'businessProfileConfig', 'enabledModules'];
  const previousSettings = new Map(settingKeys.map((key) => [
    key,
    db.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0]?.value,
  ]));
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', 'restaurant']);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(getDefaultBusinessConfiguration('restaurant')),
  ]);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'enabledModules',
    JSON.stringify(getProfileModuleIds('restaurant')),
  ]);

  try {
    const suffix = Date.now().toString(36);
    const dishId = `restaurant_dish_${suffix}`;
    const ingredientId = `restaurant_ingredient_${suffix}`;
    const insertProduct = (id: string, name: string, cost: number, price: number) => db.run(
      `INSERT INTO products
        (id, product_type, custom_unit, sku, barcode, name, category_id, brand_id,
         grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box,
         cost_price, selling_price_m2, selling_price_box, wholesale_price_m2,
         min_selling_price_m2, min_stock_level, is_active)
       VALUES (?, 'GENERAL', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', 'standard',
         'PIECE', 'PIECE', 1, 1, ?, ?, ?, ?, 0, 0, 1)`,
      [id, `SKU-${id}`, `BAR-${id}`, name, cost, price, price, price]
    );
    insertProduct(dishId, 'طبق اختبار', 3, 15);
    insertProduct(ingredientId, 'مكون اختبار', 2, 15);
    db.run(
      `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
       VALUES (?, 'wh_main', ?, 10, 0)`,
      [`stock_${ingredientId}`, ingredientId]
    );

    const manufacturing = new ManufacturingService();
    const recipe = manufacturing.createBom({
      productId: dishId,
      name: 'وصفة الاختبار',
      items: [{ componentProductId: ingredientId, quantity: 2, unit: 'PIECE' }],
    });
    manufacturing.activateBom(recipe.id);

    const restaurant = new RestaurantService();
    const table = restaurant.createTable(7000 + Math.floor(Math.random() * 1000), 4);
    const emptyMenuOrder = {
      serviceMode: 'DINE_IN' as const,
      tableId: table.id,
      customerId: 'cust_cash',
      warehouseId: 'wh_main',
      items: [{ productId: dishId, quantity: 2 }],
    };
    assert.throws(() => restaurant.createOrder(emptyMenuOrder), /غير متاح في قائمة المطعم/);
    const menuItem = restaurant.addMenuItem(dishId, 'wh_main');
    restaurant.setMenuItemAvailability(menuItem.id, false);
    assert.throws(() => restaurant.createOrder(emptyMenuOrder), /غير متاح في قائمة المطعم/);
    restaurant.setMenuItemAvailability(menuItem.id, true);
    const order = restaurant.createOrder({
      serviceMode: 'DINE_IN',
      tableId: table.id,
      customerId: 'cust_cash',
      warehouseId: 'wh_main',
      items: [{ productId: dishId, quantity: 2 }],
    });
    assert.equal(order.items[0].kitchenStatus, 'NEW');
    assert.throws(() => restaurant.createOrder({
      serviceMode: 'DINE_IN',
      tableId: table.id,
      customerId: 'cust_cash',
      warehouseId: 'wh_main',
      items: [{ productId: dishId, quantity: 1 }],
    }), /طلب مفتوح/);

    const preparing = restaurant.updateKitchenStatus(order.items[0].id, 'PREPARING');
    assert.equal(preparing.items[0].kitchenStatus, 'PREPARING');
    assert.throws(() => restaurant.updateKitchenStatus(order.items[0].id, 'SERVED'), /لا يمكن نقل الصنف/);
    assert.throws(() => restaurant.cancelOrder(order.id), /بدأ تحضيره/);
    assert.throws(() => restaurant.billOrder(order.id, 'CASH'), /تقديم جميع أصناف الطلب/);

    db.run(
      `UPDATE warehouse_stock SET quantity_m2 = 0 WHERE warehouse_id = 'wh_main' AND product_id = ?`,
      [ingredientId]
    );
    assert.throws(() => restaurant.updateKitchenStatus(order.items[0].id, 'READY'), /غير كافٍ/);
    assert.equal(restaurant.getOpenOrders()[0].items[0].kitchenStatus, 'PREPARING');
    db.run(
      `UPDATE warehouse_stock SET quantity_m2 = 10 WHERE warehouse_id = 'wh_main' AND product_id = ?`,
      [ingredientId]
    );

    const ready = restaurant.updateKitchenStatus(order.items[0].id, 'READY');
    assert.equal(ready.items[0].kitchenStatus, 'READY');
    const ingredientStock = db.query<{ quantity: number }>(
      `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
      [ingredientId]
    )[0].quantity;
    assert.equal(ingredientStock, 6);
    const preparedDishStock = db.query<{ quantity: number }>(
      `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
      [dishId]
    )[0].quantity;
    assert.equal(preparedDishStock, 2);

    restaurant.updateKitchenStatus(order.items[0].id, 'SERVED');
    const invoice = restaurant.billOrder(order.id, 'CASH');
    assert.equal(invoice.totalAmount, 30);
    assert.equal(invoice.items.length, 1);
    assert.equal(db.query(
      `SELECT id FROM sales_invoices WHERE restaurant_order_id = ?`,
      [order.id]
    ).length, 1);
    assert.equal(db.query<{ status: string }>(
      `SELECT status FROM restaurant_orders WHERE id = ?`,
      [order.id]
    )[0].status, 'BILLED');
    assert.equal(restaurant.billOrder(order.id, 'CASH').id, invoice.id);
    assert.equal(db.query(
      `SELECT id FROM sales_invoices WHERE restaurant_order_id = ?`,
      [order.id]
    ).length, 1);
    assert.equal(db.query<{ quantity: number }>(
      `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE warehouse_id = 'wh_main' AND product_id = ?`,
      [dishId]
    )[0].quantity, 0);
  } finally {
    for (const [key, value] of previousSettings) {
      if (value === undefined) db.run('DELETE FROM system_settings WHERE key = ?', [key]);
      else db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
});

test('activity configuration versions are permission-checked, deduplicated, validated, and append-only', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const actor = AuthService.login('admin', 'admin123');
  const keys = ['businessType', 'businessTypeLabel', 'businessProfileConfig', 'businessTerminologyOverrides'];
  const previous = new Map(keys.map((key) => [
    key,
    manager.query<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [key])[0]?.value,
  ]));

  const writeSettings = (businessType: string, businessTypeLabel: string) => {
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', businessType]);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessTypeLabel', businessTypeLabel]);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
      'businessProfileConfig',
      JSON.stringify(getDefaultBusinessConfiguration(businessType)),
    ]);
    manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessTerminologyOverrides', '{}']);
  };

  try {
    writeSettings('ceramics', 'سيراميك الاختبار');
    const first = ConfigurationVersionService.recordCurrent('اختبار التكوين', actor);
    assert.ok(first);
    assert.equal(ConfigurationVersionService.recordCurrent('نسخة مكررة', actor), null);
    assert.equal(first.snapshot.businessType, 'ceramics');

    writeSettings('services', 'خدمات الاختبار');
    const second = ConfigurationVersionService.recordCurrent('تغيير النشاط', actor);
    assert.ok(second);
    assert.ok(second.version > first.version);

    const versions = ConfigurationVersionService.getVersions(actor);
    assert.equal(versions[0].id, second.id);
    assert.equal(versions[1].id, first.id);
    assert.throws(() => ConfigurationVersionService.getVersions({
      ...actor,
      id: 'user_without_permissions',
      role: 'CASHIER',
    }), /audit\.view/);
    assert.throws(() => manager.run(
      'UPDATE activity_configuration_versions SET reason = ? WHERE id = ?',
      ['tampered', first.id],
    ), /append-only/i);
    assert.throws(() => manager.run(
      'DELETE FROM activity_configuration_versions WHERE id = ?',
      [first.id],
    ), /append-only/i);

    const database = manager.getDatabase();
    database.run('BEGIN TRANSACTION');
    try {
      const invalidVersion = Number(manager.query<{ version: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM activity_configuration_versions'
      )[0].version);
      manager.run(
        `INSERT INTO activity_configuration_versions
          (id, version, snapshot_json, created_by, created_by_name, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'acv_invalid_test',
          invalidVersion,
          JSON.stringify({
            schemaVersion: 1,
            businessType: 'ceramics',
            configuration: {},
            enabledModules: ['unknown-module'],
            terminologyOverrides: {},
          }),
          actor.id,
          actor.fullName,
          'invalid snapshot test',
        ],
      );
      assert.throws(
        () => ConfigurationVersionService.getVersions(actor),
        /وحدات غير صالحة/,
      );
    } finally {
      database.run('ROLLBACK');
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) manager.run('DELETE FROM system_settings WHERE key = ?', [key]);
      else manager.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
});
