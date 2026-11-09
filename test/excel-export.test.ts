import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createExcelWorkbook } from '../src/utils/export/excelExportWorkbook.ts';

test('background Excel workbook preserves export metadata, values, and RTL layout', () => {
  const bytes = createExcelWorkbook({
    title: 'Products',
    subtitle: 'Export date: 2026-11-07',
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'price', label: 'Price', type: 'currency' },
      { key: 'note', label: 'Note' },
    ],
    rows: [
      { name: 'Tile A', price: 125.5, note: null },
      { name: 'Tile B', price: 200, note: 'Fragile' },
    ],
    companyName: 'CeramiSys',
    kpis: [{ label: 'Products', value: 2 }],
  });

  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheet = workbook.Sheets['التقرير'];
  assert.ok(sheet);
  assert.equal(sheet.A1.v, 'CeramiSys');
  assert.equal(sheet.A2.v, 'Products');
  assert.equal(sheet.A3.v, 'Export date: 2026-11-07');
  assert.equal(sheet.A5.v, 'المؤشرات الإجمالية:');
  assert.deepEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(-3), [
    ['Product', 'Price', 'Note'],
    ['Tile A', 125.5, ''],
    ['Tile B', 200, 'Fragile'],
  ]);
  assert.equal(workbook.Workbook?.Views?.[0]?.RTL, true);
});
