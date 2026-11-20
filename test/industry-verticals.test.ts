import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { ModuleRegistryService } from '../src/services/domains/config/ModuleRegistryService.ts';
import { HospitalityService } from '../src/services/domains/hospitality/HospitalityService.ts';
import { WorkshopService } from '../src/services/domains/workshop/WorkshopService.ts';
import { EducationService } from '../src/services/domains/education/EducationService.ts';
import { TimeBillingService } from '../src/services/domains/professional/TimeBillingService.ts';
import { ExpiryService } from '../src/services/domains/inventory/ExpiryService.ts';
import { localDateString } from '../src/utils/shared/date.ts';
import type { User } from '../src/types/auth/identity.ts';

const admin: User = {
  id: 'usr_verticals_admin',
  username: 'verticals-admin',
  fullName: 'Verticals Admin',
  role: 'ADMIN',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

async function boot(): Promise<DatabaseManager> {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_verticals_admin', 'verticals-admin', 'test', 'Verticals Admin', 'ADMIN', 1)`
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);
  for (const m of ['sales', 'operations', 'customers', 'projects', 'inventory']) {
    if (!ModuleRegistryService.isModuleEnabled(m)) ModuleRegistryService.activate(m, admin);
  }
  return db;
}

function insertCustomer(db: DatabaseManager, id: string, name: string): void {
  db.run(
    `INSERT OR REPLACE INTO customers (id, code, name, phone) VALUES (?, ?, ?, '01000000000')`,
    [id, `C-${id}`, name]
  );
}

function insertProduct(db: DatabaseManager, id: string, name: string): void {
  db.run(
    `INSERT OR REPLACE INTO products
      (id, product_type, custom_unit, sku, barcode, name, category_id, brand_id,
       grade, size, base_unit, sell_unit, pieces_per_box, meters_per_box,
       cost_price, selling_price_m2, selling_price_box, wholesale_price_m2,
       min_selling_price_m2, min_stock_level, is_active)
     VALUES (?, 'GENERAL', '', ?, ?, ?, 'cat_floor', 'br_cleo', 'GRADE_1', 'standard',
       'PIECE', 'PIECE', 1, 1, 100, 200, 200, 200, 0, 0, 1)`,
    [id, `SKU-${id}`, `BAR-${id}`, name]
  );
}

test('hospitality: room floor map, reservation and nightly folio charge', async () => {
  await boot();
  const svc = new HospitalityService();
  const branchId = 'br_main';

  const type = svc.saveRoomType({ branchId, name: 'غرفة دبل', capacity: 2, baseRate: 500 });
  const room = svc.saveRoom({ branchId, roomTypeId: type.id, roomNumber: '101', floor: 1 });
  assert.equal(room.status, 'AVAILABLE');

  const today = localDateString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const res = svc.createReservation({
    branchId, roomId: room.id, checkIn: today, checkOut: tomorrow, guestsCount: 2,
  });
  assert.equal(res.totalAmount, 500);
  assert.equal(svc.getRooms().find((r) => r.id === room.id)?.status, 'RESERVED');

  svc.updateReservationStatus(res.id, 'CHECKED_IN');
  assert.equal(svc.getRooms().find((r) => r.id === room.id)?.status, 'OCCUPIED');

  const posted = svc.postNightlyCharges(today);
  assert.ok(posted >= 1);
  const folio = svc.getFolio(res.id);
  assert.ok(folio.some((e) => e.description === 'إقامة ليلة' && e.amount === 500));
  assert.equal(svc.postNightlyCharges(today), 0); // idempotent per day

  svc.updateReservationStatus(res.id, 'CHECKED_OUT');
  assert.equal(svc.getRooms().find((r) => r.id === room.id)?.status, 'CLEANING');
});

test('workshop: work order lifecycle, inspection, parts and customer approval', async () => {
  const db = await boot();
  insertCustomer(db, 'cust_ws_test', 'عميل ورشة');
  insertProduct(db, 'prod_part_test', 'فلتر زيت');
  const svc = new WorkshopService();

  const order = svc.createWorkOrder({
    branchId: 'br_main', customerId: 'cust_ws_test', vehiclePlate: 'أ ب ج 123',
    vehicleMake: 'تويوتا', complaint: 'صوت من المحرك',
  });
  assert.ok(order.inspectionCount > 0); // checklist seeded

  const items = svc.getInspectionItems(order.id);
  svc.saveInspectionItem({ id: items[0].id, workOrderId: order.id, itemName: items[0].itemName, status: 'NEEDS_REPAIR' });
  svc.transitionStatus(order.id, 'INSPECTION');
  svc.transitionStatus(order.id, 'WAITING_APPROVAL');
  assert.throws(() => svc.transitionStatus(order.id, 'APPROVED'), /لا يمكن الانتقال/);

  const part = svc.addPart({ workOrderId: order.id, productId: 'prod_part_test', partName: 'فلتر زيت', quantity: 2, unitPrice: 150 });
  assert.equal(svc.getWorkOrderById(order.id)?.partsTotal, 300);
  svc.updatePartStatus(part.id, 'APPROVED');

  svc.updateWorkOrder(order.id, { laborTotal: 200 });
  const approval = svc.approveWorkOrder(order.id, { approvedByName: 'أحمد العميل', signatureData: 'sig:test' });
  assert.equal(approval.approvedTotal, 500);
  assert.equal(svc.getWorkOrderById(order.id)?.status, 'APPROVED');
  assert.equal(svc.getApprovals(order.id).length, 1);
});

test('education: classes, teacher assignment, timetable conflict and enrollment', async () => {
  const db = await boot();
  insertCustomer(db, 'cust_stu_test', 'طالب اختبار');
  const svc = new EducationService();

  const cls = svc.saveClass({ branchId: 'br_main', name: 'رياضيات أ', subject: 'رياضيات', capacity: 1 });
  svc.saveSchedule({ classId: cls.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', room: 'قاعة 1' });
  assert.throws(
    () => svc.saveSchedule({ classId: cls.id, dayOfWeek: 1, startTime: '10:00', endTime: '11:00', room: 'قاعة 1' }),
    /نفس القاعة/
  );

  const en = svc.enrollStudent(cls.id, 'cust_stu_test');
  assert.equal(en.status, 'ENROLLED');
  insertCustomer(db, 'cust_stu_test2', 'طالب ثانٍ');
  assert.throws(() => svc.enrollStudent(cls.id, 'cust_stu_test2'), /الطاقة الاستيعابية/);
  svc.saveClass({ id: cls.id, name: 'رياضيات أ', capacity: 5 });
  assert.throws(() => svc.enrollStudent(cls.id, 'cust_stu_test'), /مسجل بالفعل/);

  svc.markAttendance(cls.id, localDateString(), [{ enrollmentId: en.id, status: 'PRESENT' }]);
  const roster = svc.getClassRoster(cls.id);
  assert.equal(roster[0].status, 'PRESENT');

  const fee = svc.addFeeInstallment({ enrollmentId: en.id, title: 'قسط أول', amount: 1000, dueDate: '2030-01-01' });
  svc.recordFeePayment(fee.id, 400);
  const after = svc.getFeeInstallments({ enrollmentId: en.id })[0];
  assert.equal(after.status, 'PARTIAL');
  assert.equal(after.remaining, 600);
});

test('time billing: entry approval pipeline and batch invoicing', async () => {
  const db = await boot();
  insertCustomer(db, 'cust_tb_test', 'عميل أتعاب');
  const svc = new TimeBillingService();

  const entry = svc.createTimeEntry({
    branchId: 'br_main', customerId: 'cust_tb_test', description: 'استشارة قانونية',
    minutes: 90, hourlyRate: 200,
  });
  assert.equal(entry.amount, 300);
  assert.throws(() => svc.transitionStatus(entry.id, 'APPROVED'), /لا يمكن الانتقال/);

  svc.transitionStatus(entry.id, 'SUBMITTED');
  svc.transitionStatus(entry.id, 'APPROVED');

  const batch = svc.createBatch({ customerId: 'cust_tb_test' });
  assert.equal(batch.totalAmount, 300);
  svc.markBatchInvoiced(batch.id, 'inv_test_1');
  assert.equal(svc.getTimeEntryById(entry.id)?.status, 'INVOICED');
  assert.equal(svc.getUnbilledSummary().amount, 0);
});

test('expiry: lots block expired stock and drive FEFO ordering', async () => {
  const db = await boot();
  insertProduct(db, 'prod_exp_test', 'منتج صلاحية');
  const svc = new ExpiryService();
  const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  svc.createLot({ productId: 'prod_exp_test', expiryDate: past, quantity: 10 });
  svc.createLot({ productId: 'prod_exp_test', expiryDate: future, quantity: 5 });

  assert.equal(svc.getExpiredQuantity('prod_exp_test'), 10);
  assert.equal(svc.getNonExpiredLotQuantity('prod_exp_test'), 5);
  assert.throws(() => svc.assertNotExpired('prod_exp_test', 8), /منتهي الصلاحية/);
  svc.assertNotExpired('prod_exp_test', 5); // exactly the fresh quantity passes

  const fefo = svc.getFefoLots('prod_exp_test');
  assert.equal(fefo.length, 1);
  assert.equal(fefo[0].expiryDate, future);

  // Untracked product is unaffected.
  insertProduct(db, 'prod_plain_test', 'منتج عادي');
  svc.assertNotExpired('prod_plain_test', 100);
});
