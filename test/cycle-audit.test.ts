import './integration.setup.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { PurchaseService } from '../src/services/PurchaseService.ts';
import { PurchaseOrderService } from '../src/services/PurchaseOrderService.ts';
import { ProcurementService } from '../src/services/ProcurementService.ts';
import { InventoryService } from '../src/services/InventoryService.ts';
import { ReservationService } from '../src/services/ReservationService.ts';

/**
 * Systematic cycle audit: every documented mutation must leave the same
 * evidence trail (documents, stock movements, ledger, party balances) and the
 * three-way purchase match must agree with what was ordered, received and
 * invoiced.
 */

async function boot(): Promise<DatabaseManager> {
  const manager = DatabaseManager.getInstance();
  await manager.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return manager;
}

function q<T = any>(sql: string, params: any[] = []): T[] {
  return DatabaseManager.getInstance().query<T>(sql, params);
}

function one<T = any>(sql: string, params: any[] = []): T {
  return q<T>(sql, params)[0];
}

function seedProduct(input: {
  id: string;
  stock: number;
  cost?: number;
  price?: number;
  warehouseId?: string;
}): void {
  q(
    `INSERT OR REPLACE INTO products (
       id, product_type, custom_unit, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       min_selling_price_m2, is_active
     ) VALUES (?, 'CERAMIC', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
       'M2', 'M2', 4, 1.44, ?, ?, 0, 1)`,
    [input.id, `SKU-${input.id}`, `BAR-${input.id}`, `صنف تدقيق ${input.id}`, input.cost ?? 100, input.price ?? 300]
  );
  q(
    `INSERT OR REPLACE INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?, ?, ?, ?, 0)`,
    [`stk_${input.id}_${input.warehouseId || 'wh_main'}`, input.warehouseId || 'wh_main', input.id, input.stock]
  );
}

function stockOf(productId: string, warehouseId = 'wh_main'): number {
  return Number(one<{ quantity: number }>(
    `SELECT quantity_m2 AS quantity FROM warehouse_stock WHERE product_id = ? AND warehouse_id = ?`,
    [productId, warehouseId]
  )?.quantity || 0);
}

function transactionSum(productId: string, warehouseId = 'wh_main'): number {
  return Number(one<{ total: number }>(
    `SELECT COALESCE(SUM(quantity_m2), 0) AS total FROM inventory_transactions
     WHERE product_id = ? AND warehouse_id = ?`,
    [productId, warehouseId]
  )?.total || 0);
}

/** Asserts one ledger document is internally balanced and matches its header. */
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

function assertDocumentNumber(prefix: string, value: string): void {
  assert.match(value, new RegExp(`^${prefix}-\\d{4}-\\d{6}$`), `${value} does not follow the ${prefix} numbering scheme`);
}

test('sales cycle audit: numbers, stock, ledger, receipts and returns agree', async () => {
  const manager = await boot();
  const productId = 'prod_audit_sale';
  seedProduct({ id: productId, stock: 100 });
  const customer = new CustomerService().createCustomer({
    name: 'عميل تدقيق دورة البيع',
    phone: '01000009001',
    customerType: 'RETAIL',
    creditLimit: 100000,
  });
  const sales = new SalesService();

  const invoice = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{
      productId,
      soldBy: 'M2',
      quantityM2: 10,
      boxesCount: 7,
      piecesCount: 28,
      unitPrice: 300,
    }],
    paidAmount: 1000,
    paymentType: 'CASH',
  });

  // ── Document + totals ─────────────────────────────────────────────────────
  assertDocumentNumber('INV', invoice.invoiceNumber);
  assert.equal(invoice.subtotal, 3000);
  assert.equal(invoice.totalAmount, 3000);
  assert.equal(invoice.paidAmount, 1000);
  assert.equal(invoice.remainingAmount, 2000);
  assert.equal(invoice.paymentStatus, 'PARTIAL');
  assert.equal(invoice.items[0].totalPrice, 3000);

  // ── Stock movement is linked to the invoice ───────────────────────────────
  const movements = q<{ type: string; quantity: number; referenceType: string; referenceId: string; number: string }>(
    `SELECT type, quantity_m2 AS quantity, reference_type AS referenceType, reference_id AS referenceId,
            transaction_number AS number
     FROM inventory_transactions WHERE reference_id = ?`,
    [invoice.id]
  );
  assert.equal(movements.length, 1);
  assert.equal(movements[0].type, 'SALE');
  assert.equal(movements[0].referenceType, 'INVOICE');
  assert.equal(movements[0].quantity, -10);
  assertDocumentNumber('TX-SALE', movements[0].number);
  assert.equal(stockOf(productId), 90);

  // ── Ledger: balanced, revenue recognised, only the unpaid part in AR ──────
  assertLedgerDocument('SALES_INVOICE', invoice.id);
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1103'), 2000, 'AR debit must equal the unpaid remainder');
  assert.equal(ledgerDebit('SALES_INVOICE', invoice.id, '1101'), 1000, 'cash debit must equal the amount paid');
  assert.equal(ledgerCredit('SALES_INVOICE', invoice.id, '4101'), 3000, 'sales revenue must be credited in full');

  // ── Customer balance tracks the invoice remainder ─────────────────────────
  const customerAfterSale = one<{ balance: number }>(`SELECT current_balance AS balance FROM customers WHERE id = ?`, [customer.id]);
  assert.equal(customerAfterSale.balance, 2000);

  // ── Receipt: numbered, allocated, balanced, balance re-derived ────────────
  sales.recordInvoicePayment(invoice.id, 500);
  const paidInvoice = sales.getInvoiceById(invoice.id)!;
  assert.equal(paidInvoice.paidAmount, 1500);
  assert.equal(paidInvoice.remainingAmount, 1500);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM customers WHERE id = ?`, [customer.id]).balance, 1500);

  const receipt = one<{ id: string; number: string; amount: number }>(
    `SELECT id, receipt_number AS number, amount FROM customer_payments WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [customer.id]
  );
  assertDocumentNumber('REC', receipt.number);
  assert.equal(receipt.amount, 500);
  assert.equal(
    one<{ amount: number }>(`SELECT amount FROM customer_payment_allocations WHERE payment_id = ? AND sales_invoice_id = ?`, [receipt.id, invoice.id])?.amount,
    500
  );
  assertLedgerDocument('CUSTOMER_PAYMENT', receipt.id);
  assert.equal(ledgerCredit('CUSTOMER_PAYMENT', receipt.id, '1103'), 500);

  // ── Over-allocating a receipt is rejected without touching anything ───────
  const beforeOverpay = q<{ paid: number; remaining: number }>(
    `SELECT paid_amount AS paid, remaining_amount AS remaining FROM sales_invoices WHERE id = ?`, [invoice.id]
  )[0];
  assert.throws(
    () => sales.recordCustomerPaymentAllocations(customer.id, [{ invoiceId: invoice.id, amount: 5000 }]),
    /أكبر من المتبقي|يتجاوز/
  );
  const afterOverpay = q<{ paid: number; remaining: number }>(
    `SELECT paid_amount AS paid, remaining_amount AS remaining FROM sales_invoices WHERE id = ?`, [invoice.id]
  )[0];
  assert.deepEqual(afterOverpay, beforeOverpay);
  assert.equal(
    q(`SELECT COUNT(*) AS n FROM customer_payments WHERE customer_id = ?`, [customer.id])[0].n,
    1,
    'the rejected allocation must not create a receipt'
  );

  // ── Return: numbered, restores stock, reverses revenue, reduces debt ──────
  const saleReturn = sales.returnSale(invoice.id, [{
    productId,
    quantityM2: 4,
    boxesCount: 3,
    unitPrice: 300,
    unitCost: 100,
    reason: 'تدقيق دورة البيع',
  }], true);
  assertDocumentNumber('RET', saleReturn.returnNumber);
  assert.equal(saleReturn.totalAmount, 1200);
  assert.equal(stockOf(productId), 94);
  assert.equal(
    one<{ total: number }>(
      `SELECT COALESCE(SUM(quantity_m2), 0) AS total FROM inventory_transactions WHERE reference_id = ? AND type = 'SALES_RETURN'`,
      [saleReturn.id]
    ).total,
    4
  );
  assertLedgerDocument('SALES_RETURN', saleReturn.id);
  assert.equal(ledgerDebit('SALES_RETURN', saleReturn.id, '4101'), 1200, 'return must debit revenue back');
  // Half the invoice was paid, so half the return is refunded in cash and the
  // other half reduces the receivable: 1500 owed - 600 = 900.
  assert.equal(saleReturn.refundedAmount, 600, 'cash refund follows the paid ratio');
  assert.equal(ledgerCredit('SALES_RETURN', saleReturn.id, '1103'), 600, 'unpaid share reduces AR, never cash');
  assert.equal(ledgerCredit('SALES_RETURN', saleReturn.id, '1101'), 600);
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM customers WHERE id = ?`, [customer.id]).balance, 900);

  // ── Returning more than remains sold is rejected and writes nothing ──────
  const stockBeforeRejectedReturn = stockOf(productId);
  assert.throws(() => sales.returnSale(invoice.id, [{
    productId,
    quantityM2: 7,
    boxesCount: 5,
    unitPrice: 300,
    unitCost: 100,
    reason: 'كمية أكبر من المتاح',
  }], true), /أكبر من المباعة/);
  assert.equal(stockOf(productId), stockBeforeRejectedReturn);
  assert.equal(q(`SELECT COUNT(*) AS n FROM sales_returns WHERE original_invoice_id = ?`, [invoice.id])[0].n, 1);

  // ── Numbers are unique and monotonic across documents ────────────────────
  const second = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 300 }],
    paidAmount: 300,
    paymentType: 'CASH',
  });
  assertDocumentNumber('INV', second.invoiceNumber);
  assert.ok(second.invoiceNumber > invoice.invoiceNumber, 'invoice numbers must increase');
  assert.equal(
    q(`SELECT COUNT(*) AS n FROM sales_invoices WHERE invoice_number IN (?, ?)`, [invoice.invoiceNumber, second.invoiceNumber])[0].n,
    2
  );

  // A direct invoice payment is capped at the outstanding amount: a receipt can
  // never take more money than the invoice still owes.
  const creditInvoice = sales.createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 300 }],
    paidAmount: 0,
    paymentType: 'CREDIT',
  });
  sales.recordInvoicePayment(creditInvoice.id, 5000);
  const capped = sales.getInvoiceById(creditInvoice.id)!;
  assert.equal(capped.paidAmount, 300);
  assert.equal(capped.remainingAmount, 0);
  assert.equal(
    one<{ amount: number }>(`SELECT amount FROM customer_payments WHERE invoice_id = ?`, [creditInvoice.id]).amount,
    300,
    'the stored receipt must equal the amount actually applied'
  );
});

test('purchase cycle audit: PO, GRN, invoice and three-way matching agree', async () => {
  await boot();
  const productId = 'prod_audit_purchase';
  seedProduct({ id: productId, stock: 0, cost: 10, price: 30 });
  const supplier = new SupplierService().createSupplier({
    name: 'مورد تدقيق دورة الشراء',
    phone: '01000009002',
    paymentTermsDays: 30,
  } as any);

  // ── Ordered 100 @ 10 ─────────────────────────────────────────────────────
  const orders = new PurchaseOrderService();
  const order = orders.createOrder({
    supplierId: supplier.id,
    warehouseId: 'wh_main',
    items: [{ productId, quantityM2: 100, boxesCount: 70, unitCost: 10 }],
  });
  assertDocumentNumber('PO', order.orderNumber);
  assert.equal(order.totalAmount, 1000);
  assert.equal(order.items[0].quantityM2, 100);

  // ── Received 90 accepted (10 still outstanding) ──────────────────────────
  const receipt = new ProcurementService().createGoodsReceipt({
    purchaseOrderId: order.id,
    supplierId: supplier.id,
    warehouseId: 'wh_main',
    deliveryNoteNumber: 'DN-9001',
    items: [{
      purchaseOrderItemId: order.items[0].id,
      productId,
      orderedQuantityM2: 100,
      receivedQuantityM2: 90,
      acceptedQuantityM2: 90,
      unitCost: 10,
      qualityVerdict: 'PASS',
    }],
  });
  assertDocumentNumber('GRN', receipt.grn.grnNumber);
  assert.equal(stockOf(productId), 90, 'goods receipt is the only stock movement');
  assertDocumentNumber('TX-GRN', one<{ number: string }>(
    `SELECT transaction_number AS number FROM inventory_transactions WHERE reference_id = ?`, [receipt.grn.id]
  ).number);
  assert.equal(one<{ status: string }>(`SELECT status FROM purchase_orders WHERE id = ?`, [order.id]).status, 'PARTIAL');
  assert.equal(one<{ received: number }>(`SELECT received_m2 AS received FROM purchase_order_items WHERE id = ?`, [order.items[0].id]).received, 90);

  // ── Supplier invoice for exactly the accepted quantity at the PO price ────
  const purchase = new PurchaseService().createPurchase({
    supplierId: supplier.id,
    supplierInvoiceNumber: 'SUP-INV-9001',
    warehouseId: 'wh_main',
    grnId: receipt.grn.id,
    purchaseOrderId: order.id,
    items: [{
      productId,
      quantityM2: 90,
      boxesCount: 63,
      unitCost: 10,
      orderedUnitCost: 10,
      grnAcceptedQty: 90,
    }],
    paidAmount: 400,
    paymentType: 'CASH',
  });
  assertDocumentNumber('PUR', purchase.invoiceNumber);
  assert.equal(purchase.totalAmount, 900);
  assert.equal(purchase.remainingAmount, 500);
  const storedMatch = one<{ status: string; priceVariance: number; qtyVariance: number }>(
    `SELECT matching_status AS status, price_variance_amount AS priceVariance, qty_variance_amount AS qtyVariance
     FROM purchase_invoices WHERE id = ?`, [purchase.id]
  );
  assert.equal(storedMatch.status, 'MATCHED');
  assert.equal(storedMatch.priceVariance, 0);
  assert.equal(storedMatch.qtyVariance, 0);
  assert.equal(stockOf(productId), 90, 'invoicing a GRN must not receive stock twice');
  assert.equal(one<{ balance: number }>(`SELECT current_balance AS balance FROM suppliers WHERE id = ?`, [supplier.id]).balance, 500);

  assertLedgerDocument('PURCHASE_INVOICE', purchase.id);
  assert.equal(ledgerDebit('PURCHASE_INVOICE', purchase.id, '2101'), 0);
  assert.equal(ledgerCredit('PURCHASE_INVOICE', purchase.id, '2101'), 900, 'AP must be credited with the full invoice');
  assert.equal(ledgerDebit('PURCHASE_INVOICE', purchase.id, '1104'), 900, 'inventory must be debited with the received value');
  const supplierPayment = one<{ id: string }>(
    `SELECT id FROM supplier_payments WHERE supplier_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [supplier.id]
  );
  assertLedgerDocument('SUPPLIER_PAYMENT', supplierPayment.id);

  // ── Three-way matching: order vs accepted receipt vs invoice ─────────────
  const procurement = new ProcurementService();
  const matched = procurement.perform3WayMatching({
    purchaseOrderId: order.id,
    grnId: receipt.grn.id,
    invoiceItems: [{ productId, quantityM2: 90, unitCost: 10 }],
  });
  assert.equal(matched.matchingStatus, 'MATCHED');
  assert.equal(matched.priceVarianceTotal, 0);
  assert.equal(matched.qtyVarianceTotal, 0);

  const pricedUp = procurement.perform3WayMatching({
    purchaseOrderId: order.id,
    grnId: receipt.grn.id,
    invoiceItems: [{ productId, quantityM2: 90, unitCost: 12 }],
  });
  assert.equal(pricedUp.matchingStatus, 'PRICE_VARIANCE');
  assert.equal(pricedUp.priceVarianceTotal, 180, '2 extra per unit over 90 units');

  const overbilled = procurement.perform3WayMatching({
    purchaseOrderId: order.id,
    grnId: receipt.grn.id,
    invoiceItems: [{ productId, quantityM2: 100, unitCost: 10 }],
  });
  assert.equal(overbilled.matchingStatus, 'QTY_VARIANCE');
  assert.equal(overbilled.qtyVarianceTotal, 100, '10 units invoiced but never accepted');

  // ── Receiving more than ordered is rejected without stock changes ────────
  const beforeOverReceipt = stockOf(productId);
  assert.throws(
    () => orders.receiveQuantities(order.id, { [order.items[0].id]: 20 }),
    /أكبر من المتبقي/
  );
  assert.equal(stockOf(productId), beforeOverReceipt);
  assert.equal(one<{ status: string }>(`SELECT status FROM purchase_orders WHERE id = ?`, [order.id]).status, 'PARTIAL');

  // ── Receiving the remainder closes the order and moves stock ─────────────
  const remainder = orders.receiveQuantities(order.id, { [order.items[0].id]: 10 });
  assertDocumentNumber('PUR', remainder.invoiceNumber);
  assert.equal(remainder.totalAmount, 100);
  assert.equal(stockOf(productId), 100);
  assert.equal(one<{ status: string }>(`SELECT status FROM purchase_orders WHERE id = ?`, [order.id]).status, 'RECEIVED');
  assert.equal(one<{ received: number }>(`SELECT received_m2 AS received FROM purchase_order_items WHERE id = ?`, [order.items[0].id]).received, 100);
  assertLedgerDocument('PURCHASE_INVOICE', remainder.id);
});

test('inventory and accounting audit: movements, reservations, transfers and ledger reconcile', async () => {
  await boot();
  const productId = 'prod_audit_inventory';
  seedProduct({ id: productId, stock: 50 });
  const inventory = new InventoryService();

  const stockBaseline = stockOf(productId, 'wh_main');
  const transactionBaseline = transactionSum(productId, 'wh_main');

  // ── Transfer moves value without creating or destroying it ───────────────
  inventory.transferStock('wh_main', 'wh_ext', productId, 5, 'تدقيق تحويل');
  assert.equal(stockOf(productId, 'wh_main'), stockBaseline - 5);
  assert.equal(stockOf(productId, 'wh_ext'), 5);
  const transferTypes = q<{ type: string; quantity: number; referenceType: string }>(
    `SELECT type, quantity_m2 AS quantity, reference_type AS referenceType FROM inventory_transactions
     WHERE product_id = ? AND reference_type = 'TRANSFER' ORDER BY created_at DESC, rowid DESC LIMIT 2`,
    [productId]
  );
  assert.deepEqual(
    transferTypes.map((row) => row.type).sort(),
    ['TRANSFER_IN', 'TRANSFER_OUT']
  );
  assert.equal(transferTypes.reduce((sum, row) => sum + Number(row.quantity), 0), 0, 'transfer legs must cancel out');

  // ── Reservations never exceed on-hand and release cleanly ────────────────
  const reservations = new ReservationService();
  const reservation = reservations.createReservation({
    productId,
    warehouseId: 'wh_ext',
    quantityM2: 3,
    referenceType: 'MANUAL',
  });
  let availability = reservations.getAvailability(productId, 'wh_ext');
  assert.equal(availability.reserved, 3);
  assert.equal(availability.available, 2);
  reservations.releaseReservation(reservation.id);
  availability = reservations.getAvailability(productId, 'wh_ext');
  assert.equal(availability.reserved, 0);
  assert.equal(availability.available, 5);

  // ── Stock ledger equals warehouse stock deltas for audited movements ─────
  assert.equal(
    stockOf(productId, 'wh_main') - stockBaseline,
    transactionSum(productId, 'wh_main') - transactionBaseline,
    'warehouse stock must only move through inventory transactions'
  );

  // ── No negative availability and no over-reservation anywhere ────────────
  const overReserved = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM warehouse_stock WHERE reserved_m2 > quantity_m2 + 0.001`
  );
  assert.equal(overReserved.n, 0);

  // ── Ledger is globally balanced, and account balances match their lines ──
  const globalLines = one<{ debit: number; credit: number }>(
    `SELECT COALESCE(SUM(debit), 0) AS debit, COALESCE(SUM(credit), 0) AS credit FROM journal_entry_lines`
  );
  assert.ok(Math.abs(globalLines.debit - globalLines.credit) < 0.01, 'trial balance must balance');

  const driftedAccounts = q<{ code: string; balance: number; movement: number }>(
    `SELECT a.code, a.balance,
            COALESCE((SELECT SUM(l.debit - l.credit) FROM journal_entry_lines l WHERE l.account_id = a.id), 0) AS movement
     FROM chart_of_accounts a`
  ).filter((row) => Math.abs(Number(row.balance) - Number(row.movement)) > 0.01);
  assert.deepEqual(driftedAccounts, [], 'chart_of_accounts.balance must equal the posted movement of each account');

  // ── A closed accounting period blocks posting and rolls everything back ──
  const closedSetting = one<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'accounting_closed_until_date'`
  );
  const today = new Date().toISOString().slice(0, 10);
  q(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('accounting_closed_until_date', ?)`, [today]);
  const invoicesBefore = one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n;
  const stockBeforeClosedSale = stockOf(productId);
  const customer = new CustomerService().createCustomer({
    name: 'عميل تدقيق الفترة المغلقة',
    phone: '01000009003',
    customerType: 'RETAIL',
    creditLimit: 100000,
  });
  assert.throws(() => new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId, soldBy: 'M2', quantityM2: 1, boxesCount: 1, piecesCount: 4, unitPrice: 300 }],
    paidAmount: 300,
    paymentType: 'CASH',
  }));
  assert.equal(one<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_invoices`).n, invoicesBefore);
  assert.equal(stockOf(productId), stockBeforeClosedSale);
  if (closedSetting?.value) {
    q(`UPDATE system_settings SET value = ? WHERE key = 'accounting_closed_until_date'`, [closedSetting.value]);
  } else {
    q(`DELETE FROM system_settings WHERE key = 'accounting_closed_until_date'`);
  }
});
