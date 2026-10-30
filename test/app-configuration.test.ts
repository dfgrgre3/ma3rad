import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { AppConfigService } from '../src/services/AppConfigService.ts';
import { NavigationService } from '../src/services/NavigationService.ts';
import { PrintService } from '../src/services/PrintService.ts';
import {
  APP_CONFIG_SCHEMA_VERSION,
  formatDocumentNumber,
  parseAppConfigSnapshot,
  validateAppConfigEntry,
  validateAppConfigRule,
  type AppConfigEntry,
} from '../src/config/appConfiguration.ts';

const entry = (domain: AppConfigEntry['domain'], key: string, patch: Partial<AppConfigEntry> = {}): AppConfigEntry => ({
  domain,
  key,
  enabled: true,
  label: '',
  value: '',
  props: {},
  ...patch,
});

test('app configuration validates targets, rules and number templates', () => {
  assert.equal(validateAppConfigEntry(entry('page', '/sales')).key, '/sales');
  assert.throws(() => validateAppConfigEntry(entry('page', 'sales')), /شرطة مائلة/);
  assert.throws(() => validateAppConfigEntry(entry('unknown' as AppConfigEntry['domain'], '/sales')), /غير معروف/);
  assert.throws(() => validateAppConfigEntry(entry('text', 'bad key!')), /غير صالح/);

  assert.equal(validateAppConfigRule({
    id: 'r1', kind: 'text', pagePath: '/sales', matchText: 'المخزون', replacementText: 'المستودع', action: 'text', enabled: true,
  }).pagePath, '/sales');
  assert.equal(validateAppConfigRule({
    id: 'r2', kind: 'selector', pagePath: '/sales', selector: '#x', action: 'hide',
  }).selector, '#x');
  assert.throws(() => validateAppConfigRule({
    id: 'r3', kind: 'selector', pagePath: '/sales', selector: '', action: 'hide', enabled: true,
  }), /محدد العنصر/);

  assert.throws(() => parseAppConfigSnapshot({ schemaVersion: 99, entries: [], rules: [] }), /غير مدعوم/);
  assert.deepEqual(parseAppConfigSnapshot(''), { schemaVersion: APP_CONFIG_SCHEMA_VERSION, entries: [], rules: [] });

  assert.equal(formatDocumentNumber('{prefix}-{year}-{seq:4}', { prefix: 'INV', seq: 12, date: new Date('2026-03-04T00:00:00Z') }), 'INV-2026-0012');
  assert.equal(formatDocumentNumber('{prefix}/{month}/{day}/{seq:2}', { prefix: 'A', seq: 7, date: new Date('2026-03-04T00:00:00Z') }), 'A/03/04/07');
});

test('app configuration persists visibility, labels, text, policies and versions', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  AppConfigService.reset(admin);

  AppConfigService.saveConfig({
    entries: [
      entry('page', '/sales', { enabled: false }),
      entry('page', '/dashboard', { label: 'لوحة القيادة المخصصة', order: -5 }),
      entry('section', '/dashboard#sec-pulse', { enabled: false, label: 'نبض مخفي' }),
      entry('field', 'sales.invoice#customer', { enabled: false, required: true, label: 'العميل الإلزامي' }),
      entry('text', 'shell.brand.name', { value: 'علامتي' }),
      entry('policy', 'sales.discountApprovalThreshold', { value: '25', props: { type: 'number' } }),
      entry('numbering', 'INV', { props: { template: '{prefix}/{year}/{seq:4}' } }),
    ],
    rules: [
      { id: 'rule_hide', kind: 'selector', pagePath: '/dashboard', selector: '#sec-sales', action: 'hide', enabled: true },
      { id: 'rule_text', kind: 'text', pagePath: '*', matchText: 'إجمالي المبيعات', replacementText: 'المبيعات الكلية', action: 'text', enabled: true },
    ],
  }, 'اختبار محرك التكوين', admin);

  assert.equal(AppConfigService.isPageEnabled('/sales'), false);
  assert.equal(AppConfigService.isPageEnabled('/dashboard'), true);
  assert.equal(AppConfigService.getPageLabel('/dashboard', 'قديم'), 'لوحة القيادة المخصصة');
  assert.equal(AppConfigService.getPage('/dashboard').order, -5);
  assert.equal(AppConfigService.getSection('/dashboard', 'sec-pulse').enabled, false);
  assert.equal(AppConfigService.getField('sales.invoice', 'customer').visible, false);
  assert.equal(AppConfigService.getField('sales.invoice', 'customer').required, true);
  assert.equal(AppConfigService.getField('sales.invoice', 'customer').label, 'العميل الإلزامي');
  assert.equal(AppConfigService.getText('shell.brand.name', 'سيراميسيس'), 'علامتي');
  assert.equal(AppConfigService.getPolicyNumber('sales.discountApprovalThreshold', 10), 25);
  assert.equal(AppConfigService.getPolicyBoolean('pricing.requirePriceChangeApproval', true), true);
  assert.deepEqual(AppConfigService.getNumbering('INV'), {
    prefix: 'INV', template: '{prefix}/{year}/{seq:4}', resetYearly: true,
  });

  assert.equal(AppConfigService.getSelectorsForPage('/dashboard').length, 1);
  assert.equal(AppConfigService.getTextRulesForPage('/sales').length, 1);

  const versions = AppConfigService.getVersions(10, admin);
  assert.ok(versions.length >= 1);
  assert.equal(versions[0].snapshot.entries.length, 7);

  // Navigation and route state share the same page override.
  const groups = NavigationService.getGroups();
  const allItems = groups.flatMap((group) => group.items);
  assert.equal(allItems.some((item) => item.to === '/sales'), false);
  const dashboard = allItems.find((item) => item.to === '/dashboard');
  assert.equal(dashboard?.label, 'لوحة القيادة المخصصة');

  // Numbering hook used by every document service.
  DatabaseManager.getInstance().run(
    'INSERT OR IGNORE INTO sequence_counters (name, value) VALUES (?, 0)',
    ['INV'],
  );
  DatabaseManager.getInstance().run('UPDATE sequence_counters SET value = 0 WHERE name = ?', ['INV']);
  AppConfigService.installNumbering();
  const number = DatabaseManager.getInstance().nextNumber('INV');
  assert.match(number, /^INV\/\d{4}\/0001$/);

  // Export → reset → import round-trip.
  const exported = AppConfigService.exportJson(admin);
  AppConfigService.reset(admin);
  assert.equal(AppConfigService.isPageEnabled('/sales'), true);
  AppConfigService.importJson(exported, admin);
  assert.equal(AppConfigService.isPageEnabled('/sales'), false);

  // Restoring a version returns the configuration captured at that point.
  const targetVersion = versions.find((version) => version.snapshot.entries.length === 7);
  assert.ok(targetVersion);
  AppConfigService.restoreVersion(targetVersion.id, admin);
  assert.equal(AppConfigService.getText('shell.brand.name', 'x'), 'علامتي');
});

test('app configuration overrides printed document titles and footers', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const admin = AuthService.login('admin', 'admin123');
  AppConfigService.reset(admin);
  AppConfigService.saveConfig({
    entries: [
      entry('print', 'sales.invoice.a4', { value: 'فاتورة معرض خاصة' }),
      entry('print', 'sales.invoice.a4.footer', { value: 'شكرًا لتعاملكم معنا' }),
    ],
    rules: [],
  }, 'اختبار الطباعة', admin);

  assert.equal(AppConfigService.getPrintTemplate('sales.invoice.a4', 'افتراضي'), 'فاتورة معرض خاصة');
  const html = new PrintService().getInvoiceHtml({
    invoiceNumber: 'INV-TEST-1',
    date: '2026-10-30',
    items: [],
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    taxPercentage: 0,
    shippingCost: 0,
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    paymentType: 'CASH',
    customerName: 'عميل نقدي',
    customerPhone: '',
    warehouseName: '',
    notes: '',
  } as any);
  assert.match(html, /فاتورة معرض خاصة/);
  assert.match(html, /شكرًا لتعاملكم معنا/);
});

test('app configuration rejects writes without permission', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  AuthService.logout();
  assert.throws(
    () => AppConfigService.saveConfig({ entries: [], rules: [] }, 'بدون صلاحية', null),
    /غير مصرح|تسجيل الدخول/,
  );
  AuthService.login('admin', 'admin123');
});
