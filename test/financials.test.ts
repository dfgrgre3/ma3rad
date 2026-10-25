import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  round2,
  toMinorUnits,
  fromMinorUnits,
  computeSaleLine,
  computeSaleTotals,
  computeWeightedAverageCost,
  computeReturnImpact,
} from '../src/services/financials.ts';

test('round2 eliminates IEEE-754 drift (brief §224)', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(NaN), 0);
});

test('money conversion uses integer minor units for currency arithmetic', () => {
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(toMinorUnits(19.99), 1999);
  assert.equal(fromMinorUnits(1999), 19.99);
  assert.equal(round2(-1.005), -1.01);
});

test('computeSaleLine: subtotal, discount, cost and profit', () => {
  const r = computeSaleLine({ quantity: 7.2, unitPrice: 200, unitCost: 150, discountAmount: 50 });
  assert.equal(r.lineSubtotal, 1440);
  assert.equal(r.lineDiscount, 50);
  assert.equal(r.lineTotal, 1390);
  assert.equal(r.lineCost, 1080);
  assert.equal(r.lineProfit, 310);
});

test('computeSaleTotals: discount/tax/shipping, remaining and payment status', () => {
  const lines = [
    { lineTotal: 1390, lineCost: 1080 },
    { lineTotal: 500, lineCost: 300 },
  ];
  const t = computeSaleTotals({ lines, discountAmount: 90, taxAmount: 100, shippingCost: 50, paidAmount: 1000 });
  assert.equal(t.subtotal, 1890);
  assert.equal(t.totalAmount, 1890 - 90 + 100 + 50); // 1950
  assert.equal(t.remainingAmount, 950);
  assert.equal(t.paymentStatus, 'PARTIAL');
  assert.equal(t.totalCost, 1380);
  assert.equal(t.grossProfit, 1890 - 90 - 1380);
});

test('computeSaleTotals excludes tax and shipping charges from merchandise gross profit', () => {
  const result = computeSaleTotals({
    lines: [{ lineTotal: 120, lineCost: 80 }],
    discountAmount: 20,
    taxAmount: 15,
    shippingCost: 10,
    paidAmount: 125,
  });

  assert.equal(result.totalAmount, 125);
  assert.equal(result.grossProfit, 20);
});

test('computeSaleTotals: fully paid -> PAID, zero remaining', () => {
  const t = computeSaleTotals({ lines: [{ lineTotal: 500, lineCost: 300 }], paidAmount: 500 });
  assert.equal(t.paymentStatus, 'PAID');
  assert.equal(t.remainingAmount, 0);
});

test('computeWeightedAverageCost: averages old + new stock', () => {
  // 100 m2 @ 100 + 50 m2 @ 200 => (10000+10000)/150 = 133.33
  assert.equal(computeWeightedAverageCost(100, 100, 50, 200), 133.33);
});

test('computeWeightedAverageCost: empty stock seeds with incoming cost', () => {
  assert.equal(computeWeightedAverageCost(0, 0, 10, 250), 250);
});

test('computeReturnImpact: fully-paid return refunds cash, leaves balance unchanged', () => {
  const r = computeReturnImpact({ invoiceTotal: 1000, invoicePaid: 1000, returnTotal: 200, refundCash: true });
  assert.equal(r.cashRefund, 200);
  assert.equal(r.balanceDelta, 0);
});

test('computeReturnImpact: credit sale return issues no cash, reduces balance by full return', () => {
  const r = computeReturnImpact({ invoiceTotal: 1000, invoicePaid: 0, returnTotal: 200, refundCash: true });
  assert.equal(r.cashRefund, 0);
  assert.equal(r.balanceDelta, 200);
});

test('computeReturnImpact: partial-paid return refunds only paid proportion', () => {
  // paid 500 of 1000 (ratio 0.5); returning 200 -> cash 100, balance delta 100
  const r = computeReturnImpact({ invoiceTotal: 1000, invoicePaid: 500, returnTotal: 200, refundCash: true });
  assert.equal(r.cashRefund, 100);
  assert.equal(r.balanceDelta, 100);
});

test('computeReturnImpact: no cash refund keeps full return on balance', () => {
  const r = computeReturnImpact({ invoiceTotal: 1000, invoicePaid: 1000, returnTotal: 200, refundCash: false });
  assert.equal(r.cashRefund, 0);
  assert.equal(r.balanceDelta, 200);
});
