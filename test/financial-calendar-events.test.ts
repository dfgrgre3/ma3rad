import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { FinancialCalendarEventsService } from '../src/services/finance/FinancialCalendarEventsService.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import type { User } from '../src/types/auth/identity.ts';

test('financial calendar stores scoped events, audited partial payments, and unique references', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();

  const admin: User = {
    id: `usr_fin_calendar_${uuidv4()}`,
    username: `fin-calendar-${uuidv4()}`,
    fullName: 'Financial Calendar Test',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, branch_scope)
     VALUES (?, ?, 'test', ?, 'ADMIN', 1, 'ALL')`,
    [admin.id, admin.username, admin.fullName]
  );
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  const service = new FinancialCalendarEventsService();
  const dueDate = '2099-01-15';
  const eventInput = {
    title: 'Calendar test receivable',
    eventType: 'CUSTOMER_INVOICE' as const,
    amount: 100,
    currency: 'EGP',
    dueDate,
    reminderDays: [7, 3, 1],
    partyType: 'CUSTOMER' as const,
    partyName: 'Test customer',
    financialAccount: '',
    reference: `INV-${uuidv4()}`,
    description: 'Calendar integration test',
  };
  const eventId = service.saveEvent(eventInput);

  let event = service.getEvents(dueDate, dueDate).find((item) => item.id === eventId);
  assert.ok(event);
  assert.equal(event.amount, 100);
  assert.equal(event.paidAmount, 0);

  service.recordPayment({
    eventId,
    amount: 35,
    paymentDate: dueDate,
    reference: `PAY-${uuidv4()}`,
  });
  event = service.getEvents(dueDate, dueDate).find((item) => item.id === eventId);
  assert.equal(event?.paidAmount, 35);
  assert.equal(event?.status, 'PARTIALLY_COLLECTED');

  const duplicateReference = `PAY-${uuidv4()}`;
  const secondEventId = service.saveEvent({ ...eventInput, title: 'Second receivable', reference: '' });
  service.recordPayment({ eventId: secondEventId, amount: 10, paymentDate: dueDate, reference: duplicateReference });
  assert.throws(
    () => service.recordPayment({ eventId, amount: 10, paymentDate: dueDate, reference: duplicateReference }),
    /مرجع مستخدم/
  );
  assert.throws(
    () => service.recordPayment({ eventId, amount: 66, paymentDate: dueDate, reference: `OVER-${uuidv4()}` }),
    /يتجاوز الرصيد/
  );

  service.recordPayment({
    eventId,
    amount: 65,
    paymentDate: dueDate,
    reference: `PAY-${uuidv4()}`,
  });
  const details = service.getEventDetails(eventId);
  assert.equal(details.event.status, 'COLLECTED');
  assert.equal(details.event.paidAmount, 100);
  assert.equal(details.payments.length, 2);
  assert.equal(details.audit.filter((entry) => entry.action === 'PAYMENT').length, 2);

  service.addAttachment(eventId, {
    fileName: 'receipt.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,AA==',
  });
  assert.equal(service.getEventDetails(eventId).attachments.length, 1);

  const branch = db.query<{ id: string }>("SELECT id FROM branches WHERE is_main = 1 LIMIT 1")[0];
  const customer = db.query<{ id: string }>('SELECT id FROM customers ORDER BY id LIMIT 1')[0];
  const warehouse = db.query<{ id: string }>(
    'SELECT id FROM warehouses WHERE branch_id = ? AND is_active = 1 ORDER BY is_default DESC LIMIT 1',
    [branch?.id]
  )[0];
  assert.ok(branch?.id && customer?.id && warehouse?.id, 'Calendar invoice fixture should have a branch, customer, and warehouse.');

  const invoiceId = `si_calendar_${uuidv4()}`;
  const invoiceNumber = `CAL-${uuidv4().slice(0, 8)}`;
  db.run(`
    INSERT INTO sales_invoices (
      id, invoice_number, date, due_date, customer_id, warehouse_id, branch_id,
      subtotal, total_amount, paid_amount, remaining_amount, payment_type,
      payment_status, invoice_status, created_by
    ) VALUES (?, ?, '2099-01-01', ?, ?, ?, ?, 100, 100, 0, 100, 'CREDIT', 'UNPAID', 'COMPLETED', ?)
  `, [invoiceId, invoiceNumber, dueDate, customer.id, warehouse.id, branch.id, admin.id]);

  const sourceInvoice = service.getEvents(dueDate, dueDate).find((event) => event.id === `sales_invoice:${invoiceId}`);
  assert.ok(sourceInvoice, 'Unpaid invoices should appear in the calendar automatically.');
  assert.equal(sourceInvoice.sourceType, 'SALES_INVOICE');

  service.recordPayment({
    eventId: sourceInvoice.id,
    amount: 40,
    paymentDate: '2099-01-20',
    reference: `CAL-PAY-${uuidv4()}`,
    paymentType: 'CASH',
    registerId: 'cr_main',
  });
  const updatedInvoice = db.query<{ remainingAmount: number; paymentStatus: string }>(
    'SELECT remaining_amount AS remainingAmount, payment_status AS paymentStatus FROM sales_invoices WHERE id = ?',
    [invoiceId]
  )[0];
  assert.equal(updatedInvoice?.remainingAmount, 60);
  assert.equal(updatedInvoice?.paymentStatus, 'PARTIAL');
  assert.ok(db.query(
    "SELECT id FROM journal_entries WHERE reference_type = 'CUSTOMER_PAYMENT' AND reference_id IN (SELECT id FROM customer_payments WHERE invoice_id = ?)",
    [invoiceId]
  ).length > 0, 'Invoice collection should post using the existing accounting service.');
});
