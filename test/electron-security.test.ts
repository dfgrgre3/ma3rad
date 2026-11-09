import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { PermissionService } from '../src/services/auth/PermissionService.ts';
import { AuthService } from '../src/services/auth/AuthService.ts';
import { NavigationService } from '../src/services/config/NavigationService.ts';
import { DATA_IMPORT_ACCESS_PERMISSIONS } from '../src/config/routePermissions.ts';

const require = createRequire(import.meta.url);
const {
  getAllowedExternalUrl,
  isAllowedAppUrl,
  isAllowedIpcSender,
  openExternalUrl,
} = require('../electron/security.js');
const {
  isAllowedNetworkPrinterAddress,
  isAllowedNetworkPrinterPort,
  isValidPrintBytes,
} = require('../electron/printing.js');
const {
  TailscaleService,
  isValidTailscaleAuthKey,
} = require('../electron/tailscaleService.js');

const origins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

test('password validation enforces the active configured policy', () => {
  const previous = localStorage.getItem('security_config');
  localStorage.setItem('security_config', JSON.stringify({
    passwordPolicy: {
      minLength: 10,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    },
  }));
  try {
    assert.doesNotThrow(() => AuthService.validatePasswordPolicy('StrongPass123!'));
    assert.throws(() => AuthService.validatePasswordPolicy('strongpass123!'), /حرف إنجليزي كبير/);
    assert.throws(() => AuthService.validatePasswordPolicy('StrongPassword!'), /رقم/);
    assert.throws(() => AuthService.validatePasswordPolicy('StrongPass123'), /رمز خاص/);
    assert.throws(() => AuthService.validatePasswordPolicy('Short1!'), /10/);
  } finally {
    if (previous === null) localStorage.removeItem('security_config');
    else localStorage.setItem('security_config', previous);
  }
});

test('external links allow web URLs only and report browser launch failures', async () => {
  assert.equal(getAllowedExternalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(getAllowedExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(getAllowedExternalUrl('javascript:alert(1)'), null);
  assert.equal(getAllowedExternalUrl('https://user:password@example.com'), null);
  assert.equal(getAllowedExternalUrl('not a URL'), null);

  const opened: string[] = [];
  const errors = [];
  const logger = { error: (...args: unknown[]) => errors.push(args) };
  assert.equal(openExternalUrl({ openExternal: (url: string) => { opened.push(url); } },
    'https://example.com', logger), true);
  assert.deepEqual(opened, ['https://example.com/']);
  assert.equal(openExternalUrl({ openExternal: () => { throw new Error('launch failed'); } },
    'https://example.com', logger), false);
  assert.equal(openExternalUrl({ openExternal: () => Promise.reject(new Error('launch failed')) },
    'https://example.com', logger), true);
  assert.equal(openExternalUrl({ openExternal: () => { throw new Error('must not run'); } },
    'javascript:alert(1)', logger), false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors.length, 2);
});

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

test('Tailscale accepts only bounded auth keys and passes CLI arguments separately', async () => {
  const validKey = `tskey-auth-${'a'.repeat(32)}`;
  assert.equal(isValidTailscaleAuthKey(validKey), true);
  for (const invalidKey of [
    `tskey-auth-${'a'.repeat(19)}`,
    `tskey-auth-${'a'.repeat(129)}`,
    `${validKey} & another-command`,
    `${validKey} `,
    `tskey-api-${'a'.repeat(32)}`,
  ]) {
    assert.equal(isValidTailscaleAuthKey(invalidKey), false, invalidKey);
  }

  const service = new TailscaleService();
  const commands: string[][] = [];
  service.runCommand = async (args: string[]) => {
    commands.push(args);
    return { ok: true };
  };

  assert.deepEqual(await service.connect(validKey), { ok: true });
  assert.deepEqual(await service.connect(), { ok: true });
  assert.deepEqual(await service.disconnect(), { ok: true });
  assert.deepEqual(await service.connect(`${validKey}&whoami`), {
    ok: false,
    error: 'Invalid Tailscale auth key.',
  });
  assert.deepEqual(commands, [
    ['up', '--unattended', '--authkey', validKey],
    ['up', '--unattended'],
    ['down'],
  ]);
});

test('Tailscale status exposes DNS names for HTTPS sync endpoints', async () => {
  const service = new TailscaleService();
  service.runCommand = async () => ({
    ok: true,
    stdout: JSON.stringify({
      Self: {
        HostName: 'gallery',
        DNSName: 'gallery.example-tailnet.ts.net.',
        TailscaleIPs: ['100.64.0.10'],
      },
      Peer: {
        peer1: {
          HostName: 'branch',
          DNSName: 'branch.example-tailnet.ts.net.',
          TailscaleIPs: ['100.64.0.11'],
          Online: true,
        },
      },
    }),
  });

  const status = await service.getStatus();
  assert.equal(status.dnsName, 'gallery.example-tailnet.ts.net');
  assert.equal(status.peers[0].dnsName, 'branch.example-tailnet.ts.net');
});

test('route guards use the same permissions as navigation entries', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  const protectedRoutes: Array<[string, string]> = [
    // The invoice-cycle page owns a granular view permission, with the legacy
    // `sales.view` kept as an accepted alternative.
    ['/sales/cycle', 'sales.cycle.view'],
    ['/purchases/returns', 'purchases.return'],
    // Legacy path redirects to the shared receivables hub; the selected tab
    // applies its own finer-grained permission inside that hub.
    ['/finance/installments', 'finance.view'],
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
    phone: undefined,
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

test('data import is reachable to users who can import an entity without settings.view', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    'INSERT INTO roles (id, code, name) VALUES (?, ?, ?)',
    ['role_data_import_test', 'DATA_IMPORT_TEST', 'اختبار استيراد البيانات']
  );
  db.run(
    'INSERT INTO role_permissions (role_code, permission_code) VALUES (?, ?)',
    ['DATA_IMPORT_TEST', 'customers.create']
  );
  const user = {
    id: 'usr_data_import_test',
    username: 'data_import_test',
    fullName: 'اختبار استيراد البيانات',
    role: 'DATA_IMPORT_TEST',
    phone: undefined,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };

  try {
    PermissionService.invalidate(user);
    const groups = NavigationService.getAccessibleGroups(user);
    const paths = groups.flatMap((group) => group.items.map((item) => item.to));
    assert.ok(paths.includes('/data-import'));
    assert.deepEqual(NavigationService.getRequiredPermissionGroups('/data-import'), {
      all: [],
      any: DATA_IMPORT_ACCESS_PERMISSIONS,
    });
  } finally {
    PermissionService.invalidate(user);
    db.run('DELETE FROM roles WHERE code = ?', ['DATA_IMPORT_TEST']);
  }
});
