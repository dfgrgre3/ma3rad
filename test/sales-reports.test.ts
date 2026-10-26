import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { localDateString } from '../src/utils/date.ts';
import { loadReport } from '../src/pages/reports/SalesReportsPage.tsx';

test('sales reports net sales, profit and daily revenue against returns by return date', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'AVERAGE_COST')`);

  const productId = 'sales_report_return_product';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,
    min_stock_level,is_active)
    VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 0, 1)`,
    [productId, productId, productId, 'Sales report return product']);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2)
    VALUES (?, 'wh_main', ?, 20, 0)`, [`stock_${productId}`, productId]);
  const customer = new CustomerService().createCustomer({
    name: 'Sales report return customer',
    phone: '0199000033',
    customerType: 'RETAIL',
    creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300,
    }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 150,
    shippingCost: 50,
  });
  new SalesService().returnSale(invoice.id, [{
    productId, quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'report test',
  }]);

  const today = localDateString();
  const returnDate = '2099-01-02';
  db.run('UPDATE sales_returns SET date = ? WHERE original_invoice_id = ?', [returnDate, invoice.id]);
  const productRows = loadReport('by_product', today, returnDate) as Array<{
    label: string; revenue: number; cost: number; profit: number; count: number;
  }>;
  const product = productRows.find((row) => row.label === 'Sales report return product');
  assert.ok(product);
  assert.equal(product.revenue, 1856.25);
  assert.equal(product.cost, 600);
  assert.equal(product.profit, 1256.25);
  assert.equal(product.count, 1);

  const categoryRows = loadReport('by_category', today, returnDate) as typeof productRows;
  const categoryName = db.query<{ name: string }>('SELECT name FROM categories WHERE id = ?', ['cat_floor'])[0].name;
  const categoryRow = categoryRows.find((row) => row.label === categoryName);
  assert.ok(categoryRow);
  assert.equal(categoryRow.revenue, 1856.25);
  assert.equal(categoryRow.profit, 1256.25);

  const customerRows = loadReport('by_customer', today, returnDate) as typeof productRows;
  const customerRow = customerRows.find((row) => row.label === customer.name);
  assert.ok(customerRow);
  assert.equal(customerRow.revenue, 1856.25);
  assert.equal(customerRow.cost, 600);
  assert.equal(customerRow.profit, 1256.25);

  const userRows = loadReport('by_user', today, returnDate) as typeof productRows;
  const userRow = userRows.find((row) => row.revenue === 1856.25);
  assert.ok(userRow);
  assert.equal(userRow.profit, 1256.25);

  const dailyRows = loadReport('daily', today, returnDate) as Array<{
    date: string; revenue: number; invoiceCount: number; returnCount: number;
  }>;
  const daily = dailyRows.find((row) => row.date === today);
  assert.ok(daily);
  assert.equal(daily.revenue, 3000);
  assert.equal(daily.invoiceCount, 1);
  assert.equal(daily.returnCount, 0);

  const returnDayRows = loadReport('daily', returnDate, returnDate) as Array<{
    date: string; revenue: number; invoiceCount: number; returnCount: number;
  }>;
  assert.deepEqual(returnDayRows, [{
    date: returnDate,
    revenue: -1143.75,
    invoiceCount: 0,
    returnCount: 1,
  }]);

  const cityRows = loadReport('by_city', returnDate, returnDate) as Array<{
    label: string; revenue: number; count: number; customers: number; margin: number;
  }>;
  assert.equal(cityRows.length, 1);
  assert.equal(cityRows[0].revenue, -1143.75);
  assert.equal(cityRows[0].count, 0);
  assert.equal(cityRows[0].customers, 1);
  assert.equal(cityRows[0].margin, 0);
});
