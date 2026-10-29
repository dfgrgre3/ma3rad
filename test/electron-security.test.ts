import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseManager } from '../src/database/db.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { NavigationService } from '../src/services/NavigationService.ts';

const require = createRequire(import.meta.url);
const { isAllowedAppUrl, isAllowedIpcSender } = require('../electron/security.js');
const {
  isAllowedNetworkPrinterAddress,
  isAllowedNetworkPrinterPort,
  isValidPrintBytes,
} = require('../electron/printing.js');

const origins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

test('IPC security: production IPC only accepts the exact packaged app main frame', () => {
  const appHtmlPath = path.resolve('dist', 'index.html');
  const trustedUrl = `${pathToFileURL(appHtmlPath).href}#/dashboard`;
  const frame = { url: trustedUrl };
  const event = { senderFrame: frame, sender: { mainFrame: frame } };
  const options = { isPackaged: true, appHtmlPath, allowedOrigins: origins };

  assert.equal(isAllowedIpcSender(event, options), true);
  assert.equal(isAllowedAppUrl(pathToFileURL(path.resolve('index.html')).href, options), false);
  assert.equal(isAllowedAppUrl(`${pathToFileURL(appHtmlPath).href}?unexpected=1`, options), false);
  assert.equal(isAllowedIpcSender({ ...event, senderFrame: { url: trustedUrl } }, options), false);
});

test('IPC security: development IPC is limited to the configured local app origins', () => {
  const options = { isPackaged: false, appHtmlPath: '', allowedOrigins: origins };
  assert.equal(isAllowedAppUrl('http://localhost:5173/', options), true);
  assert.equal(isAllowedAppUrl('http://localhost:5173/index.html#/dashboard', options), true);
  assert.equal(isAllowedAppUrl('http://localhost:5174/', options), false);
  assert.equal(isAllowedAppUrl('http://localhost:5173/untrusted.html', options), false);
  assert.equal(isAllowedAppUrl('https://localhost:5173/', options), false);
});

test('network printing only accepts private IPv4 addresses and TCP port 9100', () => {
  for (const address of ['10.0.0.4', '172.16.2.3', '172.31.255.254', '192.168.1.25', '169.254.4.5']) {
    assert.equal(isAllowedNetworkPrinterAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '172.32.0.1', '127.0.0.1', 'localhost', 'printer.local', '::1']) {
    assert.equal(isAllowedNetworkPrinterAddress(address), false, address);
  }
  assert.equal(isAllowedNetworkPrinterPort(9100), true);
  assert.equal(isAllowedNetworkPrinterPort('9100'), true);
  assert.equal(isAllowedNetworkPrinterPort(9101), false);
  assert.equal(isAllowedNetworkPrinterPort(undefined), false);
});

test('network printing validates byte arrays and caps their size', () => {
  assert.equal(isValidPrintBytes([0, 127, 255], 3), true);
  assert.equal(isValidPrintBytes([0, 256], 3), false);
  assert.equal(isValidPrintBytes([0, -1], 3), false);
  assert.equal(isValidPrintBytes([0, 1], 1), false);
  assert.equal(isValidPrintBytes(new Uint8Array([0, 1]), 3), false);
});

test('route guards use the same permissions as navigation entries', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const protectedRoutes: Array<[string, string]> = [
    ['/sales/cycle', 'sales.view'],
    ['/purchases/returns', 'purchases.return'],
    ['/finance/installments', 'finance.installments.view'],
    ['/finance/expenses', 'cashier.expense'],
    ['/admin/data-deletion', 'admin.data.delete'],
    ['/products/prod-1', 'products.view'],
    ['/customers/cust-1', 'customers.view'],
    ['/employees/documents', 'hr.documents.view'],
    ['/inventory/transfers', 'inventory.transfer'],
    ['/tools', 'dashboard.view'],
  ];
  for (const [path, permission] of protectedRoutes) {
    assert.equal(NavigationService.getRequiredPermission(path), permission, path);
  }
  assert.equal(NavigationService.getRequiredPermission('/unmapped-route'), null);
  assert.deepEqual(
    NavigationService.getRequiredPermissions('/sales/statement'),
    ['customers.view', 'sales.view', 'finance.debts.view']
  );
  assert.ok(!NavigationService.getAccessibleGroups(null)
    .flatMap((group) => group.items)
    .some((item) => item.to === '/sales/statement'));
});

test('navigation only exposes pages granted to the current user', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    'INSERT INTO roles (id, code, name) VALUES (?, ?, ?)',
    ['role_route_visibility_test', 'ROUTE_VISIBILITY_TEST', 'اختبار إظهار الصفحات']
  );
  db.run(
    'INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
    ['ROUTE_VISIBILITY_TEST', 'products.view']
  );
  const user = {
    id: 'usr_route_visibility_test',
    username: 'route_visibility_test',
    fullName: 'اختبار الصلاحيات',
    role: 'ROUTE_VISIBILITY_TEST',
    phone: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };

  try {
    PermissionService.invalidate(user);
    const groups = NavigationService.getAccessibleGroups(user);
    const paths = groups.flatMap((group) => group.items.map((item) => item.to));
    assert.deepEqual(paths, ['/products', '/products/attributes', '/products/barcodes']);
    assert.equal(NavigationService.getFirstAccessiblePath(user), '/products');
  } finally {
    PermissionService.invalidate(user);
    db.run('DELETE FROM roles WHERE code = ?', ['ROUTE_VISIBILITY_TEST']);
  }
});
