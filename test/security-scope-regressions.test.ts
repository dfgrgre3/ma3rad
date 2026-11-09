import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import { BranchAccessService } from '../src/services/auth/BranchAccessService.ts';
import { OrderService } from '../src/services/sales/OrderService.ts';
import { ProductService } from '../src/services/products/ProductService.ts';
import { ReservationService } from '../src/services/sales/ReservationService.ts';
import type { User } from '../src/types/auth/identity.ts';

test('reservation pages keep sales and inventory permission domains independent', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/pages/sales/reservations/ReservationsDepositPage.tsx'), 'utf8');
  const routes = fs.readFileSync(path.join(process.cwd(), 'src/router/routesList.tsx'), 'utf8');
  assert.match(page, /canViewPage = mode === 'sales' \? canViewOrdersDeposits : canViewReservations/);
  assert.match(page, /if \(mode === 'inventory'\)[\s\S]*setOrders\(\[\]\)/);
  assert.match(page, /else \{[\s\S]*setReservations\(\[\]\)/);
  assert.match(page, /canCreate=\{canManageOrdersDeposits\}/);
  assert.match(page, /canAdjust=\{canAdjustInventory\}/);
  assert.match(routes, /sales\/reservations', element: <Navigate to="\/sales\/orders-deposits"/);
  assert.match(routes, /inventory\/reservations', element: <Navigate to="\/inventory\/stock-reservations"/);
});

const user: User = {
  id: 'usr_scope_regression', username: 'scope-regression', fullName: 'Scope Regression User',
  role: 'SALES', isActive: true, createdAt: '', updatedAt: '',
};

test('branch scope protects orders, reservations, and product stock aggregates', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
    VALUES (?, ?, 'test', ?, 'SALES', 1, 'ASSIGNED')`, [user.id, user.username, user.fullName]);
  db.run(`INSERT OR REPLACE INTO branches (id, code, name, is_main, is_active, company_id)
    VALUES ('br_reg_a', 'REG-A', 'Regression A', 0, 1, 'cmp_main'),
           ('br_reg_b', 'REG-B', 'Regression B', 0, 1, 'cmp_main')`);
  db.run(`INSERT OR REPLACE INTO warehouses (id, name, code, branch_id, company_id, is_active)
    VALUES ('wh_reg_a', 'Regression A Warehouse', 'REG-WA', 'br_reg_a', 'cmp_main', 1),
           ('wh_reg_b', 'Regression B Warehouse', 'REG-WB', 'br_reg_b', 'cmp_main', 1)`);
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, 'br_reg_a')`, [user.id]);
  db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES
    (?, 'sales.view', 'GRANT'), (?, 'sales.approve', 'GRANT'), (?, 'inventory.view', 'GRANT'),
    (?, 'inventory.adjust', 'GRANT'), (?, 'products.view', 'GRANT')`,
    [user.id, user.id, user.id, user.id, user.id]);
  AuthService.setCurrentUser(user);
  PermissionService.invalidate(user);
  new BranchAccessService().setCurrentBranchId('br_reg_a', user);

  db.run(`INSERT OR REPLACE INTO customers (id, code, name, phone, customer_type, company_id)
    VALUES ('cus_regression', 'REG-C', 'Regression Customer', '999', 'RETAIL', 'cmp_main')`);
  db.run(`INSERT OR REPLACE INTO orders
    (id, order_number, date, customer_id, branch_id, warehouse_id, subtotal, total_amount,
     paid_amount, remaining_amount, status, created_by)
    VALUES ('ord_reg_a', 'REG-ORD-A', '2026-01-01', 'cus_regression', 'br_reg_a', 'wh_reg_a', 10, 10, 0, 10, 'PENDING', ?),
           ('ord_reg_b', 'REG-ORD-B', '2026-01-01', 'cus_regression', 'br_reg_b', 'wh_reg_b', 20, 20, 0, 20, 'PENDING', ?)`,
    [user.id, user.id]);
  const orders = new OrderService();
  assert.deepEqual(orders.getOrders().map((order) => order.id), ['ord_reg_a']);
  assert.equal(orders.getOrder('ord_reg_b'), null);
  assert.throws(() => orders.updateStatus('ord_reg_b', 'CONFIRMED'));

  const products = new ProductService();
  const statsBefore = products.getProductStats();
  db.run(`INSERT OR REPLACE INTO products
    (id, sku, barcode, name, category_id, brand_id, grade, size, base_unit, sell_unit,
     pieces_per_box, meters_per_box, cost_price, selling_price_m2, min_stock_level, is_active, company_id)
    VALUES ('prod_regression', 'REG-P', 'REG-P', 'Regression Product', 'cat_floor', 'br_cleo',
            'GRADE_1', '60x60', 'M2', 'M2', 1, 1, 10, 20, 5, 1, 'cmp_main')`);
  db.run(`INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
    VALUES ('ws_reg_a', 'wh_reg_a', 'prod_regression', 4, 0),
           ('ws_reg_b', 'wh_reg_b', 'prod_regression', 9, 0)`);
  db.run(`INSERT OR REPLACE INTO stock_reservations
    (id, product_id, warehouse_id, quantity_m2, reference_type, status, created_by)
    VALUES ('res_reg_a', 'prod_regression', 'wh_reg_a', 1, 'MANUAL', 'ACTIVE', ?),
           ('res_reg_b', 'prod_regression', 'wh_reg_b', 1, 'MANUAL', 'ACTIVE', ?)`, [user.id, user.id]);
  const reservations = new ReservationService();
  assert.deepEqual(reservations.getReservations().map((row) => row.id), ['res_reg_a']);
  assert.throws(() => reservations.getAvailability('prod_regression', 'wh_reg_b'));
  assert.throws(() => reservations.releaseReservation('res_reg_b'));

  const page = products.getProductsPage('', undefined, undefined, 1, 100, { status: 'all', includeInactive: true });
  assert.equal(page.items.find((item) => item.id === 'prod_regression')?.totalStockM2, 4);
  const statsAfter = products.getProductStats();
  assert.equal(Number((statsAfter.totalStockM2 - statsBefore.totalStockM2).toFixed(2)), 4);
  AuthService.logout();
});
