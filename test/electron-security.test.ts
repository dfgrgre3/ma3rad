import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

test('route guards use the same permissions as navigation entries', () => {
  assert.equal(NavigationService.getRequiredPermission('/sales/cycle'), 'sales.view');
  assert.equal(NavigationService.getRequiredPermission('/purchases/returns'), 'purchases.return');
  assert.equal(NavigationService.getRequiredPermission('/finance/installments'), 'finance.installments.view');
  assert.equal(NavigationService.getRequiredPermission('/admin/data-deletion'), 'admin.data');
  assert.equal(NavigationService.getRequiredPermission('/products/prod-1'), 'products.view');
  assert.equal(NavigationService.getRequiredPermission('/unmapped-route'), null);
});
