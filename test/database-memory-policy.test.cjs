const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMaxDatabaseSize, getMaxV8HeapSize, MEBIBYTE } = require('../electron/databaseMemoryPolicy');

test('database size policy scales the IA-32 cap with installed RAM', () => {
  assert.equal(getMaxDatabaseSize(1024 * MEBIBYTE, 'ia32'), 32 * MEBIBYTE);
  assert.equal(getMaxDatabaseSize(2048 * MEBIBYTE, 'ia32'), 64 * MEBIBYTE);
  assert.equal(getMaxDatabaseSize(4096 * MEBIBYTE, 'ia32'), 128 * MEBIBYTE);
  assert.equal(getMaxDatabaseSize(8192 * MEBIBYTE, 'ia32'), 128 * MEBIBYTE);
});

test('database size policy preserves the existing x64 limit', () => {
  assert.equal(getMaxDatabaseSize(2048 * MEBIBYTE, 'x64'), 500 * MEBIBYTE);
});

test('V8 heap policy limits IA-32 while preserving the x64 setting', () => {
  assert.equal(getMaxV8HeapSize('ia32'), 256);
  assert.equal(getMaxV8HeapSize('x64'), 512);
});

test('database size policy rejects invalid IA-32 memory values', () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.throws(() => getMaxDatabaseSize(value, 'ia32'), RangeError);
  }
});
