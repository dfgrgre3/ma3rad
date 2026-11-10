import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import {
  MAX_DATA_FILE_IMPORT_BYTES,
  parseDataFileBuffer,
} from '../src/services/infrastructure/data/DataFileImportService.ts';
import { MAX_IMAGE_IMPORT_BYTES, validateImageImportFile } from '../src/services/infrastructure/data/ImageImportService.ts';
import { parseSpreadsheetBuffer } from '../src/services/infrastructure/data/SpreadsheetImportService.ts';

Object.defineProperty(globalThis, 'DOMParser', {
  configurable: true,
  value: new JSDOM('').window.DOMParser,
});

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

test('JSON import supports root arrays, nested record lists, and scalar arrays', () => {
  const rootArray = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode('[{"name":"منتج","price":25},{"name":"آخر","price":30}]')),
    'products.json',
  )[0];
  assert.deepEqual(rootArray.headers, ['name', 'price']);
  assert.deepEqual(rootArray.rows, [
    { name: 'منتج', price: '25' },
    { name: 'آخر', price: '30' },
  ]);

  const nested = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode('{"data":{"customers":[{"name":"أحمد","phone":"0100"}]}}')),
    'customers.json',
  )[0];
  assert.deepEqual(nested.rows, [{ name: 'أحمد', phone: '0100' }]);

  const scalarList = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode('["أول","ثان"]')),
    'notes.json',
  )[0];
  assert.deepEqual(scalarList.rows, [{ القيمة: 'أول' }, { القيمة: 'ثان' }]);
});

test('XML import turns repeated elements into tabular records and rejects unsafe declarations', () => {
  const parsed = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode(
      '<customers><customer id="C1"><name>أحمد</name><phone>0100</phone></customer><customer id="C2"><name>سارة</name><phone>0200</phone></customer></customers>',
    )),
    'customers.xml',
  )[0];
  assert.deepEqual(parsed.headers, ['id', 'name', 'phone']);
  assert.deepEqual(parsed.rows, [
    { id: 'C1', name: 'أحمد', phone: '0100' },
    { id: 'C2', name: 'سارة', phone: '0200' },
  ]);

  assert.throws(
    () => parseDataFileBuffer(
      toArrayBuffer(new TextEncoder().encode('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><x>&x;</x>')),
      'unsafe.xml',
    ),
    /DOCTYPE وENTITY غير مسموحة/,
  );
});

test('DOCX import extracts Word table rows without decompressing unrelated archive entries', () => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>اسم العميل</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>الهاتف</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>أحمد</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>0100</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl></w:body>
    </w:document>`;
  const docxBytes = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(documentXml),
    'word/media/unused.bin': new Uint8Array(2_000_000),
  });
  const parsed = parseDataFileBuffer(toArrayBuffer(docxBytes), 'customers.docx');
  assert.deepEqual(parsed[0].headers, ['اسم العميل', 'الهاتف']);
  assert.deepEqual(parsed[0].rows, [{ 'اسم العميل': 'أحمد', الهاتف: '0100' }]);
});

test('TXT import parses tabular and labeled values and applies supported-file limits', () => {
  const tabular = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode('الكود\tاسم الصنف\nA1\tبلاط\nB2\tرخام')),
    'products.txt',
  )[0];
  assert.deepEqual(tabular.rows, [
    { الكود: 'A1', 'اسم الصنف': 'بلاط' },
    { الكود: 'B2', 'اسم الصنف': 'رخام' },
  ]);
  const commaSeparated = parseDataFileBuffer(
    toArrayBuffer(new TextEncoder().encode('name,phone\n"أحمد, محمد",0100')),
    'customers.txt',
  )[0];
  assert.deepEqual(commaSeparated.rows, [{ name: 'أحمد, محمد', phone: '0100' }]);
  const csv = parseSpreadsheetBuffer(
    toArrayBuffer(new TextEncoder().encode('اسم العميل,الهاتف\nأحمد,0100')),
    'customers.csv',
  ).sheets[0];
  assert.deepEqual(csv.rows, [{ 'اسم العميل': 'أحمد', الهاتف: '0100' }]);
  assert.equal(MAX_DATA_FILE_IMPORT_BYTES, 10 * 1024 * 1024);
  assert.throws(
    () => parseDataFileBuffer(new ArrayBuffer(MAX_DATA_FILE_IMPORT_BYTES + 1), 'large.json'),
    /يتجاوز الحد المسموح/,
  );
});

test('image import checks extension, file size, and matching image signature', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.doesNotThrow(() => validateImageImportFile('scan.png', png.length, png));
  assert.throws(() => validateImageImportFile('scan.jpg', png.length, png), /لا يطابق صيغة الصورة/);
  assert.throws(
    () => validateImageImportFile('scan.png', MAX_IMAGE_IMPORT_BYTES + 1, png),
    /يتجاوز الحد المسموح/,
  );
});
