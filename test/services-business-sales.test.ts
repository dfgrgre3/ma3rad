import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { getDefaultBusinessConfiguration } from '../src/config/businessProfiles.ts';
import { getProductUnitLabel, getStockQuantityLabel } from '../src/utils/productUnits.ts';

const serviceProductId = 'prod_service_business_test';

function applyServicesProfile(db: DatabaseManager, businessType = 'services'): void {
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', businessType]);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(getDefaultBusinessConfiguration(businessType)),
  ]);
}

function applyCeramicsProfile(db: DatabaseManager): void {
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', 'ceramics']);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(getDefaultBusinessConfiguration('ceramics')),
  ]);
}

function inventoryTransactionCount(db: DatabaseManager): number {
  return Number(db.query<{ count: number }>('SELECT COUNT(*) AS count FROM inventory_transactions')[0]?.count || 0);
}

function stockRows(db: DatabaseManager): number {
  return Number(db.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM warehouse_stock WHERE product_id = ?',
    [serviceProductId]
  )[0]?.count || 0);
}

function ledgerCodes(db: DatabaseManager, referenceType: string, referenceId: string): string[] {
  return db.query<{ code: string }>(
    `SELECT a.code AS code
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE e.reference_type = ? AND e.reference_id = ?`,
    [referenceType, referenceId]
  ).map((row) => row.code);
}

function ledgerAmount(
  db: DatabaseManager,
  referenceType: string,
  referenceId: string,
  code: string
): { debit: number; credit: number } {
  const row = db.query<{ debit: number; credit: number }>(
    `SELECT COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE e.reference_type = ? AND e.reference_id = ? AND a.code = ?`,
    [referenceType, referenceId, code]
  )[0];
  return { debit: Number(row?.debit || 0), credit: Number(row?.credit || 0) };
}

async function boot(businessType = 'services'): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, min_selling_price_m2, is_active
     ) VALUES (?, 'SERVICE', '', ?, ?, ?, ?, ?, '', 'SERVICE', 'SERVICE', 1, 1, 100, 150, 0, 1)
     ON CONFLICT(id) DO NOTHING`,
    [serviceProductId, 'SKU-SERVICE-1', 'BAR-SERVICE-1', 'خدمة تركيب اختبارية', 'cat_floor', 'br_cleo']
  );
  applyServicesProfile(db, businessType);
  return db;
}

function sellService(): { invoiceId: string; customerId: string } {
  const customer = new CustomerService().createCustomer({
    name: 'عميل خدمات اختباري',
    phone: '01000000994',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId: serviceProductId,
      soldBy: 'PIECE',
      quantityM2: 2,
      boxesCount: 0,
      piecesCount: 2,
      unitPrice: 150,
    }],
    paidAmount: 300,
    paymentType: 'CASH',
  });
  return { invoiceId: invoice.id, customerId: customer.id };
}

test('a services business can sell without any stock and without inventory accounting', async () => {
  const db = await boot();
  assert.equal(ModuleRegistryService.isInventoryTracked(), false);

  const { invoiceId } = sellService();
  const invoice = new SalesService().getInvoiceById(invoiceId)!;

  assert.equal(invoice.totalAmount, 300);
  // No inventory asset means no cost relief at invoice level.
  assert.equal(invoice.totalCost, 0);
  assert.equal(invoice.grossProfit, 300);
  // Line cost is still recorded for costing insight.
  assert.equal(Number(invoice.items[0].unitCost), 100);

  assert.equal(stockRows(db), 0);
  assert.equal(inventoryTransactionCount(db), 0);
  const codes = ledgerCodes(db, 'SALES_INVOICE', invoiceId);
  assert.equal(codes.includes('5101'), false);
  assert.equal(codes.includes('1104'), false);
  assert.equal(codes.includes('5102'), false, 'a services business has no service cost to accrue');
  assert.equal(codes.includes('4101'), true);

  // Returning a service must not restore stock or reverse inventory value.
  const sales = new SalesService();
  const returned = sales.returnSale(invoiceId, [{
    productId: serviceProductId,
    quantityM2: 1,
    unitPrice: 150,
    reason: 'خدمة غير مكتملة',
  }], true);

  assert.equal(returned.totalAmount, 150);
  assert.equal(stockRows(db), 0);
  assert.equal(inventoryTransactionCount(db), 0);
  const returnCodes = ledgerCodes(db, 'SALES_RETURN', returned.id);
  assert.equal(returnCodes.includes('1104'), false);
  assert.equal(returnCodes.includes('5101'), false);
  assert.equal(returnCodes.includes('4101'), true);
});

test('voiding a services invoice reverses money only, and goods still need stock once tracking is on', async () => {
  const db = await boot();
  const { invoiceId } = sellService();

  const voided = new SalesService().voidInvoice(invoiceId, 'اختبار إلغاء خدمة');
  assert.equal(voided.invoiceStatus, 'VOID');
  assert.equal(stockRows(db), 0);
  assert.equal(inventoryTransactionCount(db), 0);
  const codes = ledgerCodes(db, 'SALES_VOID', invoiceId);
  assert.equal(codes.includes('1104'), false);
  assert.equal(codes.includes('5101'), false);
  assert.equal(codes.includes('4101'), true);

  // Turning stock tracking back on restores the stock requirement for real
  // goods, while service products keep selling without stock in the same
  // business.
  applyCeramicsProfile(db);
  assert.equal(ModuleRegistryService.isInventoryTracked(), true);
  assert.equal(stockRows(db), 0);
  const serviceSale = sellService();
  assert.ok(serviceSale.invoiceId);
  assert.equal(stockRows(db), 0);

  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, min_selling_price_m2, is_active
     ) VALUES ('prod_void_ceramic', 'CERAMIC', '', 'SKU-VOID-CERAMIC', 'BAR-VOID-CERAMIC',
       'بلاط اختبار الإلغاء', 'cat_floor', 'br_cleo', '60x60', 'M2', 'M2', 4, 1.44, 50, 80, 0, 1)`
  );
  const customer = new CustomerService().createCustomer({
    name: 'عميل بلاط اختباري',
    phone: '01000000997',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  assert.throws(() => new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId: 'prod_void_ceramic',
      soldBy: 'M2',
      quantityM2: 1,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 80,
    }],
    paidAmount: 80,
    paymentType: 'CASH',
  }), /غير كافٍ/);
});

test('service products default to the profile unit instead of ceramic defaults', async () => {
  const db = await boot();
  const product = new ProductService().createProduct({
    sku: 'SKU-SERVICE-DEFAULTS',
    barcode: 'BAR-SERVICE-DEFAULTS',
    name: 'خدمة صيانة',
    categoryId: 'cat_floor',
    brandId: 'br_cleo',
  } as any);

  assert.equal(product.productType, 'GENERAL');
  assert.equal(product.baseUnit, 'SERVICE');
  assert.equal(product.sellUnit, 'SERVICE');
  assert.equal(product.surfaceLocation, '');
  assert.equal(getProductUnitLabel({ productType: product.productType, baseUnit: product.baseUnit }), 'خدمة');
  assert.equal(getStockQuantityLabel({ productType: 'SERVICE', baseUnit: 'SERVICE' }), 'خدمة');
});

// Every preset profile that declares "services" must be able to sell without
// stock. This guards the "any business type" promise across profiles, not just
// the `services` preset.
for (const businessType of ['logistics', 'professional_services', 'education', 'healthcare_admin']) {
  test(`${businessType} profile sells service products without stock`, async () => {
    const db = await boot(businessType);
    assert.equal(ModuleRegistryService.isInventoryTracked(), false);
    assert.equal(ModuleRegistryService.isModuleEnabled('sales'), true);

    const { invoiceId } = sellService();
    const invoice = new SalesService().getInvoiceById(invoiceId)!;
    assert.equal(invoice.totalAmount, 300);
    assert.equal(invoice.totalCost, 0);
    assert.equal(stockRows(db), 0);
    assert.equal(inventoryTransactionCount(db), 0);
  });
}

test('a mixed business sells service lines without stock while product lines still require stock', async () => {
  const db = await boot('restaurant');
  assert.equal(ModuleRegistryService.isInventoryTracked(), true);

  // Service line: no stock row exists, yet the sale must succeed.
  const { invoiceId } = sellService();
  assert.equal(stockRows(db), 0);
  assert.equal(inventoryTransactionCount(db), 0);
  const saleCodes = ledgerCodes(db, 'SALES_INVOICE', invoiceId);
  assert.equal(saleCodes.includes('1104'), false, 'service cost must not be relieved from inventory');
  assert.equal(saleCodes.includes('5101'), false);
  // Service cost is still real: it posts to the service cost account against
  // an accrued-service liability so the invoice's cost is fully accounted for.
  assert.equal(ledgerAmount(db, 'SALES_INVOICE', invoiceId, '5102').debit, 200);
  assert.equal(ledgerAmount(db, 'SALES_INVOICE', invoiceId, '2105').credit, 200);
  assert.equal(Number(new SalesService().getInvoiceById(invoiceId)!.totalCost), 200);

  const returned = new SalesService().returnSale(invoiceId, [{
    productId: serviceProductId,
    quantityM2: 1,
    unitPrice: 150,
    reason: 'خدمة غير مكتملة',
  }], true);
  assert.equal(stockRows(db), 0);
  assert.equal(inventoryTransactionCount(db), 0);
  const returnCodes = ledgerCodes(db, 'SALES_RETURN', returned.id);
  assert.equal(returnCodes.includes('1104'), false);
  assert.equal(ledgerAmount(db, 'SALES_RETURN', returned.id, '5102').credit, 100);
  assert.equal(ledgerAmount(db, 'SALES_RETURN', returned.id, '2105').debit, 100);

  // A genuine product line in the same business still needs stock.
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, min_selling_price_m2, is_active
     ) VALUES ('prod_mixed_goods', 'GENERAL', '', 'SKU-MIXED-GOODS', 'BAR-MIXED-GOODS', 'منتج مخزني',
       'cat_floor', 'br_cleo', '', 'PIECE', 'PIECE', 1, 1, 10, 20, 0, 1)`
  );
  const customer = new CustomerService().createCustomer({
    name: 'عميل مختلط اختباري',
    phone: '01000000996',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  assert.throws(() => new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId: 'prod_mixed_goods',
      soldBy: 'PIECE',
      quantityM2: 1,
      boxesCount: 0,
      piecesCount: 1,
      unitPrice: 20,
    }],
    paidAmount: 20,
    paymentType: 'CASH',
  }), /غير كافٍ/);
});
