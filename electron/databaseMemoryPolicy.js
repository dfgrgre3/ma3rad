const MEBIBYTE = 1024 * 1024;
const DEFAULT_DATABASE_LIMIT = 500 * MEBIBYTE;
const MIN_IA32_DATABASE_LIMIT = 32 * MEBIBYTE;
const MAX_IA32_DATABASE_LIMIT = 128 * MEBIBYTE;
const IA32_MEMORY_DIVISOR = 32;
const DEFAULT_V8_HEAP_SIZE_MB = 512;
const IA32_V8_HEAP_SIZE_MB = 256;

function getMaxDatabaseSize(totalMemoryBytes, architecture) {
  if (architecture !== 'ia32') return DEFAULT_DATABASE_LIMIT;
  if (!Number.isSafeInteger(totalMemoryBytes) || totalMemoryBytes <= 0) {
    throw new RangeError('Total system memory must be a positive safe integer.');
  }

  return Math.min(
    MAX_IA32_DATABASE_LIMIT,
    Math.max(MIN_IA32_DATABASE_LIMIT, Math.floor(totalMemoryBytes / IA32_MEMORY_DIVISOR)),
  );
}

function getMaxV8HeapSize(architecture) {
  return architecture === 'ia32' ? IA32_V8_HEAP_SIZE_MB : DEFAULT_V8_HEAP_SIZE_MB;
}

module.exports = {
  getMaxDatabaseSize,
  getMaxV8HeapSize,
  MEBIBYTE,
};
