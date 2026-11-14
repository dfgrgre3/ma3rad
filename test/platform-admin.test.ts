import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import {
  PlatformAdminService,
  platformAdminService,
} from '../src/services/domains/platform/PlatformAdminService.ts';

test('platform owner account is seeded with the SUPER_ADMIN role', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const row = db.query<any>(`SELECT id, username, role, is_active AS isActive FROM users WHERE username = 'platform'`)[0];
  assert.ok(row, 'platform account should exist');
  assert.equal(row.role, 'SUPER_ADMIN');
  assert.equal(Boolean(row.isActive), true);
});

test('platform service refuses non-owner sessions', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();

  AuthService.login('admin', 'admin123');
  assert.equal(PlatformAdminService.isPlatformOwner(AuthService.getCurrentUser()), false);
  assert.throws(() => platformAdminService.listTenants(), /مالك المنصة/);
  AuthService.logout();
});

test('platform owner can manage tenants, licenses, invoices and payments', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  AuthService.login('platform', 'Platform@2026');

  const owner = AuthService.getCurrentUser();
  assert.ok(owner);
  assert.equal(owner!.role, 'SUPER_ADMIN');
  assert.equal(PlatformAdminService.isPlatformOwner(owner), true);

  // Overview should load for the owner.
  const overview = platformAdminService.getOverview();
  assert.ok(overview.tenants.total >= 0);

  // Plans seeded by the migration.
  const plans = platformAdminService.listPlans();
  assert.ok(plans.length >= 1, 'expected seeded plans');
  const plan = plans.find((item) => item.isDefault) ?? plans[0];

  // Create a tenant.
  const suffix = Date.now().toString().slice(-6);
  const tenant = platformAdminService.createTenant({
    name: `معرض اختبار ${suffix}`,
    code: `TEST${suffix}`,
    phone: '01000000000',
    status: 'TRIAL',
    planId: plan.id,
    seatsLimit: 3,
  });
  assert.equal(tenant.name, `معرض اختبار ${suffix}`);
  assert.equal(tenant.planId, plan.id);

  // Issue a license for the tenant.
  const license = platformAdminService.issueLicense(tenant.id, plan.id, { months: 6, seats: 4 });
  assert.equal(license.tenantId, tenant.id);
  assert.match(license.licenseKey, /^CS-/);
  assert.equal(license.seats, 4);

  // Renew, bind a device and change status.
  const renewed = platformAdminService.renewLicense(license.id, 12);
  assert.ok(renewed.expiresAt);
  platformAdminService.bindLicenseHardware(license.id, 'HW-TEST-001');
  assert.equal(platformAdminService.getLicense(license.id)?.hardwareId, 'HW-TEST-001');

  // Dashboard overview reflects devices, modules, subscriptions and alerts.
  const dashboard = platformAdminService.getOverview();
  assert.ok(dashboard.subscriptions.total >= 1);
  assert.ok(dashboard.devices.boundLicenses >= 1);
  assert.ok(dashboard.branches.totalLimit >= 1);
  assert.ok(dashboard.moduleUsage.length >= 1);
  assert.ok(dashboard.moduleUsage.some((item) => item.licenseCount >= 1));
  assert.ok(Array.isArray(dashboard.alerts));
  assert.ok(dashboard.alerts.some((alert) => alert.id === 'default-platform-password'));
  assert.ok(dashboard.recentAudit.length >= 1);

  // Create an invoice and record a partial payment.
  const invoice = platformAdminService.createInvoice({
    tenantId: tenant.id,
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    tax: 100,
    items: [{ description: 'اشتراك تجريبي', quantity: 1, unitPrice: 1000 }],
  });
  assert.equal(invoice.subtotal, 1000);
  assert.equal(invoice.total, 1100);
  assert.equal(invoice.status, 'DRAFT');

  platformAdminService.setInvoiceStatus(invoice.id, 'SENT');
  const payment = platformAdminService.addPayment({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 400,
    method: 'CASH',
  });
  assert.equal(payment.amount, 400);
  assert.equal(payment.invoiceId, invoice.id);
  assert.equal(payment.invoiceNumber, invoice.number);

  const partial = platformAdminService.getInvoice(invoice.id)!;
  assert.equal(partial.paidAmount, 400);
  assert.equal(partial.status, 'PARTIAL');

  // Voiding the payment recalculates the invoice back to SENT.
  platformAdminService.voidPayment(payment.id);
  const restored = platformAdminService.getInvoice(invoice.id)!;
  assert.equal(restored.paidAmount, 0);
  assert.equal(restored.status, 'SENT');

  // Tenant status changes are reflected on the tenant list.
  platformAdminService.setTenantStatus(tenant.id, 'SUSPENDED');
  assert.equal(platformAdminService.getTenant(tenant.id)?.status, 'SUSPENDED');

  // Settings round-trip.
  const settings = platformAdminService.updateSettings({ defaultTrialDays: 21, invoicePrefix: 'TEST-INV' });
  assert.equal(settings.defaultTrialDays, 21);
  assert.equal(settings.invoicePrefix, 'TEST-INV');

  // Audit log captures the operations.
  const audit = platformAdminService.listAudit(200, '');
  assert.ok(audit.some((entry) => entry.entityType === 'TENANT' && entry.entityId === tenant.id));
  assert.ok(audit.some((entry) => entry.entityType === 'PAYMENT'));

  // Clean up so reruns stay deterministic.
  platformAdminService.archiveTenant(tenant.id);
  AuthService.logout();
});

test('tenant central file: account, activation, plan change, renew, devices and cancel', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  AuthService.login('platform', 'Platform@2026');

  const plans = platformAdminService.listPlans().filter((plan) => plan.isActive);
  assert.ok(plans.length >= 1);
  const plan = plans.find((item) => item.isDefault) ?? plans[0];
  const otherPlan = plans.find((item) => item.id !== plan.id) ?? plan;
  const suffix = Date.now().toString().slice(-6);

  const tenant = platformAdminService.createTenant({
    name: `ملف عميل ${suffix}`,
    code: `FILE${suffix}`,
    contactName: 'مسؤول الاختبار',
    email: `file${suffix}@example.com`,
    phone: '01011112222',
    country: 'مصر',
    city: 'القاهرة',
    address: 'شارع الاختبار 12',
    businessType: 'معرض سيراميك',
    planId: plan.id,
    seatsLimit: 4,
    branchesLimit: 2,
    devicesLimit: 3,
  });
  assert.equal(tenant.address, 'شارع الاختبار 12');
  assert.equal(tenant.planId, plan.id);

  // Account issue, activation details and profile.
  const created = platformAdminService.createTenantAccount(tenant.id, {
    username: `file${suffix}`,
    email: `file${suffix}@example.com`,
    fullName: 'مسؤول الاختبار',
  });
  assert.equal(created.account.tenantId, tenant.id);
  assert.equal(created.account.isActive, true);
  assert.ok(created.temporaryPassword.length >= 8);
  assert.ok(created.account.activationCode);
  assert.throws(() => platformAdminService.createTenantAccount(tenant.id), /حساب/);

  const license = platformAdminService.issueLicense(tenant.id, plan.id, { months: 12, seats: 4 });
  platformAdminService.bindLicenseHardware(license.id, 'HW-FILE-001');

  const profile = platformAdminService.getTenantProfile(tenant.id);
  assert.equal(profile.tenant.id, tenant.id);
  assert.ok(profile.account, 'profile should include the login account');
  assert.equal(profile.usage.devicesUsed, 1);
  assert.ok(profile.licenses.length >= 1);
  assert.ok(profile.activationLog.length >= 1);
  assert.ok(profile.changeLog.length >= 1);
  assert.ok(profile.activityLog.length >= 1);

  const activation = platformAdminService.sendTenantActivation(tenant.id, ['EMAIL', 'SMS']);
  assert.equal(activation.username, created.account.username);
  assert.ok(activation.activationCode);
  assert.equal(activation.licenseKey, license.licenseKey);
  assert.deepEqual(activation.modules, license.modules);

  // Device reset releases the bound device.
  const released = platformAdminService.resetTenantDevices(tenant.id);
  assert.equal(released, 1);
  assert.equal(platformAdminService.getLicense(license.id)?.hardwareId, null);

  // Move the customer to another plan.
  const moved = platformAdminService.changeTenantPlan(tenant.id, otherPlan.id, { months: 6, seats: 5 });
  assert.equal(moved.planId, otherPlan.id);
  assert.equal(moved.status, 'ACTIVE');
  const movedProfile = platformAdminService.getTenantProfile(tenant.id);
  assert.ok(movedProfile.subscriptions.some((item) => item.planId === otherPlan.id && item.status === 'ACTIVE'));
  assert.ok(movedProfile.licenses.some((item) => item.planId === otherPlan.id && item.status === 'ACTIVE'));

  // Renewal extends the subscription.
  const before = platformAdminService.getTenant(tenant.id)!.subscriptionExpiresAt!;
  const renewed = platformAdminService.renewTenantSubscription(tenant.id, 6);
  assert.ok(renewed.subscriptionExpiresAt);
  assert.ok(new Date(renewed.subscriptionExpiresAt!).getTime() > new Date(before).getTime());

  // Password reset and account suspension.
  const reset = platformAdminService.resetTenantAccountPassword(tenant.id);
  assert.ok(reset.temporaryPassword.length >= 8);
  const suspendedAccount = platformAdminService.setTenantAccountActive(tenant.id, false);
  assert.equal(suspendedAccount.isActive, false);

  // Cancelling the subscription revokes licences and disables the account.
  const cancelled = platformAdminService.cancelTenantSubscription(tenant.id, 'اختبار');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(platformAdminService.getTenantAccount(tenant.id)?.isActive, false);
  const cancelledProfile = platformAdminService.getTenantProfile(tenant.id);
  assert.ok(cancelledProfile.licenses.every((item) => item.status !== 'ACTIVE'));

  platformAdminService.archiveTenant(tenant.id);
  AuthService.logout();
});
