import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { SupplierService } from '../src/services/domains/suppliers/SupplierService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { PurchaseService } from '../src/services/domains/purchases/PurchaseService.ts';
import { InventoryService } from '../src/services/domains/inventory/InventoryService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';
import type { User } from '../src/types/auth/identity.ts';

/**
 * End-to-end accounting audit: each commercial operation must produce the
 * operational records (documents, stock, party balances) AND the matching
 * journal entries — not just a service return value.
 */

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  const user = AuthService.login('admin', 'admin123');
  user.mustChangePassword = false;
  user.securityKeySetupRequired = false;
  AuthService.setCurrentUser(user);
  const adminId = DatabaseManager.getInstance().query<{ id: string }>(
    `SELECT id FROM users WHERE username = 'admin'`
  )[0].id;
  const openShift = DatabaseManager.getInstance().query<{ id: string }>(
    `SELECT id FROM cash_shifts WHERE user_id = ? AND status = 'OPEN' LIMIT 1`, [adminId]
  )[0];
  if (!openShift) new CashierService().openShift('cr_main', adminId, 0);
  return manager;
}

function q<T = any>(sql: string, params: any[] = []): T[] {
  return DatabaseManager.getInstance().query<T>(sql, params);
}

function one<T = any>(sql: string, params: any[] = []): T {
  return q<T>(sql, params)[0];
}

function seedProduct(input: {
  id: string; stock: number; cost?: number; price?: number; warehouseId?: string;
}): void {
  q(
    `INSERT OR REPLACE INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       min_selling_price_m2, is_active
     ) VALUES (?, 'CERAMIC', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
       'M2', 'M2', 4, 1.44, ?, ?, 0, 1)`,
    [input.id, `SKU-${input.id}`, `BAR-${input.id}`, `صنف E2E ${input.id}`, input.cost ?? 100, input.price ?? 300]
  );
  const warehouseId = input.warehouseId || 'wh_main';
  q(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, ?, ?, ?, 0)`,
    [`stk_${input.id}_${warehouseId}`, warehouseId, input.id, input.stock]
  );
  if (input.stock > 0) {
    // Keep the movement ledger and FIFO layers consistent with the seeded
    // balance so the stock audit sees a clean pair, like real operations do.
    q(
      `INSERT INTO inventory_transactions (
         id, transaction_number, type, product_id, warehouse_id, quantity_m2, boxes_count,
         unit_cost, total_cost, reference_type, reference_id, notes, performed_by
       ) VALUES (?, ?, 'OPENING_BALANCE', ?, ?, ?, 0, ?, ?, 'SEED', ?, 'بذرة اختبار E2E', 'usr_admin')`,
      [`tx_open_${input.id}`, `TX-OPEN-${input.id}`, input.id, warehouseId,
       input.stock, input.cost ?? 100, input.stock * (input.cost ?? 100), `seed_${input.id}`]
    );
    q(
      `INSERT INTO inventory_cost_layers (
         id, product_id, warehouse_id, source_type, source_id, received_at,
         quantity_received, quantity_remaining, unit_cost, is_estimated
       ) VALUES (?, ?, ?, 'SEED', ?, '2026-01-01', ?, ?, ?, 0)`,
      [`icl_seed_${input.id}`, input.id, warehouseId, `seed_${input.id}`,
       input.stock, input.stock, input.cost ?? 100]
    );
  }
}

function ensureWarehouse(id: string, code: string, name: string): void {
  q(`INSERT OR IGNORE INTO warehouses (id, code, name, branch_id, is_active)
     VALUES (?, ?, ?, 'br_main', 1)`, [id, code, name]);
}

function stockOf(productId: string, warehouseId = 'wh_main'): number {
  return Number(one<{ quantity: number }>(
    `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
    [productId, warehouseId]
  )?.quantity || 0);
}

function assertLedgerDocument(referenceType: string, referenceId: string): void {
  const entries = q<{ id: string; totalDebit: number; totalCredit: number }>(
    `SELECT id, total_debit AS totalDebit, total_credit AS totalCredit
     FROM journal_entries WHERE reference_type = ? AND reference_id = ?`,
    [referenceType, referenceId]
  );
  assert.ok(entries.length > 0, `missing ledger document ${referenceType}/${referenceId}`);
  for (const entry of entries) {
    const lines = one<{ debit: number; credit: number; count: number }>(
      `SELECT COALESCE(SUM(debit), 0) AS debit, COALESCE(SUM(credit), 0) AS credit, COUNT(*) AS count
       FROM journal_entry_lines WHERE entry_id = ?`,
      [entry.id]
    );
    assert.ok(lines.count >= 2, `ledger entry ${entry.id} has fewer than two lines`);
    assert.ok(Math.abs(lines.debit - lines.credit) < 0.01, `ledger entry ${entry.id} is unbalanced`);
    assert.ok(Math.abs(lines.debit - entry.totalDebit) < 0.01, `ledger entry ${entry.id} header debit drifted`);
    assert.ok(Math.abs(lines.credit - entry.totalCredit) < 0.01, `ledger entry ${entry.id} header credit drifted`);
  }
}

function ledgerDebit(referenceType: string, referenceId: string, accountCode: string): number {
  return Number(one<{ amount: number }>(
    `SELECT COALESCE(SUM(l.debit), 0) AS amount
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE e.reference_type = ? AND e.reference_id = ? AND a.code = ?`,
    [referenceType, referenceId, accountCode]
  )?.amount || 0);
}

function ledgerCredit(referenceType: string, referenceId: string, accountCode: string): number {
  return Number(one<{ amount: number }>(
    `SELECT COALESCE(SUM(l.credit), 0) AS amount
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.entry_id
     JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE e.reference_type = ? AND e.reference_id = ? AND a.code = ?`,
    [referenceType, referenceId, accountCode]
  )?.amount || 0);
}

// ── 1) Cash sale: stock out, cash in, revenue + COGS posted ────────────────
test('e2e cash sale posts stock, cash, revenue and COGS', async () => {
  await boot();
  const productId = 'prod_e2e_cash';
  seedProduct({ id: productId, stock: 50, cost: 100, price: 300 });
  const customer = new CustomerService().createCustomer({
    name: 'عميل نقدي E2E', phone: '01000000001', customerType: 'RETAIL', creditLimit: 0,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 300 }],
    paidAmount: 3000, paymentType: 'CASH',
  });

  assert.equal(invoice.paymentStatus, 'PAID');
  assert.equal(stockOf(productId), 40);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM customers WHERE id = ?`, [customer.id]).balance, 0);

  assertLedgerDocument('SALES_INVOICE', invoice.id);
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1101'), 3000, 'cash debit equals amount paid');
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1103'), 0, 'no receivable on a fully paid sale');
  assert.equal(ledgerCredit('SALES_INVOICE', invoice.id, '4101'), 3000, 'revenue credited in full');
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '5101'), 1000, 'COGS debited at FIFO/product cost');
  assert.equal(ledgerCredit('SALES_INVOICE', invoice.id, '1104'), 1000, 'inventory asset relieved by COGS');
});

// ── 2) Credit sale: receivable + customer debt, no cash ────────────────────
test('e2e credit sale posts receivable and customer balance', async () => {
  await boot();
  const productId = 'prod_e2e_credit';
  seedProduct({ id: productId, stock: 30, cost: 100, price: 300 });
  const customer = new CustomerService().createCustomer({
    name: 'عميل آجل E2E', phone: '01000000002', customerType: 'RETAIL', creditLimit: 100000,
  });
  const invoice = new SalesService().createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 5, boxesCount: 4, piecesCount: 20, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });

  assert.equal(invoice.remainingAmount, 1500);
  assert.equal(stockOf(productId), 25);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM customers WHERE id = ?`, [customer.id]).balance, 1500);

  assertLedgerDocument('SALES_INVOICE', invoice.id);
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1103'), 1500, 'AR debit equals unpaid invoice');
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1101'), 0, 'credit sale must not touch cash');
  assert.equal(ledgerCredit('SALES_INVOICE', invoice.id, '4101'), 1500);
});

// ── 3) Sales return on a fully paid invoice: stock back, cash refund ────────
test('e2e sales return restores stock and posts reversal', async () => {
  await boot();
  const productId = 'prod_e2e_return';
  seedProduct({ id: productId, stock: 20, cost: 100, price: 300 });
  const customer = new CustomerService().createCustomer({
    name: 'عميل مرتجع E2E', phone: '01000000003', customerType: 'RETAIL', creditLimit: 0,
  });
  const sales = new SalesService();
  const invoice = sales.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 28, unitPrice: 300 }],
    paidAmount: 3000, paymentType: 'CASH',
  });
  assert.equal(stockOf(productId), 10);

  const invoiceItemId = one<{ id: string }>(
    `SELECT id FROM sales_invoice_items WHERE invoice_id = ? AND product_id = ? LIMIT 1`,
    [invoice.id, productId]
  ).id;
  const saleReturn = sales.returnSale(invoice.id, [{
    productId, invoiceItemId, quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'E2E مرتجع',
  }], true);

  assert.equal(saleReturn.totalAmount, 1200);
  assert.equal(saleReturn.refundedAmount, 1200, 'fully paid invoice refunds fully in cash');
  assert.equal(stockOf(productId), 14);

  assertLedgerDocument('SALES_RETURN', saleReturn.id);
  assert.equal(ledgerDebit('SALES_RETURN', saleReturn.id, '4101'), 1200, 'return debits revenue back');
  assert.equal(ledgerCredit('SALES_RETURN', saleReturn.id, '1101'), 1200, 'cash refund credited');
  assert.equal(ledgerCredit('SALES_RETURN', saleReturn.id, '1103'), 0, 'no AR reduction on a paid invoice');
});

// ── 4) Purchase invoice: supplier debt, stock in, cost layer ────────────────
test('e2e purchase invoice posts supplier payable, stock and cost layer', async () => {
  await boot();
  const productId = 'prod_e2e_purchase';
  seedProduct({ id: productId, stock: 0, cost: 80, price: 200 });
  const supplier = new SupplierService().createSupplier({
    name: 'مورد E2E', phone: '01000000004', paymentTermsDays: 30,
  } as any);
  const purchase = new PurchaseService().createPurchase({
    supplierId: supplier.id, warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 20, boxesCount: 14, unitCost: 90 }],
    paidAmount: 0, paymentType: 'CREDIT',
  } as any);

  assert.equal(purchase.totalAmount, 1800);
  assert.equal(stockOf(productId), 20);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM suppliers WHERE id = ?`, [supplier.id]).balance, 1800);
  assert.ok(one(`SELECT id FROM inventory_cost_layers WHERE product_id = ? AND warehouse_id = 'wh_main'`, [productId]), 'purchase must create a FIFO layer');

  assertLedgerDocument('PURCHASE_INVOICE', purchase.id);
  assert.equal(ledgerDebit('PURCHASE_INVOICE', purchase.id, '1104'), 1800, 'inventory debited at purchase cost');
  assert.equal(ledgerCredit('PURCHASE_INVOICE', purchase.id, '2101'), 1800, 'AP credited in full');
});

// ── 5) Supplier payment: cash out, payable relieved ─────────────────────────
test('e2e supplier payment relieves payable and posts balanced entry', async () => {
  await boot();
  const productId = 'prod_e2e_pay';
  seedProduct({ id: productId, stock: 0, cost: 80, price: 200 });
  const suppliers = new SupplierService();
  const supplier = suppliers.createSupplier({
    name: 'مورد سداد E2E', phone: '01000000005', paymentTermsDays: 0,
  } as any);
  const purchase = new PurchaseService().createPurchase({
    supplierId: supplier.id, warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 10, boxesCount: 7, unitCost: 100 }],
    paidAmount: 0, paymentType: 'CREDIT',
  } as any);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM suppliers WHERE id = ?`, [supplier.id]).balance, 1000);

  const payment = suppliers.recordPayment(supplier.id, 400, 'CASH', 'cr_main', 'سداد E2E');

  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM suppliers WHERE id = ?`, [supplier.id]).balance, 600);
  assertLedgerDocument('SUPPLIER_PAYMENT', payment.id);
  assert.equal(ledgerDebit('SUPPLIER_PAYMENT', payment.id, '2101'), 400, 'payment debits AP');
  assert.equal(ledgerCredit('SUPPLIER_PAYMENT', payment.id, '1101'), 400, 'cash payment credits cash');
});

// ── 6) Warehouse transfer: stock moves source -> transit -> destination ─────
test('e2e warehouse transfer moves stock with cost layers intact', async () => {
  await boot();
  const productId = 'prod_e2e_transfer';
  const srcId = 'wh_e2e_src';
  const dstId = 'wh_e2e_dst';
  ensureWarehouse(srcId, 'WH-E2E-SRC', 'مصدر E2E');
  ensureWarehouse(dstId, 'WH-E2E-DST', 'وجهة E2E');
  seedProduct({ id: productId, stock: 30, cost: 100, price: 300, warehouseId: srcId });

  const inventory = new InventoryService();
  const transferId = inventory.createTransferRequest({
    fromWarehouseId: srcId, toWarehouseId: dstId,
    items: [{ productId, quantityM2: 12 }],
  });
  // Creator cannot approve own transfer: second admin approves.
  const approver: User = {
    id: 'usr_e2e_approver', username: 'e2e-approver', fullName: 'E2E Approver',
    role: 'ADMIN', isActive: true, createdAt: '', updatedAt: '',
  };
  q(`INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES (?, ?, 'test', ?, 'ADMIN', 1)`, [approver.id, approver.username, approver.fullName]);
  AuthService.setCurrentUser(approver);
  PermissionService.invalidate(approver);
  inventory.approveTransfer(transferId);
  inventory.prepareTransfer(transferId);
  inventory.dispatchTransfer(transferId, `e2e-dispatch-${productId}`);
  const transitId = one<{ transitWarehouseId: string }>(
    `SELECT transit_warehouse_id AS transitWarehouseId FROM stock_transfers WHERE id = ?`, [transferId]
  ).transitWarehouseId;

  assert.equal(stockOf(productId, srcId), 18);
  assert.equal(stockOf(productId, transitId), 12);
  assert.equal(stockOf(productId, dstId), 0);

  const itemId = inventory.getTransferItems(transferId)[0].id;
  inventory.receiveTransfer(transferId, [{ itemId, receivedM2: 12 }], { idempotencyKey: `e2e-recv-${productId}` });

  assert.equal(stockOf(productId, transitId), 0);
  assert.equal(stockOf(productId, dstId), 12);
  const movements = q<{ type: string; quantity: number }>(
    `SELECT type, quantity_m2 AS quantity FROM inventory_transactions
     WHERE reference_id = ? AND product_id = ?`, [transferId, productId]
  );
  assert.ok(movements.some((m) => m.type === 'TRANSFER_OUT' && m.quantity === -12), 'source must post TRANSFER_OUT');
  assert.ok(movements.some((m) => m.type === 'TRANSFER_IN' && m.quantity === 12), 'destination must post TRANSFER_IN');
});

// ── 7) Inventory adjustment: variance posts to inventory + expense accounts ─
test('e2e inventory adjustment posts ADJUSTMENT_ADD and balanced ledger', async () => {
  await boot();
  const productId = 'prod_e2e_adjust';
  seedProduct({ id: productId, stock: 10, cost: 100, price: 300 });
  const inventory = new InventoryService();

  inventory.adjustStock(productId, 'wh_main', 15, 'زيادة جرد E2E');

  assert.equal(stockOf(productId), 15);
  const tx = one<{ id: string; type: string; quantity: number; referenceType: string }>(
    `SELECT id, type, quantity_m2 AS quantity, reference_type AS referenceType
     FROM inventory_transactions WHERE product_id = ? AND warehouse_id = 'wh_main'
     ORDER BY created_at DESC, rowid DESC LIMIT 1`, [productId]
  );
  assert.equal(tx.type, 'ADJUSTMENT_ADD');
  assert.equal(tx.quantity, 5);
  assert.equal(tx.referenceType, 'ADJUSTMENT');

  const adjustment = one<{ id: string }>(
    `SELECT id FROM stock_adjustments WHERE warehouse_id = 'wh_main' ORDER BY created_at DESC, rowid DESC LIMIT 1`
  );
  assert.ok(adjustment);
  assertLedgerDocument('INVENTORY_ADJUSTMENT', adjustment.id);
  assert.equal(ledgerDebit('INVENTORY_ADJUSTMENT', adjustment.id, '1104'), 500, 'added stock debits inventory at cost');
  assert.equal(ledgerCredit('INVENTORY_ADJUSTMENT', adjustment.id, '5201'), 500, 'variance credits adjustment expense');
});

// ── Cross-check: the new audit service agrees with the flows above ──────────
test('e2e stock balance audit reports clean pairs after real operations', async () => {
  const { StockBalanceAuditService } = await import('../src/services/domains/inventory/StockBalanceAuditService.ts');
  const report = new StockBalanceAuditService().runAudit({ warehouseId: 'wh_main' });
  const drifted = report.rows.filter((r) => r.status === 'DISCREPANCY');
  // Products touched by sales/purchases above keep warehouse_stock consistent
  // with the movement ledger; any discrepancy must be a seeded-only artifact.
  for (const row of drifted.filter((r) => String(r.productId).includes('prod_e2e'))) {
    const stockCheck = row.checks.find((c) => c.key === 'STOCK_VS_LEDGER');
    assert.fail(`E2E product ${row.productId} drifted: book=${stockCheck?.book} ledger=${stockCheck?.ledger}`);
  }
});