import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { QuotationService } from '../src/services/domains/sales/QuotationService.ts';
import { OrderService } from '../src/services/domains/sales/OrderService.ts';
import { getQuantity, getRoomLineTotal, getRoomMeasures } from '../src/pages/construction/estimateCalculations.ts';

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return manager;
}

test('apartment estimate deducts openings and applies waste, discount, and profit in order', () => {
  const room = {
    id: 'room-1', name: 'غرفة', length: 4, width: 3, height: 3,
    doorCount: 1, doorWidth: 0.9, doorHeight: 2.1,
    windowCount: 1, windowWidth: 1.2, windowHeight: 1.2,
  };
  const measures = getRoomMeasures(room);
  assert.equal(measures.floor, 12);
  assert.equal(measures.ceiling, 12);
  assert.equal(measures.perimeter, 14);
  assert.equal(measures.walls, 38.67, 'door and window openings are excluded from net wall area');

  const line = {
    id: 'line-1', category: 'تشطيب', name: 'بند', measure: 'floor' as const, unit: 'م²',
    manualQuantity: 1, materialProductId: '', materialRate: 20, laborRate: 5,
    wastePercent: 10, discountPercent: 10, profitPercent: 20,
  };
  assert.deepEqual(getRoomLineTotal(line, room, 1), {
    quantity: 12,
    materialQuantity: 13.2,
    materialCost: 264,
    laborCost: 60,
    beforeAdjustments: 324,
    total: 349.92,
  });
  assert.equal(getQuantity({ ...line, measure: 'manual', manualQuantity: 8 }, room, 2), 4);
});

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
  productType?: 'GENERAL' | 'CERAMIC' | 'SERVICE';
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

test('a quotation priced per box is stored and invoiced in base units without changing the total', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_qtn_box_m2',
    name: 'سيراميك عرض سعر بالكرتونة',
    productType: 'CERAMIC',
    baseUnit: 'M2',
    sellUnit: 'BOX',
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 70,
    price: 100,
    stock: 100,
  });

  test('service and labor quotation lines persist, update, and cannot be invoiced as stock', async () => {
    const manager = await boot();
    const productId = seedProduct(manager, {
      id: 'prod_quote_service_link',
      name: 'خامة مرتبطة بمقايسة',
      baseUnit: 'M2',
      sellUnit: 'M2',
      piecesPerBox: 1,
      metersPerBox: 1,
      costPrice: 10,
      price: 20,
      stock: 100,
    });
    const customerId = seedCustomer('عميل مقايسة خدمات', '01000000899');
    const quotationService = new QuotationService();

    const quotation = quotationService.createQuotation({
      customerId,
      serviceItems: [{
        productId,
        description: 'أعمال المحارة والدهانات',
        unit: 'م²',
        quantity: 24,
        unitPrice: 85,
      }],
    });
    assert.equal(quotation.items?.length, 0);
    assert.equal(quotation.serviceItems?.length, 1);
    assert.equal(quotation.serviceItems?.[0].productId, productId);
    assert.equal(quotation.subtotal, 2040);
    assert.equal(quotation.totalAmount, 2040);

    quotationService.updateQuotation(quotation.id, {
      customerId,
      serviceItems: [{
        productId,
        description: 'محارة ودهانات بعد التعديل',
        unit: 'م²',
        quantity: 20,
        unitPrice: 90,
      }],
    });
    const updated = quotationService.getQuotation(quotation.id)!;
    assert.equal(updated.totalAmount, 1800);
    assert.equal(updated.serviceItems?.[0].description, 'محارة ودهانات بعد التعديل');
    assert.equal(updated.serviceItems?.[0].productId, productId);
    assert.equal(quotationService.getQuotations().find((row) => row.id === quotation.id)?.itemsCount, 1);
    assert.throws(
      () => quotationService.convertToInvoice(quotation.id, { warehouseId: 'wh_main' }),
      /بنود خدمات أو عمالة/
    );
    assert.equal(manager.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM quotation_service_items WHERE quotation_id = ?',
      [quotation.id]
    )[0].count, 1);
  });
  const customerId = seedCustomer('عميل عرض سعر بالكرتونة', '01000000881');

  const quotation = new QuotationService().createQuotation({
    customerId,
    warehouseId: 'wh_main',
    items: [{
      productId,
      quantityM2: 0,
      uom: 'BOX',
      quantity: 2,
      unitPrice: 144,
    }],
  });

  const stored = manager.query<{ quantityM2: number; unitPrice: number; totalPrice: number }>(
    `SELECT quantity_m2 AS quantityM2, unit_price AS unitPrice, total_price AS totalPrice
     FROM quotation_items WHERE quotation_id = ?`,
    [quotation.id]
  )[0];
  assert.equal(stored.quantityM2, 2.88, '2 boxes × 1.44 m² are stored as 2.88 base m²');
  assert.equal(stored.unitPrice, 100, 'the stored price is per base unit');
  assert.equal(stored.totalPrice, 288, 'the line total is computed in the entered unit');
  assert.equal(quotation.totalAmount, 288);

  const invoice = new QuotationService().convertToInvoice(quotation.id, {
    paymentType: 'CASH',
    paidAmount: 288,
  });

  const invoiceLine = invoice.items[0];
  assert.equal(invoiceLine.quantityM2, 2.88);
  assert.equal(invoiceLine.unitPrice, 100);
  assert.equal(invoiceLine.totalPrice, 288, 'converting the quotation must not change the total');
  assert.equal(stockOf(productId), 97.12);
});

test('a quotation priced per box becomes an order with the same base-unit line', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_qtn_order_box',
    name: 'سيراميك عرض سعر إلى طلب',
    productType: 'CERAMIC',
    baseUnit: 'M2',
    sellUnit: 'BOX',
    piecesPerBox: 4,
    metersPerBox: 1.44,
    costPrice: 70,
    price: 100,
    stock: 100,
  });
  const customerId = seedCustomer('عميل تحويل عرض إلى طلب', '01000000882');

  const quotation = new QuotationService().createQuotation({
    customerId,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 0, uom: 'BOX', quantity: 3, unitPrice: 150 }],
  });
  const order = new QuotationService().convertToOrder(quotation.id, {});

  const orderLine = order.items![0];
  assert.equal(orderLine.quantityM2, 4.32);
  assert.ok(Math.abs(orderLine.unitPrice - 104.166667) < 1e-6, 'the base-unit price keeps enough precision');
  assert.equal(orderLine.totalPrice, 450);
  assert.equal(order.totalAmount, 450);
  assert.equal(stockOf(productId), 100, 'a quotation/order only reserves stock, it does not consume it');
});

test('an order entered in tons stores kilograms but keeps the ton price total', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_order_ton_kg',
    name: 'بضاعة طلب بالطن',
    baseUnit: 'KG',
    sellUnit: 'TON',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 12,
    price: 20,
    stock: 800,
  });
  const customerId = seedCustomer('عميل طلب بالطن', '01000000883');

  const order = new OrderService().createOrder({
    customerId,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 0, uom: 'TON', quantity: 0.5, unitPrice: 20000 }],
  });

  const line = order.items![0];
  assert.equal(line.quantityM2, 500);
  assert.equal(line.unitPrice, 20);
  assert.equal(line.totalPrice, 10000);
  assert.equal(order.totalAmount, 10000);
  assert.equal(stockOf(productId), 800, 'the order reserves 500 kg without moving stock');

  const invoice = new OrderService().convertToInvoice(order.id, {
    paymentType: 'CASH',
    paidAmount: 10000,
  });
  const invoiceLine = invoice.items[0];
  assert.equal(invoiceLine.quantityM2, 500);
  assert.equal(invoiceLine.unitPrice, 20);
  assert.equal(invoiceLine.totalPrice, 10000);
  assert.equal(stockOf(productId), 300);
});

test('a quotation in an impossible unit is rejected and writes nothing', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_qtn_bad_unit',
    name: 'صنف عرض سعر بوحدة مستحيلة',
    baseUnit: 'KG',
    sellUnit: 'KG',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 5,
    price: 10,
    stock: 50,
  });
  const customerId = seedCustomer('عميل عرض سعر وحدة مستحيلة', '01000000884');
  const before = manager.query<{ count: number }>(`SELECT COUNT(*) AS count FROM quotations`)[0].count;

  assert.throws(() => new QuotationService().createQuotation({
    customerId,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 0, uom: 'BOX', quantity: 1, unitPrice: 100 }],
  }), /لا يمكن بيع الصنف/);

  const after = manager.query<{ count: number }>(`SELECT COUNT(*) AS count FROM quotations`)[0].count;
  assert.equal(after, before, 'the rejected quotation was not saved');
});

test('a service quotation keeps its single base unit and invoices without stock movement', async () => {
  const manager = await boot();
  const productId = seedProduct(manager, {
    id: 'prod_qtn_service',
    name: 'خدمة تركيب',
    productType: 'SERVICE',
    baseUnit: 'SERVICE',
    sellUnit: 'SERVICE',
    piecesPerBox: 1,
    metersPerBox: 1,
    costPrice: 0,
    price: 500,
    stock: 0,
  });
  const customerId = seedCustomer('عميل خدمة تركيب', '01000000885');

  const quotation = new QuotationService().createQuotation({
    customerId,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 0, uom: 'SERVICE', quantity: 1, unitPrice: 500 }],
  });
  assert.equal(quotation.items![0].quantityM2, 1);
  assert.equal(quotation.items![0].unitPrice, 500);
  assert.equal(quotation.totalAmount, 500);

  const invoice = new QuotationService().convertToInvoice(quotation.id, {
    paymentType: 'CASH',
    paidAmount: 500,
  });
  assert.equal(invoice.items[0].quantityM2, 1);
  assert.equal(invoice.items[0].totalPrice, 500);
  assert.equal(invoice.items[0].uom, 'SERVICE', 'the invoice keeps the service base unit');
  assert.equal(stockOf(productId), 0, 'a service line never moves stock');
});
