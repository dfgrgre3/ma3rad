import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { CustomerSupplyService } from '../src/services/CustomerSupplyService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { QuotationService } from '../src/services/QuotationService.ts';
import { OrderService } from '../src/services/OrderService.ts';
import { runMigrations } from '../src/database/migrations.ts';
import { postLedgerEntry } from '../src/database/ledger.ts';
import { localDateString } from '../src/utils/date.ts';
import { InventoryCostingService } from '../src/services/InventoryCostingService.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

test('database initialization enables SQLite foreign key enforcement', async () => {
  const manager = DatabaseManager.getInstance();
  const db = await manager.initialize();
  assert.equal(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0], 1);
  assert.equal(q("SELECT id FROM schema_migrations WHERE id = '014_users_custom_roles'").length, 1);
  manager.exportDatabaseBinary();
  assert.equal(db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0], 1);
  assert.throws(() => {
    db.run(
      'INSERT INTO user_permissions (user_id, permission_code) VALUES (?, ?)',
      ['missing_user', 'test.permission']
    );
  }, /FOREIGN KEY constraint failed/);
});

test('accounting policy migration reclassifications balance and reruns safely', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  const db = manager.getDatabase();
  const actorId = q('SELECT id FROM users ORDER BY created_at,id LIMIT 1')[0].id;
  const assetId = 'fa_policy_migration_test';
  const adjustmentId = 'adj_policy_migration_test';
  const date = localDateString();

  db.run(
    `INSERT INTO fixed_assets
       (id,code,name,purchase_date,purchase_cost,salvage_value,useful_life_years,status)
     VALUES (?,?,?,?,?,0,5,'ACTIVE')`,
    [assetId, 'FA-POLICY-TEST', 'Migration policy test asset', date, 500]
  );
  postLedgerEntry(db, {
    date,
    description: 'Legacy fixed asset acquisition',
    referenceType: 'ASSET_ACQUISITION',
    referenceId: assetId,
    createdBy: actorId,
    lines: [
      { accountCode: '1601', debit: 500, credit: 0 },
      { accountCode: '3102', debit: 0, credit: 500 },
    ],
  });
  db.run(
    `INSERT INTO stock_adjustments
       (id,adjustment_number,warehouse_id,date,adjustment_type,reason,status,total_quantity_m2,total_value,created_by)
     VALUES (?,?,?,?,'ADD',?,'POSTED',?, ?,?)`,
    [adjustmentId, 'ADJ-POLICY-TEST', 'wh_main', date, 'Migration policy test', 1, 100, actorId]
  );
  postLedgerEntry(db, {
    date,
    description: 'Legacy inventory adjustment',
    referenceType: 'INVENTORY_ADJUSTMENT',
    referenceId: adjustmentId,
    createdBy: actorId,
    lines: [
      { accountCode: '1104', debit: 100, credit: 0 },
      { accountCode: '4190', debit: 0, credit: 100 },
    ],
  });

  db.run(`DELETE FROM schema_migrations WHERE id='036_apply_accounting_policy_choices'`);
  const rerun = runMigrations(db);
  assert.ok(rerun.applied.includes('036_apply_accounting_policy_choices'));
  for (const reference of [
    ['ASSET_CLEARING_POLICY', assetId],
    ['INVENTORY_ADJUSTMENT_POLICY', adjustmentId],
  ]) {
    const entry = q(
      'SELECT total_debit,total_credit FROM journal_entries WHERE reference_type=? AND reference_id=?',
      reference
    )[0];
    assert.ok(entry);
    assert.equal(entry.totalDebit, entry.totalCredit);
  }
  assert.equal(
    q(`SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type='ASSET_CLEARING_POLICY' AND reference_id=?`, [assetId])[0].count,
    1
  );
  assert.equal(
    q(`SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type='INVENTORY_ADJUSTMENT_POLICY' AND reference_id=?`, [adjustmentId])[0].count,
    1
  );

  const secondRun = runMigrations(db);
  assert.ok(secondRun.skipped.includes('036_apply_accounting_policy_choices'));
  assert.ok(secondRun.skipped.includes('037_remove_network_sync'));
});

test('FIFO sales post layer cost and a sales return restores the original lot', async () => {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const db = manager;
  const productId = 'prod_fifo_sale_test';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,
    pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [productId,'FIFO-S','FIFO-S','FIFO sale test','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,15,100,90,0,0]);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2) VALUES (?,?,?,?,0)`,
    ['stk_fifo_sale_test','wh_main',productId,10]);
  db.run(`INSERT INTO product_batches (id,product_id,warehouse_id,batch_number,tone_shade,caliber,cost_price,quantity_m2,quantity_remaining_m2)
    VALUES ('pb_fifo_first',?,'wh_main','LOT-A','TONE-A','0',10,4,4),
           ('pb_fifo_second',?,'wh_main','LOT-B','TONE-B','0',20,6,6)`, [productId, productId]);
  InventoryCostingService.addLayer(db,{productId,warehouseId:'wh_main',sourceType:'TEST',sourceId:'lot1',date:'2026-01-01',quantity:5,unitCost:10});
  InventoryCostingService.addLayer(db,{productId,warehouseId:'wh_main',sourceType:'TEST',sourceId:'lot2',date:'2026-02-01',quantity:5,unitCost:20});
  db.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','FIFO')`);
  const cashBefore = q(`SELECT current_balance AS balance FROM cash_registers WHERE id='cr_main'`)[0].balance;
  const customer = new CustomerService().createCustomer({name:'FIFO test customer',phone:'0199000001',customerType:'RETAIL',creditLimit:0});
  const sales = new SalesService();
  const invoice = sales.createSale({customerId:customer.id,warehouseId:'wh_main',items:[{
    productId,soldBy:'M2',quantityM2:7,boxesCount:5,piecesCount:20,unitPrice:100,
  }],paidAmount:700,paymentType:'CASH'});
  assert.deepEqual(q(`SELECT batch_id AS batchId, quantity_m2 AS quantity FROM sales_invoice_batch_allocations WHERE invoice_item_id IN (SELECT id FROM sales_invoice_items WHERE invoice_id=?) ORDER BY batch_id`, [invoice.id]), [
    { batchId: 'pb_fifo_first', quantity: 4 },
    { batchId: 'pb_fifo_second', quantity: 3 },
  ]);
  assert.equal(invoice.totalCost,90);
  const issue = q(`SELECT id FROM inventory_transactions WHERE reference_type='INVOICE' AND reference_id=? AND type='SALE'`,[invoice.id])[0];
  sales.returnSale(invoice.id,[{productId,quantityM2:2,boxesCount:1,unitPrice:100,unitCost:15,reason:'FIFO test'}],false);
  assert.deepEqual(q(`SELECT id, quantity_remaining_m2 AS remaining FROM product_batches WHERE id IN ('pb_fifo_first','pb_fifo_second') ORDER BY id`), [
    { id: 'pb_fifo_first', remaining: 2 },
    { id: 'pb_fifo_second', remaining: 3 },
  ]);
  assert.equal(q(`SELECT batch_id AS batchId, quantity_m2 AS quantity FROM sales_return_batch_allocations WHERE return_item_id IN (SELECT id FROM sales_return_items WHERE return_id IN (SELECT id FROM sales_returns WHERE original_invoice_id=?))`, [invoice.id])[0].batchId, 'pb_fifo_first');
  db.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','AVERAGE_COST')`);
  assert.equal(q(`SELECT SUM(l.debit) AS cost FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
    JOIN journal_entries e ON e.id=l.entry_id WHERE e.reference_type='SALES_INVOICE' AND e.reference_id=? AND a.code='5101'`,[invoice.id])[0].cost,90);
  assert.equal(db.query<any>(`SELECT quantity_remaining AS quantity FROM inventory_cost_layers WHERE source_id='lot1'`)[0].quantity,2);
  assert.equal(q(`SELECT quantity_restored AS quantity FROM inventory_cost_allocations WHERE outbound_transaction_id=?`,[issue.id])[0].quantity,2);
  db.run(`UPDATE cash_registers SET current_balance=? WHERE id='cr_main'`,[cashBefore]);
});

test('end-to-end: weighted-average costing, sale, and return accounting', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  db.run(`UPDATE cash_registers SET current_balance = 0 WHERE id = 'cr_main'`);
  db.run(`INSERT OR REPLACE INTO system_settings (key,value) VALUES ('costingMethod','AVERAGE_COST')`);
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const pid = 'prod_test_1';
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [pid, 'SKU-T1', 'BAR-T1', 'بلاطة اختبار', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    ['stk_test', 'wh_main', pid, 200]
  );
  db.run(`INSERT INTO suppliers (id, code, name, phone, current_balance, total_purchases)
          VALUES (?,?,?,?,0,0)`, ['sup_test', 'SUP-T', 'مورد اختبار', '0100000001']);
  const created = new CustomerService().createCustomer({ name: 'عميل اختبار', phone: '0100000002', customerType: 'RETAIL', creditLimit: 0 });
  const demand = new CustomerSupplyService().recordInvoiceDemand({
    customerId: created.id,
    invoiceId: 'invoice_customer_supply_test',
    invoiceNumber: 'SUPPLY-TEST',
    warehouseId: 'wh_main',
    productId: pid,
    productName: 'بلاطة اختبار',
    quantityRequested: 20,
    unitPrice: 300,
  });

  const product = q('SELECT meters_per_box, pieces_per_box FROM products WHERE id=?', [pid])[0];
  const mPerBox = product.metersPerBox;
  const pPerBox = product.piecesPerBox;
  const box = (m2: number) => Math.round(m2 / mPerBox);
  const piece = (m2: number) => box(m2) * pPerBox;

  // --- Weighted-average costing (brief §33): 200@100 + 100@200 => 133.33 ---
  new PurchaseService().createPurchase({
    supplierId: 'sup_test',
    warehouseId: 'wh_main',
    items: [{ productId: pid, quantityM2: 100, boxesCount: box(100), unitCost: 200 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  const allocatedDemand = q(
    'SELECT quantity_received AS quantityReceived FROM customer_supply_request_items WHERE id = ?',
    [demand.id]
  )[0];
  assert.equal(allocatedDemand.quantityReceived, 20, 'purchase receipt allocates customer demand as part of posting');
  const avgCost = q('SELECT cost_price FROM products WHERE id=?', [pid])[0].costPrice;
  assert.equal(avgCost, 133.33, 'weighted average cost should be 133.33');

  // --- Credit sale (paid 0) then full return ---
  const sale1 = new SalesService().createSale({
    customerId: created.id,
    warehouseId: 'wh_main',
    items: [{ productId: pid, soldBy: 'M2', quantityM2: 50, boxesCount: box(50), piecesCount: piece(50), unitPrice: 300 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 250, 'stock after sale = 250');
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 15000, 'credit balance = 15000');

  const return1 = new SalesService().returnSale(
    sale1.id,
    [{ productId: pid, quantityM2: 50, boxesCount: box(50), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع' }],
    true
  );
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'balance back to 0 after unpaid return');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 300, 'stock restored to 300');
  const returnEntry = q(
    'SELECT total_debit, total_credit FROM journal_entries WHERE reference_type=? AND reference_id=?',
    ['SALES_RETURN', return1.id]
  )[0];
  assert.ok(returnEntry, 'sales return should post to the ledger');
  assert.equal(returnEntry.totalDebit, returnEntry.totalCredit, 'sales return journal entry should balance');

  db.run(
    `DELETE FROM journal_entries WHERE reference_type='SALES_RETURN' AND reference_id=?`,
    [return1.id]
  );
  db.run(`DELETE FROM schema_migrations WHERE id='025_backfill_return_ledger_entries'`);
  const migrationReport = runMigrations(db.getDatabase());
  assert.ok(migrationReport.applied.includes('025_backfill_return_ledger_entries'));
  assert.equal(
    q('SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type=? AND reference_id=?', ['SALES_RETURN', return1.id])[0].count,
    1,
    'return backfill should restore exactly one idempotent journal entry'
  );

  // --- Cash sale (paid in full) then full return ---
  const sale2 = new SalesService().createSale({
    customerId: created.id,
    warehouseId: 'wh_main',
    items: [{ productId: pid, soldBy: 'M2', quantityM2: 50, boxesCount: box(50), piecesCount: piece(50), unitPrice: 300 }],
    paidAmount: 15000,
    paymentType: 'CASH',
  });
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'fully-paid sale does not increase balance');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 15000, 'cash register received 15000');

  new SalesService().returnSale(sale2.id, [{ productId: pid, quantityM2: 50, boxesCount: box(50), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع' }], true);
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, 0, 'balance unchanged after paid return');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 0, 'cash register refunded to 0');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 300, 'stock restored to 300 after paid return');

  // --- Quotation → order → delivery → invoice pipeline ---
  const quotation = new QuotationService().createQuotation({
    customerId: created.id,
    validDays: 15,
    items: [{ productId: pid, quantityM2: 20, unitPrice: 300 }],
  });
  assert.equal(quotation.status, 'PENDING');
  assert.equal(quotation.totalAmount, 6000);

  new QuotationService().scheduleFollowUp(quotation.id, '2026-12-01', 'متابعة العميل');
  assert.equal(q('SELECT follow_up_date FROM quotations WHERE id=?', [quotation.id])[0].followUpDate, '2026-12-01');

  const order = new QuotationService().convertToOrder(quotation.id, { warehouseId: 'wh_main' });
  assert.equal(q('SELECT converted_order_id FROM quotations WHERE id=?', [quotation.id])[0].convertedOrderId, order.id);
  assert.equal(q('SELECT follow_up_date FROM quotations WHERE id=?', [quotation.id])[0].followUpDate, null);
  assert.equal(q('SELECT reserved_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].reservedM2, 20);

  const orderSvc = new OrderService();
  orderSvc.updateStatus(order.id, 'CONFIRMED');
  orderSvc.updateStatus(order.id, 'PROCESSING');
  const firstDelivery = orderSvc.recordDelivery(order.id, [{ itemId: order.items![0].id, quantityM2: 10 }], 'تسليم أول');
  assert.equal(firstDelivery.status, 'PARTIAL');
  assert.equal(firstDelivery.items![0].deliveredM2, 10);
  orderSvc.recordDelivery(order.id, [{ itemId: order.items![0].id, quantityM2: 10 }], 'تسليم ثانٍ');
  assert.equal(orderSvc.getOrder(order.id)!.items![0].deliveredM2, 20);
  assert.equal(orderSvc.getStatusHistory(order.id).length, 5, 'create + 2 status changes + 2 deliveries');

  const orderInvoice = orderSvc.convertToInvoice(order.id, { paymentType: 'CASH' });
  assert.equal(orderInvoice.totalAmount, 6000);
  assert.equal(q('SELECT status FROM orders WHERE id=?', [order.id])[0].status, 'COMPLETED');
  assert.equal(q('SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].quantityM2, 280);
  assert.equal(q('SELECT reserved_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id=?', [pid, 'wh_main'])[0].reservedM2, 0);

  // --- Refund to customer balance instead of cash ---
  const balanceReturn = new SalesService().returnSale(
    orderInvoice.id,
    [{ productId: pid, quantityM2: 20, boxesCount: box(20), unitPrice: 300, unitCost: avgCost, reason: 'إرجاع كامل' }],
    true,
    undefined,
    { refundMethod: 'BALANCE' }
  );
  assert.equal(balanceReturn.refundMethod, 'BALANCE');
  assert.equal(balanceReturn.refundedAmount, 0, 'no cash leaves the register');
  assert.equal(q('SELECT current_balance FROM cash_registers WHERE id=?', ['cr_main'])[0].currentBalance, 6000, 'balance refund leaves the cash register untouched');
  assert.equal(q('SELECT current_balance FROM customers WHERE id=?', [created.id])[0].currentBalance, -6000, 'full value credited to the customer balance');

  new InventoryService().adjustStock(pid, 'wh_main', 279, 'تسوية اختبار');
  const adjustmentEntry = q(
    `SELECT id FROM journal_entries WHERE reference_type='INVENTORY_ADJUSTMENT' ORDER BY rowid DESC LIMIT 1`
  )[0];
  assert.ok(adjustmentEntry, 'inventory adjustments should post to the ledger');
  const adjustmentLines = q(
    `SELECT a.code, l.debit, l.credit FROM journal_entry_lines l
     JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.entry_id=?`,
    [adjustmentEntry.id]
  );
  assert.deepEqual(adjustmentLines.map((line) => line.code).sort(), ['1104', '5201']);
  assert.equal(adjustmentLines.reduce((sum, line) => sum + line.debit, 0),
    adjustmentLines.reduce((sum, line) => sum + line.credit, 0));

  // --- RBAC: a CASHIER cannot adjust inventory (brief §108) ---
  AuthService.logout();
  db.run(`INSERT INTO users (id, username, password_hash, full_name, role, is_active)
          VALUES (?,?,?,?,?,1)`,
    ['usr_cashier', 'cashier1', bcrypt.hashSync('pass123', 10), 'كاشير', 'CASHIER']);
  AuthService.login('cashier1', 'pass123');
  assert.throws(
    () => new InventoryService().adjustStock(pid, 'wh_main', 999, 'test'),
    /غير مصرح/
  );
});
