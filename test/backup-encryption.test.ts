import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptExternalBackup, encryptExternalBackup, isEncryptedBackup } from '../src/services/infrastructure/backup/backupEncryption.ts';
import { createXlsxBackupWorkbook, extractDatabaseFromXlsxBackup } from '../src/services/infrastructure/backup/xlsxBackup.ts';
import { SecurityService } from '../src/services/domains/security/SecurityService.ts';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { MIGRATIONS, validateMigrationCatalog } from '../src/database/migrations/index.ts';

test('external backup encryption authenticates and round-trips SQLite bytes', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const source = db.exportDatabaseBinary();
  const encrypted = await encryptExternalBackup(source, 'correct horse battery');
  assert.ok(isEncryptedBackup(encrypted));
  assert.notDeepEqual(encrypted, source);
  const decrypted = await decryptExternalBackup(encrypted, 'correct horse battery');
  assert.deepEqual(decrypted, source);
  const inspection = db.inspectDatabaseBinary(decrypted);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.integrity, 'ok');
  await assert.rejects(decryptExternalBackup(encrypted, 'wrong password'), /كلمة المرور غير صحيحة/);
});

test('XLSX backup workbook preserves the original database bytes in its hidden payload', () => {
  const source = new Uint8Array(58_000);
  crypto.getRandomValues(source);
  const workbook = createXlsxBackupWorkbook(source);

  assert.deepEqual(workbook.subarray(0, 2), new Uint8Array([0x50, 0x4b]));
  assert.deepEqual(extractDatabaseFromXlsxBackup(workbook), source);
});

test('legacy SecurityService authentication and backup APIs are real and round-trip', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const service = SecurityService.getInstance();
  assert.equal(await service.verifyPassword('admin', 'admin123'), true);
  assert.equal(await service.verifyPassword('admin', 'wrong-password'), false);

  const source = new TextEncoder().encode('legacy security backup payload');
  const encrypted = await service.createEncryptedBackup(source, 'backup-password');
  assert.notDeepEqual(encrypted, source);
  assert.equal(await service.validateBackupIntegrity(encrypted, 'backup-password'), true);
  assert.equal(await service.validateBackupIntegrity(encrypted, 'wrong-password'), false);

  const payload = new Uint8Array(256);
  crypto.getRandomValues(payload);
  const encryptedPayload = await service.encryptData(payload, 'data-password');
  assert.deepEqual(await service.decryptData(encryptedPayload, 'data-password'), payload);
});

test('migration catalog is unique and numerically ordered', () => {
  assert.doesNotThrow(() => validateMigrationCatalog());
  assert.equal(new Set(MIGRATIONS.map((migration) => migration.id)).size, MIGRATIONS.length);
  assert.ok(MIGRATIONS.find((migration) => migration.id === '049_finance_and_accounting_enterprise'));
  assert.ok(MIGRATIONS.find((migration) => migration.id === '105_dynamic_application_configuration'));
});
import './integration.setup.ts';
