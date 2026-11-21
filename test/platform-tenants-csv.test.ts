import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stripBom } from '../src/pages/platform/PlatformTenantsPage/csv.ts';

test('parseCsv: basic rows and trimming', () => {
  const rows = parseCsv('name,code\nعميل أ,C-001\nعميل ب,C-002\n');
  assert.deepEqual(rows, [
    ['name', 'code'],
    ['عميل أ', 'C-001'],
    ['عميل ب', 'C-002'],
  ]);
});

test('parseCsv: quoted fields with commas', () => {
  const rows = parseCsv('name,notes\n"شركة, للتجارة",ok\n');
  assert.deepEqual(rows, [['name', 'notes'], ['شركة, للتجارة', 'ok']]);
});

test('parseCsv: quoted fields spanning multiple lines', () => {
  const rows = parseCsv('name,notes\n"شركة النور","سطر أول\nسطر ثانٍ"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'شركة النور');
  assert.equal(rows[1][1], 'سطر أول\nسطر ثانٍ');
});

test('parseCsv: escaped quotes inside quoted fields', () => {
  const rows = parseCsv('name\n"قال ""مرحباً"""\n');
  assert.deepEqual(rows, [['name'], ['قال "مرحباً"']]);
});

test('parseCsv: CRLF line endings', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('parseCsv: skips trailing empty lines', () => {
  const rows = parseCsv('a,b\n1,2\n\n\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: unclosed quote does not lose data', () => {
  const rows = parseCsv('name\n"unclosed');
  assert.deepEqual(rows, [['name'], ['unclosed']]);
});

test('stripBom: removes UTF-8 BOM only at start', () => {
  const bom = String.fromCodePoint(0xfeff);
  assert.equal(stripBom(bom + 'name'), 'name');
  assert.equal(stripBom('name'), 'name');
  assert.equal(stripBom('x' + bom + 'y'), 'x' + bom + 'y');
});
