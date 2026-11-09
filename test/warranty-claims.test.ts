import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import { CustomerService } from '../src/services/customers/CustomerService.ts';
import { SalesService } from '../src/services/sales/SalesService.ts';
import { WarrantyClaimService } from '../src/services/sales/WarrantyClaimService.ts';

function seedProduct(db: any, id: string): void {
  db.run(
    `INSERT INTO products (id, sku, barcode, name, category_id, brand_id, grade, size,
       base_unit, sell_unit, pieces_per_box, meters_per_box, cost_price, selling_price_m2,
       wholesale_price_m2, min_selling_price_m2, min_stock_level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, `SKU-${id}`, `BAR-${id}`, 'بلاط اختبار الضمان', 'cat_floor', 'br_cleo', 'GRADE_1', '60x60',
     'M2', 'M2', 4, 1.44, 100, 300, 250, 0, 10]
  );
  db.run(
    `INSERT INTO warehouse_stock (id, warehouse_id, product_id, quantity_m2, reserved_m2)
     VALUES (?,?,?,?,0)`,
    [`stk_${id}`, 'wh_main', id, 100]
  );
}

test('customer warranty claims: eligibility, lifecycle, quantity accounting and validation', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const customer = new CustomerService().createCustomer({
    name: 'عميل اختبار الضمان', phone: '0123333333', customerType: 'RETAIL', creditLimit: 0,
  });
  seedProduct(db, 'prod_warranty_1');

  const invoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: 'prod_warranty_1', soldBy: 'M2', quantityM2: 10, boxesCount: 7, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 3000,
    paymentType: 'CASH',
  } as any);

  const service = new WarrantyClaimService();

  const eligibleBefore = service.getEligibleItems(invoice.id, 12);
  assert.equal(eligibleBefore.length, 1);
  assert.equal(eligibleBefore[0].soldQuantity, 10);
  assert.equal(eligibleBefore[0].availableQuantity, 10);
  assert.equal(eligibleBefore[0].warrantyActive, true);
  assert.ok(eligibleBefore[0].warrantyExpiresAt);

  // Validation: empty issue is rejected before anything is written.
  assert.throws(
    () => service.createClaim({
      invoiceId: invoice.id, productId: 'prod_warranty_1', quantityM2: 2, issueDescription: '   ',
    }),
    /وصف المشكلة/
  );
  assert.throws(
    () => service.createClaim({
      invoiceId: invoice.id, productId: 'prod_warranty_1', quantityM2: 50, issueDescription: 'كسر',
    }),
    /الكمية المتاحة/
  );

  const first = service.createClaim({
    invoiceId: invoice.id,
    productId: 'prod_warranty_1',
    claimType: 'WARRANTY',
    quantityM2: 3,
    warrantyMonths: 12,
    issueDescription: 'كسر في ثلاث كراتين أثناء النقل',
  });
  assert.equal(first.status, 'OPEN');
  assert.match(first.claimNumber, /^WCLM-/);
  assert.equal(first.customerName, 'عميل اختبار الضمان');
  assert.equal(first.quantityM2, 3);

  const eligibleAfterClaim = service.getEligibleItems(invoice.id, 12)[0];
  assert.equal(eligibleAfterClaim.claimedQuantity, 3);
  assert.equal(eligibleAfterClaim.availableQuantity, 7);

  const detail = service.getClaim(first.id);
  assert.equal(detail?.events?.length, 1);
  assert.equal(detail?.events?.[0].action, 'CREATE');

  // Invalid jump is rejected: a new claim cannot be resolved before approval.
  assert.throws(() => service.transition(first.id, 'resolve'), /لا يمكن تنفيذ/);

  const reviewed = service.transition(first.id, 'review');
  assert.equal(reviewed.status, 'UNDER_REVIEW');

  const approved = service.transition(first.id, 'approve', 'تم اعتماد الاستبدال');
  assert.equal(approved.status, 'APPROVED');
  assert.ok(approved.decidedAt);

  const resolved = service.transition(first.id, 'resolve', 'تم استبدال الكمية', 'REPLACEMENT');
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.resolutionType, 'REPLACEMENT');
  assert.ok(resolved.closedAt);

  // Rejected claims release their quantity back to the eligible pool.
  const second = service.createClaim({
    invoiceId: invoice.id,
    productId: 'prod_warranty_1',
    claimType: 'COMPLAINT',
    quantityM2: 4,
    issueDescription: 'شكوى اختلاف درجة اللون',
  });
  assert.equal(service.getEligibleItems(invoice.id, 12)[0].availableQuantity, 3);
  assert.throws(() => service.transition(second.id, 'reject'), /سبب الرفض/);
  const rejected = service.transition(second.id, 'reject', 'لا يوجد عيب صناعة');
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(service.getEligibleItems(invoice.id, 12)[0].availableQuantity, 7);

  const stats = service.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.resolved, 1);
  assert.equal(stats.rejected, 1);

  const list = service.listClaims({ status: 'RESOLVED' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, first.id);

  // A voided invoice must not accept new claims through a direct service call.
  const voidedInvoice = new SalesService().createSale({
    customerId: customer.id,
    warehouseId: 'wh_main',
    items: [{ productId: 'prod_warranty_1', soldBy: 'M2', quantityM2: 2, boxesCount: 2, piecesCount: 0, unitPrice: 300 }],
    paidAmount: 600,
    paymentType: 'CASH',
  } as any);
  new SalesService().voidInvoice(voidedInvoice.id, 'اختبار منع المطالبات على فاتورة ملغاة');
  assert.throws(
    () => service.createClaim({
      invoiceId: voidedInvoice.id,
      productId: 'prod_warranty_1',
      quantityM2: 1,
      issueDescription: 'كسر',
    }),
    /غير مكتملة أو ملغاة/
  );

  assert.equal(service.getClaim('missing-id'), null);
});
