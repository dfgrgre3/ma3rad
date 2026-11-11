import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { DataAdminService } from '../src/services/domains/admin/DataAdminService.ts';
import type { DataImportSheet } from '../src/types/admin/dataAdmin.ts';
import { BackupService } from '../src/services/infrastructure/backup/BackupService.ts';
import { encryptExternalBackup } from '../src/services/infrastructure/backup/backupEncryption.ts';
import { parseAdminDataWorkbook } from '../src/pages/admin/admin/adminDataUtils.ts';
import type { User } from '../src/types/auth/identity.ts';
import { DataImportService } from '../src/services/domains/admin/DataImportService.ts';
import { CategoryService } from '../src/services/domains/products/CategoryService.ts';
import { BrandService } from '../src/services/domains/products/BrandService.ts';

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

  const importer = new DataImportService();
  const importedCustomer = importer.import(
    importer.parseRows(['اسم العميل', 'الهاتف'], [{
      'اسم العميل': `عميل دفعة ${Date.now()}`,
      الهاتف: `09${Date.now().toString().slice(-8)}`,
    }], 'customers'),
    { allowInitialBalances: false, allowProductStock: false, sourceName: 'batch-rollback-test.xlsx' },
  );
  assert.equal(importedCustomer.created, 1);
  assert.ok(importedCustomer.batchId);
  const customerId = db.query<{ id: string }>(
    'SELECT entity_id AS id FROM data_import_batch_records WHERE batch_id=?',
    [importedCustomer.batchId],
  )[0].id;
  assert.equal(importer.getImportBatches('customers')[0].importedCount, 1);
  db.run('UPDATE customers SET current_balance=10 WHERE id=?', [customerId]);
  assert.throws(() => importer.rollbackImportBatch(importedCustomer.batchId!), /وجود رصيد حالي/);
  db.run('UPDATE customers SET current_balance=0 WHERE id=?', [customerId]);
  assert.equal(importer.rollbackImportBatch(importedCustomer.batchId!), 1);
  assert.equal(db.query('SELECT id FROM customers WHERE id=?', [customerId]).length, 0);
  assert.equal(importer.getImportBatches('customers')[0].status, 'ROLLED_BACK');

  const suffix = Date.now().toString();
  const category = new CategoryService().createCategory(`Import category ${suffix}`);
  const brand = new BrandService().createBrand(`Import brand ${suffix}`);
  const productImportData = importer.parseRows([
    'الكود', 'اسم الصنف', 'التصنيف', 'الماركة', 'المقاس',
    'قطع بالكرتونة', 'متر/كرتونة', 'سعر التكلفة', 'سعر البيع',
    'رصيد افتتاحي بالمتر',
  ], [{
    الكود: `SKU-${suffix}`,
    'اسم الصنف': `منتج دفعة ${suffix}`,
    التصنيف: category.name,
    الماركة: brand.name,
    المقاس: '60x60',
    'قطع بالكرتونة': 4,
    'متر/كرتونة': 1.44,
    'سعر التكلفة': 100,
    'سعر البيع': 150,
    'رصيد افتتاحي بالمتر': 5,
  }], 'products');
  const missingWarehouse = importer.import(productImportData, {
    allowInitialBalances: false,
    allowProductStock: true,
    sourceName: 'product-stock-without-warehouse.xlsx',
  });
  assert.equal(missingWarehouse.created, 0);
  assert.match(missingWarehouse.errors[0].messages[0], /اختر مخزنًا نشطًا يدويًا/);

  const importedProduct = importer.import(productImportData, {
    allowInitialBalances: false,
    allowProductStock: false,
    sourceName: 'product-batch-test.xlsx',
  });
  assert.equal(importedProduct.created, 1);
  assert.ok(importedProduct.batchId);
  const productId = db.query<{ id: string }>(
    'SELECT entity_id AS id FROM data_import_batch_records WHERE batch_id=?',
    [importedProduct.batchId],
  )[0].id;
  assert.equal(importer.getImportBatches('products')[0].importedCount, 1);
  assert.equal(importer.rollbackImportBatch(importedProduct.batchId!), 1);
  assert.equal(db.query('SELECT id FROM products WHERE id=?', [productId]).length, 0);
});
