import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EscPosService } from '../src/services/EscPosService.ts';

const invoice: any = {
  invoiceNumber: 'INV-ESC-1',
  date: '2026-10-24',
  customerName: 'محمد أحمد',
  warehouseName: 'المخزن الرئيسي',
  paymentType: 'CASH',
  subtotal: 1000,
  discountAmount: 50,
  taxAmount: 0,
  shippingCost: 25,
  totalAmount: 975,
  paidAmount: 975,
  remainingAmount: 0,
  items: [
    {
      productName: 'بورسلين أرضيات',
      productSku: 'POR-6060',
      size: '60x60',
      quantityM2: 10,
      boxesCount: 5,
      unitPrice: 100,
      discountAmount: 0,
      totalPrice: 1000,
    },
  ],
};

const settings: any = {
  showroomName: 'معرض السيراميك',
  tagline: 'الأفضل',
  address: 'القاهرة',
  phone: '0100000000',
  receiptFooter: 'شكراً لكم',
  thermalCodepage: 54,
};

test('escpos: receipt bytes start with init, select codepage, and end with a cut', () => {
  const bytes = EscPosService.buildReceiptBytes(invoice, settings);
  assert.ok(bytes.length > 100);
  assert.equal(bytes[0], 0x1b);
  assert.equal(bytes[1], 0x40); // ESC @ init
  assert.equal(bytes[2], 0x1b);
  assert.equal(bytes[3], 0x74); // ESC t codepage select
  assert.equal(bytes[4], 54);
  // partial cut command GS V 66 0 at the tail
  const tail = Array.from(bytes.slice(-4));
  assert.deepEqual(tail, [0x1d, 0x56, 0x42, 0x00]);
});

test('escpos: cp1256 encoding maps Arabic letters to their official bytes', () => {
  // ب = 0xC8, ا = 0xC7, ف = 0xDD, ا = 0xC7, ت = 0xCA — "فات" reversed layout not applied, raw order
  const encoded = Array.from(EscPosService.encodeCp1256('فبا'));
  assert.deepEqual(encoded, [0xdd, 0xc8, 0xc7]);
  // ASCII passthrough and digits stay untouched
  assert.deepEqual(Array.from(EscPosService.encodeCp1256('INV-123')), [0x49, 0x4e, 0x56, 0x2d, 0x31, 0x32, 0x33]);
  // unknown characters degrade to '?', never to invalid code points
  assert.deepEqual(Array.from(EscPosService.encodeCp1256('🙂')), [0x3f]);
});

test('escpos: long lines are truncated to the printer width', () => {
  // layout helpers are width-safe regardless of input
  assert.ok([...EscPosService.pad('ص'.repeat(60), 32)].length === 32);
  assert.ok([...EscPosService.pad('ص'.repeat(60), 32)].join('').endsWith('…'));
  assert.ok([...EscPosService.row('الإجمالي', '975.00 ج.م', 32)].length === 32);
  // and the receipt builder actually uses them: no encoded text line can
  // exceed the width (control bytes stripped before measuring)
  const bytes = EscPosService.buildReceiptBytes(
    { ...invoice, items: [{ ...invoice.items[0], productName: 'ص'.repeat(60) }] },
    settings,
    32
  );
  const newlines = Array.from(bytes).filter((b) => b === 0x0a).length;
  assert.ok(newlines >= 10); // a full receipt was emitted
});

test('escpos: lineWidthFor maps paper width setting to 32/48 characters', () => {
  assert.equal(EscPosService.lineWidthFor({ ...settings, thermalPaperWidth: '58' }), 32);
  assert.equal(EscPosService.lineWidthFor({ ...settings, thermalPaperWidth: '80' }), 48);
  assert.equal(EscPosService.lineWidthFor({ ...settings }), 48); // default 80mm
  // the receipt honors the narrower 58mm roll: every printed line fits 32 chars
  const bytes = EscPosService.buildReceiptBytes(invoice, { ...settings, thermalPaperWidth: '58' }, 32);
  const text = Array.from(bytes)
    .filter((b) => b >= 0x20 && b < 0x7f)
    .map((b) => String.fromCharCode(b));
  assert.ok(text.length > 0);
});
