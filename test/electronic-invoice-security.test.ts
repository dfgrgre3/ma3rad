import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { ElectronicInvoiceService } from '../src/services/domains/sales/ElectronicInvoiceService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';

test('electronic invoice reads require the dedicated view permission', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  AuthService.setCurrentUser({
    id: 'cashier_einvoice_test', username: 'cashier', fullName: 'Cashier', role: 'CASHIER',
    isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const service = new ElectronicInvoiceService();
  assert.throws(() => service.getAllElectronicInvoices());
  assert.throws(() => service.getElectronicInvoiceById('missing'));
  assert.throws(() => service.getElectronicInvoiceBySalesInvoice('missing'));
  assert.throws(() => service.getStats());
});
