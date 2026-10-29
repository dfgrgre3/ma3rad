import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { ProcurementService } from '../src/services/ProcurementService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { ModuleRegistryService } from '../src/services/ModuleRegistryService.ts';
import { getDefaultBusinessConfiguration } from '../src/config/businessProfiles.ts';

const supplierId = 'sup_no_inventory';
const productId = 'prod_no_inventory';

function applyNoInventoryProfile(db: DatabaseManager): void {
  const config = getDefaultBusinessConfiguration('custom');
  config.trackInventory = false;
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['businessType', 'custom']);
  db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [
    'businessProfileConfig',
    JSON.stringify(config),
  ]);
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

function count(db: DatabaseManager, sql: string, params: any[] = []): number {
  return Number(db.query<{ count: number }>(sql, params)[0]?.count || 0);
}

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  db.run(
    `INSERT OR IGNORE INTO suppliers (id, code, name, phone, payment_terms_days, is_active)
     VALUES (?, 'SUP-NOINV', 'مورد بدون مخزون', '01000000995', 0, 1)`,
    [supplierId]
  );
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, is_active
     ) VALUES (?, 'GENERAL', '', 'SKU-NOINV', 'BAR-NOINV', 'صنف بدون مخزون', 'cat_floor', 'br_cleo', '',
       'PIECE', 'PIECE', 1, 1, 0, 50, 1)
     ON CONFLICT(id) DO NOTHING`,
    [productId]
  );
  applyNoInventoryProfile(db);
  return db;
}

test('a custom business without stock tracking can record and delete a purchase without creating inventory', async () => {
  const db = await boot();
  assert.equal(ModuleRegistryService.isInventoryTracked(), false);
  assert.equal(ModuleRegistryService.isModuleEnabled('purchasing'), true);

  const purchase = new PurchaseService().createPurchase({
    supplierId,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 3, boxesCount: 0, unitCost: 40 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  } as any);

  assert.equal(purchase.totalAmount, 120);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM warehouse_stock WHERE product_id = ?', [productId]), 0);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM inventory_transactions WHERE product_id = ?', [productId]), 0);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM inventory_cost_layers WHERE product_id = ?', [productId]), 0);

  // The last purchase cost stays available as an expense reference.
  const product = db.query<{ costPrice: number }>('SELECT cost_price AS costPrice FROM products WHERE id = ?', [productId])[0];
  assert.equal(Number(product.costPrice), 40);

  const purchaseCodes = ledgerCodes(db, 'PURCHASE_INVOICE', purchase.id);
  assert.equal(purchaseCodes.includes('1104'), false, 'no inventory asset debit');
  assert.equal(purchaseCodes.includes('5201'), true, 'purchase is expensed');

  new PurchaseService().deletePurchase(purchase.id, 'اختبار حذف بدون مخزون');
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM purchase_invoices WHERE id = ?', [purchase.id]), 0);
  const voidCodes = ledgerCodes(db, 'PURCHASE_VOID', purchase.id);
  assert.equal(voidCodes.includes('1104'), false);
  assert.equal(voidCodes.includes('5201'), true);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM inventory_transactions WHERE product_id = ?', [productId]), 0);
});

test('goods receipt records accepted quantities without creating stock when inventory tracking is off', async () => {
  const db = await boot();
  const { grn } = new ProcurementService().createGoodsReceipt({
    supplierId,
    warehouseId: 'wh_main',
    deliveryNoteNumber: 'DN-NOINV-1',
    items: [{ productId, receivedQuantityM2: 4, acceptedQuantityM2: 4, unitCost: 40 }],
  });

  assert.ok(grn.id);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM goods_receipt_notes WHERE id = ?', [grn.id]), 1);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM goods_receipt_note_items WHERE grn_id = ?', [grn.id]), 1);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM warehouse_stock WHERE product_id = ?', [productId]), 0);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM inventory_transactions WHERE product_id = ?', [productId]), 0);
  assert.equal(count(db, 'SELECT COUNT(*) AS count FROM product_batches WHERE product_id = ?', [productId]), 0);
});

test('opening stock is refused when the business profile does not track inventory', async () => {  const db = await boot();
  assert.throws(
    () => new ProductService().createProduct({
      productType: 'GENERAL',
      customUnit: '',
      sku: 'SKU-OPENING-NOINV',
      barcode: 'BAR-OPENING-NOINV',
      name: 'صنف برصيد افتتاحي',
      categoryId: 'cat_floor',
      brandId: 'br_cleo',
      grade: '',
      size: '',
      thickness: 0,
      color: '',
      tone: '',
      finish: '',
      surfaceLocation: 'FLOOR',
      baseUnit: 'PIECE',
      sellUnit: 'PIECE',
      piecesPerBox: 1,
      metersPerBox: 1,
      weightPerBox: 0,
      costPrice: 10,
      sellingPriceM2: 20,
      sellingPriceBox: 0,
      wholesalePriceM2: 0,
      minSellingPriceM2: 0,
      minStockLevel: 0,
      maxStockLevel: 0,
      imagePath: '',
      notes: '',
      isActive: true,
    } as any, { warehouseId: 'wh_main', quantityM2: 5, unitCost: 10 }),
    /لا يتبّع المخزون/
  );
  assert.equal(
    count(db, `SELECT COUNT(*) AS count FROM products WHERE sku = 'SKU-OPENING-NOINV'`),
    0,
    'no product is created when opening stock is refused'
  );
});
