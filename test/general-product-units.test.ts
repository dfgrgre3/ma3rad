import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { SalesService } from '../src/services/SalesService.ts';

test('general product sales decrement stock using the selected unit', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager.getDatabase();

  const productId = 'prod_unit_box_test';
  db.run(
    `INSERT INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price,
       selling_price_m2, is_active
     ) VALUES (?, 'GENERAL', '', ?, ?, ?, ?, ?, '', 'BOX', 'BOX', 1, 1, 5, 10, 1)`,
    [productId, 'SKU-UNIT-BOX', 'BAR-UNIT-BOX', 'اختبار كرتونة', 'cat_floor', 'br_cleo'],
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, 5, 0)`,
    ['stk_unit_box_test', productId],
  );
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار وحدات عامة',
    phone: '01000000991',
    customerType: 'RETAIL',
    creditLimit: 0,
  });

  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'BOX',
      quantityM2: 2,
      boxesCount: 2,
      piecesCount: 0,
      unitPrice: 10,
    }],
    paidAmount: 20,
    paymentType: 'CASH',
  });

  const savedInvoice = new SalesService().getInvoiceById(invoice.id);
  const stock = new InventoryService().getWarehouseStock('wh_main').find((row) => row.productId === productId);
  assert.equal(stock?.quantityM2, 3);
  assert.equal(stock?.quantityBoxes, 3);
  assert.equal(savedInvoice?.items[0].productType, 'GENERAL');
  assert.equal(savedInvoice?.items[0].baseUnit, 'BOX');
});
