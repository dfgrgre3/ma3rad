import './integration.setup.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager';
import { OperationalFieldService } from '../src/services/domains/products/OperationalFieldService';
import { AuthService } from '../src/services/domains/auth/AuthService';
import { PermissionService } from '../src/services/domains/auth/PermissionService';
import { operationalFieldsHtml, orderedInvoiceDetails } from '../src/services/shared/PrintService/invoiceHtmlHelpers';

test('operational fields render on printed documents', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  { const __u = AuthService.getCurrentUser(); if (__u) __u.mustChangePassword = false; }
  const svc = new OperationalFieldService();
  svc.ensureSeedDefinitions([
    { entityType: 'sales_invoices', code: 'TILE_AREA_M2', name: 'إجمالي المساحة (م²)', dataType: 'NUMBER' },
    { entityType: 'sales_invoices', code: 'CUTTING_REQUIRED', name: 'يتطلب قص وتقطيع', dataType: 'BOOLEAN' },
    { entityType: 'orders', code: 'CUT_SPECS', name: 'مقاسات القص / التقطيع', dataType: 'TEXT' },
  ]);
  const defs = svc.getDefinitions('sales_invoices');
  const area = defs.find((d) => d.code === 'TILE_AREA_M2')!;
  const cutting = defs.find((d) => d.code === 'CUTTING_REQUIRED')!;
  svc.setRecordValues('sales_invoices', 'inv_test_1', { [area.id]: '125.5', [cutting.id]: 'true' }, 'create');

  const html = operationalFieldsHtml('sales_invoices', 'inv_test_1', false);
  assert.match(html, /بيانات إضافية خاصة بالنشاط/);
  assert.match(html, /إجمالي المساحة/);
  assert.match(html, /125\.5/);
  assert.match(html, /يتطلب قص وتقطيع:[\s\S]*?نعم/);

  const empty = operationalFieldsHtml('sales_invoices', 'inv_missing', false);
  assert.equal(empty, '');
  const noId = operationalFieldsHtml('sales_invoices', undefined, false);
  assert.equal(noId, '');

  const orderDefs = svc.getDefinitions('orders');
  const specs = orderDefs.find((d) => d.code === 'CUT_SPECS')!;
  svc.setRecordValues('orders', 'ord_test_1', { [specs.id]: '60×120 سم' }, 'create');
  const orderHtml = operationalFieldsHtml('orders', 'ord_test_1', false);
  assert.match(orderHtml, /مقاسات القص/);
  assert.match(orderHtml, /60×120 سم/);

  const invoice: any = { id: 'inv_test_1', items: [] };
  const details = orderedInvoiceDetails(invoice, { invoiceShowOperationalFields: true } as any, false);
  assert.match(details, /إجمالي المساحة/);
  const detailsOff = orderedInvoiceDetails(invoice, { invoiceShowOperationalFields: false } as any, false);
  assert.doesNotMatch(detailsOff, /إجمالي المساحة/);
});

test('operational fields copy across converted documents by field code', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');
  { const __u = AuthService.getCurrentUser(); if (__u) __u.mustChangePassword = false; }

  const svc = new OperationalFieldService();
  svc.ensureSeedDefinitions([
    { entityType: 'quotations', code: 'TILE_AREA_M2', name: 'إجمالي المساحة (م²)', dataType: 'NUMBER' },
    { entityType: 'quotations', code: 'CUTTING_REQUIRED', name: 'يتطلب قص وتقطيع', dataType: 'BOOLEAN' },
    { entityType: 'sales_invoices', code: 'TILE_AREA_M2', name: 'إجمالي المساحة (م²)', dataType: 'NUMBER' },
    { entityType: 'sales_invoices', code: 'CUTTING_REQUIRED', name: 'يتطلب قص وتقطيع', dataType: 'BOOLEAN' },
    { entityType: 'sales_invoices', code: 'DELIVERY_ADDRESS', name: 'عنوان التسليم', dataType: 'TEXT' },
  ]);
  const qDefs = svc.getDefinitions('quotations');
  const areaQ = qDefs.find((d) => d.code === 'TILE_AREA_M2')!;
  const cutQ = qDefs.find((d) => d.code === 'CUTTING_REQUIRED')!;
  svc.setRecordValues('quotations', 'quo_test_1', { [areaQ.id]: '88', [cutQ.id]: 'true' }, 'create');

  svc.copyRecordFieldValues('quotations', 'quo_test_1', 'sales_invoices', 'inv_from_quo');

  const invValues = svc.getRecordValues('sales_invoices', 'inv_from_quo');
  const invDefs = svc.getDefinitions('sales_invoices');
  const byCode = new Map(invDefs.map((d) => [d.code, d]));
  assert.equal(invValues[byCode.get('TILE_AREA_M2')!.id], '88');
  assert.equal(invValues[byCode.get('CUTTING_REQUIRED')!.id], 'true');
  // Codes without a target-side twin are skipped silently.
  assert.equal(invValues[byCode.get('DELIVERY_ADDRESS')!.id], undefined);
});
