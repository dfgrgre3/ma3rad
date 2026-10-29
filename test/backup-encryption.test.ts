import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptExternalBackup, encryptExternalBackup, isEncryptedBackup } from '../src/services/backupEncryption.ts';
import { createXlsxBackupWorkbook, extractDatabaseFromXlsxBackup } from '../src/services/xlsxBackup.ts';

test('external backup encryption authenticates and round-trips SQLite bytes', async () => {
  const source = new TextEncoder().encode('sqlite database bytes');
  const encrypted = await encryptExternalBackup(source, 'correct horse battery');
  assert.ok(isEncryptedBackup(encrypted));
  assert.notDeepEqual(encrypted, source);
  assert.deepEqual(await decryptExternalBackup(encrypted, 'correct horse battery'), source);
  await assert.rejects(decryptExternalBackup(encrypted, 'wrong password'), /كلمة المرور غير صحيحة/);
});

test('XLSX backup workbook preserves the original database bytes in its hidden payload', () => {
  const source = new Uint8Array(58_000);
  crypto.getRandomValues(source);
  const workbook = createXlsxBackupWorkbook(source);

  assert.deepEqual(workbook.subarray(0, 2), new Uint8Array([0x50, 0x4b]));
  assert.deepEqual(extractDatabaseFromXlsxBackup(workbook), source);
});
