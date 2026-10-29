import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { DatabaseManager } from '../src/database/db.ts';
import { AuthService } from '../src/services/AuthService.ts';
import { PermissionService } from '../src/services/PermissionService.ts';
import { DataAdminService } from '../src/services/DataAdminService.ts';
import type { DataImportSheet } from '../src/services/dataAdminTypes.ts';
import { BackupService } from '../src/services/BackupService.ts';
import { encryptExternalBackup } from '../src/services/backupEncryption.ts';
import { parseAdminDataWorkbook } from '../src/pages/admin/adminDataUtils.ts';
import type { User } from '../src/types/identity.ts';

test('previews conflicts and merges XLSX and encrypted backup records', async () => {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  PermissionService.seed();
  db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, is_active)
     VALUES ('usr_data_import_admin', 'data-import-admin', 'test', 'Data Import Admin', 'ADMIN', 1)`
  );
  const admin: User = {
    id: 'usr_data_import_admin',
    username: 'data-import-admin',
    fullName: 'Data Import Admin',
    role: 'ADMIN',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  AuthService.setCurrentUser(admin);
  PermissionService.invalidate(admin);

  db.run('DROP TABLE IF EXISTS data_import_test');
  db.run('DROP TABLE IF EXISTS data_import_no_pk_test');
  db.run(`CREATE TABLE data_import_test (id TEXT PRIMARY KEY, account_name TEXT NOT NULL, amount REAL)`);
  db.run(`CREATE TABLE data_import_no_pk_test (label TEXT NOT NULL)`);
  db.run(`INSERT INTO data_import_test (id, account_name, amount) VALUES ('existing', 'قبل', 10)`);
  db.run(`INSERT INTO data_import_no_pk_test (label) VALUES ('موجود')`);

  const service = new DataAdminService();
  const exported = service.exportTableData('data_import_test').sheets[0];
  assert.equal(exported.rows[0].account_name, 'قبل');
  const protectedExport = service.exportTableData('users').sheets[0];
  const protectedSheet: DataImportSheet = {
    ...protectedExport,
    rows: protectedExport.rows.map((row) => ({ ...row, full_name: 'Imported Name' })),
  };

  const sheets: DataImportSheet[] = [
    {
      name: 'data_import_test',
      columns: ['id', 'account_name', 'amount'],
      rows: [
        { id: 'existing', account_name: 'بعد', amount: 25 },
        { id: 'new', account_name: 'جديد', amount: 50 },
      ],
    },
    {
      name: 'data_import_no_pk_test',
      columns: ['label'],
      rows: [{ label: 'موجود' }, { label: 'إضافة' }, { label: 'إضافة' }],
    },
    protectedSheet,
  ];
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows.map((row) => sheet.columns.map((column) => row[column as keyof typeof row]))]),
      sheet.name
    );
  }
  const written = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const buffer = written instanceof ArrayBuffer
    ? written
    : written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength) as ArrayBuffer;
  const parsed = parseAdminDataWorkbook(buffer, 'export.xlsx');
  const preview = service.previewDataImport(parsed);

  assert.equal(preview.incomingRows, 5 + protectedSheet.rows.length);
  assert.equal(preview.newRows, 2);
  assert.equal(preview.conflictRows, 1);
  assert.equal(preview.skippedRows, 2 + protectedSheet.rows.length);
  assert.equal(preview.tables.find((table) => table.table === 'users')?.protected, true);
  assert.equal(preview.tables[0].sampleConflicts[0].changes[0].existing, 'قبل');
  assert.equal(preview.tables[0].sampleConflicts[0].changes[0].imported, 'بعد');

  const result = await service.importData(parsed);
  assert.deepEqual(
    { inserted: result.insertedRows, updated: result.updatedRows, skipped: result.skippedRows },
    { inserted: 2, updated: 1, skipped: 2 + protectedSheet.rows.length }
  );
  assert.deepEqual(
    db.query<{ id: string; accountName: string; amount: number }>(
      `SELECT id, account_name, amount FROM data_import_test ORDER BY id`
    ),
    [
      { id: 'existing', accountName: 'بعد', amount: 25 },
      { id: 'new', accountName: 'جديد', amount: 50 },
    ]
  );
  assert.equal(db.query<{ count: number }>('SELECT COUNT(*) AS count FROM data_import_no_pk_test')[0].count, 2);
  assert.equal(db.query<{ fullName: string }>(
    `SELECT full_name FROM users WHERE id = 'usr_data_import_admin'`
  )[0].fullName, 'Data Import Admin');

  const backupSnapshot = db.exportDatabaseBinary();
  db.run(`UPDATE data_import_test SET account_name = 'القيمة الحالية' WHERE id = 'existing'`);
  const password = 'backup-import-test-password';
  const encryptedBackup = await encryptExternalBackup(backupSnapshot, password);
  const backupFile = new File([encryptedBackup], 'ceramisys_backup_test.ceramisys-backup');
  const backupService = new BackupService();
  (globalThis as any).window.prompt = () => 'incorrect-backup-password';
  await assert.rejects(() => backupService.readBackupDataForImport(backupFile), /كلمة المرور غير صحيحة/);
  assert.equal(
    db.query<{ accountName: string }>(`SELECT account_name FROM data_import_test WHERE id = 'existing'`)[0].accountName,
    'القيمة الحالية'
  );
  (globalThis as any).window.prompt = () => password;
  const backupSheets = await backupService.readBackupDataForImport(backupFile);
  const backupPreview = service.previewDataImport(backupSheets);
  const backupConflict = backupPreview.tables.find((table) => table.table === 'data_import_test');
  assert.equal(backupConflict?.conflictRows, 2);
  assert.equal(backupConflict?.sampleConflicts[0].changes[0].existing, 'القيمة الحالية');
  assert.equal(backupConflict?.sampleConflicts[0].changes[0].imported, 'بعد');

  const backupResult = await service.importData(backupSheets);
  assert.ok(backupResult.updatedRows >= 2);
  assert.equal(
    db.query<{ accountName: string }>(`SELECT account_name FROM data_import_test WHERE id = 'existing'`)[0].accountName,
    'بعد'
  );
});
