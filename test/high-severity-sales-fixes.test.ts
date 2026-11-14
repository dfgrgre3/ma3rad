import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { BranchAccessService } from '../src/services/domains/auth/BranchAccessService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { OrderService } from '../src/services/domains/sales/OrderService.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { evaluateManualDiscountPolicy } from '../src/services/domains/sales/discountPolicy.ts';
import { basePriceFromUnitPrice, toBaseQuantity } from '../src/utils/products/uom.ts';
import type { User } from '../src/types/auth/identity.ts';

const db = DatabaseManager.getInstance();

async function bootAdmin(): Promise<void> {
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
}

function q<T = any>(sql: string, params: any[] = []): T[] {
  return db.query<T>(sql, params);
}

function seedProduct(id: string, baseUnit: string, piecesPerBox: number, metersPerBox: number, costPrice: number, price: number, stock: number, warehouseId = 'wh_main'): void {
  db.run(
    `INSERT OR REPLACE INTO products (
       id, sku, barcode, name, category_id, brand_id, size, base_unit, sell_unit,
       pieces_per_box, meters_per_box, cost_price, selling_price_m2, is_active
     ) VALUES (?, ?, ?, ?, 'cat_floor', 'br_cleo', '60x60', ?, 'M2', ?, ?, ?, ?, 1)`,
    [id, `SKU-${id}`, `BAR-${id}`, `صنف ${id}`, baseUnit, piecesPerBox, metersPerBox, costPrice, price]
  );
  db.run(`DELETE FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`, [id, warehouseId]);
  db.run(`INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2) VALUES (?, ?, ?, ?, 0)`,
    [`stk_${id}`, warehouseId, id, stock]);
}

function seedCustomer(name: string, phone: string): string {
  return new CustomerService().createCustomer({
    name,
    phone,
    customerType: 'RETAIL',
    creditLimit: 100000,
  }).id;
}

test('discount policy uses a single gross-subtotal basis across all entry points', async () => {
  // 20% of gross line subtotal — requires approval
  const p1 = evaluateManualDiscountPolicy({ grossSubtotal: 1000, totalDiscount: 200, thresholdPercent: 10 });
  assert.equal(p1.percent, 20);
  assert.equal(p1.requiresApproval, true);

  // same discount spread across line + header discounts still uses gross base
  const lineDiscount = 50;
  const headerDiscount = 150;
  const gross = 1000;
  const _net = gross - lineDiscount; // 950
  const p2 = evaluateManualDiscountPolicy({ grossSubtotal: gross, totalDiscount: lineDiscount + headerDiscount, thresholdPercent: 10 });
  assert.equal(p2.requiresApproval, true);
  // the old net-base computation would have used 200/950 = 21.05% — still approval,
  // but the percentage itself must be reported against gross.
  assert.equal(p2.percent, 20);

  // below threshold → no approval
  const p3 = evaluateManualDiscountPolicy({ grossSubtotal: 1000, totalDiscount: 50, thresholdPercent: 10 });
  assert.equal(p3.requiresApproval, false);
});

test('POS box price conversion agrees with invoice service for all base units', async () => {
  for (const [baseUnit, _boxToBase] of [['M2', 1.44], ['PIECE', 12], ['BOX', 1]] as [string, number][]) {
    const product = {
      baseUnit,
      metersPerBox: baseUnit === 'M2' ? 1.44 : 1,
      piecesPerBox: baseUnit === 'PIECE' ? 12 : 4,
      customUnit: null,
    } as any;
    const boxPrice = 144;
    const viaService = basePriceFromUnitPrice(boxPrice, 'BOX', product);
    const viaUi = boxPrice / toBaseQuantity(1, 'BOX', product).quantity;
    assert.equal(round4(viaService), round4(viaUi), `base unit ${baseUnit} must agree`);
  }
});

test('a manual discount above threshold needs an approved DISCOUNT request and consumes it', async () => {
  await bootAdmin();
  const productId = 'prod_disc_test';
  seedProduct(productId, 'M2', 4, 1.44, 50, 100, 100);
  const customerId = seedCustomer('عميل خصم', '0100001001');

  const cashier: User = {
    id: 'usr_cashier_disc',
    username: 'cashier-disc',
    fullName: 'Cashier Disc',
    role: 'CASHIER',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  db.run(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, 'test', ?, 'CASHIER', 1)`,
    [cashier.id, cashier.username, cashier.fullName]);
  db.run(`INSERT OR REPLACE INTO users_branches (user_id, branch_id) VALUES (?, 'br_main')`, [cashier.id]);
  // grant the exact UI codes the service enforces
  for (const code of ['ui.sales.invoices.create', 'ui.sales.invoices.discount', 'ui.approvals.inbox.create']) {
    db.run(`INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect) VALUES (?, ?, 'GRANT')`, [cashier.id, code]);
  }
  PermissionService.invalidate(cashier);
  AuthService.setCurrentUser(cashier);
  new BranchAccessService().setCurrentBranchId('br_main', cashier);

  // 1. No approval yet → rejected.
  assert.throws(
    () => new SalesService().createSale({
      customerId,
      warehouseId: 'wh_main',
      items: [{ productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 100 }],
      paidAmount: 800,
      paymentType: 'CASH',
      discountAmount: 200,
    }),
    /اعتماد خصم/
  );

  // 2. Cashier raises the request.
  const approvalService = new ApprovalService();
  const request = approvalService.createRequest({
    requestType: 'DISCOUNT',
    title: 'خصم 20%',
    description: 'test',
    requestedValue: 200,
    currentValue: 1000,
    priority: 'HIGH',
    referenceType: 'POS',
    referenceId: customerId,
  });

  // 3. Manager approves.
  AuthService.login('admin', 'admin123');
  PermissionService.invalidate(AuthService.getCurrentUser()!);
  approvalService.decide(request.id, true);

  // 4. Cashier retries → succeeds via fallback lookup and consumes the approval.
  AuthService.setCurrentUser(cashier);
  PermissionService.invalidate(cashier);
  new BranchAccessService().setCurrentBranchId('br_main', cashier);
  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 100 }],
    paidAmount: 800,
    paymentType: 'CASH',
    discountAmount: 200,
  });
  assert.ok(invoice.id);
  const consumed = q<{ referenceType: string; referenceId: string }>(
    `SELECT reference_type AS referenceType, reference_id AS referenceId FROM approval_requests WHERE id = ?`, [request.id]
  )[0];
  assert.equal(consumed.referenceType, 'SALES_INVOICE');
  assert.equal(consumed.referenceId, invoice.id);

  // 5. Reuse must fail.
  assert.throws(
    () => new SalesService().createSale({
      customerId,
      warehouseId: 'wh_main',
      items: [{ productId, soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 100 }],
      paidAmount: 80,
      paymentType: 'CASH',
      discountAmount: 20,
    }),
    /اعتماد خصم/
  );
});

test('FIFO return restores the cost layer of the returned invoice line only', async () => {
  await bootAdmin();
  const productId = 'prod_fifo_line';
  seedProduct(productId, 'M2', 4, 1.44, 50, 100, 20);
  const customerId = seedCustomer('عميل fifo', '0100001002');
  db.run(`UPDATE system_settings SET value = 'FIFO' WHERE key = 'costingMethod'`);
  // two cost layers with different unit costs
  db.run(`DELETE FROM inventory_cost_layers WHERE product_id = ?`, [productId]);
  db.run(`INSERT INTO inventory_cost_layers (id, product_id, warehouse_id, source_type, received_at, quantity_received, quantity_remaining, unit_cost)
          VALUES ('l1', ?, 'wh_main', 'OPENING', '2026-01-01', 10, 10, 50)`, [productId]);
  db.run(`INSERT INTO inventory_cost_layers (id, product_id, warehouse_id, source_type, received_at, quantity_received, quantity_remaining, unit_cost)
          VALUES ('l2', ?, 'wh_main', 'OPENING', '2026-01-02', 10, 10, 70)`, [productId]);

  const invoice = new SalesService().createSale({
    customerId,
    warehouseId: 'wh_main',
    items: [
      { productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 100 },
      { productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 100 },
    ],
    paidAmount: 2000,
    paymentType: 'CASH',
  });
  assert.equal(invoice.items.length, 2);
  const line1 = invoice.items[0];
  const line2 = invoice.items[1];

  // layer1 consumed by line1, layer2 by line2
  const alloc1 = q<{ layerId: string }>(`SELECT layer_id AS layerId FROM inventory_cost_allocations WHERE invoice_item_id = ?`, [line1.id])[0];
  const alloc2 = q<{ layerId: string }>(`SELECT layer_id AS layerId FROM inventory_cost_allocations WHERE invoice_item_id = ?`, [line2.id])[0];
  assert.equal(alloc1.layerId, 'l1');
  assert.equal(alloc2.layerId, 'l2');

  // return 10 m² of the second line only
  const ret = new SalesService().returnSale(invoice.id, [{
    productId,
    invoiceItemId: line2.id,
    quantityM2: 10,
    boxesCount: 7,
    unitPrice: 100,
    unitCost: 70,
    reason: 'مرتجع سطر 2',
  }], false);
  assert.ok(ret.id);

  // layer1 untouched, layer2 fully restored
  const l1 = q<{ q: number }>(`SELECT quantity_remaining AS q FROM inventory_cost_layers WHERE id='l1'`)[0];
  const l2 = q<{ q: number }>(`SELECT quantity_remaining AS q FROM inventory_cost_layers WHERE id='l2'`)[0];
  assert.equal(l1.q, 0, 'layer1 must remain consumed by line1');
  assert.equal(l2.q, 10, 'layer2 must be restored by the line2 return');
});

test('ORDER_DEPOSIT_REFUND ledger entry is scoped to the order branch', async () => {
  await bootAdmin();
  // create a second branch + warehouse + register
  db.run(`INSERT OR REPLACE INTO branches (id, code, name, is_main, is_active, company_id)
          VALUES ('br_dep', 'DEP', 'فرع Arabs', 0, 1, 'cmp_main')`);
  db.run(`INSERT OR REPLACE INTO warehouses (id, code, name, branch_id, is_active) VALUES ('wh_dep', 'WH-DEP', 'مخزن Arabs', 'br_dep', 1)`);
  db.run(`INSERT OR REPLACE INTO cash_registers (id, name, current_balance, is_default, is_active, branch_id)
          VALUES ('cr_dep', 'صندوق Arabs', 0, 1, 1, 'br_dep')`);

  const productId = 'prod_dep';
  seedProduct(productId, 'M2', 4, 1.44, 50, 100, 100, 'wh_dep');
  const customerId = seedCustomer('عميل Arabs', '0100001003');

  // switch current branch to br_dep
  new BranchAccessService().setCurrentBranchId('br_dep', AuthService.getCurrentUser()!);

  const order = new OrderService().createOrder({
    customerId,
    warehouseId: 'wh_dep',
    items: [{ productId, quantityM2: 5, unitPrice: 100 }],
  });
  new OrderService().updateStatus(order.id, 'CONFIRMED');
  new OrderService().recordDeposit(order.id, 50, 'CASH', 'عربون', undefined, 'idemp-dep');

  const deposits = q<{ id: string }>(`SELECT id FROM order_deposits WHERE order_id = ?`, [order.id]);
  new OrderService().refundDeposit(deposits[0].id, 'رد Arabs');

  const entry = q<{ branchId: string | null; companyId: string | null }>(
    `SELECT branch_id AS branchId, company_id AS companyId FROM journal_entries WHERE reference_type = 'ORDER_DEPOSIT_REFUND' ORDER BY created_at DESC LIMIT 1`
  )[0];
  assert.equal(entry.branchId, 'br_dep', 'refund entry must be scoped to the order branch');
  assert.equal(entry.companyId, 'cmp_main');

  // restore current branch to main for other tests
  new BranchAccessService().setCurrentBranchId('br_main', AuthService.getCurrentUser()!);
});

function round4(n: number): number { return Math.round(n * 1e4) / 1e4; }