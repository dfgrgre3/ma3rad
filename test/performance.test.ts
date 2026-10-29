import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { ProductService } from '../src/services/ProductService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { FinancialStatementsService } from '../src/services/FinancialStatementsService.ts';
import type { User } from '../src/types/identity.ts';

const admin: User = {
  id: 'usr_perf_admin',
  username: 'perf-admin',
  fullName: 'Perf Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

test('bulk product insert and lookup stays within a reasonable time', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_perf_admin', 'perf-admin', 'test', 'Perf Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const service = new ProductService();
  const start = Date.now();
  for (let i = 0; i < 500; i++) {
    service.createProduct({
      sku: `PERF-SKU-${i}`,
      barcode: `PERF-BAR-${i}`,
      name: `Performance Product ${i}`,
      categoryId: 'cat_floor',
      brandId: 'br_cleo',
    } as any);
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 30000, `500 inserts took ${elapsed}ms, expected < 30000ms`);

  const lookupStart = Date.now();
  const products = service.getAllProducts();
  const lookupElapsed = Date.now() - lookupStart;
  assert.ok(products.length >= 500);
  assert.ok(lookupElapsed < 5000, `lookup took ${lookupElapsed}ms, expected < 5000ms`);
});

test('realistic catalogue and invoice volume stays responsive', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_perf_admin', 'perf-admin', 'test', 'Perf Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const PRODUCTS = 3000;
  const CUSTOMERS = 1200;
  const INVOICES = 5000;

  const seedStart = Date.now();
  db.executeTransaction((tx) => {
    for (let i = 0; i < PRODUCTS; i++) {
      tx.run(
        `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
           base_unit, sell_unit, cost_price, selling_price_m2, is_active)
         VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60', 'M2', 'M2', 100, 150, 1)`,
        [`perf_p_${i}`, `PERF-P-${i}`, `PERF-PB-${i}`, `Bulk Product ${i}`]
      );
    }
    for (let i = 0; i < CUSTOMERS; i++) {
      tx.run(
        `INSERT INTO customers (id, code, name, phone, current_balance)
         VALUES (?, ?, ?, ?, 0)`,
        [`perf_c_${i}`, `PERF-C-${i}`, `Bulk Customer ${i}`, `0100${String(i).padStart(7, '0')}`]
      );
    }
    for (let i = 0; i < INVOICES; i++) {
      tx.run(
        `INSERT INTO sales_invoices (id, invoice_number, date, customer_id, warehouse_id, branch_id,
           subtotal, total_amount, paid_amount, remaining_amount, created_by)
         VALUES (?, ?, ?, ?, 'wh_main', 'br_main', 100, 100, 0, 100, 'usr_perf_admin')`,
        [
          `perf_i_${i}`,
          `PERF-I-${i}`,
          `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          `perf_c_${i % CUSTOMERS}`,
        ]
      );
    }
  });
  const seedElapsed = Date.now() - seedStart;
  assert.ok(seedElapsed < 120000, `seeding ${PRODUCTS} products / ${INVOICES} invoices took ${seedElapsed}ms`);

  const listStart = Date.now();
  const products = new ProductService().getAllProducts();
  const listElapsed = Date.now() - listStart;
  assert.ok(products.length >= PRODUCTS);
  assert.ok(listElapsed < 5000, `product list of ${products.length} rows took ${listElapsed}ms`);

  const reportStart = Date.now();
  const totals = db.query<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
     FROM sales_invoices
     WHERE date BETWEEN '2026-01-01' AND '2026-12-31'`
  )[0];
  const reportElapsed = Date.now() - reportStart;
  assert.equal(Number(totals.count), INVOICES);
  assert.equal(Number(totals.total), INVOICES * 100);
  assert.ok(reportElapsed < 3000, `annual sales aggregate took ${reportElapsed}ms`);

  // Receivables aging joins every invoice against its allocations and returns,
  // so it is the heaviest realistic read the dashboard performs.
  const agingStart = Date.now();
  const aging = new FinancialStatementsService().getCustomerAging('2026-12-31');
  const agingElapsed = Date.now() - agingStart;
  assert.ok(aging.rows.length > 0, 'aging must return the outstanding customers');
  assert.ok(agingElapsed < 15000, `customer aging over ${INVOICES} invoices took ${agingElapsed}ms`);

  const invoiceListStart = Date.now();
  const invoices = new SalesService().getAllInvoices();
  const invoiceListElapsed = Date.now() - invoiceListStart;
  assert.ok(invoices.length >= INVOICES);
  assert.ok(invoiceListElapsed < 10000, `invoice list of ${invoices.length} rows took ${invoiceListElapsed}ms`);
});