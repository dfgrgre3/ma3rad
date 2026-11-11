import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  MAX_SPREADSHEET_FILE_SIZE,
  parseSpreadsheetBuffer,
  validateSpreadsheetFileHeader,
  validateSpreadsheetFileMetadata,
} from '../src/services/infrastructure/data/SpreadsheetImportService.ts';
import { DataImportService, type ParsedImport } from '../src/services/domains/admin/DataImportService.ts';
import { parsePdfExtractedText } from '../src/services/infrastructure/data/PdfImportData.ts';
import './data-file-import.test.ts';

const toArrayBuffer = (bytes: Uint8Array | ArrayBuffer): ArrayBuffer => {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const workbookBuffer = (sheet: XLSX.WorkSheet): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'البيانات');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array | ArrayBuffer;
  return toArrayBuffer(bytes);
};

test('spreadsheet import validates extension, file size, and file signature before parsing', () => {
  assert.throws(() => validateSpreadsheetFileMetadata('data.pdf', 10), /نوع الملف غير مدعوم/);
  assert.throws(() => validateSpreadsheetFileMetadata('data.xlsx', MAX_SPREADSHEET_FILE_SIZE + 1), /الحد الأقصى/);
  assert.throws(() => validateSpreadsheetFileHeader('xlsx', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), /لا يطابق امتداد XLSX/);

  const csv = toArrayBuffer(new TextEncoder().encode('name,phone\nTest,0100'));
  const parsed = parseSpreadsheetBuffer(csv, 'customers.csv');
  assert.deepEqual(parsed.sheets[0].headers, ['name', 'phone']);
  assert.equal(parsed.sheets[0].rows.length, 1);
});

test('PDF text parsing creates reviewable tabular, labeled, and generic rows', () => {
  const table = parsePdfExtractedText('الكود\tاسم الصنف\tالسعر\nA1\tبلاط\t250\nB2\tرخام\t500', 'قائمة');
  assert.deepEqual(table.headers, ['الكود', 'اسم الصنف', 'السعر']);
  assert.deepEqual(table.rows, [
    { الكود: 'A1', 'اسم الصنف': 'بلاط', السعر: '250' },
    { الكود: 'B2', 'اسم الصنف': 'رخام', السعر: '500' },
  ]);

  const labeled = parsePdfExtractedText('اسم العميل: أحمد\nرقم الهاتف: 0100', 'عميل');
  assert.deepEqual(labeled.headers, ['اسم العميل', 'رقم الهاتف']);
  assert.deepEqual(labeled.rows, [{ 'اسم العميل': 'أحمد', 'رقم الهاتف': '0100' }]);

  const generic = parsePdfExtractedText('ملاحظة أولى\nملاحظة ثانية', 'ملاحظات');
  assert.deepEqual(generic.headers, ['النص المستخرج']);
  assert.equal(generic.rows.length, 2);
});

test('spreadsheet import rejects worksheet row and column ranges beyond configured limits', () => {
  const tooManyRows = XLSX.utils.aoa_to_sheet([['header']]);
  tooManyRows[`A${20_002}`] = { t: 's', v: 'last' };
  tooManyRows['!ref'] = 'A1:A20002';
  assert.throws(() => parseSpreadsheetBuffer(workbookBuffer(tooManyRows), 'large.xlsx'), /عدد الصفوف/);

  const tooManyColumns = XLSX.utils.aoa_to_sheet([['header']]);
  tooManyColumns.CW1 = { t: 's', v: 'outside limit' };
  tooManyColumns['!ref'] = 'A1:CW1';
  assert.throws(() => parseSpreadsheetBuffer(workbookBuffer(tooManyColumns), 'wide.xlsx'), /عدد الأعمدة/);
});

test('spreadsheet import rejects excessive cell data even when the compressed file is small', () => {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 130 }, () => ['x'.repeat(32_767)]));
  assert.throws(() => parseSpreadsheetBuffer(workbookBuffer(sheet), 'large-data.xlsx'), /حجم محتوى الخلايا/);
});

test('data import validation reports duplicate customer codes and invalid opening balances', () => {
  const data: ParsedImport = {
    entity: 'customers',
    headers: [],
    mapping: { name: 'name', code: 'code', phone: 'phone', initialBalance: 'initialBalance' },
    rows: [
      { name: 'First', code: 'C-1', phone: '0100', initialBalance: 'invalid' },
      { name: 'Second', code: 'C-1', phone: '0200', initialBalance: '25' },
    ],
    confidence: 1,
  };

  assert.deepEqual(new DataImportService().validate(data), [
    { row: 2, messages: ['الرصيد الافتتاحي غير صالح'] },
    { row: 3, messages: ['سجل مكرر داخل الملف'] },
  ]);
});

test('data import validation checks positive product measurements and duplicate SKUs', () => {
  const data: ParsedImport = {
    entity: 'products',
    headers: [],
    mapping: {
      sku: 'sku',
      name: 'name',
      category: 'category',
      brand: 'brand',
      size: 'size',
      piecesPerBox: 'piecesPerBox',
      metersPerBox: 'metersPerBox',
      costPrice: 'costPrice',
      sellingPriceM2: 'sellingPriceM2',
    },
    rows: [
      {
        sku: 'SKU-1', name: 'Product 1', category: 'Category', brand: 'Brand', size: '60x60',
        piecesPerBox: '0', metersPerBox: '2', costPrice: '100', sellingPriceM2: 'invalid',
      },
      {
        sku: 'SKU-1', name: 'Product 2', category: 'Category', brand: 'Brand', size: '60x60',
        piecesPerBox: '4', metersPerBox: '2', costPrice: '100', sellingPriceM2: '150',
      },
    ],
    confidence: 1,
  };

  assert.deepEqual(new DataImportService().validate(data), [
    {
      row: 2,
      messages: [
        'قطع بالكرتونة يجب أن يكون أكبر من صفر',
        'سعر البيع للمتر يجب أن يكون أكبر من صفر',
      ],
    },
    { row: 3, messages: ['كود مكرر داخل الملف'] },
  ]);
});

test('data import accepts Arabic-Indic and Persian numeric values', () => {
  const data = new DataImportService().parseRows(
    ['اسم العميل', 'الهاتف', 'حد الائتمان', 'الرصيد الافتتاحي'],
    [{ 'اسم العميل': 'عميل', الهاتف: '0100', 'حد الائتمان': '١٬٢٣٤٫٥٠', 'الرصيد الافتتاحي': '۱۲۳٫۵۰' }],
    'customers',
  );

  assert.deepEqual(new DataImportService().validate(data), []);
});

test('data import rejects invalid numeric fields, negative values, and duplicate customer phones', () => {
  const data = new DataImportService().parseRows(
    ['اسم العميل', 'الهاتف', 'حد الائتمان', 'كود العميل'],
    [
      { 'اسم العميل': 'الأول', الهاتف: '0100', 'حد الائتمان': 'غير صالح', 'كود العميل': 'C1' },
      { 'اسم العميل': 'الثاني', الهاتف: '0100', 'حد الائتمان': '-1', 'كود العميل': 'C2' },
    ],
    'customers',
  );

  assert.deepEqual(new DataImportService().validate(data), [
    { row: 2, messages: ['حد الائتمان يجب أن يكون رقمًا صالحًا'] },
    { row: 3, messages: ['حد الائتمان يجب أن يكون على الأقل 0', 'سجل مكرر داخل الملف'] },
  ]);
});

test('data import prevents duplicate field mappings and invalid optional product prices', () => {
  const service = new DataImportService();
  const data = service.parseRows(
    ['الكود', 'اسم الصنف', 'التصنيف', 'الماركة', 'المقاس', 'قطع بالكرتونة', 'متر/كرتونة', 'سعر التكلفة', 'سعر البيع', 'سعر الجملة'],
    [{
      الكود: 'P1',
      'اسم الصنف': 'صنف',
      التصنيف: 'تصنيف',
      الماركة: 'ماركة',
      المقاس: '60x60',
      'قطع بالكرتونة': '6',
      'متر/كرتونة': '2.16',
      'سعر التكلفة': '10',
      'سعر البيع': '20',
      'سعر الجملة': '-5',
    }],
    'products',
  );
  data.mapping.costPrice = data.mapping.sellingPriceM2;

  assert.deepEqual(service.validate(data), [{
    row: 2,
    messages: [
      'لا يمكن ربط العمود نفسه بأكثر من حقل',
      'سعر الجملة يجب أن يكون على الأقل 0',
    ],
  }]);
});

test('data import keeps fallback values when numeric cells are blank', () => {
  const service = new DataImportService();
  const data = service.parseRows(
    ['اسم المورد', 'الهاتف', 'مدة السداد', 'الرصيد الافتتاحي'],
    [{ 'اسم المورد': 'مورد', الهاتف: '0100', 'مدة السداد': '', 'الرصيد الافتتاحي': '' }],
    'suppliers',
  );

  const rowValues = service['createRowValues'](data.rows[0], data.mapping);
  assert.equal(rowValues.num('paymentTermsDays', 30), 30);
  assert.equal(rowValues.num('initialBalance', 0), 0);
  assert.deepEqual(service.validate(data), []);
});
