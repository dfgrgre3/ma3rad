import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import {
  basePriceFromUnitPrice,
  getSellableUnits,
  pricePerUnit,
} from '../src/utils/uom.ts';

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return manager;
}

function seedProduct(manager: DatabaseManager, input: {
  id: string;
  name: string;
  baseUnit: string;
  sellUnit: string;
  piecesPerBox: number;
  metersPerBox: number;
  costPrice: number;
  price: number;
  stock: number;
  productType?: 'GENERAL' | 'CERAMIC';
}): string {
  manager.run(
    `INSERT OR REPLACE INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active
     ) VALUES (?, ?, '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '',
       ?, ?, ?, ?, ?, ?, 1)`,
    [
      input.id, input.productType || 'GENERAL', `SKU-${input.id}`, `BAR-${input.id}`, input.name,
      input.baseUnit, input.sellUnit, input.piecesPerBox, input.metersPerBox,
      input.costPrice, input.price,
    ]
  );
  manager.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, ?, 0)`,
    [`stk_${input.id}`, input.id, input.stock]
  );
  return input.id;
}

function seedCustomer(name: string, phone: string): string {
  return new CustomerService().createCustomer({
    name,
    phone,
    customerType: 'RETAIL',
    creditLimit: 0,
  }).id;
}

function stockOf(productId: string): number {
  return new InventoryService().getWarehouseStock('wh_main')
    .find((row) => row.productId === productId)?.quantityM2 ?? 0;
}

test('selling a piece-based product by box converts quantity and price to the base unit', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_sell_box_piece',
    name: 'صنف بالقطعة يباع بالكرتونة',
    baseUnit: 'PIECE',
    sellUnit: 'BOX',
    piecesPerBox: 12,
    metersPerBox: 1,
    costPrice: 6,
    price: 10,
    stock: 60,
  });
  const customerId = seedCustomer('عميل بيع بالكرتونة', '01000000771');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      uom: 'BOX',
      quantity: 2,
      quantityM2: 0,
      boxesCount: 2,
      piecesCount: 0,
      unitPrice: 120,
    }],
    paidAmount: 240,
    paymentType: 'CASH',
  });

  const line = invoice.items[0];
  assert.equal(line.quantityM2, 24, '2 boxes of 12 pieces must be stored as 24 base pieces');
  assert.equal(line.quantity, 24);
  assert.equal(line.uom, 'PIECE');
  assert.equal(line.soldBy, 'BOX');
  assert.equal(line.unitPrice, 10, 'unit price is stored per base unit');
  assert.equal(line.totalPrice, 240, 'total follows the sell-unit arithmetic without drift');
  assert.equal(line.boxesCount, 2);
  assert.equal(line.piecesCount, 24);
  assert.equal(stockOf(productId), 36);
});

test('selling a kilogram-based product by ton converts to kilograms', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_sell_ton_kg',
    name: 'صنف بالكيلو يباع بالطن',
    baseUnit: 'KG',
    sellUnit: 'TON',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 12,
    price: 20,
    stock: 800,
  });
  const customerId = seedCustomer('عميل بيع بالطن', '01000000772');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'TON',
      uom: 'TON',
      quantity: 0.5,
      quantityM2: 0,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 20000,
    }],
    paidAmount: 10000,
    paymentType: 'CASH',
  });

  const line = invoice.items[0];
  assert.equal(line.quantityM2, 500);
  assert.equal(line.uom, 'KG');
  assert.equal(line.unitPrice, 20);
  assert.equal(line.totalPrice, 10000);
  assert.equal(stockOf(productId), 300);
});

test('ceramic area sold by box keeps square meters as the stock unit', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_sell_box_m2',
    name: 'سيراميك يباع بالكرتونة',
    productType: 'CERAMIC',
    baseUnit: 'M2',
    sellUnit: 'BOX',
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 70,
    price: 100,
    stock: 100,
  });
  const customerId = seedCustomer('عميل سيراميك بالكرتونة', '01000000773');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      uom: 'BOX',
      quantity: 2,
      quantityM2: 0,
      boxesCount: 2,
      piecesCount: 0,
      unitPrice: 144,
    }],
    paidAmount: 288,
    paymentType: 'CASH',
  });

  const line = invoice.items[0];
  assert.equal(line.quantityM2, 2.88);
  assert.equal(line.uom, 'M2');
  assert.equal(line.unitPrice, 100);
  assert.equal(line.totalPrice, 288);
  assert.equal(line.boxesCount, 2);
  assert.equal(line.piecesCount, 8);
  assert.equal(stockOf(productId), 97.12);
});

test('a unit that cannot be converted is rejected instead of silently pricing wrong', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_sell_bad_unit',
    name: 'صنف لا يباع بالكرتونة',
    baseUnit: 'KG',
    sellUnit: 'KG',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 5,
    price: 10,
    stock: 50,
  });
  const customerId = seedCustomer('عميل وحدة مستحيلة', '01000000774');

  assert.throws(() => new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      uom: 'BOX',
      quantity: 1,
      quantityM2: 0,
      boxesCount: 1,
      piecesCount: 0,
      unitPrice: 100,
    }],
    paidAmount: 0,
    paymentType: 'CASH',
  }), /لا يمكن بيع الصنف/);

  // Nothing was written: stock is untouched and no invoice exists for the line.
  assert.equal(stockOf(productId), 50);
});

test('legacy lines that send only quantityM2 keep their base-unit meaning', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_sell_legacy',
    name: 'صنف بمسار قديم',
    baseUnit: 'PIECE',
    sellUnit: 'BOX',
    piecesPerBox: 12,
    metersPerBox: 1,
    costPrice: 4,
    price: 10,
    stock: 20,
  });
  const customerId = seedCustomer('عميل مسار قديم', '01000000775');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'M2',
      quantityM2: 3,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 10,
    }],
    paidAmount: 30,
    paymentType: 'CASH',
  });

  const line = invoice.items[0];
  assert.equal(line.quantityM2, 3);
  assert.equal(line.totalPrice, 30);
  assert.equal(stockOf(productId), 17);
});

test('returning a quantity in a selling unit converts to base units and refunds the base amount', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_return_box_unit',
    name: 'صنف مرتجع بالكرتونة',
    baseUnit: 'PIECE',
    sellUnit: 'BOX',
    piecesPerBox: 12,
    metersPerBox: 1,
    costPrice: 6,
    price: 10,
    stock: 60,
  });
  const customerId = seedCustomer('عميل مرتجع بالكرتونة', '01000000776');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      uom: 'BOX',
      quantity: 2,
      quantityM2: 0,
      boxesCount: 2,
      piecesCount: 0,
      unitPrice: 120,
    }],
    paidAmount: 240,
    paymentType: 'CASH',
  });
  assert.equal(stockOf(productId), 36);

  const saleReturn = new SalesService().returnSale(
    invoice.id,
    [{
      productId,
      quantityM2: 0,
      uom: 'BOX',
      quantity: 1,
      boxesCount: 0,
      // Ignored: the service prices returns from the original invoice.
      unitPrice: 0,
      unitCost: 0,
      reason: 'إرجاع كرتونة',
    }],
    false
  );

  const returnedLine = manager.query<{ quantityM2: number; quantity: number; uom: string }>(
    `SELECT quantity_m2 AS quantityM2, quantity, uom FROM sales_return_items WHERE return_id = ?`,
    [saleReturn.id]
  )[0];
  assert.equal(returnedLine.quantityM2, 12, '1 box of 12 pieces is stored as 12 base pieces');
  assert.equal(returnedLine.uom, 'PIECE');
  assert.equal(saleReturn.totalAmount, 120, 'refund = base quantity × base price');
  assert.equal(stockOf(productId), 48);
});

test('returning an impossible unit is rejected and changes nothing', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_return_bad_unit',
    name: 'صنف مرتجع بوحدة مستحيلة',
    baseUnit: 'KG',
    sellUnit: 'KG',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 4,
    price: 10,
    stock: 30,
  });
  const customerId = seedCustomer('عميل مرتجع وحدة مستحيلة', '01000000777');

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'KG',
      uom: 'KG',
      quantity: 5,
      quantityM2: 0,
      boxesCount: 0,
      piecesCount: 0,
      unitPrice: 10,
    }],
    paidAmount: 50,
    paymentType: 'CASH',
  });
  assert.equal(stockOf(productId), 25);

  assert.throws(() => new SalesService().returnSale(
    invoice.id,
    [{
      productId,
      quantityM2: 0,
      uom: 'BOX',
      quantity: 1,
      boxesCount: 0,
      unitPrice: 10,
      unitCost: 4,
      reason: 'وحدة خاطئة',
    }],
    false
  ), /لا يمكن تحويل الكمية/);

  assert.equal(stockOf(productId), 25, 'nothing was written by the rejected return');
});

test('sellable units and price helpers agree with the conversion layer', () => {
  const pieceBox = { productType: 'GENERAL', baseUnit: 'PIECE', sellUnit: 'BOX', piecesPerBox: 12, metersPerBox: 1 };
  assert.deepEqual(getSellableUnits(pieceBox), ['PIECE', 'BOX']);
  assert.equal(pricePerUnit(10, 'BOX', pieceBox), 120);
  assert.equal(basePriceFromUnitPrice(120, 'BOX', pieceBox), 10);

  const kg = { productType: 'GENERAL', baseUnit: 'KG', sellUnit: 'KG' };
  assert.deepEqual(getSellableUnits(kg), ['KG', 'TON']);
  assert.equal(pricePerUnit(20, 'TON', kg), 20000);
  assert.equal(basePriceFromUnitPrice(20000, 'TON', kg), 20);

  const service = { productType: 'SERVICE', baseUnit: 'SERVICE' };
  assert.deepEqual(getSellableUnits(service), ['SERVICE']);
});
