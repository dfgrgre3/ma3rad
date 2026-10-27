import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { PurchaseOrderService } from '../src/services/PurchaseOrderService.ts';
import { CustomerService } from '../src/services/CustomerService.ts';
import { SalesService } from '../src/services/SalesService.ts';
import { SupplierService } from '../src/services/SupplierService.ts';
import { DATA_INTEGRITY_BASELINE } from './fixtures/data-integrity-baseline.ts';

test('purchase order partial and full receipts post only received stock and preserve history', async () => {
  const db = DatabaseManager.getInstance(); await db.initialize(); await PermissionService.seed(); AuthService.login('admin', 'admin123');
  const pid = 'prod_receivable_test'; const sid = 'sup_receivable_test';
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [pid,'SKU-RCV','BAR-RCV','وحدة اختبار','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,20,30,25,0,0]);
  db.run(`INSERT INTO suppliers (id,code,name,phone,current_balance,total_purchases) VALUES (?,?,?,?,0,0)`, [sid,'SUP-RCV','مورد اختبار','01000000000']);
  const before = Number(db.query<any>(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id='wh_main'`,[pid])[0]?.quantityM2 || 0);
  const service = new PurchaseOrderService();
  const order = service.createOrder({ supplierId:sid, warehouseId:'wh_main', items:[{productId:pid,quantityM2:10,unitCost:20}] });
  service.updateStatus(order.id,'SENT');
  const detail = service.getOrderById(order.id)!;
  assert.equal(detail.items[0].receivedM2,0);
  assert.equal(Number(db.query<any>(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id='wh_main'`,[pid])[0]?.quantityM2 || 0), before);
  service.receiveQuantities(order.id,{[detail.items[0].id]:4});
  assert.equal(service.getOrderById(order.id)!.items[0].receivedM2,DATA_INTEGRITY_BASELINE.purchaseReceipt.partialQuantityM2);
  assert.equal(service.getOrderById(order.id)!.status,'PARTIAL');
  assert.equal(Number(db.query<any>(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id='wh_main'`,[pid])[0].quantityM2), before+4);
  assert.equal(service.getReceiptHistory(order.id).length,1);
  assert.throws(() => service.receiveQuantities(order.id,{[detail.items[0].id]:7}));
  service.receiveQuantities(order.id,{[detail.items[0].id]:6});
  assert.equal(service.getOrderById(order.id)!.items[0].receivedM2,DATA_INTEGRITY_BASELINE.purchaseReceipt.finalQuantityM2);
  assert.equal(service.getOrderById(order.id)!.status,'RECEIVED');
  assert.equal(Number(db.query<any>(`SELECT quantity_m2 FROM warehouse_stock WHERE product_id=? AND warehouse_id='wh_main'`,[pid])[0].quantityM2), before+10);
  assert.equal(service.getReceiptHistory(order.id).length,DATA_INTEGRITY_BASELINE.purchaseReceipt.receiptCount);
  assert.throws(() => service.receiveOrder(order.id));
});

test('one customer receipt allocates across several invoices atomically', async () => {
  const db = DatabaseManager.getInstance(); await db.initialize(); await PermissionService.seed(); AuthService.login('admin', 'admin123');
  const pid = 'prod_alloc_test'; const customer = new CustomerService().createCustomer({ name:'عميل توزيع', phone:'01000000002', customerType:'RETAIL', creditLimit:0, paymentTermsDays:15 });
  db.run(`INSERT INTO products (id,sku,barcode,name,category_id,brand_id,grade,size,base_unit,sell_unit,pieces_per_box,meters_per_box,cost_price,selling_price_m2,wholesale_price_m2,min_selling_price_m2,min_stock_level,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [pid,'SKU-ALLOC','BAR-ALLOC','صنف توزيع','cat_floor','br_cleo','GRADE_1','60x60','M2','M2',4,1.44,5,10,9,0,0]);
  db.run(`INSERT INTO warehouse_stock (id,warehouse_id,product_id,quantity_m2,reserved_m2) VALUES (?,?,?,?,0)`, ['stk_alloc','wh_main',pid,10]);
  const sales = new SalesService();
  const makeInvoice = () => sales.createSale({ customerId:customer.id, warehouseId:'wh_main', items:[{productId:pid,soldBy:'M2',quantityM2:2,boxesCount:0,piecesCount:0,unitPrice:10}], paidAmount:0, paymentType:'CREDIT' });
  const first = makeInvoice(); const second = makeInvoice();
  assert.ok(db.query<any>(`SELECT due_date FROM sales_invoices WHERE id=?`,[first.id])[0].dueDate,'invoice due date follows the customer terms');
  const receiptKey='receipt-key-alloc-test';
  const result = sales.recordCustomerPaymentAllocations(customer.id,[{invoiceId:first.id,amount:5},{invoiceId:second.id,amount:10}],'BANK_TRANSFER','cr_main','2026-10-24','TR-42','',undefined,receiptKey);
  assert.equal(result.total,DATA_INTEGRITY_BASELINE.customerAllocation.totalReceipt); assert.equal(result.receipts.length,DATA_INTEGRITY_BASELINE.customerAllocation.paymentRows);
  const replay = sales.recordCustomerPaymentAllocations(customer.id,[{invoiceId:first.id,amount:999}],'CASH','cr_main','2026-10-24','TR-42','',undefined,receiptKey);
  assert.deepEqual(replay,result,'replaying the same receipt key cannot post duplicate allocations');
  assert.equal(db.query<any>(`SELECT remaining_amount FROM sales_invoices WHERE id=?`,[first.id])[0].remainingAmount,DATA_INTEGRITY_BASELINE.customerAllocation.invoiceRemainingM2[0]);
  assert.equal(db.query<any>(`SELECT remaining_amount FROM sales_invoices WHERE id=?`,[second.id])[0].remainingAmount,DATA_INTEGRITY_BASELINE.customerAllocation.invoiceRemainingM2[1]);
  assert.equal(db.query<any>(`SELECT COUNT(*) AS n FROM customer_payments WHERE payment_group_id=?`,[result.groupId])[0].n,DATA_INTEGRITY_BASELINE.customerAllocation.paymentRows);
  const firstPayment=db.query<any>(`SELECT id FROM customer_payments WHERE payment_group_id=? LIMIT 1`,[result.groupId])[0];
  assert.ok(firstPayment,'payment group has a linked invoice receipt');
  sales.deleteInvoicePayment(firstPayment.id);
  assert.equal(db.query<any>(`SELECT remaining_amount FROM sales_invoices WHERE id=?`,[first.id])[0].remainingAmount,20);
  assert.equal(db.query<any>(`SELECT remaining_amount FROM sales_invoices WHERE id=?`,[second.id])[0].remainingAmount,20);
  assert.equal(db.query<any>(`SELECT COUNT(*) AS n FROM customer_payments WHERE payment_group_id=?`,[result.groupId])[0].n,0);
  const customerService=new CustomerService();
  const generalPayment=customerService.recordPayment(customer.id,5,'BANK_TRANSFER',undefined,undefined,'رصيد مرحل','usr_admin','2026-10-24','generic-payment-key');
  const genericReplay=customerService.recordPayment(customer.id,5,'BANK_TRANSFER',undefined,undefined,'رصيد مرحل','usr_admin','2026-10-24','generic-payment-key');
  assert.equal(genericReplay.id,generalPayment.id);
  assert.throws(() => customerService.recordPayment(customer.id,6,'BANK_TRANSFER',undefined,undefined,'رصيد مرحل','usr_admin','2026-10-24','generic-payment-key'), /already used for a different request/);
  customerService.deletePayment(generalPayment.id);
  assert.throws(() => sales.recordCustomerPaymentAllocations(customer.id,[{invoiceId:first.id,amount:999}],'CASH','cr_main'));
});

test('supplier payment retry with the same idempotency key posts once and rejects key reuse', async () => {
  const db = DatabaseManager.getInstance(); await db.initialize(); await PermissionService.seed(); AuthService.login('admin', 'admin123');
  const supplierId = 'sup_payment_retry_test';
  db.run(`INSERT INTO suppliers (id,code,name,phone,current_balance,total_purchases) VALUES (?,?,?,?,?,0)`,
    [supplierId,'SUP-RETRY','مورد إعادة المحاولة','01000000009',DATA_INTEGRITY_BASELINE.supplierPaymentRetry.initialBalance]);
  const service = new SupplierService();
  const first = service.recordPayment(supplierId, DATA_INTEGRITY_BASELINE.supplierPaymentRetry.paymentAmount, 'BANK_TRANSFER', 'cr_main', 'retry test', 'supplier-payment-retry-key');
  const replay = service.recordPayment(supplierId, DATA_INTEGRITY_BASELINE.supplierPaymentRetry.paymentAmount, 'BANK_TRANSFER', 'cr_main', 'retry test', 'supplier-payment-retry-key');
  assert.equal(replay.id, first.id);
  assert.equal(db.query<any>(`SELECT COUNT(*) AS count FROM supplier_payments WHERE idempotency_key=?`, ['supplier-payment-retry-key'])[0].count, DATA_INTEGRITY_BASELINE.supplierPaymentRetry.paymentRows);
  assert.equal(Number(service.getSupplierById(supplierId)!.currentBalance), DATA_INTEGRITY_BASELINE.supplierPaymentRetry.expectedBalance);
  assert.throws(() => service.recordPayment(supplierId, 30, 'BANK_TRANSFER', 'cr_main', 'retry test', 'supplier-payment-retry-key'), /already used for a different request/);
  assert.equal(Number(service.getSupplierById(supplierId)!.currentBalance), DATA_INTEGRITY_BASELINE.supplierPaymentRetry.expectedBalance, 'conflicting key reuse does not post a second payment');
});
