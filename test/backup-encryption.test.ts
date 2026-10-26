import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptExternalBackup, encryptExternalBackup, isEncryptedBackup } from '../src/services/backupEncryption.ts';

test('external backup encryption authenticates and round-trips SQLite bytes', async () => {
  const source = new TextEncoder().encode('sqlite database bytes');
  const encrypted = await encryptExternalBackup(source, 'correct horse battery');
  assert.ok(isEncryptedBackup(encrypted));
  assert.notDeepEqual(encrypted, source);
  assert.deepEqual(await decryptExternalBackup(encrypted, 'correct horse battery'), source);
  await assert.rejects(decryptExternalBackup(encrypted, 'wrong password'), /كلمة المرور غير صحيحة/);
});
