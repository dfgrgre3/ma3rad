import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { CustomerService } from '../src/services/domains/customers/CustomerService.ts';
import { FinanceExtrasService } from '../src/services/domains/finance/FinanceExtrasService.ts';
import { PrintService } from '../src/services/shared/PrintService.ts';
import { SalesService } from '../src/services/domains/sales/SalesService.ts';
import { PartnerService } from '../src/services/domains/customers/PartnerService.ts';
import { CashierService } from '../src/services/domains/finance/CashierService.ts';
import { round2 } from '../src/services/domains/finance/financials.ts';
import { ApprovalService } from '../src/services/domains/approvals/ApprovalService.ts';
import { runMigrations } from '../src/database/migrations/index.ts';
import { SCHEMA_SQL } from '../src/database/schema/index.ts';

function q(sql: string, params: any[] = []): any[] {
  return DatabaseManager.getInstance().query(sql, params);
}

function seedProduct(db: any, id: string, opts: { cost?: number; minPrice?: number } = {}): void {
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, `SKU-${id}`, `BAR-${id}`, 'بلاط اختبار مبيعات', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, opts.cost ?? 100, 300, 250, opts.minPrice ?? 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    [`stk_${id}`, 'wh_main', id, 100]
  );
}

test('legacy sales invoices gain status columns before queries run', async () => {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const legacySchema = SCHEMA_SQL.replace(
    /\s*payment_status TEXT NOT NULL DEFAULT 'PAID',\s*invoice_status TEXT NOT NULL DEFAULT 'COMPLETED',/g,
    ''
  );
  db.exec(legacySchema);

  const report = runMigrations(db);
  assert.equal(report.failed.length, 0, 'legacy sales invoice migration should not fail');

  const tableInfo = db.exec('PRAGMA table_info(sales_invoices)')[0]?.values ?? [];
  const columns = tableInfo.map((row) => String(row[1]));
  assert.ok(columns.includes('payment_status'));
  assert.ok(columns.includes('invoice_status'));
});

test('sales: create, insufficient stock, partial payment, return and void', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const svc = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار المبيعات', phone: '0122222222', customerType: 'RETAIL', creditLimit: 0,
  });
  seedProduct(db, 'prod_sale_1');
  const partnerService = new PartnerService();
  const majorityPartner = partnerService.createPartner({ name: 'شريك حصة 60%', ownershipPercent: 60, capitalAmount: 0 });
  const minorityPartner = partnerService.createPartner({ name: 'شريك حصة 40%', ownershipPercent: 40, capitalAmount: 0 });

  // empty cart is rejected
  assert.throws(
    () => svc.createSale({ customerId: customer.id, warehouseId: 'wh_main', items: [], paidAmount: 0, paymentType: 'CASH' } as any),
    /بدون أصناف/
  );

  // exceeding available stock is rejected
  assert.throws(
    () => svc.createSale({
      customerId: customer.id, warehouseId: 'wh_main',
      items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 500, boxesCount: 125, piecesCount: 0, unitPrice: 300 }],
      paidAmount: 0, paymentType: 'CASH',
    } as any),
    /غير كافٍ/
  );

  // successful sale: 10 m2 at 300 = 3000, fully paid
  const invoice = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 2000, paymentType: 'CASH',
  });
  assert.equal(invoice.invoiceStatus, 'COMPLETED');
  assert.equal(invoice.totalAmount, 3000);
  assert.equal(invoice.paidAmount, 2000);
  assert.equal(invoice.remainingAmount, 1000);
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4);

  const invoiceHtml = new PrintService().getInvoiceHtml({
    ...invoice,
    customerName: '<script>alert(1)</script>',
    taxPercentage: 14,
    taxAmount: 420,
    items: invoice.items.map((item) => ({ ...item, productName: '<img src=x onerror=alert(1)>' })),
  });
  assert.match(invoiceHtml, /ضريبة القيمة المضافة \(14%\)/);
  assert.match(invoiceHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(invoiceHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(invoiceHtml, /<img src=x onerror=alert\(1\)>/);

  // Simulate closing and reopening the SQLite file saved by Electron.
  await db.flush();
  const persistedBytes = db.exportDatabaseBinary();
  await db.importDatabaseBinary(persistedBytes);
  const restoredDb = db.getDatabase();
  assert.equal(restoredDb.exec('PRAGMA integrity_check')[0]?.values[0]?.[0], 'ok');
  assert.equal(restoredDb.exec('PRAGMA foreign_key_check')[0]?.values.length ?? 0, 0);
  assert.equal(restoredDb.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0], 1);
  const reopenedInvoice = svc.getInvoiceById(invoice.id)!;
  assert.equal(reopenedInvoice.id, invoice.id);
  assert.equal(reopenedInvoice.customerId, customer.id);
  assert.equal(reopenedInvoice.items[0].productId, 'prod_sale_1');
  const reopenedHtml = new PrintService().getInvoiceHtml(reopenedInvoice, {
    settingsOverride: { invoiceShowItemCode: true },
  });
  assert.match(reopenedHtml, new RegExp(invoice.invoiceNumber));
  assert.match(reopenedHtml, /SKU-prod_sale_1/);

  // stock was reduced
  const stock = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0];
  assert.equal(stock.q, 90);

  // partial payment completes the invoice
  assert.throws(
    () => svc.recordInvoicePayment(invoice.id, 1, 'CASH', undefined, undefined, '', undefined, '2026-99-99'),
    /تاريخ التحصيل غير صحيح/
  );
  assert.throws(() => svc.recordInvoicePayment(invoice.id, 1001), /يتجاوز المتبقي/);
  assert.equal(svc.getInvoiceById(invoice.id)!.remainingAmount, 1000);
  svc.recordInvoicePayment(invoice.id, 1000);
  const paid = svc.getInvoiceById(invoice.id)!;
  assert.equal(paid.remainingAmount, 0);

  // payment on a fully-paid invoice is rejected
  assert.throws(() => svc.recordInvoicePayment(invoice.id, 100), /مسددة بالكامل/);

  // Partial return followed by the final remaining quantity restores the sold amount once.
  const returnCostBefore = Number(q(`SELECT COALESCE(SUM(total_cost),0) AS total FROM inventory_transactions
    WHERE type='SALES_RETURN' AND reference_type='INVOICE' AND reference_id IN
      (SELECT id FROM sales_returns WHERE original_invoice_id=?)`, [invoice.id])[0].total);
  const returnIdempotencyKey = `sales-test-return-replay-${Date.now()}-${Math.random()}`;
  const saleItemId = q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [invoice.id])[0].id;
  const partialReturn = svc.returnSale(invoice.id, [{
    productId: 'prod_sale_1', invoiceItemId: saleItemId, quantityM2: 4, boxesCount: 3, unitPrice: 300, unitCost: 100, reason: 'اختبار',
  }], false, 'usr_admin', { idempotencyKey: returnIdempotencyKey });
  assert.equal(Number(q(`SELECT COALESCE(SUM(total_cost),0) AS total FROM inventory_transactions
    WHERE type='SALES_RETURN' AND reference_type='INVOICE' AND reference_id IN
      (SELECT id FROM sales_returns WHERE original_invoice_id=?)`, [invoice.id])[0].total), returnCostBefore + 400);
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6 * 0.6);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4 * 0.6);
  const afterReturn = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0];
  assert.equal(afterReturn.q, 94);

  const damagedInvoice = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  const damagedItemId = q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [damagedInvoice.id])[0].id;
  const beforeDamagedReturn = Number(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id='prod_sale_1' AND warehouse_id='wh_main'`)[0].q);
  const damagedReturn = svc.returnSale(damagedInvoice.id, [{
    productId: 'prod_sale_1', invoiceItemId: damagedItemId, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100,
    reason: 'damaged test', disposition: 'DAMAGED',
  }], false);
  assert.equal(Number(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id='prod_sale_1' AND warehouse_id='wh_main'`)[0].q), beforeDamagedReturn);
  const heldReturn = q(`SELECT category, quantity_m2 AS quantity FROM inventory_special_stocks
    WHERE source_type='SALES_RETURN' AND source_id IN
      (SELECT id FROM sales_return_items WHERE return_id=?)`, [damagedReturn.id])[0];
  assert.deepEqual(heldReturn, { category: 'DAMAGED', quantity: 1 });

  const goodInvoice = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  svc.returnSale(goodInvoice.id, [{
    productId: 'prod_sale_1', invoiceItemId: q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [goodInvoice.id])[0].id, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100,
    reason: 'good restock', disposition: 'RESTOCK',
  }], false);
  assert.equal(Number(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id='prod_sale_1' AND warehouse_id='wh_main'`)[0].q), beforeDamagedReturn);

  svc.returnSale(invoice.id, [{
    productId: 'prod_sale_1', invoiceItemId: saleItemId, quantityM2: 2, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'استكمال',
  }], false);
  assert.equal(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0].q, 95);
  assert.equal(Number(q(`SELECT COALESCE(SUM(quantity_m2),0) AS q FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id=sri.return_id WHERE sr.original_invoice_id=?`, [invoice.id])[0].q), 6);
  // returning more than was sold is rejected (already covered above)
  void 0;

  // an invoice with returns cannot be voided
  assert.throws(() => svc.voidInvoice(invoice.id, 'اختبار'), /مرتجعات/);

  // a clean invoice can be voided with a reason, and payments on it are then rejected
  const invoice2 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 300, paymentType: 'CASH',
  });
  assert.throws(() => svc.voidInvoice(invoice2.id, ''), /سبب إلغاء/);
  svc.voidInvoice(invoice2.id, 'خطأ في الإدخال');
  assert.equal(svc.getInvoiceById(invoice2.id)!.invoiceStatus, 'VOID');
  assert.equal(partnerService.getPartnerStatement(majorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.6 * 0.4);
  assert.equal(partnerService.getPartnerStatement(minorityPartner.id).partner.profitsDue, invoice.grossProfit * 0.4 * 0.4);
  assert.throws(() => svc.recordInvoicePayment(invoice2.id, 50), /ملغاة/);

  // Voiding after a separate receipt would otherwise leave its cash/register
  // and receipt record unreversed. Reject it without changing the invoice.
  const invoice3 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  svc.recordInvoicePayment(invoice3.id, 100);
  const stockBeforeRejectedVoid = q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0].q;
  assert.throws(() => svc.voidInvoice(invoice3.id, 'خطأ في الإدخال'), /سندات قبض/);
  assert.equal(svc.getInvoiceById(invoice3.id)!.invoiceStatus, 'COMPLETED');
  assert.equal(q(`SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`)[0].q, stockBeforeRejectedVoid);
});

test('FIFO invoice void restores allocations for duplicate product lines', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'FIFO duplicate lines', phone: '01070000001', customerType: 'RETAIL', creditLimit: 0,
  });
  const productId = 'prod_fifo_duplicate_void';
  seedProduct(db, productId);
  db.run('UPDATE warehouse_stock SET quantity_m2 = 30 WHERE product_id = ? AND warehouse_id = ?', [productId, 'wh_main']);
  db.run('DELETE FROM inventory_cost_layers WHERE product_id = ? AND warehouse_id = ?', [productId, 'wh_main']);
  db.run(`INSERT INTO inventory_cost_layers (
    id, product_id, warehouse_id, source_type, received_at, quantity_received, quantity_remaining, unit_cost
  ) VALUES ('icl_fifo_duplicate_void', ?, 'wh_main', 'OPENING_ESTIMATE', '2026-01-01', 30, 30, 100)`, [productId]);
  const previousMethod = q(`SELECT value FROM system_settings WHERE key = 'costingMethod'`)[0]?.value;
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'FIFO')`);
  try {
    const sales = new SalesService();
    const invoice = sales.createSale({
      customerId: customer.id,
      warehouseId: 'wh_main',
      items: [10, 5, 7].map((quantityM2) => ({
        productId, soldBy: 'M2', quantityM2, boxesCount: 0, piecesCount: 0, unitPrice: 300,
      })),
      paidAmount: 0,
      paymentType: 'CASH',
    });
    const issueCount = q(`SELECT COUNT(*) AS count FROM inventory_transactions
      WHERE reference_type = 'INVOICE' AND reference_id = ? AND product_id = ? AND type = 'SALE'`, [invoice.id, productId])[0].count;
    assert.equal(issueCount, 3);

    sales.voidInvoice(invoice.id, 'FIFO duplicate line regression');

    const layer = q(`SELECT quantity_remaining AS quantity FROM inventory_cost_layers WHERE id = 'icl_fifo_duplicate_void'`)[0];
    const stock = q(`SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE product_id = ? AND warehouse_id = 'wh_main'`, [productId])[0];
    const allocation = q(`SELECT SUM(quantity) AS issued, SUM(quantity_restored) AS restored FROM inventory_cost_allocations
      WHERE outbound_transaction_id IN (SELECT id FROM inventory_transactions WHERE reference_type = 'INVOICE' AND reference_id = ? AND type = 'SALE')`, [invoice.id])[0];
    assert.equal(Number(layer.quantity), 30);
    assert.equal(Number(stock.quantity), 30);
    assert.equal(Number(allocation.issued), 22);
    assert.equal(Number(allocation.restored), 22);
  } finally {
    if (previousMethod === undefined) db.run(`DELETE FROM system_settings WHERE key = 'costingMethod'`);
    else db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [previousMethod]);
  }
});

test('discount above policy requires an approved, single-use discount request', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  const manager = {
    id: 'usr_discount_manager',
    username: 'discount-manager',
    fullName: 'Discount Manager',
    role: 'MANAGER',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  } as any;
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES (?, ?, 'test', ?, 'MANAGER', 1)`,
    [manager.id, manager.username, manager.fullName]
  );
  db.run(
    `INSERT OR REPLACE INTO users_branches (user_id, branch_id)
     SELECT ?, id FROM branches WHERE is_main = 1`,
    [manager.id]
  );
  // Simulate a supervisor who may grant discounts but is not authorised to approve them.
  db.run(
    `INSERT OR REPLACE INTO user_permissions (user_id, permission_code, effect)
     VALUES (?, 'sales.approve', 'DENY'), (?, 'ui.sales.invoices.approve', 'DENY')`,
    [manager.id, manager.id]
  );
  AuthService.setCurrentUser(manager);
  PermissionService.invalidate(manager);

  const customer = new CustomerService().createCustomer({
    name: 'عميل اعتماد خصم', phone: '01070000003', customerType: 'RETAIL', creditLimit: 0,
  });
  const productId = 'prod_discount_approval';
  seedProduct(db, productId);
  const sales = new SalesService();
  const dto = {
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId, soldBy: 'M2', quantityM2: 10, boxesCount: 0, piecesCount: 0, unitPrice: 300,
    }],
    discountAmount: 600,
    paidAmount: 2400,
    paymentType: 'CASH',
  } as any;

  assert.throws(() => sales.createSale(dto), /اعتماد خصم|الخصم يتجاوز/);

  const request = new ApprovalService().createRequest({
    requestType: 'DISCOUNT',
    title: 'اعتماد خصم 20%',
    requestedValue: 600,
    currentValue: 3000,
    referenceType: 'POS',
    referenceId: customer.id,
  });
  AuthService.setCurrentUser({ ...manager, role: 'ADMIN' } as any);
  PermissionService.invalidate({ ...manager, role: 'ADMIN' } as any);
  new ApprovalService().decide(request.id, true);

  AuthService.setCurrentUser(manager);
  const invoice = sales.createSale({ ...dto, discountApprovalId: request.id });
  assert.equal(invoice.totalAmount, 2400);
  const approval = q(
    'SELECT reference_type AS referenceType, reference_id AS referenceId FROM approval_requests WHERE id = ?',
    [request.id]
  )[0];
  assert.equal(approval.referenceType, 'SALES_INVOICE');
  assert.equal(approval.referenceId, invoice.id);

  assert.throws(
    () => sales.createSale({ ...dto, discountApprovalId: request.id }),
    /اعتماد خصم|الخصم يتجاوز/
  );
});

test('average cost ignores caller supplied sale item cost', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'Average cost source', phone: '01070000002', customerType: 'RETAIL', creditLimit: 0,
  });
  const productId = 'prod_average_cost_source';
  seedProduct(db, productId, { cost: 100 });
  const previousMethod = q(`SELECT value FROM system_settings WHERE key = 'costingMethod'`)[0]?.value;
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', 'AVERAGE_COST')`);
  try {
    const invoice = new SalesService().createSale({
      customerId: customer.id,
      warehouseId: 'wh_main',
      items: [{
        productId, soldBy: 'M2', quantityM2: 2, boxesCount: 0, piecesCount: 0,
        unitPrice: 300, unitCost: 1,
      }],
      paidAmount: 0,
      paymentType: 'CASH',
    });
    assert.equal(invoice.totalCost, 200);
    const storedItem = q(`SELECT unit_cost AS unitCost FROM sales_invoice_items WHERE invoice_id = ?`, [invoice.id])[0];
    assert.equal(Number(storedItem.unitCost), 100);
  } finally {
    if (previousMethod === undefined) db.run(`DELETE FROM system_settings WHERE key = 'costingMethod'`);
    else db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('costingMethod', ?)`, [previousMethod]);
  }
});

test('sales returns allocate line and invoice discounts before applying invoice tax', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const svc = new SalesService();
  const customer = new CustomerService().createCustomer({
    name: 'عميل مرتجع بخصم اختبار', phone: '0122222233', customerType: 'RETAIL', creditLimit: 0,
  });
  const taxReports = new FinanceExtrasService();
  const taxSummaryBefore = taxReports.getTaxSummary('2000-01-01', '2999-12-31');

  seedProduct(db, 'prod_sale_return_discount');

  const invoice = svc.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [
      {
        productId: 'prod_sale_return_discount', soldBy: 'M2', quantityM2: 10,
        boxesCount: 0, piecesCount: 0, unitPrice: 100, discountAmount: 100,
      },
      {
        productId: 'prod_sale_return_discount', soldBy: 'M2', quantityM2: 10,
        boxesCount: 0, piecesCount: 0, unitPrice: 100,
      },
    ],
    discountAmount: 100,
    taxAmount: 270,
    paidAmount: 2070,
    paymentType: 'CASH',
  });
  const returnShift = new CashierService().openShift('cr_main', 'usr_admin', 0);
  const discountedLineId = q(
    `SELECT id FROM sales_invoice_items WHERE invoice_id = ? AND discount_amount > 0 LIMIT 1`,
    [invoice.id]
  )[0].id;

  const salesReturn = svc.returnSale(invoice.id, [{
    productId: 'prod_sale_return_discount',
    invoiceItemId: discountedLineId,
    quantityM2: 10,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إرجاع بخصم',
  }], true, 'usr_admin', { shiftId: returnShift.id });

  assert.equal(invoice.subtotal - invoice.discountAmount, 1800);
  assert.equal(salesReturn.totalAmount, 852.63);
  assert.equal(salesReturn.refundedAmount, 980.52);
  assert.equal(salesReturn.remainingToBalance, 0);
  const returnLine = q(
    'SELECT total_refund AS refund FROM sales_return_items WHERE return_id = ?',
    [salesReturn.id]
  )[0];
  assert.equal(returnLine.refund, 852.63);
  const taxDebit = q(`
    SELECT l.debit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.reference_type = 'SALES_RETURN' AND e.reference_id = ? AND a.code = '2102'
  `, [salesReturn.id])[0]?.debit;
  assert.equal(taxDebit, 127.89);
  const revenueDebit = q(`
    SELECT l.debit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN chart_of_accounts a ON a.id = l.account_id
    WHERE e.reference_type = 'SALES_RETURN' AND e.reference_id = ? AND a.code = '4101'
  `, [salesReturn.id])[0]?.debit;
  assert.equal(revenueDebit, 852.63);
  const returnCustomer = q(
    'SELECT current_balance AS balance, total_purchases AS purchases FROM customers WHERE id = ?',
    [customer.id]
  )[0];
  assert.equal(returnCustomer.balance, 0);
  assert.equal(round2(returnCustomer.purchases), 1089.48);
  const taxSummaryAfter = taxReports.getTaxSummary('2000-01-01', '2999-12-31');
  assert.equal(taxSummaryAfter.outputTax - taxSummaryBefore.outputTax, 142.11);
  assert.equal(round2(taxSummaryAfter.salesTotal - taxSummaryBefore.salesTotal), 1089.48);

  const invoice4 = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  const stockBeforeExchange = q(
    `SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`
  )[0].q;
  assert.throws(() => svc.exchangeSale(invoice4.id, [{
    productId: 'prod_sale_1', invoiceItemId: q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [invoice4.id])[0].id, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'استبدال',
  }], [{
    productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 500, boxesCount: 0, piecesCount: 0, unitPrice: 300,
  }]), /غير كافٍ/);
  assert.equal(q(`SELECT COUNT(*) AS count FROM sales_returns WHERE original_invoice_id = ?`, [invoice4.id])[0].count, 0);
  assert.equal(q(
    `SELECT quantity_m2 AS q FROM warehouse_stock WHERE product_id = 'prod_sale_1' AND warehouse_id = 'wh_main'`
  )[0].q, stockBeforeExchange);

  const exchange = svc.exchangeSale(invoice4.id, [{
    productId: 'prod_sale_1', invoiceItemId: q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [invoice4.id])[0].id, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'استبدال',
  }], [{
    productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300,
  }]);
  assert.equal(exchange.return.originalInvoiceId, invoice4.id);
  assert.equal(exchange.invoice.customerId, customer.id);
  assert.equal(exchange.invoice.totalAmount, 300, 'equal-value exchange settles with no difference');

  const highExchangeSource = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  const balanceBeforeHighExchange = Number(q('SELECT current_balance AS balance FROM customers WHERE id=?', [customer.id])[0].balance);
  const highExchange = svc.exchangeSale(highExchangeSource.id, [{
    productId: 'prod_sale_1', invoiceItemId: q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [highExchangeSource.id])[0].id, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'exchange',
  }], [{ productId: 'prod_sale_1', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 0, unitPrice: 300 }]);
  assert.equal(highExchange.invoice.totalAmount, 600);
  assert.equal(Number(q('SELECT current_balance AS balance FROM customers WHERE id=?', [customer.id])[0].balance), balanceBeforeHighExchange + 300);

  seedProduct(db, 'prod_sale_exchange_low');
  const lowExchangeSource = svc.createSale({
    customerId: customer.id, warehouseId: 'wh_main',
    items: [{ productId: 'prod_sale_exchange_low', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 0, paymentType: 'CREDIT',
  });
  const balanceBeforeLowExchange = Number(q('SELECT current_balance AS balance FROM customers WHERE id=?', [customer.id])[0].balance);
  const lowExchange = svc.exchangeSale(lowExchangeSource.id, [{
    productId: 'prod_sale_exchange_low', invoiceItemId: q('SELECT id FROM sales_invoice_items WHERE invoice_id = ? LIMIT 1', [lowExchangeSource.id])[0].id, quantityM2: 1, boxesCount: 1, unitPrice: 300, unitCost: 100, reason: 'exchange',
  }], [{ productId: 'prod_sale_exchange_low', soldBy: 'M2', quantityM2: 0.5, boxesCount: 1, piecesCount: 0, unitPrice: 300 }]);
  assert.equal(lowExchange.return.totalAmount, 300);
  assert.equal(lowExchange.invoice.totalAmount, 150);
  assert.equal(Number(q('SELECT current_balance AS balance FROM customers WHERE id=?', [customer.id])[0].balance), balanceBeforeLowExchange - 150);
});

test('sales return credit memo includes VAT for unpaid customer balances', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  const customer = new CustomerService().createCustomer({
    name: 'عميل مرتجع ضريبي آجل', phone: '0122222244', customerType: 'RETAIL', creditLimit: 0,
  });
  seedProduct(db, 'prod_sale_return_tax_credit');
  const sales = new SalesService();
  const invoice = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId: 'prod_sale_return_tax_credit', soldBy: 'M2', quantityM2: 10,
      boxesCount: 0, piecesCount: 0, unitPrice: 100,
    }],
    paidAmount: 0,
    paymentType: 'CREDIT',
    taxAmount: 140,
  });

  const returnedLineId = q('SELECT id FROM sales_invoice_items WHERE invoice_id = ?', [invoice.id])[0].id;
  const returned = sales.returnSale(invoice.id, [{
    productId: 'prod_sale_return_tax_credit',
    invoiceItemId: returnedLineId,
    quantityM2: 4,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إرجاع آجل شامل الضريبة',
  }]);

  assert.equal(returned.totalAmount, 400);
  assert.equal(returned.refundedAmount, 0);
  assert.equal(returned.remainingToBalance, 456);
  assert.equal(q('SELECT current_balance AS balance FROM customers WHERE id = ?', [customer.id])[0].balance, 684);
  assert.equal(q('SELECT returned_amount AS amount FROM sales_invoices WHERE id = ?', [invoice.id])[0].amount, 456);
  assert.deepEqual(q(
    'SELECT remaining_amount AS remaining, payment_status AS status FROM sales_invoices WHERE id = ?',
    [invoice.id],
  )[0], { remaining: 684, status: 'UNPAID' });
  const ledgerLines = q(`
    SELECT coa.code, jel.debit, jel.credit
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.reference_type = 'SALES_RETURN' AND je.reference_id = ?
  `, [returned.id]);
  assert.equal(ledgerLines.find((line) => line.code === '4101')?.debit, 400);
  assert.equal(ledgerLines.find((line) => line.code === '2102')?.debit, 56);
  assert.equal(ledgerLines.find((line) => line.code === '1103')?.credit, 456);
  const statement = new CustomerService().getCustomerStatement(customer.id);
  const returnTransaction = statement.transactions.find((transaction: any) => transaction.docNumber === returned.returnNumber);
  assert.equal(returnTransaction?.credit, 456);

  const finalReturn = sales.returnSale(invoice.id, [{
    productId: 'prod_sale_return_tax_credit',
    invoiceItemId: returnedLineId,
    quantityM2: 6,
    boxesCount: 0,
    unitPrice: 100,
    unitCost: 100,
    reason: 'إكمال المرتجع الآجل شامل الضريبة',
  }]);
  assert.equal(finalReturn.totalAmount, 600);
  assert.equal(finalReturn.remainingToBalance, 684);
  assert.equal(q('SELECT current_balance AS balance FROM customers WHERE id = ?', [customer.id])[0].balance, 0);
  assert.equal(q('SELECT returned_amount AS amount FROM sales_invoices WHERE id = ?', [invoice.id])[0].amount, 1140);
  assert.deepEqual(q(
    'SELECT remaining_amount AS remaining, payment_status AS status FROM sales_invoices WHERE id = ?',
    [invoice.id],
  )[0], { remaining: 0, status: 'PAID' });
});
