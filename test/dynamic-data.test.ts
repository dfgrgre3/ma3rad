import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { DynamicDataService } from '../src/services/infrastructure/data/DynamicDataService.ts';

test('dynamic data: an unseen type is inferred, reused, searched, edited, exported, and safely rolled back', async () => {
  await DatabaseManager.getInstance().initialize();
  PermissionService.seed();
  AuthService.login('admin', 'admin123');

  const service = new DynamicDataService();
  const typeName = `Cal Matrix ${Date.now()}`;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { 'Instrument Tag': 'CAL-104', 'Calibration Interval Months': 12, 'Last Calibration': new Date('2026-04-01T00:00:00.000Z'), 'Lab Notes': 'pressure gauge' },
    { 'Instrument Tag': 'CAL-208', 'Calibration Interval Months': 6, 'Last Calibration': new Date('2026-05-15T00:00:00.000Z'), 'Lab Notes': 'digital micrometer' },
  ]), typeName);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { 'Service Contact': 'lab@example.test', 'Accreditation Code': 'LAB-QA-17' },
  ]), 'Calibration Labs');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const first = service.importWorkbook(buffer, 'calibration-matrix.xlsx');
  assert.equal(first.entity.name, typeName);
  assert.equal(first.imported, 3);
  assert.equal(first.entities?.length, 2);
  assert.deepEqual(first.entity.fields.map(f => f.label), ['Instrument Tag', 'Calibration Interval Months', 'Last Calibration', 'Lab Notes']);
  assert.equal(first.entity.fields.find(f => f.label === 'Calibration Interval Months')?.type, 'number');
  assert.equal(first.entity.fields.find(f => f.label === 'Last Calibration')?.type, 'date');
  assert.throws(() => service.importWorkbook(buffer, 'calibration-matrix.xlsx'), /تم استيراد هذا الملف/);

  const found = service.listEntities(typeName)[0];
  assert.equal(found.id, first.entity.id);
  assert.equal(found.recordCount, 2);
  const page = service.listRecords(found.id, 'micrometer');
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].values.lab_notes, 'digital micrometer');

  const field = service.addField(found.id, { label: 'Inspection Status', type: 'text', required: true });
  service.updateRecord(page.rows[0].id, { inspection_status: 'verified' });
  assert.equal(service.listRecords(found.id, 'verified').total, 1);
  const manuallyCreated = service.createRecord(found.id, { instrument_tag: 'CAL-300', inspection_status: 'pending' });
  assert.equal(manuallyCreated.values.instrument_tag, 'CAL-300');
  assert.ok(field.fields.some(f => f.key === 'inspection_status'));

  service.addField(found.id, { label: 'Validated Quantity', type: 'number', required: false });
  assert.throws(
    () => service.createRecord(found.id, { instrument_tag: 'CAL-301', inspection_status: 'ready', validated_quantity: 'not-a-number' }),
    /يجب أن يكون رقمًا صالحًا/,
  );
  const localizedNumber = service.createRecord(found.id, {
    instrument_tag: 'CAL-303',
    inspection_status: 'ready',
    validated_quantity: '١٢٫٥',
  });
  assert.equal(localizedNumber.values.validated_quantity, 12.5);
  service.deleteRecord(localizedNumber.id);
  const related = service.importSheets(new Uint8Array([1, 2, 3]).buffer, 'related.csv', [{
    name: `Calibration Refs ${Date.now()}`,
    headers: ['Reference Code'],
    rows: [{ 'Reference Code': 'REF-1' }],
  }]);
  service.addField(found.id, { label: 'Reference Code', type: 'text', required: false });
  assert.throws(() => service.updateEntityRelations(found.id, [{
    name: 'Calibration reference',
    sourceField: 'reference_code',
    targetEntityId: related.entity.id,
    targetField: 'missing_field',
  }]), /حقل الهدف/);
  service.updateEntityRelations(found.id, [{
    name: 'Calibration reference',
    sourceField: 'reference_code',
    targetEntityId: related.entity.id,
    targetField: 'reference_code',
  }]);
  assert.throws(
    () => service.createRecord(found.id, { instrument_tag: 'CAL-302', inspection_status: 'ready', reference_code: 'MISSING' }),
    /لا تطابق سجلًا/,
  );
  const volume = service.importSheets(new Uint8Array([4, 5, 6]).buffer, 'volume.csv', [{
    name: `Calibration Volume ${Date.now()}`,
    headers: ['Entry Code'],
    rows: Array.from({ length: 205 }, (_, index) => ({ 'Entry Code': `ENTRY-${index + 1}` })),
  }]);
  const firstVolumePage = service.listRecords(volume.entity.id, '', 1, 200);
  const secondVolumePage = service.listRecords(volume.entity.id, '', 2, 200);
  assert.equal(firstVolumePage.total, 205);
  assert.equal(firstVolumePage.rows.length, 200);
  assert.equal(secondVolumePage.rows.length, 5);

  const exportSheet = XLSX.utils.json_to_sheet(service.listRecords(found.id, '', 1, 200).rows.map(r => r.values));
  const exportedRows = XLSX.utils.sheet_to_json(exportSheet);
  assert.equal(exportedRows.length, 3);

  assert.equal(service.rollbackBatch(first.batchId), 2);
  assert.equal(service.listRecords(found.id, '').total, 1);
  assert.equal(service.getBatches(found.id)[0].status, 'ROLLED_BACK');
  service.deleteEntity(found.id);
  service.deleteEntity(first.entities![1].id);
  service.deleteEntity(related.entity.id);
  service.rollbackBatch(volume.batchId);
  service.deleteEntity(volume.entity.id);
  AuthService.logout();
});
