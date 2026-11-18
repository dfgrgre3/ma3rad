'use strict';

process.env.NODE_ENV = 'test';
process.env.CENTRAL_DISABLE_STARTUP_CHECK = '1';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');
const { initDatabase, getDb, bootstrapDefaults, seedPlatformRBAC } = require('../lib/db');
const { initSigningKeys } = require('../lib/signing');
const { invalidatePermissionsCache } = require('../identity');
const { tempDbPath, removeDbFiles, startTestServer, api } = require('./helpers.cjs');

const dbPath = tempDbPath('billing');
let server;
let token;

async function login(username, password) {
  const response = await api(server.base, '/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, response.text);
  return response.body.data.token;
}

async function createTenant(name, code) {
  const response = await api(server.base, '/api/v1/admin/tenants', {
    method: 'POST', token,
    body: { name, code },
  });
  assert.equal(response.status, 201, response.text);
  return response.body.data.id;
}

function invoiceBody(tenantId, number, items, extra = {}) {
  return { tenantId, number, issueDate: '2026-01-01', items, ...extra };
}

before(async () => {
  await initDatabase({ filename: dbPath });
  await initSigningKeys();
  await bootstrapDefaults({ initialPassword: 'admin-test-pass' });
  await seedPlatformRBAC();
  invalidatePermissionsCache();
  server = await startTestServer(createApp());
  token = await login('admin', 'admin-test-pass');
});

after(async () => {
  await server?.close();
  await getDb().close();
  removeDbFiles(dbPath);
});

test('central invoices persist items and recompute totals with camelCase responses', async () => {
  const tenantId = await createTenant('Billing One', 'BILLONE');
  const created = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(tenantId, 'INV-BILL-1', [
      { description: 'License', quantity: 2, unitPrice: 100 },
      { description: 'Support', quantity: 1, unitPrice: 50 },
    ], { discount: 5, tax: 10, currency: 'EGP', notes: 'Test invoice' }),
  });
  assert.equal(created.status, 201, created.text);
  const invoice = created.body.data;
  assert.equal(invoice.tenantId, tenantId);
  assert.equal(invoice.subtotal, 250);
  assert.equal(invoice.discount, 5);
  assert.equal(invoice.tax, 10);
  assert.equal(invoice.total, 255);
  assert.equal(invoice.paidAmount, 0);
  assert.equal(invoice.items.length, 2);
  assert.equal(invoice.items[0].unitPrice, 100);
  assert.equal(invoice.items[0].total, 200);
  assert.equal(invoice.items[1].description, 'Support');

  const fetched = await api(server.base, `/api/v1/admin/billing/invoices/${invoice.id}`, { token });
  assert.equal(fetched.status, 200, fetched.text);
  assert.equal(fetched.body.data.items.length, 2);

  const listed = await api(server.base, `/api/v1/admin/billing/invoices?status=DRAFT&search=BILL-1`, { token });
  assert.equal(listed.status, 200, listed.text);
  assert.ok(listed.body.data.some((row) => row.id === invoice.id));

  const badStatus = await api(server.base, `/api/v1/admin/billing/invoices/${invoice.id}/status`, {
    method: 'POST', token, body: { status: 'NOT_A_STATUS' },
  });
  assert.equal(badStatus.status, 400);

  const sent = await api(server.base, `/api/v1/admin/billing/invoices/${invoice.id}/status`, {
    method: 'POST', token, body: { status: 'SENT' },
  });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.body.data.status, 'SENT');

  const voided = await api(server.base, `/api/v1/admin/billing/invoices/${invoice.id}/void`, {
    method: 'POST', token,
  });
  assert.equal(voided.status, 200, voided.text);
  assert.equal(voided.body.data.status, 'VOID');

  const missingTenant = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody('tenant_missing', 'INV-BILL-BAD', [{ description: 'X', quantity: 1, unitPrice: 1 }]),
  });
  assert.equal(missingTenant.status, 404);

  const missingNumber = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token, body: { tenantId },
  });
  assert.equal(missingNumber.status, 400);
});

test('central payments update paid amounts and reverse them on deletion', async () => {
  const tenantId = await createTenant('Billing Two', 'BILLTWO');
  const created = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(tenantId, 'INV-BILL-2', [{ description: 'License', quantity: 3, unitPrice: 100 }], {
      status: 'SENT',
    }),
  });
  assert.equal(created.status, 201, created.text);
  const invoiceId = created.body.data.id;

  const invalidAmount = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 0, method: 'CASH' },
  });
  assert.equal(invalidAmount.status, 400);

  const first = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token,
    body: { tenantId, invoiceId, amount: 100, method: 'CASH', reference: 'CASH-1' },
  });
  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.data.amount, 100);
  assert.equal(first.body.data.invoiceId, invoiceId);
  assert.equal(first.body.data.reference, 'CASH-1');

  let refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.status, 'PARTIAL');
  assert.equal(refreshed.body.data.paidAmount, 100);

  const second = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 200, method: 'BANK' },
  });
  assert.equal(second.status, 201, second.text);
  refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.status, 'PAID');
  assert.equal(refreshed.body.data.paidAmount, 300);

  const list = await api(server.base, `/api/v1/admin/billing/payments?invoiceId=${invoiceId}`, { token });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.body.data.length, 2);

  const otherTenantInvoice = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token,
    body: { tenantId: 'tenant_missing', invoiceId, amount: 10 },
  });
  assert.equal(otherTenantInvoice.status, 404);

  const removed = await api(server.base, `/api/v1/admin/billing/payments/${second.body.data.id}`, {
    method: 'DELETE', token,
  });
  assert.equal(removed.status, 200, removed.text);
  refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.status, 'PARTIAL');
  assert.equal(refreshed.body.data.paidAmount, 100);

  const blockedVoid = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}/void`, {
    method: 'POST', token,
  });
  assert.equal(blockedVoid.status, 409);
});

test('payments cannot exceed the invoice balance and status stays consistent', async () => {
  const tenantId = await createTenant('Billing Guard', 'BILLGUARD');
  const created = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(tenantId, 'INV-GUARD-1', [{ description: 'License', quantity: 1, unitPrice: 300 }], {
      status: 'SENT',
    }),
  });
  assert.equal(created.status, 201, created.text);
  const invoiceId = created.body.data.id;

  // Overpayment must be rejected and leave paid_amount untouched.
  const overpay = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 500, method: 'CASH' },
  });
  assert.equal(overpay.status, 409, overpay.text);
  let refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.paidAmount, 0);
  assert.equal(refreshed.body.data.status, 'SENT');

  const partial = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 100, method: 'CASH' },
  });
  assert.equal(partial.status, 201, partial.text);
  refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.status, 'PARTIAL');

  // A partially paid invoice cannot be pushed back to SENT.
  const badTransition = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}/status`, {
    method: 'POST', token, body: { status: 'SENT' },
  });
  assert.equal(badTransition.status, 409);

  // Paying the remaining balance succeeds; a further payment is rejected.
  const remainder = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 200, method: 'BANK' },
  });
  assert.equal(remainder.status, 201, remainder.text);
  refreshed = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}`, { token });
  assert.equal(refreshed.body.data.status, 'PAID');
  assert.equal(refreshed.body.data.paidAmount, 300);

  const extra = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId, amount: 1, method: 'CASH' },
  });
  assert.equal(extra.status, 409);

  // A PAID invoice cannot be voided or have its status changed manually.
  const voidPaid = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}/void`, {
    method: 'POST', token,
  });
  assert.equal(voidPaid.status, 409);
  const paidTransition = await api(server.base, `/api/v1/admin/billing/invoices/${invoiceId}/status`, {
    method: 'POST', token, body: { status: 'OVERDUE' },
  });
  assert.equal(paidTransition.status, 409);

  // A VOID invoice rejects new payments.
  const voidedInvoice = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(tenantId, 'INV-GUARD-2', [{ description: 'X', quantity: 1, unitPrice: 50 }], {
      status: 'SENT',
    }),
  });
  const voidId = voidedInvoice.body.data.id;
  const voided = await api(server.base, `/api/v1/admin/billing/invoices/${voidId}/void`, {
    method: 'POST', token,
  });
  assert.equal(voided.status, 200, voided.text);
  const payVoid = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token, body: { tenantId, invoiceId: voidId, amount: 10, method: 'CASH' },
  });
  assert.equal(payVoid.status, 409);
});

test('limited platform staff only sees invoices and payments inside their tenant scope', async () => {
  const allowedTenant = await createTenant('Billing Scoped', 'BILLSCOPED');
  const deniedTenant = await createTenant('Billing Other', 'BILLOTHER');

  const allowedInvoice = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(allowedTenant, 'INV-SCOPE-A', [{ description: 'A', quantity: 1, unitPrice: 50 }]),
  });
  const deniedInvoice = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token,
    body: invoiceBody(deniedTenant, 'INV-SCOPE-B', [{ description: 'B', quantity: 1, unitPrice: 70 }]),
  });
  assert.equal(allowedInvoice.status, 201, allowedInvoice.text);
  assert.equal(deniedInvoice.status, 201, deniedInvoice.text);

  const deniedPayment = await api(server.base, '/api/v1/admin/billing/payments', {
    method: 'POST', token,
    body: { tenantId: deniedTenant, invoiceId: deniedInvoice.body.data.id, amount: 70 },
  });
  assert.equal(deniedPayment.status, 201, deniedPayment.text);

  const staff = await api(server.base, '/api/v1/admin/staff', {
    method: 'POST', token,
    body: {
      username: 'billing-scoped', password: 'billing-scoped-pass', role: 'STAFF',
      permissions: [
        'platform.billing.view', 'platform.billing.create', 'platform.billing.update',
        'platform.billing.delete', 'platform.billing.approve',
      ],
    },
  });
  assert.equal(staff.status, 201, staff.text);
  const db = getDb();
  await db.run(`UPDATE platform_users SET data_scope = 'LIMITED' WHERE id = ?`, [staff.body.data.id]);
  await db.run(
    `INSERT INTO platform_scopes (user_id, scope_type, scope_id) VALUES (?, 'TENANT', ?)`,
    [staff.body.data.id, allowedTenant]
  );
  invalidatePermissionsCache();
  const scopedToken = await login('billing-scoped', 'billing-scoped-pass');

  const invoices = await api(server.base, '/api/v1/admin/billing/invoices', { token: scopedToken });
  assert.equal(invoices.status, 200, invoices.text);
  assert.ok(invoices.body.data.some((row) => row.id === allowedInvoice.body.data.id));
  assert.ok(!invoices.body.data.some((row) => row.id === deniedInvoice.body.data.id));

  const blockedInvoiceRead = await api(
    server.base, `/api/v1/admin/billing/invoices/${deniedInvoice.body.data.id}`, { token: scopedToken }
  );
  assert.equal(blockedInvoiceRead.status, 403);

  const blockedInvoiceCreate = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token: scopedToken,
    body: invoiceBody(deniedTenant, 'INV-SCOPE-C', [{ description: 'C', quantity: 1, unitPrice: 10 }]),
  });
  assert.equal(blockedInvoiceCreate.status, 403);

  const allowedInvoiceCreate = await api(server.base, '/api/v1/admin/billing/invoices', {
    method: 'POST', token: scopedToken,
    body: invoiceBody(allowedTenant, 'INV-SCOPE-D', [{ description: 'D', quantity: 1, unitPrice: 10 }]),
  });
  assert.equal(allowedInvoiceCreate.status, 201, allowedInvoiceCreate.text);

  const payments = await api(server.base, '/api/v1/admin/billing/payments', { token: scopedToken });
  assert.equal(payments.status, 200, payments.text);
  assert.ok(!payments.body.data.some((row) => row.id === deniedPayment.body.data.id));

  const blockedPaymentDelete = await api(
    server.base, `/api/v1/admin/billing/payments/${deniedPayment.body.data.id}`,
    { method: 'DELETE', token: scopedToken }
  );
  assert.equal(blockedPaymentDelete.status, 403);
});
