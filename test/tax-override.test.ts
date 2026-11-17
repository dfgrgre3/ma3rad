import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import type { User } from '../src/types/auth/identity.ts';

const db = DatabaseManager.getInstance();

async function boot(): Promise<void> {
  await db.initialize();
  await PermissionService.seed();
  const user = AuthService.login('admin', 'admin123');
  user.mustChangePassword = false;
  user.securityKeySetupRequired = false;
  AuthService.setCurrentUser(user);
}

function seedSaleFixture(): { productId: string; customerId: string } {
  const productId = 'prod_tax_override';
  db.run(
    `INSERT OR REPLACE INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       min_selling_price_m2, is_active
     ) VALUES (?, 'CERAMIC', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
       'M2', 'M2', 4, 1.44, 100, 300, 0, 1)`,
    [productId, `SKU-${productId}`, `BAR-${productId}`, `صنف ضريبة ${productId}`]
  );
  db.run(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, 'wh_main', ?, 50, 0)`,
    [`stk_${productId}`, productId]
  );
  const customer = new CustomerService().createCustomer({
    name: 'عميل ضريبة E2E', phone: '01000000009', customerType: 'RETAIL', creditLimit: 100000,
  });
  return { productId, customerId: customer.id };
}

function saleDto(productId: string, customerId: string, taxPercentage?: number) {
  return {
    customerId, warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 2, boxesCount: 1, piecesCount: 8, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
    ...(taxPercentage === undefined ? {} : { taxPercentage }),
  } as any;
}

test('tax rate must match settings unless the actor holds sales.tax.override', async () => {
  await boot();
  const { productId, customerId } = seedSaleFixture();
  const sales = new SalesService();
  const configured = Number((await import('../src/services/domains/config/SettingsService.ts'))
    .SettingsService.getSettings().defaultTaxPercentage ?? 0);
  const deviatingRate = configured === 0 ? 14 : 0;

  // Admin bypasses granular grants: an explicit deviating rate is accepted and
  // the backend still computes taxAmount itself.
  const adminInvoice = sales.createSale(saleDto(productId, customerId, deviatingRate));
  const expectedTax = Math.round(600 * deviatingRate) / 100;
  assert.equal(adminInvoice.taxAmount, expectedTax);
  assert.equal(adminInvoice.taxPercentage, deviatingRate);

  // A cashier without sales.tax.override cannot sell at a non-default rate.
  const cashier: User = {
    id: 'usr_tax_cashier', username: 'tax-cashier', fullName: 'Tax Cashier',
    role: 'CASHIER', isActive: true, createdAt: '', updatedAt: '',
    mustChangePassword: false, securityKeySetupRequired: false,
  } as User;
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES (?, ?, 'test', ?, 'CASHIER', 1, 'ASSIGNED')`,
    [cashier.id, cashier.username, cashier.fullName]
  );
  db.run(`INSERT OR IGNORE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [cashier.id]);
  AuthService.setCurrentUser(cashier);
  PermissionService.invalidate(cashier);

  assert.throws(
    () => sales.createSale(saleDto(productId, customerId, deviatingRate)),
    /الضريبة|sales\.tax\.override/,
    'deviating tax rate must be rejected for a cashier'
  );

  // The configured default (and an omitted rate) remain allowed.
  const okInvoice = sales.createSale(saleDto(productId, customerId, configured));
  assert.equal(okInvoice.taxAmount, Math.round(600 * configured) / 100);
  const omittedInvoice = sales.createSale(saleDto(productId, customerId));
  assert.equal(omittedInvoice.taxPercentage, configured, 'omitted rate falls back to the configured default');
});
